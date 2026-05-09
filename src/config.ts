import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { UsageError } from './errors.js';
import type { CliConfig, CliOutputFormat, ParsedArgs } from './types.js';
import type { ConversionSettings } from './vendor/types.js';

const OUTPUT_FORMATS = new Set<CliOutputFormat>(['jpeg', 'png', 'webp', 'tiff']);

const DEFAULT_CONFIG: CliConfig = {
  input: [],
  outputDir: 'converted',
  profile: 'generic-color',
  format: 'jpeg',
  quality: 92,
  maxDimension: null,
  overwrite: false,
  dryRun: false,
  json: false,
  auto: {
    filmBase: true,
    flare: true,
    exposure: false,
    whiteBalance: false,
  },
  naming: {
    suffix: '-positive',
  },
  settings: {},
};

type RawConfig = Partial<Omit<CliConfig, 'input' | 'settings'>> & {
  input?: string | string[];
  settings?: Partial<ConversionSettings>;
};

function readFlagValue(args: string[], index: number, flag: string) {
  const value = args[index + 1];
  if (!value || value.startsWith('--')) {
    throw new UsageError(`${flag} requires a value.`);
  }
  return value;
}

function parseNumber(value: string, flag: string) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new UsageError(`${flag} must be a number.`);
  }
  return parsed;
}

function normalizeFormat(format: string): CliOutputFormat {
  const normalized = format.replace(/^image\//, '').toLowerCase();
  const result = normalized === 'jpg' ? 'jpeg' : normalized;
  if (!OUTPUT_FORMATS.has(result as CliOutputFormat)) {
    throw new UsageError(`Unsupported output format "${format}". Use jpeg, png, webp, or tiff.`);
  }
  return result as CliOutputFormat;
}

export function parseArgs(argv: string[]): ParsedArgs {
  const parsed: ParsedArgs = { input: [] };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') {
      parsed.help = true;
    } else if (arg === '--config' || arg === '-c') {
      parsed.configPath = readFlagValue(argv, index, arg);
      index += 1;
    } else if (arg === '--input' || arg === '-i') {
      parsed.input.push(readFlagValue(argv, index, arg));
      index += 1;
    } else if (arg === '--output' || arg === '-o') {
      parsed.outputDir = readFlagValue(argv, index, arg);
      index += 1;
    } else if (arg === '--profile' || arg === '-p') {
      parsed.profile = readFlagValue(argv, index, arg);
      index += 1;
    } else if (arg === '--format' || arg === '-f') {
      parsed.format = normalizeFormat(readFlagValue(argv, index, arg));
      index += 1;
    } else if (arg === '--quality' || arg === '-q') {
      parsed.quality = parseNumber(readFlagValue(argv, index, arg), arg);
      index += 1;
    } else if (arg === '--max-dimension' || arg === '--maxDimension') {
      parsed.maxDimension = parseNumber(readFlagValue(argv, index, arg), arg);
      index += 1;
    } else if (arg === '--overwrite') {
      parsed.overwrite = true;
    } else if (arg === '--no-overwrite') {
      parsed.overwrite = false;
    } else if (arg === '--dry-run') {
      parsed.dryRun = true;
    } else if (arg === '--json') {
      parsed.json = true;
    } else if (arg.startsWith('--')) {
      throw new UsageError(`Unknown option "${arg}".`);
    } else {
      parsed.input.push(arg);
    }
  }

  return parsed;
}

function normalizeInput(input: RawConfig['input']): string[] {
  if (input === undefined) {
    return [];
  }
  const values = Array.isArray(input) ? input : [input];
  return values.map((value) => String(value).trim()).filter(Boolean);
}

function validateQuality(quality: number) {
  if (!Number.isFinite(quality) || quality < 1 || quality > 100) {
    throw new UsageError('quality must be between 1 and 100.');
  }
  return Math.round(quality);
}

function validateMaxDimension(maxDimension: number | null) {
  if (maxDimension === null) {
    return null;
  }
  if (!Number.isFinite(maxDimension) || maxDimension < 1) {
    throw new UsageError('maxDimension must be null or a positive number.');
  }
  return Math.round(maxDimension);
}

async function loadConfigFile(configPath: string | undefined): Promise<RawConfig> {
  if (!configPath) {
    return {};
  }

  const resolved = path.resolve(configPath);
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(resolved, 'utf8'));
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new UsageError(`Could not read config file ${resolved}: ${detail}`);
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new UsageError('Config file must contain a JSON object.');
  }

  return parsed as RawConfig;
}

export async function loadCliConfig(args: ParsedArgs): Promise<CliConfig> {
  const fileConfig = await loadConfigFile(args.configPath);
  const merged: CliConfig = {
    ...DEFAULT_CONFIG,
    ...fileConfig,
    input: [
      ...normalizeInput(fileConfig.input),
      ...args.input,
    ],
    outputDir: args.outputDir ?? fileConfig.outputDir ?? DEFAULT_CONFIG.outputDir,
    profile: args.profile ?? fileConfig.profile ?? DEFAULT_CONFIG.profile,
    format: args.format ?? (fileConfig.format ? normalizeFormat(fileConfig.format) : DEFAULT_CONFIG.format),
    quality: validateQuality(args.quality ?? fileConfig.quality ?? DEFAULT_CONFIG.quality),
    maxDimension: validateMaxDimension(args.maxDimension !== undefined ? args.maxDimension : (fileConfig.maxDimension ?? DEFAULT_CONFIG.maxDimension)),
    overwrite: args.overwrite ?? fileConfig.overwrite ?? DEFAULT_CONFIG.overwrite,
    dryRun: args.dryRun ?? fileConfig.dryRun ?? DEFAULT_CONFIG.dryRun,
    json: args.json ?? fileConfig.json ?? DEFAULT_CONFIG.json,
    auto: {
      ...DEFAULT_CONFIG.auto,
      ...(fileConfig.auto ?? {}),
    },
    naming: {
      ...DEFAULT_CONFIG.naming,
      ...(fileConfig.naming ?? {}),
    },
    settings: fileConfig.settings ?? {},
  };

  if (merged.input.length === 0) {
    throw new UsageError('Provide at least one input file or glob via config.input or --input.');
  }

  if (!merged.outputDir.trim()) {
    throw new UsageError('outputDir must not be empty.');
  }

  if (!merged.profile.trim()) {
    throw new UsageError('profile must not be empty.');
  }

  return merged;
}

export function getHelpText() {
  return [
    'Usage: darkslide-convert --config darkslide.config.json',
    '',
    'Options:',
    '  -c, --config <path>          JSON config file',
    '  -i, --input <glob|file>      Input glob or file, repeatable',
    '  -o, --output <dir>           Output directory',
    '  -p, --profile <id>           Film profile id, default generic-color',
    '  -f, --format <format>        jpeg, png, webp, or tiff',
    '  -q, --quality <1-100>        JPEG/WebP/TIFF quality',
    '      --max-dimension <px>     Resize longest edge after conversion',
    '      --overwrite              Replace existing outputs',
    '      --dry-run                Print planned work without writing',
    '      --json                   Print deterministic JSON summary',
  ].join('\n');
}
