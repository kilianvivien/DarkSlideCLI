# Image Quality Baseline

Phase 3 keeps image-quality coverage small, deterministic, and suitable for regular local and CI runs.

## Automated Coverage

The automated baseline lives in `src/image-quality.test.ts`. It generates a tiny synthetic color-negative PNG at test time, runs it through the real CLI conversion pipeline, decodes the output pixels, and asserts:

- output dimensions,
- RGB channel means,
- a compact luminance histogram,
- a SHA-256 hash of decoded RGB pixels,
- measurable differences when auto film-base, flare, exposure, and white-balance analysis are toggled,
- crop, rotation, and level-angle geometry,
- smoke coverage for black-and-white, slide, Portra, Gold, Ektar, and Fuji profiles.

The fixture is generated in the OS temp directory rather than committed as a binary asset. This keeps the repo small and avoids licensing ambiguity while still protecting deterministic pipeline behavior.

## Optional Private Scan Fixtures

Real film scans are valuable but can be large and hard to license. Keep private representative scans outside git, then run ad hoc comparisons against them before approving pipeline changes. Suggested local layout:

```text
fixtures-private/
  color-negative/
  black-and-white/
  slide/
```

Do not commit private scans unless their license and size are explicitly approved.

## Manual DarkSlide App Comparison

Use this workflow when reviewing intentional quality changes:

1. Choose the same source scan for the CLI and DarkSlide app.
2. Select the same film profile.
3. Match conversion settings, including crop, rotation, film-base sample, auto exposure, white balance, and flare settings.
4. Export from both tools to the same format and quality.
5. Compare dimensions.
6. Compare decoded channel means and histogram shape.
7. Review a visual diff at 100% zoom.
8. Record whether the difference is intentional and why.

For CLI-side measurement, decode outputs with `sharp` and compare raw RGB data rather than encoded file bytes. Encoders may change metadata or compression details without changing visible pixels.
