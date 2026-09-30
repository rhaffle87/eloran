/**
 * Electronic Warfare (EW) Jamming and Spoofing RF Simulator for SIMULORAN
 * Sourced from:
 * - Kaplan & Hegarty (2017), "Understanding GPS/GNSS: Principles and Applications", 3rd Ed. (Chapter 6 & 11)
 * - Ward, P. W. (1994), "GNSS Jamming and Interference"
 * - USCG & FAA RTCA DO-229 / DO-235 Jammer-to-Signal (J/S) Tracking Loss Standards
 *
 * Models:
 * 1. Line-of-sight microwave GNSS jammer path loss (Friis transmission equation)
 * 2. Jammer-to-Signal (J/S) power ratio and receiver tracking state (nominal, degraded, denied)
 * 3. eLoran high-power LF groundwave penetration advantage (> 90 dB resilience margin)
 * 4. GNSS spoofing course-deviation generator and autonomous eLoran cross-check detector
 */

import { destinationPoint, haversineDistance, SPEED_OF_LIGHT } from './geodesy.js';

export const GPS_L1_FREQ_HZ = 1575.42e6;              // 1575.42 MHz
export const NOMINAL_GPS_RX_POWER_DBW = -158.5;       // Nominal minimum received GPS L1 C/A power (IS-GPS-200)
export const JAMMER_DEGRADATION_THRESHOLD_DB = 27.0;   // J/S threshold where code tracking errors spike
export const JAMMER_TRACKING_LOSS_THRESHOLD_DB = 42.0; // J/S threshold where receiver loses carrier/code lock

/**
 * Computes Free Space Path Loss (FSPL) in decibels using the Friis transmission formula.
 * @param {number} distanceMeters
 * @param {number} [freqHz=1575.42e6]
 * @returns {number} Path loss in dB
 */
export function computeFreeSpacePathLossDb(distanceMeters, freqHz = GPS_L1_FREQ_HZ) {
  const d = Math.max(1.0, distanceMeters);
  // FSPL(dB) = 20*log10(d) + 20*log10(f) + 20*log10(4*pi / c)
  const constantTerm = 20 * Math.log10((4 * Math.PI) / SPEED_OF_LIGHT);
  return 20 * Math.log10(d) + 20 * Math.log10(freqHz) + constantTerm;
}

/**
 * Computes received jammer power, Jammer-to-Signal (J/S) ratio, and GNSS receiver operational status.
 * @param {Object} params
 * @param {number} params.jammerPowerWatts - Jammer RF power in Watts (e.g. 10 W = +10 dBW)
 * @param {number} params.jammerDistanceMeters - Distance from jammer to receiver in meters
 * @param {number} [params.jammerGainDbi=0] - Jammer antenna gain (dBi)
 * @param {number} [params.rxGainDbi=0] - Receiver antenna gain (dBi)
 * @param {number} [params.gpsRxPowerDbw=-158.5] - Nominal GPS received power (dBW)
 * @returns {Object} Jammer impact diagnostics
 */
export function computeJammerToSignalRatio(params) {
  const pWatts = Math.max(0.001, params.jammerPowerWatts || 10.0);
  const pDbw = 10 * Math.log10(pWatts);
  const dist = Math.max(1.0, params.jammerDistanceMeters || 1000.0);
  const gt = params.jammerGainDbi || 0.0;
  const gr = params.rxGainDbi || 0.0;
  const gpsPower = params.gpsRxPowerDbw ?? NOMINAL_GPS_RX_POWER_DBW;

  const fspl = computeFreeSpacePathLossDb(dist, GPS_L1_FREQ_HZ);
  const rxJammerPowerDbw = pDbw + gt + gr - fspl;
  const jsRatioDb = rxJammerPowerDbw - gpsPower;

  let receiverState = 'nominal';
  let inducedNoiseStdMeters = 2.5;

  if (jsRatioDb >= JAMMER_TRACKING_LOSS_THRESHOLD_DB) {
    receiverState = 'denied'; // Loss of lock, GNSS fix unavailable
    inducedNoiseStdMeters = 999.9;
  } else if (jsRatioDb >= JAMMER_DEGRADATION_THRESHOLD_DB) {
    receiverState = 'degraded'; // Tracking jitter jumps
    const excessJs = jsRatioDb - JAMMER_DEGRADATION_THRESHOLD_DB;
    inducedNoiseStdMeters = 2.5 + excessJs * 2.0; // Escalates up to ~32m
  }

  return {
    jammerPowerWatts: pWatts,
    jammerPowerDbw: pDbw,
    distanceMeters: dist,
    pathLossDb: fspl,
    rxJammerPowerDbw,
    jsRatioDb,
    receiverState,
    inducedNoiseStdMeters,
    isDenied: receiverState === 'denied',
    isDegraded: receiverState === 'degraded',
  };
}

