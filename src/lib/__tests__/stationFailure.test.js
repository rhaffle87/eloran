import { describe, it, expect } from 'vitest';
import { buildHMatrix, computeGDOPAtPoint } from '../gdop.js';
import { computeHyperbolicGDOP } from '../chainDesign.js';

describe('Station Failure Simulation & Constellation Dilution', () => {
  const master = { id: 'M', label: 'Master-Java', lat: -6.2, lng: 106.8 };
  const s1 = { id: 'S1', label: 'Sec1-Sumatra', lat: -5.4, lng: 105.2 };
  const s2 = { id: 'S2', label: 'Sec2-Bali', lat: -8.5, lng: 115.2 };
  const s3 = { id: 'S3', label: 'Sec3-Kalimantan', lat: -1.2, lng: 110.5 };
  const rx = { lat: -6.5, lng: 107.0 };

  it('buildHMatrix computes valid matrix with full 3-secondary constellation', () => {
    const res = buildHMatrix(rx, master, [s1, s2, s3]);
    expect(res.valid).toBe(true);
    expect(res.H.length).toBe(3);
  });

  it('fails cleanly when master station is excluded / failed', () => {
    const res = buildHMatrix(rx, master, [s1, s2, s3], ['M']);
    expect(res.valid).toBe(false);
    expect(res.H).toEqual([]);

    const gdopRes = computeGDOPAtPoint(rx, master, [s1, s2, s3], ['Master-Java']);
    expect(gdopRes.valid).toBe(false);
    expect(gdopRes.gdop).toBe(99.9);
  });

  it('tolerates single secondary failure if 2 secondaries remain', () => {
    const full = computeGDOPAtPoint(rx, master, [s1, s2, s3]);
    expect(full.valid).toBe(true);

    // Fail S3, remaining: S1, S2
    const withFailedS3 = computeGDOPAtPoint(rx, master, [s1, s2, s3], ['S3']);
    expect(withFailedS3.valid).toBe(true);
    // GDOP with reduced constellation is higher (or equal) to full constellation
    expect(withFailedS3.gdop).toBeGreaterThanOrEqual(full.gdop);
  });

  it('invalidates fix when fewer than 2 active secondaries remain', () => {
    // Fail both S2 and S3, leaving only S1
    const res = computeGDOPAtPoint(rx, master, [s1, s2, s3], ['S2', 'S3']);
    expect(res.valid).toBe(false);
    expect(res.gdop).toBe(99.9);
  });

  it('computeHyperbolicGDOP in chainDesign honors excludeIds', () => {
    const full = computeHyperbolicGDOP(rx, master, [s1, s2, s3], 0.1);
    expect(full.valid).toBe(true);

    const masterFailed = computeHyperbolicGDOP(rx, master, [s1, s2, s3], 0.1, ['Master-Java']);
    expect(masterFailed.valid).toBe(false);
    expect(masterFailed.gdop).toBe(99.9);

    const degraded = computeHyperbolicGDOP(rx, master, [s1, s2, s3], 0.1, ['Sec3-Kalimantan']);
    expect(degraded.valid).toBe(true);
    expect(degraded.gdop).toBeGreaterThanOrEqual(full.gdop);

    const insufficient = computeHyperbolicGDOP(rx, master, [s1, s2, s3], 0.1, ['Sec2-Bali', 'Sec3-Kalimantan']);
    expect(insufficient.valid).toBe(false);
  });
});
