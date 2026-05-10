---
name: darkslide-cli
description: Use this skill when an agent needs to use DarkSlide CLI or darkslide-convert for scanned film-negative conversion, batch image conversion, dry-run planning, deterministic JSON summaries, film profile discovery, config-file workflows, sidecar generation, output color profiles, or safe automation around the DarkSlide command-line tool.
---

# DarkSlide CLI

Use DarkSlide CLI as a scriptable batch converter for scanned film negatives. The core agent pattern is: discover capabilities, plan with JSON dry runs, then convert only after the output paths and counts look right.

## Workflow

1. Confirm the available command form:
   - Inside this repo, prefer `npm run dev -- ...`.
   - After `npm run build`, use `node dist/cli.js ...`.
   - When installed as a package, use `darkslide-convert ...`.
2. Discover runtime options before making assumptions:
   - Run `--list-profiles --json` to inspect film profile ids.
   - Run `--print-default-config` to inspect default config values.
3. Before real batch jobs, run the exact intended input/output/profile/format command with `--dry-run --json`.
4. Parse the JSON summary instead of scraping human output. Check `totals.matched`, planned `outputPath` values, `status`, `warnings`, and `error`.
5. Run the real conversion only when the dry run matches the user's intent. Use `--json` for automation-friendly results.

## Command Patterns

Use quoted globs so the CLI, not the shell, resolves them:

```bash
npm run dev -- --input "scans/**/*.{tif,tiff,jpg,jpeg,png,webp}" --output converted --profile generic-color --format jpeg --quality 92 --dry-run --json
```

Use config files for repeatable jobs, and command-line flags for overrides:

```bash
darkslide-convert --config darkslide.config.json --input "roll-01/*.tif" --output converted/roll-01 --json
```

Use sidecars when the user needs reproducibility metadata:

```bash
darkslide-convert --input "roll-01/*.tif" --output converted --save-sidecar --json
```

Use `--overwrite` only when the user explicitly wants existing outputs replaced. Otherwise existing outputs are skipped.

## Automation Rules

- Treat exit code `0` as success, including dry runs and skipped files.
- Treat exit code `1` as a processing failure; inspect per-file `error` fields in the JSON summary when present.
- Treat exit code `2` as invalid usage or invalid config; fix flags/config before retrying.
- Keep `concurrency` conservative unless the user asks for speed or the machine has enough CPU/memory headroom. Final JSON ordering remains deterministic.
- Do not promise unsupported v1 features: RAW import, Tauri/GUI preset storage, broad metadata policy controls, or dust-removal marks.

## Reference

Read `references/cli-contract.md` when you need exact supported formats, flag/config details, JSON fields, or safe command templates.
