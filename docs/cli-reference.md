# DarkSlide CLI Reference

This reference documents the current v1 command surface. It describes what exists today, not the future roadmap.

## Install And Smoke Test

Install dependencies and build the CLI:

```bash
npm install
npm run build
```

Run the built help command:

```bash
node dist/cli.js --help
```

Run a dry-run smoke test with the development runner:

```bash
npm run dev -- --input "scans/**/*.tif" --output converted --json --dry-run
```

After `npm run build`, the package exposes the `darkslide-convert` binary at `dist/cli.js`. During local development, use either `npm run dev -- ...` or `node dist/cli.js ...`.

## Command Shape

```text
Usage: darkslide-convert --config darkslide.config.json

Options:
  -c, --config <path>          JSON config file
  -i, --input <glob|file>      Input glob or file, repeatable
  -o, --output <dir>           Output directory
  -p, --profile <id>           Film profile id, default generic-color
  -f, --format <format>        jpeg, png, webp, or tiff
  -q, --quality <1-100>        JPEG/WebP/TIFF quality
      --max-dimension <px>     Resize longest edge after conversion
      --overwrite              Replace existing outputs
      --dry-run                Print planned work without writing
      --json                   Print deterministic JSON summary
      --concurrency <n>        Process up to n files at once
      --list-profiles          Print available film profiles
      --print-default-config   Print the default JSON config
```

The implementation also accepts `-h`/`--help`, `--no-overwrite`, `--maxDimension`, and positional input paths or globs. `jpg` is accepted as an alias for `jpeg`.

## Examples

Convert one file:

```bash
npm run dev -- --input scans/frame-01.tif --output converted
```

Convert one roll folder:

```bash
npm run dev -- --input "roll-01/**/*.{tif,tiff,jpg,jpeg,png,webp}" --output converted/roll-01
```

Convert multiple globs:

```bash
npm run dev -- \
  --input "roll-01/**/*.tif" \
  --input "roll-02/**/*.png" \
  --output converted
```

Plan work without writing files:

```bash
npm run dev -- --input "scans/**/*.tif" --output converted --dry-run
```

Replace existing output files:

```bash
npm run dev -- --input "scans/**/*.tif" --output converted --overwrite
```

Print a machine-readable JSON summary:

```bash
npm run dev -- --input "scans/**/*.tif" --output converted --json
```

Choose a film profile:

```bash
npm run dev -- --input "scans/**/*.tif" --output converted --profile portra-400
```

Set JPEG/WebP/TIFF quality:

```bash
npm run dev -- --input "scans/**/*.tif" --output converted --format jpeg --quality 90
```

Process up to four files at once while preserving final summary order:

```bash
npm run dev -- --input "scans/**/*.tif" --output converted --concurrency 4 --json
```

Resize the longest output edge:

```bash
npm run dev -- --input "scans/**/*.tif" --output converted --max-dimension 2400
```

Use a config file with CLI overrides:

```bash
node dist/cli.js \
  --config darkslide.config.json \
  --input "roll-02/*.tif" \
  --output converted/roll-02 \
  --profile gold-200 \
  --format webp \
  --quality 88 \
  --json
```

List available profiles:

```bash
npm run dev -- --list-profiles
```

List available profiles as JSON:

```bash
npm run dev -- --list-profiles --json
```

Print the default config:

```bash
npm run dev -- --print-default-config
```

## Supported Formats

Input files are discovered from paths or globs, filtered to supported extensions, deduplicated, converted to absolute paths, and sorted deterministically.

Supported input extensions:

- `.tif`
- `.tiff`
- `.jpg`
- `.jpeg`
- `.png`
- `.webp`

Supported output formats:

- `jpeg`, written with `.jpg`
- `png`, written with `.png`
- `webp`, written with `.webp`
- `tiff`, written with `.tiff`

## Flag Reference

`-c, --config <path>`: Loads a JSON config file. The file must contain a JSON object.

`-i, --input <glob|file>`: Adds an input glob or file path. Repeat this flag to provide multiple inputs. Positional arguments are also treated as input paths or globs.

`-o, --output <dir>`: Sets the output directory. The directory is created during real conversion runs. It is not created in dry-run mode.

`-p, --profile <id>`: Selects a film profile id. The default is `generic-color`. Unknown profiles currently fail before file processing begins.

`-f, --format <format>`: Sets the output format. Use `jpeg`, `jpg`, `png`, `webp`, or `tiff`.

`-q, --quality <1-100>`: Sets encoder quality. It is used for JPEG, WebP, and TIFF output. PNG output ignores this value.

`--max-dimension <px>`: Resizes the output so the longest edge is at most this positive integer. Images smaller than the limit are not enlarged.

`--maxDimension <px>`: Alias for `--max-dimension`.

`--overwrite`: Replaces existing output files.

`--no-overwrite`: Skips existing output files.

