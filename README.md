# DarkSlide CLI

DarkSlide CLI is a Node/TypeScript batch converter for scanned film negatives. It reuses the CPU film conversion pipeline from the DarkSlide app and wraps it in a small command-line interface that is friendly to scripts, build systems, and AI agents.

The project is designed around a simple contract: provide image paths or globs, choose a film profile and output format, then receive either readable terminal output or a deterministic JSON summary.

## Features

- Batch conversion for scanned film negatives.
- DarkSlide-derived film profiles and CPU image pipeline.
- Config-file driven workflow with command-line overrides.
- Deterministic JSON summaries for automation.
- Dry-run mode for planning output paths without writing images.
- Auto film-base and flare estimation, with optional exposure and white-balance analysis.
- JPEG, PNG, WebP, and TIFF output through `sharp`.
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

RAW import, Tauri APIs, GUI preset storage, and dust-removal marks are intentionally out of scope for the current v1 CLI.

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
```

## JSON Output Contract

`--json` prints a single summary object:

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

Exit codes:

- `0`: all matched files converted, skipped, or dry-run planned without processing errors.
- `1`: at least one file failed.
- `2`: invalid CLI usage or config.

For AI agents, prefer `--dry-run --json` before large conversion jobs. It confirms input matching, output naming, skip behavior, and config validity without writing images.

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
- `src/config.ts`: argument parsing, config loading, defaults, and validation.
- `src/files.ts`: glob expansion, output paths, and overwrite checks.
- `src/processor.ts`: decode, auto analysis, conversion, encode, and batch summaries.
- `src/vendor/*`: DarkSlide-derived profiles, types, and image pipeline utilities.

## Roadmap

Near-term priorities are config schema validation, profile listing, JSON summary contract tests, deterministic image-quality fixtures, release packaging, and CI. RAW import, sidecars, richer color management, and concurrent batch processing should be added as separate milestones after the current CLI contract is protected by tests.
