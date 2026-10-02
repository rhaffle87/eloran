import { describe, it, expect } from 'vitest';
import {
  validateMissionPack,
  createMissionPackFromState,
  hydrateMissionPackIntoStore,
  BUILTIN_MISSION_PACKS,
  MISSION_PACK_SCHEMA_VERSION,
} from '../scenarioPack.js';

describe('Mission Pack Serialization & Validation (scenarioPack.js)', () => {
  it('validates all built-in mission packs successfully', () => {
    BUILTIN_MISSION_PACKS.forEach((pack) => {
      const res = validateMissionPack(pack);
      expect(res.valid).toBe(true);
      expect(res.errors).toHaveLength(0);
      expect(res.data).toBeDefined();
    });
  });

  it('rejects null or non-object payloads', () => {
    expect(validateMissionPack(null).valid).toBe(false);
    expect(validateMissionPack([]).valid).toBe(false);
    expect(validateMissionPack('invalid string').valid).toBe(false);
  });

  it('rejects mission packs with invalid or future schema version', () => {
    const res = validateMissionPack({
      version: 999,
      meta: { name: 'Future Mission' },
      chain: { masters: [{ label: 'M', lat: 0, lng: 0 }] },
    });
    expect(res.valid).toBe(false);
    expect(res.errors.some((e) => e.includes('Unsupported schema version'))).toBe(true);
  });

  it('rejects mission packs with missing or invalid stations', () => {
    const noMasters = validateMissionPack({
      version: 1,
      meta: { name: 'Empty Chain' },
      chain: { masters: [] },
    });
    expect(noMasters.valid).toBe(false);

    const badCoord = validateMissionPack({
      version: 1,
      meta: { name: 'Bad Coords' },
      chain: { masters: [{ label: 'M', lat: 95.0, lng: 0 }] },
    });
    expect(badCoord.valid).toBe(false);
    expect(badCoord.errors.some((e) => e.includes('invalid latitude'))).toBe(true);
  });

  it('serializes simulationStore state into a valid Mission Pack', () => {
    const mockStoreState = {
      activePresetId: 'test_preset',
      masters: [
        { label: 'M1', name: 'Master-1', lat: 52.0, lng: 4.0, txDbm: 20, griMs: 9930 },
      ],
      slaves: [
        { label: 'S1', name: 'Secondary-1', lat: 53.0, lng: 5.0, codingDelayUs: 12000 },
      ],
      receivers: [
        { label: 'R1', lat: 52.5, lng: 4.5 },
      ],
      settings: {
        solverMode: 'pseudorange',
        enableSecondaryFactor: true,
        includeSkywave: true,
        skywaveAmpRatio: 0.4,
      },
      mapCenter: [4.0, 52.0],
      mapZoom: 8,
    };

    const pack = createMissionPackFromState(mockStoreState, {
      name: 'North Sea Patrol',
      description: 'Tactical patrol corridor',
      author: 'Test Officer',
    });

    expect(pack.version).toBe(MISSION_PACK_SCHEMA_VERSION);
    expect(pack.meta.name).toBe('North Sea Patrol');
    expect(pack.chain.masters).toHaveLength(1);
    expect(pack.chain.slaves).toHaveLength(1);

    const validation = validateMissionPack(pack);
    expect(validation.valid).toBe(true);
    expect(validation.errors).toHaveLength(0);
  });

  it('hydrates a validated mission pack into target store actions', () => {
    const targetStore = {
      masters: [],
      slaves: [],
      receivers: [],
      settings: {},
      selectedReceiver: null,
      mapCenter: null,
      mapZoom: 0,
      logActivity: () => {},
    };

    const packToLoad = BUILTIN_MISSION_PACKS[0];
    const res = hydrateMissionPackIntoStore(packToLoad, targetStore);

    expect(res.success).toBe(true);
    expect(targetStore.masters).toHaveLength(1);
    expect(targetStore.slaves).toHaveLength(2);
    expect(targetStore.masters[0].label).toBe('M-Pohang');
    expect(targetStore.settings.solverMode).toBe('pseudorange');
    expect(targetStore.settings.enableSecondaryFactor).toBe(true);
  });
});
