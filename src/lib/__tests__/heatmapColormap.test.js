import { describe, it, expect } from 'vitest';
import {
  JET_LUT,
  VIRIDIS_LUT,
  sampleColormap,
  getColormapCssGradient,
  renderGridToCanvas,
} from '../heatmapColormap.js';

describe('Heatmap Colormaps & Rendering', () => {
  it('JET_LUT and VIRIDIS_LUT contain 256 valid RGB triples', () => {
    expect(JET_LUT).toHaveLength(256);
    expect(VIRIDIS_LUT).toHaveLength(256);

    for (let i = 0; i < 256; i++) {
      const j = JET_LUT[i];
      const v = VIRIDIS_LUT[i];
      expect(j).toHaveLength(3);
      expect(v).toHaveLength(3);
      expect(j[0]).toBeGreaterThanOrEqual(0);
      expect(j[0]).toBeLessThanOrEqual(255);
      expect(v[0]).toBeGreaterThanOrEqual(0);
      expect(v[0]).toBeLessThanOrEqual(255);
    }
  });

  it('sampleColormap samples correctly across boundary values', () => {
    // Jet: blue at 0, red at 1
    const jet0 = sampleColormap(0, 'jet');
    expect(jet0[2]).toBeGreaterThan(jet0[0]); // blue > red

    const jet1 = sampleColormap(1, 'jet');
    expect(jet1[0]).toBeGreaterThan(jet1[2]); // red > blue

    // Viridis: dark purple at 0, yellow at 1
    const vir0 = sampleColormap(0, 'viridis');
    expect(vir0[0]).toBeLessThan(100);
    expect(vir0[1]).toBeLessThan(10);
    expect(vir0[2]).toBeGreaterThan(70);

    const vir1 = sampleColormap(1, 'viridis');
    expect(vir1[0]).toBeGreaterThan(240); // high red
    expect(vir1[1]).toBeGreaterThan(200); // high green
  });

  it('handles out-of-range and non-finite values safely', () => {
    const cNeg = sampleColormap(-5, 'jet');
    const c0 = sampleColormap(0, 'jet');
    expect(cNeg).toEqual(c0);

    const cPos = sampleColormap(99, 'jet');
    const c1 = sampleColormap(1, 'jet');
    expect(cPos).toEqual(c1);

    const cNan = sampleColormap(NaN, 'viridis');
    expect(cNan).toEqual(sampleColormap(0, 'viridis'));
  });

  it('getColormapCssGradient returns a valid CSS linear gradient', () => {
    const gradJet = getColormapCssGradient('jet');
    expect(gradJet).toContain('linear-gradient(to right');
    expect(gradJet).toContain('rgb(');

    const gradVir = getColormapCssGradient('viridis', 'to bottom');
    expect(gradVir).toContain('linear-gradient(to bottom');
  });

  it('renderGridToCanvas handles degenerate inputs gracefully', () => {
    expect(renderGridToCanvas(null, 10, 10, {})).toEqual({ minVal: 0, maxVal: 0 });
    expect(renderGridToCanvas(new Float32Array(4), 1, 1, {})).toEqual({ minVal: 0, maxVal: 0 });
  });

  it('renderGridToCanvas paints into canvas context with bilinear interpolation', () => {
    let putImageDataCalled = false;
    const fakeCtx = {
      createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }),
      putImageData: () => { putImageDataCalled = true; },
    };
    const fakeCanvas = {
      width: 10,
      height: 10,
      getContext: () => fakeCtx,
    };

    const grid = new Float32Array([
      0.0, 1.0,
      2.0, 3.0,
    ]);

    const res = renderGridToCanvas(grid, 2, 2, fakeCanvas, {
      colormap: 'jet',
      minVal: 0,
      maxVal: 3,
      opacity: 0.8,
      isoStep: 1.0,
      width: 10,
      height: 10,
    });

    expect(res.minVal).toBe(0);
    expect(res.maxVal).toBe(3);
    expect(putImageDataCalled).toBe(true);
  });
});
