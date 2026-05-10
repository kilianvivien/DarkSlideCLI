import { createHash } from 'node:crypto';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { installImageDataShim } from './imageData.js';
import { runConversion } from './processor.js';
import type { CliConfig } from './types.js';

installImageDataShim();

interface ImageStats {
  width: number;
  height: number;
  hash: string;
  means: {
    r: number;
    g: number;
    b: number;
  };
  histogram: number[];
}

function createQualityConfig(overrides: Partial<CliConfig>): CliConfig {
  return {
    input: [],
    outputDir: '',
    profile: 'generic-color',
    format: 'png',
    quality: 92,
    maxDimension: null,
    overwrite: false,
    dryRun: false,
    json: true,
    concurrency: 1,
    saveSidecar: false,
    colorManagement: {
      inputProfileId: 'srgb',
      outputProfileId: 'srgb',
      embedOutputProfile: true,
    },
    auto: {
      filmBase: false,
      flare: false,
      exposure: false,
      whiteBalance: false,
    },
    naming: {
      suffix: '-positive',
    },
    settings: {
      filmBaseSample: { r: 220, g: 164, b: 92 },
    },
    ...overrides,
  };
}

function syntheticNegativeBuffer(width: number, height: number) {
  const data = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      const horizontal = x / Math.max(1, width - 1);
      const vertical = y / Math.max(1, height - 1);
      const frameEdge = x < 3 || y < 3 || x >= width - 3 || y >= height - 3;
      data[offset] = Math.round(frameEdge ? 236 : 206 + horizontal * 32 - vertical * 18);
      data[offset + 1] = Math.round(frameEdge ? 176 : 150 + vertical * 24);
      data[offset + 2] = Math.round(frameEdge ? 108 : 82 + horizontal * 14 + vertical * 20);
      data[offset + 3] = 255;
    }
  }
  return data;
}

async function writeSyntheticNegative(dir: string, filename = 'synthetic-negative.png', width = 32, height = 24) {
  const input = path.join(dir, filename);
  await sharp(syntheticNegativeBuffer(width, height), {
    raw: {
      width,
      height,
      channels: 4,
    },
  }).png().toFile(input);
  return input;
}

async function readStats(imagePath: string): Promise<ImageStats> {
  const { data, info } = await sharp(imagePath)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const histogram = new Array<number>(16).fill(0);
  let r = 0;
  let g = 0;
  let b = 0;
  const rgb = Buffer.alloc((data.length / 4) * 3);

  for (let source = 0, target = 0; source < data.length; source += 4, target += 3) {
    r += data[source];
    g += data[source + 1];
    b += data[source + 2];
    rgb[target] = data[source];
    rgb[target + 1] = data[source + 1];
    rgb[target + 2] = data[source + 2];
    const luminance = Math.round((data[source] + data[source + 1] + data[source + 2]) / 3);
    histogram[Math.min(15, Math.floor(luminance / 16))] += 1;
  }

  const pixels = data.length / 4;
  return {
    width: info.width,
    height: info.height,
    hash: createHash('sha256').update(rgb).digest('hex'),
    means: {
      r: Number((r / pixels).toFixed(3)),
      g: Number((g / pixels).toFixed(3)),
      b: Number((b / pixels).toFixed(3)),
    },
    histogram,
  };
}

async function convertSynthetic(overrides: Partial<CliConfig> = {}) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'darkslide-cli-quality-'));
  const input = await writeSyntheticNegative(dir);
  const summary = await runConversion(createQualityConfig({
    input: [input],
    outputDir: path.join(dir, 'out'),
    ...overrides,
  }));
  const outputPath = summary.files[0]?.outputPath;
  if (!outputPath) {
    throw new Error('Missing output path.');
  }
  return {
    summary,
    stats: await readStats(outputPath),
  };
}

describe('image quality baseline', () => {
  it('pins deterministic synthetic output dimensions, means, histogram, and hash', async () => {
    const { summary, stats } = await convertSynthetic();

    expect(summary.files[0]?.status).toBe('done');
    expect(stats.width).toBe(32);
    expect(stats.height).toBe(24);
    expect(stats.means).toEqual({ r: 0.634, g: 0, b: 0 });
    expect(stats.histogram).toEqual([768, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(stats.hash).toBe('d23019998443e4412e093f629dad679644af116f49cbd8da2f17052c1fa6bf85');
  });

  it('keeps auto-analysis toggles measurable against the same synthetic scan', async () => {
    const baseline = await convertSynthetic();
    const filmBase = await convertSynthetic({
      auto: { filmBase: true, flare: false, exposure: false, whiteBalance: false },
      settings: {},
    });
    const flare = await convertSynthetic({
      auto: { filmBase: false, flare: true, exposure: false, whiteBalance: false },
    });
    const exposure = await convertSynthetic({
      auto: { filmBase: false, flare: false, exposure: true, whiteBalance: false },
    });
    const whiteBalance = await convertSynthetic({
      auto: { filmBase: false, flare: false, exposure: false, whiteBalance: true },
    });

    for (const result of [filmBase, flare, exposure]) {
      expect(result.stats.width).toBe(baseline.stats.width);
      expect(result.stats.height).toBe(baseline.stats.height);
      expect(result.stats.hash).not.toBe(baseline.stats.hash);
    }

    expect(whiteBalance.stats.hash).toBe(baseline.stats.hash);
    expect(whiteBalance.summary.files[0]?.warnings).toContain('White balance could not be estimated; using profile defaults.');
  });

  it('covers crop, rotation, and level-angle geometry', async () => {
    const { stats } = await convertSynthetic({
      settings: {
        filmBaseSample: { r: 220, g: 164, b: 92 },
        crop: { x: 0.25, y: 0.25, width: 0.5, height: 0.5, aspectRatio: null },
        rotation: 90,
        levelAngle: 0,
      },
    });
    const leveled = await convertSynthetic({
      settings: {
        filmBaseSample: { r: 220, g: 164, b: 92 },
        crop: { x: 0.25, y: 0.25, width: 0.5, height: 0.5, aspectRatio: null },
        rotation: 90,
        levelAngle: 1,
      },
    });

    expect(stats.width).toBe(12);
    expect(stats.height).toBe(16);
    expect(leveled.stats.width).toBeGreaterThanOrEqual(stats.width);
    expect(leveled.stats.height).toBeGreaterThanOrEqual(stats.height);
    expect(leveled.stats.hash).not.toBe(stats.hash);
  });

  it('smokes black-and-white, slide, and major color profile outputs', async () => {
    const profiles = ['generic-bw', 'provia-100f', 'portra-400', 'gold-200', 'ektar-100', 'fuji-400h'];
    const results = await Promise.all(profiles.map((profile) => convertSynthetic({
      profile,
      settings: {
        filmBaseSample: { r: 220, g: 164, b: 92 },
        ...(profile === 'generic-bw' ? { blackAndWhite: { enabled: true, redMix: 0, greenMix: 0, blueMix: 0, tone: 0 } } : {}),
      },
    })));

    for (const [index, result] of results.entries()) {
      expect(result.summary.files[0]?.profile).toBe(profiles[index]);
      expect(result.stats.width).toBe(32);
      expect(result.stats.height).toBe(24);
      expect(result.stats.hash).toMatch(/^[a-f0-9]{64}$/);
    }

    const bwMeans = results[0].stats.means;
    expect(Math.abs(bwMeans.r - bwMeans.g)).toBeLessThan(2);
    expect(Math.abs(bwMeans.g - bwMeans.b)).toBeLessThan(2);
    expect(new Set(results.map((result) => result.stats.hash)).size).toBe(results.length);
  });
});
