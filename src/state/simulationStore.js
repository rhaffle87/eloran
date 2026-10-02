/**
 * Central Simulation State Store for SIMULORAN
 * Implemented with Zustand. Shared seamlessly across Loran-C, eLoran, Waveforms, and Map.
 */

import { create } from 'zustand';
import { PRESET_SCENARIOS } from './presets.js';
import {
  computeTDOAPair,
  solvePositionFromTDOA,
  solvePositionPseudorange,
  computeArrivalSec,
  simulateCycleSlip,
  computeToaNoiseStdDevMeters,
  DEFAULT_TOA_NOISE_PARAMS,
} from '../lib/tdoa.js';
import {
  SPEED_OF_LIGHT,
  DEFAULT_REFRACTIVE_INDEX,
  haversineDistance,
} from '../lib/geodesy.js';
import { fusePositions, simulateGnssFix } from '../lib/fusion.js';
import { broadcastDdsEvents } from '../lib/dds.js';
import {
  createMillingtonAsfEvaluator,
  compileAsfExpression,
  DEFAULT_MILLINGTON_SCALE,
} from '../lib/asf.js';
import {
  computeEmissionDelay,
  DEFAULT_CHAIN_DESIGN_PARAMS,
} from '../lib/chainDesign.js';
import {
  createTrackingLoop,
  stepTrackingLoop,
  injectCycleSlip,
  reacquireTrackingLoop,
} from '../lib/trackingLoop.js';

export const DEFAULT_DESIGN_CHAIN = {
  name: 'Proposed Chain',
  griUs: 99600,
  tdSigmaUs: 0.1, // SOURCED: USCG Loran-C User Handbook (1992) §4-1
  coverageRadiusKm: 600,
  master: { label: 'M', name: 'Master-Proposed', lat: -6.200, lng: 106.816 },
  secondaries: [
    { label: 'W', name: 'Secondary-W', lat: -6.850, lng: 105.750, codingDelayUs: 11000 },
    { label: 'X', name: 'Secondary-X', lat: -5.450, lng: 106.350, codingDelayUs: 25000 },
    { label: 'Y', name: 'Secondary-Y', lat: -6.150, lng: 107.950, codingDelayUs: 40000 },
  ],
};

export const DESIGN_PRESETS = {
  'uscg-400mi': {
    name: 'USCG 400-mi Worked Example — Calibrated Textbook Benchmark',
    labelBadge: 'Textbook Benchmark',
    provenance: 'USCG Loran-C User Handbook COMDTINST P16562.5 §2.B worked example (400 nmi baseline at 6.18 µs/nmi = 2,472 µs baseline travel time)',
    isHistorical: false,
    griUs: 79900,
    tdSigmaUs: 0.1,
    coverageRadiusKm: 800,
    master: { label: 'M', name: 'Master-USCG', lat: 35.0, lng: 135.0 },
    secondaries: [
      { label: 'W', name: 'Secondary-W (400 nmi)', lat: 35.0, lng: 143.1353, codingDelayUs: 11000 },
      { label: 'X', name: 'Secondary-X (400 nmi)', lat: 41.6622, lng: 135.0, codingDelayUs: 25000 },
    ],
  },
  'jakarta-proposed': {
    name: 'Jakarta Coastal — Proposed Regional Maritime Chain (Hypothetical)',
    labelBadge: 'Hypothetical / Synthetic',
    provenance: 'Hypothetical regional planning scenario along the Sunda Strait & Java Sea corridor (Tanjung Priok, Anyer, Cirebon, Lampung)',
    isHistorical: false,
    griUs: 99600,
    tdSigmaUs: 0.1,
    coverageRadiusKm: 600,
    master: { label: 'M', name: 'Tanjung Priok Master', lat: -6.102, lng: 106.883 },
    secondaries: [
      { label: 'W', name: 'Anyer Secondary', lat: -6.050, lng: 105.920, codingDelayUs: 11000 },
      { label: 'X', name: 'Cirebon Secondary', lat: -6.720, lng: 108.560, codingDelayUs: 25000 },
      { label: 'Y', name: 'Lampung Secondary', lat: -5.450, lng: 105.260, codingDelayUs: 40000 },
    ],
  },
  'us-east-coast': {
    name: 'US East Coast (GRI 9960) — Historical NEUS Chain (Illustrative)',
    labelBadge: 'Illustrative — unverified this session',
    provenance: 'Historical Northeast U.S. Chain (NEUS GRI 9960) configuration — station names and coordinates drawn from local reference data; parameters not independently verified from primary government PDF this session',
    isHistorical: true,
    griUs: 99600,
    tdSigmaUs: 0.1,
    coverageRadiusKm: 1200,
    master: { label: 'M', name: 'Seneca NY (Master)', lat: 42.7141, lng: -76.8259 },
    secondaries: [
      { label: 'W', name: 'Caribou ME (Whiskey)', lat: 46.8076, lng: -67.9270, codingDelayUs: 11000 },
      { label: 'X', name: 'Nantucket MA (Xray)', lat: 41.2533, lng: -69.9774, codingDelayUs: 25000 },
      { label: 'Y', name: 'Carolina Beach NC (Yankee)', lat: 34.0628, lng: -77.9128, codingDelayUs: 39000 },
      { label: 'Z', name: 'Dana IN (Zulu)', lat: 39.8521, lng: -87.4866, codingDelayUs: 54000 },
    ],
  },
};

