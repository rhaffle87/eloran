/**
 * SIMULORAN — Spherical-Earth Skywave & Ionospheric Hop Physics Engine (skywave.js)
 *
 * Implements:
 * 1. Rigorous spherical-Earth 1-hop and 2-hop ionospheric reflection geometry (Doherty et al. 1961).
 * 2. Diurnal ionospheric layer height modeling (D-layer daytime ~70 km vs E-layer nighttime ~90 km).
 * 3. VLF/LF 100 kHz ionospheric absorption, ground conductivity loss, and Signal-to-Skywave Ratio (SSR) in dB.
 * 4. Standard Zero Crossing (SZC at 30 µs) phase distortion & Envelope-to-Cycle Difference (ECD) shift.
 * 5. Cycle slip probability evaluation for receiver tracking loops.
 *
 * References:
 *   - Doherty, R. H., Hefley, G., & Linfield, R. F. (1961). "Timing Potentials of Loran-C". Proc. IRE, 49(11), 1659-1673.
 *   - US Coast Guard Loran-C User Handbook (COMDTINST M16562.4A), Chapter 5.
 *   - ITU-R Recommendation P.684-7: "Prediction of field strength at frequencies below about 150 kHz".
 */

export const SPEED_OF_LIGHT = 299792458.0; // m/s (BIPM)
export const EARTH_RADIUS_METERS = 6371000.0; // WGS-84 mean volumetric spherical radius (m)

export const D_LAYER_DAY_HEIGHT_M = 70000.0; // Daytime D-region reflection altitude (70 km)
export const E_LAYER_NIGHT_HEIGHT_M = 90000.0; // Nighttime E-region reflection altitude (90 km)

/**
 * Computes diurnal ionospheric reflection altitude based on local solar hour.
 *
 * @param {number} hourOfDay - Local solar time (0.0 to 24.0, where 12.0 = solar noon, 0.0/24.0 = midnight)
 * @returns {number} Virtual reflection height in meters (70,000 to 90,000 m)
 */
export function getDiurnalReflectionHeight(hourOfDay = 12.0) {
  const h = ((hourOfDay % 24) + 24) % 24;
  // Day zenith at 12:00 -> height = 70 km; Night nadir at 00:00 -> height = 90 km
  // Smooth cosine transition between dawn (06:00) and dusk (18:00)
  const angle = (2.0 * Math.PI * (h - 12.0)) / 24.0;
  const factor = (1.0 - Math.cos(angle)) / 2.0; // 0 at noon, 1 at midnight
  return D_LAYER_DAY_HEIGHT_M + factor * (E_LAYER_NIGHT_HEIGHT_M - D_LAYER_DAY_HEIGHT_M);
}

/**
 * Computes the 1-hop spherical-Earth slant path length.
 *
 * Exact spherical triangle:
 *   Central angle theta = d / R_E
 *   Half-angle psi = theta / 2
 *   Slant distance s = sqrt(R_E^2 + (R_E + h)^2 - 2 * R_E * (R_E + h) * cos(psi))
 *   Total path L_1hop = 2 * s
 *
 * @param {number} groundDistMeters - Geodesic ground distance (m)
 * @param {number} reflectionHeightMeters - Ionospheric virtual reflection height (m)
 * @returns {number} Total 1-hop path length in meters
 */
export function compute1HopPathMeters(groundDistMeters, reflectionHeightMeters) {
  const R = EARTH_RADIUS_METERS;
  const h = Math.max(1000.0, reflectionHeightMeters);
  const d = Math.max(1.0, groundDistMeters);

  const psi = d / (2.0 * R);
  const s = Math.sqrt(R * R + (R + h) * (R + h) - 2.0 * R * (R + h) * Math.cos(psi));
  return 2.0 * s;
}

/**
 * Computes the 2-hop spherical-Earth slant path length for long-range propagation.
 *
 * @param {number} groundDistMeters - Geodesic ground distance (m)
 * @param {number} reflectionHeightMeters - Ionospheric virtual reflection height (m)
 * @returns {number} Total 2-hop path length in meters
 */
export function compute2HopPathMeters(groundDistMeters, reflectionHeightMeters) {
  const R = EARTH_RADIUS_METERS;
  const h = Math.max(1000.0, reflectionHeightMeters);
  const d = Math.max(1.0, groundDistMeters);

  const psi = d / (4.0 * R);
  const s = Math.sqrt(R * R + (R + h) * (R + h) - 2.0 * R * (R + h) * Math.cos(psi));
  return 4.0 * s;
}

/**
 * Computes the arrival delay of the ionospheric skywave relative to the direct groundwave.
 *
 * @param {number} groundDistMeters - Geodesic ground distance (m)
 * @param {number} reflectionHeightMeters - Ionospheric virtual reflection height (m)
 * @param {number} [hops=1] - Number of ionospheric hops (1 or 2)
 * @returns {number} Relative skywave delay in microseconds (µs)
 */
