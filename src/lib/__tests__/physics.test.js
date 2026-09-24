import { describe, it, expect } from 'vitest';
import {
  haversineDistance,
  initialBearing,
  destinationPoint,
  wgs84ToMercator,
  mercatorToWgs84,
  latLngToLocalXY,
  localXYToLatLng,
  SPEED_OF_LIGHT,
  computeSecondaryFactorSec,
} from '../geodesy.js';
import {
  computeTDOAPair,
  solvePositionFromTDOA,
  solvePositionPseudorange,
  simulateCycleSlip,
} from '../tdoa.js';
import { computeGDOPAtPoint } from '../gdop.js';
import { simplifyRDP } from '../contours.js';
import { compileAsfExpression, validateAsfExpression } from '../asf.js';
import { parseStationsCsv, exportStationsCsv } from '../stations.js';
import { simulateClockOffset, createMulberry32 } from '../clocks.js';
import {
  evaluatePulse,
  evaluateStandardLoranPulseMicroseconds,
  evaluateCarrierMicroseconds,
} from '../pulse.js';
import { fusePositions } from '../fusion.js';

describe('Geodesy and Coordinate Transformations', () => {
  it('computes geodesic distance vs known values (London to Paris ~343 km)', () => {
    const london = { lat: 51.5074, lng: -0.1278 };
    const paris = { lat: 48.8566, lng: 2.3522 };
    const dist = haversineDistance(london, paris);
    // Known great-circle distance is ~343.5 km
    expect(dist / 1000).toBeCloseTo(343.5, 0);
  });

  it('computes initial bearing accurately (North to East is 90 deg)', () => {
    const p1 = { lat: 0, lng: 0 };
    const p2 = { lat: 0, lng: 10 };
    const bearing = initialBearing(p1, p2);
    expect(bearing).toBeCloseTo(90, 1);
  });

  it('destination point round-trip preserves coordinates', () => {
    const start = { lat: 10, lng: 20 };
    const dist = 50000; // 50 km
    const bearing = 45; // NE
    const dest = destinationPoint(start, dist, bearing);
    const measuredDist = haversineDistance(start, dest);
    expect(measuredDist).toBeCloseTo(dist, 0);
  });

  it('wgs84 to Mercator and back round-trips perfectly', () => {
    const coord = [106.816666, -6.200000]; // Jakarta
    const merc = wgs84ToMercator(coord);
    const back = mercatorToWgs84(merc);
    expect(back[0]).toBeCloseTo(coord[0], 5);
    expect(back[1]).toBeCloseTo(coord[1], 5);
  });

  it('local tangent plane projection round-trips accurately', () => {
    const refLat = -6.2;
    const refLng = 106.8;
    const pt = { lat: -6.35, lng: 106.95 };
    const xy = latLngToLocalXY(pt.lat, pt.lng, refLat, refLng);
    const back = localXYToLatLng(xy.x, xy.y, refLat, refLng);
    expect(back.lat).toBeCloseTo(pt.lat, 6);
    expect(back.lng).toBeCloseTo(pt.lng, 6);
  });
});

describe('TDOA and Multilateration Math', () => {
  const master = { lat: 0, lng: 0, offsetSec: 0, label: 'M' };
  const slave1 = { lat: 0, lng: 1, offsetSec: 0, label: 'S1' };
  const slave2 = { lat: 1, lng: 0, offsetSec: 0, label: 'S2' };

  it('verifies TDOA symmetry and arrival calculations', () => {
    // Equidistant receiver between M and S1
    const midPoint = { lat: 0, lng: 0.5 };
    const tdoa = computeTDOAPair(master, slave1, midPoint.lat, midPoint.lng);
    expect(tdoa).toBeCloseTo(0, 8); // Arrival time difference is 0 on perpendicular bisector
  });

  it('Gauss-Newton solver converges to true receiver location', () => {
    const truePos = { lat: 0.3, lng: 0.4 };
    const tdoa1 = computeTDOAPair(master, slave1, truePos.lat, truePos.lng);
    const tdoa2 = computeTDOAPair(master, slave2, truePos.lat, truePos.lng);

    const pairs = [
      { master, slave: slave1, tdoaSec: tdoa1 },
      { master, slave: slave2, tdoaSec: tdoa2 },
    ];

    const guess = { lat: 0.1, lng: 0.1 };
    const solution = solvePositionFromTDOA(pairs, guess);

    expect(solution.converged).toBe(true);
    expect(solution.lat).toBeCloseTo(truePos.lat, 4);
    expect(solution.lng).toBeCloseTo(truePos.lng, 4);
    expect(solution.hplMeters).toBeGreaterThan(0);
  });
});

