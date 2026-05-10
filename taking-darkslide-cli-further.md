# Taking DarkSlide CLI Further

## Implementation Status

Last updated after Phase 6 implementation.

Completed:

- Phase 1: Documentation and release readiness.
- Phase 2: Config schema and agent safety.
- Phase 3: Image quality baseline.
- Phase 4: Performance and batch operation, except human/JSONL progress modes.
- Phase 5: JSON sidecars and reproducibility, except broader image metadata policy.
- Phase 6: Color management.

Pending:

- Phase 7: RAW and scanner workflows.
- Phase 8: DarkSlide app interop.
- Phase 9: Distribution and CI.

Current verification baseline:

```bash
npm test
npm run typecheck
npm run build
```

At the time of this update, the suite covers 5 test files and 38 tests.

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

The main remaining gaps before this can become a durable, widely usable CLI are:

- No release packaging or CI workflow is defined yet.
- Config validation and a config JSON Schema now exist, but JSON summary output does not yet have a dedicated published schema.
- Nested `settings` validation is conservative, but additional edge-case tests would still be useful.
- The JSON output shape is documented and tested through integration tests, but a dedicated summary schema or snapshot suite would make compatibility easier to police.
- JSON sidecars now exist, but broader image metadata preserve/strip/embed policy is still intentionally limited.
- RAW formats are explicitly out of scope for v1 and should remain a separate milestone.
- Batch processing now supports deterministic concurrency, but human progress and JSONL progress are not implemented.
- Image quality regression coverage now has deterministic synthetic fixtures, but does not yet use committed representative real-scan fixtures.
- The AI-agent contract is documented for current behavior; future machine-readable changes still need compatibility discipline.

## Current Architecture

The current conversion flow is:

```text
argv
  -> parseArgs
  -> loadCliConfig
  -> runConversion
  -> expandInputs
  -> ordered worker pool controlled by concurrency
  -> output and sidecar path planning
  -> processImageFile
  -> pre-decode file/dimension/pixel guards
  -> sharp decode
  -> optional analysis resize
  -> auto film base / flare / exposure / white balance analysis
  -> DarkSlide CPU pipeline with color-management ids
  -> sharp encode
  -> optional ICC embedding
  -> optional JSON sidecar write
  -> JSON or human summary
```

Core modules:

- `src/cli.ts` owns the executable entry point, `ImageData` shim installation, error handling, summary printing, and exit code selection.
- `src/config.ts` owns argument parsing, config file loading, default config merge, flag override precedence, default config printing, profile listing inputs, and config validation.
- `src/files.ts` owns glob expansion, supported input filtering, deterministic sorting, sanitized output names, output directory creation, and overwrite checks.
- `src/processor.ts` owns decode, pre-decode guards, analysis, transform, crop, color-managed pipeline invocation, encode, optional ICC embedding, optional sidecar writing, per-file result construction, deterministic concurrency, and batch summary totals.
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

Current stable JSON summary shape:

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
      "sidecarPath": "/absolute/output/input-positive.jpg.json",
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

The formal schema currently covers config files at `schemas/darkslide-config.schema.json`. A separate JSON summary schema has not been added yet.

## Step-By-Step Roadmap

### Phase 1: Documentation And Release Readiness — Done

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

Implemented notes:

- Added `docs/cli-reference.md`.
- Added `docs/release-checklist.md`.
- Linked both from README.
- Kept the package private while distribution policy remains undecided.

### Phase 2: Config Schema And Agent Safety — Done

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

Implemented notes:

- Added `schemas/darkslide-config.schema.json`.
- Added stricter top-level validation and conservative nested `settings` validation.
- Added `--list-profiles` and `--print-default-config`.
- Unknown profiles now fail during config loading as usage/config errors.
- Documented JSON examples for `done`, `skipped`, `pending`, and `error`.

### Phase 3: Image Quality Baseline — Done

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

Implemented notes:

- Added deterministic synthetic image-quality tests in `src/image-quality.test.ts`.
- Added `docs/image-quality-baseline.md`.
- Covered decoded pixel hash, dimensions, channel means, histogram shape, auto analysis toggles, crop, rotation, level angle, black-and-white, slide, and major film profile smoke tests.

Not yet done:

- No committed real-scan fixture set.
- No perceptual visual-diff workflow in CI.

### Phase 4: Performance And Batch Operation — Mostly Done

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

Implemented notes:

- Added `concurrency` config and `--concurrency <n>`.
- Default concurrency is `1`.
- Runs use an ordered worker pool so sequential and concurrent summaries keep the same sorted result order.
- Added pre-decode guards using `MAX_IMAGE_PIXELS`, `MAX_IMAGE_DIMENSION`, and `MAX_FILE_SIZE_BYTES`.
- Added tests for concurrent ordering, partial failure preservation, and oversized image rejection.

Not yet done:

- Human-mode progress output.
- Optional JSONL progress mode.

### Phase 5: Metadata, Sidecars, And Reproducibility — Mostly Done

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

Implemented notes:

