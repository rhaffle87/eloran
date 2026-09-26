/**
 * Temporal ASF (Additional Secondary Factor) Model
 *
 * Implements atmospheric refractivity-driven propagation delay variation for
 * eLoran ground-wave signals.
 *
 * PROVENANCE:
 *   Refractivity formula (Smith & Weintraub):
 *     N = 77.6 * P/T + 3.73e5 * e_w / T^2
 *     where P = total atmospheric pressure (hPa), T = temperature (K),
 *     e_w = water vapour partial pressure (hPa).
 *     Source: Smith, E.K. & Weintraub, S. (1953), "The Constants in the
 *     Equation for Atmospheric Refractive Index at Radio Frequencies."
 *     Proceedings of the IRE, 41(8), pp. 1035–1037.
 *     (Standard formula — widely reproduced in ITU-R P.453 and IEEE Std 211.)
 *
 *   Seasonal drift / weather correlation model:
 *     Calibrated from Pearson correlation results reported in:
 *       Song, J. & Son, P. (2025). "Path-Based Correlation Analysis of
 *       Meteorological Factors and eLoran Signal Delay Variations."
 *       arXiv:2509.26020 [eess.SP]. Submitted to ICCE-Asia 2025.
 *     The study uses a 12-day Korean eLoran measurement dataset.
 *
 *   *** IMPORTANT PROVENANCE CAVEAT ***
 *   The seasonal amplitude, temperature correlation coefficient (r ≈ +0.60),
 *   and humidity correlation coefficient (r ≈ +0.40) used here are
 *   ILLUSTRATIVE — calibrated from a single 12-day Korean measurement
 *   campaign (Song & Son, 2025). They may not be representative of
 *   other geographic regions, seasons, or propagation paths. This module
 *   is NOT validated against independent experimental data.
 */

/** Speed of light in m/s */
const C = 299792458;

/**
 * Computes atmospheric radio refractivity (N-units) using the
 * Smith & Weintraub (1953) formula.
 *
 * N = 77.6 * P/T + 3.73e5 * e_w / T^2
 *
 * This is the standard formula for the LF/MF/HF atmosphere as adopted by
 * ITU-R P.453. It gives the "dry" and "wet" refractivity components.
 *
 * SOURCED: Smith & Weintraub (1953), Proc. IRE 41(8), pp. 1035–1037.
 *
 * @param {number} pressureHpa - Total atmospheric pressure (hPa)
 * @param {number} tempC - Air temperature (°C)
 * @param {number} humidityPct - Relative humidity (%)
 * @returns {number} Radio refractivity N (N-units, dimensionless × 10^-6)
 */
export function computeRefractivity(pressureHpa, tempC, humidityPct) {
  const T = tempC + 273.15; // Kelvin
  const P = pressureHpa;

  // Water vapour partial pressure via Magnus formula (hPa):
  //   e_sat = 6.1078 * 10^(7.5 * T_C / (237.3 + T_C))
  const eSat = 6.1078 * Math.pow(10, (7.5 * tempC) / (237.3 + tempC));
  const eW = (humidityPct / 100.0) * eSat;

  // Smith & Weintraub:
  const Ndry = 77.6 * (P / T);
  const Nwet = 3.73e5 * (eW / (T * T));
  return Ndry + Nwet;
}

/**
 * Standard reference refractivity at ISA sea level conditions.
 * P = 1013.25 hPa, T = 15°C, RH = 70%
 */
export const N_STANDARD = computeRefractivity(1013.25, 15.0, 70.0);

/**
 * Approximate ground-wave propagation delay (µs) for a uniform path
 * at a given refractivity.
 *
 * The refractive index n relates to N by: n = 1 + N × 10^-6.
 * Phase velocity v = c/n, so additional delay relative to free-space is:
 *
 *   Δτ = d * (n - 1) / c ≈ d * N × 10^-6 / c  (in seconds)
 *      = dist_km × 1000 × N × 10^-6 / c  (s)
 *      = dist_km × N / (c / 1000)  (µs)  — with 1/1e6 absorbed
 *
 * In µs:  Δτ_µs = dist_km × 1000 × N × 10^-6 / c × 1e6
 *               = dist_km × N / c × 1000
 *
 * @param {number} distKm - Path distance in km
 * @param {number} N - Refractivity (N-units)
 * @returns {number} Additional delay in microseconds
 */
export function refractivityDelayMicroseconds(distKm, N) {
  if (distKm <= 0) return 0;
  return (distKm * 1000.0 * N * 1e-6) / C * 1e6; // µs
}

/**
 * Seasonal drift amplitude (µs/100km) — UNVERIFIED / ILLUSTRATIVE.
 *
 * Song & Son (2025) observed TOA variations of the order of ~10–200 ns
 * with seasonal patterns over a Korean path. This amplitude is a
 * representative illustrative value; it is NOT fitted to any specific
 * numerical result in that paper.
 *
 * Marked UNVERIFIED: calibrated from a single 12-day Korean campaign.
 */
export const SEASONAL_AMPLITUDE_US_PER_100KM = 0.025; // µs / 100 km (illustrative)

