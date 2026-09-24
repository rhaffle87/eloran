/**
 * Direct Digital Synthesis (DDS) & eLoran Data Channel (LDC) Simulation
 *
 * Implements the Eurofix / 9th-pulse data channel as defined in:
 *   - Van Willigen, D., & Offermans, G.W.A. (1997). "Eurofix: a data link using
 *     Loran-C." Proc. ION NTM 1997, pp. 433–441.
 *   - Johnson, G.W. et al. (2007). "Enhanced Loran (eLoran) in the United States —
 *     Primary means of precision timing backup." Proc. 39th PTTI, pp. 161–173.
 *   - ILA eLoran Definition Document, Rev 0.2 (2007), Section 6: Data Channel.
 *
 * Eurofix 9th-pulse modulation:
 *   Each GRI the master station transmits 9 pulses (8 navigation + 1 data).
 *   The 9th pulse is pulse-position modulated (PPM) with 3 states:
 *     Early  (−Δτ): symbol '0'
 *     On-time (0):  symbol '1' (carrier)
 *     Late   (+Δτ): symbol '2'
 *   Δτ = 1 µs relative to the nominal 9th-pulse position (1000 µs after 8th pulse).
 *   A message word = 30 PPM symbols encoded over 30 GRI intervals.
 *   The standard message frame includes: UTC correction, ASF corrections, integrity status.
 */

/** Eurofix 9th-pulse position modulation offset in seconds. */
export const EUROFIX_PPM_OFFSET_SEC = 1e-6; // ±1 µs

/** Eurofix message frame size in symbols (GRI intervals). */
export const EUROFIX_FRAME_SYMBOLS = 30;

/** Eurofix PPM states */
export const EUROFIX_SYMBOLS = { EARLY: 0, ON_TIME: 1, LATE: 2 };

/**
 * Encodes a numeric value into a sequence of Eurofix 3-state PPM symbols.
 * Uses a simple balanced ternary representation.
 * @param {number} value - Integer value to encode (0 to 3^N - 1)
 * @param {number} numSymbols - Number of ternary digits
 * @returns {number[]} Array of symbols (each 0, 1, or 2)
 */
export function encodeTernary(value, numSymbols) {
  const syms = [];
  let v = Math.max(0, Math.round(value));
  for (let i = 0; i < numSymbols; i++) {
    syms.unshift(v % 3);
    v = Math.floor(v / 3);
  }
  return syms;
}

/**
 * Encodes an eLoran 9th-pulse Loran Data Channel (LDC) message.
 * Message structure (30 symbols):
 *   Symbols 0–5:  Header (sync + station ID)
 *   Symbols 6–11: UTC second correction (±30 ns resolution, 6 ternary digits → 729 levels)
 *   Symbols 12–17: Differential ASF correction in cm (6 digits → 729 levels, ≈ ±36.4 m range)
 *   Symbols 18–23: Secondary integrity / GNSS backup status (6 bits encoded as ternary)
 *   Symbols 24–27: Sequence number (4 digits → 81 levels)
 *   Symbols 28–29: CRC check symbols (simplified: sum mod 3)
 *
 * @param {object} params
 * @param {string} params.stationLabel
 * @param {number} params.simTimeSec
 * @param {number} [params.clockBiasSec=0]
 * @param {number} [params.diffCorrectionMeters=0]
 * @param {boolean} [params.integrityOk=true]
 * @param {number} [params.seqNumber=1]
 * @returns {object} Encoded DDS packet with raw PPM symbol array and metadata
 */
