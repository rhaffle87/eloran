import { describe, it, expect } from 'vitest';
import { createEkf, EkfEstimator, DEFAULT_EKF_CONFIG } from '../ekf.js';
import { latLngToLocalXY } from '../geodesy.js';

describe('6-State Kinematic Extended Kalman Filter (EKF)', () => {
  it('initializes filter with proper default covariance and dimensions', () => {
    const ekf = createEkf(52.0, 4.0);
    expect(ekf).toBeInstanceOf(EkfEstimator);
    expect(ekf.x.length).toBe(6);
    expect(ekf.P.length).toBe(6);
    expect(ekf.P[0][0]).toBe(DEFAULT_EKF_CONFIG.initialPosVar);
    expect(ekf.P[2][2]).toBe(DEFAULT_EKF_CONFIG.initialVelVar);
    expect(ekf.P[4][4]).toBe(DEFAULT_EKF_CONFIG.initialCbVar);

    const st = ekf.getState();
    expect(st.lat).toBeCloseTo(52.0, 4);
    expect(st.lng).toBeCloseTo(4.0, 4);
    expect(st.speedMs).toBe(0);
    expect(st.posSigmaM).toBeGreaterThan(60.0);
  });

  it('predicts state advancement and covariance growth under DWNA dynamics', () => {
    const ekf = createEkf(52.0, 4.0);
    ekf.x[2] = 10.0; // vx = 10 m/s East
    ekf.x[3] = 5.0;  // vy = 5 m/s North
    ekf.x[5] = 1.0;  // c * drift = 1 m/s

    const priorPosVar = ekf.P[0][0];
    ekf.predict(2.0); // 2 seconds

    expect(ekf.x[0]).toBeCloseTo(20.0, 4); // 10 m/s * 2s
    expect(ekf.x[1]).toBeCloseTo(10.0, 4); // 5 m/s * 2s
    expect(ekf.x[4]).toBeCloseTo(2.0, 4);  // 1 m/s * 2s
    expect(ekf.P[0][0]).toBeGreaterThan(priorPosVar); // Covariance grows with process noise
  });

  it('converges to true position and clock bias with multi-station pseudorange updates', () => {
    const refLat = 52.0;
    const refLng = 4.0;
    const ekf = createEkf(refLat, refLng, { initialPosVar: 4000 });

    const trueCb = 150.0; // meters (0.5 microsecond)
    const stations = [
      { lat: 51.5, lng: 3.5, asfMeters: 4 },
      { lat: 52.5, lng: 3.8, asfMeters: 8 },
      { lat: 52.3, lng: 4.8, asfMeters: 6 },
      { lat: 51.6, lng: 4.6, asfMeters: 5 },
    ];

    // Vessel moves East at 8 m/s (~15.5 kts)
    let trueX = 0;
    let trueY = 0;
    const trueVx = 8.0;
    const trueVy = 0.0;

    for (let t = 1; t <= 15; t++) {
      const dt = 1.0;
      trueX += trueVx * dt;
      trueY += trueVy * dt;

      ekf.predict(dt);

      const obs = stations.map(st => {
        const sxy = latLngToLocalXY(st.lat, st.lng, refLat);
        const uRef = latLngToLocalXY(refLat, refLng, refLat);
        const stRelX = sxy.x - uRef.x;
        const stRelY = sxy.y - uRef.y;
        const dist = Math.hypot(trueX - stRelX, trueY - stRelY);
        return {
          station: st,
          pseudorangeMeters: dist + (st.asfMeters || 0) + trueCb,
          sigmaMeters: 3.0,
        };
      });

      ekf.updatePseudoranges(obs);
    }

    const state = ekf.getState();
    const posError = Math.hypot(state.xMeters - trueX, state.yMeters - trueY);
    expect(posError).toBeLessThan(3.0); // Within 3 meters of true trajectory
    expect(Math.abs(state.clockBiasM - trueCb)).toBeLessThan(2.0); // Clock bias within 2m
    expect(state.posSigmaM).toBeLessThan(10.0); // Uncertainty converged down from > 60m
    expect(state.hplMeters).toBeGreaterThan(0);
  });

  it('rejects cycle slip outliers using autonomous Chi-Square NIS gating', () => {
    const refLat = 52.0;
    const refLng = 4.0;
    const ekf = createEkf(refLat, refLng);

    const stations = [
      { lat: 51.5, lng: 3.5, asfMeters: 2 },
      { lat: 52.5, lng: 3.8, asfMeters: 2 },
      { lat: 52.3, lng: 4.8, asfMeters: 2 },
      { lat: 51.6, lng: 4.6, asfMeters: 2 },
    ];

    // Settle the filter with 5 normal epochs
    for (let i = 0; i < 5; i++) {
      ekf.predict(1.0);
      const obs = stations.map(st => {
        const sxy = latLngToLocalXY(st.lat, st.lng, refLat);
        const uRef = latLngToLocalXY(refLat, refLng, refLat);
        const dist = Math.hypot(0 - (sxy.x - uRef.x), 0 - (sxy.y - uRef.y));
        return {
          station: st,
          pseudorangeMeters: dist + 2,
          sigmaMeters: 2.0,
        };
      });
      ekf.updatePseudoranges(obs);
    }

    // Now inject a 10 microsecond cycle slip (+3000m) on station 2
    ekf.predict(1.0);
    const slippedObs = stations.map((st, idx) => {
      const sxy = latLngToLocalXY(st.lat, st.lng, refLat);
      const uRef = latLngToLocalXY(refLat, refLng, refLat);
      const dist = Math.hypot(0 - (sxy.x - uRef.x), 0 - (sxy.y - uRef.y));
      const slip = (idx === 2) ? 3000.0 : 0.0;
      return {
        station: st,
        pseudorangeMeters: dist + 2 + slip,
        sigmaMeters: 2.0,
      };
    });

    const updateDiag = ekf.updatePseudoranges(slippedObs);
    expect(updateDiag.rejectedCount).toBe(1);
    expect(updateDiag.validObs).toBe(3);
    expect(ekf.totalRejectedCount).toBe(1);

    const state = ekf.getState();
    const posError = Math.hypot(state.xMeters, state.yMeters);
    expect(posError).toBeLessThan(2.0); // State was not corrupted by 3000m slip
  });

  it('updates velocity and clock drift via Doppler measurements', () => {
    const ekf = createEkf(52.0, 4.0);
    const station = { lat: 51.5, lng: 4.0 }; // Directly South of receiver

    // Receiver moving North at 10 m/s
    ekf.x[3] = 0; // Currently initialized to 0
    const dopplerObs = [
      {
        station,
        rangeRateMs: 10.0, // Receding North at 10 m/s
        sigmaRateMs: 0.5,
      },
    ];

    ekf.updateDoppler(dopplerObs);
    // Kalman update pushes vy towards +10 m/s
    expect(ekf.x[3]).toBeGreaterThan(3.0);
  });
});
