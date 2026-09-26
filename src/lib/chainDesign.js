/**
 * Chain Design & Planning Module for LORAN LAB
 *
 * Implements standard engineering procedures from the US Coast Guard Loran-C
 * User Handbook (COMDTINST P16562.5 / COMDTINST M16562.4A):
 *   1. Baseline travel time calculation from ellipsoidal/great-circle geodesics
 *   2. Secondary Coding Delay (CD) and Emission Delay (ED) calculation:
 *      Emission Delay = Baseline Travel Time + Coding Delay
 *   3. Minimum feasible Group Repetition Interval (GRI) and non-overlap constraint checks
 *   4. Hyperbolic Line of Position (LOP) gradient K derivation from actual station geometry
 *   5. Geometric Dilution of Precision (GDOP = 2drms / 2drms*) with configurable TD sigma
 *   6. Crossing angle geometry and baseline extension hazard zone detection
 */

import { haversineDistance, initialBearing, destinationPoint, latLngToLocalXY } from './geodesy.js';

export const SPEED_OF_LIGHT = 299792458; // m/s (vacuum)
export const DEFAULT_ATMOSPHERIC_REFRACTIVE_INDEX = 1.000338; // RTCM / Loran standard atmosphere

/**
 * Standard propagation delay rate per nautical mile in standard atmosphere:
 * 1852 m / (c / eta) ≈ 6.17969 µs/nm ≈ 6.18 µs/nm
 * Sourced: USCG Loran-C User Handbook §2.B
 */
export const PROPAGATION_RATE_US_PER_NM = 6.179694;

/**
 * USCG nominal time difference measurement standard deviation:
 * σ_TD = 0.1 µs (approximately 30 meters along baseline).
 * Sourced: USCG Loran-C User Handbook §4.C / Specification M16562.4A
 */
export const USCG_TD_SIGMA_SEC = 0.1e-6; // 0.1 µs

/**
 * USCG Operational Specification Accuracy Standard:
 * 0.25 nautical miles (463.0 meters) 2drms (95% confidence).
 */
export const USCG_SPEC_2DRMS_METERS = 463.0; // 0.25 nmi

/**
 * Ideal baseline reference fix 2drms* at σ_TD = 0.1 µs on orthogonal baselines:
 * 2drms* = 2 * sqrt(2) * σ_TD * (c / 2) ≈ 42.397 meters.
 * Corresponding USCG Specification GDOP = 463.0 / 42.397 ≈ 10.92.
 */
export const USCG_SPEC_GDOP = 10.92;

/**
 * Pulse group durations (nominal):
 * Master: 9 pulses (8 at 1000 µs + 1 at 2000 µs = 9900 µs nominal duration)
 * Secondary: 8 pulses (8 at 1000 µs = 7000 µs nominal duration)
 */
export const MASTER_PULSE_GROUP_SPAN_US = 9900;
export const SECONDARY_PULSE_GROUP_SPAN_US = 7000;
export const USCG_MIN_CODING_DELAY_US = 10000; // Minimum 10,000 µs coding delay

/**
 * Computes baseline travel time in microseconds from baseline distance in meters.
 *
 * @param {number} baselineMeters - Geodesic baseline distance in meters
 * @param {number} [eta=1.000338] - Atmospheric refractive index
 * @returns {number} Baseline travel time in microseconds (µs)
 */
export function computeBaselineTravelTime(baselineMeters, eta = DEFAULT_ATMOSPHERIC_REFRACTIVE_INDEX) {
  if (baselineMeters <= 0) return 0;
  const speed = SPEED_OF_LIGHT / eta;
  const timeSeconds = baselineMeters / speed;
  return timeSeconds * 1e6; // Convert seconds to microseconds
}

/**
 * Computes Emission Delay (ED) from baseline distance and assigned Coding Delay (CD):
 * Emission Delay = Baseline Travel Time + Coding Delay
 *
 * @param {number} baselineMeters - Baseline length in meters
 * @param {number} codingDelayUs - Assigned coding delay in microseconds
 * @param {number} [eta=1.000338] - Atmospheric refractive index
 * @returns {{baselineDistanceMeters: number, baselineDistanceNm: number, travelTimeUs: number, codingDelayUs: number, emissionDelayUs: number}}
 */
