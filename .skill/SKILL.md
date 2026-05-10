---
name: darkslide-cli
description: Repo-local agent instructions for using DarkSlide CLI safely for film-negative batch conversion, dry-run planning, JSON summaries, config files, profiles, sidecars, and color-managed outputs.
---

# DarkSlide CLI Agent Skill

The canonical Codex-compatible skill lives at `skills/darkslide-cli/SKILL.md`. Use that file first when your agent supports skills with `SKILL.md` frontmatter.

## Quick Workflow

1. Use `npm run dev -- ...` inside this repo, `node dist/cli.js ...` after `npm run build`, or `darkslide-convert ...` when the package binary is installed.
2. Discover capabilities with `--list-profiles --json` and `--print-default-config`.
3. Before converting a batch, run the exact intended command with `--dry-run --json`.
4. Parse the JSON summary and inspect `totals`, `files[].status`, `files[].outputPath`, `warnings`, and `error`.
5. Run the real conversion with `--json` only after the dry run matches the user's intent.

## Safe Defaults

- Quote globs, for example `"scans/**/*.{tif,tiff,jpg,jpeg,png,webp}"`.
- Avoid `--overwrite` unless the user explicitly wants replacement.
- Use `--save-sidecar` when the user needs reproducibility metadata.
- Respect exit codes: `0` success, `1` processing failure, `2` usage/config error.
- Do not promise unsupported v1 features: RAW import, Tauri/GUI preset storage, broad metadata policy controls, or dust-removal marks.

For exact flags, config fields, JSON shape, and command templates, read `skills/darkslide-cli/references/cli-contract.md`.
