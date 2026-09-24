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
} from '../geodesy.js';
import {
  computeTDOAPair,
  solvePositionFromTDOA,
} from '../tdoa.js';
import { computeGDOPAtPoint } from '../gdop.js';
import { simplifyRDP } from '../contours.js';
import { compileAsfExpression, validateAsfExpression } from '../asf.js';
import { parseStationsCsv, exportStationsCsv } from '../stations.js';
import { simulateClockOffset, createMulberry32 } from '../clocks.js';
import { evaluatePulse } from '../pulse.js';

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
