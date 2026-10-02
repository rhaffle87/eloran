# SIMULORAN

> **High-Fidelity Loran-C & eLoran Simulation Suite**  
> An interactive, physics-based radio-navigation engineering laboratory for hyperbolic time-difference of arrival (TDOA) positioning, pseudorange multilateration, atmospheric refraction, oscillator stability, Additional Secondary Factor (ASF) modeling, and GNSS-resilient multi-sensor fusion.

> [!CAUTION]
> **EDUCATIONAL & RESEARCH SIMULATOR ONLY**  
> SIMULORAN is an academic and engineering research simulation tool. It is **not** certified, approved, or intended for real-world maritime navigation, aviation, or safety-critical positioning, navigation, and timing (PNT).

---

## 1. Overview & Motivation

Global Navigation Satellite Systems (GNSS: GPS, Galileo, BeiDou, GLONASS) transmit ultra-low-power microwave signals (~1.5 GHz) from ~20,000 km in medium Earth orbit. As a consequence, satellite signals are highly susceptible to intentional jamming, spoofing, multipath degradation, and solar space weather events.

**eLoran (enhanced Loran)** is the internationally standardized, terrestrial, low-frequency (100 kHz) navigation system providing high-power (hundreds of kilowatts to megawatts) signals that share no common failure modes with GNSS, delivering resilient, autonomous Positioning, Navigation, and Timing (PNT).

**SIMULORAN** is a standalone, web-based engineering simulation suite designed to model, visualize, and analyze hyperbolic and pseudorange radio navigation chains with mathematical rigor.

---

## 2. Documentation & Research Standards

- [**VALIDATION.md**](docs/VALIDATION.md) — Empirical field trial benchmarks (Korean Nationwide eLoran Testbed 2021 & Maoming Inland Geodesic Test 2025), validation tiers, and verification harness.
- [**REFERENCES.md**](docs/REFERENCES.md) — Sourced literature compendium of primary standards (USCG COMDTINST M16562.4A, Loran-C User Handbook, Peterson 2006, RTCM MPS, ITU-R P.368/P.832), foundational textbooks, dissertations (Pelgrum 2006, Offermans & Helwig 2003, Hargreaves 2010), and physics formulas.
- [**PROVENANCE.md**](docs/PROVENANCE.md) — Provenance tracking, retrievable URLs/DOIs for all literature, and register of items marked UNVERIFIED.
- [**DATA_NOTES.md**](docs/DATA_NOTES.md) — Global transmitter status (US/Canada 2010 shutdown, European 2015 decommissioning, Anthorn UK timing role, active China and Russia chains).
- [**TILES.md**](docs/TILES.md) — Centralized map tile configuration (OpenFreeMap vector default, OSM raster, authenticated CARTO, and offline radar canvas fallback).
- [**THIRD_PARTY_NOTICES.md**](THIRD_PARTY_NOTICES.md) — Full licensing and copyright notices for MapLibre GL, Proj4js, PapaParse, Turf.js, dev dependencies, and fonts.
- [**LICENSE**](LICENSE) — Standard Open-Source MIT License.

---

## 3. System Architecture & Features

