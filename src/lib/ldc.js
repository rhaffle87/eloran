/**
 * Loran Data Channel (LDC) and Eurofix Modulation Library for SIMULORAN
 * Sourced from:
 * - RTCM 10410.1 Minimum Performance Standards for Differential Loran-C / eLoran Receiver Equipment
 * - Offermans, Helwig & van Willigen (2003), "Eurofix: A New Low Frequency Data Link and Navigation System"
 * - Peterson (2006), "The eLoran Loran Data Channel (LDC)"
 *
 * Implements:
 * 1. 32-PPM (Pulse Position Modulation) for eLoran 9th pulse (±1.25 µs steps)
 * 2. Eurofix 3-state Pulse Position Modulation (±1.0 µs shifts on pulses 3 to 8)
 * 3. Message frame encoding and decoding with CRC-16 parity check
 */

export const LDC_MODULATION_TYPES = {
  PPM_32: 'ppm_32',       // eLoran 9th-pulse 32-state PPM
  EUROFIX: 'eurofix',     // Eurofix 3-state PPM on pulses 3-8
  NONE: 'none',
};

export const PULSE_SPACING_US = 1000.0;    // Standard Loran pulse spacing: 1000 µs
export const NINTH_PULSE_SPACING_US = 2000.0; // 9th pulse spacing after 8th pulse: 2000 µs
export const PPM_STEP_US = 1.25;          // 32-PPM step: 1.25 µs per symbol index (-18.75 to +20.0 µs)
export const EUROFIX_SHIFT_US = 1.0;      // Eurofix shift: ±1.0 µs

/**
 * Standard CRC-16-CCITT polynomial (0x1021) for LDC and Eurofix message parity.
 * @param {Uint8Array|Array<number>} dataBytes
 * @returns {number} 16-bit CRC checksum
 */
export function computeCrc16(dataBytes) {
  let crc = 0xffff;
  for (let i = 0; i < dataBytes.length; i++) {
    crc ^= dataBytes[i] << 8;
    for (let b = 0; b < 8; b++) {
      if ((crc & 0x8000) !== 0) {
        crc = ((crc << 1) ^ 0x1021) & 0xffff;
      } else {
        crc = (crc << 1) & 0xffff;
      }
    }
  }
  return crc;
}

/**
 * Encodes an operational eLoran LDC message packet into 5-bit symbols.
 * Format:
 * - Message Type (4 bits): 1 = Differential ASF Corrections, 2 = UTC Time / Leap Second, 3 = Station Health
 * - Station ID (8 bits): Identifier of transmitting station or reference monitor
 * - Payload Data (16 bits): e.g. signed differential ASF delta in centimeters (-32768 to +32767)
 * - Timestamp / Epoch (8 bits): Message sequence or epoch seconds
 * - CRC-16 (16 bits): Parity check
 * Total: 52 bits -> packed into eleven 5-bit symbols (55 bits with 3 bits padding)
 *
 * @param {Object} messageData
 * @param {number} [messageData.type=1]
 * @param {number} [messageData.stationId=6731]
 * @param {number} [messageData.asfDeltaCm=0]
 * @param {number} [messageData.epochSec=0]
 * @returns {Object} Encoded LDC frame descriptor
 */
export function encodeLdcMessage(messageData = {}) {
  const type = (messageData.type || 1) & 0x0f;
  const stationId = (messageData.stationId || 1) & 0xff;
  const asfDeltaCm = Math.max(-32768, Math.min(32767, Math.round(messageData.asfDeltaCm || 0))) & 0xffff;
  const epochSec = (messageData.epochSec || 0) & 0xff;

  const rawBytes = [
    (type << 4) | ((stationId >> 4) & 0x0f),
    ((stationId & 0x0f) << 4) | ((asfDeltaCm >> 12) & 0x0f),
    (asfDeltaCm >> 4) & 0xff,
    ((asfDeltaCm & 0x0f) << 4) | ((epochSec >> 4) & 0x0f),
    (epochSec & 0x0f) << 4,
  ];

  const crc = computeCrc16(rawBytes);
  rawBytes.push((crc >> 8) & 0xff);
  rawBytes.push(crc & 0xff);

  // Convert bytes into 5-bit 32-PPM symbols
  const symbols = [];
  let bitBuffer = 0;
  let bitCount = 0;

  for (const byte of rawBytes) {
    bitBuffer = (bitBuffer << 8) | byte;
    bitCount += 8;
    while (bitCount >= 5) {
      const sym = (bitBuffer >> (bitCount - 5)) & 0x1f;
      symbols.push(sym);
      bitCount -= 5;
    }
  }

  if (bitCount > 0) {
    const sym = (bitBuffer << (5 - bitCount)) & 0x1f;
    symbols.push(sym);
  }

  return {
    type,
    stationId,
    asfDeltaCm,
    epochSec,
    crc,
    rawBytes,
    symbols,
    hex: rawBytes.map((b) => b.toString(16).padStart(2, '0').toUpperCase()).join(' '),
  };
}

