/**
 * 6-State Kinematic Extended Kalman Filter (EKF) for SIMULORAN
 * Sourced from standard aerospace and maritime PNT Kalman filtering specifications:
 * State vector: x = [x, y, vx, vy, c*b_rx, c*dot{b}_rx]^T
 * - x, y: Position offsets (meters) relative to local tangent plane reference
 * - vx, vy: Ground velocity components (m/s)
 * - c*b_rx: Receiver clock bias in distance equivalent (meters)
 * - c*dot{b}_rx: Receiver clock drift in velocity equivalent (m/s)
 *
 * Implements Discrete White Noise Acceleration (DWNA) process dynamics,
 * sequential scalar measurement updates for numerical stability without matrix inversion,
 * and Chi-square Normalized Innovation Squared (NIS) gating for autonomous cycle-slip rejection.
 */

import {
  latLngToLocalXY,
  localXYToLatLng,
  SPEED_OF_LIGHT,
} from './geodesy.js';

export const DEFAULT_EKF_CONFIG = {
  qv: 0.05,        // Acceleration process noise spectral density (m^2/s^3) - marine vessel standard
  qb: 0.01,        // Clock bias phase noise spectral density (m^2/s)
  qd: 0.001,       // Clock drift frequency noise spectral density (m^2/s^3)
  nisGate: 16.0,   // Chi-Square 1-DOF gating threshold (16.0 corresponds to 4-sigma outlier rejection)
  initialPosVar: 2500, // (50m)^2 initial position variance
  initialVelVar: 100,  // (10m/s)^2 initial velocity variance
  initialCbVar: 10000, // (100m)^2 initial clock bias variance
  initialCdbVar: 100,  // (10m/s)^2 initial clock drift variance
};

/**
 * 6-State Extended Kalman Filter for eLoran / Multilateration Kinematic Tracking
 */
export class EkfEstimator {
  /**
   * @param {number} initialLat - Reference origin latitude in degrees
   * @param {number} initialLng - Reference origin longitude in degrees
   * @param {Object} [options] - Configuration overrides
   */
  constructor(initialLat, initialLng, options = {}) {
    this.refLat = Number(initialLat);
    this.refLng = Number(initialLng);

    const cfg = { ...DEFAULT_EKF_CONFIG, ...options };
    this.qv = cfg.qv;
    this.qb = cfg.qb;
    this.qd = cfg.qd;
    this.nisGate = cfg.nisGate;

    // State vector: [x, y, vx, vy, cb, cdb]
    this.x = new Float64Array(6);

    // Initial covariance matrix P (6x6)
    this.P = Array.from({ length: 6 }, () => new Float64Array(6));
    this.P[0][0] = cfg.initialPosVar;
    this.P[1][1] = cfg.initialPosVar;
    this.P[2][2] = cfg.initialVelVar;
    this.P[3][3] = cfg.initialVelVar;
    this.P[4][4] = cfg.initialCbVar;
    this.P[5][5] = cfg.initialCdbVar;

    this.lastPredictDt = 0;
    this.totalRejectedCount = 0;
    this.stepCount = 0;
  }

  /**
   * Resets the filter state at given coordinates.
   * @param {number} lat
   * @param {number} lng
   * @param {number} [clockBiasSec=0]
   */
  reset(lat, lng, clockBiasSec = 0) {
    this.refLat = Number(lat);
    this.refLng = Number(lng);
    this.x.fill(0);
    this.x[4] = clockBiasSec * SPEED_OF_LIGHT;

    for (let r = 0; r < 6; r++) {
      this.P[r].fill(0);
    }
    this.P[0][0] = DEFAULT_EKF_CONFIG.initialPosVar;
    this.P[1][1] = DEFAULT_EKF_CONFIG.initialPosVar;
    this.P[2][2] = DEFAULT_EKF_CONFIG.initialVelVar;
    this.P[3][3] = DEFAULT_EKF_CONFIG.initialVelVar;
    this.P[4][4] = DEFAULT_EKF_CONFIG.initialCbVar;
    this.P[5][5] = DEFAULT_EKF_CONFIG.initialCdbVar;

    this.totalRejectedCount = 0;
    this.stepCount = 0;
  }

