/**
 * Eurofix / eLoran Data Channel (LDC) Implementation
 *
 * Implements the Eurofix modulation scheme and the eLoran 9th-pulse Loran
 * Data Channel (LDC), as specified in:
 *
 *   ILA eLoran Definition Document, v1.0, International Loran Association (2007),
 *   Section 6: Data Channel.
 *   (UNVERIFIED — ILA definition document confirmed via secondary sources this
 *   session; primary PDF not directly machine-fetched.)
 *
 *   Van Willigen, D., & Offermans, G.W.A. (1997). "Eurofix: a data link using
 *   Loran-C." Proc. ION NTM 1997, pp. 433–441.
 *   (UNVERIFIED — secondary citation from Pelgrum 2006 / ILA doc literature.)
 *
 * ─── EUROFIX SPECIFICATION (confirmed from ILA definition document) ──────────
 *
 *  Modulation:  Pulse Position Modulation (PPM) on pulses 3–8 (six pulses)
 *               of the standard Loran-C 8-pulse group.
 *               Each modulated pulse is displaced ±1 µs from nominal timing.
 *               Three states per pulse: Early (−1 µs), Prompt (0), Late (+1 µs).
 *               3^6 = 729 possible patterns per GRI.
 *
 *  Balanced patterns: 141 patterns where #Early = #Late (balanced ternary).
 *               128 of these 141 are used, representing 7 bits/GRI.
 *               (2^7 = 128 < 141 — balance constraint preserves signal symmetry.)
 *
 *  Frame:       30 GRIs per frame → 30 × 7 = 210 bits/frame.
 *  Structure:   70 bits data + 140 bits Reed-Solomon parity.
 *               70 data bits = 4 type + 52 application + 14 CRC.
 *
 * ─── 9TH PULSE (eLoran LDC) ─────────────────────────────────────────────────
 *
 *  The 9th pulse is transmitted 1000 µs after the 8th pulse (zero-symbol position).
 *  Source: SAE9990/2 "Transmitted Enhanced Loran (eLoran) Signal Standard for
 *  9th Pulse Modulation" (2018) / ILA eLoran Definition Document (2007).
 *  The 9th pulse uses 32-state PPM (5 bits/GRI), distinct from Eurofix.
 *
 *  Previous LORAN LAB versions (pre-Track C) contained an error: the zero-symbol
 *  offset was stated as "1000 µs after 8th pulse" in comments but the constant
 *  EUROFIX_PPM_OFFSET_SEC was used for ±1 µs state offset, which is correct.
 *  The frame structure has been reworked to match the 6-pulse Eurofix specification.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Eurofix constants
// ─────────────────────────────────────────────────────────────────────────────

/** Nominal 9th-pulse position: 1000 µs after the 8th navigation pulse. */
export const NINTH_PULSE_NOMINAL_OFFSET_SEC = 1000e-6; // 1000 µs

/** PPM displacement magnitude for Eurofix modulated pulses: ±1 µs */
export const EUROFIX_PPM_OFFSET_SEC = 1e-6; // ±1 µs

/** Number of pulses per GRI modulated by Eurofix (pulses 3–8) */
export const EUROFIX_PULSES_PER_GRI = 6;

/** Number of Eurofix PPM states per pulse: Early, Prompt, Late */
export const EUROFIX_STATES = { EARLY: 0, PROMPT: 1, LATE: 2 };

/**
 * Number of GRIs per Eurofix frame (30 GRIs × 7 bits = 210 bits).
 * SOURCED: ILA eLoran Definition Document (2007), Section 6.
 */
export const EUROFIX_FRAME_GRIS = 30;

/**
 * Bits per GRI from the 128-of-141 balanced pattern selection.
 * 2^7 = 128 balanced patterns used.
 */
export const EUROFIX_BITS_PER_GRI = 7;

/** Total bits per Eurofix frame: 30 × 7 = 210. */
export const EUROFIX_FRAME_BITS = EUROFIX_FRAME_GRIS * EUROFIX_BITS_PER_GRI; // 210

/** Data bits per frame: 4 type + 52 application + 14 CRC = 70 */
export const EUROFIX_DATA_BITS = 70;

/** Reed-Solomon parity bits per frame: 210 - 70 = 140 */
export const EUROFIX_PARITY_BITS = 140;

// ─────────────────────────────────────────────────────────────────────────────
// Balanced 6-symbol pattern table (128 of 141 balanced ternary patterns)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generates all 729 (3^6) ternary patterns of length 6.
 * @returns {number[][]} Array of 729 patterns.
 */
