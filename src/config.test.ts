import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadCliConfig, parseArgs } from './config.js';

async function writeJsonConfig(value: unknown) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'darkslide-cli-config-'));
  const filePath = path.join(dir, 'darkslide.config.json');
  await writeFile(filePath, JSON.stringify(value));
  return filePath;
}

describe('CLI config', () => {
  it('parses repeatable inputs and flag overrides', async () => {
    const args = parseArgs([
      '--input',
      'scans/**/*.tif',
      '--input',
      'one.png',
      '--output',
      'converted',
      '--profile',
      'portra-400',
      '--format',
      'jpg',
      '--quality',
      '85',
      '--concurrency',
      '3',
      '--save-sidecar',
      '--overwrite',
      '--json',
    ]);

    const config = await loadCliConfig(args);

    expect(config.input).toEqual(['scans/**/*.tif', 'one.png']);
    expect(config.outputDir).toBe('converted');
    expect(config.profile).toBe('portra-400');
    expect(config.format).toBe('jpeg');
    expect(config.quality).toBe(85);
    expect(config.concurrency).toBe(3);
    expect(config.saveSidecar).toBe(true);
    expect(config.overwrite).toBe(true);
    expect(config.json).toBe(true);
  });

  it('rejects missing input', async () => {
    await expect(loadCliConfig(parseArgs([]))).rejects.toThrow(/at least one input/i);
  });

  it('rejects invalid quality', async () => {
    expect(() => parseArgs(['--input', 'scan.tif', '--quality', '120'])).not.toThrow();
    await expect(loadCliConfig(parseArgs(['--input', 'scan.tif', '--quality', '120']))).rejects.toThrow(/quality/i);
  });

  it('rejects invalid config file shapes', async () => {
    const configPath = await writeJsonConfig([]);

    await expect(loadCliConfig(parseArgs(['--config', configPath]))).rejects.toThrow(/json object/i);
  });

  it('rejects invalid nested auto values', async () => {
    const configPath = await writeJsonConfig({
      input: 'scan.tif',
      auto: {
        filmBase: 'yes',
      },
    });

    await expect(loadCliConfig(parseArgs(['--config', configPath]))).rejects.toThrow(/auto\.filmBase/i);
  });

  it('rejects invalid maxDimension values', async () => {
    expect(() => parseArgs(['--input', 'scan.tif', '--max-dimension', '10.5'])).toThrow(/integer/i);

    const configPath = await writeJsonConfig({
      input: 'scan.tif',
      maxDimension: 0,
    });

    await expect(loadCliConfig(parseArgs(['--config', configPath]))).rejects.toThrow(/maxDimension/i);
  });

  it('rejects invalid concurrency values', async () => {
    expect(() => parseArgs(['--input', 'scan.tif', '--concurrency', '1.5'])).toThrow(/integer/i);

    const configPath = await writeJsonConfig({
      input: 'scan.tif',
      concurrency: 0,
    });

    await expect(loadCliConfig(parseArgs(['--config', configPath]))).rejects.toThrow(/concurrency/i);
  });

  it('supports disabling sidecars from CLI overrides', async () => {
    const configPath = await writeJsonConfig({
      input: 'scan.tif',
      saveSidecar: true,
    });

    const config = await loadCliConfig(parseArgs(['--config', configPath, '--no-sidecar']));

    expect(config.saveSidecar).toBe(false);
  });

  it('rejects invalid sidecar config values', async () => {
    const configPath = await writeJsonConfig({
      input: 'scan.tif',
      saveSidecar: 'yes',
    });

    await expect(loadCliConfig(parseArgs(['--config', configPath]))).rejects.toThrow(/saveSidecar/i);
  });

  it('rejects empty outputDir and profile values', async () => {
    await expect(loadCliConfig(parseArgs(['--input', 'scan.tif', '--output', '   ']))).rejects.toThrow(/outputDir/i);
    await expect(loadCliConfig(parseArgs(['--input', 'scan.tif', '--profile', '   ']))).rejects.toThrow(/profile/i);
  });

  it('rejects unknown profiles as usage errors during config loading', async () => {
    await expect(loadCliConfig(parseArgs(['--input', 'scan.tif', '--profile', 'not-a-profile']))).rejects.toThrow(/Unknown profile/i);
  });

  it('rejects unknown and invalid settings values', async () => {
    const unknownSettingsPath = await writeJsonConfig({
      input: 'scan.tif',
      settings: {
        imaginarySlider: 10,
      },
    });
    await expect(loadCliConfig(parseArgs(['--config', unknownSettingsPath]))).rejects.toThrow(/settings/i);

    const invalidSettingsPath = await writeJsonConfig({
      input: 'scan.tif',
      settings: {
        contrast: 'high',
      },
    });
    await expect(loadCliConfig(parseArgs(['--config', invalidSettingsPath]))).rejects.toThrow(/settings\.contrast/i);
  });

  it('publishes a parseable config schema', async () => {
    const schemaPath = path.resolve('schemas/darkslide-config.schema.json');
    const schema = JSON.parse(await readFile(schemaPath, 'utf8')) as { properties?: Record<string, unknown> };

    expect(schema.properties?.input).toBeDefined();
    expect(schema.properties?.settings).toBeDefined();
  });
});
