import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { UsageError } from './errors.js';
import { FILM_PROFILES } from './vendor/constants.js';
import type { CliConfig, CliOutputFormat, ParsedArgs } from './types.js';
import type { ColorProfileId, ConversionSettings } from './vendor/types.js';

const OUTPUT_FORMATS = new Set<CliOutputFormat>(['jpeg', 'png', 'webp', 'tiff']);
const COLOR_PROFILE_IDS = new Set<ColorProfileId>(['srgb', 'display-p3', 'adobe-rgb']);
const PROFILE_IDS = new Set(FILM_PROFILES.map((profile) => profile.id));
const TOP_LEVEL_CONFIG_FIELDS = new Set([
  'input',
  'outputDir',
  'profile',
  'format',
  'quality',
  'maxDimension',
  'overwrite',
  'dryRun',
  'json',
  'concurrency',
  'saveSidecar',
  'colorManagement',
  'auto',
  'naming',
  'settings',
]);
const AUTO_FIELDS = new Set(['filmBase', 'flare', 'exposure', 'whiteBalance']);
const COLOR_MANAGEMENT_FIELDS = new Set(['inputProfileId', 'outputProfileId', 'embedOutputProfile']);
const NAMING_FIELDS = new Set(['suffix']);
const SETTINGS_FIELDS = new Set([
  'exposure',
  'contrast',
  'saturation',
  'shadowRecovery',
  'midtoneContrast',
  'flareCorrection',
  'temperature',
  'tint',
  'redBalance',
  'greenBalance',
  'blueBalance',
  'blackPoint',
  'whitePoint',
  'highlightProtection',
  'curves',
  'rotation',
  'levelAngle',
  'crop',
  'filmBaseSample',
  'residualBaseCorrection',
  'blackAndWhite',
  'sharpen',
  'noiseReduction',
  'dustRemoval',
]);
const CURVES_FIELDS = new Set(['rgb', 'red', 'green', 'blue']);
const CURVE_POINT_FIELDS = new Set(['x', 'y']);
const CROP_FIELDS = new Set(['x', 'y', 'width', 'height', 'aspectRatio']);
const FILM_BASE_SAMPLE_FIELDS = new Set(['r', 'g', 'b']);
const BLACK_AND_WHITE_FIELDS = new Set(['enabled', 'redMix', 'greenMix', 'blueMix', 'tone']);
const SHARPEN_FIELDS = new Set(['enabled', 'radius', 'amount']);
const NOISE_REDUCTION_FIELDS = new Set(['enabled', 'luminanceStrength']);
const DUST_REMOVAL_FIELDS = new Set(['autoEnabled', 'autoDetectMode', 'autoSensitivity', 'autoMaxRadius', 'manualBrushRadius', 'marks']);

