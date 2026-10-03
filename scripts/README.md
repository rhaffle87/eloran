# SIMULORAN Automation & Verification Scripts

This directory houses the deterministic automation scripts that enforce SIMULORAN's zero-defect engineering standard.

---

## Script Catalog

### 1. Quality & Verification Gates
| Script | Command | Purpose |
|---|---|---|
| `verify-secrets.cjs` | `npm run check:secrets` | Mechanical secret leak guard scanning tracked/staged files for API key patterns. |
| `verify-utf8.cjs` | `npm run test:utf8` | Byte-level scanner ensuring strict UTF-8 validity (0 byte errors, 0 `U+FFFD` replacement characters). |
| `audit-a11y.cjs` | `npm run test:a11y` | Automated Playwright accessibility auditor verifying zero critical/serious WCAG violations and CLS < 0.1. |
| `check-provenance.mjs` | `npm run check:provenance` | Live HTTP and Crossref DOI verification harness auditing all citations in `docs/PROVENANCE.md`. |
| `verify-physics-benchmarks.cjs` | `npm run test:physics` | Mathematical assertion suite validating core RF pulse shapes, TDOA baselines, and Millington models. |

### 2. Assets & Tile Pipeline
| Script | Command | Purpose |
|---|---|---|
| `refresh-tiles.cjs` | `npm run refresh:tiles` | Audits and caches vector tile endpoints for keyless OpenFreeMap providers. |
| `bundle-coastlines.cjs` | `node scripts/bundle-coastlines.cjs` | Compiles low-resolution natural earth vector coastline GeoJSONs for offline radar canvas mode. |
| `generate-branding-assets.mjs` | `node scripts/generate-branding-assets.mjs` | Synthesizes favicons, OpenGraph images, and PWA icons with crisp geometric vector paths. |

### 3. Setup & Environment
| Script | Command | Purpose |
|---|---|---|
| `setup-hooks.cjs` | `npm run prepare` | Automatically installs git pre-commit hook running the mechanical secret leak guard. |
