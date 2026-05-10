# Taking DarkSlide CLI Further

## Executive Review

DarkSlide CLI is already a useful v1 batch converter for film-negative workflows. It has a small, understandable TypeScript surface, reuses DarkSlide's CPU conversion pipeline, and exposes an automation-friendly command shape: JSON config in, deterministic per-file summary out.

The strongest parts of the current project are:

- A clear CLI lifecycle in `src/cli.ts`, including human output, JSON output, and distinct exit codes.
- Deterministic input expansion and output naming through `src/files.ts`.
- A simple JSON config format with command-line overrides in `src/config.ts`.
- A processor API that can be tested directly through `processRawImage`, `processImageFile`, and `runConversion`.
- Reuse of DarkSlide film profiles, tone handling, auto analysis helpers, flare estimation, film-base estimation, and CPU image pipeline code under `src/vendor`.
- A small runtime dependency set: `sharp` for decode/encode/resize and `fast-glob` for input discovery.
- Existing baseline checks: unit/integration tests with Vitest and strict TypeScript type checking.

The main gaps before this can become a durable, widely usable CLI are:

- No release packaging or CI workflow is defined yet.
- Config validation is limited and does not have a published JSON Schema.
- Nested `settings` values are accepted as loose partial objects, which is flexible but risky for agents.
- The JSON output shape is described in the README but not protected by schema tests.
- There is no sidecar, metadata, or reproducibility story beyond input/output paths and dimensions.
- RAW formats are explicitly out of scope for v1 and should remain a separate milestone.
- Batch processing is currently sequential.
- Image quality regression coverage is still thin and does not yet use representative scan fixtures.
- The AI-agent contract should be formalized so future features do not break deterministic automation.

## Current Architecture

The current conversion flow is:

```text
argv
  -> parseArgs
  -> loadCliConfig
  -> runConversion
  -> expandInputs
  -> processImageFile
  -> sharp decode
  -> optional analysis resize
  -> auto film base / flare / exposure / white balance analysis
  -> DarkSlide CPU pipeline
  -> sharp encode
  -> JSON or human summary
```

Core modules:

- `src/cli.ts` owns the executable entry point, `ImageData` shim installation, error handling, summary printing, and exit code selection.
- `src/config.ts` owns argument parsing, config file loading, default config merge, flag override precedence, and basic validation.
- `src/files.ts` owns glob expansion, supported input filtering, deterministic sorting, sanitized output names, output directory creation, and overwrite checks.
- `src/processor.ts` owns decode, analysis, transform, crop, pipeline invocation, encode, per-file result construction, and batch summary totals.
- `src/imageData.ts` provides a Node-compatible `ImageData` implementation for DarkSlide pipeline functions that expect browser-style image data.
- `src/index.ts` exports the public library surface for external consumers or tests.
- `src/vendor/*` contains DarkSlide-derived constants, film profiles, types, image pipeline utilities, flare estimation, auto analysis, color profile utilities, math helpers, and RAW-adjacent film-base helpers.

Supported formats today:

- Input: `.tif`, `.tiff`, `.jpg`, `.jpeg`, `.png`, `.webp`.
- Output: `jpeg`, `png`, `webp`, `tiff`.

Current public exports from `src/index.ts`:

```ts
export { loadCliConfig, parseArgs } from './config.js';
export { installImageDataShim, NodeImageData } from './imageData.js';
export { processImageFile, processRawImage, runConversion } from './processor.js';
export type { CliConfig, CliFileResult, CliRunSummary } from './types.js';
export type { ProcessedImage, RawImage } from './processor.js';
```

Keep this public surface small. Add exports only when they support a real external integration or make the CLI easier to test safely.

## Agent Contract Review

The current README contract is a good foundation and should become a compatibility promise.

Exit codes:

- `0`: all matched files converted, skipped, or dry-run planned without processing failures.
- `1`: at least one file failed during conversion.
- `2`: CLI usage or config validation failed before conversion could run correctly.

Machine-readable behavior to preserve:

- `--json` prints one deterministic JSON summary object.
- `--dry-run` resolves matched files and planned output paths without writing images.
- Results are per-file and include input path, output path, status, dimensions when available, profile id, warnings, and errors.
- Output paths should remain stable for a given config and input path.
- Warning strings should be useful to both people and agents.

Future machine-readable modes should follow these rules:

- Avoid timestamps, random IDs, wall-clock durations, or host-specific fields unless a flag explicitly asks for diagnostics.
- Preserve summary ordering even if conversion later becomes concurrent.
- Add fields in a backward-compatible way; do not rename or remove existing JSON fields without a major version change.
- Keep all failures represented in the per-file result list when possible.
- Use `stderr` for invalid usage and unexpected process-level errors.
- Consider JSONL only as an additive progress mode, such as `--jsonl-progress`, not a replacement for `--json`.