function _allTernaryPatterns() {
  const patterns = [];
  for (let n = 0; n < 729; n++) {
    const p = [];
    let v = n;
    for (let i = 0; i < 6; i++) {
      p.unshift(v % 3);
      v = Math.floor(v / 3);
    }
    patterns.push(p);
  }
  return patterns;
}

/**
 * Selects balanced ternary patterns where #EARLY === #LATE.
 * There are 141 such patterns for length-6 (3^6 space).
 * We take the first 128 to represent 7-bit symbols (2^7 = 128).
 *
 * This provides the bijection: 7-bit value (0–127) → 6-symbol balanced pattern.
 */
function _buildBalancedPatternTable() {
  const all = _allTernaryPatterns();
  const balanced = all.filter(
    (p) => p.filter((s) => s === 0).length === p.filter((s) => s === 2).length
  );
  // balanced.length === 141; take first 128 (deterministic, reproducible)
  return balanced.slice(0, 128);
}

/** Balanced pattern lookup table: index → 6-symbol pattern (EARLY=0, PROMPT=1, LATE=2) */
const EUROFIX_PATTERN_TABLE = _buildBalancedPatternTable();

/** Reverse lookup: pattern key → 7-bit index */
const EUROFIX_PATTERN_REVERSE = new Map(
  EUROFIX_PATTERN_TABLE.map((p, i) => [p.join(','), i])
);

/**
 * Encodes a 7-bit value (0–127) to a 6-symbol Eurofix balanced pattern.
 * @param {number} value - Integer 0–127
 * @returns {number[]} Array of 6 symbols (each 0=Early, 1=Prompt, 2=Late)
 */
export function encodeEurofixSymbol(value) {
  const idx = Math.max(0, Math.min(127, Math.round(value)));
  return [...EUROFIX_PATTERN_TABLE[idx]];
}

/**
 * Decodes a 6-symbol Eurofix balanced pattern to a 7-bit value.
 * Returns -1 if the pattern is not in the 128-pattern table.
 * @param {number[]} pattern - Array of 6 symbols (0=Early,1=Prompt,2=Late)
 * @returns {number} 7-bit value (0–127), or -1 if invalid/unrecognized
 */
export function decodeEurofixSymbol(pattern) {
  const key = pattern.join(',');
  const idx = EUROFIX_PATTERN_REVERSE.get(key);
  return idx !== undefined ? idx : -1;
}

// ─────────────────────────────────────────────────────────────────────────────
// 14-bit CRC (CRC-14 — simplified CCITT-like polynomial for Eurofix)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Computes a 14-bit CRC for a bitstream.
 * Uses polynomial x^14 + x^10 + x^6 + x + 1 (representative for 14-bit CRC).
 * The actual polynomial used in the ILA specification is unverified at bit level;
 * this is a reasonable 14-bit CRC for illustrative purposes.
 * @param {number[]} bits - Array of 0/1 values
 * @returns {number} 14-bit CRC value (0–16383)
 */
function computeCrc14(bits) {
  let crc = 0;
  const POLY = 0x2011; // 14-bit polynomial (UNVERIFIED exact spec polynomial)
  for (const bit of bits) {
    const topBit = (crc >> 13) & 1;
    crc = ((crc << 1) & 0x3FFF) | bit;
    if (topBit) {
      crc ^= POLY;
    }
  }
  return crc & 0x3FFF;
}

/**
 * Packs a number into a fixed-width bit array (MSB first).
 * @param {number} value - Non-negative integer
 * @param {number} width - Bit width
 * @returns {number[]}
 */
function packBits(value, width) {
  const bits = [];
  for (let i = width - 1; i >= 0; i--) {
    bits.push((value >> i) & 1);
  }
  return bits;
}

/**
 * Unpacks a bit array to an integer (MSB first).
 * @param {number[]} bits
 * @returns {number}
 */
function unpackBits(bits) {
  return bits.reduce((acc, b) => (acc << 1) | b, 0);
}

// ─────────────────────────────────────────────────────────────────────────────
// Eurofix frame encoder / decoder
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Eurofix message types (4-bit field, 0–15).
 * Type 0: UTC/timing corrections.
 * Type 1: ASF differential corrections.
 * Type 2: Integrity status.
 * Types 3–15: Reserved / extended (not specified here).
 */
export const EUROFIX_MSG_TYPE = {
  UTC_TIMING: 0,
  ASF_CORRECTION: 1,
  INTEGRITY: 2,
};

