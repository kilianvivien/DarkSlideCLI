import { mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createOutputPath, expandInputs, shouldSkipExisting } from './files.js';

describe('file helpers', () => {
  it('expands supported image inputs deterministically', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'darkslide-cli-files-'));
    await writeFile(path.join(dir, 'b.tif'), 'x');
    await writeFile(path.join(dir, 'a.png'), 'x');
    await writeFile(path.join(dir, 'notes.txt'), 'x');

    const matches = await expandInputs([path.join(dir, '*')]);

    expect(matches.map((match) => path.basename(match))).toEqual(['a.png', 'b.tif']);
  });

  it('creates sanitized output names', () => {
    const outputPath = createOutputPath('/tmp/My Scan 01.tif', {
      outputDir: '/tmp/out',
      format: 'jpeg',
      naming: { suffix: '-positive' },
    });

    expect(outputPath).toBe(path.resolve('/tmp/out/My-Scan-01-positive.jpg'));
  });

  it('skips existing outputs unless overwrite is enabled', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'darkslide-cli-overwrite-'));
    const existing = path.join(dir, 'image.jpg');
    await writeFile(existing, 'x');

    await expect(shouldSkipExisting(existing, false)).resolves.toBe(true);
    await expect(shouldSkipExisting(existing, true)).resolves.toBe(false);
  });
});
