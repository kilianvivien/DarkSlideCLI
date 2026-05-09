# DarkSlide CLI

A small Node/TypeScript batch converter that reuses DarkSlide's CPU film-negative pipeline from the command line.

It is designed to be easy for AI agents to drive: give it a JSON config, use globs for inputs, and ask for JSON output.

## Install

```bash
npm install
npm run build
```

## Usage

```bash
darkslide-convert --config darkslide.config.json --json
```

During development:

```bash
npm run dev -- --input "scans/**/*.tif" --output converted --profile portra-400 --format jpeg --quality 92 --json
```

## Config

See `darkslide.config.example.json`.

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

## Agent Contract

- Exit code `0`: all matched files converted, skipped, or dry-run planned without processing errors.
- Exit code `1`: at least one file failed.
- Exit code `2`: invalid CLI usage or config.
- `--json` prints a deterministic summary with per-file status, paths, dimensions, warnings, and errors.
- `--dry-run` resolves matched files and planned output paths without writing images.

## Scope

Supported input formats are TIFF, JPEG, PNG, and WebP. Supported output formats are JPEG, PNG, WebP, and TIFF. RAW import, Tauri APIs, GUI preset storage, and dust-removal marks are intentionally out of scope for v1.