export const useSimulationStore = create((set, get) => {
  // Extract initial masters for validation (banner in App.jsx warns if length > 1)
  const initialMasters = PRESET_SCENARIOS.jakarta_baseline.masters;

  return {
  // Active Scenario & Stations
  activePresetId: 'jakarta_baseline',
  masters: initialMasters,
  slaves: PRESET_SCENARIOS.jakarta_baseline.slaves,
  receivers: PRESET_SCENARIOS.jakarta_baseline.receivers,

  // Chain Design Mode State
  isDesignMode: false,
  showBaselineExtensions: true,
  showCrossingAngles: false,
  designChain: JSON.parse(JSON.stringify(DEFAULT_DESIGN_CHAIN)),
  designParams: { ...DEFAULT_CHAIN_DESIGN_PARAMS },

  // Map & Interaction Mode
  mapMode: 'pan', // 'pan' | 'add-master' | 'add-slave' | 'add-receiver'
  mapCenter: PRESET_SCENARIOS.jakarta_baseline.center,
  mapZoom: PRESET_SCENARIOS.jakarta_baseline.zoom,

  // Simulation Clock
  simTimeSec: 0,
  isSimRunning: false,

  // Computed Outputs
  contours: [],
  gridStatus: { status: 'idle', computedAt: null, message: null },
  receiverFixes: {},
  ddsLogs: [],
  selectedReceiver: 'R1-Vessel',

  // Live Operational Telemetry & Uncertainty State
  activityLogs: [
    {
      id: 'init-1',
      timestamp: Date.now(),
      timeStr: new Date().toTimeString().slice(0, 8),
      category: 'SYSTEM',
      message: 'SIMULORAN Tactical Core initialized (Dual Loran-C/eLoran)',
      level: 'info',
    },
  ],
  isActivityFeedPaused: false,
  uncertaintyHistory: [],
  isConsoleOpen: false,

  // Visualization Layers
  gdopLayerVisible: false,
  baselinesVisible: true,
  lopsVisible: true,

  // Configuration Settings & Physics Parameters
  settings: {
    solverMode: 'pseudorange', // 'pseudorange' (with b_rx clock bias) | 'tdoa' (hyperbolic)
    refractiveIndex: DEFAULT_REFRACTIVE_INDEX, // RTCM MPS: 1.000338, Handbook: 1.000284, China: 1.000315
    enableSecondaryFactor: false, // SOURCED: Brunavs (1977) continuous seawater model
    enableCycleSlips: false, // Boyce 2006 wrong-cycle selection (±10 µs / ~3 km error)
    cycleSlipModel: 'boyce-ratio', // 'boyce-ratio' (Boyce 2006) | 'austron-28' (New) | 'austron-42' (Old)
    snrDb: 18,
    pulsesAveraged: 10,
    jitterMeters: DEFAULT_TOA_NOISE_PARAMS.jitterMeters, // SOURCED: 6.0 m (Rhee et al. 2021)
    kConstantMeters: DEFAULT_TOA_NOISE_PARAMS.kConstantMeters, // SOURCED: 337.5 m (Rhee et al. 2021)
    asfModelMode: 'millington', // 'millington' (Physical Mixed-Path) | 'formula' (AST Override)
    asfEngineMethod: 'grwave', // 'grwave' (SOURCED ITU-R P.368 / GRWAVE) | 'empirical' (UNVERIFIED k_asf)
    asfMillingtonPathMode: 'geo', // 'geo' (SOURCED Natural Earth 10m GIS Ray-Tracing) | 'manual' (Manual Land Fraction Slider)
    asfLandFraction: 0.5,
    asfLandSigma: 0.003, // ITU-R P.832 Agricultural/Forest
    asfMillingtonScale: DEFAULT_MILLINGTON_SCALE, // UNVERIFIED: 0.0008
    asfHeatmapEnabled: false,
    asfHeatmapMode: 'us', // 'us' (µs timing delay) | 'db' (dB groundwave attenuation)
    asfHeatmapOpacity: 0.65,
    asfHeatmapResolution: 40,
    asfHeatmapIsoContours: true,
    enableDDS: true,
    enableIntegrity: true,
    integrityThresholdMeters: 50,
    noiseMode: 'controlled', // 'controlled' | 'random' | 'none'
    noiseStdDevMeters: 20,
    contourEpsilonMeters: 8,
    gridResolution: 180,
    contourUnit: 'meters', // 'meters' | 'seconds'
    includeCarrier: true, // 100 kHz RF carrier modulation vs envelope-only
    includeSkywave: false,
    skywaveDelayMs: 1.5,
    skywaveAmpRatio: 0.3,
    skywaveHourOfDay: 0.0, // Local solar hour: 0.0 (midnight) to 12.0 (solar noon)
    gnssStatus: 'nominal', // 'nominal' | 'jammed' | 'spoofed' | 'outage'
    gnssStdDevMeters: 8,
    gnssJammingNoiseMeters: 75,
    gnssSpoofBiasMeters: 150,
    showCovarianceEllipses: true,
    terrainMaskingEnabled: false, // ITU-R P.526 knife-edge diffraction overlay
  },

  // Actions
  setMapMode: (mode) => set({ mapMode: mode }),
  setMapCenter: (center, zoom) => set({ mapCenter: center, ...(zoom ? { mapZoom: zoom } : {}) }),
  setSelectedReceiver: (label) => set({ selectedReceiver: label }),

  // Receiver Tracking Loop (PLL / DLL SZC tracking)
  trackingLoop: createTrackingLoop(),
  stationStatus: {}, // stationLabel -> 'nominal' | 'degraded' | 'failed'
  setStationStatus: (label, status) => {
    set((state) => ({
      stationStatus: {
        ...state.stationStatus,
        [label]: status,
      },
    }));
    get().logActivity(
      'STATION',
      `Station ${label} status set to ${status.toUpperCase()}`,
      status === 'failed' ? 'warn' : 'info'
    );
    setTimeout(() => get().evaluateReceivers(), 20);
  },
  stepTrackingLoop: (snrOverride) =>
    set((state) => {
      const snr = snrOverride !== undefined ? snrOverride : (state.settings?.snrDb ?? 18);
      return { trackingLoop: stepTrackingLoop(state.trackingLoop, snr) };
    }),
  injectCycleSlip: (direction) =>
    set((state) => ({ trackingLoop: injectCycleSlip(state.trackingLoop, direction) })),
  reacquireTrackingLoop: () =>
    set((state) => ({ trackingLoop: reacquireTrackingLoop(state.trackingLoop) })),

  setSimTime: (timeSec) => {
    set({ simTimeSec: timeSec });
    if (get().settings.enableDDS && Math.floor(timeSec) % 5 === 0) {
      const logs = broadcastDdsEvents(get().masters, timeSec, true);
      if (logs.length) {
        set((state) => ({ ddsLogs: [...state.ddsLogs.slice(-150), ...logs] }));
      }
    }
  },

  toggleSimRunning: () => set((state) => ({ isSimRunning: !state.isSimRunning })),

  toggleGdopLayer: () => set((state) => ({ gdopLayerVisible: !state.gdopLayerVisible })),
  toggleBaselines: () => set((state) => ({ baselinesVisible: !state.baselinesVisible })),
  toggleLops: () => set((state) => ({ lopsVisible: !state.lopsVisible })),

  // Chain Design Actions
  toggleDesignMode: (forced) =>
    set((state) => ({ isDesignMode: typeof forced === 'boolean' ? forced : !state.isDesignMode })),
  toggleBaselineExtensions: () =>
    set((state) => ({ showBaselineExtensions: !state.showBaselineExtensions })),
  toggleCrossingAngles: () =>
    set((state) => ({ showCrossingAngles: !state.showCrossingAngles })),

  // Operational Activity & Uncertainty Actions
  logActivity: (category, message, level = 'info') => {
    const newEntry = {
      id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      timestamp: Date.now(),
      timeStr: new Date().toTimeString().slice(0, 8),
      category,
      message,
      level,
    };
    set((state) => ({
      activityLogs: [...(state.activityLogs || []).slice(-199), newEntry],
    }));
  },
  clearActivityLogs: () => set({ activityLogs: [] }),
  toggleActivityFeedPaused: () => set((state) => ({ isActivityFeedPaused: !state.isActivityFeedPaused })),
  recordUncertaintyPoint: (point) =>
    set((state) => ({
      uncertaintyHistory: [...(state.uncertaintyHistory || []).slice(-59), point],
    })),
  toggleConsoleOpen: () => set((state) => ({ isConsoleOpen: !state.isConsoleOpen })),

  updateDesignMaster: (updates) =>
    set((state) => ({
      designChain: {
        ...state.designChain,
        master: { ...state.designChain.master, ...updates },
      },
    })),

  updateDesignSecondary: (index, updates) =>
    set((state) => {
      const nextSecs = [...state.designChain.secondaries];
      if (nextSecs[index]) {
        nextSecs[index] = { ...nextSecs[index], ...updates };
      }
      return {
        designChain: {
          ...state.designChain,
          secondaries: nextSecs,
        },
      };
    }),

  addDesignSecondary: (secondary) =>
    set((state) => {
      const currentSecs = state.designChain.secondaries;
      const lastSec = currentSecs[currentSecs.length - 1];
      const nextCodingDelay = lastSec ? (lastSec.codingDelayUs || 11000) + 14000 : 11000;
      const letters = ['W', 'X', 'Y', 'Z', 'A', 'B'];
      const nextLabel = letters[currentSecs.length] || `S${currentSecs.length + 1}`;
      const newSec = secondary || {
        label: nextLabel,
        name: `Secondary-${nextLabel}`,
        lat: Number((state.designChain.master.lat + (Math.random() - 0.5) * 1.5).toFixed(4)),
        lng: Number((state.designChain.master.lng + (Math.random() - 0.5) * 1.5).toFixed(4)),
        codingDelayUs: nextCodingDelay,
      };
      return {
        designChain: {
          ...state.designChain,
          secondaries: [...currentSecs, newSec],
        },
      };
    }),

  removeDesignSecondary: (index) =>
    set((state) => ({
      designChain: {
        ...state.designChain,
        secondaries: state.designChain.secondaries.filter((_, idx) => idx !== index),
      },
    })),

  setDesignGRI: (griUs) =>
    set((state) => ({
      designChain: {
        ...state.designChain,
        griUs: Number(griUs) || state.designChain.griUs,
      },
    })),

  setDesignTDSigma: (tdSigmaUs) =>
    set((state) => ({
      designChain: {
        ...state.designChain,
        tdSigmaUs: Number(tdSigmaUs) || 0.1,
      },
    })),

  updateDesignParams: (params) =>
    set((state) => ({
      designParams: {
        ...state.designParams,
        ...params,
      },
    })),

  loadDesignPreset: (presetKey) => {
    const preset = DESIGN_PRESETS[presetKey];
    if (!preset) return;
    set({
      designChain: JSON.parse(JSON.stringify(preset)),
      mapCenter: [preset.master.lng, preset.master.lat],
      mapZoom: 7,
    });
  },

  syncDesignFromActiveStations: () => {
    const { masters, slaves } = get();
    if (!masters.length) return;
    const m = masters[0];
    const newDesign = {
      name: 'Imported Active Chain',
      griUs: (m.griMs || 100) * 1000,
      tdSigmaUs: 0.1,
      coverageRadiusKm: 600,
      master: { label: m.label, name: m.name || m.label, lat: m.lat, lng: m.lng },
      secondaries: slaves.map((s, idx) => ({
        label: s.label || `S${idx + 1}`,
        name: s.name || s.label,
        lat: s.lat,
        lng: s.lng,
        codingDelayUs: s.codingDelayUs || Math.round((s.offsetSec || 0.015) * 1e6 - 2000),
      })),
    };
    set({ designChain: newDesign });
  },

  commitDesignToSimulation: () => {
    const { designChain } = get();
    const { master, secondaries, griUs } = designChain;
    if (!master || !secondaries.length) return;

    const newMaster = {
      role: 'master',
      label: master.label || 'M',
      name: master.name || 'Master',
      lat: master.lat,
      lng: master.lng,
      txDbm: 20,
      griMs: griUs / 1000,
      offsetSec: 0,
      ddsEnabled: true,
      clock: { type: 'gps-disciplined', biasSec: 0, driftPerSec: 0 },
    };

    const newSlaves = secondaries.map((sec, idx) => {
      const distM = haversineDistance(master, sec);
      const edResult = computeEmissionDelay(distM, sec.codingDelayUs || (11000 + idx * 14000));
      return {
        role: 'slave',
        label: sec.label || `S${idx + 1}`,
        name: sec.name || `Secondary ${sec.label || idx + 1}`,
        lat: sec.lat,
        lng: sec.lng,
        txDbm: 18,
        griMs: griUs / 1000,
        offsetSec: edResult.emissionDelayUs * 1e-6,
        codingDelayUs: edResult.codingDelayUs,
        emissionDelayUs: edResult.emissionDelayUs,
        clock: { type: 'gps-disciplined', biasSec: 0, driftPerSec: 0 },
      };
    });

    set({
      masters: [newMaster],
      slaves: newSlaves,
      isDesignMode: false,
      mapCenter: [master.lng, master.lat],
    });
    setTimeout(() => get().evaluateReceivers(), 50);
  },

  updateSettings: (newSettings) => {
    set((state) => ({ settings: { ...state.settings, ...newSettings } }));
    setTimeout(() => get().evaluateReceivers(), 20);
  },

  loadPreset: (presetId) => {
    const preset = PRESET_SCENARIOS[presetId];
    if (!preset) return;
    set({
      activePresetId: presetId,
      masters: JSON.parse(JSON.stringify(preset.masters)),
      slaves: JSON.parse(JSON.stringify(preset.slaves)),
      receivers: JSON.parse(JSON.stringify(preset.receivers)),
      mapCenter: preset.center,
      mapZoom: preset.zoom,
      contours: [],
      receiverFixes: {},
      gridStatus: { status: 'idle', computedAt: null, message: null },
      selectedReceiver: preset.receivers[0]?.label || '',
    });
    get().logActivity('PRESET', `Loaded scenario preset: ${preset.name || presetId}`, 'info');
    setTimeout(() => get().evaluateReceivers(), 50);
  },

  setStations: (masters, slaves, receivers) => {
    set({
      masters,
      slaves,
      receivers,
      contours: [],
      receiverFixes: {},
      selectedReceiver: receivers[0]?.label || '',
    });
    setTimeout(() => get().evaluateReceivers(), 50);
  },

  addStation: (station) => {
    const { role } = station;
    if (role === 'master') {
      set((state) => ({ masters: [...state.masters, station] }));
    } else if (role === 'slave') {
      set((state) => ({ slaves: [...state.slaves, station] }));
    } else if (role === 'receiver') {
      set((state) => ({
        receivers: [...state.receivers, station],
        selectedReceiver: state.selectedReceiver || station.label,
      }));
    }
  },

  updateStation: (typeOrLabel, labelOrUpdates, maybeUpdates) => {
    const label = maybeUpdates !== undefined ? labelOrUpdates : typeOrLabel;
    const updates = maybeUpdates !== undefined ? maybeUpdates : labelOrUpdates;
    set((state) => ({
      masters: state.masters.map((s) => (s.label === label ? { ...s, ...updates } : s)),
      slaves: state.slaves.map((s) => (s.label === label ? { ...s, ...updates } : s)),
      receivers: state.receivers.map((s) => (s.label === label ? { ...s, ...updates } : s)),
    }));
  },

  removeStation: (label) => {
    set((state) => ({
      masters: state.masters.filter((s) => s.label !== label),
      slaves: state.slaves.filter((s) => s.label !== label),
      receivers: state.receivers.filter((s) => s.label !== label),
      contours: [],
    }));
  },

  setGridStatus: (gridStatus) => set({ gridStatus }),
  setContours: (contours) => set({ contours }),

  recalculateFixes: () => get().evaluateReceivers(),

  // Calculates estimated position and integrity metrics for all receivers
  evaluateReceivers: () => {
    const { masters, slaves, receivers, simTimeSec, settings, stationStatus = {} } = get();
    if (!masters.length || !receivers.length) return;

    // Attach ASF evaluator (Millington mixed-path or AST formula override) to station
    const attachAsf = (st) => {
      if (settings.asfModelMode === 'millington') {
        return {
          ...st,
          asfEvaluator: createMillingtonAsfEvaluator({
            station: st,
            landFraction: settings.asfLandFraction ?? 0.5,
            landSigma: settings.asfLandSigma ?? 0.003,
            scale: settings.asfMillingtonScale ?? DEFAULT_MILLINGTON_SCALE,
            method: settings.asfEngineMethod ?? 'grwave',
            pathMode: settings.asfMillingtonPathMode ?? 'geo',
          }),
        };
      }
      if (settings.asfModelMode === 'formula' && st.asfFormula && st.asfFormula !== '0') {
        try {
          return { ...st, asfEvaluator: compileAsfExpression(st.asfFormula) };
        } catch {
          return { ...st, asfEvaluator: () => 0 };
        }
      }
      return st;
    };

    const evaluatedMasters = masters.map(attachAsf);
    const evaluatedSlaves = slaves.map(attachAsf);

    const activeMasters = evaluatedMasters.filter((m) => (stationStatus[m.label] || 'nominal') !== 'failed');
    const activeSlaves = evaluatedSlaves.filter((s) => (stationStatus[s.label] || 'nominal') !== 'failed');
    const refMaster = activeMasters[0] || evaluatedMasters[0];
    const isMasterFailed = !activeMasters.length;

    const toaNoiseStdDevMeters = computeToaNoiseStdDevMeters({
      snrDb: settings.snrDb || 18,
      pulsesAveraged: settings.pulsesAveraged || 10,
      jitterMeters: settings.jitterMeters || DEFAULT_TOA_NOISE_PARAMS.jitterMeters,
      kConstantMeters: settings.kConstantMeters || DEFAULT_TOA_NOISE_PARAMS.kConstantMeters,
    });
    const toaNoiseStdDevSec = toaNoiseStdDevMeters / SPEED_OF_LIGHT;

    const sampleGaussianSec = () => {
      const u1 = Math.max(1e-12, Math.random());
      const u2 = Math.random();
      return toaNoiseStdDevSec * Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
    };

    const fixes = {};

    receivers.forEach((rx) => {
      let eloranSol;
      let rawTdoaPairs = [];

      const activeTransmitters = [...activeMasters, ...activeSlaves];
      const hasEnoughHyperbolic = !isMasterFailed && activeSlaves.length >= 2;
      const hasEnoughPseudorange = activeTransmitters.length >= 3;

      if (settings.solverMode === 'pseudorange' && hasEnoughPseudorange) {
        // Modern 3D Pseudorange solver with Receiver Clock Bias (b_rx)
        const observations = activeTransmitters.map((st) => {
          const isDegraded = (stationStatus[st.label] || 'nominal') === 'degraded';
          let arrivalSec = computeArrivalSec(
            st,
            rx.lat,
            rx.lng,
            simTimeSec,
            settings.refractiveIndex,
            settings.enableSecondaryFactor
          );

          if (settings.noiseMode === 'random') {
            arrivalSec += sampleGaussianSec();
          }
          if (isDegraded) {
            arrivalSec += sampleGaussianSec() * 2.5; // Inflated noise for degraded transmitter
          }

          let slipped = false;
          if (settings.enableCycleSlips) {
            const slipRes = simulateCycleSlip(
              arrivalSec,
              settings.snrDb || 18,
              settings.pulsesAveraged || 10,
              Math.random,
              settings.cycleSlipModel || 'boyce-ratio'
            );
            arrivalSec = slipRes.arrivalSec;
            slipped = slipRes.slipped;
          }

          // Pre-evaluate position-dependent ASF so the solver's internal model
          // matches the observation built by computeArrivalSec (which calls
          // st.asfEvaluator if present; the solver only checks st.asfMeters).
          let evaluatedAsfMeters = typeof st.asfMeters === 'number' ? st.asfMeters : 0;
          if (typeof st.asfEvaluator === 'function') {
            try { evaluatedAsfMeters = st.asfEvaluator(rx.lat, rx.lng) || 0; } catch { /* noop */ }
          }

          // Subtract the known transmitter emission delay (offsetSec) so that
          // pseudorangeMeters represents propagation time only.  Without this,
          // secondary stations produce pseudoranges thousands of km too large
          // (e.g. offsetSec=0.011 s -> +3,298 km) causing the solver to diverge.
          const emissionDelayMeters = (st.offsetSec || 0) * SPEED_OF_LIGHT;

          return {
            station: { ...st, asfMeters: evaluatedAsfMeters },
            pseudorangeMeters: arrivalSec * SPEED_OF_LIGHT - emissionDelayMeters,
            slipped,
          };
        });

        eloranSol = solvePositionPseudorange(observations, { lat: rx.lat, lng: rx.lng }, {
          eta: settings.refractiveIndex,
          includeSF: settings.enableSecondaryFactor,
        });

        // Also build TDOA pairs for display in LOP telemetry
        rawTdoaPairs = activeSlaves.map((s) => ({
          master: refMaster,
          slave: s,
          tdoaSec: computeTDOAPair(refMaster, s, rx.lat, rx.lng, simTimeSec, settings.refractiveIndex),
        }));
      } else if (hasEnoughHyperbolic) {
        // Classical Hyperbolic TDOA Gauss-Newton solver
        rawTdoaPairs = activeSlaves.map((s) => {
          const isDegraded = (stationStatus[s.label] || 'nominal') === 'degraded';
          let tdoa = computeTDOAPair(refMaster, s, rx.lat, rx.lng, simTimeSec, settings.refractiveIndex);
          let sAsf = typeof s.asfMeters === 'number' ? s.asfMeters : 0;
          if (typeof s.asfEvaluator === 'function') {
            try { sAsf = s.asfEvaluator(rx.lat, rx.lng) || 0; } catch { sAsf = 0; }
          }
          let mAsf = typeof refMaster.asfMeters === 'number' ? refMaster.asfMeters : 0;
          if (typeof refMaster.asfEvaluator === 'function') {
            try { mAsf = refMaster.asfEvaluator(rx.lat, rx.lng) || 0; } catch { mAsf = 0; }
          }
          if (settings.noiseMode === 'random') {
            tdoa += sampleGaussianSec();
          }
          if (isDegraded) {
            tdoa += sampleGaussianSec() * 2.5;
          }
          if (settings.enableCycleSlips) {
            tdoa = simulateCycleSlip(
              tdoa,
              settings.snrDb || 18,
              settings.pulsesAveraged || 10,
              Math.random,
              settings.cycleSlipModel || 'boyce-ratio'
            ).arrivalSec;
          }
          return {
            master: { ...refMaster, asfMeters: mAsf },
            slave: { ...s, asfMeters: sAsf },
            tdoaSec: tdoa,
          };
        });

        eloranSol = solvePositionFromTDOA(rawTdoaPairs, { lat: rx.lat, lng: rx.lng }, {
          eta: settings.refractiveIndex,
        });
      } else {
        const failureReason = isMasterFailed
          ? 'Master transmitter OFFLINE: Hyperbolic navigation impossible without Master reference'
          : activeSlaves.length < 2
          ? `Constellation failure: Only ${activeSlaves.length} Secondary active (minimum 2 required for 2D fix)`
          : 'Insufficient constellation geometry for navigation fix';

        eloranSol = {
          lat: rx.lat,
          lng: rx.lng,
          biasSec: 0,
          converged: false,
          iterations: 0,
          gdop: 99.9,
          hdop: 99.9,
          error: failureReason,
          insufficientStations: true,
        };
      }

      // Simulate GNSS fix with optional degradation / interference modes
      const gnssFix = simulateGnssFix(rx, settings.gnssStdDevMeters || 8, Math.random, {
        status: settings.gnssStatus || 'nominal',
        jammingNoiseMeters: settings.gnssJammingNoiseMeters || 75,
        spoofBiasMeters: settings.gnssSpoofBiasMeters || 150,
      });

      // Multi-sensor fusion
      const fused = fusePositions(eloranSol, gnssFix, rx.fuseMode || 'fusion', rx);

      // Error distance in meters from true position
      const safeSol = {
        lat: Number.isFinite(eloranSol.lat) ? Math.max(-90, Math.min(90, eloranSol.lat)) : rx.lat,
        lng: Number.isFinite(eloranSol.lng) ? eloranSol.lng : rx.lng,
      };
      const errorMeters = (eloranSol.lat !== undefined && eloranSol.lng !== undefined && eloranSol.converged)
        ? haversineDistance(rx, safeSol)
        : (fused.errorMeters || 0);

      const fixLat = Number.isFinite(fused.lat) ? Math.max(-90, Math.min(90, fused.lat)) : rx.lat;
      const fixLng = Number.isFinite(fused.lng) ? ((((fused.lng + 180) % 360) + 360) % 360) - 180 : rx.lng;

      fixes[rx.label] = {
        ...fused,
        lat: fixLat,
        lng: fixLng,
        eloranSol,
        gnssFix,
        fusedFix: fused,
        clockBiasSec: eloranSol.clockBiasSec || 0,
        clockBiasNs: (eloranSol.clockBiasSec || 0) * 1e9,
        hdop: eloranSol.hdop || 1.0,
        tdop: eloranSol.tdop || 1.0,
        errorMeters,
        computedAt: Date.now(),
        rawTdoaPairs,
        solverMode: settings.solverMode,
        converged: fused.converged ?? eloranSol.converged ?? true,
        noSolution: fused.noSolution ?? eloranSol.noSolution ?? false,
        toaNoiseStdDevMeters,
        asfModelMode: settings.asfModelMode,
        cycleSlipModel: settings.cycleSlipModel,

      };
    });

    // Record dynamic uncertainty sample for active receiver
    const activeLabel = get().selectedReceiver || receivers[0]?.label;
    const activeFix = fixes[activeLabel] || Object.values(fixes)[0];
    if (activeFix) {
      const err = activeFix.errorMeters ?? 0;
      const sample = {
        timestamp: Date.now(),
        variance: Math.max(0.01, err * err),
        gdop: activeFix.gdop ?? activeFix.eloranSol?.gdop ?? 1.0,
        errorMeters: err,
      };
      set((state) => ({
        receiverFixes: fixes,
        uncertaintyHistory: [...(state.uncertaintyHistory || []).slice(-59), sample],
      }));
    } else {
      set({ receiverFixes: fixes });
    }
  },

  resetAll: () =>
    set({
      masters: [],
      slaves: [],
      receivers: [],
      contours: [],
      receiverFixes: {},
      gridStatus: { status: 'idle', computedAt: null, message: null },
      ddsLogs: [],
      simTimeSec: 0,
      isSimRunning: false,
    }),
  };
});
