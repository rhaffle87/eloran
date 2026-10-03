# Automated Verification & Visual Regression Archive

This directory serves as the automated audit and visual regression evidence repository for **SimuLoran**. Every image in this catalog was captured via automated Playwright test suites across responsive breakpoints, light/dark themes, mathematical visualization tests, and empirical trial benchmarks.

> [!NOTE]
> For the comprehensive end-user walkthrough and high-resolution layout documentation with complete instructions on how to use every screen, see the **[Visual User Guide](../../VISUAL_USER_GUIDE.md)** and the official asset gallery in **[docs/assets/screenshots/](../assets/screenshots/)**.

---

## 1. Directory Structure & Classification

The verification screenshots in this folder validate design integrity, responsive reflow, and mathematical rendering across six primary verification vectors:

```
docs/verification/screenshots/
|-- [Responsive Viewports]     # 1280px (Desktop), 768px (Tablet), 390px/360px (Mobile)
|-- [Dual-Theme Regression]    # Side-by-side Dark Mode vs Light Mode rendering
|-- [Canvas & Radar Engine]    # Collinear alignment, radial beams, LOP hyperbolas
|-- [RF Waveform Oscilloscope] # SZC zero-crossings, Doherty skywave, FFT spectra
|-- [Sidebar & Controls]       # Collapsible sidebars, tooltips, slider ranges
`-- [Empirical Benchmarks]     # Korean Testbed, Maoming trial, Millington ASF maps
```

---

## 2. Multi-Viewport Responsive Matrix

Every major view is systematically checked against three standardized viewport profiles:
1. **Desktop Viewport** (`1280x900` or `1440x900`): Full multi-column layout with pinned sidebars and multi-pane telemetry.
2. **Tablet Viewport** (`768x1024`): Collapsed or accordion control drawer, responsive map canvas, fluid tab bars.
3. **Mobile Viewport** (`390x844` / `360x740`): Vertical stacking, touch-first card drawer, compact telemetry badge.

| Screen / Page | Desktop (1280px) | Tablet (768px) | Mobile (390px / 360px) |
|:---|:---:|:---:|:---:|
| **Home Dashboard** | `home_dark_1280px.png`<br>`home_light_1280px.png` | `home_dark_768px.png`<br>`home_light_768px.png` | `home_dark_390px.png`<br>`home_360px.png` |
| **Loran-C Hyperbolic** | `loran-c_dark_1280px.png`<br>`loran-c_light_1280px.png` | `loran-c_dark_768px.png`<br>`loran-c_light_768px.png` | `loran-c_dark_390px.png`<br>`loran-c_light_390px.png` |
| **eLoran Multilateration** | `eloran_dark_1280px.png`<br>`eloran_light_1280px.png` | `eloran_dark_768px.png`<br>`eloran_light_768px.png` | `eloran_dark_390px.png`<br>`eloran_light_390px.png` |
| **RF Waveforms Workbench** | `waveforms_dark_1280px.png`<br>`waveforms_light_1280px.png` | `waveforms_dark_768px.png`<br>`waveforms_light_768px.png` | `waveforms_dark_390px.png`<br>`waveforms_light_390px.png` |
| **Learn Theory & KaTeX** | `learn_dark_1280px.png`<br>`learn_light_1280px.png` | `learn_dark_768px.png`<br>`learn_light_768px.png` | `learn_dark_390px.png`<br>`learn_light_390px.png` |
| **About & Specifications** | `phase5_verified_about_dark_1280px.png` | `phase5_verified_about_dark_768px.png` | `phase5_verified_about_dark_390px.png` |

---

## 3. High-Fidelity Canvas & Radar Visual Verifications

| Screenshot Artifact | Verification Objective | Key Verification Criteria |
|:---|:---|:---|
| `live_prod_collinear_alignment.png` | Collinear geometry & baseline singularity | Hyperbolic LOP asymptote convergence along baseline extensions without singularity divergence or NaN clipping. |
| `live_prod_eloran_alignment.png` | eLoran all-in-view multilateration | Least-squares / WLS fix intersection, radial bearing vectors, and Dilution of Precision error ellipse. |
| `live_prod_loran_c_alignment.png` | Hyperbolic LOP mesh | Master-Secondary hyperbolic curve rendering with correct phase code balance and color-coded stations. |
| `radar_declutter_radials_off.png` | Tactical display declutter (Radials OFF) | Clean nautical display showing only active station markers, fix target, and hyperbolic contours. |
| `radar_declutter_radials_on.png` | Tactical display declutter (Radials ON) | Visual radials connecting receiver to stations with distance/bearing tags. |
| `p2_radar_canvas_dark.png` | Radar canvas contrast (Dark Mode) | Dark polar grid reticle with high-contrast phosphor-green markers and cyan fix centroid. |
| `p2_radar_canvas_light.png` | Radar canvas contrast (Light Mode) | Crisp high-contrast oceanic blue background with clear maritime symbols. |

---

## 4. RF Waveform & Oscilloscope Audits

| Screenshot Artifact | Verification Objective | Key Verification Criteria |
|:---|:---|:---|
| `oscilloscope_dark_with_skywave.png` | Groundwave vs Skywave interference | Composite RF pulse rendering with ionospheric skywave delay (tau_sky = 37.5 us) and SSR = 0.5 ratio. |
| `oscilloscope_light_pulse_zoom.png` | Standard 100 kHz pulse envelope | Peak envelope at t = 65 us, SZC at t = 30 us zero-crossing, and 99% spectral containment verification. |
| `oscilloscope_light_multi_arrivals.png` | Multi-hop skywave reflections | Verification of 1-hop E-layer, 1-hop F-layer, and 2-hop composite signal superposition. |
| `export_pulse_trace_dark_mode.png` | High-res PNG waveform export | Verification of off-screen SVG-to-Canvas export pipeline with crisp axes and title overlays. |
| `p6_katex_waveforms_formulas.png` | Math rendering in oscilloscope lab | KaTeX rendering of envelope equation $i(t) = A (t-\tau)^2 e^{-2(t-\tau)/65} \sin(0.2\pi t)$. |

---

## 5. UI Controls, Sidebars & Modals

| Screenshot Artifact | Verification Objective | Key Verification Criteria |
|:---|:---|:---|
| `sidebar_eloran_asf_dark.png` | Additional Secondary Factor controls | Millington multi-segment terrain conductivity inputs, seawater/freshwater dielectric sliders. |
| `sidebar_eloran_fusion_dark.png` | GNSS/eLoran sensor fusion panel | Kalman filter Q/R noise sliders, anti-spoofing detector thresholds, and jamming resilience switch. |
| `sidebar_loran_c_chain_design_dark.png` | Chain design & GRI timing | GRI input (40,000 - 99,990 us), secondary emission delays (CD, ED), and master sync triggers. |
| `mission_pack_modal_verified.png` | Scenario configuration modal | Mission pack import/export modal with JSON syntax preview and schema validation badges. |
| `telemetry_console_expanded.png` | Expanded live telemetry | NMEA 0183 output log (`$ECGLL`, `$ECBWC`, `$PDEV`), fix confidence metrics, and copy controls. |
| `tooltip_edge_check.png` | Tooltip positioning & boundary clamp | Tooltip box auto-repositioning to stay within viewport bounds near edges. |

---

## 6. Empirical Validation Trial Proofs

| Screenshot Artifact | Benchmark Testbed | Reference Literature & Results |
|:---|:---|:---|
| `trial_validation_korea.png` | Korean eLoran Testbed | Incheon/Pyeongtaek port trial (2021) achieving < 20m 95% accuracy with differential ASF corrections. |
| `trial_validation_maoming.png` | South China Sea Trial | Maoming station skywave delay and baseline attenuation validation. |
| `learn_empirical_benchmarks.png` | Theoretical vs Empirical Analysis | Side-by-side error budget comparison (Loran-C ~460m vs eLoran ~8m vs GNSS spoofed). |

---

## 7. How to Re-generate or Run Verifications

Visual regression runs are driven by Playwright e2e tests located under the `e2e/` folder.

```bash
# Run standard e2e test suite (headless)
npm test

# Run visual capture suite and update screenshots
$env:RUN_CAPTURE="true"
npx playwright test e2e/capture-user-guide.spec.js

# Run full cross-browser regression audit
npx playwright test --project=chromium
```