export const DEFAULT_CONFIG: CliConfig = {
  input: [],
  outputDir: 'converted',
  profile: 'generic-color',
  format: 'jpeg',
  quality: 92,
  maxDimension: null,
  overwrite: false,
  dryRun: false,
  json: false,
  concurrency: 1,
  saveSidecar: false,
  colorManagement: {
    inputProfileId: 'srgb',
    outputProfileId: 'srgb',
    embedOutputProfile: true,
  },
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

function parseInteger(value: string, flag: string) {
  const parsed = parseNumber(value, flag);
  if (!Number.isInteger(parsed)) {
    throw new UsageError(`${flag} must be an integer.`);
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
      parsed.quality = parseInteger(readFlagValue(argv, index, arg), arg);
      index += 1;
    } else if (arg === '--max-dimension' || arg === '--maxDimension') {
      parsed.maxDimension = parseInteger(readFlagValue(argv, index, arg), arg);
      index += 1;
    } else if (arg === '--overwrite') {
      parsed.overwrite = true;
    } else if (arg === '--no-overwrite') {
      parsed.overwrite = false;
    } else if (arg === '--dry-run') {
      parsed.dryRun = true;
    } else if (arg === '--json') {
      parsed.json = true;
    } else if (arg === '--concurrency') {
      parsed.concurrency = parseInteger(readFlagValue(argv, index, arg), arg);
      index += 1;
    } else if (arg === '--save-sidecar') {
      parsed.saveSidecar = true;
    } else if (arg === '--no-sidecar') {
      parsed.saveSidecar = false;
    } else if (arg === '--input-profile') {
      parsed.inputProfileId = validateColorProfileId(readFlagValue(argv, index, arg), 'inputProfileId');
      index += 1;
    } else if (arg === '--output-profile') {
      parsed.outputProfileId = validateColorProfileId(readFlagValue(argv, index, arg), 'outputProfileId');
      index += 1;
    } else if (arg === '--embed-output-profile') {
      parsed.embedOutputProfile = true;
    } else if (arg === '--no-embed-output-profile') {
      parsed.embedOutputProfile = false;
    } else if (arg === '--list-profiles') {
      parsed.listProfiles = true;
    } else if (arg === '--print-default-config') {
      parsed.printDefaultConfig = true;
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
  if (!Number.isInteger(quality) || quality < 1 || quality > 100) {
    throw new UsageError('quality must be an integer between 1 and 100.');
  }
  return quality;
}

function validateMaxDimension(maxDimension: number | null) {
  if (maxDimension === null) {
    return null;
  }
  if (!Number.isInteger(maxDimension) || maxDimension < 1) {
    throw new UsageError('maxDimension must be null or a positive integer.');
  }
  return maxDimension;
}

function validateConcurrency(concurrency: number) {
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new UsageError('concurrency must be a positive integer.');
  }
  return concurrency;
}

function validateColorProfileId(value: unknown, label: string): ColorProfileId {
  if (typeof value !== 'string' || !COLOR_PROFILE_IDS.has(value as ColorProfileId)) {
    throw new UsageError(`${label} must be srgb, display-p3, or adobe-rgb.`);
  }
  return value as ColorProfileId;
}

function assertPlainObject(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new UsageError(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function assertNoUnknownKeys(value: Record<string, unknown>, allowed: Set<string>, label: string) {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      throw new UsageError(`Unknown ${label} field "${key}".`);
    }
  }
}

function assertBoolean(value: unknown, label: string) {
  if (typeof value !== 'boolean') {
    throw new UsageError(`${label} must be a boolean.`);
  }
}

function assertString(value: unknown, label: string) {
  if (typeof value !== 'string') {
    throw new UsageError(`${label} must be a string.`);
  }
}

function assertNonEmptyString(value: unknown, label: string) {
  if (typeof value !== 'string') {
    throw new UsageError(`${label} must be a string.`);
  }
  if (!value.trim()) {
    throw new UsageError(`${label} must not be empty.`);
  }
}

function assertNumber(value: unknown, label: string) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new UsageError(`${label} must be a finite number.`);
  }
}

function assertNullableNumber(value: unknown, label: string) {
  if (value !== null) {
    assertNumber(value, label);
  }
}

function validateInputValue(value: unknown) {
  if (typeof value === 'string') {
    if (!value.trim()) {
      throw new UsageError('input must not be empty.');
    }
    return;
  }

  if (!Array.isArray(value) || value.length === 0) {
    throw new UsageError('input must be a non-empty string or non-empty string array.');
  }

  value.forEach((item, index) => assertNonEmptyString(item, `input[${index}]`));
}

function validateAutoConfig(value: unknown) {
  const auto = assertPlainObject(value, 'auto');
  assertNoUnknownKeys(auto, AUTO_FIELDS, 'auto');
  for (const [key, candidate] of Object.entries(auto)) {
    assertBoolean(candidate, `auto.${key}`);
  }
}

function validateColorManagementConfig(value: unknown) {
  const colorManagement = assertPlainObject(value, 'colorManagement');
  assertNoUnknownKeys(colorManagement, COLOR_MANAGEMENT_FIELDS, 'colorManagement');
  if ('inputProfileId' in colorManagement) {
    validateColorProfileId(colorManagement.inputProfileId, 'colorManagement.inputProfileId');
  }
  if ('outputProfileId' in colorManagement) {
    validateColorProfileId(colorManagement.outputProfileId, 'colorManagement.outputProfileId');
  }
  if ('embedOutputProfile' in colorManagement) {
    assertBoolean(colorManagement.embedOutputProfile, 'colorManagement.embedOutputProfile');
  }
}