/**
 * Temperature-driven drift coefficient (µs / 100km / °C deviation from 15°C).
 * Derived from Song & Son Pearson r ≈ +0.60 (temperature vs TOA).
 * The specific µs/°C/km scaling is ILLUSTRATIVE (not a direct numeric
 * result from the paper — the paper reports correlation coefficients only,
 * not explicit regression slopes).
 * Marked UNVERIFIED.
 */
export const TEMP_DRIFT_COEFF_US_PER_100KM_C = 0.002; // µs / 100 km / °C  (UNVERIFIED)

/**
 * Humidity-driven drift coefficient (µs / 100km / % deviation from 70%).
 * Derived from Song & Son Pearson r ≈ +0.40 (humidity vs TOA).
 * ILLUSTRATIVE only — paper gives correlation sign/magnitude, not regression slope.
 * Marked UNVERIFIED.
 */
export const HUMIDITY_DRIFT_COEFF_US_PER_100KM_PCT = 0.0003; // µs / 100 km / % RH  (UNVERIFIED)

/**
 * Computes the atmospheric refractivity-driven temporal ASF in microseconds.
 *
 * This includes two components:
 * 1. Refractivity delay: the additional delay from n > 1 above the reference.
 *    SOURCED (Smith & Weintraub formula).
 * 2. Seasonal / weather drift: an empirical illustrative correction based
 *    on seasonal variation and temperature/humidity deviations.
 *    UNVERIFIED — calibrated from Song & Son (2025) 12-day Korean dataset.
 *
 * @param {object} params
 * @param {number} params.distKm - Propagation path length in km (>= 0)
 * @param {number} [params.pressureHpa=1013.25] - Atmospheric pressure (hPa)
 * @param {number} [params.tempC=15.0] - Temperature (°C)
 * @param {number} [params.humidityPct=70.0] - Relative humidity (%)
 * @param {number} [params.dayOfYear=180] - Day of year (1–365) for seasonal drift
 * @param {boolean} [params.includeSeasonalDrift=true] - Whether to apply seasonal drift
 * @returns {{
 *   totalMicroseconds: number,
 *   refractivityUs: number,
 *   seasonalUs: number,
 *   weatherUs: number,
 *   N: number,
 *   provenance: {refractivity: string, seasonal: string}
 * }}
 */
export function computeTemporalAsfMicroseconds({
  distKm,
  pressureHpa = 1013.25,
  tempC = 15.0,
  humidityPct = 70.0,
  dayOfYear = 180,
  includeSeasonalDrift = true,
}) {
  if (distKm <= 0) {
    return {
      totalMicroseconds: 0,
      refractivityUs: 0,
      seasonalUs: 0,
      weatherUs: 0,
      N: N_STANDARD,
      provenance: {
        refractivity: 'SOURCED (Smith & Weintraub 1953)',
        seasonal: 'UNVERIFIED (Song & Son 2025, 12-day Korean dataset)',
      },
    };
  }

  // 1. Refractivity component (SOURCED: Smith & Weintraub)
  const N = computeRefractivity(pressureHpa, tempC, humidityPct);
  const deltaN = N - N_STANDARD;
  const refractivityUs = refractivityDelayMicroseconds(distKm, deltaN);

  // 2. Seasonal drift (UNVERIFIED: illustrative from Song & Son 2025)
  let seasonalUs = 0;
  let weatherUs = 0;

  if (includeSeasonalDrift) {
    // Peak in summer (day ~172 = June 21), trough in winter
    const seasonPhase = (2 * Math.PI * (dayOfYear - 172)) / 365;
    seasonalUs = SEASONAL_AMPLITUDE_US_PER_100KM * (distKm / 100) * Math.sin(seasonPhase);

    // Temperature deviation from 15°C reference
    const deltaTempC = tempC - 15.0;
    const deltaHumidPct = humidityPct - 70.0;
    weatherUs =
      TEMP_DRIFT_COEFF_US_PER_100KM_C * (distKm / 100) * deltaTempC +
      HUMIDITY_DRIFT_COEFF_US_PER_100KM_PCT * (distKm / 100) * deltaHumidPct;
  }

  const totalMicroseconds = refractivityUs + seasonalUs + weatherUs;

  return {
    totalMicroseconds,
    refractivityUs,
    seasonalUs,
    weatherUs,
    N,
    provenance: {
      refractivity: 'SOURCED (Smith & Weintraub 1953, Proc. IRE 41:8)',
      seasonal: 'UNVERIFIED — illustrative; calibrated from Song & Son (2025) arXiv:2509.26020, 12-day Korean eLoran dataset',
    },
  };
}

/**
 * Converts temporal ASF in microseconds to meters.
 * @param {number} us - Delay in microseconds
 * @returns {number} Equivalent path length error in meters
 */
export function temporalAsfUsToMeters(us) {
  return us * 1e-6 * C;
}

/**
 * Standard ISA conditions for reference.
 * Useful for UI defaults.
 */
export const STANDARD_ATMOSPHERE = {
  pressureHpa: 1013.25,
  tempC: 15.0,
  humidityPct: 70.0,
};