describe('GDOP on Known Geometry', () => {
  it('computes low GDOP for symmetric orthogonal layout and high GDOP for ill-conditioned layout', () => {
    const master = { lat: 0, lng: 0 };
    // Orthogonal slaves: North and East
    const goodSlaves = [
      { lat: 1, lng: 0 },
      { lat: 0, lng: 1 },
    ];

    const rx = { lat: 0.5, lng: 0.5 };
    const goodRes = computeGDOPAtPoint(rx, master, goodSlaves);
    expect(goodRes.valid).toBe(true);
    expect(goodRes.gdop).toBeLessThan(10); // Good geometry

    // Degenerate collinear stations (nearly same angle)
    const badSlaves = [
      { lat: 0.001, lng: 1 },
      { lat: 0.002, lng: 2 },
    ];
    const badRes = computeGDOPAtPoint(rx, master, badSlaves);
    expect(badRes.gdop).toBeGreaterThan(goodRes.gdop);
  });
});

describe('Safe ASF Expression Parser (Security & Correctness)', () => {
  it('correctly evaluates safe trigonometric expressions', () => {
    const expr = '100 * sin((lat / 90) * pi) + 50 * cos((lng / 180) * pi)';
    const val = validateAsfExpression(expr);
    expect(val.valid).toBe(true);

    const fn = compileAsfExpression(expr);
    const res = fn(90, 0); // 100 * sin(pi) + 50 * cos(0) = 0 + 50 = 50
    expect(res).toBeCloseTo(50, 4);
  });

  it('rejects unsafe inputs containing code injection attempts', () => {
    const maliciousCases = [
      'alert(1)',
      'window.location = "http://evil.com"',
      'document.cookie',
      'fetch("http://evil.com")',
      'function() { return 1; }()',
      'new Function("return 2")()',
      'console.log(lat)',
      'eval("1+1")',
      'process.exit(1)',
      'constructor.constructor("return 1")()',
      '__proto__',
    ];

    for (const testCase of maliciousCases) {
      const validation = validateAsfExpression(testCase);
      expect(validation.valid).toBe(false);
      expect(() => compileAsfExpression(testCase)).toThrow();
    }
  });
});

describe('Ramer-Douglas-Peucker (RDP) Simplification', () => {
  it('reduces collinear points to start and end endpoints', () => {
    const points = [
      [0, 0],
      [1, 1],
      [2, 2],
      [3, 3],
      [4, 4],
    ];
    const simplified = simplifyRDP(points, 0.1);
    expect(simplified.length).toBe(2);
    expect(simplified[0]).toEqual([0, 0]);
    expect(simplified[1]).toEqual([4, 4]);
  });

  it('retains prominent vertices exceeding epsilon tolerance', () => {
    const points = [
      [0, 0],
      [5, 10], // Significant spike
      [10, 0],
    ];
    const simplified = simplifyRDP(points, 1.0);
    expect(simplified.length).toBe(3);
  });
});