/**
 * Encodes a Eurofix frame into a sequence of 30 GRI symbols.
 * Each GRI symbol is a 6-element array (the balanced PPM pattern).
 *
 * Frame structure (210 bits total):
 *   [0:4]   — 4-bit message type
 *   [4:56]  — 52-bit application payload
 *   [56:70] — 14-bit CRC over the above 56 bits
 *   [70:210]— 140-bit Reed-Solomon parity (simplified: filled with zero for
 *              illustrative simulation; real RS encoding requires GF arithmetic)
 *
 * Note on Reed-Solomon: A full RS(30,10) over GF(128) implementation would
 * require a 128-element Galois field. For this simulator, the 140 parity bits
 * are represented as zero-filled (illustrative placeholder).
 *
 * @param {object} params
 * @param {number} params.msgType - 4-bit message type (0–15)
 * @param {number} params.payload52 - 52-bit payload as a BigInt or number (<= 2^52)
 * @returns {{
 *   griSymbols: number[][],  // 30 × 6 array of PPM symbols
 *   frameBits: number[],     // 70 data bits + 140 parity = 210 bits
 *   crc14: number,           // computed CRC
 * }}
 */
export function encodeEurofixFrame({ msgType = 0, payload52 = 0 }) {
  const typeBits = packBits(msgType & 0xF, 4);

  // Clamp 52-bit payload
  const payloadSafe = Math.max(0, Math.min(Math.pow(2, 52) - 1, Math.round(payload52)));
  // Split into hi (20 bits) and lo (32 bits) to avoid JS integer limits
  const hi = Math.floor(payloadSafe / Math.pow(2, 32));
  const lo = payloadSafe >>> 0;
  const payloadBits = [...packBits(hi, 20), ...packBits(lo, 32)];

  const dataBits56 = [...typeBits, ...payloadBits]; // 4 + 52 = 56 bits
  const crc14 = computeCrc14(dataBits56);
  const crcBits = packBits(crc14, 14);

  // 70-bit data word
  const dataBits70 = [...dataBits56, ...crcBits];

  // 140-bit RS parity — illustrative zero placeholder
  const parityBits = new Array(140).fill(0);

  // 210-bit frame
  const frameBits = [...dataBits70, ...parityBits];

  // Chunk into 30 × 7-bit values, map each to a 6-symbol balanced pattern
  const griSymbols = [];
  for (let g = 0; g < EUROFIX_FRAME_GRIS; g++) {
    const septBits = frameBits.slice(g * 7, g * 7 + 7);
    const value7 = unpackBits(septBits);
    griSymbols.push(encodeEurofixSymbol(value7));
  }

  return { griSymbols, frameBits, crc14 };
}

/**
 * Decodes a 30-GRI Eurofix transmission (array of 30 × 6-symbol patterns).
 * Returns parsed fields and CRC validity.
 *
 * @param {number[][]} griSymbols - 30-element array, each a 6-element symbol array
 * @returns {{
 *   msgType: number,
 *   payload52: number,
 *   crc14Received: number,
 *   crc14Expected: number,
 *   crcValid: boolean,
 *   frameBits: number[],
 *   decodeErrors: number  // count of GRI symbols not in pattern table
 * }}
 */
