/**
 * Stanford Diagram & Autonomous RAIM Fault Detection and Exclusion (FDE) for SIMULORAN
 * Sourced from:
 * - RTCA DO-229D / DO-316 Minimum Operational Performance Standards for GNSS/eLoran
 * - ICAO Annex 10 (Aeronautical Telecommunications, Vol. 1 - Radio Navigation Aids)
 * - IMO Resolution A.1046(27) Worldwide Radionavigation System Standards
 * - Parkinson & Spilker (1996), "Global Positioning System: Theory and Applications" (RAIM Chapter)
 */

export const ALERT_LIMIT_PRESETS = {
  maritime_hea: {
    id: 'maritime_hea',
    name: 'IMO Harbor Entrance & Approach (HEA)',
    halMeters: 10.0,
    domain: 'maritime',
    description: 'IMO Res. A.1046 requirement for navigation in confined harbor waterways (10m 95% accuracy).',
  },
  maritime_coastal: {
    id: 'maritime_coastal',
    name: 'IMO Coastal Waters Navigation',
    halMeters: 50.0,
    domain: 'maritime',
    description: 'IMO standard for coastal and ocean passage.',
  },
  aviation_apv: {
    id: 'aviation_apv',
    name: 'ICAO APV-I Instrument Approach',
    halMeters: 40.0,
    domain: 'aviation',
    description: 'ICAO Annex 10 Approach with Vertical Guidance Alert Limit.',
  },
  aviation_rnp03: {
    id: 'aviation_rnp03',
    name: 'ICAO RNAV RNP 0.3 Terminal Airspace',
    halMeters: 556.0,
    domain: 'aviation',
    description: '0.3 nautical miles (556 meters) terminal airspace containment boundary.',
  },
};

export const STANFORD_ZONES = {
  NORMAL: 'normal',              // HPE <= HPL and HPL <= HAL (Safe & Available)
  UNAVAILABLE: 'unavailable',    // HPL > HAL (System unavailable, geometry too poor)
  MI: 'misleading_information',  // HPE > HPL and HPE <= HAL (Integrity breach, but within limit)
  HMI: 'hazardously_misleading', // HPE > HPL and HPE > HAL (CRITICAL DANGER: uncontained hazard!)
};

/**
 * Classifies an epoch into one of the 4 Stanford Diagram operational zones.
 * @param {number} hpeMeters - Horizontal Position Error
 * @param {number} hplMeters - Horizontal Protection Level
 * @param {number} halMeters - Horizontal Alert Limit
 * @returns {Object} Stanford zone classification
 */
export function classifyStanfordZone(hpeMeters, hplMeters, halMeters) {
  const hpe = Math.max(0, hpeMeters || 0);
  const hpl = Math.max(0, hplMeters || 0);
  const hal = Math.max(1.0, halMeters || 10.0);

  if (hpe > hpl && hpe > hal) {
    return {
      zone: STANFORD_ZONES.HMI,
      label: 'Hazardously Misleading Info (HMI)',
      severity: 'critical',
      isSafe: false,
      isAvailable: false,
      hpe,
      hpl,
      hal,
    };
  }

  if (hpe > hpl && hpe <= hal) {
    return {
      zone: STANFORD_ZONES.MI,
      label: 'Misleading Info (MI)',
      severity: 'warning',
      isSafe: false,
      isAvailable: true,
      hpe,
      hpl,
      hal,
    };
  }

  if (hpl > hal) {
    return {
      zone: STANFORD_ZONES.UNAVAILABLE,
      label: 'System Unavailable (HPL > HAL)',
      severity: 'caution',
      isSafe: true,
      isAvailable: false,
      hpe,
      hpl,
      hal,
    };
  }

  return {
    zone: STANFORD_ZONES.NORMAL,
    label: 'Normal Operation (Safe & Nominal)',
    severity: 'ok',
    isSafe: true,
    isAvailable: true,
    hpe,
    hpl,
    hal,
  };
}

/**
 * Chi-Square critical values for 1-alpha = 0.999 (0.1% false alarm probability)
 * DOF = N - 3 (degrees of freedom for 2D horizontal fix + clock bias)
 */
const CHI_SQUARE_999 = {
  1: 10.828,
  2: 13.816,
  3: 16.266,
  4: 18.467,
  5: 20.515,
  6: 22.458,
  7: 24.322,
  8: 26.125,
};

/**
 * Performs Autonomous Receiver Autonomous Integrity Monitoring (RAIM) Fault Detection and Exclusion (FDE).
 * @param {Array<Object>} observations - Array of station pseudorange observations
 * @param {Array<number>} residualsMeters - Observed minus modeled pseudorange residuals (r_i)
 * @param {Array<number>} sigmasMeters - Individual measurement uncertainties (sigma_i)
 * @returns {Object} RAIM detection and exclusion outcome
 */
export function performRaimFde(observations, residualsMeters, sigmasMeters) {
  const n = observations?.length || 0;
  if (n < 4 || !residualsMeters || residualsMeters.length !== n) {
    return {
      available: false,
      faultDetected: false,
      isolatedStation: null,
      testStatistic: 0,
      threshold: 0,
      reason: 'Insufficient redundancy for RAIM (requires >= 4 transmitters)',
    };
  }

  const dof = Math.max(1, n - 3);
  const threshold = CHI_SQUARE_999[dof] || (dof + 3 * Math.sqrt(2 * dof));

  // Compute normalized Sum of Squared Errors (SSE)
  let sse = 0;
  let maxResidualIdx = -1;
  let maxNormalizedResidual = -1;

  for (let i = 0; i < n; i++) {
    const sigma = sigmasMeters?.[i] || 5.0;
    const normR = Math.abs(residualsMeters[i]) / sigma;
    const normSq = normR * normR;
    sse += normSq;

    if (normSq > maxNormalizedResidual) {
      maxNormalizedResidual = normSq;
      maxResidualIdx = i;
    }
  }

  const faultDetected = sse > threshold;
  const isolatedStation = faultDetected && maxResidualIdx >= 0 ? observations[maxResidualIdx]?.station?.label : null;

  return {
    available: true,
    dof,
    testStatistic: sse,
    threshold,
    faultDetected,
    isolatedStation,
    maxNormalizedResidual: Math.sqrt(Math.max(0, maxNormalizedResidual)),
    status: faultDetected ? 'FAULT_DETECTED' : 'NOMINAL',
  };
}