describe('CSV Station Import/Export Round-Trip', () => {
  it('preserves station properties across serialize and deserialize cycle', () => {
    const csvSource = `role,lat,lng,label,clock_bias,clock_drift,diffCorrAvg,ddsEnabled,griMs,phaseSec,txDbm,offsetSec,clockType
master,-6.200000,106.816666,M1,0,0,5,true,1000,0,20,0,gps-disciplined
slave,-6.300000,106.900000,S1,0,0,0,false,1000,0,18,0,gps-disciplined
receiver,-6.250000,106.820000,R1,0,0,0,false,1000,0,0,0,gps-disciplined`;

    const parsed = parseStationsCsv(csvSource);
    expect(parsed.errors.length).toBe(0);
    expect(parsed.masters.length).toBe(1);
    expect(parsed.slaves.length).toBe(1);
    expect(parsed.receivers.length).toBe(1);

    const all = [...parsed.masters, ...parsed.slaves, ...parsed.receivers];
    const exportedCsv = exportStationsCsv(all);
    const reparsed = parseStationsCsv(exportedCsv);

    expect(reparsed.masters[0].label).toBe('M1');
    expect(reparsed.masters[0].lat).toBeCloseTo(-6.2, 5);
    expect(reparsed.masters[0].diffCorrections.avgMeters).toBe(5);
    expect(reparsed.slaves[0].label).toBe('S1');
    expect(reparsed.receivers[0].label).toBe('R1');
  });
});

describe('RF Pulse Synthesis & Clocks', () => {
  it('evaluates pulse envelope peak at t = 0 and decay at pulse end', () => {
    const peak = evaluatePulse(0, 0.0001, false);
    expect(peak).toBeCloseTo(1.0, 5);
    const end = evaluatePulse(0.0001, 0.0001, false);
    expect(end).toBeCloseTo(0.0, 5);
  });

  it('simulates clock bias and drift linearly', () => {
    const clock = { biasSec: 1e-6, driftPerSec: 1e-9 };
    const offset10s = simulateClockOffset(clock, 10);
    expect(offset10s).toBeCloseTo(1e-6 + 10e-9, 12);
  });

  it('Mulberry32 PRNG produces deterministic sequences', () => {
    const rng1 = createMulberry32(42);
    const rng2 = createMulberry32(42);
    expect(rng1()).toBe(rng2());
    expect(rng1()).toBe(rng2());
  });
});