  /**
   * Kalman Time Update (Prediction Step)
   * Advances the kinematic state by dt seconds using continuous white noise acceleration dynamics.
   * @param {number} dt - Step duration in seconds
   */
  predict(dt) {
    if (typeof dt !== 'number' || dt <= 0 || !Number.isFinite(dt)) return;

    this.lastPredictDt = dt;
    const dt2 = dt * dt;
    const dt3 = dt2 * dt;

    // 1. State prediction: x_k = F * x_{k-1}
    this.x[0] += this.x[2] * dt;
    this.x[1] += this.x[3] * dt;
    this.x[4] += this.x[5] * dt;

    // 2. Process noise covariance Q(dt)
    const Q = Array.from({ length: 6 }, () => new Float64Array(6));
    const qv = this.qv;
    Q[0][0] = (qv * dt3) / 3;
    Q[0][2] = (qv * dt2) / 2;
    Q[1][1] = (qv * dt3) / 3;
    Q[1][3] = (qv * dt2) / 2;
    Q[2][0] = (qv * dt2) / 2;
    Q[2][2] = qv * dt;
    Q[3][1] = (qv * dt2) / 2;
    Q[3][3] = qv * dt;

    Q[4][4] = this.qb * dt + (this.qd * dt3) / 3;
    Q[4][5] = (this.qd * dt2) / 2;
    Q[5][4] = (this.qd * dt2) / 2;
    Q[5][5] = this.qd * dt;

    // 3. Covariance prediction: P = F * P * F^T + Q
    // Structure of F:
    // F[0][2] = dt, F[1][3] = dt, F[4][5] = dt, with 1 on diagonal
    const FP = Array.from({ length: 6 }, () => new Float64Array(6));
    for (let c = 0; c < 6; c++) {
      FP[0][c] = this.P[0][c] + dt * this.P[2][c];
      FP[1][c] = this.P[1][c] + dt * this.P[3][c];
      FP[2][c] = this.P[2][c];
      FP[3][c] = this.P[3][c];
      FP[4][c] = this.P[4][c] + dt * this.P[5][c];
      FP[5][c] = this.P[5][c];
    }

    for (let r = 0; r < 6; r++) {
      this.P[r][0] = FP[r][0] + dt * FP[r][2] + Q[r][0];
      this.P[r][1] = FP[r][1] + dt * FP[r][3] + Q[r][1];
      this.P[r][2] = FP[r][2] + Q[r][2];
      this.P[r][3] = FP[r][3] + Q[r][3];
      this.P[r][4] = FP[r][4] + dt * FP[r][5] + Q[r][4];
      this.P[r][5] = FP[r][5] + Q[r][5];
    }

    // Ensure symmetry
    for (let r = 0; r < 6; r++) {
      for (let c = r + 1; c < 6; c++) {
        const avg = 0.5 * (this.P[r][c] + this.P[c][r]);
        this.P[r][c] = avg;
        this.P[c][r] = avg;
      }
    }
  }

