# SIMULORAN End-to-End Test Suite

SIMULORAN utilizes Playwright for multi-browser end-to-end (E2E) testing, visual regression validation, and operational state verification.

---

## Running E2E Tests

```bash
# Run all end-to-end tests across Chromium, Firefox, and WebKit
npm run test:e2e

# Run with interactive UI mode
npx playwright test --ui

# Run a specific test specification
npx playwright test e2e/routes.spec.js

# Generate visual evidence screenshots
npm run e2e:capture
```

---

## Test Suites by Category

### 1. Navigation & Routing
- `routes.spec.js`: Verifies SPA route navigation, page titles, and deep links across `/`, `/loran-c`, `/eloran`, `/waveforms`, `/learn`, and `/about`.

### 2. Hyperbolic & Pseudorange Solvers
- `chain-design.spec.js`: Validates interactive secondary transmitter creation, GRI adjustments, and baseline TDOA hyperbola rendering.
- `grid-worker.spec.js`: Verifies Web Worker multithreading for real-time GDOP and ASF calculation.
- `trajectory-verification.spec.js`: Tests waypoint kinematics, vehicle velocity vectors, and Doppler shift tables.

### 3. Electronic Warfare & Resilient PNT
- `full-functional-audit.spec.js`: End-to-end assessment of GNSS jamming injection, spoofing detection, and eLoran backup failover.
- `sdr-playback.spec.js`: Tests 100 kHz synthetic baseband audio generation, matched filtering, and oscilloscope visualization.

### 4. Scenario Packaging & Missions
- `mission-pack.spec.js`: Validates import, export, JSON validation, and state rehydration of `.simuloran.json` mission packs.

### 5. Accessibility & UX Quality
- `sidebar-flicker.spec.js`: Validates zero sidebar rendering flicker and layout stability under heavy state updates.
- `tooltips-verification.spec.js`: Ensures non-clipping viewport bounds for interactive mathematical tooltips.
- `style-layers-persistence.spec.js`: Confirms map style persistence across dark/light radar themes.