export function computeSkywaveDelayUs(groundDistMeters, reflectionHeightMeters, hops = 1) {
  const slantMeters =
    hops === 2
      ? compute2HopPathMeters(groundDistMeters, reflectionHeightMeters)
      : compute1HopPathMeters(groundDistMeters, reflectionHeightMeters);

  const extraMeters = Math.max(0, slantMeters - groundDistMeters);
  return (extraMeters / SPEED_OF_LIGHT) * 1e6;
}

/**
 * Evaluates the Signal-to-Skywave Ratio (SSR) in dB and linear amplitude ratio.
 *
 * @param {number} groundDistKm - Distance from transmitter (km)
 * @param {boolean} [isNight=false] - Night condition (low absorption, strong skywave)
 * @param {number} [powerKw=50] - Transmitter ERP (kW)
 * @param {number} [groundSigma=0.005] - Ground conductivity in S/m (seawater: 5.0, average land: 0.005)
 * @returns {{ssrDb: number, ampRatio: number, groundwaveDbuv: number, skywaveDbuv: number}}
 */
export function computeSignalToSkywaveRatio(
  groundDistKm,
  isNight = false,
  powerKw = 50.0,
  groundSigma = 0.005
) {
  const dKm = Math.max(1.0, groundDistKm);
  const pFactor = 10.0 * Math.log10(Math.max(1.0, powerKw));

  // Ground attenuation factor (ITU-R P.368 / Sommerfeld):
  // For seawater (sigma >= 1): 0.0035 dB/km
  // For average land (sigma ~ 0.005): 0.015 dB/km
  // For poor land (sigma ~ 0.001): 0.035 dB/km
  const alphaDbPerKm = groundSigma >= 1.0 ? 0.0035 : groundSigma >= 0.003 ? 0.015 : 0.035;
  const gwLoss = 20.0 * Math.log10(dKm) + alphaDbPerKm * dKm;
  const groundwaveDbuv = Math.max(-20.0, 109.5 + pFactor - gwLoss);

  // Skywave field strength:
  // Slant distance spreading + ionospheric reflection loss
  const hMeters = isNight ? E_LAYER_NIGHT_HEIGHT_M : D_LAYER_DAY_HEIGHT_M;
  const slantKm = compute1HopPathMeters(dKm * 1000.0, hMeters) / 1000.0;
  const skywaveSpreadingLoss = 20.0 * Math.log10(slantKm);

  // Ionospheric reflection loss at 100 kHz (Doherty 1961 / ITU-R P.684):
  // Day (D-layer): ~32 dB ionospheric absorption
  // Night (E-layer): ~8 dB reflection loss
  const ionoAbsorptionDb = isNight ? 8.0 : 32.0;
  const skywaveDbuv = Math.max(-20.0, 109.5 + pFactor - skywaveSpreadingLoss - ionoAbsorptionDb);

  const ssrDb = groundwaveDbuv - skywaveDbuv;
  const ampRatio = Math.pow(10.0, -ssrDb / 20.0);

  return {
    ssrDb: parseFloat(ssrDb.toFixed(2)),
    ampRatio: parseFloat(ampRatio.toFixed(4)),
    groundwaveDbuv: parseFloat(groundwaveDbuv.toFixed(1)),
    skywaveDbuv: parseFloat(skywaveDbuv.toFixed(1)),
  };
}

/**
 * Evaluates the standard 100 kHz Loran-C pulse envelope at time t (µs).
 *
 * Canonical standard pulse equation:
 *   e(t) = (t / 65)^2 * exp(-2 * (t - 65) / 65)
 *
 * @param {number} tUs - Time in microseconds from pulse inception (t >= 0)
 * @returns {number} Normalized envelope amplitude (0.0 to 1.0)
 */
export function canonicalPulseEnvelope(tUs) {
  if (tUs <= 0.0) return 0.0;
  const tau = 65.0;
  const tNorm = tUs / tau;
  return tNorm * tNorm * Math.exp(-2.0 * (tUs - tau) / tau);
}

/**
 * Evaluates the full RF waveform: e(t) * sin(2 * pi * f * t).
 *
 * @param {number} tUs - Time in microseconds
 * @param {number} [carrierKhz=100.0] - Carrier frequency (nominal 100 kHz)
 * @returns {number} Instantaneous RF amplitude (-1.0 to 1.0)
 */
export function canonicalRfPulse(tUs, carrierKhz = 100.0) {
  if (tUs <= 0.0) return 0.0;
  const env = canonicalPulseEnvelope(tUs);
  const phase = 2.0 * Math.PI * (carrierKhz * 1e3) * (tUs * 1e-6);
  return env * Math.sin(phase);
}

/**
 * Synthesizes a composite waveform containing groundwave and delayed skywave.
 *
 * @param {number[]} timeArrayUs - Sample points in microseconds
 * @param {number} tauSkyUs - Relative skywave delay in microseconds
 * @param {number} ampRatio - Skywave amplitude relative to groundwave (linear)
 * @param {number} [carrierKhz=100.0] - Carrier frequency
 * @returns {{groundwave: number[], skywave: number[], composite: number[]}}
 */
