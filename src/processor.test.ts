import { mkdtemp, readFile } from 'node:fs/promises';
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
});