  /**
   * Kalman Measurement Update for Pseudoranges
   * Uses sequential scalar updates with Chi-Square NIS outlier rejection.
   * @param {Array<Object>} observations - Array of station pseudorange measurements
   * @returns {Object} Update diagnostics { validObs, rejectedCount, meanNis }
   */
  updatePseudoranges(observations) {
    if (!Array.isArray(observations) || observations.length === 0) {
      return { validObs: 0, rejectedCount: 0, meanNis: 0 };
    }

    let rejectedCount = 0;
    let sumNis = 0;
    let validObs = 0;

    const uRef = latLngToLocalXY(this.refLat, this.refLng, this.refLat);

    for (const obs of observations) {
      if (!obs || !obs.station) continue;

      const st = obs.station;
      const sxy = latLngToLocalXY(st.lat, st.lng, this.refLat);
      const stRelX = sxy.x - uRef.x;
      const stRelY = sxy.y - uRef.y;

      const dx = this.x[0] - stRelX;
      const dy = this.x[1] - stRelY;
      const geomDist = Math.max(1.0, Math.hypot(dx, dy));

      const asfMeters = typeof st.asfMeters === 'number' ? st.asfMeters : 0;
      const diffMeters = (st.diffCorrections && st.diffCorrections.enabled)
        ? (st.diffCorrections.avgMeters || 0)
        : 0;

      // Modeled pseudorange: rho = geometric + ASF - diff + c * b_rx
      const modeledPseudo = geomDist + asfMeters - diffMeters + this.x[4];
      const residual = obs.pseudorangeMeters - modeledPseudo;

      // Jacobian row h = [dx/geomDist, dy/geomDist, 0, 0, 1, 0]
      const ux = dx / geomDist;
      const uy = dy / geomDist;
      const h = new Float64Array([ux, uy, 0, 0, 1.0, 0]);

      // Innovation variance: s = h * P * h^T + R
      const sigma = typeof obs.sigmaMeters === 'number' && obs.sigmaMeters > 0 ? obs.sigmaMeters : 15.0;
      const R = sigma * sigma;

      const Ph = new Float64Array(6);
      for (let r = 0; r < 6; r++) {
        let sum = 0;
        for (let c = 0; c < 6; c++) {
          sum += this.P[r][c] * h[c];
        }
        Ph[r] = sum;
      }

      let hPh = 0;
      for (let c = 0; c < 6; c++) {
        hPh += h[c] * Ph[c];
      }
      const s = Math.max(1e-6, hPh + R);

      // Chi-square normalized innovation squared (NIS) test
      const nis = (residual * residual) / s;
      if (nis > this.nisGate) {
        rejectedCount++;
        this.totalRejectedCount++;
        continue;
      }

      sumNis += nis;
      validObs++;

      // Kalman Gain K = Ph / s
      const K = new Float64Array(6);
      for (let r = 0; r < 6; r++) {
        K[r] = Ph[r] / s;
      }

      // State vector update
      for (let r = 0; r < 6; r++) {
        this.x[r] += K[r] * residual;
      }

      // Covariance update: P = (I - K*h^T) * P (with numerical symmetrization)
      const P_new = Array.from({ length: 6 }, () => new Float64Array(6));
      for (let r = 0; r < 6; r++) {
        for (let c = 0; c < 6; c++) {
          let sum = 0;
          for (let k = 0; k < 6; k++) {
            const I_minus_Kh = (r === k ? 1.0 : 0.0) - K[r] * h[k];
            sum += I_minus_Kh * this.P[k][c];
          }
          P_new[r][c] = sum;
        }
      }

      for (let r = 0; r < 6; r++) {
        for (let c = 0; c < 6; c++) {
          this.P[r][c] = 0.5 * (P_new[r][c] + P_new[c][r]);
        }
      }
    }

    this.stepCount++;

    return {
      validObs,
      rejectedCount,
      meanNis: validObs > 0 ? sumNis / validObs : 0,
    };
  }

