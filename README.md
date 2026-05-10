# DarkSlide CLI

DarkSlide CLI is a Node/TypeScript batch converter for scanned film negatives. It reuses the CPU film conversion pipeline from the DarkSlide app and wraps it in a small command-line interface that is friendly to scripts, build systems, and AI agents.

The project is designed around a simple contract: provide image paths or globs, choose a film profile and output format, then receive either readable terminal output or a deterministic JSON summary.

## Features

- Batch conversion for scanned film negatives.
- DarkSlide-derived film profiles and CPU image pipeline.
- Config-file driven workflow with command-line overrides and a published JSON Schema.
- Deterministic JSON summaries for automation.
- Dry-run mode for planning output paths without writing images.
- Auto film-base and flare estimation, with optional exposure and white-balance analysis.
- Deterministic concurrent batch processing with stable result ordering.
- Optional JSON sidecars for reproducible conversions.
- Color management for `srgb`, `display-p3`, and `adobe-rgb`, with optional output ICC embedding.
- JPEG, PNG, WebP, and TIFF output through `sharp`.
- Safety guards for file size, image dimensions, and total pixel count.
- Testable TypeScript API for direct processor use.

## Supported Formats

Input formats:

- TIFF: `.tif`, `.tiff`
- JPEG: `.jpg`, `.jpeg`
- PNG: `.png`
- WebP: `.webp`

Output formats:

- `jpeg`
- `png`
- `webp`
- `tiff`

RAW import, Tauri APIs, GUI preset storage, broad image metadata policy controls, and dust-removal marks are intentionally out of scope for the current v1 CLI.

## Install

```bash
npm install
npm run build
```

The package exposes the `darkslide-convert` binary from `dist/cli.js` after build.

## Quick Start

Convert a folder of scans using the development runner:

```bash
npm run dev -- \
  --input "scans/**/*.{tif,tiff,jpg,jpeg,png,webp}" \
  --output converted \
  --profile generic-color \
  --format jpeg \
  --quality 92
```

Plan a conversion without writing files:

```bash
npm run dev -- \
  --input "roll-01/*.tif" \
  --output converted \
  --profile portra-400 \
  --dry-run \
  --json
```

Run the built CLI:

```bash
node dist/cli.js --config darkslide.config.json --json
```

If installed as a package binary, use:

```bash
darkslide-convert --config darkslide.config.json --json
```

## Configuration

Start from `darkslide.config.example.json`:

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
  "saveSidecar": false,
  "colorManagement": {
    "inputProfileId": "srgb",
    "outputProfileId": "srgb",
    "embedOutputProfile": true
  },
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

Flags override config values:

```bash
darkslide-convert \
  --config darkslide.config.json \
  --input "roll-01/*.tif" \
  --output converted \
  --profile gold-200 \
  --format webp \
  --quality 90 \
  --max-dimension 2400 \
  --overwrite \
  --json
```

List available film profiles:

```bash
darkslide-convert --list-profiles --json
```

Write reproducibility sidecars and convert to Display P3:

```bash
darkslide-convert \
  --input "roll-01/*.tif" \
  --output converted \
  --save-sidecar \
  --output-profile display-p3 \
  --embed-output-profile \
  --json
```

## CLI Options

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
      --save-sidecar           Write JSON sidecars next to outputs
      --no-sidecar             Disable JSON sidecar writing
      --input-profile <id>     srgb, display-p3, or adobe-rgb
      --output-profile <id>    srgb, display-p3, or adobe-rgb
      --embed-output-profile   Embed output ICC profile metadata
      --no-embed-output-profile  Do not embed output ICC profile metadata
      --list-profiles          Print available film profiles
      --print-default-config   Print the default JSON config
```

See [docs/cli-reference.md](docs/cli-reference.md) for every current flag, config field, output field, and smoke-test example.

## JSON Output Contract

`--json` prints a single summary object:

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

Exit codes:

- `0`: all matched files converted, skipped, or dry-run planned without processing errors.
- `1`: at least one file failed.
- `2`: invalid CLI usage or config.

For AI agents, prefer `--dry-run --json` before large conversion jobs. It confirms input matching, output naming, skip behavior, and config validity without writing images.

The config schema is published at [schemas/darkslide-config.schema.json](schemas/darkslide-config.schema.json). Available profiles can be inspected with `darkslide-convert --list-profiles --json`, and the built-in defaults can be printed with `darkslide-convert --print-default-config`.

Batch conversion defaults to `concurrency: 1`. Higher concurrency preserves final JSON ordering and keeps per-file errors in the summary.

Set `saveSidecar: true` or pass `--save-sidecar` to write a JSON sidecar beside each completed output. Dry runs include planned `sidecarPath` values without writing sidecar files.

Set `colorManagement.outputProfileId` or pass `--output-profile` to choose `srgb`, `display-p3`, or `adobe-rgb`; summaries and sidecars report the effective color-management settings.

Sidecars include generator/version, source and output paths, dimensions, profile details, effective settings, auto-analysis warnings, output options, and color-management settings.

## Development

Run the standard checks:

```bash
npm test
npm run typecheck
npm run build
```

Useful development commands:

```bash
npm run dev -- --help
npm run dev -- --input "scans/*.tif" --output converted --dry-run --json
```

Project layout:

- `src/cli.ts`: executable entry point, output formatting, and exit codes.
- `src/config.ts`: argument parsing, config loading, defaults, profile/default config printing, and validation.
- `src/files.ts`: glob expansion, output paths, and overwrite checks.
- `src/processor.ts`: safety guards, decode, auto analysis, color-managed conversion, encode, sidecars, concurrency, and batch summaries.
- `src/vendor/*`: DarkSlide-derived profiles, types, and image pipeline utilities.

Release readiness is tracked in [docs/release-checklist.md](docs/release-checklist.md). The package is intentionally private until distribution policy, package contents, CI, and release support are settled.

Image-quality regression coverage is documented in [docs/image-quality-baseline.md](docs/image-quality-baseline.md).

The longer implementation tracker is [taking-darkslide-cli-further.md](taking-darkslide-cli-further.md).

## Roadmap

Completed milestones include documentation, config schema validation, profile listing, deterministic synthetic image-quality tests, concurrency, JSON sidecars, and color management.

Next priorities are RAW workflow design, a dedicated JSON summary schema or snapshot contract suite, CI/package smoke tests, distribution policy, changelog/release notes, and DarkSlide preset interop. RAW import should remain separate from the stable TIFF/JPEG/PNG/WebP conversion path until decoder behavior is well tested.
