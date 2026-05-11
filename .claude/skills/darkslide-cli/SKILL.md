---
name: darkslide-cli
description: Use when the user wants to convert scanned film negatives with DarkSlide CLI (darkslide-convert) — batch conversions, dry-run planning, JSON summaries, film profile discovery, config-file workflows, JSON sidecars, color-managed output (sRGB/Display P3/Adobe RGB), or any safe automation around the darkslide-convert binary.
---

# DarkSlide CLI (Claude Code / Cowork)

DarkSlide CLI is a scriptable batch converter for scanned film negatives. The contract is deterministic: discover capabilities, plan with a dry-run JSON, then convert only after the planned outputs match user intent. This skill is tuned to Claude Code's tool surface and works as-is in Cowork.

## How to invoke the CLI

Pick the first form that applies and stick with it for the whole task:

- Inside the DarkSlide CLI repo: `npm run dev -- ...`
- After `npm run build` in the repo: `node dist/cli.js ...`
- When the package binary is installed: `darkslide-convert ...`

All three accept the same flags. Always run commands through the **Bash** tool, with quoted globs so the CLI (not the shell) resolves them.

## Claude Code workflow

Use **TodoWrite** for any job past the trivial single-file case. The canonical task list is:

1. Discover — list profiles and print default config.
2. Dry-run — plan the exact intended command with `--dry-run --json`.
3. Confirm — show the dry-run summary to the user before writing files.
4. Run — execute the same command without `--dry-run`.
5. Verify — inspect `totals` and any `error`/`warnings` in the JSON summary.

### 1. Discover (parallelise)

Run both discovery commands in a single assistant turn (two Bash calls in one message — they have no dependency):

```bash
darkslide-convert --list-profiles --json
darkslide-convert --print-default-config
```

Capture profile ids and config defaults from stdout. Do not guess profile names — read them from `--list-profiles --json`.

### 2. Dry-run before any real conversion

Build the exact command you intend to run, append `--dry-run --json`, and execute it. Parse the JSON summary from stdout. Check:

- `totals.matched` — does the input glob find the files the user expects?
- `files[].outputPath` — are output names and directory correct?
- `files[].status` — `pending` (will write), `skipped` (already exists; warn the user before suggesting `--overwrite`).
- `warnings` and per-file `error` — surface these even on dry runs.

For large stdout (hundreds of files), redirect to a temp file and use the **Read** tool to inspect ranges rather than flooding context:

```bash
darkslide-convert --input "scans/**/*.{tif,tiff,jpg,jpeg,png,webp}" \
  --output converted --profile generic-color --format jpeg --quality 92 \
  --dry-run --json > /tmp/darkslide-plan.json
```

### 3. Confirm before destructive flags

Before running with `--overwrite`, or any batch that would write more than ~20 files, summarise the dry-run plan back to the user and wait for explicit approval. If you are in plan mode, this is exactly what `ExitPlanMode` is for — propose the dry run, then the real run.

### 4. Run

Re-issue the same command with `--dry-run` removed, keeping `--json`. Exit codes:

- `0` — all files converted, skipped, or dry-run-planned without error.
- `1` — at least one file failed; inspect per-file `error` in the JSON summary.
- `2` — invalid CLI usage or invalid config; fix flags/config before retrying.

Do not retry a `2` exit code blindly — diagnose the flag or config issue first.

### 5. Verify

Parse the final JSON summary. Report `totals.done / totals.matched`, any non-empty `warnings`, and the absolute `outputDir`. If sidecars were requested, confirm `sidecarPath` is populated on completed entries.

## When to delegate

- **Explore sub-agent**: if the user points at a large or unfamiliar `scans/` tree and the right glob is unclear, dispatch an Explore agent to enumerate candidate inputs (extensions, depth, naming) before you craft the `--input` glob. Don't burn the main context on `find` output.
- **Plan agent / plan mode**: for multi-roll workflows, color-managed pipelines, or any job mixing config files with flag overrides, draft the command set in plan mode first.

## Safe defaults

- Quote globs: `"scans/**/*.{tif,tiff,jpg,jpeg,png,webp}"`.
- Default `concurrency: 1`. Raise only when the user asks for speed or the machine clearly has headroom. Final JSON ordering stays deterministic regardless.
- Never pass `--overwrite` unless the user explicitly asks. Skipped files are the default and they are safe.
- Use `--save-sidecar` when the user needs reproducibility metadata or you anticipate they'll re-run the same conversion later.
- Choose `--output-profile` deliberately: `srgb` for web, `display-p3` for modern Apple displays, `adobe-rgb` for print pipelines. Pair non-sRGB outputs with `--embed-output-profile`.

## Out of scope (do not promise)

RAW import, Tauri/GUI preset storage, broad image-metadata policy controls, and dust-removal marks are intentionally not in v1. If the user asks, say so and offer the closest supported path.

## Reference

For exact flags, config shape, JSON summary fields, and copy-paste command templates, read `../../skills/darkslide-cli/references/cli-contract.md` (the single source of truth shared with the Codex skill).

## Cowork

Cowork reads this SKILL.md verbatim — no adapter file needed. The Bash / Read / TodoWrite mapping above applies to any Cowork agent that exposes the same primitives.
