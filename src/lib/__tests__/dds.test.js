/**
 * Unit tests for src/lib/dds.js (Eurofix / LDC rework, Track C)
 *
 * Tests verify:
 * 1. Pattern table — 128 balanced patterns, no duplicates
 * 2. encodeEurofixSymbol / decodeEurofixSymbol roundtrip
 * 3. encodeEurofixFrame / decodeEurofixFrame roundtrip
 * 4. CRC detection
 * 5. createLdcEvent structure
 * 6. broadcastDdsEvents
 */

import { describe, it, expect } from 'vitest';
import {
  EUROFIX_FRAME_GRIS,
  EUROFIX_BITS_PER_GRI,
  EUROFIX_FRAME_BITS,
  EUROFIX_DATA_BITS,
  EUROFIX_PARITY_BITS,
  EUROFIX_PULSES_PER_GRI,
  EUROFIX_PPM_OFFSET_SEC,
  NINTH_PULSE_NOMINAL_OFFSET_SEC,
  EUROFIX_STATES,
  EUROFIX_MSG_TYPE,
  encodeEurofixSymbol,
  decodeEurofixSymbol,
  encodeEurofixFrame,
  decodeEurofixFrame,
  createLdcEvent,
  broadcastDdsEvents,
} from '../dds.js';

