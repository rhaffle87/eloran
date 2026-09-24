/**
 * Direct Digital Synthesis (DDS) & eLoran Data Channel (Eurofix) Simulation
 * Generates and parses 9th-pulse pulse-position modulated data bursts broadcast by eLoran transmitters.
 */

/**
 * Encodes an eLoran DDS broadcast message packet.
 * @param {object} params
 * @param {string} params.stationLabel - Transmitting station identifier
 * @param {number} params.simTimeSec - Simulation time in seconds
 * @param {number} [params.clockBiasSec=0] - Current clock bias
 * @param {number} [params.diffCorrectionMeters=0] - Differential ASF correction in meters
 * @param {boolean} [params.integrityOk=true] - Channel integrity status
 * @param {number} [params.seqNumber=1] - Message sequence counter
 * @returns {object} Encoded DDS message packet
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
  return {
    type: 'DDS_BROADCAST',
    station: stationLabel,
    seq: seqNumber,
    timestampSimSec: simTimeSec,
    utcMs: utcNowMs,
    utcIso: new Date(utcNowMs).toISOString(),
    diffMeters: parseFloat(diffCorrectionMeters.toFixed(2)),
    integrityStatus: integrityOk ? 'OK' : 'ALARM',
    modulation: 'Eurofix 9th-Pulse 3-state PPM',
  };
}

/**
 * Simulates a batch of DDS broadcast transmissions across all enabled master stations.
 * @param {Array<object>} masters - Master stations list
 * @param {number} simTimeSec - Current simulation time in seconds
 * @param {boolean} integrityStatus - System-wide integrity status
 * @returns {Array<object>} List of generated DDS event packets
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
      seqNumber: (Math.floor(simTimeSec) * 10 + idx + 1) % 100000,
    });
    events.push(packet);
  });

  return events;
}