export function computeEmissionDelay(baselineMeters, codingDelayUs, eta = DEFAULT_ATMOSPHERIC_REFRACTIVE_INDEX) {
  const travelTimeUs = computeBaselineTravelTime(baselineMeters, eta);
  const emissionDelayUs = travelTimeUs + codingDelayUs;
  return {
    baselineDistanceMeters: baselineMeters,
    baselineDistanceNm: baselineMeters / 1852,
    travelTimeUs,
    codingDelayUs,
    emissionDelayUs,
  };
}

/**
 * Computes minimum feasible GRI for a proposed chain configuration.
 *
 * @param {Array<{emissionDelayUs: number}>} secondaries - Computed secondary list
 * @param {number} [maxCoverageDistanceMeters=800000] - Expected service radius in meters (~430 nmi)
 * @param {number} [guardTimeUs=2000] - Safety guard band in microseconds
 * @param {number} [eta=1.000338] - Atmospheric refractive index
 * @returns {number} Minimum feasible GRI in microseconds (rounded up to nearest multiple of 10 µs)
 */
export function computeMinimumFeasibleGRI(
  secondaries,
  maxCoverageDistanceMeters = 800000,
  guardTimeUs = 2000,
  eta = DEFAULT_ATMOSPHERIC_REFRACTIVE_INDEX
) {
  if (!secondaries || secondaries.length === 0) return 50000;

  const maxED = Math.max(...secondaries.map((s) => s.emissionDelayUs || 0));
  const maxCoverageTravelTimeUs = (maxCoverageDistanceMeters / (SPEED_OF_LIGHT / eta)) * 1e6;

  // GRI must clear: Last Secondary Emission + Secondary Pulse Group + Max Transit Time + Guard Time
  const requiredUs = maxED + SECONDARY_PULSE_GROUP_SPAN_US + maxCoverageTravelTimeUs + guardTimeUs;

  // Loran-C GRIs are designated in multiples of 10 µs (e.g., 59300 µs = GRI 5930)
  return Math.ceil(requiredUs / 10) * 10;
}

/**
 * Evaluates the full feasibility of a proposed chain configuration against USCG Handbook criteria:
 *   1. Minimum coding delay check (CD >= 10,000 µs)
 *   2. Secondary arrival sequence and non-overlap constraint across the coverage area
 *   3. Minimum feasible GRI vs user-assigned GRI
 *   4. Maximum practical baseline length (< 1,800 km / ~1,000 nmi)
 *
 * @param {object} master - Master station {lat, lng}
 * @param {Array<object>} secondaries - List of proposed secondaries [{id, name, lat, lng, codingDelayUs}]
 * @param {number} currentGRIUs - Current or proposed GRI in microseconds
 * @param {object} [options] - Additional parameters {maxCoverageDistanceMeters, guardTimeUs, eta}
 * @returns {object} Feasibility report with detailed violations and secondary timing table
 */
