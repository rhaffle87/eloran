# SIMULORAN — Comprehensive UX, Visual & Functional Audit Report
**Date**: September 27, 2026  
**Auditor**: Antigravity Pair-Programming Agent (Advanced Agentic Architecture)  
**Branch**: `audit/ux-holistic`  
**Reference Commit**: `4ad98d9` (post-Physics Phase 2 verification)  
**Scope**: Full application visual inspection across 6 routes, 3 viewports (1280px desktop, 768px tablet, 390px mobile), 2 themes (Light & Dark) — 36 baseline screenshots captured in `docs/verification/screenshots/audit_baseline_*.png`.

---

## 1. Executive Summary & Audit Methodology

This report serves as the formal Phase 1 deliverable for the **Holistic UX/Visual Audit, Radar Map Rehaul, Sidebar Decluttering, and Full Functional QA** initiative. In accordance with the Phase 1 protocol:
- **No production code has been modified in this phase.**
- Every finding is anchored directly to an empirical artifact: an exact screenshot reference (`docs/verification/screenshots/audit_baseline_*.png`) and an exact code location (`file:line`).
- This document functions as the master punch list governing Phases 2, 3, 4, and 5.

### Baseline Capture Scope (Phase 0)
Using [`scripts/capture-audit-baseline.cjs`](file:///E:/Projects/simuloran/scripts/capture-audit-baseline.cjs) with Playwright, 36 full-page high-resolution PNGs were captured:
- **Routes**: `/` (Home), `/eloran` (eLoran Simulator), `/loran-c` (Loran-C Simulator), `/waveforms` (RF Waveforms & Cycle Selection Lab), `/learn` (Theory Foundations), `/about` (System Specifications & Benchmarks).
- **Viewports**: 1280×800 (Desktop), 768×1024 (Tablet), 390×844 (Mobile).
- **Themes**: Light Mode (`data-theme="light"`), Dark Mode (`data-theme="dark"`).
- **Storage**: [`docs/verification/screenshots/audit_baseline_{page}_{theme}_{viewport}.png`](file:///E:/Projects/simuloran/docs/verification/screenshots/).

---

## 2. Category 1: Visual Inconsistency

Visual inconsistencies across component cards, padding, corner radii, badge styling, and theme color tokens doing identical jobs across panels.

| Finding ID | Component | File & Line | Screenshot Reference | Description | Punch List Target |
|---|---|---|---|---|---|
| **VI-01** | `TrialValidationPanel` | [`TrialValidationPanel.jsx:21, 42, 73, 147`](file:///E:/Projects/simuloran/src/components/panels/TrialValidationPanel.jsx#L21) | `audit_baseline_about_light_1280px.png` | **Hardcoded Dark Palette**: Uses hardcoded Tailwind utility classes (`bg-zinc-900`, `bg-zinc-950`, `border-zinc-800`, `text-zinc-100`) rather than semantic CSS tokens (`var(--bg-surface)`, `var(--border-subtle)`). When rendered in Light Mode (on the About page or in the AsfPanel benchmark drawer), the card remains pitch black with white text, violating the application-wide theme system. | Phase 3 / Phase 5 |
| **VI-02** | Panel Cards Corner Radii | `FusionPanel.jsx:101`, `ClockPanel.jsx:44`, `DisplayPanel.jsx:365`, `StationEditor.jsx:202` | `audit_baseline_eloran_dark_1280px.png` | **Inconsistent Card Border-Radius**: Sub-cards doing the exact same data-display job use divergent corner radii: `rounded` (4px in `FusionPanel.jsx:101`), `rounded-lg` (8px in `ClockPanel.jsx:44` and `StationEditor.jsx:202`), and `rounded-xl` (12px in `DisplayPanel.jsx:365`). Standardize all internal panel cards to `rounded-lg` (8px) and top container shells to `rounded-xl` (12px). | Phase 3 |
| **VI-03** | Panel Cards Internal Padding | `FusionPanel.jsx:101`, `StationEditor.jsx:202`, `DisplayPanel.jsx:365`, `TrialValidationPanel.jsx:21` | `audit_baseline_eloran_light_1280px.png` | **Card Padding Mismatch**: Card internal spacing fluctuates arbitrarily between `p-2.5` (`FusionPanel.jsx:101`, `StationEditor.jsx:202`), `p-3` (`ClockPanel.jsx:44`), `p-4` (`DisplayPanel.jsx:365`), and `p-5` (`TrialValidationPanel.jsx:21`). Standardize internal card padding to `p-3` for compact panels. | Phase 3 |
| **VI-04** | Status & Provenance Badges | `StationEditor.jsx:222`, `ChainDesignPanel.jsx:471`, `Navbar.jsx:32` | `audit_baseline_eloran_light_1280px.png`, `audit_baseline_loran-c_light_1280px.png` | **Badge Padding & Radius Inconsistency**: Station role badges use `text-[9px] px-1 py-0.5 rounded font-mono`, Planning threshold badge uses `px-1.5 py-0.2 rounded text-[8px]`, and Navbar version badge uses `text-[9px] px-1 py-0.2 rounded`. Note that `py-0.2` is not valid standard Tailwind CSS. Standardize to `px-1.5 py-0.5 rounded text-[10px]`. | Phase 3 / Phase 5 |
| **VI-05** | Top Container Corner Radii | `About.jsx:83, 151`, `Learn.jsx:100`, `Home.jsx:42` | `audit_baseline_about_light_1280px.png`, `audit_baseline_learn_light_1280px.png` | **Page Container Curvature Divergence**: Documentation cards in About and Learn use `rounded-2xl` (16px), whereas Home module cards use `rounded-xl` (12px) and simulator drawers use `rounded-none` or `rounded-l-2xl`. Standardize top cards to `rounded-xl`. | Phase 5 |
| **VI-06** | Action Button Icon Sizing | `StationEditor.jsx:152, 192, 247`, `ELoran.jsx:275, 295`, `DisplayPanel.jsx:605, 618` | `audit_baseline_eloran_light_1280px.png` | **Icon Sizing Jitter**: Action icons fluctuate without hierarchy: `Plus size={14}`, `Upload size={14}`, `RotateCcw size={12}`, `Trash2 size={13}`, `Compass size={12}`, `Icon size={11}`, `BookOpen size={12}`. Standardize inline action icons to 13px and tab navigation icons to 14px. | Phase 3 |

---

## 3. Category 2: Visual Clutter & Information Density

Visual clutter, competing focal points, and screens exceeding ~5 simultaneous visual anchors.

| Finding ID | Component | File & Line | Screenshot Reference | Description | Punch List Target |
|---|---|---|---|---|---|
| **VC-01** | Map Header Tactical HUD | `MapView.jsx:1120-1183`, `ELoran.jsx:123-175` | `audit_baseline_eloran_light_1280px.png`, `audit_baseline_eloran_light_390px.png` | **5 Competing Focal Points in Map Header**: At the top of the map hero, the user eye is pulled simultaneously to (1) `MODE: PAN` indicator badge, (2) basemap switcher pill (`OpenFreeMap \| OSM \| CARTO \| Radar`), (3) Tactical mode toolbar (`Pan +M +S +R`), (4) Drawer expand toggle button (`<`), and (5) Active station markers. Unify mode display into the toolbar and streamline the top header. | Phase 2 / Phase 5 |
| **VC-02** | `Radar Canvas` Vector Clutter | `MapView.jsx:860-988` | (Identified in `MapView.jsx` implementation) | **Spiderweb Clutter in Offline Radar Mode**: Radar mode draws (1) geographic graticule lines with coordinates every 0.05° to 2°, (2) 9 concentric range rings with distance labels, (3) 12 radial bearing lines with angular degree labels, (4) center reticle crosshair, and (5) bottom watermark all simultaneously. When active stations, baselines, and hyperbolic LOPs are visible, the screen becomes an unreadable mesh of competing lines. Provide a toggle or reduce default graticule/radial line density. | Phase 2 |
| **VC-03** | `ChainDesignPanel` Alert Stack | `ChainDesignPanel.jsx:66-105` | `audit_baseline_eloran_dark_1280px.png` | **Triple Alert Box Stack**: `ChainDesignPanel` stacks 3 distinct alert/header boxes before showing any interactive controls: (1) global top banner `EducationalDisclaimerBanner`, (2) inner amber card `Educational Simulator Disclaimer`, and (3) `Chain Design & Planning` header box. Consolidate educational caveats into tooltips and remove duplicate disclaimers. | Phase 3 |
| **VC-04** | `AsfPanel` Inline Benchmark Drawer | `AsfPanel.jsx:786-808` | `audit_baseline_eloran_light_1280px.png` | **1000px Vertical Sprawl in Sidebar**: Clicking "View Benchmarks" inside AsfPanel mounts the entire 345-line `TrialValidationPanel` with two large benchmark tables inside the 320px–420px sidebar column, creating severe information density overload. Replace with a compact summary card and a direct modal or link to `/about#benchmarks`. | Phase 3 |
| **VC-05** | `DisplayPanel` Provenance Wall | `DisplayPanel.jsx:348-356, 375-384` | `audit_baseline_eloran_light_1280px.png` | **Repeated Inline Provenance Tags**: `DisplayPanel` displays two static pills ("Model: Boyce ILA 2006 (SOURCED)", "Noise: Rhee et al. 2021 (SOURCED)") and then immediately repeats "(SOURCED, ILA 2006)", "(SOURCED, Boyce Eq. 6)", "(SOURCED, Boyce Eq. 5)" inside the `<select>` options. Move these citations into accessible `InfoTooltip` instances. | Phase 3 |

---

## 4. Category 3: Text Bugs, Truncation, Terminology & Encoding Glitches

Typos, truncated strings, terminology inconsistencies, encoding errors, and broken navigation links.

| Finding ID | Component | File & Line | Screenshot Reference | Description | Punch List Target |
|---|---|---|---|---|---|
| **TB-01** | `CycleSelectionPanel` | [`CycleSelectionPanel.jsx:124, 143, 152, 179, 200, 320, 329, 334, 347, 350`](file:///E:/Projects/simuloran/src/components/charts/CycleSelectionPanel.jsx#L200) | `audit_baseline_waveforms_light_1280px.png`, `audit_baseline_waveforms_dark_1280px.png` | **CRITICAL: Doubly-Encoded UTF-8 Mojibake**: Multiple mathematical formulas and labels in `CycleSelectionPanel.jsx` suffer from double-encoding mojibake: (1) Line 200: `Total SNR [dB] = 10 Â· logâ‚ â‚€(N Â· SNR)` (should be `10 · log₁₀(N · SNR)`), (2) Line 143 & 152: `28 Âµs` / `42 Âµs` (should be `28 µs` / `42 µs`), (3) Line 179: `â °`, `â »Â¹`, `â »Â²`, `â »Â³`, `â »â ´` (should be `⁰`, `⁻¹`, `⁻²`, `⁻³`, `⁻⁴`), (4) Line 329: `Ï„ = 30 Âµs (Ideal Ratio â‰ˆ ...)` (should be `τ = 30 µs (Ideal Ratio ≈ ...)`), (5) Line 350: `Ïƒ_ECD_Old = 42 / âˆš(N Â· SNR) Âµs` (should be `σ_ECD_Old = 42 / √(N · SNR) µs`). | Phase 3 / Phase 5 |
| **TB-02** | `DisplayPanel` | [`DisplayPanel.jsx:615`](file:///E:/Projects/simuloran/src/components/panels/DisplayPanel.jsx#L615) | `audit_baseline_eloran_light_1280px.png` | **CRITICAL: Broken Route / Dead Link**: The link `<Link to="/theory">Theory & Docs</Link>` points to `/theory`. However, `App.jsx:49-56` only defines `/learn`. Consequently, clicking this link triggers the catch-all `<Navigate to="/" replace />` wildcard, ejecting the user from their active simulation back to the Home page! Target must be `/learn`. | Phase 3 |
| **TB-03** | `StationEditor` | [`StationEditor.jsx:133-142`](file:///E:/Projects/simuloran/src/components/panels/StationEditor.jsx#L133) | `audit_baseline_eloran_light_1280px.png`, `audit_baseline_loran-c_light_1280px.png` | **Dropdown String Truncation**: Scenario preset select displays `Jakarta Maritime Testbed (Synthetic / Illustrati...` with ugly truncation ellipses in standard sidebar widths (320px–420px). Preset names in `<select>` should have concise display labels with the full explanatory subtitle in the existing adjacent `InfoTooltip`. | Phase 3 |
| **TB-04** | Terminology Divergence | `Navbar.jsx:12`, `App.jsx:53`, `Learn.jsx:92`, `DisplayPanel.jsx:619` | All desktop screenshots | **Theory vs Learn Terminology**: The route is `/learn`, the Navbar link is labeled "Theory", the page heading in `Learn.jsx` is "Loran-C & eLoran Theoretical Foundations", and DisplayPanel calls it "Theory & Docs". Standardize navigation label and route terminology. | Phase 5 |
| **TB-05** | Terminology Divergence | `Home.jsx:122`, `Navbar.jsx:11`, `Waveforms.jsx:32` | `audit_baseline_home_light_1280px.png`, `audit_baseline_waveforms_light_1280px.png` | **RF Waveforms vs RF Oscilloscope**: Home CTA calls the module "RF Oscilloscope", Navbar calls it "RF Waveforms", and the page title is "100 kHz RF Waveform & Cycle Selection Lab". Unify terminology. | Phase 5 |
| **TB-06** | Terminology Divergence | `ELoran.jsx:109`, `LoranC.jsx:269` | `audit_baseline_eloran_light_1280px.png`, `audit_baseline_loran-c_light_1280px.png` | **Mesh vs Layers & Mesh vs DisplayPanel**: `ELoran.jsx:109` labels the 5th tab "Mesh", while `LoranC.jsx:269` labels it "Layers & Mesh", even though both render `DisplayPanel.jsx` (which controls baselines, LOPs, and GDOP). Calling this tab "Mesh" is confusing; label consistently as "Display" or "Layers". | Phase 3 |
| **TB-07** | `FusionPanel` | [`FusionPanel.jsx:147`](file:///E:/Projects/simuloran/src/components/panels/FusionPanel.jsx#L147) | `audit_baseline_eloran_light_1280px.png` | **Outdated Provenance Citation in UI**: `FusionPanel.jsx:147` states in tooltip: `"Millington mixed-path ASF (ITU-R P.832)"`. As documented in `PROVENANCE.md` and `VALIDATION.md`, ITU-R P.832 was replaced by Turf.js great-circle coastline segmentation against Natural Earth vector polygons and ITU-R P.368 nominal conductivities. Update text to reflect active architecture. | Phase 3 |
| **TB-08** | Time Delay Units | `AsfPanel.jsx:407, 666`, `FusionPanel.jsx:133`, `temporalAsf.js:235` | `audit_baseline_eloran_light_1280px.png` | **Unit Inconsistency (µs vs ns vs us)**: `AsfPanel.jsx:407` formats ASF in `µs` (`0.054 µs`), while `AsfPanel.jsx:666` formats temporal ASF in `ns` (`53.82 ns`), and `FusionPanel.jsx:133` formats TOA noise in `ns` (`67.1 ns`). In `temporalAsf.js:235`, JSDoc uses `us`. Standardize user-facing timing delay values to `µs` with optional `(xxx ns)` parenthetical when sub-microsecond precision is relevant. | Phase 3 |

---

## 5. Category 4: Clarity, Readability & Accessibility

Contrast deficiencies, typographic hierarchy gaps, and missing accessible labels on icon-only controls.

| Finding ID | Component | File & Line | Screenshot Reference | Description | Punch List Target |
|---|---|---|---|---|---|
| **CR-01** | `Home` Hero Badge Contrast | [`Home.jsx:21`](file:///E:/Projects/simuloran/src/pages/Home.jsx#L21) | `audit_baseline_home_light_1280px.png` | **Low Contrast in Light Theme**: `HeroBadge` uses `text-cyan-400` on `bg-cyan-500/10`. In Light Mode, `text-cyan-400` on white yields a contrast ratio of ~2.3:1 (failing WCAG AA minimum 4.5:1). Use semantic theme tokens (`text-[var(--accent-eloran)]` / `bg-[var(--accent-eloran-subtle)]`). | Phase 5 |
| **CR-02** | `PulseViewer` Axis Contrast | [`PulseViewer.jsx:238`](file:///E:/Projects/simuloran/src/components/charts/PulseViewer.jsx#L238) | `audit_baseline_waveforms_light_1280px.png` | **Faint Oscilloscope Time Axis Labels**: Time axis markers (`0 ms`, `2.5 ms`, `5.0 ms`, `7.5 ms`, `10.0 ms`) use `color: var(--text-dim)`. In Light Theme, `var(--text-dim)` is `#94a3b8`, which has very low contrast against `#f1f5f9` (`var(--bg-subtle)`), making axis intervals hard to discern. Use `var(--text-secondary)`. | Phase 4 / Phase 5 |
| **CR-03** | `PulseViewer` Canvas Colors | [`PulseViewer.jsx:89-94`](file:///E:/Projects/simuloran/src/components/charts/PulseViewer.jsx#L89) | `audit_baseline_waveforms_light_1280px.png`, `audit_baseline_waveforms_dark_1280px.png` | **Hardcoded Hex in SVG Canvas**: Uses hardcoded hex codes (`clrGrid = '#27272a'`, `clrGri = '#d97706'`, `clrEloran = '#06b6d4'`). In Light Theme, `#27272a` is a dark charcoal line on a white canvas, creating an unintended stark dark line rather than a subtle gridline. Use theme-aware CSS variables or computed style queries. | Phase 4 / Phase 5 |
| **CR-04** | Unreadable Font Size (8px) | [`ChainDesignPanel.jsx:471`](file:///E:/Projects/simuloran/src/components/panels/ChainDesignPanel.jsx#L471) | `audit_baseline_eloran_dark_1280px.png` | **Sub-Readable 8px Text**: Uses `text-[8px]` for the disclaimer badge: `"Illustrative default, not a regulatory limit"`. Text below 10px is illegible on many mobile and standard DPI displays. Minimum readable size should be 10px (`text-[10px]`). | Phase 3 |
| **CR-05** | Missing Accessible Label | [`ClockPanel.jsx:67`](file:///E:/Projects/simuloran/src/components/panels/ClockPanel.jsx#L67) | `audit_baseline_eloran_light_1280px.png` | **Icon-Only Button Missing `aria-label`**: The clock reset button `<button onClick={() => setSimTime(0)} ... title="Reset Time to 0s"><RotateCcw size={14} /></button>` has a `title` attribute but lacks an explicit `aria-label="Reset simulation time to 0 seconds"`. | Phase 3 |
| **CR-06** | Missing Accessible Label | [`StationEditor.jsx:240`](file:///E:/Projects/simuloran/src/components/panels/StationEditor.jsx#L240) | `audit_baseline_eloran_light_1280px.png` | **Station Delete Button Missing `aria-label`**: The station delete button `<button onClick={() => removeStation(st.label)} ... title="Delete station"><Trash2 size={13} /></button>` lacks an `aria-label={`Delete station ${st.label}`}`. | Phase 3 |

---

## 6. Category 5: Visual Clearance & Viewport Overlaps

Elements that touch, overlap, clip, or sit closer than 8px at 1280px, 768px, or 390px viewports.

| Finding ID | Component | File & Line | Screenshot Reference | Description | Punch List Target |
|---|---|---|---|---|---|
| **VC-01** | `Navbar` Tablet Layout Overflow | [`Navbar.jsx:82-130`](file:///E:/Projects/simuloran/src/components/Navbar.jsx#L82) | `audit_baseline_eloran_light_768px.png`, `audit_baseline_loran-c_light_768px.png`, `audit_baseline_waveforms_light_768px.png` | **CRITICAL: Navbar Items Overflow at 768px**: The desktop navigation (`md:flex`) activates at 768px (`min-width: 768px`). At 768px viewport width, the BrandLogo (~260px) plus 5 navigation links (~420px) plus Theme Toggle and SimStatusBadge exceed the 768px viewport width. Consequently: (1) The "About" navigation link is truncated to `(i) Abo...`, (2) The simulation status badge and theme toggle button are pushed entirely off the right screen edge, and (3) The mobile hamburger menu is hidden because `md:flex` is active. Solution: Adjust breakpoint to `lg:flex` (1024px) or condense link padding. | Phase 5 |
| **VC-02** | `PulseViewer` Mobile Overlap & Clipping | [`PulseViewer.jsx:98-178`](file:///E:/Projects/simuloran/src/components/charts/PulseViewer.jsx#L98) | `audit_baseline_waveforms_light_390px.png` | **CRITICAL: Multiple Mobile Overlaps at 390px**: (1) The label `100 kHz RF Carrier` wraps into 3 separate lines with awkward vertical spacing, (2) The `Export SVG` button is cut in half by the right screen edge (`Ex S`), (3) The Time Axis Observation Window current value badge is clipped offscreen, (4) In the SVG header, `Antenna Composite Voltage (Sample Rate: 1.0 MHz · Max: 10.0)` collides directly into the legend `— Composite Signal` with < 4px clearance, and (5) The first station arrival label (`M1-TanjungPriok`) in the SVG waveform touches the left border at x=0. | Phase 4 / Phase 5 |
| **VC-03** | Map Overlay Clearance at 390px | `MapView.jsx:1151`, `ELoran.jsx:123` | `audit_baseline_eloran_light_390px.png`, `audit_baseline_loran-c_light_390px.png` | **Cramped Map Overlays at 390px**: In mobile view, the `MODE: PAN` chip on the left, the `Pan +M +S +R` toolbar on the right, the `<` drawer toggle, and the basemap switcher pill (`OpenFreeMap | OSM | CARTO | Radar`) sit in a cramped vertical zone (< 6px clearance between rows), creating accidental tap risks. | Phase 2 / Phase 5 |
| **VC-04** | Legend vs Scale Bar Clearance | [`MapView.jsx:1186`](file:///E:/Projects/simuloran/src/components/map/MapView.jsx#L1186) | `audit_baseline_eloran_light_390px.png`, `audit_baseline_eloran_light_1280px.png` | **Station Symbols Pill Touches MapLibre Scale Bar**: The collapsed `Symbols` legend button sits at `bottom-20 left-4`. On mobile screens (and when zoomed), it sits only ~8px directly above MapLibre's metric scale control (`30 km`), creating visual cramping and touch collision. Increase vertical clearance. | Phase 2 / Phase 5 |

---

## 7. Category 6: Redundancy & Dead/Unreachable UI

Duplicate information, duplicate controls, and unreachable UI mechanisms.

| Finding ID | Component | File & Line | Screenshot Reference | Description | Punch List Target |
|---|---|---|---|---|---|
| **RD-01** | `MapView` & Mode Toolbar | `MapView.jsx:1120`, `ELoran.jsx:157` | `audit_baseline_eloran_light_1280px.png`, `audit_baseline_eloran_light_390px.png` | **Duplicate Active Mode Display**: The map HUD renders `MODE: PAN` on the left while the tactical mode toolbar on the right simultaneously renders `Pan` highlighted in blue with `Pan [P]`. Both convey the exact same state in the exact same horizontal screen band. Remove the redundant `MODE: PAN` HUD element or merge it cleanly into the toolbar. | Phase 2 / Phase 5 |
| **RD-02** | Educational Disclaimers | `SystemBanners.jsx:5`, `ChainDesignPanel.jsx:66-83` | `audit_baseline_eloran_dark_1280px.png` | **Duplicate Educational Disclaimers**: `EducationalDisclaimerBanner` is permanently mounted at the top of the entire application. `ChainDesignPanel.jsx` mounts a secondary inline `Educational Simulator Disclaimer` card with nearly identical text, creating redundant warning banners. | Phase 3 |
| **RD-03** | `Radar Canvas` Vector Hiding | [`MapView.jsx:1052-1059, 852`](file:///E:/Projects/simuloran/src/components/map/MapView.jsx#L1052) | Code analysis & verification | **CRITICAL: Radar Canvas Sits on Top of MapLibre WebGL Layers**: `<canvas ref={radarCanvasRef}>` is mounted as an absolute overlay at `zIndex: 1` over `<div ref={mapContainer}>`, and its `drawRadar` callback executes `ctx.fillRect(0, 0, w, h)` with an opaque background (`#09090b` or `#f8fafc`). Consequently, all MapLibre WebGL vector layers (baselines, LOP contours, and GDOP raster image sources) rendered inside `mapContainer` are drawn underneath the opaque 2D canvas and completely hidden from view when Radar mode is active! Only HTML markers with higher z-index remain visible. | Phase 2 |
| **RD-04** | Missing Radar Mode UI Explanation | `MapView.jsx:1179`, `tiles.js:46-53` | `audit_baseline_eloran_light_1280px.png` | **Zero UI Explanation for Radar Mode**: When a user selects "Radar" from the basemap switcher, there is no explanation of what this mode is, why it exists, or that it represents the zero-network offline fallback. Add a concise informative tooltip/badge explaining its offline purpose. | Phase 2 |
| **RD-05** | Unguarded Data Destruction | [`StationEditor.jsx:186`](file:///E:/Projects/simuloran/src/components/panels/StationEditor.jsx#L186) | `audit_baseline_eloran_light_1280px.png` | **Destructive Action Without Confirmation**: Clicking `Clear all` immediately invokes `resetAll()`, wiping out all user-configured Master stations, Secondary stations, and Receivers without a confirmation prompt or undo toast. Add a confirmation prompt or modal guard. | Phase 4 / Phase 5 |

---

## 8. Provenance & Citation Inventory (Phase 3 Preparation)

Per project guidelines and past session directives, **no provenance claim, citation, or numerical caveat may be stripped or summarized without preserving its full verbatim text in an accessible tooltip (`InfoTooltip`)**. Below is the exhaustive inventory across all panels:

### Inventory Checklist
- [ ] **Item 1 (`DisplayPanel.jsx:327`)**:
  - *Context*: Secondary Factor (SF) Toggle
  - *Verbatim Claim*: `"Secondary Factor is ON (UNVERIFIED empirical model — discontinuous at 100 statute miles per USCG Handbook)."`
  - *Status*: UNVERIFIED caveat
  - *Target*: Accessible tooltip on SF Toggle badge.
- [ ] **Item 2 (`DisplayPanel.jsx:351, 376`)**:
  - *Context*: Carrier Cycle Slips Model
  - *Verbatim Claim*: `"Boyce Theoretical Rician Ratio (SOURCED, ILA 2006, Section II-D, Fig. 9)"`
  - *Status*: SOURCED citation
  - *Target*: Accessible tooltip on Cycle Slip selector.
- [ ] **Item 3 (`DisplayPanel.jsx:354, 416, 427`)**:
  - *Context*: TOA Measurement Noise Injection
  - *Verbatim Claim*: `"Nominal transmitter clock jitter (SOURCED: Rhee et al. 2021 Table 3) / Receiver scaling constant K (SOURCED: Rhee et al. 2021 / Lo 2008)"`
  - *Status*: SOURCED citation
  - *Target*: Tooltip on Noise Jitter slider.
- [ ] **Item 4 (`DisplayPanel.jsx:379, 382`)**:
  - *Context*: Austron Empirical Envelopes
  - *Verbatim Claim*: `"Austron New Empirical (28 µs) (SOURCED, Boyce Eq. 6) / Austron Old Empirical (42 µs) (SOURCED, Boyce Eq. 5)"`
  - *Status*: SOURCED citation
  - *Target*: Accessible tooltip in model options.
- [ ] **Item 5 (`DisplayPanel.jsx:611`)**:
  - *Context*: Model Provenance Footer
  - *Verbatim Claim*: `"Physics models (PF refraction, Brunavs SF, Millington ASF, Boyce cycle slips, and Rhee TOA noise) are cross-referenced against USCG, RTCM, and ITU-R specifications. All theoretical derivations and formulas are documented in Theory."`
  - *Status*: SOURCED summary
  - *Target*: Preserve in footer tooltip.
- [ ] **Item 6 (`AsfPanel.jsx:256`)**:
  - *Context*: Seawater Conductivity Value
  - *Verbatim Claim*: `"SOURCED (ITU-R P.368 GRWAVE)"`
  - *Status*: SOURCED standard
  - *Target*: Tooltip on Seawater conductivity badge.
- [ ] **Item 7 (`AsfPanel.jsx:276, 503, 507`)**:
  - *Context*: Millington ASF Scaling Factor
  - *Verbatim Claim*: `"UNVERIFIED - Empirical k_asf phase lag scaling factor"`
  - *Status*: UNVERIFIED caveat
  - *Target*: Tooltip on Millington scale slider.
- [ ] **Item 8 (`AsfPanel.jsx:562, 571, 584`)**:
  - *Context*: Temporal ASF Atmospheric Model
  - *Verbatim Claim*: `"Weather-driven propagation delay variation. Refractivity formula is SOURCED (Smith & Weintraub 1953); seasonal drift magnitudes are UNVERIFIED based on 12-day Korean dataset (Song & Son 2025)."`
  - *Status*: SOURCED / UNVERIFIED hybrid caveat
  - *Target*: Tooltip on Temporal ASF header (MUST NOT BE CUT).
- [ ] **Item 9 (`AsfPanel.jsx:788`, `TrialValidationPanel.jsx:32, 333-337`)**:
  - *Context*: Field Trial Validation Disclosure
  - *Verbatim Claim*: `"Validation in SIMULORAN is classified as Tier 2 (Published Empirical Summary Statistics). Published field test campaigns in navigation literature report multi-point summary statistics (e.g. 95% repeatable accuracy, RMSE, signal strength, and estimated jitter) rather than raw streaming TOA pulse time-series logs. Detailed methodology and known gaps are documented in docs/VALIDATION.md."`
  - *Status*: Tier 2 SOURCED disclosure
  - *Target*: Accessible disclosure tooltip/modal.
- [ ] **Item 10 (`FusionPanel.jsx:147`)**:
  - *Context*: Sensor Fusion Layers
  - *Verbatim Claim*: `"Active physics layers: PF atmospheric refraction (RTCM), TOA noise injection (Rhee), Millington mixed-path ASF (Turf.js Great-Circle coastline segmentation, Natural Earth vector polygons, ITU-R P.368 conductivities), and Boyce cycle slip monitoring."`
  - *Status*: SOURCED architecture citation
  - *Target*: Tooltip on Fusion layers indicator.
- [ ] **Item 11 (`ChainDesignPanel.jsx:180, 471`)**:
  - *Context*: Chain Planning Feasibility Limits
  - *Verbatim Claim*: `"Illustrative default, not a regulatory limit — unverified against operational station licensing guidelines"`
  - *Status*: UNVERIFIED planning heuristic
  - *Target*: Tooltip on Planning Thresholds card.
- [ ] **Item 12 (`CycleSelectionPanel.jsx:93, 344-350`)**:
  - *Context*: Boyce Quote Callout
  - *Verbatim Claim*: `"Sourced Excerpt: Boyce, Lo, Powell, & Enge (ILA 2006, Section II-D): 'An offset in the time estimate of 5 µs would result in a wrong cycle selection, therefore, we can set bounds on Ratio(30) to lie between Ratio(25) and Ratio(35) in order to obtain the correct cycle. Therefore, a wrong cycle selection will occur if Ratio(30) ≤ Ratio(25) or Ratio(30) ≥ Ratio(35).' Historical Austron ECD variance: σ_ECD_Old = 42 / √(N · SNR) µs (Eq. 5), modern Peterson estimate: σ_ECD_New = 28 / √(N · SNR) µs (Eq. 6)."`
  - *Status*: SOURCED verbatim excerpt
  - *Target*: Tooltip on SOURCED Model badge in CycleSelectionPanel.

---

## 9. Radar Canvas Map Mode Audit (Phase 2 Diagnostic)

### Architectural Flaw Identified
In [`src/components/map/MapView.jsx:1052-1059`](file:///E:/Projects/simuloran/src/components/map/MapView.jsx#L1052):
```jsx
<div ref={mapContainer} className="w-full h-full" />
<canvas
  ref={radarCanvasRef}
  className="absolute inset-0 pointer-events-none w-full h-full"
  style={{
    zIndex: 1,
    display: activeTileProvider === 'offline-radar' ? 'block' : 'none',
  }}
/>
```
1. **The Layer Stacking Bug**: MapLibre GL creates its WebGL canvas inside `<div ref={mapContainer}>`. The MapLibre vector layers (baselines GeoJSON, LOP hyperbolas GeoJSON, and GDOP raster image canvas) are rendered strictly on that WebGL canvas.
2. **Opaque 2D Canvas**: In `drawRadar` ([`MapView.jsx:852`](file:///E:/Projects/simuloran/src/components/map/MapView.jsx#L852)), the canvas executes `ctx.fillStyle = bgColor; ctx.fillRect(0, 0, w, h);`. Because `radarCanvasRef` sits at `zIndex: 1` on top of `mapContainer` and paints an opaque rectangle, **it completely covers MapLibre's WebGL canvas**.
3. **What Renders vs What Disappears**:
   - Station markers (`M1`, `S1`, `R1`) are DOM elements created via `new maplibregl.Marker()`. MapLibre gives marker elements high z-indices or appends them above the canvas, so they may appear.
   - Baselines, LOP hyperbolas, and GDOP heatmaps are WebGL layers, which are completely concealed underneath the opaque radar canvas!

### Proposed Phase 2 Rehaul Architecture
1. **Radar Canvas as a Custom MapLibre Layer or Underlay**:
   - Rather than an opaque canvas sitting on top of `mapContainer`, make the canvas sit *behind* the MapLibre WebGL canvas, with MapLibre's background layer set to transparent (`'background-color': 'transparent'`).
   - Alternatively, inject the radar canvas rendering as a custom MapLibre canvas source/layer (`map.addSource('radar-canvas-source', ...)`), guaranteeing all vector layers (baselines, contours, GDOP) naturally composite on top.
2. **UI Definition**:
   - Add a clear badge/tooltip in the basemap switcher: `"Offline Radar: Zero-network 2D navigation backdrop with calibrated range rings and bearing radials. Activates automatically when external map tiles fail."`
3. **Clutter Controls**:
   - Provide a toggle or reduced default density for graticule/bearing lines so range rings and radio geometry remain primary.
4. **Trigger Condition Verification**:
   - Verify both manual switching and automatic fallback (simulated tile network failure) seamlessly paint pixels and maintain vector overlays.

---

## 10. Phased Roadmap

- **Phase 1 (Complete)**: Holistic UX & Visual Audit report completed in `docs/UX_AUDIT.md` (committed at `8291c4e`).
- **Phase 2 (Complete)**: Radar Canvas Map Mode functional rehaul (committed at `9d9aba3`). Canvas repositioned to `z-index: 0` underlay; WebGL canvas made transparent; station markers and LOP contours composited on top; declutter controls added; 4/4 Playwright tests passing in `e2e/radar-canvas.spec.js`.
- **Phase 3 (Complete)**: Sidebar text-to-tooltip conversion (committed at `5321d39`). Converted 12 provenance items verbatim into accessible `InfoTooltip` components; `/theory` link fixed to `/learn`; UTF-8 mojibake repaired; 2/2 tests passing in `e2e/tooltips-verification.spec.js`.
- **Phase 4 (Complete)**: Full functional QA suite in `e2e/full-functional-audit.spec.js` (committed at `ad7343c` and `afd00e7`). 12 tests covering mode buttons, map click placement, Clear All, Commit Design, CSV round-trip export/import, dynamic chart rendering, off-thread LOP worker, AsfPanel mode persistence, presets, and trial validation (12/12 passing).
- **Phase 5 (Complete)**: Polish, redundancy pruning, responsive clearance, and final quality gate. Pruned invalid `py-0.2` classes, elevated sub-9px text to 10px, enlarged touch targets to ≥ 36×36px, verified 768px tablet and 390px mobile viewports, recorded 36-matrix post-rehaul screenshot suite (`phase5_verified_*`), and passed all quality gates.

---

## 11. Implementation & Verification Outcomes (Phases 1–5 Complete)

### Comprehensive Quality Gate Verification Matrix
| Verification Gate | Command | Result | Details |
| :--- | :--- | :--- | :--- |
| **Strict UTF-8 Integrity** | `npm run test:utf8` | **PASS (0 byte errors)** | Audited 59 files in `src/`. Zero byte errors, zero `U+FFFD` replacement characters. |
| **Secret Leak Guard & Linter** | `npm run lint` | **PASS (0 violations)** | Verified 253 tracked/staged files. Zero secret leak patterns found. ESLint clean with zero errors or warnings. |
| **Vitest Unit & Physics Tests** | `npm test` | **PASS (176 / 176)** | 8 test suites passing: `temporalAsf` (32), `chainDesign` (20), `grwave` (9), `trialValidation` (11), `dds` (33), `tiles` (6), `geoAsf` (15), `physics` (50). |
| **Full Functional E2E Suite** | `npx playwright test e2e/full-functional-audit.spec.js` | **PASS (12 / 12)** | All 12 critical user workflows verified end-to-end including CSV roundtrip, chart canvas points, worker contours, and solver toggles. |
| **Radar Canvas E2E Suite** | `npx playwright test e2e/radar-canvas.spec.js` | **PASS (4 / 4)** | Underlay stacking, marker overlays, declutter radials, tile-failure fallback, and online restoration verified. |
| **Tooltips & Encoding E2E Suite** | `npx playwright test e2e/tooltips-verification.spec.js` | **PASS (2 / 2)** | All 12 provenance items verified accessible via hover/focus; CycleSelectionPanel clean UTF-8 verified. |
| **Grid Worker E2E Suite** | `npx playwright test e2e/grid-worker.spec.js` | **PASS (1 / 1)** | Web worker instantiation and off-thread marching squares computation verified with CSP compliance. |
| **Responsive Clearance & 36-Matrix** | `npx playwright test e2e/capture-phase5-verification.spec.js` | **PASS (3 / 3)** | 36 post-rehaul screenshots captured; 768px tablet height ≤ 60px verified; 390px zero horizontal overflow and ≥ 36×36px touch targets verified. |

### Visual Artifact Ledger
All verification screenshots are committed in `docs/verification/screenshots/`:
- **Phase 0 Baseline (36 images)**: `audit_baseline_{page}_{theme}_{viewport}.png`
- **Phase 2 Radar Rehaul (10 images)**: `radar_before_*`, `radar_after_*`, `radar_declutter_radials_off.png`, `radar_declutter_radials_on.png`
- **Phase 3 Sidebar Declutter (4 images)**: `sidebar_after_dark_1280px.png`, `sidebar_after_light_1280px.png`, `sidebar_tooltip_hover_1280px.png`, `waveforms_utf8_clean.png`
- **Phase 5 Final Verified Matrix (36 images)**: `phase5_verified_{page}_{theme}_{viewport}.png`