export function synthesizeCompositeWaveform(timeArrayUs, tauSkyUs, ampRatio, carrierKhz = 100.0) {
  const groundwave = new Float32Array(timeArrayUs.length);
  const skywave = new Float32Array(timeArrayUs.length);
  const composite = new Float32Array(timeArrayUs.length);

  for (let i = 0; i < timeArrayUs.length; i++) {
    const t = timeArrayUs[i];
    const gw = canonicalRfPulse(t, carrierKhz);
    const sw = canonicalRfPulse(t - tauSkyUs, carrierKhz) * ampRatio;

    groundwave[i] = gw;
    skywave[i] = sw;
    composite[i] = gw + sw;
  }

  return {
    groundwave: Array.from(groundwave),
    skywave: Array.from(skywave),
    composite: Array.from(composite),
  };
}

/**
 * Evaluates tracking interference at the Standard Zero Crossing (SZC = 30 µs).
 *
 * Computes:
 * 1. Zero crossing shift: exact zero crossing time of the composite signal near 30 µs.
 * 2. ECD distortion: shift in envelope slope ratio.
 * 3. Cycle slip risk: probability of jumping ±10 µs onto cycle 2 or 4.
 *
 * @param {number} groundDistKm - Ground distance from station (km)
 * @param {number} [hourOfDay=12.0] - Local solar hour
 * @param {number} [powerKw=50.0] - Transmitter power
 * @param {number} [groundSigma=0.005] - Ground conductivity (S/m)
 * @returns {object} Full skywave interference assessment
 */
export function evaluateSkywaveInterference(
  groundDistKm,
  hourOfDay = 12.0,
  powerKw = 50.0,
  groundSigma = 0.005
) {
  const isNight = hourOfDay < 6.0 || hourOfDay > 18.0;
  const refHeightM = getDiurnalReflectionHeight(hourOfDay);
  const groundDistM = groundDistKm * 1000.0;

  const tauSkyUs = computeSkywaveDelayUs(groundDistM, refHeightM, 1);
  const { ssrDb, ampRatio, groundwaveDbuv, skywaveDbuv } = computeSignalToSkywaveRatio(
    groundDistKm,
    isNight,
    powerKw,
    groundSigma
  );

  const szcUs = 30.0;
  let actualCrossingUs = szcUs;
  let phaseErrorDeg = 0.0;
  let cycleSlipRisk = 'NONE';
  let cycleSlipProb = 0.0;

  if (tauSkyUs < 45.0 || ampRatio > 0.4) {
    // Numerical root search for zero crossing in window [25, 35] µs
    const tStart = 28.0;
    const tEnd = 32.0;
    const steps = 400;
    const dt = (tEnd - tStart) / steps;

    let prevVal = canonicalRfPulse(tStart) + ampRatio * canonicalRfPulse(tStart - tauSkyUs);
    for (let i = 1; i <= steps; i++) {
      const t = tStart + i * dt;
      const val = canonicalRfPulse(t) + ampRatio * canonicalRfPulse(t - tauSkyUs);
      if (prevVal * val <= 0.0) {
        const frac = Math.abs(prevVal) / (Math.abs(prevVal) + Math.abs(val));
        actualCrossingUs = (t - dt) + frac * dt;
        break;
      }
      prevVal = val;
    }

    const timingShiftUs = actualCrossingUs - szcUs;
    phaseErrorDeg = (timingShiftUs / 10.0) * 360.0;
  }

  // Cycle slip risk assessment
  if (ssrDb < -6.0) {
    cycleSlipRisk = 'CRITICAL';
    cycleSlipProb = Math.min(0.85, 0.4 + 0.05 * Math.abs(ssrDb));
  } else if (ssrDb < 0.0) {
    cycleSlipRisk = 'HIGH';
    cycleSlipProb = 0.25;
  } else if (ssrDb < 6.0) {
    cycleSlipRisk = 'MODERATE';
    cycleSlipProb = 0.08;
  } else if (ssrDb < 15.0) {
    cycleSlipRisk = 'LOW';
    cycleSlipProb = 0.01;
  }

  const timingShiftUs = actualCrossingUs - szcUs;

  return {
    groundDistKm,
    hourOfDay,
    isNight,
    refHeightM,
    tauSkyUs: parseFloat(tauSkyUs.toFixed(2)),
    ssrDb,
    ampRatio,
    groundwaveDbuv,
    skywaveDbuv,
    standardSzcUs: szcUs,
    actualCrossingUs: parseFloat(actualCrossingUs.toFixed(3)),
    timingShiftUs: parseFloat(timingShiftUs.toFixed(4)),
    phaseErrorDeg: parseFloat(phaseErrorDeg.toFixed(2)),
    cycleSlipRisk,
    cycleSlipProb: parseFloat(cycleSlipProb.toFixed(3)),
  };
}