export function evaluateChainFeasibility(master, secondaries, currentGRIUs, options = {}) {
  const {
    maxCoverageDistanceMeters = 800000,
    guardTimeUs = 2000,
    eta = DEFAULT_ATMOSPHERIC_REFRACTIVE_INDEX,
  } = options;

  const violations = [];
  const warnings = [];

  if (!master || !secondaries || secondaries.length === 0) {
    return {
      isFeasible: false,
      minFeasibleGRI: 50000,
      secondaries: [],
      violations: [{ code: 'INSUFFICIENT_STATIONS', message: 'At least 1 Master and 1 Secondary required.' }],
      warnings: [],
    };
  }

  if (secondaries.length < 2) {
    warnings.push({
      code: 'SINGLE_SECONDARY_1D',
      message: 'Chain has only 1 Secondary; provides a single hyperbolic Line of Position (1D LOP), minimum 2 Secondaries required for a 2D position fix.',
    });
  }

  // 1. Compute baseline travel times and emission delays for each secondary
  const computedSecondaries = secondaries.map((sec, idx) => {
    const distMeters = haversineDistance(master, sec);
    const edResult = computeEmissionDelay(distMeters, sec.codingDelayUs || (11000 + idx * 14000), eta);
    return {
      ...sec,
      baselineDistanceMeters: distMeters,
      baselineDistanceNm: distMeters / 1852,
      travelTimeUs: edResult.travelTimeUs,
      codingDelayUs: edResult.codingDelayUs,
      emissionDelayUs: edResult.emissionDelayUs,
      index: idx,
    };
  });

  // 2. Validate individual secondary parameters
  for (const sec of computedSecondaries) {
    if (sec.codingDelayUs < USCG_MIN_CODING_DELAY_US) {
      violations.push({
        code: 'CODING_DELAY_TOO_LOW',
        stationId: sec.id || sec.name,
        message: `Secondary ${sec.id || sec.name} coding delay (${sec.codingDelayUs.toFixed(0)} µs) is below USCG minimum of ${USCG_MIN_CODING_DELAY_US} µs.`,
      });
    }

    if (sec.baselineDistanceMeters > 1800000) {
      warnings.push({
        code: 'BASELINE_EXCESSIVE_LENGTH',
        stationId: sec.id || sec.name,
        message: `Baseline length to ${sec.id || sec.name} (${(sec.baselineDistanceNm).toFixed(0)} nmi) exceeds 1000 nmi; groundwave attenuation may prevent sync.`,
      });
    }
  }

  // 3. Validate secondary emission order and collision margins
  for (let i = 0; i < computedSecondaries.length - 1; i++) {
    const curr = computedSecondaries[i];
    const next = computedSecondaries[i + 1];

    // Margin between end of curr pulse group and start of next pulse group
    const emissionGap = next.emissionDelayUs - curr.emissionDelayUs;
    const minRequiredGap = SECONDARY_PULSE_GROUP_SPAN_US + (curr.baselineDistanceMeters / (SPEED_OF_LIGHT / eta)) * 1e6;

    if (emissionGap < SECONDARY_PULSE_GROUP_SPAN_US + 1000) {
      violations.push({
        code: 'SECONDARY_COLLISION',
        stationA: curr.id || curr.name,
        stationB: next.id || next.name,
        gapUs: emissionGap,
        message: `Secondaries ${curr.id || curr.name} and ${next.id || next.name} emissions are spaced only ${emissionGap.toFixed(0)} µs apart (pulse group requires >= ${SECONDARY_PULSE_GROUP_SPAN_US} µs).`,
      });
    } else if (emissionGap < minRequiredGap) {
      warnings.push({
        code: 'TIGHT_SECONDARY_MARGIN',
        stationA: curr.id || curr.name,
        stationB: next.id || next.name,
        gapUs: emissionGap,
        message: `Timing margin between ${curr.id || curr.name} and ${next.id || next.name} is tight (${emissionGap.toFixed(0)} µs); pulses may overlap near baseline extension.`,
      });
    }
  }

  // 4. Validate Minimum Feasible GRI
  const minFeasibleGRI = computeMinimumFeasibleGRI(computedSecondaries, maxCoverageDistanceMeters, guardTimeUs, eta);

  if (currentGRIUs < minFeasibleGRI) {
    violations.push({
      code: 'GRI_TOO_SHORT',
      currentGRI: currentGRIUs,
      minFeasibleGRI,
      message: `Assigned GRI (${currentGRIUs} µs) is shorter than minimum feasible interval (${minFeasibleGRI} µs); last secondary pulse wraps into next Master.`,
    });
  }

  return {
    isFeasible: violations.length === 0,
    currentGRIUs,
    minFeasibleGRI,
    secondaries: computedSecondaries,
    violations,
    warnings,
  };
}

/**
 * Computes hyperbolic Line of Position (LOP) gradient vector and lane expansion factor at a point.
 * Gradient g = (1 / c) * (u_S - u_M)
 * Magnitude ||g|| = (2 / c) * sin(psi / 2)
 * Lane width Gamma = 1 / ||g|| = (c / 2) / sin(psi / 2)
 *
 * @param {{lat: number, lng: number}} point - Receiver location
 * @param {{lat: number, lng: number}} master - Master station
 * @param {{lat: number, lng: number}} secondary - Secondary station
 * @param {number} [eta=1.000338] - Atmospheric refractive index
 * @returns {{gx: number, gy: number, hx: number, hy: number, magnitude: number, psiDeg: number, laneWidthMetersPerUs: number}}
 */
