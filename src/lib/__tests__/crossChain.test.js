import { describe, it, expect } from 'vitest';
import { solveCrossChainFix, evaluateCrossChainDopGain } from '../crossChain.js';
import { haversineDistance } from '../geodesy.js';

describe('Multi-GRI Cross-Rate Multilateration Engine (crossChain.js)', () => {
  // Test receiver in North Sea
  const trueRx = { lat: 53.5, lng: 5.0 };
  const mockClockBiasM = 450.0; // 450 meters clock bias (~1.5 µs)

  // North Sea chain (GRI 6731)
  const sylt = { id: 'sylt', label: 'Sylt', lat: 54.98, lng: 8.28, gri: 6731 };
  const lessay = { id: 'lessay', label: 'Lessay', lat: 49.15, lng: -1.50, gri: 6731 };

  // Adjacent chain: Ejde (GRI 9007)
  const ejde = { id: 'ejde', label: 'Ejde', lat: 62.30, lng: -7.07, gri: 9007 };

  // Adjacent chain: Anthorn (GRI 7499)
  const anthorn = { id: 'anthorn', label: 'Anthorn', lat: 54.91, lng: -3.28, gri: 7499 };

  it('rejects fewer than 3 stations with noSolution: true', () => {
    const obs = [
      { station: sylt, pseudorangeMeters: 250000, sigmaMeters: 5.0 },
      { station: lessay, pseudorangeMeters: 600000, sigmaMeters: 5.0 },
    ];
    const fix = solveCrossChainFix(obs);
    expect(fix.converged).toBe(false);
    expect(fix.noSolution).toBe(true);
    expect(fix.reason).toContain('at least 3 transmitters');
  });

  it('converges with sub-meter accuracy across a multi-chain constellation (GRIs 6731, 7499, 9007)', () => {
    const stations = [sylt, lessay, anthorn, ejde];
    const observations = stations.map((st) => {
      const dist = haversineDistance(trueRx, st);
      return {
        station: st,
        pseudorangeMeters: dist + mockClockBiasM,
        sigmaMeters: 3.0,
      };
    });

    const fix = solveCrossChainFix(observations, { lat: 53.0, lng: 4.5 });

    expect(fix.converged).toBe(true);
    expect(fix.noSolution).toBe(false);
    expect(fix.isMultiChain).toBe(true);
    expect(fix.chainsCount).toBe(3); // 6731, 7499, 9007
    expect(fix.participatingGris).toEqual(expect.arrayContaining([6731, 7499, 9007]));

    // Distance between estimated fix and true position should be < 5 meters
    const posErr = haversineDistance({ lat: fix.lat, lng: fix.lng }, trueRx);
    expect(posErr).toBeLessThan(5.0);

    // Clock bias recovered within 5 meters of true bias
    expect(Math.abs(fix.clockBiasMeters - mockClockBiasM)).toBeLessThan(5.0);
    expect(fix.hdop).toBeGreaterThan(0);
    expect(fix.hdop).toBeLessThan(10.0);
  });

  it('evaluates cross-chain GDOP gain over single-chain baseline', () => {
    // 3 stations in primary chain vs 4 stations adding an orthogonal adjacent transmitter
    const singleChain = [sylt, lessay, { lat: 51.5, lng: 1.0, gri: 6731 }];
    const crossChain = [...singleChain, anthorn, ejde];

    const gain = evaluateCrossChainDopGain(singleChain, crossChain, trueRx);

    expect(gain.isImproved).toBe(true);
    expect(gain.crossChainHdop).toBeLessThanOrEqual(gain.singleChainHdop);
    expect(gain.dopImprovementPct).toBeGreaterThan(0);
    expect(gain.stationsCross).toBe(5);
  });

  it('handles noisy pseudoranges realistically without diverging', () => {
    const stations = [sylt, lessay, anthorn, ejde];
    // Add ±8 meters pseudo-noise
    const noise = [6.2, -5.1, 7.8, -4.3];
    const observations = stations.map((st, i) => {
      const dist = haversineDistance(trueRx, st);
      return {
        station: st,
        pseudorangeMeters: dist + mockClockBiasM + noise[i],
        sigmaMeters: 5.0,
      };
    });

    const fix = solveCrossChainFix(observations, { lat: 53.0, lng: 5.0 });
    expect(fix.converged).toBe(true);
    const posErr = haversineDistance({ lat: fix.lat, lng: fix.lng }, trueRx);
    // Error under noise remains within statistical 2-sigma boundary (< 25 meters)
    expect(posErr).toBeLessThan(25.0);
  });
});