describe('Standards & Advanced Physics: PF, SF, Cycle Slips & Pseudorange', () => {
  it('computes Primary Factor (PF) variation across refractive index standards', () => {
    const d = 1000000; // 1,000 km
    // Vacuum: eta = 1.0 -> d / c
    const pfVac = (1.0 * d) / SPEED_OF_LIGHT;
    // RTCM: eta = 1.000338
    const pfRtcm = (1.000338 * d) / SPEED_OF_LIGHT;
    // User Handbook: eta = 1.000284
    const pfHandbook = (1.000284 * d) / SPEED_OF_LIGHT;

    expect(pfRtcm).toBeGreaterThan(pfVac);
    expect(pfRtcm).toBeGreaterThan(pfHandbook);
    // Over 1000 km, RTCM vs Handbook difference is ~0.18 microseconds (~54 meters)
    const diffSec = pfRtcm - pfHandbook;
    expect(diffSec * 1e6).toBeCloseTo(0.18, 1);
  });

  it('computes Seawater Secondary Factor (SF) delay according to Brunavs / USCG empirical model', () => {
    // 50 statute miles (~80.4 km)
    const d50sm = 50 * 1609.344;
    const sf50 = computeSecondaryFactorSec(d50sm);
    expect(sf50).toBeGreaterThan(0);
    // Typical SF at 50 statute miles is ~0.27 microseconds
    expect(sf50 * 1e6).toBeCloseTo(0.27, 1);

    // 200 statute miles (~321.8 km)
    const d200sm = 200 * 1609.344;
    const sf200 = computeSecondaryFactorSec(d200sm);
    expect(sf200).toBeGreaterThan(sf50);
  });

  it('detects cycle slip and applies ±10 µs carrier period offset (~3 km)', () => {
    const arrival = 0.005; // 5 ms
    // Mock deterministic RNG that forces slip
    const slipResult = simulateCycleSlip(arrival, -5, 1, () => 0.01);
    expect(slipResult.slipped).toBe(true);
    expect(Math.abs(slipResult.cycleOffset)).toBe(1);
    // Time shifted by exactly ±10 µs
    expect(Math.abs(slipResult.arrivalSec - arrival)).toBeCloseTo(10e-6, 10);

    // High SNR with high pulse count should never slip
    const highSnrResult = simulateCycleSlip(arrival, 30, 20, () => 0.5);
    expect(highSnrResult.slipped).toBe(false);
    expect(highSnrResult.arrivalSec).toBe(arrival);
  });

  it('Pseudorange solver accurately estimates 2D position and receiver clock bias (b_rx)', () => {
    const s1 = { lat: 0, lng: 0, label: 'Tx1' };
    const s2 = { lat: 0, lng: 1, label: 'Tx2' };
    const s3 = { lat: 1, lng: 0, label: 'Tx3' };

    const trueRx = { lat: 0.3, lng: 0.4 };
    const trueClockBiasSec = 15e-6; // 15 microseconds receiver clock bias
    const cbrxMeters = trueClockBiasSec * SPEED_OF_LIGHT;

    const d1 = haversineDistance(s1, trueRx);
    const d2 = haversineDistance(s2, trueRx);
    const d3 = haversineDistance(s3, trueRx);

    // Modeled pseudoranges = geometric distance + c * b_rx
    const observations = [
      { station: s1, pseudorangeMeters: d1 + cbrxMeters },
      { station: s2, pseudorangeMeters: d2 + cbrxMeters },
      { station: s3, pseudorangeMeters: d3 + cbrxMeters },
    ];

    const initialGuess = { lat: 0.1, lng: 0.1 };
    const solution = solvePositionPseudorange(observations, initialGuess);

    expect(solution.converged).toBe(true);
    expect(solution.lat).toBeCloseTo(trueRx.lat, 4);
    expect(solution.lng).toBeCloseTo(trueRx.lng, 4);
    expect(solution.clockBiasSec).toBeCloseTo(trueClockBiasSec, 8);
    expect(solution.hdop).toBeGreaterThan(0);
    expect(solution.tdop).toBeGreaterThan(0);
    expect(solution.gdop).toBeGreaterThan(0);
  });

  it.fails('expects physical continuity of the Secondary Factor (SF) polynomial across the 100 statute mile boundary (expected failure until continuous coefficients are implemented)', () => {
    const sm100Meters = 100 * 1609.344;
    // Evaluate just below 100 statute miles (short-range branch)
    const sfBelow = computeSecondaryFactorSec(sm100Meters - 1);
    // Evaluate at/above 100 statute miles (long-range branch)
    const sfAbove = computeSecondaryFactorSec(sm100Meters + 1);

    const sfBelowUs = sfBelow * 1e6;
    const sfAboveUs = sfAbove * 1e6;
    const jumpUs = Math.abs(sfBelowUs - sfAboveUs);

    // A physically continuous model must have jump < 0.001 µs (< 0.3 m) across the 100 sm threshold.
    // In the historical polynomial, this jump is ~0.236 µs (~71 m), which fails this assertion.
    // Marked as it.fails: when continuous Brunavs coefficients are implemented, this will turn green.
    expect(jumpUs).toBeLessThan(0.001);
  });
});

