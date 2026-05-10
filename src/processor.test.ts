import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { installImageDataShim, NodeImageData } from './imageData.js';
import { processRawImage, runConversion } from './processor.js';
import type { CliConfig } from './types.js';
import { createDefaultSettings, FILM_PROFILES } from './vendor/constants.js';
import { computeResidualBaseOffset, processImageData } from './vendor/utils/imagePipeline.js';

installImageDataShim();

function createTestConfig(overrides: Partial<CliConfig>): CliConfig {
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
    auto: {
      filmBase: true,
      flare: false,
      exposure: false,
      whiteBalance: false,
    },
    naming: {
      suffix: '-positive',
    },
    settings: {},
    ...overrides,
  };
}

describe('processor', () => {
  it('matches DarkSlide processImageData for an equivalent raw buffer', () => {
    const profile = FILM_PROFILES.find((candidate) => candidate.id === 'generic-color');
    if (!profile) {
      throw new Error('Missing generic-color profile.');
    }

    const settings = createDefaultSettings({
      blackPoint: 0,
      whitePoint: 255,
      contrast: 0,
      highlightProtection: 0,
      filmBaseSample: null,
    });
    const source = new Uint8ClampedArray([
      30, 80, 130, 255,
      200, 180, 120, 255,
      90, 110, 140, 255,
      220, 210, 190, 255,
    ]);

    const cliResult = processRawImage({ data: new Uint8ClampedArray(source), width: 2, height: 2 }, settings, profile);
    const directImageData = new NodeImageData(new Uint8ClampedArray(source), 2, 2);
    const residual = computeResidualBaseOffset(
      new NodeImageData(new Uint8ClampedArray(source), 2, 2),
      settings,
      true,
      profile.filmType,
      'srgb',
      'srgb',
      [1, 1, 1],
      null,
    );
    processImageData(
      directImageData,
      settings,
      true,
      'processed',
      profile.maskTuning,
      profile.colorMatrix,
      profile.tonalCharacter,
      undefined,
      undefined,
      undefined,
      0,
      0,
      0,
      'srgb',
      'srgb',
      profile.id,
      profile.filmType,
      residual,
      null,
      [1, 1, 1],
    );

    expect(Array.from(cliResult.data)).toEqual(Array.from(directImageData.data));
  });

  it('converts a tiny PNG and writes a JSON-reportable result', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'darkslide-cli-integration-'));
    const input = path.join(dir, 'negative.png');
    const outputDir = path.join(dir, 'out');
    await sharp({
      create: {
        width: 12,
        height: 12,
        channels: 4,
        background: { r: 210, g: 160, b: 90, alpha: 1 },
      },
    }).png().toFile(input);

    const summary = await runConversion(createTestConfig({
      input: [input],
      outputDir,
      profile: 'generic-color',
      format: 'png',
    }));

    expect(summary.totals).toEqual({ matched: 1, done: 1, skipped: 0, failed: 0 });
    expect(summary.files[0]?.status).toBe('done');
    expect(summary.files[0]?.outputWidth).toBe(12);
    const output = await readFile(summary.files[0]?.outputPath ?? '');
    expect(output.length).toBeGreaterThan(0);
  });

  it('dry-runs without writing outputs', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'darkslide-cli-dry-'));
    const input = path.join(dir, 'negative.png');
    await sharp({
      create: {
        width: 8,
        height: 8,
        channels: 4,
        background: { r: 220, g: 150, b: 80, alpha: 1 },
      },
    }).png().toFile(input);

    const summary = await runConversion(createTestConfig({
      input: [input],
      outputDir: path.join(dir, 'out'),
      dryRun: true,
    }));

    expect(summary.files[0]?.status).toBe('pending');
    expect(summary.totals).toEqual({ matched: 1, done: 0, skipped: 1, failed: 0 });
  });

  it('keeps concurrent summary ordering deterministic', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'darkslide-cli-concurrent-'));
    const inputs = ['c.png', 'a.png', 'b.png'];
    await Promise.all(inputs.map((name, index) => sharp({
      create: {
        width: 6,
        height: 6,
        channels: 4,
        background: { r: 190 + index * 10, g: 150, b: 90, alpha: 1 },
      },
    }).png().toFile(path.join(dir, name))));

    const sequential = await runConversion(createTestConfig({
      input: [path.join(dir, '*.png')],
      outputDir: path.join(dir, 'out-sequential'),
      concurrency: 1,
    }));
    const concurrent = await runConversion(createTestConfig({
      input: [path.join(dir, '*.png')],
      outputDir: path.join(dir, 'out-concurrent'),
      concurrency: 3,
    }));

    expect(sequential.files.map((file) => path.basename(file.inputPath))).toEqual(['a.png', 'b.png', 'c.png']);
    expect(concurrent.files.map((file) => path.basename(file.inputPath))).toEqual(['a.png', 'b.png', 'c.png']);
    expect(concurrent.files.map((file) => file.status)).toEqual(['done', 'done', 'done']);
  });

  it('preserves partial results when one concurrent file fails', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'darkslide-cli-partial-'));
    const goodA = path.join(dir, 'a.png');
    const goodC = path.join(dir, 'c.png');
    const badB = path.join(dir, 'b.png');
    await sharp({
      create: {
        width: 6,
        height: 6,
        channels: 4,
        background: { r: 210, g: 160, b: 90, alpha: 1 },
      },
    }).png().toFile(goodA);
    await writeFile(badB, 'not an image');
    await sharp({
      create: {
        width: 6,
        height: 6,
        channels: 4,
        background: { r: 190, g: 150, b: 80, alpha: 1 },
      },
    }).png().toFile(goodC);

    const summary = await runConversion(createTestConfig({
      input: [path.join(dir, '*.png')],
      outputDir: path.join(dir, 'out'),
      concurrency: 2,
    }));

    expect(summary.files.map((file) => path.basename(file.inputPath))).toEqual(['a.png', 'b.png', 'c.png']);
    expect(summary.files.map((file) => file.status)).toEqual(['done', 'error', 'done']);
    expect(summary.totals).toEqual({ matched: 3, done: 2, skipped: 0, failed: 1 });
    expect(summary.files[1]?.error).toBeTruthy();
  });

  it('fails oversized image dimensions before full decode', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'darkslide-cli-large-'));
    const input = path.join(dir, 'huge.png');
    await sharp({
      create: {
        width: 18001,
        height: 1,
        channels: 4,
        background: { r: 200, g: 150, b: 90, alpha: 1 },
      },
    }).png().toFile(input);

    const summary = await runConversion(createTestConfig({
      input: [input],
      outputDir: path.join(dir, 'out'),
      concurrency: 2,
    }));

    expect(summary.files[0]?.status).toBe('error');
    expect(summary.files[0]?.error).toMatch(/exceed limit/i);
  });
});
