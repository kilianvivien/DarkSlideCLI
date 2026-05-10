# Release Checklist

DarkSlide CLI remains private during local development. `package.json` intentionally has `"private": true` until the config and JSON output contracts are protected by schema and contract tests.

## Required Checks

Run these checks before tagging, publishing, or handing a release candidate to another maintainer:

```bash
npm run build
npm test
npm run typecheck
```

## Local Package Smoke Test

From a clean checkout or release candidate:

```bash
npm install
npm run build
node dist/cli.js --help
npm run dev -- --input "scans/**/*.tif" --output converted --json --dry-run
```

The smoke test should prove that:

- dependencies install successfully,
- TypeScript builds to `dist/`,
- the built CLI prints help,
- dry-run mode resolves inputs and planned outputs without writing images,
- JSON output remains a single deterministic summary object.

## Publish Readiness Gate

Before changing `"private": true`, decide the public package name and verify:

- `npm run build` passes,
- `npm test` passes,
- `npm run typecheck` passes,
- local package smoke tests pass,
- README and `docs/cli-reference.md` document the shipped command surface,
- the example config matches runtime behavior,
- JSON summary compatibility is covered by tests,
- config validation is strong enough for generated configs,
- release notes call out any machine-readable output changes.

Do not publish future roadmap features as if they are already available.
