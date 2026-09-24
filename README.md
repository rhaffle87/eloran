# LORAN LAB

> **High-Fidelity Loran-C & eLoran Simulation Suite**  
> An interactive, physics-based radio-navigation engineering laboratory for hyperbolic time-difference of arrival (TDOA) positioning, oscillator stability, Additional Secondary Factor (ASF) modeling, and GNSS-resilient multi-sensor fusion.

---

## 1. Overview & Motivation

Global Navigation Satellite Systems (GNSS: GPS, Galileo, BeiDou, GLONASS) transmit ultra-low-power microwave signals (~1.5 GHz) from ~20,000 km in medium Earth orbit. As a consequence, satellite signals are highly susceptible to intentional jamming, spoofing, multipath degradation, and solar space weather events.

**eLoran (enhanced Loran)** is the internationally standardized, terrestrial, low-frequency (100 kHz) navigation system providing high-power (hundreds of kilowatts to megawatts), unjammable, autonomous Positioning, Navigation, and Timing (PNT).

**LORAN LAB** is a standalone, web-based engineering simulation suite designed to model, visualize, and analyze hyperbolic radio navigation chains with mathematical rigor.

---

## 2. System Architecture

```
eloran/
├── docs/
│   └── EXTRACTION_NOTES.md      # Physics formulas, extraction specs & legacy bug audit
├── public/
│   └── examples/                # Real-world station chain CSV presets
│       ├── stations_example.csv     # Jakarta 3-station chain
│       ├── stations_north_sea.csv   # North Sea European eLoran chain
│       └── stations_east_asia.csv   # East Asia 9930 chain
├── src/
│   ├── lib/                     # Pure, testable mathematical library (zero UI coupling)
│   │   ├── geodesy.js           # Haversine, forward/inverse geodesics, local tangent plane
│   │   ├── tdoa.js              # TDOA pairs, well-conditioned Gauss-Newton solver, HPL
│   │   ├── gdop.js              # Direction cosines, GDOP/HDOP geometry matrix, heatmaps
│   │   ├── asf.js               # Safe recursive-descent AST formula parser & evaluator
│   │   ├── clocks.js            # Cesium, Rubidium, GPSDO, Quartz drift & bias models
│   │   ├── dds.js               # Eurofix 9th-pulse PPM telemetry generator
│   │   ├── fusion.js            # Weighted covariance GNSS-eLoran multi-sensor fusion
│   │   ├── pulse.js             # 100 kHz carrier, raised-cosine envelope, GRI timing
│   │   ├── contours.js          # Marching squares 2D contouring + RDP simplification
│   │   └── stations.js          # Station schema, validation, CSV/GeoJSON import/export
│   ├── workers/                 # Off-thread Web Workers for high-density compute
│   │   ├── gridWorker.js        # Parallel 2D TDOA grid & contour extraction
│   │   ├── asfWorker.js         # Spatial formula rasterizer
│   │   └── workerClient.js      # Cancellable Promise wrapper with transferable buffers
│   ├── state/
│   │   ├── simulationStore.js   # Single reactive Zustand state store
│   │   └── presets.js           # Calibrated scenarios (Jakarta, North Sea, High GDOP, etc.)
│   ├── components/
│   │   ├── map/                 # MapView (MapLibre GL raster), Contours, Markers, GDOP overlay
│   │   ├── panels/              # StationEditor, ClockPanel, AsfPanel, FusionPanel, DisplayPanel
│   │   ├── charts/              # PulseViewer (oscilloscope with SVG export)
│   │   └── ui/                  # Modal, Slider, Toggle, ErrorBoundary
│   └── pages/                   # Home, LoranC, ELoran, Waveforms, Learn, About
```

---

## 3. Core Modules