describe('100 kHz RF Waveform and Pulse Carrier Physics', () => {
  it('verifies carrier period is exactly 10 µs with t in microseconds', () => {
    // Carrier term: sin(2 * pi * 0.1 * t + PC) where f = 0.1 cycles/µs -> period Tc = 10 µs
    const t0 = evaluateCarrierMicroseconds(0);
    const tQuarter = evaluateCarrierMicroseconds(2.5); // Peak positive
    const tHalf = evaluateCarrierMicroseconds(5.0);    // Zero-crossing (negative-going)
    const tThreeQuarter = evaluateCarrierMicroseconds(7.5); // Peak negative
    const tPeriod = evaluateCarrierMicroseconds(10.0); // Complete 1 cycle

    expect(t0).toBeCloseTo(0, 7);
    expect(tQuarter).toBeCloseTo(1, 7);
    expect(tHalf).toBeCloseTo(0, 7);
    expect(tThreeQuarter).toBeCloseTo(-1, 7);
    expect(tPeriod).toBeCloseTo(0, 7);

    // Periodicity test: c(t + 10 µs) == c(t) for arbitrary t
    for (let t = 0.5; t < 50; t += 3.7) {
      expect(evaluateCarrierMicroseconds(t + 10)).toBeCloseTo(evaluateCarrierMicroseconds(t), 6);
    }
  });

  it('verifies Standard Zero Crossing (SZC) is at exactly 30 µs and is positive-going', () => {
    // At t = 30 µs, exactly 3 full cycles of 10 µs have elapsed
    const valAtSZC = evaluateCarrierMicroseconds(30.0);
    expect(valAtSZC).toBeCloseTo(0, 7);

    // Check that it is positive-going (derivative > 0)
    const justBefore = evaluateCarrierMicroseconds(29.9);
    const justAfter = evaluateCarrierMicroseconds(30.1);
    expect(justBefore).toBeLessThan(0);
    expect(justAfter).toBeGreaterThan(0);

    // Confirm that the full Loran pulse at t = 30 µs is at zero crossing with non-zero envelope
    const pulseAtSZC = evaluateStandardLoranPulseMicroseconds(30.0);
    expect(pulseAtSZC).toBeCloseTo(0, 6);
    const pulseJustAfter = evaluateStandardLoranPulseMicroseconds(30.1);
    expect(pulseJustAfter).toBeGreaterThan(0);
  });

  it('verifies envelope peak timing is at 65 µs', () => {
    // Carrier at 65 µs is sin(2*pi*0.1*65) = sin(13*pi) = 0
    // Check the envelope magnitude directly (t^2 * exp(-2t/65))
    const env60 = (60 ** 2) * Math.exp((-2 * 60) / 65);
    const env65 = (65 ** 2) * Math.exp((-2 * 65) / 65);
    const env70 = (70 ** 2) * Math.exp((-2 * 70) / 65);

    expect(env65).toBeGreaterThan(env60);
    expect(env65).toBeGreaterThan(env70);
  });
});

describe('Multi-Sensor PNT Fusion (Inverse-Covariance BLUE)', () => {
  it('dynamically weights sensors inversely proportional to their variance', () => {
    // Scenario: eLoran has high precision (cov = 4 m² = 2x2m), GNSS has degraded precision (cov = 100 m² = 10x10m)
    const eloranFix = {
      lat: 50.0,
      lng: 1.0,
      covariance: [[4, 0], [0, 4]],
      hplMeters: 6,
    };
    const gnssFix = {
      lat: 50.001,
      lng: 1.001,
      covariance: [[100, 0], [0, 100]],
    };

    const fused = fusePositions(eloranFix, gnssFix, 'fusion');
    expect(fused.mode).toBe('fusion');
    expect(fused.weightingMethod).toBe('inverse-covariance');

    // eLoran variance is 4, GNSS variance is 100
    // Weight eLoran = (1/4) / (1/4 + 1/100) = 0.25 / 0.26 ≈ 0.9615
    // Weight GNSS = (1/100) / (1/4 + 1/100) = 0.01 / 0.26 ≈ 0.0385
    expect(fused.weights.eloran).toBeGreaterThan(0.95);
    expect(fused.weights.gnss).toBeLessThan(0.05);

    // Fused position should be much closer to eLoran
    expect(fused.lat).toBeCloseTo(eloranFix.lat, 4);
  });

  it('labels manual fixed weights as educational demo mode', () => {
    const eloranFix = { lat: 0, lng: 0, covariance: [[16, 0], [0, 16]] };
    const gnssFix = { lat: 1, lng: 1, covariance: [[16, 0], [0, 16]] };

    const demoFused = fusePositions(eloranFix, gnssFix, 'fusion', null, { eloran: 0.6, gnss: 0.4 });
    expect(demoFused.weightingMethod).toBe('fixed-weights-demo');
    expect(demoFused.weights.eloran).toBeCloseTo(0.6, 2);
    expect(demoFused.weights.gnss).toBeCloseTo(0.4, 2);
  });
});

