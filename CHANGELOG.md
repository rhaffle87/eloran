# Changelog

All notable changes to the **SIMULORAN** radio-navigation and physics simulation platform are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.1.0] - 2026-09-29

### Changed
- **Project Renaming**: Formally rebranded from *Loran Lab* to **SIMULORAN** across all documentation, UI metadata, JSON-LD structured schemas, Open Graph headers, licenses, and package manifests.
- **Session Storage Migration**: Migrated the fallback storage key from `loran_offline_radar` to `simuloran_offline_radar` with an automatic, one-time backward-compatibility migration upon initialization.
- **Branding Assets**: Created high-resolution vector and raster brand identity assets:
  - `public/favicon.svg`: Precision antenna mast and radiating 100 kHz hyperbolic wave arcs.
  - `public/favicon.ico`: 32×32 multi-resolution browser favicon.
  - `public/apple-touch-icon.png`: 180×180 iOS and mobile home screen icon.
  - `public/og-image.png`: 1200×630 Open Graph / Twitter Card social preview card featuring the canonical 100 kHz pulse oscillogram with 30 µs standard zero-crossing.
- **Single Source of Truth for Versioning**: Dynamically sourced `v1.1` in the Navbar and Footer directly from `package.json` (`version: 1.1.0`).

### Added
- **Empirical Field Trial Validation**: Added live validation harness (`src/lib/trialValidation.js`) evaluating simulator predictions against published empirical field data:
  - *Korean Nationwide eLoran Testbed* (Rhee, Kim, Son, & Seo, 2021, *IEEE Access* / arXiv:2108.06008) covering 4 transmitters and 7 test sites with measured 95% repeatable positioning accuracy (8.49 m to 12.73 m).
  - *Maoming Inland Geodesic Test* (Gao et al., 2025, *Sensors*, DOI: 10.3390/s25165110) comparing Vincenty ellipsoidal geodesics against spherical Haversine approximations.
- **MapLibre Layer Persistence & Self-Healing**: Hardened vector style swaps and theme toggles against WebGL layer detachment. Custom overlay layers (markers, baselines, LOP hyperbolas, GDOP heatmaps) cleanly restore across all style changes with zero event-listener accumulation.
- **Vector Basemap E2E Coverage**: Added Playwright route interception testing the OpenFreeMap vector diffing pipeline alongside offline Radar Canvas fallbacks.
- **Provenance Verification System**: Introduced automated Crossref DOI verification script (`scripts/check-provenance.mjs`) asserting authoritative metadata and isolating unverified citations.

### Compatibility
- **Scenario Import/Export**: The GeoJSON exporter writes `generator: "SIMULORAN"`. The scenario importer retains backward compatibility, accepting legacy scenario files tagged with `generator: "LORAN LAB"` without errors.
- **ACTIFE Redirection**: Preserved permanent HTTP 308 redirects from parent project ACTIFE (`/loran-c`, `/eloran`, `/loranc`, `/waveforms`) to SIMULORAN standalone endpoints.

---

## [1.0.0] - 2026-09-20

### Added
- Initial standalone release of the Loran-C & eLoran radio-navigation simulator.
- Real-time hyperbolic TDOA lines of position (LOP) calculation using off-thread marching-squares Web Worker.
- GDOP and HDOP geometry matrix calculation and heatmap visualization.
- Additional Secondary Factor (ASF) modeling with Brunavs seawater phase lag and Millington multi-ground boundary recovery.
- Eurofix 9th-pulse pulse-position modulation (PPM) telemetry generator and demodulator.
- Multi-sensor GNSS/eLoran resilient position fusion with inverse-covariance weighting.
- Canonical 100 kHz pulse synthesizer with 90 kHz–110 kHz bandpass spectrum.