function validateNamingConfig(value: unknown) {
  const naming = assertPlainObject(value, 'naming');
  assertNoUnknownKeys(naming, NAMING_FIELDS, 'naming');
  if ('suffix' in naming) {
    assertString(naming.suffix, 'naming.suffix');
  }
}

function validateCurvePoint(value: unknown, label: string) {
  const point = assertPlainObject(value, label);
  assertNoUnknownKeys(point, CURVE_POINT_FIELDS, label);
  assertNumber(point.x, `${label}.x`);
  assertNumber(point.y, `${label}.y`);
}

function validateCurves(value: unknown, label: string) {
  const curves = assertPlainObject(value, label);
  assertNoUnknownKeys(curves, CURVES_FIELDS, label);
  for (const [channel, points] of Object.entries(curves)) {
    if (!Array.isArray(points)) {
      throw new UsageError(`${label}.${channel} must be an array.`);
    }
    points.forEach((point, index) => validateCurvePoint(point, `${label}.${channel}[${index}]`));
  }
}

function validateNumberObject(value: unknown, allowed: Set<string>, label: string, nullableFields = new Set<string>()) {
  const object = assertPlainObject(value, label);
  assertNoUnknownKeys(object, allowed, label);
  for (const [key, candidate] of Object.entries(object)) {
    if (nullableFields.has(key)) {
      assertNullableNumber(candidate, `${label}.${key}`);
    } else {
      assertNumber(candidate, `${label}.${key}`);
    }
  }
}

function validateBooleanNumberObject(value: unknown, allowed: Set<string>, booleanFields: Set<string>, label: string) {
  const object = assertPlainObject(value, label);
  assertNoUnknownKeys(object, allowed, label);
  for (const [key, candidate] of Object.entries(object)) {
    if (booleanFields.has(key)) {
      assertBoolean(candidate, `${label}.${key}`);
    } else {
      assertNumber(candidate, `${label}.${key}`);
    }
  }
}

function validateSettings(value: unknown) {
  const settings = assertPlainObject(value, 'settings');
  assertNoUnknownKeys(settings, SETTINGS_FIELDS, 'settings');

  for (const [key, candidate] of Object.entries(settings)) {
    switch (key) {
      case 'curves':
        validateCurves(candidate, 'settings.curves');
        break;
      case 'crop':
        validateNumberObject(candidate, CROP_FIELDS, 'settings.crop', new Set(['aspectRatio']));
        break;
      case 'filmBaseSample':
        if (candidate !== null) {
          validateNumberObject(candidate, FILM_BASE_SAMPLE_FIELDS, 'settings.filmBaseSample');
        }
        break;
      case 'residualBaseCorrection':
        assertBoolean(candidate, 'settings.residualBaseCorrection');
        break;
      case 'blackAndWhite':
        validateBooleanNumberObject(candidate, BLACK_AND_WHITE_FIELDS, new Set(['enabled']), 'settings.blackAndWhite');
        break;
      case 'sharpen':
        validateBooleanNumberObject(candidate, SHARPEN_FIELDS, new Set(['enabled']), 'settings.sharpen');
        break;
      case 'noiseReduction':
        validateBooleanNumberObject(candidate, NOISE_REDUCTION_FIELDS, new Set(['enabled']), 'settings.noiseReduction');
        break;
      case 'dustRemoval':
        validateDustRemoval(candidate);
        break;
      default:
        assertNumber(candidate, `settings.${key}`);
        break;
    }
  }
}

