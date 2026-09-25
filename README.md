# LORAN LAB

> **High-Fidelity Loran-C & eLoran Simulation Suite**  
> An interactive, physics-based radio-navigation engineering laboratory for hyperbolic time-difference of arrival (TDOA) positioning, pseudorange multilateration, atmospheric refraction, oscillator stability, Additional Secondary Factor (ASF) modeling, and GNSS-resilient multi-sensor fusion.

> [!CAUTION]
> **EDUCATIONAL & RESEARCH SIMULATOR ONLY**  
> LORAN LAB is an academic and engineering research simulation tool. It is **not** certified, approved, or intended for real-world maritime navigation, aviation, or safety-critical positioning, navigation, and timing (PNT).

---

## 1. Overview & Motivation

Global Navigation Satellite Systems (GNSS: GPS, Galileo, BeiDou, GLONASS) transmit ultra-low-power microwave signals (~1.5 GHz) from ~20,000 km in medium Earth orbit. As a consequence, satellite signals are highly susceptible to intentional jamming, spoofing, multipath degradation, and solar space weather events.

**eLoran (enhanced Loran)** is the internationally standardized, terrestrial, low-frequency (100 kHz) navigation system providing high-power (hundreds of kilowatts to megawatts) signals that share no common failure modes with GNSS, delivering resilient, autonomous Positioning, Navigation, and Timing (PNT).

**LORAN LAB** is a standalone, web-based engineering simulation suite designed to model, visualize, and analyze hyperbolic and pseudorange radio navigation chains with mathematical rigor.

---

## 2. Documentation & Research Standards

- [**REFERENCES.md**](docs/REFERENCES.md) — Sourced literature compendium of primary standards (USCG COMDTINST M16562.4A, Loran-C User Handbook, Peterson 2006, RTCM MPS, ITU-R P.368/P.832), foundational textbooks, dissertations (Pelgrum 2006, Offermans & Helwig 2003, Hargreaves 2010), and physics formulas.
- [**PROVENANCE.md**](docs/PROVENANCE.md) — Provenance tracking, retrievable URLs/DOIs for all literature, and register of items marked UNVERIFIED.
- [**DATA_NOTES.md**](docs/DATA_NOTES.md) — Global transmitter status (US/Canada 2010 shutdown, European 2015 decommissioning, Anthorn UK timing role, active China and Russia chains).
- [**TILES.md**](docs/TILES.md) — Centralized map tile configuration, offline radar canvas fallback, and self-hosted tile instructions.
- [**THIRD_PARTY_NOTICES.md**](THIRD_PARTY_NOTICES.md) — Full licensing and copyright notices for MapLibre GL, Proj4js, PapaParse, Turf.js, dev dependencies, and fonts.
- [**LICENSE**](LICENSE) — Standard Open-Source MIT License.

---

## 3. System Architecture & Features

```
eloran/
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
│   │   ├── fusion.js            # Inverse-covariance weighted GNSS-eLoran multi-sensor fusion
│   │   ├── pulse.js             # 100 kHz carrier, raised-cosine envelope, GRI timing
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
│   │   ├── map/                 # MapView (MapLibre GL raster), Contours, Markers, GDOP overlay
│   │   ├── panels/              # StationEditor, ClockPanel, AsfPanel, FusionPanel, DisplayPanel
│   │   ├── charts/              # PulseViewer (oscilloscope with SVG export)
│   │   └── ui/                  # Modal, Slider, Toggle, ErrorBoundary, SystemBanners
│   └── pages/                   # Home, LoranC, ELoran, Waveforms, Learn, About
```

---

## 4. Physics & Navigation Engine

### 1. Dual Positioning Solvers
- **Modern 2D+Time Pseudorange Multilateration**: Directly solves the state vector $\mathbf{x} = [x, y, c \cdot b_{rx}]^T$, simultaneously estimating horizontal coordinates $(x, y)$ and receiver clock bias $b_{rx}$ in nanoseconds. Supports cross-chain and all-in-view reception given a common UTC time base (or estimating one receiver clock bias per independent chain), removing the classical requirement for a single shared master station.
- **Classical Hyperbolic TDOA**: Iterative Gauss-Newton solver on range differences $(d_S - d_M)$ relative to a reference master station.

### 2. Atmospheric & Propagation Modeling
- **Primary Factor (PF)**: Configurable atmospheric refractive index $\eta$:
  - RTCM MPS: $\eta = 1.000338$ ($c = 299,792,458\text{ m/s}$)
  - USCG Loran-C User Handbook: $\eta = 1.000284$
  - China National Standard: $\eta = 1.000315$
- **Secondary Factor (SF)**: Empirical polynomial modeling all-seawater groundwave delay (marked UNVERIFIED due to a known ~0.236 µs / ~71 m step discontinuity at 100 statute miles; disabled by default with a visible UI indicator `Secondary Factor: off (UNVERIFIED model)` wherever results depend on PF+SF+ASF).
- **Additional Secondary Factor (ASF)**: Real-time spatial polynomial and raster evaluation of overland phase delays.

### 3. Cycle Slip Modeling (Boyce 2006)
Simulates wrong-cycle selection where degraded SNR or skywave interference shifts the tracking point away from the 3rd zero crossing, introducing integer $\pm 10\ \mu s$ ($~3\text{ km}$) step errors.

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

## 6. License

Distributed under the [MIT License](LICENSE). See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for third-party acknowledgments.
