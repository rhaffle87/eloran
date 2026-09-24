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
} from '../lib/tdoa.js';
import {
  SPEED_OF_LIGHT,
  DEFAULT_REFRACTIVE_INDEX,
  haversineDistance,
} from '../lib/geodesy.js';
import { fusePositions, simulateGnssFix } from '../lib/fusion.js';
import { broadcastDdsEvents } from '../lib/dds.js';

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
    enableSecondaryFactor: true, // Seawater 5 S/m Brunavs delay
    enableCycleSlips: false, // Boyce 2006 wrong-cycle selection (±10 µs / ~3 km error)
    snrDb: 18,
    pulsesAveraged: 10,
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

    const refMaster = masters[0];
    const fixes = {};

    receivers.forEach((rx) => {
      let eloranSol;
      let rawTdoaPairs = [];

      if (settings.solverMode === 'pseudorange' && (masters.length + slaves.length >= 3)) {
        // Modern 3D Pseudorange solver with Receiver Clock Bias (b_rx)
        const allTransmitters = [...masters, ...slaves];
        const observations = allTransmitters.map((st) => {
          let arrivalSec = computeArrivalSec(
            st,
            rx.lat,
            rx.lng,
            simTimeSec,
            settings.refractiveIndex,
            settings.enableSecondaryFactor
          );

          let slipped = false;
          if (settings.enableCycleSlips) {
            const slipRes = simulateCycleSlip(
              arrivalSec,
              settings.snrDb || 18,
              settings.pulsesAveraged || 10
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
        rawTdoaPairs = slaves.map((s) => ({
          master: refMaster,
          slave: s,
          tdoaSec: computeTDOAPair(refMaster, s, rx.lat, rx.lng, simTimeSec, settings.refractiveIndex),
        }));
      } else {
        // Classical Hyperbolic TDOA Gauss-Newton solver
        rawTdoaPairs = slaves.map((s) => {
          let tdoa = computeTDOAPair(refMaster, s, rx.lat, rx.lng, simTimeSec, settings.refractiveIndex);
          if (settings.enableCycleSlips) {
            tdoa = simulateCycleSlip(tdoa, settings.snrDb || 18, settings.pulsesAveraged || 10).arrivalSec;
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