  /**
   * Kalman Measurement Update for Doppler Pseudorange Rates
   * Constrains receiver velocity and clock drift using carrier Doppler frequency observations.
   * @param {Array<Object>} dopplerObs - Array of Doppler measurements
   */
  updateDoppler(dopplerObs) {
    if (!Array.isArray(dopplerObs) || dopplerObs.length === 0) return;

    const uRef = latLngToLocalXY(this.refLat, this.refLng, this.refLat);

    for (const obs of dopplerObs) {
      if (!obs || !obs.station) continue;

      const st = obs.station;
      const sxy = latLngToLocalXY(st.lat, st.lng, this.refLat);
      const stRelX = sxy.x - uRef.x;
      const stRelY = sxy.y - uRef.y;

      const dx = this.x[0] - stRelX;
      const dy = this.x[1] - stRelY;
      const geomDist = Math.max(1.0, Math.hypot(dx, dy));

      const ux = dx / geomDist;
      const uy = dy / geomDist;

      // Modeled range rate: dot{rho} = vx*ux + vy*uy + c*dot{b}_rx
      const modeledRate = this.x[2] * ux + this.x[3] * uy + this.x[5];

      // Measured range rate: rangeRate = -(c / f0) * delta_f
      const f0 = obs.carrierFreqHz || 100000;
      const measuredRate = obs.rangeRateMs ?? -(SPEED_OF_LIGHT / f0) * (obs.dopplerShiftHz || 0);

      const residual = measuredRate - modeledRate;

      // Jacobian h_v = [0, 0, ux, uy, 0, 1.0] (spatial derivatives are negligible for d > 10 km)
      const h = new Float64Array([0, 0, ux, uy, 0, 1.0]);
      const sigma = typeof obs.sigmaRateMs === 'number' && obs.sigmaRateMs > 0 ? obs.sigmaRateMs : 0.5;
      const R = sigma * sigma;

      const Ph = new Float64Array(6);
      for (let r = 0; r < 6; r++) {
        let sum = 0;
        for (let c = 0; c < 6; c++) {
          sum += this.P[r][c] * h[c];
        }
        Ph[r] = sum;
      }

      let hPh = 0;
      for (let c = 0; c < 6; c++) {
        hPh += h[c] * Ph[c];
      }
      const s = Math.max(1e-6, hPh + R);

      const nis = (residual * residual) / s;
      if (nis > this.nisGate) continue;

      const K = new Float64Array(6);
      for (let r = 0; r < 6; r++) {
        K[r] = Ph[r] / s;
      }

      for (let r = 0; r < 6; r++) {
        this.x[r] += K[r] * residual;
      }

      const P_new = Array.from({ length: 6 }, () => new Float64Array(6));
      for (let r = 0; r < 6; r++) {
        for (let c = 0; c < 6; c++) {
          let sum = 0;
          for (let k = 0; k < 6; k++) {
            const I_minus_Kh = (r === k ? 1.0 : 0.0) - K[r] * h[k];
            sum += I_minus_Kh * this.P[k][c];
          }
          P_new[r][c] = sum;
        }
      }

      for (let r = 0; r < 6; r++) {
        for (let c = 0; c < 6; c++) {
          this.P[r][c] = 0.5 * (P_new[r][c] + P_new[c][r]);
        }
      }
    }
  }

  /**
   * Returns formatted current state and uncertainty metrics.
   * @returns {Object} Complete estimated kinematic state
   */
  getState() {
    const uRef = latLngToLocalXY(this.refLat, this.refLng, this.refLat);
    const absX = uRef.x + this.x[0];
    const absY = uRef.y + this.x[1];
    const pos = localXYToLatLng(absX, absY, this.refLat, this.refLng);

    const vx = this.x[2];
    const vy = this.x[3];
    const speedMs = Math.hypot(vx, vy);
    const speedKts = speedMs * 1.9438444924;
    const headingDeg = (Math.atan2(vx, vy) * (180 / Math.PI) + 360) % 360;

    const varX = Math.max(0, this.P[0][0]);
    const varY = Math.max(0, this.P[1][1]);
    const posSigmaM = Math.hypot(Math.sqrt(varX), Math.sqrt(varY));

    const varVx = Math.max(0, this.P[2][2]);
    const varVy = Math.max(0, this.P[3][3]);
    const velSigmaMs = Math.hypot(Math.sqrt(varVx), Math.sqrt(varVy));

    // Horizontal Protection Level (HPL) ~ 6 * max(sigmaX, sigmaY) per IALA PNT integrity standard
    const hplMeters = 6.0 * Math.max(Math.sqrt(varX), Math.sqrt(varY));

    return {
      lat: pos.lat,
      lng: pos.lng,
      xMeters: this.x[0],
      yMeters: this.x[1],
      vx,
      vy,
      speedMs,
      speedKts,
      headingDeg,
      clockBiasSec: this.x[4] / SPEED_OF_LIGHT,
      clockBiasM: this.x[4],
      clockDriftPpb: (this.x[5] / SPEED_OF_LIGHT) * 1e9,
      clockDriftMs: this.x[5],
      posSigmaM,
      velSigmaMs,
      hplMeters,
      covariance2D: [
        [this.P[0][0], this.P[0][1]],
        [this.P[1][0], this.P[1][1]],
      ],
      totalRejectedCount: this.totalRejectedCount,
      stepCount: this.stepCount,
    };
  }
}

/**
 * Factory function for creating an EKF instance.
 */
export function createEkf(initialLat, initialLng, options = {}) {
  return new EkfEstimator(initialLat, initialLng, options);
}
