/**
 * Central Simulation State Store for LORAN LAB
 * Implemented with Zustand. Shared seamlessly across Loran-C, eLoran, Waveforms, and Map.
 */

import { create } from 'zustand';
import { PRESET_SCENARIOS } from './presets.js';
import { computeTDOAPair, solvePositionFromTDOA } from '../lib/tdoa.js';
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

  // Configuration Settings
  settings: {
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

  updateSettings: (newSettings) =>
    set((state) => ({ settings: { ...state.settings, ...newSettings } })),

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
  },

  setStations: (masters, slaves, receivers) =>
    set({
      masters,
      slaves,
      receivers,
      contours: [],
      receiverFixes: {},
      selectedReceiver: receivers[0]?.label || '',
    }),

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
    const { masters, slaves, receivers, simTimeSec } = get();
    if (!masters.length || !slaves.length || !receivers.length) return;

    const refMaster = masters[0];
    const fixes = {};

    receivers.forEach((rx) => {
      // Build TDOA observation pairs
      const pairs = slaves.map((s) => ({
        master: refMaster,
        slave: s,
        tdoaSec: computeTDOAPair(refMaster, s, rx.lat, rx.lng, simTimeSec),
      }));

      // Solve position
      const initialGuess = { lat: rx.lat, lng: rx.lng };
      const eloranSol = solvePositionFromTDOA(pairs, initialGuess);

      // Simulate GNSS fix
      const gnssFix = simulateGnssFix(rx, 8);

      // Multi-sensor fusion
      const fused = fusePositions(eloranSol, gnssFix, rx.fuseMode || 'fusion', rx);

      fixes[rx.label] = {
        ...fused,
        computedAt: Date.now(),
        rawTdoaPairs: pairs,
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