### 3.1 Loran-C Simulator (`/loran-c`)
- **Station Chain Management:** Master and secondary (slave) stations with editable coordinates, radiated power ($dBm$), emission delays, and Group Repetition Interval (GRI).
- **Hyperbolic LOPs:** Lines of Position computed via 2D Marching Squares and smoothed with Ramer–Douglas–Peucker (RDP) polygon decimation.
- **Baseline Extensions:** Clear identification of hyperbolic singularity zones where lines of position degenerate into radial lines along the transmitter baseline extensions.
- **2D GDOP Heatmaps:** Spatial calculation of Geometric Dilution of Precision across the regional bounding box.
- **Interactive Receiver:** Drag-and-drop receiver marker with live TDOA time-difference readout and Gauss-Newton position fix.
- **Full CSV Round-Trip:** Drag-and-drop CSV station chain import and export compatible with ACTIFE.

### 3.2 eLoran Simulator (`/eloran`)
- **Atomic Clock Models:** Selectable oscillator physics (Cesium Beam $10^{-13}$, Rubidium $10^{-11}$, GPSDO $10^{-12}$, OCXO $10^{-9}$, Quartz $10^{-6}$) with deterministic drift, initial bias, and Gaussian phase jitter.
- **Spatial ASF Modeling:** Additional Secondary Factor groundwave phase delay modeling with user-defined mathematical formulas safely evaluated via a sandboxed recursive-descent AST parser (zero `eval`).
- **Eurofix DDS Telemetry:** 9th-pulse pulse-position modulation (PPM) telemetry broadcasting differential corrections, integrity alerts, and UTC synchronization messages.
- **GNSS-eLoran Multi-Sensor Fusion:** Simultaneous measurement simulation of microwave GNSS and LF eLoran with weighted covariance fusion, demonstrating continuity during GNSS spoofing or jamming.
- **Asynchronous Compute:** Background Web Workers compute dense grids with transferable `Float32Array` buffers and automatic stale-job cancellation.

### 3.3 RF Waveform Lab (`/waveforms`)
- **100 kHz Pulsed Carrier:** Raised-cosine pulse envelope synthesis ($t^2 e^{-2t/65}$) sampled at up to 10 MHz.
- **Multi-Station GRI Pulse Trains:** Group Repetition Interval timing with phase-coding and individual emission delays.
- **Receiver Time-of-Arrival (TOA):** Direct visualization of propagation delays from transmitter to receiver.
- **Ionospheric Skywave Reflection:** Modeling delayed, phase-shifted skywave bounces arriving after the groundwave.
- **Direct SVG Export:** One-click vector graphic export of oscilloscope captures for engineering reports.

---

## 4. Physics & Mathematical Formulation

### 4.1 Propagation & Hyperbolic TDOA
Signal propagation follows the speed of light in air:
$$c = 299,792,458\text{ m/s}$$

For a receiver at position $\mathbf{x}$, the Time Difference of Arrival $\Delta t_i$ between secondary station $S_i$ and master station $M$ is:
$$\Delta t_i = \left(\frac{\|\mathbf{x} - \mathbf{x}_{S_i}\|}{c} + \tau_{S_i} + \Delta\tau_{\text{ASF}, S_i}\right) - \left(\frac{\|\mathbf{x} - \mathbf{x}_M\|}{c} + \tau_M + \Delta\tau_{\text{ASF}, M}\right)$$

### 4.2 Well-Conditioned Gauss-Newton Solver
In LORAN LAB, the nonlinear TDOA hyperbolic intersection problem is formulated in **range-difference meter space**:
$$f_i(\mathbf{x}) = \|\mathbf{x} - \mathbf{x}_{S_i}\| - \|\mathbf{x} - \mathbf{x}_M\| - c \cdot (\Delta t_i - \Delta\tau_i)$$

The Jacobian elements are dimensionless unit vectors:
$$J_{i,1} = \frac{x - x_{S_i}}{d_{S_i}} - \frac{x - x_M}{d_M}, \quad J_{i,2} = \frac{y - y_{S_i}}{d_{S_i}} - \frac{y - y_M}{d_M}$$

