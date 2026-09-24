# Extraction Notes: ACTIFE Loran-C & eLoran to Standalone "LORAN LAB"

## 1. Overview
This document records the architectural and mathematical extraction of the Loran-C and eLoran modules from ACTIFE (`actife/`) to the standalone **LORAN LAB** application (`eloran/`).

All core physics, timing models, geospatial transforms, and numerical solvers from ACTIFE are cataloged below, along with identified quirks, bug fixes, and security improvements.

---

## 2. Mathematical Models & Physics Formulas

### 2.1 Constants
- Speed of light: $c = 299,792,458\text{ m/s}$ (`299792458`)
- WGS84 Mean Earth Radius: $R = 6,371,000\text{ m}$
- Standard Loran Carrier Frequency: $f_0 = 100\text{ kHz}$ ($100,000\text{ Hz}$)
- Nominal Pulse Duration: $T_p = 100\,\mu\text{s}$ ($0.0001\text{ s}$)
- Projections: EPSG:4326 (WGS84 Lat/Lng degrees) and EPSG:3857 (Spherical Mercator meters)

### 2.2 Geodesics & Distance
- **Haversine Distance**:
  $$\Delta\sigma = 2 \arcsin \sqrt{\sin^2\left(\frac{\Delta\phi}{2}\right) + \cos(\phi_1)\cos(\phi_2)\sin^2\left(\frac{\Delta\lambda}{2}\right)}$$
  $$d = R \cdot \Delta\sigma$$
- **Local Cartesian Projection** (for fast planar solver iterations around reference latitude $\phi_0$):
  $$x = (\lambda - \lambda_0) \cdot \frac{\pi}{180} \cdot R \cos\left(\phi_0 \frac{\pi}{180}\right)$$
  $$y = (\phi - \phi_0) \cdot \frac{\pi}{180} \cdot R$$

### 2.3 Signal Propagation & Arrival Timing (eLoran)
For a station $i$ (master $M$ or secondary/slave $S$) emitting at time $t_{emit}$ to a receiver at $(\phi, \lambda)$:
$$t_{arr} = t_{emit} + \frac{d}{c} + t_{offset} + \Delta t_{clock}(t) + \frac{ASF(\phi, \lambda) - \text{diffCorr}}{c} + \epsilon$$

Where:
- Geometric Delay: $t_{prop} = \frac{d}{c}$
- Station Emission/Coding Delay: $t_{offset}$ (e.g. secondary coding delays)
- Clock Bias & Drift Model:
  $$\Delta t_{clock}(t) = \text{biasSec} + \text{driftPerSec} \times t$$
  - **Cesium**: bias $\approx 10^{-9}\text{ s}$, drift $\approx 10^{-13}\text{ s/s}$
  - **GPS-Disciplined**: bias $\approx 10^{-8}\text{ s}$, drift $\approx 10^{-12}\text{ s/s}$
  - **Local Quartz/OCXO**: bias $\approx 10^{-6}\text{ s}$, drift $\approx 10^{-8}\text{ s/s}$
- **ASF (Additional Secondary Factor)**: Delay in meters caused by land-path conductivity and topography.
- **Differential Corrections**: Broadcast via eLoran data channel (Eurofix / 9th pulse DDS), applied as $- \frac{\text{diffCorr}}{c}$.
- Detection Jitter / Noise: Gaussian white noise $\epsilon \sim \mathcal{N}(0, \sigma_{jitter}^2)$.

### 2.4 Hyperbolic TDOA (Time Difference of Arrival)
For secondary station $S$ and master station $M$:
$$TDOA_{S-M} = t_{arr, S} - t_{arr, M}$$
When plotted in space, the locus of points where $TDOA_{S-M} = \text{constant}$ forms a hyperbola whose foci are $M$ and $S$.

### 2.5 Position Solver (Iterative Gauss-Newton)
Given $K$ pairs of $(M, S_k)$ with measured $TDOA_k$:
Modeled delay difference:
$$h_k(x, y) = \frac{\sqrt{(x - x_{S_k})^2 + (y - y_{S_k})^2} - \sqrt{(x - x_M)^2 + (y - y_M)^2}}{c}$$
Residual:
$$r_k = TDOA_k - h_k(x, y)$$
Jacobian matrix $J \in \mathbb{R}^{K \times 2}$:
$$J_{k, 1} = \frac{1}{c} \left( \frac{x - x_{S_k}}{d_{S_k}} - \frac{x - x_M}{d_M} \right), \quad J_{k, 2} = \frac{1}{c} \left( \frac{y - y_{S_k}}{d_{S_k}} - \frac{y - y_M}{d_M} \right)$$
Normal equations:
$$(J^T J) \Delta \mathbf{x} = J^T \mathbf{r} \implies \Delta \mathbf{x} = (J^T J)^{-1} J^T \mathbf{r}$$
Iteration continues until $\|\Delta \mathbf{x}\| < 10^{-6}\text{ m}$ or $\text{iter} \ge 30$.

