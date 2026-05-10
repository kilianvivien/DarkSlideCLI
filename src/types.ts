import type { ConversionSettings } from './vendor/types.js';

export type CliOutputFormat = 'jpeg' | 'png' | 'webp' | 'tiff';
export type FileStatus = 'pending' | 'done' | 'skipped' | 'error';

export interface CliAutoConfig {
  filmBase: boolean;
  flare: boolean;
  exposure: boolean;
  whiteBalance: boolean;
}

export interface CliNamingConfig {
  suffix: string;
}

export interface CliConfig {
  input: string[];
  outputDir: string;
  profile: string;
  format: CliOutputFormat;
  quality: number;
  maxDimension: number | null;
  overwrite: boolean;
  dryRun: boolean;
  json: boolean;
  concurrency: number;
  saveSidecar: boolean;
  auto: CliAutoConfig;
  naming: CliNamingConfig;
  settings: Partial<ConversionSettings>;
}

export interface CliFileResult {
  inputPath: string;
  outputPath: string;
  sidecarPath?: string;
  status: FileStatus;
  width: number | null;
  height: number | null;
  outputWidth: number | null;
  outputHeight: number | null;
  profile: string;
  warnings: string[];
  error?: string;
}

export interface CliRunSummary {
  dryRun: boolean;
  profile: string;
  format: CliOutputFormat;
  outputDir: string;
  totals: {
    matched: number;
    done: number;
    skipped: number;
    failed: number;
  };
  files: CliFileResult[];
}

export interface ParsedArgs {
  configPath?: string;
  input: string[];
  outputDir?: string;
  profile?: string;
  format?: CliOutputFormat;
  quality?: number;
  maxDimension?: number | null;
  overwrite?: boolean;
  dryRun?: boolean;
  json?: boolean;
  concurrency?: number;
  saveSidecar?: boolean;
  help?: boolean;
  listProfiles?: boolean;
  printDefaultConfig?: boolean;
}
