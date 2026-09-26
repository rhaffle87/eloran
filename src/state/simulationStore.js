/**
 * Central Simulation State Store for LORAN LAB
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

export const useSimulationStore = create((set, get) => ({
  // Active Scenario & Stations
  activePresetId: 'jakarta_baseline',
  masters: PRESET_SCENARIOS.jakarta_baseline.masters,
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

  // Visualization Layers
  gdopLayerVisible: false,
  baselinesVisible: true,
  lopsVisible: true,

  // Configuration Settings & Physics Parameters
  settings: {
    solverMode: 'pseudorange', // 'pseudorange' (with b_rx clock bias) | 'tdoa' (hyperbolic)
    refractiveIndex: DEFAULT_REFRACTIVE_INDEX, // RTCM MPS: 1.000338, Handbook: 1.000284, China: 1.000315
    enableSecondaryFactor: false, // UNVERIFIED: disabled by default due to 100 statute mile discontinuity
    enableCycleSlips: false, // Boyce 2006 wrong-cycle selection (±10 µs / ~3 km error)
    cycleSlipModel: 'boyce-ratio', // 'boyce-ratio' (Boyce 2006) | 'austron-28' (New) | 'austron-42' (Old)
    snrDb: 18,
    pulsesAveraged: 10,
    jitterMeters: DEFAULT_TOA_NOISE_PARAMS.jitterMeters, // SOURCED: 6.0 m (Rhee et al. 2021)
    kConstantMeters: DEFAULT_TOA_NOISE_PARAMS.kConstantMeters, // SOURCED: 337.5 m (Rhee et al. 2021)
    asfModelMode: 'millington', // 'millington' (Physical Mixed-Path) | 'formula' (AST Override)
    asfEngineMethod: 'grwave', // 'grwave' (SOURCED ITU-R P.368 / GRWAVE) | 'empirical' (UNVERIFIED k_asf)
    asfLandFraction: 0.5,
    asfLandSigma: 0.003, // ITU-R P.832 Agricultural/Forest
    asfMillingtonScale: DEFAULT_MILLINGTON_SCALE, // UNVERIFIED: 0.0008
    enableDDS: true,
    enableIntegrity: true,
    integrityThresholdMeters: 50,
    noiseMode: 'controlled', // 'controlled' | 'random' | 'none'
    noiseStdDevMeters: 20,
    contourEpsilonMeters: 8,
    gridResolution: 180,
    contourUnit: 'meters', // 'meters' | 'seconds'
    includeCarrier: false, // RF carrier vs envelope
    includeSkywave: false,
    skywaveDelayMs: 1.5,
    skywaveAmpRatio: 0.3,
  },

  // Actions
  setMapMode: (mode) => set({ mapMode: mode }),
  setMapCenter: (center, zoom) => set({ mapCenter: center, ...(zoom ? { mapZoom: zoom } : {}) }),
  setSelectedReceiver: (label) => set({ selectedReceiver: label }),

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

  updateStation: (label, updates) => {
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

  // Calculates estimated position and integrity metrics for all receivers
  evaluateReceivers: () => {
    const { masters, slaves, receivers, simTimeSec, settings } = get();
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
    const refMaster = evaluatedMasters[0];

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

      if (settings.solverMode === 'pseudorange' && (evaluatedMasters.length + evaluatedSlaves.length >= 3)) {
        // Modern 3D Pseudorange solver with Receiver Clock Bias (b_rx)
        const allTransmitters = [...evaluatedMasters, ...evaluatedSlaves];
        const observations = allTransmitters.map((st) => {
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

          return {
            station: st,
            pseudorangeMeters: arrivalSec * SPEED_OF_LIGHT,
            slipped,
          };
        });

        eloranSol = solvePositionPseudorange(observations, { lat: rx.lat, lng: rx.lng }, {
          eta: settings.refractiveIndex,
          includeSF: settings.enableSecondaryFactor,
        });

        // Also build TDOA pairs for display in LOP telemetry
        rawTdoaPairs = evaluatedSlaves.map((s) => ({
          master: refMaster,
          slave: s,
          tdoaSec: computeTDOAPair(refMaster, s, rx.lat, rx.lng, simTimeSec, settings.refractiveIndex),
        }));
      } else {
        // Classical Hyperbolic TDOA Gauss-Newton solver
        rawTdoaPairs = evaluatedSlaves.map((s) => {
          let tdoa = computeTDOAPair(refMaster, s, rx.lat, rx.lng, simTimeSec, settings.refractiveIndex);
          if (settings.noiseMode === 'random') {
            tdoa += sampleGaussianSec();
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
            master: refMaster,
            slave: s,
            tdoaSec: tdoa,
          };
        });

        eloranSol = solvePositionFromTDOA(rawTdoaPairs, { lat: rx.lat, lng: rx.lng }, {
          eta: settings.refractiveIndex,
        });
      }

      // Simulate GNSS fix
      const gnssFix = simulateGnssFix(rx, 8);

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

    set({ receiverFixes: fixes });
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
}));