- Added `saveSidecar`, `--save-sidecar`, and `--no-sidecar`.
- Added `sidecarPath` to per-file results when sidecars are enabled.
- Completed conversions write JSON sidecars at `<outputPath>.json`.
- Dry runs report planned sidecar paths without writing sidecar files.
- Sidecars include generator/version, source path/name/relative path/size/dimensions, output path/name/relative path/dimensions, profile details, effective settings after auto analysis, auto warnings, output format/quality/max dimension, and color-management settings.
- Sidecar write failures become per-file `error` results.

Not yet done:

- General image metadata preserve/strip/embed policy.
- Non-JSON sidecar formats.

### Phase 6: Color Management — Done

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

Implemented notes:

- Added `colorManagement.inputProfileId`, `colorManagement.outputProfileId`, and `colorManagement.embedOutputProfile`.
- Added `--input-profile`, `--output-profile`, `--embed-output-profile`, and `--no-embed-output-profile`.
- Supported ids are `srgb`, `display-p3`, and `adobe-rgb`.
- Wired through the existing vendored DarkSlide color-profile transform path.
- Added ICC embedding through Sharp, including generated ICC handling for Adobe RGB.
- Added summary and sidecar visibility.
- Added tests for validation, pixel conversion, ICC embedding on/off, and all supported output profiles.

### Phase 7: RAW And Scanner Workflows — Pending

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

Implementation guidance:

1. Start with a design spike, not a broad implementation.
   - Add `docs/raw-workflow-design.md`.
   - Compare at least two approaches: external CLI decoder versus Node library.
   - Record install burden, licensing, platform support, 16-bit output behavior, metadata/orientation handling, and maintenance risk.
2. Prefer a pre-processing boundary for the first iteration.
   - Add a separate command or mode that converts RAW to an intermediate TIFF/PNG, then feeds the existing conversion path.
   - Keep `processImageFile` focused on already-decoded supported raster inputs until the RAW backend is proven.
   - Avoid adding RAW extensions to `SUPPORTED_INPUT_EXTENSIONS` until decode behavior is tested.
3. Define the first config shape conservatively.
   - Candidate shape:
     ```json
     {
       "raw": {
         "enabled": false,
         "backend": "external",
         "decoderPath": null,
         "intermediateFormat": "tiff",
         "preserveIntermediate": false
       }
     }
     ```
   - Validate every field before running any decode work.
4. Add dependency detection before decode.
   - If using `dcraw`, `libraw`, or another external tool, add a startup/preflight check that reports the exact missing command.
   - Missing decoder should exit as config/setup failure when RAW input is requested, not as a vague per-file crash.
5. Preserve the current summary contract.
   - RAW and non-RAW results should still include `inputPath`, `outputPath`, optional `sidecarPath`, `status`, dimensions, profile, warnings, and errors.
   - Sidecars should record RAW backend, decoder version if available, intermediate path policy, source dimensions, and any orientation/white-balance assumptions.
6. Add tests before enabling real RAW input.
   - Unit-test backend selection and missing dependency errors with mocked command checks.
   - Integration-test a tiny license-safe RAW fixture only if one is approved.
   - Otherwise document private RAW fixture testing exactly as Phase 3 documents private scan fixtures.
7. Keep scanner/camera presets separate.
   - Add presets only after RAW decode and color behavior are stable.
   - Presets should be explicit config snippets, not hidden behavior.

Suggested first task for Phase 7:

- Create `docs/raw-workflow-design.md` and a small `raw` config schema proposal without changing runtime behavior. This makes the backend choice reviewable before expensive decode logic lands.

### Phase 8: DarkSlide App Interop — Pending

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

Implementation guidance:

1. Start with import-only preset support.
   - Add a config field such as `presetPath` or a flag such as `--preset <path>`.
   - Load JSON, validate it as a `DarkslidePresetFile`, and map it to CLI `profile` plus `settings`.
   - Keep direct GUI storage and Tauri APIs out of scope.
2. Make precedence explicit.
   - Recommended order: defaults, config file, preset file, CLI overrides.
   - Document whether `--profile` overrides the preset profile and whether `settings` deep-merge over preset settings.
3. Validate preset compatibility.
   - Check `darkslideVersion`.
   - Check `profile.id`, `profile.name`, `profile.type`, `profile.filmType`, and `profile.defaultSettings`.
   - Reject unsupported versions with a `UsageError` and exit code `2`.
4. Decide what “export” means before implementing it.
   - Candidate command: `--export-preset <path>` or a separate future command.
   - Export should include only fields the app can understand.
   - Avoid exporting CLI-only fields such as `input`, `outputDir`, `concurrency`, or sidecar paths unless a separate CLI state format is created.
5. Add fixtures.
   - Add tiny JSON preset fixtures under a test fixture directory.
   - Include one valid preset, one unsupported version, and one malformed preset.
6. Protect the existing config contract.
   - Preset import should be additive.
   - Existing config files without presets should behave exactly as they do now.

Suggested first task for Phase 8:

- Add fixture-driven tests and validation helpers for `DarkslidePresetFile` without wiring a public flag yet. Once validation is solid, add `--preset`.