Recommended stable JSON schema shape:

```json
{
  "dryRun": false,
  "profile": "generic-color",
  "format": "jpeg",
  "outputDir": "/absolute/output",
  "totals": {
    "matched": 1,
    "done": 1,
    "skipped": 0,
    "failed": 0
  },
  "files": [
    {
      "inputPath": "/absolute/input.tif",
      "outputPath": "/absolute/output/input-positive.jpg",
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

Do not claim a formal schema exists until it is added and tested. Treat the example above as the intended target contract.

## Step-By-Step Roadmap

### Phase 1: Documentation And Release Readiness

Goal: make the existing v1 easy to understand, run, verify, and package.

Implementation steps:

1. Expand README or add `docs/cli-reference.md` with every flag and config field.
2. Include examples for one file, one roll folder, multiple globs, dry run, overwrite, JSON output, profile selection, quality, and max dimension.
3. Document the current flag precedence: defaults, then config file, then CLI overrides.
4. Add a release checklist that requires:
   - `npm run build`
   - `npm test`
   - `npm run typecheck`
5. Decide whether the package should remain private during local development or become publishable.
6. Document local install and smoke-test flow:

```bash
npm install
npm run build
node dist/cli.js --help
npm run dev -- --input "scans/**/*.tif" --output converted --json --dry-run
```

Acceptance checks:

- A new maintainer can install, build, run help, dry-run a folder, and understand every output field from docs alone.
- The documented commands match the current scripts and bin name.
- No future feature is documented as already available.

### Phase 2: Config Schema And Agent Safety

Goal: make config files safe for agents to generate and validate before running expensive conversion work.

Implementation steps:

1. Add a JSON Schema for `darkslide.config.json`.
2. Publish or reference that schema from the example config.
3. Validate top-level fields more explicitly:
   - `input`: string or non-empty string array.
   - `outputDir`: non-empty string.
   - `profile`: non-empty string that resolves to a known film profile.
   - `format`: `jpeg`, `jpg`, `png`, `webp`, or `tiff`.
   - `quality`: integer from 1 to 100.
   - `maxDimension`: `null` or positive integer.
   - `auto.*`: booleans only.
   - `naming.suffix`: string.
4. Validate nested `settings` values conservatively. Accept only known `ConversionSettings` keys and reject obviously invalid primitive types.
5. Add `--list-profiles` with stable JSON-compatible output in `--json` mode.
6. Add `--print-default-config` after the schema exists.
7. Document JSON examples for done, skipped, pending, and error file results.

Acceptance checks:

- Invalid config exits with code `2`.
- Unknown profile exits with code `2`, not as a late per-file conversion error.
- Agents can validate configs before running conversion.
- `--list-profiles --json` gives enough information to choose a profile without reading source files.

### Phase 3: Image Quality Baseline

Goal: protect DarkSlide parity and avoid silent conversion regressions.

Implementation steps:

1. Add small deterministic synthetic fixtures for unit-level tests.
2. Add a tiny set of license-safe representative negative scans for integration tests, or document how local maintainers can provide private fixtures outside git.
3. Build fixture tests around measurable output:
   - image dimensions,
   - channel means,
   - histogram shape,
   - stable output hashes for tiny synthetic images,
   - perceptual or tolerance-based checks for real scans.
4. Cover these behaviors:
   - auto film-base on/off,
   - flare on/off,
   - exposure auto on/off,
   - white balance auto on/off,
   - crop,
   - rotation and level angle,
   - black-and-white profile/settings,
   - slide film profiles,
   - major color profiles such as generic color, Portra, Gold, Ektar, and Fuji profiles.
5. Document a manual comparison workflow against the DarkSlide app:
   - choose the same source scan,
   - use the same film profile,
   - match conversion settings,
   - export from both tools,
   - compare dimensions, histogram, channel means, and a visual diff.

Acceptance checks:

- Output parity changes are intentional and reviewed.
- A contributor can tell whether a pipeline change improved quality or merely changed it.
- The fixture suite stays small enough to run in regular CI.

### Phase 4: Performance And Batch Operation

Goal: improve throughput while keeping deterministic agent behavior.

Implementation steps:

1. Add a `concurrency` config value and `--concurrency <n>` flag.
2. Default concurrency should be conservative, such as `1` initially or a small CPU-aware value only after memory tests exist.
3. Process files concurrently but write results back into the summary in the original sorted input order.
4. Add memory guards before decode using existing vendor limits where applicable:
   - `MAX_IMAGE_PIXELS`,
   - `MAX_IMAGE_DIMENSION`,
   - `MAX_FILE_SIZE_BYTES`.
5. Add progress for human mode without making JSON summary nondeterministic.
6. Add an optional JSONL progress mode only if agents need streaming progress.
7. Preserve partial results if some files fail.

Acceptance checks:

- Concurrent and sequential runs produce the same final JSON summary ordering.
- Failed files do not stop unrelated files unless a future `--fail-fast` flag is explicitly added.
- Large files fail with clear warnings/errors instead of crashing the process.

### Phase 5: Metadata, Sidecars, And Reproducibility

Goal: make every output traceable to source, settings, profile, and tool version.

Implementation steps:

1. Add optional sidecar output, controlled by config and flags:
   - `saveSidecar: boolean`,
   - `--save-sidecar`,
   - `--no-sidecar` if needed.
2. Start with JSON sidecars only. Add other formats later only if there is a real consumer.
3. Sidecar fields should include:
   - generator name and version,
   - source file name/path,
   - source dimensions,
   - output dimensions,
   - profile id and profile name,
   - effective settings after profile defaults, config overrides, and auto analysis,
   - auto analysis warnings,
   - output format and quality.
4. Decide whether sidecars should store absolute paths, relative paths, or both. For reproducible automation, prefer both when possible.
5. Add metadata behavior explicitly:
   - preserve metadata,
   - strip metadata,
   - or embed a limited generated metadata set.
6. Keep metadata embedding separate from sidecar writing so agents can choose deterministic sidecars without modifying image metadata.

Acceptance checks:

- Given an output image and sidecar, a maintainer can reproduce the conversion settings.
- Sidecar writing failures are reported clearly.
- Dry run reports planned sidecar paths without writing them.

### Phase 6: Color Management

Goal: expose the color-management capabilities already represented in vendored DarkSlide utilities.

Implementation steps:

1. Add config for input and output color profiles:
   - `colorManagement.inputProfileId`,
   - `colorManagement.outputProfileId`,
   - `colorManagement.embedOutputProfile`.
2. Start with the profile ids already represented in vendor types:
   - `srgb`,
   - `display-p3`,
   - `adobe-rgb`.
3. Wire profile conversion into the same pipeline path used by DarkSlide utilities.
4. Investigate `sharp` support for embedding generated ICC profiles.
5. If ICC embedding is incomplete, document the limitation and still allow color conversion.
6. Add tests for each supported output profile.

Acceptance checks:

- Output profile choice is visible in JSON summary and sidecars.
- Unsupported profile ids fail at config validation time.
- Color conversion and ICC embedding behavior are tested separately.

### Phase 7: RAW And Scanner Workflows

Goal: add RAW support only after the stable CLI, schema, and image-quality tests are in place.

Implementation steps:

1. Keep RAW import out of the core v1 path until there is a chosen backend.
2. Evaluate possible RAW approaches:
   - external `libraw` or `dcraw`,
   - a Node package that wraps RAW decoding,
   - a separate pre-processing command that converts RAW to TIFF,
   - reuse of app-side DarkSlide import behavior if it can be cleanly isolated.
3. Define expected RAW behavior before implementation:
   - orientation,
   - demosaic quality,
   - white balance,
   - camera profile assumptions,
   - 16-bit handling,
   - failure messages when a decoder is missing.
4. Add scanner/camera workflow presets only after RAW and color tests exist.
5. Prefer user-provided TIFF as the recommended archival workflow until RAW behavior is trustworthy.

Acceptance checks:

- RAW support does not silently produce poor-quality color.
- Missing RAW dependencies fail with clear setup instructions.
- RAW and non-RAW paths share the same summary and sidecar contract.

### Phase 8: DarkSlide App Interop

Goal: allow the CLI and app to exchange presets and conversion state without coupling the CLI to GUI storage.

Implementation steps:

1. Support importing DarkSlide preset files when their shape matches `DarkslidePresetFile`.
2. Support exporting custom profiles or effective settings in a format the app can understand.
3. Consider roll-level metadata after sidecars are stable:
   - roll name,
   - film stock,
   - camera,
   - date,
   - notes.
4. Keep Tauri APIs and GUI storage out of the CLI.
5. Add compatibility tests using small preset fixtures.

Acceptance checks:

- The CLI can consume a compatible preset without requiring the app.
- The app can understand exported CLI state where explicitly supported.
- Unsupported preset versions fail with actionable messages.

### Phase 9: Distribution And CI

Goal: make the CLI installable and continuously verified.

Implementation steps:

1. Add GitHub Actions or another CI system that runs:
   - install,
   - typecheck,
   - tests,
   - build,
   - package smoke test.
2. Add a release workflow only after the package name and support policy are decided.
3. Add changelog or release notes.
4. Keep sample fixtures small and license-safe.
5. Consider npm publishing once:
   - config schema is stable,
   - JSON summary schema is tested,
   - package smoke tests pass,
   - README has install and usage instructions,
   - image quality baseline exists.

Acceptance checks:

- Every pull request proves the CLI still builds, typechecks, and passes tests.
- The published package can run `darkslide-convert --help`.
- Release notes explain any JSON contract changes.

## Recommended Immediate Backlog

Work on these items first:

1. Add `docs/cli-reference.md` or expand the README into a full CLI reference.
2. Add `--list-profiles`.
3. Add a config JSON Schema.
4. Add tests that pin the JSON summary shape.
5. Add deterministic fixture-based image quality tests.
6. Add `npm run build` to the normal verification habit.
7. Add sidecar design notes before implementing sidecars.
8. Add concurrency only after image fixture tests protect output parity.

Suggested first three implementation tasks for an AI agent:

1. Implement `--list-profiles`.
   - Read profile data from `FILM_PROFILES`.
   - In human mode, print id, name, type, film type, category, and description.
   - In `--json` mode, print a deterministic JSON object with a `profiles` array.
   - Add tests for human and JSON modes.

2. Add `schemas/darkslide-config.schema.json`.
   - Cover all current config fields.
   - Reference it from `darkslide.config.example.json` if the team wants editor support.
   - Add tests that invalid values are rejected by runtime validation.

3. Add JSON summary contract tests.
   - Use a tiny generated PNG fixture.
   - Assert top-level fields and per-file fields.
   - Assert dry-run `pending` result shape.
   - Assert skipped output result shape.
   - Assert conversion error result shape where practical.

## Testing Plan

Keep these checks mandatory for every change:

```bash
npm test
npm run typecheck
npm run build
```

Current test coverage already includes:

- Repeatable input parsing and flag overrides.
- Missing input rejection.
- Invalid quality rejection.
- Deterministic supported image expansion.
- Sanitized output naming.
- Existing output skip behavior.
- Direct DarkSlide `processImageData` parity for an equivalent raw buffer.
- Tiny PNG conversion.
- Dry-run behavior.

Add unit tests for:

- Unknown options.
- Invalid config file shape.
- Invalid `auto` values.
- Invalid `maxDimension`.
- Empty `outputDir`.
- Empty `profile`.
- Unknown profile.
- Future profile listing.
- Future JSON Schema compatibility.

Add integration tests for:

- Dry run does not create output directory.
- Overwrite replaces existing outputs.
- Unknown profile exits as invalid usage/config.
- Multiple input globs remain sorted in the summary.
- JSON output shape remains stable.
- JPEG, PNG, WebP, and TIFF encode smoke tests.
- `maxDimension` changes output dimensions.

Add image pipeline tests for:

- Auto film-base success and warning behavior.
- Flare on/off differences.
- Exposure auto mode.
- White balance auto mode.
- Crop behavior.
- Rotation and level angle behavior.
- Black-and-white settings.
- Slide profile behavior.
- Major film profile smoke checks.

Add future visual regression tests with:

- Small deterministic synthetic images committed to the repo.
- Optional private real-scan fixtures documented outside git.
- Explicit tolerances for histogram/channel changes.
- A documented process for blessing intentional output changes.

## AI-Agent Implementation Rules

Agents extending this project should follow these rules:

- Read `README.md`, `package.json`, and the relevant `src/*` modules before changing behavior.
- Preserve deterministic JSON output unless the task explicitly changes the contract.
- Add tests before or with behavior changes.
- Run `npm test`, `npm run typecheck`, and `npm run build` before finishing.
- Keep RAW support, metadata embedding, sidecars, and concurrency as separate milestones.
- Do not treat vendored DarkSlide pipeline changes as casual refactors; protect them with parity or fixture tests.
- Prefer additive flags and config fields over changing existing defaults.
- Document every new machine-readable field.

## Assumptions And Defaults

- This document is a roadmap and review, not proof that future features already exist.
- The current CLI is intentionally focused on TIFF/JPEG/PNG/WebP inputs and JPEG/PNG/WebP/TIFF outputs.
- RAW import, sidecars, advanced metadata handling, color-profile controls, concurrency, and app preset interop should be implemented incrementally.
- The main reader is an AI agent or future automation-oriented maintainer.
- Shipping quality, image quality, and AI-agent usability are the top priorities.
