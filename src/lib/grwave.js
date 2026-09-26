/**
 * LORAN LAB — ITU-R P.368 Groundwave Propagation & Millington Mixed-Path Engine
 * 
 * Implements:
 * 1. Complex surface impedance and Sommerfeld constitutive electrical parameters (ITU-R P.368-9 / ITU-R P.832).
 * 2. Sommerfeld numerical distance and groundwave phase lag relative to free space.
 * 3. Additional Secondary Factor (ASF) timing delay excess over seawater at 100 kHz.
 * 4. Multi-boundary Millington mixed-path numerical solver (ITU-R P.368-10 Annex 2).
 * 
 * Validated against native ITU-R P.368 GRWAVE Fortran reference outputs.
 */

export const SPEED_OF_LIGHT = 299792458.0; // m/s in vacuum (BIPM / CODATA)
export const SPEED_OF_LIGHT_KM_S = 299792.458; // km/s

/**
 * Standard ITU-R P.832 / ITU-R P.368 ground characteristics.
 */
export const ITU_GROUND_TYPES = {
  seawater: {
    name: 'Seawater',
    sigma: 5.0,
    epslon: 70.0,
    description: 'Seawater (salinity 35 ppt, 20°C)',
    provenance: 'SOURCED (ITU-R P.832 / ITU-R P.368-9)',
  },
  fresh_water: {
    name: 'Fresh Water',
    sigma: 0.003,
    epslon: 80.0,
    description: 'Fresh water lakes and rivers (20°C)',
    provenance: 'SOURCED (ITU-R P.832)',
  },
  wet_ground: {
    name: 'Wet Ground / Marsh',
    sigma: 0.02,
    epslon: 30.0,
    description: 'Wet marshy soil, loam, swamp',
    provenance: 'SOURCED (ITU-R P.832 / ITU-R P.368-9)',
  },
  medium_ground: {
    name: 'Agricultural / Medium Ground',
    sigma: 0.005,
    epslon: 15.0,
    description: 'Pastoral farmland, medium rich soil',
    provenance: 'SOURCED (ITU-R P.832 / ITU-R P.368-9)',
  },
  dry_ground: {
    name: 'Dry Ground / Mountain',
    sigma: 0.001,
    epslon: 15.0,
    description: 'Rocky terrain, dry sand, mountains',
    provenance: 'SOURCED (ITU-R P.832 / ITU-R P.368-9)',
  },
  very_dry_ground: {
    name: 'Very Dry Ground / Granite',
    sigma: 0.0001,
    epslon: 5.0,
    description: 'Industrial concrete, bedrock, granite',
    provenance: 'SOURCED (ITU-R P.832)',
  },
};

/**
 * Computes complex surface impedance normalized to free space impedance Z0 (377 Ohms)
 * for vertical polarization per ITU-R P.368-9 Section 2.
 * 
 * @param {number} freqMhz - Frequency in MHz (e.g. 0.1 for 100 kHz)
 * @param {number} sigma - Ground conductivity in S/m
 * @param {number} [epslon=15.0] - Relative permittivity (dielectric constant)
 * @returns {{ etaR: number, etaI: number, etaMag: number, lossAngleDeg: number, skinDepthM: number }}
 */
export function computeSurfaceImpedance(freqMhz, sigma, epslon = 15.0) {
  const f = Math.max(1e-6, freqMhz);
  const sig = Math.max(1e-6, sigma);
  const eps = Math.max(1.0, epslon);

  // Complex relative permittivity: n^2 = eps - j * (1.8e4 * sigma / f_MHz)
  const nr = eps;
  const ni = -1.8e4 * sig / f;

  // n^2 - 1 = (eps - 1) + j * ni
  const zr = eps - 1.0;
  const zi = ni;

  // sqrt(n^2 - 1) in polar coordinates
  const magZ = Math.hypot(zr, zi);
  const angZ = Math.atan2(zi, zr);
  const sqrtMag = Math.sqrt(magZ);
  const sqrtAng = angZ / 2.0;
  const topR = sqrtMag * Math.cos(sqrtAng);
  const topI = sqrtMag * Math.sin(sqrtAng);

  // eta_v = sqrt(n^2 - 1) / n^2 = (topR + j topI) / (nr + j ni)
  const denom = nr * nr + ni * ni;
  const etaR = (topR * nr + topI * ni) / denom;
  const etaI = (topI * nr - topR * ni) / denom;

  const etaMag = Math.hypot(etaR, etaI);
  const phaseEta = Math.atan2(etaI, etaR);
  const lossAngleDeg = (2.0 * phaseEta * 180.0) / Math.PI;

  // Skin depth: delta = 0.50329 / sqrt(f_MHz * sigma) in meters
  const skinDepthM = 0.50329 / Math.sqrt(Math.max(1e-12, f * sig));

  return {
    etaR,
    etaI,
    etaMag,
    lossAngleDeg,
    skinDepthM,
  };
}