`--dry-run`: Resolves inputs and planned output paths without writing images.

`--json`: Prints one deterministic JSON summary object instead of human-readable lines.

`--concurrency <n>`: Processes up to this many files at once. The value must be a positive integer. The default is `1`; final summary ordering remains sorted by input path even when processing concurrently.

`--list-profiles`: Prints available film profiles and exits successfully without requiring inputs. In human mode, each line includes id, name, type, film type, category, and description. With `--json`, stdout contains a deterministic object with a `profiles` array.

`--print-default-config`: Prints the default JSON config and exits successfully without requiring inputs.

`-h, --help`: Prints help and exits successfully without requiring inputs.

## Config Reference

Start from `darkslide.config.example.json`.

```json
{
  "input": "scans/**/*.{tif,tiff,jpg,jpeg,png,webp}",
  "outputDir": "converted",
  "profile": "generic-color",
  "format": "jpeg",
  "quality": 92,
  "maxDimension": null,
  "overwrite": false,
  "concurrency": 1,
  "auto": {
    "filmBase": true,
    "flare": true,
    "exposure": false,
    "whiteBalance": false
  },
  "naming": {
    "suffix": "-positive"
  },
  "settings": {}
}
```

The published JSON Schema is [schemas/darkslide-config.schema.json](../schemas/darkslide-config.schema.json). The runtime validates the same current field set before conversion work begins.

Top-level fields:

- `input`: string or array of strings. Each value is a glob or file path.
- `outputDir`: output directory path. Defaults to `converted`.
- `profile`: film profile id. Defaults to `generic-color`.
- `format`: output format. Use `jpeg`, `jpg`, `png`, `webp`, or `tiff`.
- `quality`: encoder quality from `1` to `100`. Defaults to `92`.
- `maxDimension`: `null` or a positive number. Defaults to `null`.
- `overwrite`: boolean. When false, existing outputs become skipped results.
- `dryRun`: optional boolean. Same behavior as `--dry-run`.
- `json`: optional boolean. Same behavior as `--json`.
- `concurrency`: positive integer. Defaults to `1`.
- `auto`: optional object controlling analysis helpers.
- `naming`: optional object controlling output names.
- `settings`: optional partial conversion settings object merged over the selected profile defaults.

`auto` fields:

- `filmBase`: estimates film base when `settings.filmBaseSample` is `null`.
- `flare`: estimates flare floor from an analysis-size copy of the image.
- `exposure`: updates exposure, black point, and white point from histogram analysis.
- `whiteBalance`: updates temperature and tint when color balance can be estimated.

`naming` fields:

- `suffix`: string appended to the sanitized input filename base before the output extension. The default is `-positive`.

`settings` fields are passed to the DarkSlide-derived conversion pipeline. Common fields include:

- `exposure`, `contrast`, `saturation`, `shadowRecovery`, `midtoneContrast`, `flareCorrection`
- `temperature`, `tint`, `redBalance`, `greenBalance`, `blueBalance`
- `blackPoint`, `whitePoint`, `highlightProtection`
- `curves.rgb`, `curves.red`, `curves.green`, `curves.blue`
- `rotation`, `levelAngle`
- `crop.x`, `crop.y`, `crop.width`, `crop.height`, `crop.aspectRatio`
- `filmBaseSample.r`, `filmBaseSample.g`, `filmBaseSample.b`, or `filmBaseSample: null`
- `residualBaseCorrection`
- `blackAndWhite.enabled`, `blackAndWhite.redMix`, `blackAndWhite.greenMix`, `blackAndWhite.blueMix`, `blackAndWhite.tone`
- `sharpen.enabled`, `sharpen.radius`, `sharpen.amount`
- `noiseReduction.enabled`, `noiseReduction.luminanceStrength`
- `dustRemoval`

The current runtime accepts only known nested `settings` keys and rejects obviously invalid primitive types. Keep generated configs conservative and prefer a dry run before large jobs.

## Precedence

Effective config is built in this order:

1. Built-in defaults.
2. JSON config file values.
3. CLI flag overrides.

`input` is additive: config-file inputs are kept, then CLI and positional inputs are appended. Other CLI values override config-file values when provided.

For booleans, `--overwrite` sets `overwrite` to true and `--no-overwrite` sets it to false. `--dry-run` and `--json` set their fields to true; there is no current CLI flag to force either back to false when a config file sets it to true.

Concurrent and sequential runs produce the same final result ordering. Failures are captured per file and do not stop unrelated files.

## Output Names

For each matched input, the CLI:

1. Sanitizes the input filename base.
2. Appends `naming.suffix`.
3. Adds the extension for the selected output format.
4. Places the file in `outputDir`.

For example, `scans/frame-01.tif` with the default suffix and JPEG output becomes `converted/frame-01-positive.jpg`.

## JSON Output

