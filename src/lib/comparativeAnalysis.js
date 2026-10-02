/**
 * SIMULORAN — Multi-System PNT Comparative Analysis Engine (comparativeAnalysis.js)
 *
 * Compares 4 concurrent radionavigation paradigms under identical kinematic conditions:
 *   1. Pure Loran-C (1958 legacy hyperbolic TDOA, unmodeled ASF, standard envelope tracking)
 *   2. Modernized eLoran (Calibrated Millington ASF, LDC 9th-pulse modulation, cycle-slip guard)
 *   3. GNSS / GPS (Subject to EW electronic jamming, spoofing, or satellite outage)
 *   4. Integrated EKF Fusion with RAIM (Fault detection & exclusion, seamless failover)
 *
 * References:
 *   - US Coast Guard Loran-C User Handbook (COMDTINST M16562.4A)
 *   - RTCA DO-229D / DO-316 eLoran / GNSS Minimum Operational Performance Standards
 *   - IMO Resolution A.1046(27) Worldwide Radionavigation System Standards
 *   - Parkinson & Spilker (1996), Global Positioning System: Theory & Applications
 */

export const COMPARATIVE_MODES = {
  LORAN_C: 'loran_c',
  ELORAN: 'eloran',
  GNSS: 'gnss',
  EKF_FUSION: 'ekf_fusion',
};

export const COMPARATIVE_PRESETS = {
  nominal_clear: {
    id: 'nominal_clear',
    name: 'Nominal Maritime Transit (All Systems Nominal)',
    description: 'Unperturbed open-sea navigation. GNSS operational, eLoran calibrated, Loran-C experiencing baseline groundwave dispersion.',
    gnssStatus: 'nominal',
    includeSkywave: false,
    enableCycleSlips: false,
    asfModelMode: 'millington',
  },
  hormuz_jamming: {
    id: 'hormuz_jamming',
    name: 'Strait of Hormuz EW Jamming (GPS Denied)',
    description: 'Heavy 50W broadband GNSS barrage jamming. GPS fix fails completely (outage), eLoran operates unaffected on 100 kHz LF.',
    gnssStatus: 'jammed',
    gnssJammingNoiseMeters: 180,
    includeSkywave: false,
    enableCycleSlips: false,
    asfModelMode: 'millington',
  },
  baltic_spoofing: {
    id: 'baltic_spoofing',
    name: 'Baltic Sea Sophisticated GPS Spoofing',
    description: 'Deceptive meaconing attack dragging GNSS position 350 meters off-course. EKF RAIM detects pseudorange residual discordance and isolates GNSS.',
    gnssStatus: 'spoofed',
    gnssSpoofBiasMeters: 350,
    includeSkywave: false,
    enableCycleSlips: false,
    asfModelMode: 'millington',
  },
  nighttime_skywave_storm: {
    id: 'nighttime_skywave_storm',
    name: 'Arctic Nighttime Ionospheric Skywave Storm',
    description: 'Distant 1200 km transmitters at midnight (E-layer, 90 km). Legacy Loran-C suffers cycle slips (±10 µs / ~3 km error); eLoran maintains lock.',
    gnssStatus: 'nominal',
    includeSkywave: true,
    skywaveHourOfDay: 0.0,
    enableCycleSlips: true,
    asfModelMode: 'millington',
  },
};

/**
 * Computes comparative multi-system navigation metrics for a given receiver state.
 *
 * @param {object} params
 * @param {number} params.trueLat - Truth latitude
 * @param {number} params.trueLng - Truth longitude
 * @param {object} params.eloranFix - Solved eLoran fix
 * @param {object} params.gnssFix - Simulated GNSS fix
 * @param {object} params.fusedFix - EKF fused fix
 * @param {object} [params.settings] - Active simulation settings
 * @param {number} [params.alertLimitMeters=25.0] - IMO HEA (25m) or ICAO APV (40m)
 * @returns {object} Comparative multi-system evaluation
 */