export function computeLOPGradient(point, master, secondary, eta = DEFAULT_ATMOSPHERIC_REFRACTIVE_INDEX) {
  const c = SPEED_OF_LIGHT / eta;

  // Local Cartesian projection centered at receiver
  const refLat = point.lat;
  const refLng = point.lng;
  const pxy = latLngToLocalXY(point.lat, point.lng, refLat, refLng);
  const mxy = latLngToLocalXY(master.lat, master.lng, refLat, refLng);
  const sxy = latLngToLocalXY(secondary.lat, secondary.lng, refLat, refLng);

  const dM = Math.hypot(pxy.x - mxy.x, pxy.y - mxy.y);
  const dS = Math.hypot(pxy.x - sxy.x, pxy.y - sxy.y);

  if (dM < 10 || dS < 10) {
    return { gx: 0, gy: 0, hx: 0, hy: 0, magnitude: 0, psiDeg: 0, laneWidthMetersPerUs: Infinity };
  }

  // Unit vectors from receiver pointing toward stations
  const uMx = (mxy.x - pxy.x) / dM;
  const uMy = (mxy.y - pxy.y) / dM;
  const uSx = (sxy.x - pxy.x) / dS;
  const uSy = (sxy.y - pxy.y) / dS;

  // Angle psi subtended by the baseline at the receiver
  const dotU = Math.max(-1, Math.min(1, uMx * uSx + uMy * uSy));
  const psiRad = Math.acos(dotU);
  const psiDeg = (psiRad * 180) / Math.PI;

  // Dimensionless geometry vector: (u_S - u_M)
  const hx = uSx - uMx;
  const hy = uSy - uMy;
  const hMag = Math.hypot(hx, hy); // 2 * sin(psi / 2)
  const gMag = hMag / c;

  // Lane width Gamma in meters per microsecond (c / 2 / sin(psi/2))
  const sinHalfPsi = Math.sin(psiRad / 2);
  const laneWidthMetersPerSec = sinHalfPsi > 1e-6 ? (c / 2) / sinHalfPsi : Infinity;
  const laneWidthMetersPerUs = laneWidthMetersPerSec * 1e-6;

  return {
    gx: hx / c,
    gy: hy / c,
    hx,
    hy,
    magnitude: gMag,
    psiDeg,
    laneWidthMetersPerUs,
  };
}

/**
 * Computes crossing angle between two hyperbolic LOP pairs (Master-Sec1 and Master-Sec2).
 * Optimal: 90° (best geometric fix).
 * Poor: < 30° or > 150° (ill-conditioned, near-parallel LOPs).
 *
 * @param {{lat: number, lng: number}} point - Receiver position
 * @param {{lat: number, lng: number}} master - Master station
 * @param {{lat: number, lng: number}} sec1 - First secondary
 * @param {{lat: number, lng: number}} sec2 - Second secondary
 * @returns {{angleDeg: number, isFavorable: boolean, sinTheta: number}}
 */
export function computeCrossingAngle(point, master, sec1, sec2) {
  const g1 = computeLOPGradient(point, master, sec1);
  const g2 = computeLOPGradient(point, master, sec2);

  if (g1.magnitude <= 1e-12 || g2.magnitude <= 1e-12) {
    return { angleDeg: 0, isFavorable: false, sinTheta: 0 };
  }

  // cos(theta) = (g1 · g2) / (||g1|| * ||g2||)
  const dotG = g1.gx * g2.gx + g1.gy * g2.gy;
  const cosTheta = Math.max(-1, Math.min(1, dotG / (g1.magnitude * g2.magnitude)));
  const angleRad = Math.acos(cosTheta);
  const angleDeg = (angleRad * 180) / Math.PI;
  const sinTheta = Math.sin(angleRad);

  return {
    angleDeg,
    isFavorable: angleDeg >= 30 && angleDeg <= 150,
    sinTheta,
  };
}

