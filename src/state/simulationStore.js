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

export const useSimulationStore = create((set, get) => ({
  // Active Scenario & Stations
  activePresetId: 'jakarta_baseline',
  masters: PRESET_SCENARIOS.jakarta_baseline.masters,
  slaves: PRESET_SCENARIOS.jakarta_baseline.slaves,
  receivers: PRESET_SCENARIOS.jakarta_baseline.receivers,

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
      const errorMeters = (eloranSol.lat !== undefined && eloranSol.lng !== undefined)
        ? haversineDistance(rx, { lat: eloranSol.lat, lng: eloranSol.lng })
        : 0;

      fixes[rx.label] = {
        ...fused,
        eloranSol,
        clockBiasSec: eloranSol.clockBiasSec || 0,
        clockBiasNs: (eloranSol.clockBiasSec || 0) * 1e9,
        hdop: eloranSol.hdop || 1.0,
        tdop: eloranSol.tdop || 1.0,
        errorMeters,
        computedAt: Date.now(),
        rawTdoaPairs,
        solverMode: settings.solverMode,
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