/**
 * Calculates the eLoran low-frequency groundwave RF penetration advantage over satellite GNSS.
 * Sourced from USCG & IALA Resilient PNT studies.
 * @param {number} [eloranRxPowerDbm=-30] - Nominal received eLoran signal level in dBm (-60 dBW)
 * @param {number} [gpsRxPowerDbw=-158.5] - Nominal received GPS signal level in dBW (-128.5 dBm)
 * @returns {Object} RF Resilience Advantage
 */
export function computeEloranJammingAdvantage(eloranRxPowerDbm = -30, gpsRxPowerDbw = NOMINAL_GPS_RX_POWER_DBW) {
  const eloranDbw = eloranRxPowerDbm - 30; // dBm to dBW
  const powerAdvantageDb = eloranDbw - gpsRxPowerDbw;
  const powerAdvantageLinear = Math.pow(10, powerAdvantageDb / 10);

  return {
    eloranRxPowerDbw: eloranDbw,
    gpsRxPowerDbw,
    powerAdvantageDb,
    powerAdvantageLinear,
    summary: `eLoran provides a +${powerAdvantageDb.toFixed(1)} dB RF power margin advantage over satellite GNSS (~${(powerAdvantageLinear / 1e9).toFixed(1)} billion times higher received power).`,
  };
}

/**
 * Simulates a GNSS spoofing trajectory pull-off attack and cross-checks against eLoran groundwave truth.
 * @param {{lat: number, lng: number}} truePosition - Actual true position of vessel
 * @param {{lat: number, lng: number}} eloranEstimate - Independent eLoran position estimate
 * @param {Object} spoofingConfig
 * @param {boolean} spoofingConfig.active - Whether spoofing attack is active
 * @param {number} [spoofingConfig.driftRateMetersPerMin=60] - False trajectory drift speed (m/min)
 * @param {number} [spoofingConfig.courseOffsetDeg=90] - Bearing of false drift relative to true motion
 * @param {number} [spoofingConfig.elapsedSec=0] - Duration of active spoofing attack in seconds
 * @returns {Object} Spoofing state and autonomous eLoran integrity cross-check
 */
export function evaluateGnssSpoofingAttack(truePosition, eloranEstimate, spoofingConfig = {}) {
  if (!spoofingConfig.active || !truePosition) {
    return {
      isSpoofed: false,
      spoofedLat: truePosition?.lat || 0,
      spoofedLng: truePosition?.lng || 0,
      driftMeters: 0,
      eLoranCrossCheckDiscrepancyM: 0,
      spoofingDetected: false,
    };
  }

  const elapsedMin = Math.max(0, spoofingConfig.elapsedSec || 0) / 60.0;
  const driftRate = spoofingConfig.driftRateMetersPerMin ?? 60.0; // 60 m/min = 1 m/s subtle drift
  const driftMeters = driftRate * elapsedMin;
  const bearing = spoofingConfig.courseOffsetDeg ?? 90.0;

  const spoofedPoint = destinationPoint(truePosition, driftMeters, bearing);

  // Cross-check spoofed point against independent eLoran estimate
  const discrepancyM = eloranEstimate ? haversineDistance(spoofedPoint, eloranEstimate) : driftMeters;

  // Autonomous integrity detection: if discrepancy exceeds 50 meters, flag spoofing
  const spoofingDetected = discrepancyM > 50.0;

  return {
    isSpoofed: true,
    spoofedLat: spoofedPoint.lat,
    spoofedLng: spoofedPoint.lng,
    driftMeters,
    eLoranCrossCheckDiscrepancyM: discrepancyM,
    spoofingDetected,
    alertMessage: spoofingDetected
      ? `CRITICAL: GNSS spoofing attack detected! Satellite solution has drifted ${discrepancyM.toFixed(0)}m from resilient eLoran groundwave reference.`
      : 'GNSS within tolerable limits.',
  };
}
