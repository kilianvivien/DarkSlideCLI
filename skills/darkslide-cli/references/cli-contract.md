# DarkSlide CLI Contract

This reference records the v1 command surface agents should rely on.

## Command Forms

- Repo development: `npm run dev -- ...`
- Built local CLI: `node dist/cli.js ...`
- Installed package binary: `darkslide-convert ...`

Build first when using `node dist/cli.js`:

```bash
npm run build
```

## Discovery Commands

List profile ids as machine-readable JSON:

```bash
npm run dev -- --list-profiles --json
```

Print the default config:

```bash
npm run dev -- --print-default-config
```

Show help:

```bash
npm run dev -- --help
```

## Supported Formats

Input extensions:

- `.tif`
- `.tiff`
- `.jpg`
- `.jpeg`
- `.png`
- `.webp`

Output formats:

- `jpeg`, written as `.jpg`
- `png`, written as `.png`
- `webp`, written as `.webp`
- `tiff`, written as `.tiff`

`jpg` is accepted as an alias for `jpeg`.

## Important Flags

- `--config <path>`: load a JSON config file.
- `--input <glob|file>`: add an input path or glob. Repeatable. Positional paths are also accepted.
- `--output <dir>`: set output directory.
- `--profile <id>`: set film profile id. Use `--list-profiles --json` to discover valid ids.
- `--format <format>`: choose `jpeg`, `jpg`, `png`, `webp`, or `tiff`.
- `--quality <1-100>`: encoder quality for JPEG, WebP, and TIFF. PNG ignores it.
- `--max-dimension <px>` or `--maxDimension <px>`: cap the longest edge after conversion.
- `--overwrite` / `--no-overwrite`: replace or skip existing outputs.
- `--dry-run`: resolve inputs and planned outputs without writing images.
- `--json`: print one deterministic JSON summary.
- `--concurrency <n>`: process up to `n` files at once while keeping final summary order stable.
- `--save-sidecar` / `--no-sidecar`: enable or disable JSON sidecars beside completed outputs.
- `--input-profile <id>`: choose `srgb`, `display-p3`, or `adobe-rgb`.
- `--output-profile <id>`: choose `srgb`, `display-p3`, or `adobe-rgb`.
- `--embed-output-profile` / `--no-embed-output-profile`: control embedded ICC metadata.

## Config Shape

Start from `darkslide.config.example.json` or `--print-default-config`.

Core fields:

- `input`: string or string array of input paths/globs.
- `outputDir`: output directory.
- `profile`: film profile id.
- `format`: `jpeg`, `png`, `webp`, or `tiff`.
- `quality`: integer from 1 to 100.
- `maxDimension`: positive integer or `null`.
- `overwrite`: boolean.
- `dryRun`: boolean.
- `json`: boolean.
- `concurrency`: positive integer.
- `saveSidecar`: boolean.
- `colorManagement.inputProfileId`: `srgb`, `display-p3`, or `adobe-rgb`.
- `colorManagement.outputProfileId`: `srgb`, `display-p3`, or `adobe-rgb`.
- `colorManagement.embedOutputProfile`: boolean.
- `auto.filmBase`, `auto.flare`, `auto.exposure`, `auto.whiteBalance`: booleans.
- `naming.suffix`: output filename suffix, default `-positive`.
- `settings`: DarkSlide conversion setting overrides.

The published JSON Schema is `schemas/darkslide-config.schema.json`.

## JSON Summary

With `--json`, stdout is one object:

```json
{
  "dryRun": false,
  "profile": "generic-color",
  "format": "jpeg",
  "colorManagement": {
    "inputProfileId": "srgb",
    "outputProfileId": "srgb",
    "embedOutputProfile": true
  },
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
      "sidecarPath": "/absolute/path/converted/frame-01-positive.jpg.json",
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

File `status` is one of `pending`, `done`, `skipped`, or `error`. Dry runs use planned file entries without writing images.

## Exit Codes

- `0`: all matched files converted, skipped, or dry-run planned without processing errors.
- `1`: at least one file failed during processing.
- `2`: invalid CLI usage or invalid config.

## Safe Agent Templates

Plan a batch:

```bash
npm run dev -- --input "roll-01/**/*.{tif,tiff,jpg,jpeg,png,webp}" --output converted/roll-01 --profile generic-color --format jpeg --quality 92 --dry-run --json
```

Run the planned batch:

```bash
npm run dev -- --input "roll-01/**/*.{tif,tiff,jpg,jpeg,png,webp}" --output converted/roll-01 --profile generic-color --format jpeg --quality 92 --json
```

Use Display P3 output with ICC embedding:

```bash
darkslide-convert --input "roll-01/*.tif" --output converted --output-profile display-p3 --embed-output-profile --json
```

Generate reproducibility sidecars:

```bash
darkslide-convert --input "roll-01/*.tif" --output converted --save-sidecar --json
```

## V1 Boundaries

Do not claim support for RAW import, Tauri APIs, GUI preset storage, broad image metadata policy controls, or dust-removal marks in this CLI version.
