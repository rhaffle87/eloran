import { Compass, Layers, Target } from 'lucide-react';
import { isInsideBaselineExtension } from './chainDesign.js';

export const MISSIONS = [
  {
    id: 'gps-spoofing',
    number: 1,
    title: 'GPS Spoofing Recovery & eLoran Failover',
    shortTitle: 'GPS Spoofing Failover',
    badge: 'Resilient PNT',
    icon: Compass,
    accentVar: '--accent-eloran',
    theoryAnchor: '/learn#fusion',
    briefing:
      'A commercial vessel navigating the high-traffic Malacca Strait corridor encounters deliberate GNSS spoofing, causing dangerous drift (>150m) in the primary chartplotter. You must confirm the GNSS spoofing hazard, verify eLoran groundwave multi-station tracking, and switch receiver mode to eLoran or Multi-Sensor Fusion to restore positioning accuracy to within safe harbor bounds (≤ 25m).',
    hints: [
      'Click "Auto-Setup Scenario" to immediately load the preset with GNSS spoofing enabled.',
      'Notice the GNSS position error jump to ~180m, pulling the vessel off-course.',
      'In the right console drawer (Fusion tab or Telemetry Console), toggle receiver Fuse Mode from GNSS to eLoran or Fusion.',
      'Watch the complementary filter reject the spoofed satellite pseudoranges and restore position error to < 10m.',
    ],
    setup: (store) => {
      store.loadPreset('jakarta_baseline');
      store.updateSettings({
        gnssStatus: 'spoofed',
        gnssSpoofBiasMeters: 180,
        solverMode: 'pseudorange',
      });
      store.updateStation('receiver', 'R1-Vessel', {
        fuseMode: 'gnss',
        lat: -5.95,
        lng: 106.60,
      });
      store.logActivity(
        'MISSION',
        'Mission 1 Initialized: Hostile GNSS spoofing detected (+180m bias). Vessel adrift in GNSS-only mode.',
        'warn'
      );
      setTimeout(() => store.evaluateReceivers(), 60);
    },
    objectives: [
      {
        id: 'detect-spoof',
        title: 'Detect GNSS Spoofing Hazard',
        desc: 'Observe GNSS spoofing degradation status active (bias > 50m).',
        check: (state, activeFix) => {
          const status = state.settings?.gnssStatus;
          const gnssErr = activeFix?.gnssFix?.errorMeters ?? 0;
          return status === 'spoofed' || status === 'jammed' || gnssErr > 50;
        },
        getMetric: (state, activeFix) => {
          const status = (state.settings?.gnssStatus || 'nominal').toUpperCase();
          const bias = state.settings?.gnssSpoofBiasMeters || 150;
          const gnssErr = activeFix?.gnssFix?.errorMeters;
          return `Status: ${status} | Bias: ${bias}m | GNSS Error: ${gnssErr !== undefined ? gnssErr.toFixed(1) + 'm' : '--'}`;
        },
      },
      {
        id: 'track-eloran',
        title: 'Verify eLoran Groundwave Reception',
        desc: 'Ensure eLoran receiver tracks at least 3 operational ground transmitters.',
        check: (state, activeFix) => {
          const totalActive =
            state.masters.filter((m) => m.enabled !== false).length +
            state.slaves.filter((s) => s.enabled !== false).length;
          return totalActive >= 3 && activeFix?.converged !== false;
        },
        getMetric: (state) => {
          const mastersCount = state.masters.filter((m) => m.enabled !== false).length;
          const slavesCount = state.slaves.filter((s) => s.enabled !== false).length;
          return `Transmitters: ${mastersCount} Master + ${slavesCount} Secondaries | Solver: ${state.settings?.solverMode || 'pseudorange'}`;
        },
      },
      {
        id: 'restore-fix',
        title: 'Engage Sovereign eLoran / Fusion (Fix Error ≤ 25m)',
        desc: 'Switch vessel fuse mode to eLoran or Fusion to reject spoofing and restore harbor accuracy.',
        check: (_state, activeFix, activeRx) => {
          const mode = activeRx?.fuseMode;
          const isSafeMode = mode === 'eLoran' || mode === 'fusion';
          const error = activeFix?.errorMeters;
          return isSafeMode && error !== undefined && error <= 25;
        },
        getMetric: (_state, activeFix, activeRx) => {
          const mode = activeRx?.fuseMode || 'gnss';
          const err = activeFix?.errorMeters;
          return `Receiver Fuse Mode: ${mode.toUpperCase()} | Total Fix Error: ${err !== undefined ? err.toFixed(1) + 'm' : '--'} (Target: ≤ 25.0m)`;
        },
      },
    ],
  },
  {
    id: 'asf-calibration',
    number: 2,
    title: 'ASF Seawater vs. Land Boundary Calibration',
    shortTitle: 'ASF Land/Sea Calibration',
    badge: 'Propagation Physics',
    icon: Layers,
    accentVar: '--accent-loran-c',
    theoryAnchor: '/learn#asf',
    briefing:
      'As 100 kHz LF groundwaves transition from highly conductive open seawater (σ = 4.0 S/m) across the Indonesian coastline into low-conductivity inland terrain (σ = 0.001 S/m), signal phase velocity retards significantly. Without calibration, this Additional Secondary Factor (ASF) induces hundreds of meters of positioning error. You must engage the physical Millington mixed-path model, activate Secondary Factor compensation, and calibrate land conductivity to bring positioning error below 20m.',
    hints: [
      'Click "Auto-Setup Scenario" to configure high land-fraction propagation with uncalibrated phase delay.',
      'Open the ASF panel in the right console drawer.',
      'Verify the ASF Model is set to Millington (Physical Mixed-Path).',
      'Toggle ON "Enable Secondary Factor (SF/ASF) Correction" in simulation settings.',
      'Tune the Soil Conductivity slider to standard agricultural / conductive soil (σ ≥ 0.003 S/m) to reduce timing residual.',
    ],
    setup: (store) => {
      store.loadPreset('jakarta_baseline');
      store.updateSettings({
        solverMode: 'pseudorange',
        asfModelMode: 'millington',
        asfLandFraction: 0.85,
        asfLandSigma: 0.001,
        enableSecondaryFactor: false,
      });
      store.updateStation('receiver', 'R1-Vessel', {
        fuseMode: 'eLoran',
        lat: -6.15,
        lng: 106.82,
      });
      store.logActivity(
        'MISSION',
        'Mission 2 Initialized: Coastal approach with uncalibrated groundwave delay (σ = 0.001 S/m).',
        'info'
      );
      setTimeout(() => store.evaluateReceivers(), 60);
    },
    objectives: [
      {
        id: 'observe-mixed-path',
        title: 'Activate Mixed-Path Boundary Model',
        desc: 'Set ASF model to Millington Mixed-Path with land fraction ≥ 50%.',
        check: (state) => {
          const mode = state.settings?.asfModelMode;
          const frac = state.settings?.asfLandFraction ?? 0.5;
          return mode === 'millington' && frac >= 0.5;
        },
        getMetric: (state) => {
          const mode = (state.settings?.asfModelMode || 'millington').toUpperCase();
          const frac = ((state.settings?.asfLandFraction ?? 0.5) * 100).toFixed(0);
          return `ASF Model: ${mode} | Land Fraction: ${frac}%`;
        },
      },
      {
        id: 'enable-sf',
        title: 'Enable Secondary Factor (SF) Seawater Correction',
        desc: 'Enable Secondary Factor physical compensation in simulation settings.',
        check: (state) => state.settings?.enableSecondaryFactor === true,
        getMetric: (state) => {
          const enabled = state.settings?.enableSecondaryFactor;
          return `Secondary Factor: ${enabled ? 'ENABLED (Phase compensation active)' : 'DISABLED (Uncompensated)'}`;
        },
      },
      {
        id: 'calibrate-conductivity',
        title: 'Calibrate Soil Conductivity (Fix Error ≤ 20m)',
        desc: 'Calibrate land conductivity σ ≥ 0.003 S/m to drop phase delay residual and restore fix.',
        check: (state, activeFix) => {
          const sigma = state.settings?.asfLandSigma ?? 0.001;
          const sfOn = state.settings?.enableSecondaryFactor;
          const err = activeFix?.errorMeters;
          return sigma >= 0.003 && sfOn && err !== undefined && err <= 20;
        },
        getMetric: (state, activeFix) => {
          const sigma = state.settings?.asfLandSigma ?? 0.001;
          const err = activeFix?.errorMeters;
          return `Soil Conductivity σ: ${sigma} S/m | Fix Error: ${err !== undefined ? err.toFixed(1) + 'm' : '--'} (Target: ≤ 20.0m)`;
        },
      },
    ],
  },
  {
    id: 'baseline-singularity',
    number: 3,
    title: 'Hyperbolic Baseline Extension Singularity Avoidance',
    shortTitle: 'Baseline Singularity Avoidance',
    badge: 'Geometry & GDOP',
    icon: Target,
    accentVar: '--status-warn',
    theoryAnchor: '/learn#gdop',
    briefing:
      'In hyperbolic multilateration, navigating along the collinear baseline extension line behind a transmitting station causes time-difference hyperbolas to collapse into parallel curves. The geometry matrix H loses rank, causing GDOP to diverge catastrophically (GDOP > 8.0) and yielding massive positional uncertainty. You will navigate the vessel into the hazardous baseline extension cone, observe geometric singularity collapse, and then maneuver safely into the inter-station central fairway to restore optimal GDOP (< 3.5).',
    hints: [
      'Click "Auto-Setup Scenario" to place the vessel directly behind Secondary Tangerang along the baseline extension line.',
      'Observe the red hazard cone overlay on the map and the critical GDOP warning in the tactical console.',
      'Drag the receiver vessel (or click the map) into the central fairway between Master Tanjung Priok and the secondaries.',
      'Watch GDOP drop from critical (>15) to optimal (<3.5) as the hyperbolic intersection angles become orthogonal.',
    ],
    setup: (store) => {
      store.loadPreset('jakarta_baseline');
      store.updateSettings({
        solverMode: 'tdoa',
        showBaselineExtensions: true,
      });
      // Point directly behind Secondary Tangerang along the M1-S1 baseline extension
      store.updateStation('receiver', 'R1-Vessel', {
        fuseMode: 'eLoran',
        lat: -6.3177,
        lng: 106.1994,
      });
      store.logActivity(
        'MISSION',
        'Mission 3 Initialized: Vessel positioned in Secondary baseline extension singularity.',
        'warn'
      );
      setTimeout(() => store.evaluateReceivers(), 60);
    },
    objectives: [
      {
        id: 'enter-extension',
        title: 'Detect Baseline Extension Hazard Zone',
        desc: 'Position vessel in the ±10° baseline extension cone or observe critical GDOP (≥ 8.0).',
        check: (state, activeFix, activeRx, missionContext) => {
          if (missionContext?.hasEnteredHazard) return true;
          const gdop = activeFix?.gdop ?? activeFix?.eloranSol?.gdop ?? 0;
          if (gdop >= 8.0) return true;
          const m = state.masters[0];
          const s = state.slaves[0];
          if (m && s && activeRx) {
            const ext = isInsideBaselineExtension(activeRx, m, s);
            return ext.isExtension;
          }
          return false;
        },
        getMetric: (state, activeFix, activeRx) => {
          const m = state.masters[0];
          const s = state.slaves[0];
          let inExt = false;
          if (m && s && activeRx) {
            inExt = isInsideBaselineExtension(activeRx, m, s).isExtension;
          }
          const gdop = activeFix?.gdop ?? activeFix?.eloranSol?.gdop ?? null;
          return `Hazard Zone: ${inExt ? 'DETECTED IN HAZARD CONE' : 'CLEAR'} | GDOP: ${gdop !== null ? gdop.toFixed(2) : '--'}`;
        },
      },
      {
        id: 'observe-singularity',
        title: 'Observe GDOP Divergence (Peak GDOP ≥ 8.0)',
        desc: 'Confirm singularity condition where hyperbolic LOPs collapse and GDOP blows up.',
        check: (_state, activeFix, _activeRx, missionContext) => {
          const gdop = activeFix?.gdop ?? activeFix?.eloranSol?.gdop ?? 0;
          return (missionContext?.maxGdopObserved ?? 0) >= 8.0 || gdop >= 8.0;
        },
        getMetric: (_state, activeFix, _activeRx, missionContext) => {
          const currentGdop = activeFix?.gdop ?? activeFix?.eloranSol?.gdop ?? 0;
          const peak = Math.max(missionContext?.maxGdopObserved ?? 0, currentGdop);
          return `Peak GDOP Observed: ${peak > 0 ? peak.toFixed(2) : '--'} (Threshold: ≥ 8.0)`;
        },
      },
      {
        id: 'escape-extension',
        title: 'Maneuver to Central Fairway (GDOP < 3.5)',
        desc: 'Steer vessel into the open inter-station coverage area to achieve optimal GDOP < 3.5.',
        check: (state, activeFix, activeRx, missionContext) => {
          const hadHazard =
            missionContext?.hasEnteredHazard ||
            (missionContext?.maxGdopObserved ?? 0) >= 8.0;
          const gdop = activeFix?.gdop ?? activeFix?.eloranSol?.gdop ?? null;
          const m = state.masters[0];
          const s = state.slaves[0];
          let inExt = false;
          if (m && s && activeRx) {
            inExt = isInsideBaselineExtension(activeRx, m, s).isExtension;
          }
          return hadHazard && !inExt && gdop !== null && gdop < 3.5;
        },
        getMetric: (_state, activeFix) => {
          const gdop = activeFix?.gdop ?? activeFix?.eloranSol?.gdop ?? null;
          return `Current GDOP: ${gdop !== null ? gdop.toFixed(2) : '--'} (Target: < 3.5 — OPTIMAL)`;
        },
      },
    ],
  },
];