/**
 * Decodes 5-bit LDC symbols back into message packet and validates CRC-16 parity.
 * @param {Array<number>} symbols
 * @returns {Object} Decoded message packet with validParity flag
 */
export function decodeLdcMessage(symbols) {
  if (!Array.isArray(symbols) || symbols.length === 0) {
    return { validParity: false, error: 'Empty symbols array' };
  }

  let bitBuffer = 0;
  let bitCount = 0;
  const bytes = [];

  for (const sym of symbols) {
    bitBuffer = (bitBuffer << 5) | (sym & 0x1f);
    bitCount += 5;
    while (bitCount >= 8) {
      bytes.push((bitBuffer >> (bitCount - 8)) & 0xff);
      bitCount -= 8;
    }
  }

  if (bytes.length < 7) {
    return { validParity: false, error: 'Incomplete packet' };
  }

  const payloadBytes = bytes.slice(0, 5);
  const receivedCrc = (bytes[5] << 8) | bytes[6];
  const computedCrc = computeCrc16(payloadBytes);
  const validParity = receivedCrc === computedCrc;

  const type = (payloadBytes[0] >> 4) & 0x0f;
  const stationId = ((payloadBytes[0] & 0x0f) << 4) | ((payloadBytes[1] >> 4) & 0x0f);

  let rawDelta = ((payloadBytes[1] & 0x0f) << 12) | (payloadBytes[2] << 4) | ((payloadBytes[3] >> 4) & 0x0f);
  // Sign extend 16-bit
  if (rawDelta & 0x8000) rawDelta -= 0x10000;

  const epochSec = ((payloadBytes[3] & 0x0f) << 4) | ((payloadBytes[4] >> 4) & 0x0f);

  return {
    validParity,
    type,
    stationId,
    asfDeltaCm: rawDelta,
    asfDeltaMeters: rawDelta / 100.0,
    epochSec,
    receivedCrc,
    computedCrc,
  };
}

/**
 * Computes microsecond modulation offset for a specific pulse within a GRI pulse group.
 * @param {number} pulseIndex - 0 to 7 (navigation pulses), or 8 (9th pulse)
 * @param {number} symbol - Modulation symbol (0-31 for 32-PPM, or -1/0/+1 for Eurofix)
 * @param {string} modulationType - LDC_MODULATION_TYPES.PPM_32 or LDC_MODULATION_TYPES.EUROFIX
 * @returns {number} Offset in microseconds to be added to nominal pulse start time
 */
export function computePulseModulationOffsetUs(pulseIndex, symbol = 0, modulationType = LDC_MODULATION_TYPES.PPM_32) {
  if (modulationType === LDC_MODULATION_TYPES.PPM_32) {
    // 32-PPM applies exclusively to the 9th pulse (index 8)
    if (pulseIndex === 8) {
      const symClamped = Math.max(0, Math.min(31, Math.round(symbol)));
      // Center modulation at index 15: offset = (sym - 15) * 1.25 µs (-18.75 to +20.0 µs)
      return (symClamped - 15) * PPM_STEP_US;
    }
    return 0.0;
  }

  if (modulationType === LDC_MODULATION_TYPES.EUROFIX) {
    // Eurofix modulates pulses 3 through 8 (indices 2 through 7) with 3-state phase shift
    if (pulseIndex >= 2 && pulseIndex <= 7) {
      if (symbol > 0) return EUROFIX_SHIFT_US;
      if (symbol < 0) return -EUROFIX_SHIFT_US;
      return 0.0;
    }
    return 0.0;
  }

  return 0.0;
}
