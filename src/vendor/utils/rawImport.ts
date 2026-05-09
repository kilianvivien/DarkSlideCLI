import { ConversionSettings, FilmBaseSample } from '../types.js';
import { clamp } from './math.js';

function estimateFilmBaseSampleWithStride(
  pixels: ArrayLike<number>,
  width: number,
  height: number,
  stride: 3 | 4,
): FilmBaseSample | null {
  if (width < 8 || height < 8 || pixels.length < width * height * stride) {
    return null;
  }

  const BIN_COUNT = 64;
  const BIN_WIDTH = 256 / BIN_COUNT;
  const CLUSTER_RADIUS = 10;
  const MIN_CLUSTER_SIZE = 12;
  const borderThickness = Math.max(8, Math.min(160, Math.round(Math.min(width, height) * 0.03)));
  const borderPixels = width * borderThickness * 2 + Math.max(0, height - borderThickness * 2) * borderThickness * 2;
  const step = Math.max(1, Math.round(Math.sqrt(borderPixels / 4096)));
  const samples: Array<{ lum: number; r: number; g: number; b: number }> = [];

  const pushSample = (x: number, y: number) => {
    const index = (y * width + x) * stride;
    const r = pixels[index] ?? 0;
    const g = pixels[index + 1] ?? 0;
    const b = pixels[index + 2] ?? 0;
    samples.push({
      lum: 0.299 * r + 0.587 * g + 0.114 * b,
      r,
      g,
      b,
    });
  };

  for (let y = 0; y < borderThickness; y += step) {
    for (let x = 0; x < width; x += step) {
      pushSample(x, y);
      pushSample(x, height - 1 - y);
    }
  }

  for (let y = borderThickness; y < height - borderThickness; y += step) {
    for (let x = 0; x < borderThickness; x += step) {
      pushSample(x, y);
      pushSample(width - 1 - x, y);
    }
  }

  if (samples.length < 24) {
    return null;
  }

  const candidateSamples = [...samples]
    .sort((left, right) => right.lum - left.lum)
    .slice(0, Math.max(24, Math.min(512, Math.round(samples.length * 0.2))));
  const result = { r: 0, g: 0, b: 0 } satisfies FilmBaseSample;

  for (const channel of ['r', 'g', 'b'] as const) {
    const bins = new Uint32Array(BIN_COUNT);
    for (const sample of candidateSamples) {
      const bin = Math.min(BIN_COUNT - 1, Math.floor(sample[channel] / BIN_WIDTH));
      bins[bin] += 1;
    }

    let modeBin = 0;
    for (let index = 1; index < BIN_COUNT; index += 1) {
      if (bins[index] > bins[modeBin]) {
        modeBin = index;
      }
    }

    const modeCenter = (modeBin + 0.5) * BIN_WIDTH;
    let sum = 0;
    let count = 0;

    for (const sample of candidateSamples) {
      if (Math.abs(sample[channel] - modeCenter) <= CLUSTER_RADIUS) {
        sum += sample[channel];
        count += 1;
      }
    }

    if (count < MIN_CLUSTER_SIZE) {
      const takeCount = Math.max(24, Math.min(256, Math.round(samples.length * 0.12)));
      const topSamples = [...samples].sort((left, right) => right.lum - left.lum).slice(0, takeCount);
      const sums = topSamples.reduce((acc, sample) => ({
        r: acc.r + sample.r,
        g: acc.g + sample.g,
        b: acc.b + sample.b,
      }), { r: 0, g: 0, b: 0 });

      return {
        r: clamp(Math.round(sums.r / topSamples.length), 1, 255),
        g: clamp(Math.round(sums.g / topSamples.length), 1, 255),
        b: clamp(Math.round(sums.b / topSamples.length), 1, 255),
      };
    }

    result[channel] = clamp(Math.round(sum / count), 1, 255);
  }

  if (Math.min(result.r, result.g, result.b) < 5) {
    return null;
  }

  return result;
}

export function estimateFilmBaseSampleFromRgba(rgba: ArrayLike<number>, width: number, height: number): FilmBaseSample | null {
  return estimateFilmBaseSampleWithStride(rgba, width, height, 4);
}

export function getFilmBaseChannelBalance(sample: FilmBaseSample | null) {
  if (!sample) {
    return {
      redBalance: 1,
      greenBalance: 1,
      blueBalance: 1,
    };
  }

  const safeR = Math.max(255 - sample.r, 1);
  const safeG = Math.max(255 - sample.g, 1);
  const safeB = Math.max(255 - sample.b, 1);

  return {
    redBalance: safeG / safeR,
    greenBalance: 1,
    blueBalance: safeG / safeB,
  };
}

export function getFilmBaseCorrectionSettings(sample: FilmBaseSample | null) {
  return {
    filmBaseSample: null,
    temperature: 0,
    tint: 0,
    ...getFilmBaseChannelBalance(sample),
  } satisfies Pick<ConversionSettings, 'filmBaseSample' | 'temperature' | 'tint' | 'redBalance' | 'greenBalance' | 'blueBalance'>;
}
