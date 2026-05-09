import { describe, expect, it } from 'vitest';
import { loadCliConfig, parseArgs } from './config.js';

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
      '--overwrite',
      '--json',
    ]);

    const config = await loadCliConfig(args);

    expect(config.input).toEqual(['scans/**/*.tif', 'one.png']);
    expect(config.outputDir).toBe('converted');
    expect(config.profile).toBe('portra-400');
    expect(config.format).toBe('jpeg');
    expect(config.quality).toBe(85);
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
});