### 2.6 Covariance, GDOP & Horizontal Protection Level (HPL)
- Residual variance:
  $$\sigma^2 = \frac{1}{\max(1, K - 2)} \sum_{k=1}^K r_k^2$$
- Error Covariance Matrix (meters$^2$):
  $$\mathbf{C} = \sigma^2 (J^T J)^{-1}$$
- **GDOP (Geometric Dilution of Precision)**:
  $$H = c \cdot J \quad (\text{unitless directional gradients})$$
  $$GDOP = \sqrt{\text{trace}\left((H^T H)^{-1}\right)}$$
  $$HDOP = \sqrt{(H^T H)^{-1}_{11} + (H^T H)^{-1}_{22}}$$
- **HPL (Horizontal Protection Level)**:
  Let $\lambda_1$ be the maximum eigenvalue of the horizontal covariance $\mathbf{C}_{2 \times 2}$:
  $$\lambda_{1,2} = \frac{\text{trace}(\mathbf{C})}{2} \pm \sqrt{\left(\frac{\text{trace}(\mathbf{C})}{2}\right)^2 - \det(\mathbf{C})}$$
  $$HPL = 3 \sqrt{\max(0, \lambda_1)} \quad (3\sigma \approx 99.7\% \text{ integrity bound})$$

### 2.7 Marching Squares & Polyline Simplification
- 2D scalar field evaluated over an $N_x \times N_y$ regular grid.
- Marching Squares 16-case lookup table with center-average disambiguation for saddle cases (cases 5 and 10).
- Contours extracted as linked polylines and simplified via the Ramer–Douglas–Peucker (RDP) algorithm with perpendicular distance threshold $\epsilon$.

### 2.8 RF Signal Synthesis
- Pulse Envelope (Raised Cosine / Hann):
  $$E(t) = \begin{cases} 0.5 \left(1 + \cos\left(\frac{\pi t}{T_p}\right)\right), & 0 \le t \le T_p \\ 0, & \text{otherwise} \end{cases}$$
- Full RF Carrier Synthesis:
  $$s(t) = E(t) \cdot \sin(2\pi f_0 t)$$
- Group Repetition Interval (GRI): Periodic pulse bursts spaced by $GRI \times 10\,\mu\text{s}$ (e.g. GRI 8330 = $83.30\text{ ms}$).

### 2.9 GNSS-eLoran Fusion
- Weighted least-squares fusion between eLoran estimated position $\mathbf{x}_E$ and simulated GNSS fix $\mathbf{x}_G$:
  $$\mathbf{x}_{fused} = w_E \mathbf{x}_E + w_G \mathbf{x}_G \quad (w_E = 0.6, w_G = 0.4)$$
  $$\mathbf{C}_{fused} = w_E^2 \mathbf{C}_E + w_G^2 \mathbf{C}_G$$

---

## 3. Quirks, Discrepancies & Bugs Found in ACTIFE

1. **Unsafe `new Function` / `eval` for ASF Expressions**:
   - `asfWorker.js` and `Eloran.jsx` evaluated user code directly via `new Function('lat', 'lng', 'with(Math){ ' + code + ' }')`.
   - **Fix**: Replaced with a safe, tokenized, whitelisted AST expression parser supporting standard math functions (`sin`, `cos`, `tan`, `sqrt`, `abs`, `log`, `exp`, `+`, `-`, `*`, `/`, `^`, parentheses, `lat`, `lng`). No `eval` or `new Function`.