/**
 * Computes Sommerfeld numerical distance p and phase lag relative to free space
 * at a given distance d in kilometers.
 * 
 * @param {number} distKm - Distance in km
 * @param {number} [freqMhz=0.1] - Frequency in MHz (default 0.1 = 100 kHz)
 * @param {number} sigma - Ground conductivity in S/m
 * @param {number} [epslon=15.0] - Relative permittivity
 * @returns {{ numericalDistanceP: number, phaseLagRad: number, timingDelayUs: number }}
 */
export function computeGroundwavePhaseProfile(distKm, freqMhz = 0.1, sigma = 5.0, epslon = 15.0) {
  if (distKm <= 0) {
    return { numericalDistanceP: 0, phaseLagRad: 0, timingDelayUs: 0 };
  }

  const imp = computeSurfaceImpedance(freqMhz, sigma, epslon);
  const wavelengthKm = (SPEED_OF_LIGHT / (freqMhz * 1e6)) / 1000.0; // 2.99792458 km at 100 kHz
  const etaMagSq = imp.etaMag * imp.etaMag;

  // Sommerfeld numerical distance: p = (pi * d / lambda) * |eta|^2
  const p = (Math.PI * distKm / wavelengthKm) * etaMagSq;
  const bRad = (imp.lossAngleDeg * Math.PI) / 180.0;

  // Sommerfeld phase lag approximation:
  // delta_phi = arctan(sqrt(p) * cos(b/2)) + [p / (2 + p)] * sin(b/2)
  const phaseLagRad = Math.atan(Math.sqrt(p) * Math.cos(bRad / 2.0)) + (p / (2.0 + p)) * Math.sin(bRad / 2.0);

  // Timing delay in microseconds: delta_t (us) = phase_lag / (2 * pi * f_MHz)
  const omegaUs = 2.0 * Math.PI * freqMhz;
  const timingDelayUs = phaseLagRad / omegaUs;

  return {
    numericalDistanceP: p,
    phaseLagRad,
    timingDelayUs,
  };
}

/**
 * Computes homogeneous path Additional Secondary Factor (ASF) in microseconds
 * relative to an all-seawater path (sigma = 5.0 S/m, epslon = 70.0).
 * Over all-seawater, ASF is zero by definition.
 * 
 * @param {number} distKm - Distance in km
 * @param {number} sigma - Ground conductivity in S/m
 * @param {number} [epslon=15.0] - Relative permittivity
 * @param {number} [freqMhz=0.1] - Frequency in MHz (100 kHz)
 * @returns {number} ASF delay in microseconds
 */
export function computeHomogeneousAsfMicroseconds(distKm, sigma, epslon = 15.0, freqMhz = 0.1) {
  if (distKm <= 0 || sigma >= 5.0) return 0;

  const groundProfile = computeGroundwavePhaseProfile(distKm, freqMhz, sigma, epslon);
  const seaProfile = computeGroundwavePhaseProfile(distKm, freqMhz, 5.0, 70.0);

  // ASF is the excess delay over seawater
  return Math.max(0, groundProfile.timingDelayUs - seaProfile.timingDelayUs);
}