```
simuloran/
├── docs/
│   ├── REFERENCES.md            # Standards, formulas, and literature compendium
│   ├── PROVENANCE.md            # Provenance audit, citation links & unverified ledger
│   ├── DATA_NOTES.md            # Global station operational history & coordinates
│   ├── TILES.md                 # Tile providers, usage limits & offline mode
│   └── EXTRACTION_NOTES.md      # Mathematical specifications & legacy audit
├── src/
│   ├── lib/                     # Pure, testable mathematical library (zero UI coupling)
│   │   ├── geodesy.js           # Haversine, forward/inverse geodesics, PF refraction, Brunavs SF
│   │   ├── tdoa.js              # Pseudorange solver (b_rx), hyperbolic TDOA, cycle slips
│   │   ├── gdop.js              # Direction cosines, GDOP/HDOP geometry matrix, heatmaps
│   │   ├── asf.js               # Safe recursive-descent AST formula parser & evaluator
│   │   ├── clocks.js            # Cesium, Rubidium, GPSDO, Quartz drift & bias models
│   │   ├── dds.js               # Eurofix 9th-pulse PPM telemetry generator
│   │   ├── elevationProfile.js  # Great-circle elevation interpolation & Open-Elevation client
│   │   ├── fusion.js            # Inverse-covariance weighted GNSS-eLoran BLUE multi-sensor fusion
│   │   ├── heatmapColormap.js   # Jet & Viridis 256-entry LUTs & canvas rasterizer
│   │   ├── pulse.js             # 100 kHz carrier, raised-cosine envelope, GRI timing
│   │   ├── terrainMasking.js    # ITU-R P.526 knife-edge obstacle diffraction & excess delay
│   │   ├── trackingLoop.js      # PLL/DLL carrier tracking, SZC lock & Boyce cycle slip model
│   │   ├── contours.js          # Marching squares 2D contouring + RDP simplification
│   │   ├── stations.js          # Station schema, validation, boundary guards, CSV/GeoJSON
│   │   └── tiles.js             # Centralized tile provider config with offline radar fallback
│   ├── workers/                 # Off-thread Web Workers for high-density compute
│   │   ├── gridWorker.js        # Parallel 2D TDOA grid & contour extraction
│   │   ├── asfWorker.js         # Spatial formula rasterizer
│   │   └── workerClient.js      # Cancellable Promise wrapper with transferable buffers
│   ├── state/
│   │   ├── simulationStore.js   # Single reactive Zustand state store
│   │   └── presets.js           # Calibrated scenarios (North China Sea, North Sea Historical, etc.)
│   ├── components/
│   │   ├── map/                 # MapView (MapLibre GL vector & raster), AsfHeatmapLayer, Contours, Markers
│   │   ├── panels/              # StationEditor, ClockPanel, AsfPanel, FusionPanel, TrackingPanel, DisplayPanel
│   │   ├── charts/              # PulseViewer (oscilloscope with SVG export), TrackingChart
│   │   └── ui/                  # Modal, Slider, Toggle, ErrorBoundary, SystemBanners
│   └── pages/                   # Home, LoranC, ELoran, Waveforms, Learn, About
```

---

## 4. Physics & Navigation Engine

### 1. Dual Positioning Solvers
- **Modern 2D+Time Pseudorange Multilateration**: Directly solves the state vector $\mathbf{x} = [x, y, c \cdot b_{\text{rx}}]^T$, simultaneously estimating horizontal coordinates $(x, y)$ and receiver clock bias $b_{\text{rx}}$ in nanoseconds. Supports cross-chain and all-in-view reception given a common UTC time base (or estimating one receiver clock bias per independent chain), removing the classical requirement for a single shared master station.
- **Classical Hyperbolic TDOA**: Iterative Gauss-Newton solver on range differences $(d_S - d_M)$ relative to a reference master station.

### 2. Atmospheric & Propagation Modeling
- **Primary Factor (PF)**: Configurable atmospheric refractive index $\eta$:
  - RTCM MPS: $\eta = 1.000338$ ($c = 299,792,458\text{ m/s}$)
  - USCG Loran-C User Handbook: $\eta = 1.000284$
  - China National Standard: $\eta = 1.000315$
- **Secondary Factor (SF)**: Empirical polynomial modeling all-seawater groundwave delay (marked UNVERIFIED due to a known ~0.236 µs / ~71 m step discontinuity at 100 statute miles; disabled by default with a visible UI indicator `Secondary Factor: off (UNVERIFIED model)` wherever results depend on PF+SF+ASF).
- **Additional Secondary Factor (ASF)**: Real-time spatial polynomial and raster evaluation of overland phase delays.
- **Coastline Path Segmentation & Geo-ASF**: Turf.js great-circle segmentation against Natural Earth Vector coastline polygons feeding the ITU-R P.368-10 Annex 1, §3 Millington reciprocal groundwave solver.

### 3. Cycle Slip Modeling (Boyce 2006)
Simulates wrong-cycle selection where degraded SNR or skywave interference shifts the tracking point away from the 3rd zero crossing, introducing integer ±10 µs (~3 km) step errors.


### 4. Live Additional Secondary Factor (ASF) Heatmap Layer
- **Dual Physical Quantity Overlay**: Switchable between propagation delay ($\mu\text{s}$, $0\text{–}3\ \mu\text{s}$ dynamic range mapped to Jet colormap) and groundwave field attenuation ($\text{dB}$, $0\text{–}60\text{ dB}$ loss mapped to Viridis colormap).
- **Asynchronous Worker Rendering**: Utilizes `gridWorker.js` with transferable `Float32Array` memory buffers for smooth, debounced (300 ms) parameter updates without UI stutter.
- **Iso-Contour Overlays**: Canvas-rendered equi-delay (0.5 µs) and equi-attenuation (10 dB) contour rings with configurable layer opacity (0–100%) and grid resolution (20×20 to 80×80).

