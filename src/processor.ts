import { stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { createImageData } from './imageData.js';
import { createOutputPath, ensureOutputDirectory, expandInputs, shouldSkipExisting } from './files.js';
import {
  createDefaultSettings,
  FILM_PROFILES,
  MAX_FILE_SIZE_BYTES,
  MAX_IMAGE_DIMENSION,
  MAX_IMAGE_PIXELS,
} from './vendor/constants.js';
import {
  accumulateHistogram,
  computeHighlightDensity,
  computeResidualBaseOffset,
  getCropPixelBounds,
  normalizeCrop,
  processImageData,
} from './vendor/utils/imagePipeline.js';
import { analyzeColorBalance, analyzeExposure } from './vendor/utils/autoAnalysis.js';
import { estimateFlare } from './vendor/utils/flareEstimation.js';
import { estimateFilmBaseSampleFromRgba } from './vendor/utils/rawImport.js';
import type { CliConfig, CliFileResult, CliRunSummary } from './types.js';
import type { ConversionSettings, FilmProfile, HistogramData } from './vendor/types.js';

export interface RawImage {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

export interface ProcessedImage extends RawImage {
  histogram: HistogramData;
}

function cloneSettings(settings: ConversionSettings): ConversionSettings {
  return structuredClone(settings);
}

function mergeObjects<T>(base: T, overrides: Partial<T>): T {
  if (!overrides || typeof overrides !== 'object') {
    return base;
  }

  if (Array.isArray(base)) {
    return [...base] as T;
  }

  const result: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [key, overrideValue] of Object.entries(overrides as Record<string, unknown>)) {
    if (
      overrideValue
      && typeof overrideValue === 'object'
      && !Array.isArray(overrideValue)
      && result[key]
      && typeof result[key] === 'object'
      && !Array.isArray(result[key])
    ) {
      result[key] = mergeObjects(result[key], overrideValue as Partial<unknown>);
    } else {
      result[key] = overrideValue;
    }
  }

  return result as T;
}

function resolveProfile(profileId: string): FilmProfile {
  const profile = FILM_PROFILES.find((candidate) => candidate.id === profileId);
  if (!profile) {
    const available = FILM_PROFILES.map((candidate) => candidate.id).sort().join(', ');
    throw new Error(`Unknown profile "${profileId}". Available profiles: ${available}`);
  }
  return profile;
}

function resolveSettings(profile: FilmProfile, config: CliConfig): ConversionSettings {
  const baseSettings = profile.defaultSettings
    ? cloneSettings(profile.defaultSettings)
    : createDefaultSettings();
  return mergeObjects(baseSettings, config.settings);
}

async function decodeImage(inputPath: string): Promise<RawImage> {
  const metadata = await sharp(inputPath).metadata();
  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;
  if (width <= 0 || height <= 0) {
    throw new Error('Image dimensions could not be read before decode.');
  }
  if (width > MAX_IMAGE_DIMENSION || height > MAX_IMAGE_DIMENSION) {
    throw new Error(`Image dimensions ${width}x${height} exceed limit ${MAX_IMAGE_DIMENSION}px per edge.`);
  }
  if (width * height > MAX_IMAGE_PIXELS) {
    throw new Error(`Image has ${width * height} pixels, exceeding limit ${MAX_IMAGE_PIXELS}.`);
  }

  const { data, info } = await sharp(inputPath, { limitInputPixels: MAX_IMAGE_PIXELS })
    .rotate()
    .toColorspace('srgb')
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  return {
    data: new Uint8ClampedArray(data),
    width: info.width,
    height: info.height,
  };
}

async function resizeRawImage(image: RawImage, maxDimension: number): Promise<RawImage> {
  if (Math.max(image.width, image.height) <= maxDimension) {
    return image;
  }

  const { data, info } = await sharp(Buffer.from(image.data), {
    raw: {
      width: image.width,
      height: image.height,
      channels: 4,
    },
  })
    .resize({
      width: maxDimension,
      height: maxDimension,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  return {
    data: new Uint8ClampedArray(data),
    width: info.width,
    height: info.height,
  };
}

async function transformForPipeline(image: RawImage, settings: ConversionSettings): Promise<RawImage> {
  const rotation = settings.rotation + settings.levelAngle;
  const { data, info } = await sharp(Buffer.from(image.data), {
    raw: {
      width: image.width,
      height: image.height,
      channels: 4,
    },
  })
    .rotate(rotation, { background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const cropBounds = getCropPixelBounds(normalizeCrop(settings), info.width, info.height);
  if (
    cropBounds.x === 0
    && cropBounds.y === 0
    && cropBounds.width === info.width
    && cropBounds.height === info.height
  ) {
    return {
      data: new Uint8ClampedArray(data),
      width: info.width,
      height: info.height,
    };
  }

  const cropped = await sharp(data, {
    raw: {
      width: info.width,
      height: info.height,
      channels: 4,
    },
  })
    .extract({
      left: cropBounds.x,
      top: cropBounds.y,
      width: cropBounds.width,
      height: cropBounds.height,
    })
    .raw()
    .toBuffer({ resolveWithObject: true });

  return {
    data: new Uint8ClampedArray(cropped.data),
    width: cropped.info.width,
    height: cropped.info.height,
  };
}

function applyWhiteBalanceAnalysisStage(image: RawImage, settings: ConversionSettings, profile: FilmProfile) {
  const imageData = createImageData(new Uint8ClampedArray(image.data), image.width, image.height);
  const filmBaseBalance = settings.filmBaseSample
    ? {
        red: Math.max(settings.filmBaseSample.r / 255, 1 / 255),
        green: Math.max(settings.filmBaseSample.g / 255, 1 / 255),
        blue: Math.max(settings.filmBaseSample.b / 255, 1 / 255),
      }
    : { red: 1, green: 1, blue: 1 };
  const { data } = imageData;

  for (let index = 0; index < data.length; index += 4) {
    let r = data[index] / 255;
    let g = data[index + 1] / 255;
    let b = data[index + 2] / 255;

    if ((profile.filmType ?? 'negative') !== 'slide') {
      r = 1 - r;
      g = 1 - g;
      b = 1 - b;
    }

    const invertedBaseR = 1 - filmBaseBalance.red;
    const invertedBaseG = 1 - filmBaseBalance.green;
    const invertedBaseB = 1 - filmBaseBalance.blue;
    r = Math.max(0, (r - invertedBaseR) / Math.max(1 / 255, 1 - invertedBaseR)) * settings.redBalance;
    g = Math.max(0, (g - invertedBaseG) / Math.max(1 / 255, 1 - invertedBaseG)) * settings.greenBalance;
    b = Math.max(0, (b - invertedBaseB) / Math.max(1 / 255, 1 - invertedBaseB)) * settings.blueBalance;

    data[index] = Math.round(Math.min(1, Math.max(0, r)) * 255);
    data[index + 1] = Math.round(Math.min(1, Math.max(0, g)) * 255);
    data[index + 2] = Math.round(Math.min(1, Math.max(0, b)) * 255);
  }

  return imageData;
}

function processTransformedImage(image: RawImage, settings: ConversionSettings, profile: FilmProfile, highlightDensityEstimate: number, flareFloor: [number, number, number] | null): ProcessedImage {
  const sourceImageData = createImageData(new Uint8ClampedArray(image.data), image.width, image.height);
  const imageData = createImageData(new Uint8ClampedArray(image.data), image.width, image.height);
  const isColor = profile.type === 'color' && !settings.blackAndWhite.enabled;
  const residualBaseOffset = computeResidualBaseOffset(
    sourceImageData,
    settings,
    isColor,
    profile.filmType ?? 'negative',
    'srgb',
    'srgb',
    [1, 1, 1],
    flareFloor,
  );

  const histogram = processImageData(
    imageData,
    settings,
    isColor,
    'processed',
    profile.maskTuning,
    profile.colorMatrix,
    profile.tonalCharacter,
    undefined,
    undefined,
    undefined,
    0,
    0,
    highlightDensityEstimate,
    'srgb',
    'srgb',
    profile.id,
    profile.filmType ?? 'negative',
    residualBaseOffset,
    flareFloor,
    [1, 1, 1],
  );

  return {
    data: imageData.data,
    width: image.width,
    height: image.height,
    histogram,
  };
}

export function processRawImage(image: RawImage, settings: ConversionSettings, profile: FilmProfile, highlightDensityEstimate = 0, flareFloor: [number, number, number] | null = null): ProcessedImage {
  return processTransformedImage(image, settings, profile, highlightDensityEstimate, flareFloor);
}

async function encodeImage(image: RawImage, config: CliConfig): Promise<{ data: Buffer; width: number; height: number }> {
  let encoder = sharp(Buffer.from(image.data), {
    raw: {
      width: image.width,
      height: image.height,
      channels: 4,
    },
  });

  if (config.maxDimension) {
    encoder = encoder.resize({
      width: config.maxDimension,
      height: config.maxDimension,
      fit: 'inside',
      withoutEnlargement: true,
    });
  }

  switch (config.format) {
    case 'png':
      encoder = encoder.png();
      break;
    case 'webp':
      encoder = encoder.webp({ quality: config.quality });
      break;
    case 'tiff':
      encoder = encoder.tiff({ quality: config.quality, compression: 'lzw' });
      break;
    case 'jpeg':
    default:
      encoder = encoder.flatten({ background: '#000000' }).jpeg({ quality: config.quality });
      break;
  }

  const { data, info } = await encoder.toBuffer({ resolveWithObject: true });
  return {
    data,
    width: info.width,
    height: info.height,
  };
}

export async function processImageFile(inputPath: string, outputPath: string, config: CliConfig, profile: FilmProfile = resolveProfile(config.profile)): Promise<CliFileResult> {
  const warnings: string[] = [];
  const file = await stat(inputPath);
  if (file.size > MAX_FILE_SIZE_BYTES) {
    throw new Error(`File size ${file.size} bytes exceeds limit ${MAX_FILE_SIZE_BYTES} bytes.`);
  }

  const decoded = await decodeImage(inputPath);
  const settings = resolveSettings(profile, config);

  if (config.auto.filmBase && settings.filmBaseSample === null) {
    settings.filmBaseSample = estimateFilmBaseSampleFromRgba(decoded.data, decoded.width, decoded.height);
    if (!settings.filmBaseSample) {
      warnings.push('Film base could not be estimated; using neutral base.');
    }
  }

  const analysisSource = await resizeRawImage(decoded, 1024);
  const flareFloor = config.auto.flare
    ? estimateFlare(analysisSource.data, analysisSource.width, analysisSource.height)
    : null;

  const transformedAnalysis = await transformForPipeline(analysisSource, settings);
  const firstAnalysis = processTransformedImage(transformedAnalysis, settings, profile, 0, flareFloor);
  const highlightDensityEstimate = computeHighlightDensity(firstAnalysis.histogram);

  if (config.auto.exposure) {
    const exposure = analyzeExposure(firstAnalysis.histogram);
    settings.exposure = exposure.exposure;
    settings.blackPoint = exposure.blackPoint;
    settings.whitePoint = exposure.whitePoint;
  }

  if (config.auto.whiteBalance) {
    const whiteBalanceImageData = applyWhiteBalanceAnalysisStage(transformedAnalysis, settings, profile);
    const colorBalance = analyzeColorBalance(
      whiteBalanceImageData,
      profile.type === 'color' && (profile.filmType ?? 'negative') === 'negative',
    );
    if (colorBalance.temperature !== null && colorBalance.tint !== null) {
      settings.temperature = colorBalance.temperature;
      settings.tint = colorBalance.tint;
    } else {
      warnings.push('White balance could not be estimated; using profile defaults.');
    }
  }

  const transformed = await transformForPipeline(decoded, settings);
  const processed = processTransformedImage(transformed, settings, profile, highlightDensityEstimate, flareFloor);
  const encoded = await encodeImage(processed, config);

  if (!config.dryRun) {
    await writeFile(outputPath, encoded.data);
  }

  return {
    inputPath,
    outputPath,
    status: 'done',
    width: decoded.width,
    height: decoded.height,
    outputWidth: encoded.width,
    outputHeight: encoded.height,
    profile: profile.id,
    warnings,
  };
}

export async function runConversion(config: CliConfig): Promise<CliRunSummary> {
  const profile = resolveProfile(config.profile);
  const inputPaths = await expandInputs(config.input);
  await ensureOutputDirectory(config.outputDir, config.dryRun);

  const files = new Array<CliFileResult>(inputPaths.length);
  const processInput = async (inputPath: string): Promise<CliFileResult> => {
    const outputPath = createOutputPath(inputPath, config);
    if (await shouldSkipExisting(outputPath, config.overwrite)) {
      return {
        inputPath,
        outputPath,
        status: 'skipped',
        width: null,
        height: null,
        outputWidth: null,
        outputHeight: null,
        profile: profile.id,
        warnings: ['Output exists; pass --overwrite to replace it.'],
      };
    }

    if (config.dryRun) {
      return {
        inputPath,
        outputPath,
        status: 'pending',
        width: null,
        height: null,
        outputWidth: null,
        outputHeight: null,
        profile: profile.id,
        warnings: [],
      };
    }

    try {
      return await processImageFile(inputPath, outputPath, config, profile);
    } catch (error) {
      return {
        inputPath,
        outputPath,
        status: 'error',
        width: null,
        height: null,
        outputWidth: null,
        outputHeight: null,
        profile: profile.id,
        warnings: [],
        error: error instanceof Error ? error.message : String(error),
      };
    }
  };

  let nextIndex = 0;
  const workerCount = Math.min(config.concurrency, inputPaths.length);
  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (nextIndex < inputPaths.length) {
      const index = nextIndex;
      nextIndex += 1;
      const inputPath = inputPaths[index];
      if (inputPath) {
        files[index] = await processInput(inputPath);
      }
    }
  }));

  const orderedFiles = files.filter((file): file is CliFileResult => file !== undefined);

  if (orderedFiles.length !== inputPaths.length) {
    throw new Error('Internal error: conversion results did not match input count.');
  }

  return {
    dryRun: config.dryRun,
    profile: profile.id,
    format: config.format,
    outputDir: path.resolve(config.outputDir),
    totals: {
      matched: orderedFiles.length,
      done: orderedFiles.filter((file) => file.status === 'done').length,
      skipped: orderedFiles.filter((file) => file.status === 'skipped' || file.status === 'pending').length,
      failed: orderedFiles.filter((file) => file.status === 'error').length,
    },
    files: orderedFiles,
  };
}

export function buildHistogramForRawImage(image: RawImage): HistogramData {
  const histogram = {
    r: new Array<number>(256).fill(0),
    g: new Array<number>(256).fill(0),
    b: new Array<number>(256).fill(0),
    l: new Array<number>(256).fill(0),
  };
  accumulateHistogram(histogram, image.data);
  return histogram;
}
