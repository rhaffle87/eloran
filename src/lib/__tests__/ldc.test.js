import { describe, it, expect } from 'vitest';
import {
  computeCrc16,
  encodeLdcMessage,
  decodeLdcMessage,
  computePulseModulationOffsetUs,
  LDC_MODULATION_TYPES,
  PPM_STEP_US,
  EUROFIX_SHIFT_US,
} from '../ldc.js';

describe('Loran Data Channel (LDC) & Eurofix Modulation', () => {
  it('computes deterministic CRC-16-CCITT checksums', () => {
    const bytes1 = [0x01, 0x02, 0x03, 0x04];
    const crc1 = computeCrc16(bytes1);
    expect(crc1).toBeGreaterThan(0);
    expect(crc1).toBeLessThanOrEqual(0xffff);

    const crc2 = computeCrc16(bytes1);
    expect(crc1).toBe(crc2); // Deterministic
  });

  it('encodes and decodes an LDC message frame with 100% CRC parity preservation', () => {
    const input = {
      type: 1, // Differential ASF corrections
      stationId: 42,
      asfDeltaCm: 350, // +3.50 meters
      epochSec: 120,
    };

    const encoded = encodeLdcMessage(input);
    expect(encoded.symbols.length).toBeGreaterThanOrEqual(11);
    expect(encoded.crc).toBeDefined();

    const decoded = decodeLdcMessage(encoded.symbols);
    expect(decoded.validParity).toBe(true);
    expect(decoded.type).toBe(1);
    expect(decoded.stationId).toBe(42);
    expect(decoded.asfDeltaCm).toBe(350);
    expect(decoded.asfDeltaMeters).toBeCloseTo(3.5, 2);
    expect(decoded.epochSec).toBe(120);
  });

  it('handles negative ASF deltas with 16-bit two-complement sign extension', () => {
    const input = {
      type: 1,
      stationId: 10,
      asfDeltaCm: -420, // -4.20 meters
      epochSec: 85,
    };

    const encoded = encodeLdcMessage(input);
    const decoded = decodeLdcMessage(encoded.symbols);
    expect(decoded.validParity).toBe(true);
    expect(decoded.asfDeltaCm).toBe(-420);
    expect(decoded.asfDeltaMeters).toBeCloseTo(-4.2, 2);
  });

  it('detects corrupted symbols with CRC parity failure', () => {
    const encoded = encodeLdcMessage({ type: 1, stationId: 1, asfDeltaCm: 100 });
    const corruptedSymbols = [...encoded.symbols];
    // Corrupt one symbol
    corruptedSymbols[2] = (corruptedSymbols[2] + 7) % 32;

    const decoded = decodeLdcMessage(corruptedSymbols);
    expect(decoded.validParity).toBe(false);
  });

  it('calculates 32-PPM offsets for the 9th pulse', () => {
    // Navigation pulses (0-7) should have 0 offset in 32-PPM
    for (let p = 0; p < 8; p++) {
      expect(computePulseModulationOffsetUs(p, 10, LDC_MODULATION_TYPES.PPM_32)).toBe(0.0);
    }

    // 9th pulse (index 8):
    // Center symbol index 15 = 0 us offset
    expect(computePulseModulationOffsetUs(8, 15, LDC_MODULATION_TYPES.PPM_32)).toBe(0.0);
    // Index 16 = +1.25 us
    expect(computePulseModulationOffsetUs(8, 16, LDC_MODULATION_TYPES.PPM_32)).toBeCloseTo(PPM_STEP_US, 3);
    // Index 14 = -1.25 us
    expect(computePulseModulationOffsetUs(8, 14, LDC_MODULATION_TYPES.PPM_32)).toBeCloseTo(-PPM_STEP_US, 3);
    // Index 31 = (31 - 15) * 1.25 = +20.0 us
    expect(computePulseModulationOffsetUs(8, 31, LDC_MODULATION_TYPES.PPM_32)).toBeCloseTo(20.0, 2);
  });

  it('calculates Eurofix 3-state phase shifts on secondary pulses 3 to 8', () => {
    // First two pulses (0 and 1) are never modulated (preserves standard Loran tracking)
    expect(computePulseModulationOffsetUs(0, 1, LDC_MODULATION_TYPES.EUROFIX)).toBe(0.0);
    expect(computePulseModulationOffsetUs(1, -1, LDC_MODULATION_TYPES.EUROFIX)).toBe(0.0);

    // Pulses 2 to 7 (pulses 3 to 8 in 1-based indexing) are modulated with +-1.0 us
    expect(computePulseModulationOffsetUs(2, 1, LDC_MODULATION_TYPES.EUROFIX)).toBe(EUROFIX_SHIFT_US);
    expect(computePulseModulationOffsetUs(4, -1, LDC_MODULATION_TYPES.EUROFIX)).toBe(-EUROFIX_SHIFT_US);
    expect(computePulseModulationOffsetUs(7, 0, LDC_MODULATION_TYPES.EUROFIX)).toBe(0.0);
  });
});