export function createDdsPacket({
  stationLabel,
  simTimeSec,
  clockBiasSec = 0,
  diffCorrectionMeters = 0,
  integrityOk = true,
  seqNumber = 1,
}) {
  const utcNowMs = Date.now() + clockBiasSec * 1000;

  // Encode UTC correction: bias in nanoseconds, scaled to 30 ns steps, offset by 364 to center
  const biasNs = clockBiasSec * 1e9;
  const utcSymbolValue = Math.max(0, Math.min(728, Math.round(biasNs / 30) + 364));
  const utcSymbols = encodeTernary(utcSymbolValue, 6);

  // Encode ASF correction: diffCorrectionMeters in centimeters, offset by 364 to center ±36.4 m
  const diffCm = diffCorrectionMeters * 100;
  const asfSymbolValue = Math.max(0, Math.min(728, Math.round(diffCm) + 364));
  const asfSymbols = encodeTernary(asfSymbolValue, 6);

  // Encode integrity + station ID: 6 symbols
  // Station ID hash (last 4 bits of char sum), integrity bit in MSB
  const charSum = stationLabel.split('').reduce((s, c) => s + c.charCodeAt(0), 0);
  const integrityCode = integrityOk ? 0 : 1;
  const statusValue = (integrityCode * 243) + (charSum % 243); // 3^5 = 243
  const statusSymbols = encodeTernary(statusValue, 6);

  // Sequence number: 4 symbols (0–80)
  const seqSymbols = encodeTernary(seqNumber % 81, 4);

  // Header: 6 fixed sync symbols [1,0,1,0,1,0]
  const headerSymbols = [1, 0, 1, 0, 1, 0];

  // Concatenate payload (28 symbols)
  const payload = [...headerSymbols, ...utcSymbols, ...asfSymbols, ...statusSymbols, ...seqSymbols];

  // CRC: 2 symbols — sum of all payload symbols mod 3, and sum of indices*symbols mod 3
  const crc0 = payload.reduce((s, v) => s + v, 0) % 3;
  const crc1 = payload.reduce((s, v, i) => s + v * (i + 1), 0) % 3;
  const symbols = [...payload, crc0, crc1];

  // Convert symbols to 9th-pulse timing offsets (seconds)
  const ppmOffsets = symbols.map((s) => {
    if (s === EUROFIX_SYMBOLS.EARLY) return -EUROFIX_PPM_OFFSET_SEC;
    if (s === EUROFIX_SYMBOLS.LATE) return +EUROFIX_PPM_OFFSET_SEC;
    return 0;
  });

  return {
    type: 'LDC_9TH_PULSE',
    station: stationLabel,
    seq: seqNumber,
    timestampSimSec: simTimeSec,
    utcMs: utcNowMs,
    utcIso: new Date(utcNowMs).toISOString(),
    diffMeters: parseFloat(diffCorrectionMeters.toFixed(3)),
    clockBiasNs: parseFloat(biasNs.toFixed(2)),
    integrityStatus: integrityOk ? 'OK' : 'ALARM',
    modulation: 'Eurofix 9th-Pulse 3-state PPM (±1 µs)',
    frameLength: EUROFIX_FRAME_SYMBOLS,
    symbols,          // 30-symbol ternary word
    ppmOffsets,       // 30 timing offsets in seconds for waveform rendering
    utcSymbols,
    asfSymbols,
    statusSymbols,
    seqSymbols,
  };
}

/**
 * Simulates a batch of LDC broadcast transmissions across all enabled master stations.
 * @param {Array<object>} masters - Master stations list
 * @param {number} simTimeSec - Current simulation time in seconds
 * @param {boolean} integrityStatus - System-wide integrity status
 * @returns {Array<object>} List of generated DDS/LDC event packets
 */
export function broadcastDdsEvents(masters, simTimeSec, integrityStatus = true) {
  const events = [];
  if (!Array.isArray(masters)) return events;

  masters.forEach((m, idx) => {
    if (!m.ddsEnabled) return;
    const diff = m.diffCorrections?.enabled ? m.diffCorrections.avgMeters || 0 : 0;
    const bias = m.clock?.biasSec || 0;
    const packet = createDdsPacket({
      stationLabel: m.label || `M${idx + 1}`,
      simTimeSec,
      clockBiasSec: bias,
      diffCorrectionMeters: diff,
      integrityOk: integrityStatus,
      seqNumber: (Math.floor(simTimeSec) * 10 + idx + 1) % 81,
    });
    events.push(packet);
  });

  return events;
}

/**
 * Decodes a Eurofix 30-symbol ternary word back to human-readable fields.
 * @param {number[]} symbols - 30-element ternary symbol array
 * @returns {{utcCorrectionNs: number, asfCorrectionMeters: number, integrityOk: boolean, seqNumber: number, crcValid: boolean}}
 */
export function decodeDdsPacket(symbols) {
  if (!symbols || symbols.length !== EUROFIX_FRAME_SYMBOLS) {
    return { utcCorrectionNs: 0, asfCorrectionMeters: 0, integrityOk: true, seqNumber: 0, crcValid: false };
  }

  const utcValue = symbols.slice(6, 12).reduce((s, v, i) => s + v * Math.pow(3, 5 - i), 0);
  const asfValue = symbols.slice(12, 18).reduce((s, v, i) => s + v * Math.pow(3, 5 - i), 0);
  const statusValue = symbols.slice(18, 24).reduce((s, v, i) => s + v * Math.pow(3, 5 - i), 0);
  const seqValue = symbols.slice(24, 28).reduce((s, v, i) => s + v * Math.pow(3, 3 - i), 0);

  const payload = symbols.slice(0, 28);
  const expectedCrc0 = payload.reduce((s, v) => s + v, 0) % 3;
  const expectedCrc1 = payload.reduce((s, v, i) => s + v * (i + 1), 0) % 3;
  const crcValid = (symbols[28] === expectedCrc0) && (symbols[29] === expectedCrc1);

  return {
    utcCorrectionNs: (utcValue - 364) * 30,       // Back to nanoseconds
    asfCorrectionMeters: (asfValue - 364) / 100,  // Back to meters
    integrityOk: (statusValue < 243),             // integrityCode bit = 0
    seqNumber: seqValue,
    crcValid,
  };
}