### Phase 9: Distribution And CI — Pending

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

Implementation guidance:

1. Add CI before publishing.
   - Use GitHub Actions if the repo is on GitHub.
   - Recommended job matrix initially: one current LTS Node version on Ubuntu.
   - Add macOS only if Sharp or RAW workflows show platform-specific behavior.
2. CI commands should match local verification.
   - `npm ci`
   - `npm run typecheck`
   - `npm test`
   - `npm run build`
   - `node dist/cli.js --help`
   - `node dist/cli.js --print-default-config`
   - `node -e "JSON.parse(require('fs').readFileSync('schemas/darkslide-config.schema.json','utf8'))"`
3. Add a package smoke test.
   - Run `npm pack --dry-run` first to inspect published files.
   - Then consider a temp-directory install from `npm pack` output and run `darkslide-convert --help`.
   - Ensure `dist/cli.js`, declarations, README, LICENSE, schema, example config, and docs needed by package users are included.
4. Decide publish policy before removing `"private": true`.
   - Confirm package name.
   - Decide semantic versioning policy.
   - Decide what constitutes a breaking JSON summary change.
5. Add release notes.
   - Start with `CHANGELOG.md`.
   - Call out new machine-readable fields, config fields, and sidecar/schema changes.
6. Keep release workflow manual at first.
   - Use CI for confidence.
   - Add automated npm publishing only after package contents and support policy are stable.

Suggested first task for Phase 9:

- Add a CI workflow that runs install, typecheck, tests, build, help smoke test, default-config smoke test, and JSON schema parse test. Leave npm publishing manual and disabled.

## Recommended Immediate Backlog

Previous near-term backlog status:

- Done: add `docs/cli-reference.md` or expand the README into a full CLI reference.
- Done: add `--list-profiles`.
- Done: add a config JSON Schema.
- Partly done: add tests that pin the JSON summary shape. Integration coverage exists, but there is no dedicated summary schema or snapshot suite yet.
- Done: add deterministic fixture-based image quality tests.
- Done: add `npm run build` to the normal verification habit.
- Done: add sidecar design notes/implementation.
- Done: add concurrency after image fixture tests protect output parity.

Recommended next backlog:

1. Phase 7 design spike: write `docs/raw-workflow-design.md` and propose `raw` config shape before implementing decoding.
2. Add a dedicated JSON summary schema or snapshot-style summary contract tests.
3. Add CI for install, typecheck, tests, build, schema parse, help smoke, and default-config smoke.
4. Add package smoke testing with `npm pack`.
5. Decide package publishing/support policy and whether to keep `"private": true`.
6. Add `CHANGELOG.md`.
7. Build DarkSlide preset validation fixtures before wiring public interop flags.

Previous suggested first three implementation tasks for an AI agent:

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
- Config schema parseability.
- Profile listing in human and JSON modes.
- Default config printing.
- Conservative config validation for top-level fields and nested `settings`.
- JSON sidecar writing, dry-run sidecar planning, and sidecar write failure reporting.
- Deterministic synthetic image-quality baseline checks.
- Concurrent ordering and partial failure behavior.
- Pre-decode oversized image rejection.
- Color-management validation, conversion, summary/sidecar reporting, and ICC embedding behavior.

Still useful future unit tests:

- Unknown options.
- Additional nested `settings` edge cases.
- RAW backend selection and dependency detection once Phase 7 starts.
- Preset import validation once Phase 8 starts.
- Dedicated JSON summary schema compatibility if a summary schema is added.

Still useful future integration tests:

- Dry run does not create output directory.
- Overwrite replaces existing outputs.
- Multiple input globs remain sorted in the summary.
- CLI-level JSON output shape snapshots.
- JPEG, PNG, WebP, and TIFF encode smoke tests.
- `maxDimension` changes output dimensions.
- Package smoke tests after Phase 9 starts.

Current image pipeline tests cover:

- Auto film-base success and warning behavior.
- Flare on/off differences.
- Exposure auto mode.
- White balance auto mode.
- Crop behavior.
- Rotation and level angle behavior.
- Black-and-white settings.
- Slide profile behavior.
- Major film profile smoke checks.

Future visual regression tests could add:

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
- Sidecars, concurrency, and color management are now implemented. Keep RAW support, broad metadata policy, app interop, CI, and distribution as separate milestones.
- Do not treat vendored DarkSlide pipeline changes as casual refactors; protect them with parity or fixture tests.
- Prefer additive flags and config fields over changing existing defaults.
- Document every new machine-readable field.

## Assumptions And Defaults

- This document is a roadmap and review, not proof that future features already exist.
- The current CLI is intentionally focused on TIFF/JPEG/PNG/WebP inputs and JPEG/PNG/WebP/TIFF outputs.
- RAW import, advanced metadata handling, app preset interop, CI, and distribution should be implemented incrementally.
- Sidecars, color-profile controls, and deterministic concurrency are now part of the current CLI surface.
- The main reader is an AI agent or future automation-oriented maintainer.
- Shipping quality, image quality, and AI-agent usability are the top priorities.