/**
 * Computes hyperbolic GDOP at a receiver coordinate:
 * GDOP = 2drms / 2drms*
 * where 2drms* is the ideal baseline reference fix at σ_TD.
 *
 * @param {{lat: number, lng: number}} point - Receiver position
 * @param {{lat: number, lng: number}} master - Master station
 * @param {Array<{lat: number, lng: number}>} secondaries - Secondary stations
 * @param {number} [tdSigmaUs=0.1] - Time difference measurement standard deviation in µs
 * @returns {{gdop: number, hdop: number, twoDrmsMeters: number, valid: boolean}}
 */
export function computeHyperbolicGDOP(point, master, secondaries, tdSigmaUs = 0.1) {
  if (!master || !secondaries || secondaries.length < 2 || !point) {
    return { gdop: 99.9, hdop: 99.9, twoDrmsMeters: 9999, valid: false };
  }

  const tdSigmaSec = tdSigmaUs * 1e-6;
  const c = SPEED_OF_LIGHT / DEFAULT_ATMOSPHERIC_REFRACTIVE_INDEX;

  // Compute dimensionless geometry vectors H_norm = [hx, hy]
  const gradients = secondaries.map((sec) => computeLOPGradient(point, master, sec));
  const validGradients = gradients.filter((g) => Math.hypot(g.hx, g.hy) > 1e-4);

  if (validGradients.length < 2) {
    return { gdop: 99.9, hdop: 99.9, twoDrmsMeters: 9999, valid: false };
  }

  // Normal equations (H_norm^T * H_norm)
  let h11 = 0;
  let h12 = 0;
  let h22 = 0;

  for (const g of validGradients) {
    h11 += g.hx * g.hx;
    h12 += g.hx * g.hy;
    h22 += g.hy * g.hy;
  }

  const det = h11 * h22 - h12 * h12;
  if (det <= 1e-6) {
    return { gdop: 99.9, hdop: 99.9, twoDrmsMeters: 9999, valid: false };
  }

  const inv11 = h22 / det;
  const inv22 = h11 / det;

  // Covariance in distance: tr((H^T H)^-1) = c^2 * tr((H_norm^T H_norm)^-1)
  // Distance error standard deviation:
  // drms = c * sigma_TD * sqrt(inv11 + inv22)
  const drms = c * tdSigmaSec * Math.sqrt(Math.max(0, inv11 + inv22));
  const twoDrms = 2 * drms;

  // Reference ideal 2drms* on orthogonal baselines (psi = 180°, angle = 90°):
  // 2drms* = 2 * sqrt(2) * sigma_TD * (c / 2)
  const ideal2drms = 2 * Math.SQRT2 * tdSigmaSec * (c / 2);
  const gdop = ideal2drms > 0 ? twoDrms / ideal2drms : 99.9;

  return {
    gdop: Math.min(99.9, parseFloat(gdop.toFixed(2))),
    hdop: Math.min(99.9, parseFloat(gdop.toFixed(2))),
    twoDrmsMeters: parseFloat(twoDrms.toFixed(1)),
    valid: true,
  };
}

/**
 * Checks whether a given geographic coordinate lies inside the hazardous
 * Baseline Extension zone (the conical wedge extending behind Master or Secondary).
 *
 * @param {{lat: number, lng: number}} point - Point to evaluate
 * @param {{lat: number, lng: number}} master - Master station {lat, lng}
 * @param {{lat: number, lng: number}} secondary - Secondary station {lat, lng}
 * @param {number} [halfWidthDeg=10] - Half-angle of hazard cone in degrees
 * @returns {{isExtension: boolean, stationRole: 'MASTER'|'SECONDARY'|null, angleOffExtensionDeg: number}}
 */