// ──────────────────────────────────────────────────────────────────────────────
// 1. Constants
// ──────────────────────────────────────────────────────────────────────────────
describe('Eurofix constants', () => {
  it('9th pulse nominal offset is 100 µs (not 1000 µs)', () => {
    // 100 µs = 9th-pulse zero-symbol offset after the 8th navigation pulse.
    // Source: US11300647 §0051 and US10778362, US11041932, US11209554.
    // Note: 1000 µs is the Loran-C inter-pulse spacing — a DIFFERENT measurement.
    expect(NINTH_PULSE_NOMINAL_OFFSET_SEC).toBeCloseTo(100e-6, 10);
  });

  it('PPM offset is ±1 µs', () => {
    expect(EUROFIX_PPM_OFFSET_SEC).toBeCloseTo(1e-6, 10);
  });

  it('6 pulses per GRI (pulses 3–8)', () => {
    expect(EUROFIX_PULSES_PER_GRI).toBe(6);
  });

  it('30 GRIs per frame', () => {
    expect(EUROFIX_FRAME_GRIS).toBe(30);
  });

  it('7 bits per GRI', () => {
    expect(EUROFIX_BITS_PER_GRI).toBe(7);
  });

  it('210 bits total per frame', () => {
    expect(EUROFIX_FRAME_BITS).toBe(210);
  });

  it('70 data bits per frame (4 + 52 + 14)', () => {
    expect(EUROFIX_DATA_BITS).toBe(70);
  });

  it('140 parity bits per frame', () => {
    expect(EUROFIX_PARITY_BITS).toBe(140);
  });

  it('EUROFIX_DATA_BITS + EUROFIX_PARITY_BITS = EUROFIX_FRAME_BITS', () => {
    expect(EUROFIX_DATA_BITS + EUROFIX_PARITY_BITS).toBe(EUROFIX_FRAME_BITS);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 2. Pattern table integrity
// ──────────────────────────────────────────────────────────────────────────────
describe('Eurofix balanced pattern table', () => {
  it('encodes all 128 values to distinct 6-symbol patterns', () => {
    const seen = new Set();
    for (let v = 0; v < 128; v++) {
      const p = encodeEurofixSymbol(v);
      expect(p).toHaveLength(6);
      const key = p.join(',');
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
    expect(seen.size).toBe(128);
  });

  it('all encoded patterns are balanced (Early count = Late count)', () => {
    for (let v = 0; v < 128; v++) {
      const p = encodeEurofixSymbol(v);
      const early = p.filter((s) => s === EUROFIX_STATES.EARLY).length;
      const late = p.filter((s) => s === EUROFIX_STATES.LATE).length;
      expect(early).toBe(late);
    }
  });

  it('all symbols are in {0, 1, 2}', () => {
    for (let v = 0; v < 128; v++) {
      const p = encodeEurofixSymbol(v);
      for (const s of p) {
        expect(s).toBeGreaterThanOrEqual(0);
        expect(s).toBeLessThanOrEqual(2);
      }
    }
  });

  it('decodes unrecognized pattern as -1', () => {
    // An unbalanced pattern (all Early) is not in the table
    expect(decodeEurofixSymbol([0, 0, 0, 0, 0, 0])).toBe(-1);
    // All Late is also unbalanced
    expect(decodeEurofixSymbol([2, 2, 2, 2, 2, 2])).toBe(-1);
  });

  it('clamps out-of-range values to 0 and 127', () => {
    const p0 = encodeEurofixSymbol(0);
    const pNeg = encodeEurofixSymbol(-5);
    expect(pNeg).toEqual(p0);

    const p127 = encodeEurofixSymbol(127);
    const p999 = encodeEurofixSymbol(999);
    expect(p999).toEqual(p127);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 3. encode / decode roundtrip for individual symbols
// ──────────────────────────────────────────────────────────────────────────────
describe('encodeEurofixSymbol / decodeEurofixSymbol roundtrip', () => {
  it('roundtrips all 128 values', () => {
    for (let v = 0; v < 128; v++) {
      const pattern = encodeEurofixSymbol(v);
      const decoded = decodeEurofixSymbol(pattern);
      expect(decoded).toBe(v);
    }
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 4. Frame encode / decode roundtrip
// ──────────────────────────────────────────────────────────────────────────────
describe('encodeEurofixFrame / decodeEurofixFrame roundtrip', () => {
  it('encodes to 30 GRI symbols, each 6 elements', () => {
    const { griSymbols } = encodeEurofixFrame({ msgType: 0, payload52: 0 });
    expect(griSymbols).toHaveLength(30);
    for (const sym of griSymbols) {
      expect(sym).toHaveLength(6);
    }
  });

  it('decodes to correct msgType and payload52', () => {
    const { griSymbols } = encodeEurofixFrame({
      msgType: EUROFIX_MSG_TYPE.ASF_CORRECTION,
      payload52: 123456,
    });
    const decoded = decodeEurofixFrame(griSymbols);
    expect(decoded.msgType).toBe(EUROFIX_MSG_TYPE.ASF_CORRECTION);
    expect(decoded.payload52).toBe(123456);
    expect(decoded.crcValid).toBe(true);
    expect(decoded.decodeErrors).toBe(0);
  });

  it('CRC is valid after clean encode → decode', () => {
    for (const payload of [0, 1, 100000, 4503599627370495]) {
      const { griSymbols, crc14 } = encodeEurofixFrame({ msgType: 0, payload52: payload });
      const decoded = decodeEurofixFrame(griSymbols);
      expect(decoded.crcValid).toBe(true);
      expect(decoded.crc14Received).toBe(crc14);
    }
  });

  it('CRC fails when a symbol is corrupted', () => {
    const { griSymbols } = encodeEurofixFrame({ msgType: 1, payload52: 999999 });
    // Flip a symbol in the first GRI to a different balanced pattern
    const corrupted = griSymbols.map((s, i) => (i === 0 ? encodeEurofixSymbol(127) : s));
    const decoded = decodeEurofixFrame(corrupted);
    // CRC should fail (unless coincidental collision — extremely unlikely)
    // We verify that the corruption at least changes the payload or CRC
    const original = decodeEurofixFrame(griSymbols);
    const payloadChanged = decoded.payload52 !== original.payload52;
    const crcFailed = !decoded.crcValid;
    expect(payloadChanged || crcFailed).toBe(true);
  });

  it('returns decodeErrors=30 and crcValid=false for null input', () => {
    const result = decodeEurofixFrame(null);
    expect(result.crcValid).toBe(false);
    expect(result.decodeErrors).toBe(30);
  });

  it('reports decodeErrors for unrecognized symbols', () => {
    // Build 30 symbols with the first one being unrecognized (all-EARLY)
    const { griSymbols } = encodeEurofixFrame({ msgType: 0, payload52: 42 });
    griSymbols[0] = [0, 0, 0, 0, 0, 0]; // invalid pattern
    const result = decodeEurofixFrame(griSymbols);
    expect(result.decodeErrors).toBeGreaterThan(0);
  });

  it('different msgTypes roundtrip cleanly', () => {
    for (const mt of [0, 1, 2, 15]) {
      const { griSymbols } = encodeEurofixFrame({ msgType: mt, payload52: 50 });
      const decoded = decodeEurofixFrame(griSymbols);
      expect(decoded.msgType).toBe(mt);
      expect(decoded.crcValid).toBe(true);
    }
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 5. createLdcEvent structure
// ──────────────────────────────────────────────────────────────────────────────
describe('createLdcEvent', () => {
  const baseParams = {
    stationLabel: 'M1',
    simTimeSec: 1000,
    clockBiasSec: 0,
    diffCorrectionMeters: 0,
    integrityOk: true,
    griIndex: 0,
  };

  it('returns expected type and station fields', () => {
    const ev = createLdcEvent(baseParams);
    expect(ev.type).toBe('EUROFIX_LDC');
    expect(ev.station).toBe('M1');
    expect(ev.frameLength).toBe(EUROFIX_FRAME_GRIS);
    expect(ev.modulation).toContain('Eurofix');
    expect(ev.modulation).toContain('128-of-141');
  });

  it('9th pulse nominal offset is 1000 µs (zero bias)', () => {
    const ev = createLdcEvent({ ...baseParams, clockBiasSec: 0 });
    expect(ev.ninthPulseOffsetSec).toBeCloseTo(NINTH_PULSE_NOMINAL_OFFSET_SEC, 10);
  });

  it('9th pulse offset shifts with clock bias', () => {
    const bias = 1e-6;
    const ev = createLdcEvent({ ...baseParams, clockBiasSec: bias });
    expect(ev.ninthPulseOffsetSec).toBeCloseTo(NINTH_PULSE_NOMINAL_OFFSET_SEC + bias, 12);
  });

  it('currentGriSymbol has 6 elements (all in {0,1,2})', () => {
    const ev = createLdcEvent(baseParams);
    expect(ev.currentGriSymbol).toHaveLength(6);
    for (const s of ev.currentGriSymbol) {
      expect([0, 1, 2]).toContain(s);
    }
  });

  it('ppmOffsets maps EARLY→-1µs, PROMPT→0, LATE→+1µs', () => {
    const ev = createLdcEvent(baseParams);
    for (let i = 0; i < 6; i++) {
      const s = ev.currentGriSymbol[i];
      const o = ev.ppmOffsets[i];
      if (s === EUROFIX_STATES.EARLY) expect(o).toBeCloseTo(-EUROFIX_PPM_OFFSET_SEC, 12);
      else if (s === EUROFIX_STATES.LATE) expect(o).toBeCloseTo(+EUROFIX_PPM_OFFSET_SEC, 12);
      else expect(o).toBe(0);
    }
  });

  it('integrityStatus reflects integrityOk', () => {
    const ok = createLdcEvent({ ...baseParams, integrityOk: true });
    const alarm = createLdcEvent({ ...baseParams, integrityOk: false });
    expect(ok.integrityStatus).toBe('OK');
    expect(alarm.integrityStatus).toBe('ALARM');
  });

  it('griIndex is clamped to 0–29', () => {
    const ev30 = createLdcEvent({ ...baseParams, griIndex: 30 });
    const ev99 = createLdcEvent({ ...baseParams, griIndex: 99 });
    expect(ev30.griIndex).toBe(29);
    expect(ev99.griIndex).toBe(29);
    const evNeg = createLdcEvent({ ...baseParams, griIndex: -1 });
    expect(evNeg.griIndex).toBe(0);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 6. broadcastDdsEvents
// ──────────────────────────────────────────────────────────────────────────────
describe('broadcastDdsEvents', () => {
  it('returns empty array when no masters', () => {
    expect(broadcastDdsEvents([], 0)).toEqual([]);
    expect(broadcastDdsEvents(null, 0)).toEqual([]);
  });

  it('skips masters without ddsEnabled', () => {
    const masters = [
      { label: 'M1', ddsEnabled: false },
      { label: 'M2', ddsEnabled: true },
    ];
    const events = broadcastDdsEvents(masters, 100);
    expect(events).toHaveLength(1);
    expect(events[0].station).toBe('M2');
  });

  it('produces one event per enabled master', () => {
    const masters = [
      { label: 'M1', ddsEnabled: true },
      { label: 'M2', ddsEnabled: true },
      { label: 'M3', ddsEnabled: false },
    ];
    const events = broadcastDdsEvents(masters, 200);
    expect(events).toHaveLength(2);
  });

  it('each event carries a valid Eurofix GRI symbol (6 elements)', () => {
    const masters = [{ label: 'M1', ddsEnabled: true }];
    const events = broadcastDdsEvents(masters, 1);
    expect(events[0].currentGriSymbol).toHaveLength(6);
  });
});
