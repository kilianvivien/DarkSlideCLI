import { access, mkdir } from 'node:fs/promises';
import path from 'node:path';
import fg from 'fast-glob';
import { getFileExtension, sanitizeFilenameBase } from './vendor/utils/imagePipeline.js';
import type { CliConfig, CliOutputFormat } from './types.js';

const SUPPORTED_INPUT_EXTENSIONS = new Set(['.tif', '.tiff', '.jpg', '.jpeg', '.png', '.webp']);
const OUTPUT_EXTENSIONS: Record<CliOutputFormat, string> = {
  jpeg: 'jpg',
  png: 'png',
  webp: 'webp',
  tiff: 'tiff',
};

async function pathExists(filePath: string) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function expandInputs(patterns: string[]) {
  const matches = await fg(patterns, {
    absolute: true,
    onlyFiles: true,
    unique: true,
    dot: false,
    suppressErrors: true,
  });

  return matches
    .filter((filePath) => SUPPORTED_INPUT_EXTENSIONS.has(getFileExtension(filePath)))
    .sort((left, right) => left.localeCompare(right));
}

export function createOutputPath(inputPath: string, config: Pick<CliConfig, 'outputDir' | 'format' | 'naming'>) {
  const extension = OUTPUT_EXTENSIONS[config.format];
  const base = sanitizeFilenameBase(path.basename(inputPath));
  return path.resolve(config.outputDir, `${base}${config.naming.suffix}.${extension}`);
}

export async function ensureOutputDirectory(outputDir: string, dryRun: boolean) {
  if (!dryRun) {
    await mkdir(path.resolve(outputDir), { recursive: true });
  }
}

export async function shouldSkipExisting(outputPath: string, overwrite: boolean) {
  return !overwrite && await pathExists(outputPath);
}