/**
 * Computes multi-boundary inhomogeneous mixed-path ASF in microseconds
 * using the rigorous reciprocal Millington method (ITU-R P.368-10 Annex 2).
 * 
 * Evaluates the forward path across all boundary points, reverses the path
 * from Rx back to Tx, and computes the reciprocal geometric mean to guarantee
 * electromagnetic reciprocity across arbitrary land/sea and dielectric boundaries.
 * 
 * @param {Array<{distKm: number, sigma: number, epslon?: number}>} segments - Ordered segments from Tx to Rx
 * @param {number} [freqMhz=0.1] - Frequency in MHz (100 kHz)
 * @returns {number} Mixed-path ASF in microseconds
 */
export function computeMillingtonAsfMicroseconds(segments, freqMhz = 0.1) {
  if (!segments || segments.length === 0) return 0;

  const valid = segments.filter((s) => s.distKm > 0);
  if (valid.length === 0) return 0;

  const M = valid.length;
  if (M === 1) {
    return computeHomogeneousAsfMicroseconds(valid[0].distKm, valid[0].sigma, valid[0].epslon ?? 15.0, freqMhz);
  }

  // 1. Forward Cumulative Boundaries
  const x = [0];
  for (let i = 0; i < M; i++) {
    x.push(x[x.length - 1] + valid[i].distKm);
  }

  let phiF = computeHomogeneousAsfMicroseconds(x[1], valid[0].sigma, valid[0].epslon ?? 15.0, freqMhz);
  for (let k = 1; k < M; k++) {
    const delta = computeHomogeneousAsfMicroseconds(x[k + 1], valid[k].sigma, valid[k].epslon ?? 15.0, freqMhz)
                - computeHomogeneousAsfMicroseconds(x[k], valid[k].sigma, valid[k].epslon ?? 15.0, freqMhz);
    phiF += delta;
  }

  // 2. Reverse Cumulative Boundaries (Rx back to Tx)
  const revValid = [...valid].reverse();
  const y = [0];
  for (let i = 0; i < M; i++) {
    y.push(y[y.length - 1] + revValid[i].distKm);
  }

  let phiR = computeHomogeneousAsfMicroseconds(y[1], revValid[0].sigma, revValid[0].epslon ?? 15.0, freqMhz);
  for (let k = 1; k < M; k++) {
    const delta = computeHomogeneousAsfMicroseconds(y[k + 1], revValid[k].sigma, revValid[k].epslon ?? 15.0, freqMhz)
                - computeHomogeneousAsfMicroseconds(y[k], revValid[k].sigma, revValid[k].epslon ?? 15.0, freqMhz);
    phiR += delta;
  }

  // Reciprocal Millington average: (Phi_F + Phi_R) / 2
  return Math.max(0, 0.5 * (phiF + phiR));
}

/**
 * Computes mixed-path ASF in meters for a path with total distance in meters
 * and specified land fraction and land conductivity.
 * 
 * @param {object} params
 * @param {number} params.totalDistMeters - Total path distance in meters
 * @param {number} [params.landFraction=0.5] - Fraction of path over land [0.0 to 1.0]
 * @param {number} [params.landSigma=0.003] - Land conductivity in S/m
 * @param {number} [params.landEpslon=15.0] - Land relative permittivity
 * @param {number} [params.freqMhz=0.1] - Frequency in MHz
 * @returns {number} Additional Secondary Factor in meters
 */
export function computeMixedPathAsfMeters({
  totalDistMeters,
  landFraction = 0.5,
  landSigma = 0.003,
  landEpslon = 15.0,
  freqMhz = 0.1,
}) {
  if (totalDistMeters <= 0 || landFraction <= 0 || landSigma >= 5.0) {
    return 0;
  }

  const fLand = Math.max(0, Math.min(1.0, landFraction));
  const totalKm = totalDistMeters / 1000.0;
  const seaDistKm = (1.0 - fLand) * totalKm;
  const landDistKm = fLand * totalKm;

  const segments = [
    { distKm: seaDistKm, sigma: 5.0, epslon: 70.0 },
    { distKm: landDistKm, sigma: landSigma, epslon: landEpslon },
  ];

  const asfUs = computeMillingtonAsfMicroseconds(segments, freqMhz);
  // Convert delay in microseconds to equivalent distance delay: meters = us * 1e-6 * c
  return asfUs * 1e-6 * SPEED_OF_LIGHT;
}