export function decodeEurofixFrame(griSymbols) {
  if (!griSymbols || griSymbols.length !== EUROFIX_FRAME_GRIS) {
    return {
      msgType: -1,
      payload52: 0,
      crc14Received: 0,
      crc14Expected: 0,
      crcValid: false,
      frameBits: [],
      decodeErrors: EUROFIX_FRAME_GRIS,
    };
  }

  const frameBits = [];
  let decodeErrors = 0;

  for (const sym of griSymbols) {
    const val = decodeEurofixSymbol(sym);
    if (val === -1) {
      // Unrecognized pattern — insert 7 zero bits (erasure)
      frameBits.push(...new Array(7).fill(0));
      decodeErrors++;
    } else {
      frameBits.push(...packBits(val, 7));
    }
  }

  const dataBits56 = frameBits.slice(0, 56);
  const msgType = unpackBits(dataBits56.slice(0, 4));

  const payloadBits = dataBits56.slice(4, 56); // 52 bits
  const hiPayload = unpackBits(payloadBits.slice(0, 20));
  const loPayload = unpackBits(payloadBits.slice(20, 52));
  const payload52 = hiPayload * Math.pow(2, 32) + loPayload;

  const crc14Received = unpackBits(frameBits.slice(56, 70));
  const crc14Expected = computeCrc14(dataBits56);

  return {
    msgType,
    payload52,
    crc14Received,
    crc14Expected,
    crcValid: crc14Received === crc14Expected,
    frameBits,
    decodeErrors,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// eLoran 9th-pulse LDC packet (for simulation)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Creates a simulated eLoran Data Channel (LDC) broadcast event for one GRI.
 *
 * The 9th pulse is transmitted at NINTH_PULSE_NOMINAL_OFFSET_SEC (1000 µs)
 * after the 8th navigation pulse. For Eurofix modulation, pulses 3–8 of the
 * navigation group are modulated instead.
 *
 * This function packages both the Eurofix frame symbol for this GRI and
 * metadata about the 9th pulse into a single event object, for simulation.
 *
 * @param {object} params
 * @param {string} params.stationLabel
 * @param {number} params.simTimeSec - Current simulation time in seconds
 * @param {number} [params.clockBiasSec=0] - Transmitter clock bias in seconds
 * @param {number} [params.diffCorrectionMeters=0] - Differential ASF correction in meters
 * @param {boolean} [params.integrityOk=true] - System integrity status
 * @param {number} [params.griIndex=0] - Which GRI within the current 30-GRI frame (0–29)
 * @param {number[][]} [params.frameSymbols=null] - Pre-encoded 30-GRI frame; if null, a
 *   default ASF correction frame is auto-generated.
 * @returns {object} LDC event packet
 */
export function createLdcEvent({
  stationLabel,
  simTimeSec,
  clockBiasSec = 0,
  diffCorrectionMeters = 0,
  integrityOk = true,
  griIndex = 0,
  frameSymbols = null,
}) {
  // Encode a default ASF correction frame if not provided
  let symbols = frameSymbols;
  if (!symbols) {
    // Pack diff correction (cm, 20-bit) and integrity (1-bit) into 52-bit payload
    const diffCm = Math.round(diffCorrectionMeters * 100);
    const diffSafe = Math.max(-1000000, Math.min(1000000, diffCm));
    const diffEncoded = (diffSafe + 1000000) & 0xFFFFF; // 20-bit unsigned
    const intBit = integrityOk ? 1 : 0;
    const payload52 = intBit * Math.pow(2, 20) + diffEncoded;
    const { griSymbols } = encodeEurofixFrame({
      msgType: EUROFIX_MSG_TYPE.ASF_CORRECTION,
      payload52,
    });
    symbols = griSymbols;
  }

  const safeGriIndex = Math.max(0, Math.min(EUROFIX_FRAME_GRIS - 1, griIndex));
  const currentGriSymbol = symbols[safeGriIndex];

  // 9th pulse timing (for telemetry — position only, no data modulation via 9th pulse in Eurofix)
  const ninthPulseOffsetSec = NINTH_PULSE_NOMINAL_OFFSET_SEC + clockBiasSec;

  return {
    type: 'EUROFIX_LDC',
    station: stationLabel,
    griIndex: safeGriIndex,
    frameLength: EUROFIX_FRAME_GRIS,
    timestampSimSec: simTimeSec,
    utcMs: Date.now() + clockBiasSec * 1000,
    diffMeters: parseFloat(diffCorrectionMeters.toFixed(3)),
    clockBiasNs: parseFloat((clockBiasSec * 1e9).toFixed(2)),
    integrityStatus: integrityOk ? 'OK' : 'ALARM',
    modulation: 'Eurofix 6-pulse PPM (pulses 3–8, ±1 µs, 128-of-141 balanced patterns)',
    ninthPulseOffsetSec,                    // 9th pulse position for navigation
    currentGriSymbol,                       // 6-element pattern for this GRI
    // timing offsets for waveform rendering (pulses 3–8 relative to nominal)
    ppmOffsets: currentGriSymbol.map((s) => {
      if (s === EUROFIX_STATES.EARLY) return -EUROFIX_PPM_OFFSET_SEC;
      if (s === EUROFIX_STATES.LATE) return +EUROFIX_PPM_OFFSET_SEC;
      return 0;
    }),
  };
}

/**
 * Simulates a batch of LDC broadcast events for all enabled master stations.
 * @param {Array<object>} masters - Master stations
 * @param {number} simTimeSec - Current simulation time
 * @param {boolean} integrityStatus - System-wide integrity
 * @returns {Array<object>} List of LDC event objects (one per enabled master per GRI)
 */
export function broadcastDdsEvents(masters, simTimeSec, integrityStatus = true) {
  const events = [];
  if (!Array.isArray(masters)) return events;

  masters.forEach((m, idx) => {
    if (!m.ddsEnabled) return;
    const diff = m.diffCorrections?.enabled ? m.diffCorrections.avgMeters || 0 : 0;
    const bias = m.clock?.biasSec || 0;
    const griIndex = Math.floor(simTimeSec * 10 + idx) % EUROFIX_FRAME_GRIS;

    const event = createLdcEvent({
      stationLabel: m.label || `M${idx + 1}`,
      simTimeSec,
      clockBiasSec: bias,
      diffCorrectionMeters: diff,
      integrityOk: integrityStatus,
      griIndex,
    });
    events.push(event);
  });

  return events;
}