export function evaluateComparativeSystems({
  trueLat: _trueLat,
  trueLng: _trueLng,
  eloranFix,
  gnssFix,
  fusedFix,
  settings = {},
  alertLimitMeters = 25.0,
}) {
  const isNight = (settings.skywaveHourOfDay ?? 0.0) < 6.0 || (settings.skywaveHourOfDay ?? 0.0) > 18.0;

  // 1. Pure Loran-C (Legacy 1958 Hyperbolic TDOA without ASF calibrations)
  // Baseline unmodeled ASF bias (~400m to 1200m) + potential cycle slip if enabled
  const hasCycleSlip = settings.enableCycleSlips && (settings.includeSkywave && isNight);
  const loranCBaseErrorMeters = 480.0 + (settings.asfLandFraction ?? 0.5) * 620.0;
  const loranCErrorMeters = hasCycleSlip ? loranCBaseErrorMeters + 2998.0 : loranCBaseErrorMeters;
  const loranCHplMeters = Math.max(900.0, loranCErrorMeters * 2.1);
  const loranCAvailable = loranCHplMeters <= alertLimitMeters;

  // 2. Modernized eLoran
  const eloranErrorMeters = eloranFix?.errorMeters ?? 12.5;
  const eloranHdop = eloranFix?.hdop ?? 1.2;
  const eloranHplMeters = Math.max(10.0, eloranErrorMeters * 1.25 + eloranHdop * 2.5);
  const eloranAvailable = eloranHplMeters <= alertLimitMeters;

  // 3. GNSS (GPS)
  let gnssErrorMeters = gnssFix?.errorMeters ?? 5.2;
  let gnssHplMeters = 12.0;
  let gnssIntegrityStatus = 'NOMINAL';

  if (settings.gnssStatus === 'jammed') {
    gnssErrorMeters = settings.gnssJammingNoiseMeters || 120.0;
    gnssHplMeters = gnssErrorMeters * 3.5;
    gnssIntegrityStatus = 'JAMMED / UNUSABLE';
  } else if (settings.gnssStatus === 'spoofed') {
    gnssErrorMeters = settings.gnssSpoofBiasMeters || 250.0;
    gnssHplMeters = 18.0; // Deceptively low reported HPL during spoofing attack!
    gnssIntegrityStatus = 'HAZARDOUS / SPOOFED';
  } else if (settings.gnssStatus === 'outage') {
    gnssErrorMeters = 9999.0;
    gnssHplMeters = 9999.0;
    gnssIntegrityStatus = 'OUTAGE';
  }

  const gnssAvailable = settings.gnssStatus === 'nominal' && gnssHplMeters <= alertLimitMeters;

  // 4. Integrated EKF Fusion with RAIM
  // If GNSS is spoofed or jammed, RAIM isolates GNSS and falls back onto eLoran
  const isGnssCompromised = settings.gnssStatus === 'jammed' || settings.gnssStatus === 'spoofed' || settings.gnssStatus === 'outage';
  const fusionErrorMeters = isGnssCompromised
    ? eloranErrorMeters * 1.05 // RAIM gracefully sheds GNSS; tracks purely on eLoran
    : fusedFix?.errorMeters ?? Math.min(eloranErrorMeters, gnssErrorMeters) * 0.75;

  const fusionHplMeters = isGnssCompromised
    ? eloranHplMeters
    : Math.min(eloranHplMeters, gnssHplMeters) * 0.85;

  const fusionAvailable = fusionHplMeters <= alertLimitMeters;
  const fusionRaimTriggered = isGnssCompromised;

  // Resilience score: [0 .. 100]
  // 100 = full accuracy & integrity under adverse EW or ionospheric conditions
  let resilienceScore = 100;
  if (!gnssAvailable && !fusionAvailable) resilienceScore -= 50;
  if (hasCycleSlip) resilienceScore -= 20;
  if (isGnssCompromised && fusionAvailable) resilienceScore = 95; // Demonstrates fusion failover

  return {
    alertLimitMeters,
    resilienceScore,
    systems: {
      [COMPARATIVE_MODES.LORAN_C]: {
        name: 'Legacy Loran-C (1958)',
        generation: 'Gen-1 (TDOA Hyperbolic)',
        errorMeters: parseFloat(loranCErrorMeters.toFixed(1)),
        hplMeters: parseFloat(loranCHplMeters.toFixed(1)),
        available: loranCAvailable,
        status: hasCycleSlip ? 'CYCLE SLIP (+10 µs)' : 'UNMODELED ASF BIAS',
        colorVar: '--color-loran-c',
        carrierFreq: '100 kHz LF',
        hasAsfCorrection: false,
        hasLdcChannel: false,
      },
      [COMPARATIVE_MODES.ELORAN]: {
        name: 'Enhanced Loran (eLoran)',
        generation: 'Gen-3 (All-in-View TOA)',
        errorMeters: parseFloat(eloranErrorMeters.toFixed(1)),
        hplMeters: parseFloat(eloranHplMeters.toFixed(1)),
        available: eloranAvailable,
        status: eloranAvailable ? 'OPERATIONAL' : 'DEGRADED GEOMETRY',
        colorVar: '--color-eloran',
        carrierFreq: '100 kHz LF',
        hasAsfCorrection: true,
        hasLdcChannel: true,
      },
      [COMPARATIVE_MODES.GNSS]: {
        name: 'Global Navigation Satellite System (GNSS)',
        generation: 'Space-Based (L1/L2)',
        errorMeters: parseFloat(gnssErrorMeters.toFixed(1)),
        hplMeters: parseFloat(gnssHplMeters.toFixed(1)),
        available: gnssAvailable,
        status: gnssIntegrityStatus,
        colorVar: '--accent-gnss',
        carrierFreq: '1.575 GHz UHF',
        hasAsfCorrection: false,
        hasLdcChannel: false,
      },
      [COMPARATIVE_MODES.EKF_FUSION]: {
        name: 'Multi-Rate EKF + RAIM Resilience Fusion',
        generation: 'Multi-Sensor Complementary',
        errorMeters: parseFloat(fusionErrorMeters.toFixed(1)),
        hplMeters: parseFloat(fusionHplMeters.toFixed(1)),
        available: fusionAvailable,
        status: fusionRaimTriggered ? 'RAIM FAULT EXCLUSION (GNSS ISOLATED)' : 'OPTIMAL COVARIANCE FUSED',
        colorVar: '--color-success',
        carrierFreq: 'Dual Spectrum (LF + UHF)',
        hasAsfCorrection: true,
        hasLdcChannel: true,
      },
    },
  };
}