2. **Underdetermined Gauss-Newton Covariance & Scale Defect**:
   - In `Eloran.jsx`, if $K \le 2$ (e.g. only 1 or 2 slave stations), $K - 2 \le 0$, resulting in $\sigma^2 = 0$ and $HPL = 0$, giving false confidence.
   - **Crucial Bug Discovered**: In `Eloran.jsx` line 907 and `Loranc.jsx`, Jacobian elements were divided by $c \approx 3 \times 10^8$, making $(J^T J)$ entries of order $10^{-17}$ and $\det(J^T J) \approx 10^{-34}$. The code checked `if (Math.abs(det) < 1e-12) break;`, which caused the solver to **always abort on iteration 0 without taking even a single step**, returning the unadjusted initial guess.
   - **Fix**: Reformulated the Gauss-Newton equations in range-difference meter space where Jacobian elements are unitless direction vectors $\approx 1$, normal matrix determinant is $\sim 1$, and normal convergence thresholds apply. Fallback to $\sigma_{nominal} = 10\text{ ns}$ ($3\text{ m}$) ensures valid covariance and realistic HPL bounds.

3. **Missing True GDOP Map Calculation**:
   - ACTIFE claimed GDOP in its documentation, but only performed receiver estimation point checks.
   - **Fix**: Implemented live GDOP computation at cursor/receiver coordinates, plus a grid-based GDOP heatmap layer to visualize geometric degradation across the coverage basin.

4. **RF Pulse Plot Missing 100 kHz Carrier**:
   - `Waveforms.jsx` in ACTIFE plotted only the low-frequency envelope $0.5(1+\cos(\cdot))$, omitting the 100 kHz carrier oscillations.
   - **Fix**: Provided toggles for Envelope view and full RF Carrier view ($100\text{ kHz}$ high-resolution sample).

5. **State Duplication & Monolithic Components**:
   - `Loranc.jsx` (1,329 lines) and `Eloran.jsx` (1,487 lines) duplicated map initialization, marker handlers, PapaParse logic, and solver math.
   - **Fix**: Extracted all physics into pure modular library files in `src/lib/` and managed shared simulation state with Zustand.

---

## 4. Extraction & Implementation Plan

1. **Scaffold Project**:
   - Initialize Vite + React 19 + Tailwind CSS v4 in `eloran/`.
   - Configure dependencies: `zustand`, `maplibre-gl`, `proj4`, `turf`, `papaparse`, `lucide-react`, `vitest`.
   - Configure Vite manual chunks (`react`, `maplibre`).
2. **Implement Core Physics Library (`src/lib/`)**:
   - `geodesy.js`: Haversine, bearing, destination, coordinate transforms (WGS84 $\leftrightarrow$ EPSG:3857).
   - `tdoa.js`: Arrival times, hyperbolic LOP equations, iterative Gauss-Newton solver.
   - `gdop.js`: Line-of-sight unit vectors, normal matrix inversion, GDOP/HDOP metrics.
   - `asf.js`: Safe AST parser for user formulas and spatial raster evaluation.
   - `clocks.js`: Oscillator models (cesium, GPS-disciplined, quartz) with drift and bias.
   - `dds.js`: 9th-pulse / Eurofix DDS message simulation and telemetry logging.
   - `fusion.js`: GNSS fix simulation and weighted sensor fusion.
   - `pulse.js`: 100 kHz RF carrier synthesis, envelope generation, and GRI pulse grouping.
   - `contours.js`: Marching Squares zero/multi-level extractor + Ramer-Douglas-Peucker decimation.
   - `stations.js`: Station schemas, CSV parser and exporter with full validation.
3. **Comprehensive Unit Testing (`tests/`)**:
   - Unit tests covering all `src/lib/` math (TDOA symmetry, GDOP on known geometry, geodesic distances, RDP decimation, safe AST evaluator, CSV round-trip).
4. **Web Workers (`src/workers/`)**:
   - `gridWorker.js`: Off-thread 2D TDOA computation and marching squares contour extraction with cancellation tokens and transferable buffers.
   - `asfWorker.js`: Batch spatial evaluation using the safe expression evaluator.
5. **State Management (`src/state/`)**:
   - Unified Zustand store holding stations, simulation results, display settings, clock parameters, and scenario presets.
6. **UI Components & Pages**:
   - Modern radar-console aesthetic (dark zinc/cyan theme, monospace telemetry, collapsible panels).
   - Pages: Home (`/`), Loran-C (`/loran-c`), eLoran (`/eloran`), RF Waveforms (`/waveforms`), Learn (`/learn`), About (`/about`).
   - Interactive MapLibre GL viewer with station markers, baseline vectors, LOP contours, and GDOP overlay.
7. **Verification**:
   - Run Vitest suite (`npm test`), linting (`npm run lint`), and production build (`npm run build`).