function validateDustRemoval(value: unknown) {
  const dustRemoval = assertPlainObject(value, 'settings.dustRemoval');
  assertNoUnknownKeys(dustRemoval, DUST_REMOVAL_FIELDS, 'settings.dustRemoval');
  for (const [key, candidate] of Object.entries(dustRemoval)) {
    if (key === 'autoEnabled') {
      assertBoolean(candidate, `settings.dustRemoval.${key}`);
    } else if (key === 'autoDetectMode') {
      if (candidate !== 'spots' && candidate !== 'scratches' && candidate !== 'both') {
        throw new UsageError('settings.dustRemoval.autoDetectMode must be spots, scratches, or both.');
      }
    } else if (key === 'marks') {
      if (!Array.isArray(candidate)) {
        throw new UsageError('settings.dustRemoval.marks must be an array.');
      }
    } else {
      assertNumber(candidate, `settings.dustRemoval.${key}`);
    }
  }
}

function validateConfigFileShape(config: RawConfig) {
  const object = assertPlainObject(config, 'Config file') as RawConfig & Record<string, unknown>;
  assertNoUnknownKeys(object, TOP_LEVEL_CONFIG_FIELDS, 'config');

  if ('input' in object) {
    validateInputValue(object.input);
  }
  if ('outputDir' in object) {
    assertNonEmptyString(object.outputDir, 'outputDir');
  }
  if ('profile' in object) {
    assertNonEmptyString(object.profile, 'profile');
  }
  if ('format' in object) {
    assertString(object.format, 'format');
    normalizeFormat(String(object.format));
  }
  if ('quality' in object) {
    if (typeof object.quality !== 'number') {
      throw new UsageError('quality must be a number.');
    }
    validateQuality(object.quality);
  }
  if ('maxDimension' in object) {
    if (object.maxDimension !== null && typeof object.maxDimension !== 'number') {
      throw new UsageError('maxDimension must be null or a positive integer.');
    }
    validateMaxDimension(object.maxDimension as number | null);
  }
  for (const field of ['overwrite', 'dryRun', 'json', 'saveSidecar']) {
    if (field in object) {
      assertBoolean(object[field], field);
    }
  }
  if ('concurrency' in object) {
    if (typeof object.concurrency !== 'number') {
      throw new UsageError('concurrency must be a positive integer.');
    }
    validateConcurrency(object.concurrency);
  }
  if ('auto' in object) {
    validateAutoConfig(object.auto);
  }
  if ('colorManagement' in object) {
    validateColorManagementConfig(object.colorManagement);
  }
  if ('naming' in object) {
    validateNamingConfig(object.naming);
  }
  if ('settings' in object) {
    validateSettings(object.settings);
  }
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

  const config = assertPlainObject(parsed, 'Config file') as RawConfig;
  validateConfigFileShape(config);
  return config;
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
    concurrency: validateConcurrency(args.concurrency ?? fileConfig.concurrency ?? DEFAULT_CONFIG.concurrency),
    saveSidecar: args.saveSidecar ?? fileConfig.saveSidecar ?? DEFAULT_CONFIG.saveSidecar,
    colorManagement: {
      ...DEFAULT_CONFIG.colorManagement,
      ...(fileConfig.colorManagement ?? {}),
      ...(args.inputProfileId ? { inputProfileId: args.inputProfileId } : {}),
      ...(args.outputProfileId ? { outputProfileId: args.outputProfileId } : {}),
      ...(args.embedOutputProfile !== undefined ? { embedOutputProfile: args.embedOutputProfile } : {}),
    },
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

  if (!PROFILE_IDS.has(merged.profile)) {
    const available = [...PROFILE_IDS].sort().join(', ');
    throw new UsageError(`Unknown profile "${merged.profile}". Available profiles: ${available}`);
  }

  return merged;
}

export function getDefaultConfig(): CliConfig {
  return structuredClone(DEFAULT_CONFIG);
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
    '      --concurrency <n>        Process up to n files at once',
    '      --save-sidecar           Write JSON sidecars next to outputs',
    '      --no-sidecar             Disable JSON sidecar writing',
    '      --input-profile <id>     srgb, display-p3, or adobe-rgb',
    '      --output-profile <id>    srgb, display-p3, or adobe-rgb',
    '      --embed-output-profile   Embed output ICC profile metadata',
    '      --no-embed-output-profile  Do not embed output ICC profile metadata',
    '      --list-profiles          Print available film profiles',
    '      --print-default-config   Print the default JSON config',
  ].join('\n');
}