With `--json`, stdout contains a single summary object.

```json
{
  "dryRun": false,
  "profile": "generic-color",
  "format": "jpeg",
  "outputDir": "/absolute/path/converted",
  "totals": {
    "matched": 1,
    "done": 1,
    "skipped": 0,
    "failed": 0
  },
  "files": [
    {
      "inputPath": "/absolute/path/scans/frame-01.tif",
      "outputPath": "/absolute/path/converted/frame-01-positive.jpg",
      "status": "done",
      "width": 4000,
      "height": 6000,
      "outputWidth": 4000,
      "outputHeight": 6000,
      "profile": "generic-color",
      "warnings": []
    }
  ]
}
```

Top-level fields:

- `dryRun`: whether the run planned work without writing outputs.
- `profile`: resolved profile id used by the run.
- `format`: resolved output format.
- `outputDir`: absolute output directory.
- `totals.matched`: number of supported files matched after filtering and sorting.
- `totals.done`: number of successfully written files.
- `totals.skipped`: number of skipped existing outputs plus dry-run pending files.
- `totals.failed`: number of files that failed during conversion.
- `files`: deterministic per-file results in sorted input order.

Per-file fields:

- `inputPath`: absolute input file path.
- `outputPath`: absolute planned or written output file path.
- `status`: `pending`, `done`, `skipped`, or `error`.
- `width`: decoded input width for completed files, otherwise `null`.
- `height`: decoded input height for completed files, otherwise `null`.
- `outputWidth`: encoded output width for completed files, otherwise `null`.
- `outputHeight`: encoded output height for completed files, otherwise `null`.
- `profile`: resolved profile id.
- `warnings`: array of human-readable warning strings.
- `error`: present only for `error` results.

Status meanings:

- `pending`: dry-run planned output; no image was written.
- `done`: conversion succeeded and output was written.
- `skipped`: output already existed and `overwrite` was false.
- `error`: conversion failed for this file.

Done result:

```json
{
  "inputPath": "/absolute/path/scans/frame-01.tif",
  "outputPath": "/absolute/path/converted/frame-01-positive.jpg",
  "status": "done",
  "width": 4000,
  "height": 6000,
  "outputWidth": 2400,
  "outputHeight": 3600,
  "profile": "generic-color",
  "warnings": []
}
```

Skipped result:

```json
{
  "inputPath": "/absolute/path/scans/frame-02.tif",
  "outputPath": "/absolute/path/converted/frame-02-positive.jpg",
  "status": "skipped",
  "width": null,
  "height": null,
  "outputWidth": null,
  "outputHeight": null,
  "profile": "generic-color",
  "warnings": ["Output exists; pass --overwrite to replace it."]
}
```

Pending dry-run result:

```json
{
  "inputPath": "/absolute/path/scans/frame-03.tif",
  "outputPath": "/absolute/path/converted/frame-03-positive.jpg",
  "status": "pending",
  "width": null,
  "height": null,
  "outputWidth": null,
  "outputHeight": null,
  "profile": "generic-color",
  "warnings": []
}
```

Error result:

```json
{
  "inputPath": "/absolute/path/scans/broken.tif",
  "outputPath": "/absolute/path/converted/broken-positive.jpg",
  "status": "error",
  "width": null,
  "height": null,
  "outputWidth": null,
  "outputHeight": null,
  "profile": "generic-color",
  "warnings": [],
  "error": "Input file contains unsupported image data."
}
```

## Profile Listing JSON

`--list-profiles --json` prints:

```json
{
  "profiles": [
    {
      "id": "generic-color",
      "name": "Generic Color",
      "type": "color",
      "filmType": "negative",
      "category": "Generic",
      "description": "Balanced color-negative starting point for most consumer scans."
    }
  ]
}
```

## Human Output

Without `--json`, stdout starts with a one-line summary and then one line per file:

```text
DarkSlide CLI: 3 matched, 2 converted, 1 skipped, 0 failed
done    /absolute/input-01.tif -> /absolute/output/input-01-positive.jpg
skip    /absolute/input-02.tif -> /absolute/output/input-02-positive.jpg
pending /absolute/input-03.tif -> /absolute/output/input-03-positive.jpg
```

## Exit Codes

- `0`: all matched files converted, skipped, or dry-run planned without processing errors.
- `1`: at least one file failed during conversion, or an unexpected process-level error occurred.
- `2`: invalid CLI usage or config.

## Current Boundaries

The current CLI supports TIFF, JPEG, PNG, and WebP input. Before full decode, it rejects files over the current file-size limit and images whose dimensions or pixel counts exceed the vendored DarkSlide safety limits. RAW import, sidecars, metadata embedding, and advanced color-profile controls are roadmap items and are not part of the current command surface.

Image-quality regression coverage and the manual comparison workflow are documented in [image-quality-baseline.md](image-quality-baseline.md).