The iterative update is computed via normal equations:
$$\Delta\mathbf{x} = (J^T J)^{-1} J^T \Delta\mathbf{r}$$

This formulation guarantees $\det(J^T J) \sim 1$ (eliminating the legacy numerical cancellation bug).

---

## 5. Getting Started

### Prerequisites
- Node.js 18+ (tested on Node.js 20 and 22)
- npm 9+

### Installation & Run
```bash
# Clone or navigate into eloran directory
cd e:/Projects/lmao/eloran

# Install dependencies
npm install

# Start local Vite development server
npm run dev
```

Visit `http://localhost:5173` in your browser.

### Verification & Testing
```bash
# Run unit test suite (Vitest)
npm test

# Run ESLint check
npm run lint

# Build production bundle
npm run build

# Preview production build locally
npm run preview
```

---

## 6. Screenshots & Interface

```
+-----------------------------------------------------------------------------------+
|  LORAN LAB  v1.0    [Loran-C]  [eLoran Simulator]  [RF Waveforms]  [Theory]       |
+-------------------------+---------------------------------------------------------+
| STATIONS & PARAMETERS   | INTERACTIVE MAP / OSCILLOSCOPE                          |
| - Master: TanjungPriok  |                                                         |
| - Slave 1: Tangerang    |           (M)                                           |
| - Slave 2: Bekasi       |          /   \                                          |
|                         |    -----(  R  )----- [Hyperbolic LOPs]                  |
| [TDOA Fix: VALID]       |          \   /                                          |
| - Lat: -6.1500°         |           (S1)       (S2)                               |
| - Lon: 106.8200°        |                                                         |
| - GDOP: 1.42 (Optimal)  | [LIVE GDOP HEATMAP: 0.8 - 4.5]                          |
| - HPL (95%): 14.2 m     | [RECEIVER DRAG: Real-time 60fps]                        |
+-------------------------+---------------------------------------------------------+
| OSCILLATOR: Cesium Beam (1e-13) | ASF: 15*sin((lat/10)*pi) | DDS: Active (Eurofix) |
+-----------------------------------------------------------------------------------+
```

---

## 7. Extraction & Legacy Audit Notes

LORAN LAB was extracted and cleanly re-engineered from the Loran modules of **ACTIFE**.

### Critical Legacy Bug Fix
In original implementations, Jacobian entries were evaluated in seconds ($J_i \sim 1/c \approx 3.3 \times 10^{-9}$), producing normal matrix determinants on the order of $\det(J^T J) \approx 10^{-34}$. Legacy code contained guards of the form:
```javascript
if (Math.abs(det) < 1e-12) break; // ABORTED ON ITERATION 0!
```
This caused the legacy solver to abort on the very first iteration without updating the position, masking errors by returning the initial guess. LORAN LAB reformulates all equations into range-difference meter space where determinant values are numerically well-conditioned ($\sim 1$), converging reliably within 4 iterations.

### Sandboxed ASF Expression Parser
Legacy user-defined ASF formulas relied on raw string evaluations. LORAN LAB replaces this with a strictly sandboxed, recursive-descent Abstract Syntax Tree (AST) tokenizer and evaluator. Prototype pollution and code injections are mathematically impossible.

---

## 8. Technology Stack & Licensing

- **Framework:** React 19, Vite 7, React Router v7
- **Styling:** Tailwind CSS v4, Lucide Icons
- **Mapping:** MapLibre GL with free, open raster basemaps (Carto Dark / OpenStreetMap — zero proprietary tokens or paid APIs required)
- **Math & Geodesy:** Pure JavaScript, Turf.js, Proj4, PapaParse
- **State Management:** Zustand
- **Testing:** Vitest
- **Deployment:** 100% static client-side bundle (Vercel, Netlify, GitHub Pages compatible)

### Attribution
Extracted and refactored from the **ACTIFE** open-source navigation workbench.
Original Loran concepts, parameters, and algorithms preserved and enhanced.