export function isInsideBaselineExtension(point, master, secondary, halfWidthDeg = 10) {
  // Baseline azimuths
  const bearingMasterToSec = initialBearing(master, secondary);
  const bearingSecToMaster = initialBearing(secondary, master);

  // Bearing from Master to Receiver
  const bearingMasterToPoint = initialBearing(master, point);
  // Bearing from Secondary to Receiver
  const bearingSecToPoint = initialBearing(secondary, point);

  // Master baseline extension projects away from Secondary: bearingSecToMaster
  const angleOffMasterExtension = Math.abs(
    ((bearingMasterToPoint - bearingSecToMaster + 540) % 360) - 180
  );

  // Secondary baseline extension projects away from Master: bearingMasterToSec
  const angleOffSecExtension = Math.abs(
    ((bearingSecToPoint - bearingMasterToSec + 540) % 360) - 180
  );

  if (angleOffSecExtension <= halfWidthDeg) {
    return {
      isExtension: true,
      stationRole: 'SECONDARY',
      angleOffExtensionDeg: parseFloat(angleOffSecExtension.toFixed(2)),
    };
  }

  if (angleOffMasterExtension <= halfWidthDeg) {
    return {
      isExtension: true,
      stationRole: 'MASTER',
      angleOffExtensionDeg: parseFloat(angleOffMasterExtension.toFixed(2)),
    };
  }

  return {
    isExtension: false,
    stationRole: null,
    angleOffExtensionDeg: Math.min(angleOffMasterExtension, angleOffSecExtension),
  };
}

/**
 * Generates GeoJSON FeatureCollection of baseline extension danger wedge sectors.
 *
 * @param {object} master - Master station {lat, lng}
 * @param {Array<object>} secondaries - Secondary stations [{lat, lng, id}]
 * @param {number} [maxRadiusMeters=800000] - Sector projection length
 * @param {number} [halfWidthDeg=10] - Hazard cone half-angle
 * @returns {object} GeoJSON FeatureCollection
 */
export function generateBaselineExtensionSectors(master, secondaries, maxRadiusMeters = 800000, halfWidthDeg = 10) {
  const features = [];

  for (const sec of secondaries) {
    const bearingMtoS = initialBearing(master, sec);
    const bearingStoM = initialBearing(sec, master);

    // 1. Secondary extension wedge (projects outward from Secondary away from Master)
    const secWedgeCoords = [[sec.lng, sec.lat]];
    const startBearingSec = bearingMtoS - halfWidthDeg;
    const endBearingSec = bearingMtoS + halfWidthDeg;
    for (let b = startBearingSec; b <= endBearingSec; b += 2) {
      const pt = destinationPoint(sec, maxRadiusMeters, (b + 360) % 360);
      secWedgeCoords.push([pt.lng, pt.lat]);
    }
    secWedgeCoords.push([sec.lng, sec.lat]); // Close polygon

    features.push({
      type: 'Feature',
      properties: {
        type: 'BASELINE_EXTENSION_HAZARD',
        stationRole: 'SECONDARY',
        stationId: sec.id || sec.name,
        baseline: `${master.id || 'M'}-${sec.id || 'S'}`,
        description: `Baseline Extension Hazard Zone (${sec.id || sec.name}) — Ambiguous gradient, unusable for navigation`,
      },
      geometry: {
        type: 'Polygon',
        coordinates: [secWedgeCoords],
      },
    });

    // 2. Master extension wedge (projects outward from Master away from Secondary)
    const masterWedgeCoords = [[master.lng, master.lat]];
    const startBearingMaster = bearingStoM - halfWidthDeg;
    const endBearingMaster = bearingStoM + halfWidthDeg;
    for (let b = startBearingMaster; b <= endBearingMaster; b += 2) {
      const pt = destinationPoint(master, maxRadiusMeters, (b + 360) % 360);
      masterWedgeCoords.push([pt.lng, pt.lat]);
    }
    masterWedgeCoords.push([master.lng, master.lat]); // Close polygon

    features.push({
      type: 'Feature',
      properties: {
        type: 'BASELINE_EXTENSION_HAZARD',
        stationRole: 'MASTER',
        stationId: master.id || master.name,
        baseline: `${master.id || 'M'}-${sec.id || 'S'}`,
        description: `Baseline Extension Hazard Zone (${master.id || 'M'}) — Ambiguous gradient, unusable for navigation`,
      },
      geometry: {
        type: 'Polygon',
        coordinates: [masterWedgeCoords],
      },
    });
  }

  return {
    type: 'FeatureCollection',
    features,
  };
}
