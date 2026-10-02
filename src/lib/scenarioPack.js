/**
 * SIMULORAN — Scenario Packaging & Mission Pack Engine (scenarioPack.js)
 *
 * Implements standardized, portable JSON Mission Packs (.simuloran.json)
 * for saving, restoring, and sharing complex multi-chain simulation configurations,
 * station parameters, receiver trajectories, and propagation models.
 *
 * Schema Version: 1
 */

export const MISSION_PACK_SCHEMA_VERSION = 1;

/**
 * Validates a candidate Mission Pack object against the SIMULORAN v1 schema.
 *
 * @param {any} pack - Candidate parsed JSON object
 * @returns {{ valid: boolean, errors: string[], data?: object }}
 */
export function validateMissionPack(pack) {
  const errors = [];

  if (!pack || typeof pack !== 'object' || Array.isArray(pack)) {
    return { valid: false, errors: ['Mission Pack payload must be a non-null JSON object'] };
  }

  // 1. Version check
  if (!pack.version || typeof pack.version !== 'number') {
    errors.push('Missing or invalid schema "version" field (must be number, e.g. 1)');
  } else if (pack.version > MISSION_PACK_SCHEMA_VERSION) {
    errors.push(`Unsupported schema version ${pack.version}. Max supported is ${MISSION_PACK_SCHEMA_VERSION}`);
  }

  // 2. Metadata check
  if (!pack.meta || typeof pack.meta !== 'object') {
    errors.push('Missing or invalid "meta" object');
  } else {
    if (!pack.meta.name || typeof pack.meta.name !== 'string' || !pack.meta.name.trim()) {
      errors.push('meta.name must be a non-empty string');
    }
  }

  // 3. Chain & Stations check
  if (!pack.chain || typeof pack.chain !== 'object') {
    errors.push('Missing or invalid "chain" configuration object');
  } else {
    const { masters, slaves } = pack.chain;

    if (!Array.isArray(masters) || masters.length === 0) {
      errors.push('chain.masters must be a non-empty array with at least one master station');
    } else {
      masters.forEach((m, idx) => {
        if (typeof m.lat !== 'number' || m.lat < -90 || m.lat > 90) {
          errors.push(`chain.masters[${idx}] has invalid latitude: ${m.lat}`);
        }
        if (typeof m.lng !== 'number' || m.lng < -180 || m.lng > 180) {
          errors.push(`chain.masters[${idx}] has invalid longitude: ${m.lng}`);
        }
        if (!m.label || typeof m.label !== 'string') {
          errors.push(`chain.masters[${idx}] missing valid "label" string`);
        }
      });
    }

    if (slaves && !Array.isArray(slaves)) {
      errors.push('chain.slaves must be an array of secondary stations');
    } else if (Array.isArray(slaves)) {
      slaves.forEach((s, idx) => {
        if (typeof s.lat !== 'number' || s.lat < -90 || s.lat > 90) {
          errors.push(`chain.slaves[${idx}] has invalid latitude: ${s.lat}`);
        }
        if (typeof s.lng !== 'number' || s.lng < -180 || s.lng > 180) {
          errors.push(`chain.slaves[${idx}] has invalid longitude: ${s.lng}`);
        }
        if (!s.label || typeof s.label !== 'string') {
          errors.push(`chain.slaves[${idx}] missing valid "label" string`);
        }
      });
    }
  }

  // 4. Receivers check (optional but validated if present)
  if (pack.environment?.receivers) {
    if (!Array.isArray(pack.environment.receivers)) {
      errors.push('environment.receivers must be an array');
    } else {
      pack.environment.receivers.forEach((r, idx) => {
        if (typeof r.lat !== 'number' || typeof r.lng !== 'number') {
          errors.push(`environment.receivers[${idx}] has invalid coordinates`);
        }
      });
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    data: errors.length === 0 ? pack : undefined,
  };
}

/**
 * Serializes the current simulationStore state into a standardized Mission Pack.
 *
 * @param {object} storeState - Current state snapshot from simulationStore
 * @param {object} [customMeta={}] - Optional metadata overrides
 * @returns {object} Standardized Mission Pack object
 */
export function createMissionPackFromState(storeState, customMeta = {}) {
  const meta = {
    name: customMeta.name || `Scenario-${new Date().toISOString().slice(0, 10)}`,
    description: customMeta.description || 'Exported from SIMULORAN Tactical PNT Testbed',
    author: customMeta.author || 'SIMULORAN Navigator',
    createdAt: new Date().toISOString(),
    tags: customMeta.tags || ['tactical', 'pnt', 'eloran'],
  };

  const chain = {
    activePresetId: storeState.activePresetId || 'custom',
    masters: (storeState.masters || []).map((m) => ({
      role: 'master',
      label: m.label || 'M',
      name: m.name || m.label || 'Master',
      lat: m.lat,
      lng: m.lng,
      txDbm: m.txDbm ?? 20,
      griMs: m.griMs ?? 1000,
      offsetSec: m.offsetSec ?? 0,
      phaseSec: m.phaseSec ?? 0,
      ddsEnabled: m.ddsEnabled ?? true,
      clock: m.clock ? { ...m.clock } : { biasSec: 0, driftPerSec: 0 },
    })),
    slaves: (storeState.slaves || []).map((s) => ({
      role: 'slave',
      label: s.label || 'S',
      name: s.name || s.label || 'Secondary',
      lat: s.lat,
      lng: s.lng,
      txDbm: s.txDbm ?? 18,
      codingDelayUs: s.codingDelayUs ?? 11000,
      emissionDelayUs: s.emissionDelayUs ?? 12000,
      masterId: s.masterId || storeState.masters?.[0]?.label || 'M',
      clock: s.clock ? { ...s.clock } : { biasSec: 0, driftPerSec: 0 },
    })),
  };

  const environment = {
    receivers: (storeState.receivers || []).map((r) => ({
      label: r.label || 'R1-Vessel',
      lat: r.lat,
      lng: r.lng,
      trueLat: r.trueLat ?? r.lat,
      trueLng: r.trueLng ?? r.lng,
    })),
    selectedReceiver: storeState.selectedReceiver || 'R1-Vessel',
    mapCenter: storeState.mapCenter || [106.82, -6.15],
    mapZoom: storeState.mapZoom || 9,
  };

  const physics = {
    settings: {
      solverMode: storeState.settings?.solverMode ?? 'pseudorange',
      refractiveIndex: storeState.settings?.refractiveIndex ?? 1.000338,
      enableSecondaryFactor: storeState.settings?.enableSecondaryFactor ?? false,
      enableCycleSlips: storeState.settings?.enableCycleSlips ?? false,
      cycleSlipModel: storeState.settings?.cycleSlipModel ?? 'boyce-ratio',
      snrDb: storeState.settings?.snrDb ?? 18,
      pulsesAveraged: storeState.settings?.pulsesAveraged ?? 10,
      asfModelMode: storeState.settings?.asfModelMode ?? 'millington',
      asfLandSigma: storeState.settings?.asfLandSigma ?? 0.003,
      includeCarrier: storeState.settings?.includeCarrier ?? true,
      includeSkywave: storeState.settings?.includeSkywave ?? false,
      skywaveDelayMs: storeState.settings?.skywaveDelayMs ?? 1.5,
      skywaveAmpRatio: storeState.settings?.skywaveAmpRatio ?? 0.35,
      gnssStatus: storeState.settings?.gnssStatus ?? 'nominal',
    },
  };

  return {
    $schema: 'https://simuloran.org/schema/mission-pack-v1.json',
    version: MISSION_PACK_SCHEMA_VERSION,
    meta,
    chain,
    environment,
    physics,
  };
}

/**
 * Hydrates a validated Mission Pack into the SIMULORAN simulation store.
 *
 * @param {object} missionPack - Validated Mission Pack object
 * @param {object} store - Zustand store actions & set function
 * @returns {{ success: boolean, message: string }}
 */
export function hydrateMissionPackIntoStore(missionPack, store) {
  const validation = validateMissionPack(missionPack);
  if (!validation.valid) {
    return {
      success: false,
      message: `Invalid Mission Pack: ${validation.errors.join('; ')}`,
    };
  }

  const { chain, environment, physics, meta } = validation.data;

  // Hydrate station layout
  if (chain?.masters?.length) {
    store.masters = chain.masters;
  }
  if (Array.isArray(chain?.slaves)) {
    store.slaves = chain.slaves;
  }

  // Hydrate environment & map
  if (environment?.receivers?.length) {
    store.receivers = environment.receivers;
  }
  if (environment?.selectedReceiver) {
    store.selectedReceiver = environment.selectedReceiver;
  }
  if (environment?.mapCenter) {
    store.mapCenter = environment.mapCenter;
  }
  if (typeof environment?.mapZoom === 'number') {
    store.mapZoom = environment.mapZoom;
  }

  // Hydrate physics settings
  if (physics?.settings) {
    store.settings = {
      ...store.settings,
      ...physics.settings,
    };
  }

  if (typeof store.logActivity === 'function') {
    store.logActivity(
      'MISSION',
      `Loaded Mission Pack "${meta.name}" (${chain.masters.length}M / ${chain.slaves?.length || 0}S)`,
      'info'
    );
  }

  return {
    success: true,
    message: `Successfully loaded Mission Pack: "${meta.name}"`,
  };
}

/**
 * Built-in tactical and benchmark mission packs for 1-click loading.
 */
export const BUILTIN_MISSION_PACKS = [
  {
    version: 1,
    meta: {
      id: 'korea-incheon-2021',
      name: 'Korea 2021 Flight Testbed (Incheon & Pohang)',
      description: 'Sovereign eLoran flight trial benchmark from Rhee et al. (IEEE TAES 2021). Evaluates TOA variance and differential corrections across the Yellow Sea.',
      author: 'Rhee, Kim, Son, & Seo (2021)',
      createdAt: '2026-10-01T00:00:00Z',
      tags: ['benchmark', 'flight-trial', 'korea', 'rhee-2021'],
    },
    chain: {
      activePresetId: 'korea_trial',
      masters: [
        {
          role: 'master',
          label: 'M-Pohang',
          name: 'Pohang eLoran Master',
          lat: 36.0322,
          lng: 129.3650,
          txDbm: 20,
          griMs: 9930,
          offsetSec: 0,
          phaseSec: 0,
          ddsEnabled: true,
          clock: { biasSec: 0, driftPerSec: 0 },
        },
      ],
      slaves: [
        {
          role: 'slave',
          label: 'W-Gwangju',
          name: 'Gwangju Secondary',
          lat: 35.1595,
          lng: 126.8526,
          txDbm: 18,
          codingDelayUs: 11000,
          emissionDelayUs: 12450,
          masterId: 'M-Pohang',
          clock: { biasSec: 0, driftPerSec: 0 },
        },
        {
          role: 'slave',
          label: 'X-Incheon',
          name: 'Incheon D-Loran Secondary',
          lat: 37.4563,
          lng: 126.7052,
          txDbm: 18,
          codingDelayUs: 25000,
          emissionDelayUs: 26800,
          masterId: 'M-Pohang',
          clock: { biasSec: 0, driftPerSec: 0 },
        },
      ],
    },
    environment: {
      receivers: [
        {
          label: 'Flight-R1',
          lat: 37.2000,
          lng: 126.5000,
          trueLat: 37.2000,
          trueLng: 126.5000,
        },
      ],
      selectedReceiver: 'Flight-R1',
      mapCenter: [127.5, 36.5],
      mapZoom: 7,
    },
    physics: {
      settings: {
        solverMode: 'pseudorange',
        refractiveIndex: 1.000315,
        enableSecondaryFactor: true,
        asfModelMode: 'millington',
        asfLandSigma: 0.003,
        includeCarrier: true,
        includeSkywave: false,
        gnssStatus: 'nominal',
      },
    },
  },
  {
    version: 1,
    meta: {
      id: 'dover-tss-corridor',
      name: 'English Channel Dover TSS Maritime Corridor',
      description: 'High-density commercial passage through the Dover Strait Traffic Separation Scheme. Tests multi-path immunity, baseline crossing angles, and HEA navigation.',
      author: 'SIMULORAN Maritime Group',
      createdAt: '2026-10-01T00:00:00Z',
      tags: ['maritime', 'tss', 'dover', 'english-channel'],
    },
    chain: {
      activePresetId: 'dover_tss',
      masters: [
        {
          role: 'master',
          label: 'M-Dover',
          name: 'Dover Head Master',
          lat: 51.1320,
          lng: 1.3450,
          txDbm: 20,
          griMs: 7430,
          offsetSec: 0,
          phaseSec: 0,
          ddsEnabled: true,
          clock: { biasSec: 0, driftPerSec: 0 },
        },
      ],
      slaves: [
        {
          role: 'slave',
          label: 'W-Calais',
          name: 'Calais Secondary',
          lat: 50.9513,
          lng: 1.8587,
          txDbm: 18,
          codingDelayUs: 12000,
          emissionDelayUs: 13500,
          masterId: 'M-Dover',
          clock: { biasSec: 0, driftPerSec: 0 },
        },
        {
          role: 'slave',
          label: 'X-Dungeness',
          name: 'Dungeness Secondary',
          lat: 50.9167,
          lng: 0.9833,
          txDbm: 18,
          codingDelayUs: 27000,
          emissionDelayUs: 28400,
          masterId: 'M-Dover',
          clock: { biasSec: 0, driftPerSec: 0 },
        },
      ],
    },
    environment: {
      receivers: [
        {
          label: 'Vessel-TSS',
          lat: 51.0500,
          lng: 1.5000,
          trueLat: 51.0500,
          trueLng: 1.5000,
        },
      ],
      selectedReceiver: 'Vessel-TSS',
      mapCenter: [1.5, 51.05],
      mapZoom: 9,
    },
    physics: {
      settings: {
        solverMode: 'tdoa',
        refractiveIndex: 1.000338,
        enableSecondaryFactor: true,
        asfModelMode: 'millington',
        asfLandSigma: 0.005,
        includeCarrier: true,
        includeSkywave: true,
        skywaveDelayMs: 1.2,
        skywaveAmpRatio: 0.3,
        gnssStatus: 'nominal',
      },
    },
  },
];