### 5. Receiver Tracking Loop Simulation (PLL & DLL)
- **Standard Zero Crossing (SZC) Tracking**: Closed-loop simulation tracking the 3rd positive-going zero crossing (30 µs) using the 15 µs ratio test ($e(15)/e(30) \approx 0.397$).
- **State Machine Architecture**: Real-time transition between `ACQUIRING` (phase-lock search), `LOCKED` (sub-microsecond tracking jitter via Rhee et al. 2021 noise model), and `CYCLE_SLIP` states.
- **Envelope-to-Cycle Difference (ECD) Sparkline**: 50-GRI rolling time-history chart displaying microsecond tracking error, phase jitter, and cycle slip events.

### 6. Station Failure & Constellation Integrity
- **Per-Transmitter Operating Modes**: Real-time toggling of stations between `NOMINAL`, `DEGRADED` (inflated observation noise simulating aging transmitters), and `FAILED` (complete transmitter loss).
- **Dynamic GDOP Matrix Exclusion**: Failed stations are dynamically dropped from the geometry $\mathbf{H}$-matrix with warning indicators when fewer than 2 secondaries remain (hyperbolic fix degenerate).
- **Hazard Coverage Overlay**: Automatically renders a 250 km hatched red loss-of-coverage exclusion circle centered on failed transmitters.

### 7. Multi-Sensor GNSS / eLoran BLUE Fusion & Error Ellipses
- **Best Linear Unbiased Estimator (BLUE)**: Fuses independent eLoran and GNSS positioning solutions via inverse-covariance weighting:

  $$
  \mathbf{P}_{\text{fused}} = \left( \mathbf{P}_{\text{eLoran}}^{-1} + \mathbf{P}_{\text{GNSS}}^{-1} \right)^{-1}, \quad \hat{\mathbf{x}}_{\text{fused}} = \mathbf{P}_{\text{fused}} \left( \mathbf{P}_{\text{eLoran}}^{-1} \hat{\mathbf{x}}_{\text{eLoran}} + \mathbf{P}_{\text{GNSS}}^{-1} \hat{\mathbf{x}}_{\text{GNSS}} \right)
  $$
- **2.45σ (95% Confidence) Covariance Ellipses**: Renders bivariate Gaussian error ellipses on the map for eLoran (cyan), GNSS (emerald/amber/red based on spoof/jam status), and Fused (purple) solutions.
- **Aviation Horizontal Protection Level (HPL)**: Continuous HPL calculation with real-time RNAV RNP 0.3 (556 m) and APV approach (40 m) alert limit threshold compliance gauges.

### 8. Terrain Masking & Knife-Edge Obstacle Diffraction (ITU-R P.526)
- **Great-Circle Elevation Profiles**: Interpolates terrain elevation samples between transmitter towers and receiver antennas with Open-Elevation REST client and 128-entry in-memory LRU cache.
- **Fresnel-Kirchhoff Diffraction Engine**: Evaluates clearance parameter $v$ and calculates knife-edge path loss $J(v)$ using the Nurul-Saunders piecewise approximation, estimating excess diffracted propagation delay $\tau_{\text{excess}}$.
- **Vector Map Visualization**: Highlights clear paths in solid emerald green and obstructed links (>15 dB loss) in dashed high-visibility red.

---

## 5. Development & Testing

```bash
# Install dependencies
npm install

# Run Vitest physics test suite
npm test

# Run ESLint validation
npm run lint

# Run citation & provenance verification (local audit)
npm run check:provenance

# Start Vite development server
npm run dev

# Build production bundle
npm run build
```

---

## 6. Known Limitations

### Single-Chain Constraint
Each scenario currently represents **one Loran-C chain** with **one master** and multiple secondaries. The `masters[]` array in the data model is a structural artifact; multi-master scenarios are not supported.

**Why:** In Loran-C physics, a chain is defined by:
- One synchronized Group Repetition Interval (GRI)
- One master transmitter (pulse group leader)
- Multiple secondary transmitters (time-delayed responders)

Multiple masters with the same GRI would create timing conflicts. Multiple masters with different GRIs represent independent chains and should not share baselines or TDOA pairs.

**Current behavior:** Only `masters[0]` is used for baseline rendering and position solving. Additional masters in a scenario are ignored with a console warning.

**Future support:** Proper multi-chain visualization would require restructuring to `chains: [{ master, secondaries, gri }]` with per-chain grouping. This is not currently implemented.

---

## 7. License

Distributed under the [MIT License](LICENSE). See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for third-party acknowledgments.
