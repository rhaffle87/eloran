/**
 * Colormap lookup tables and canvas rasterizer for SIMULORAN heatmaps
 *
 * Implements:
 *   - Jet colormap (standard radio navigation delay standard)
 *   - Viridis colormap (perceptually uniform sequential colormap)
 *   - Direct RGBA canvas buffer painter with optional iso-contour lines
 */

/** 256-entry RGB lookup table for Jet colormap */
export const JET_LUT = [[0,0,128],[0,0,132],[0,0,136],[0,0,140],[0,0,144],[0,0,147],[0,0,152],[0,0,156],[0,0,160],[0,0,163],[0,0,168],[0,0,172],[0,0,176],[0,0,179],[0,0,184],[0,0,188],[0,0,192],[0,0,195],[0,0,200],[0,0,204],[0,0,208],[0,0,211],[0,0,216],[0,0,220],[0,0,224],[0,0,227],[0,0,232],[0,0,236],[0,0,240],[0,0,243],[0,0,248],[0,0,252],[0,0,255],[0,4,255],[0,8,255],[0,13,255],[0,16,255],[0,21,255],[0,25,255],[0,29,255],[0,33,255],[0,36,255],[0,40,255],[0,45,255],[0,49,255],[0,53,255],[0,57,255],[0,61,255],[0,65,255],[0,68,255],[0,72,255],[0,77,255],[0,81,255],[0,85,255],[0,89,255],[0,93,255],[0,97,255],[0,100,255],[0,104,255],[0,109,255],[0,113,255],[0,117,255],[0,121,255],[0,125,255],[0,129,255],[0,132,255],[0,137,255],[0,141,255],[0,145,255],[0,148,255],[0,153,255],[0,157,255],[0,161,255],[0,164,255],[0,169,255],[0,173,255],[0,177,255],[0,180,255],[0,185,255],[0,189,255],[0,193,255],[0,196,255],[0,201,255],[0,205,255],[0,209,255],[0,212,255],[0,217,255],[0,221,255],[0,225,255],[0,228,255],[0,233,255],[0,237,255],[0,241,255],[0,244,255],[0,249,255],[0,253,255],[1,255,254],[5,255,250],[10,255,245],[14,255,242],[17,255,238],[21,255,234],[26,255,229],[30,255,226],[33,255,222],[37,255,218],[42,255,213],[46,255,210],[49,255,206],[53,255,202],[58,255,197],[62,255,194],[66,255,190],[69,255,186],[74,255,181],[78,255,178],[82,255,174],[85,255,170],[90,255,165],[94,255,162],[98,255,158],[101,255,154],[106,255,149],[110,255,146],[114,255,142],[117,255,138],[122,255,133],[126,255,130],[130,255,126],[133,255,122],[137,255,118],[141,255,114],[146,255,109],[150,255,105],[154,255,101],[158,255,98],[162,255,94],[165,255,90],[169,255,86],[173,255,82],[178,255,77],[182,255,73],[186,255,69],[190,255,66],[194,255,62],[197,255,58],[201,255,54],[205,255,50],[210,255,45],[214,255,41],[218,255,37],[222,255,33],[226,255,30],[229,255,26],[233,255,22],[237,255,18],[242,255,13],[246,255,9],[250,255,5],[254,255,1],[255,253,0],[255,249,0],[255,245,0],[255,241,0],[255,236,0],[255,232,0],[255,228,0],[255,225,0],[255,221,0],[255,217,0],[255,213,0],[255,209,0],[255,204,0],[255,200,0],[255,196,0],[255,193,0],[255,189,0],[255,185,0],[255,181,0],[255,177,0],[255,172,0],[255,168,0],[255,164,0],[255,161,0],[255,157,0],[255,153,0],[255,149,0],[255,145,0],[255,140,0],[255,136,0],[255,132,0],[255,129,0],[255,125,0],[255,121,0],[255,117,0],[255,113,0],[255,108,0],[255,104,0],[255,100,0],[255,97,0],[255,93,0],[255,89,0],[255,85,0],[255,81,0],[255,76,0],[255,72,0],[255,68,0],[255,65,0],[255,61,0],[255,57,0],[255,53,0],[255,49,0],[255,44,0],[255,40,0],[255,36,0],[255,33,0],[255,29,0],[255,25,0],[255,21,0],[255,17,0],[255,12,0],[255,8,0],[255,4,0],[255,0,0],[252,0,0],[248,0,0],[244,0,0],[240,0,0],[235,0,0],[231,0,0],[227,0,0],[224,0,0],[220,0,0],[216,0,0],[212,0,0],[208,0,0],[203,0,0],[199,0,0],[195,0,0],[192,0,0],[188,0,0],[184,0,0],[180,0,0],[176,0,0],[171,0,0],[167,0,0],[163,0,0],[160,0,0],[156,0,0],[152,0,0],[148,0,0],[144,0,0],[139,0,0],[135,0,0],[132,0,0],[128,0,0]];

/** 256-entry RGB lookup table for Viridis colormap */
export const VIRIDIS_LUT = [[68,1,84],[68,2,85],[68,4,87],[68,5,88],[69,6,90],[69,8,91],[69,9,92],[69,10,94],[69,12,95],[69,13,97],[70,14,98],[70,16,100],[70,17,101],[70,18,102],[70,20,104],[70,21,105],[71,22,107],[71,24,108],[71,25,109],[71,26,111],[71,28,112],[71,29,114],[71,30,115],[72,32,116],[72,33,118],[72,34,119],[72,36,120],[71,37,121],[71,39,122],[71,40,122],[70,42,123],[70,43,124],[69,45,124],[69,46,125],[69,48,126],[68,49,126],[68,51,127],[67,52,128],[67,54,128],[67,55,129],[66,57,130],[66,58,130],[66,60,131],[65,61,132],[65,63,132],[64,64,133],[64,66,134],[64,67,134],[63,69,135],[63,70,136],[62,72,136],[62,73,137],[61,74,137],[61,75,137],[60,77,138],[60,78,138],[59,79,138],[59,80,138],[58,82,138],[58,83,139],[57,84,139],[57,85,139],[56,86,139],[56,88,139],[55,89,140],[55,90,140],[54,91,140],[54,92,140],[53,94,140],[53,95,141],[52,96,141],[52,97,141],[51,99,141],[51,100,141],[50,101,142],[50,102,142],[49,103,142],[49,105,142],[48,106,142],[48,107,142],[47,108,142],[47,109,142],[47,110,142],[46,111,142],[46,112,142],[45,113,142],[45,114,142],[44,115,142],[44,116,142],[44,117,142],[43,118,142],[43,119,142],[42,120,142],[42,121,142],[41,122,142],[41,123,142],[41,124,142],[40,125,142],[40,126,142],[39,127,142],[39,128,142],[38,129,142],[38,130,142],[38,131,142],[37,132,142],[37,133,141],[37,134,141],[37,135,141],[36,137,141],[36,138,141],[36,139,140],[36,140,140],[35,141,140],[35,142,140],[35,143,140],[34,144,139],[34,145,139],[34,146,139],[34,148,139],[33,149,139],[33,150,138],[33,151,138],[33,152,138],[32,153,138],[32,154,138],[32,155,137],[31,156,137],[31,157,137],[31,158,137],[32,159,136],[33,160,135],[34,161,135],[35,162,134],[36,163,134],[37,164,133],[37,165,132],[38,166,132],[39,167,131],[40,168,130],[41,169,130],[42,170,129],[43,171,129],[44,172,128],[44,173,127],[45,174,127],[46,175,126],[47,176,125],[48,177,125],[49,178,124],[50,179,124],[50,180,123],[51,181,122],[52,182,122],[53,183,121],[55,184,120],[57,185,118],[60,186,117],[62,186,116],[64,187,115],[66,188,113],[68,189,112],[71,190,111],[73,191,110],[75,192,108],[77,192,107],[79,193,106],[82,194,105],[84,195,103],[86,196,102],[88,197,101],[90,198,100],[93,199,98],[95,199,97],[97,200,96],[99,201,95],[101,202,93],[104,203,92],[106,204,91],[108,205,90],[110,205,88],[113,206,86],[116,207,85],[119,207,83],[122,208,81],[124,209,79],[127,209,78],[130,210,76],[133,211,74],[135,211,72],[138,212,70],[141,213,69],[144,213,67],[147,214,65],[149,215,63],[152,215,62],[155,216,60],[158,217,58],[161,217,56],[163,218,55],[166,219,53],[169,219,51],[172,220,49],[174,221,48],[177,221,46],[180,222,44],[182,222,44],[185,222,43],[187,223,43],[189,223,42],[191,223,42],[194,223,41],[196,223,41],[198,224,41],[200,224,40],[203,224,40],[205,224,39],[207,224,39],[210,225,38],[212,225,38],[214,225,38],[216,225,37],[219,225,37],[221,226,36],[223,226,36],[225,226,35],[228,226,35],[230,226,35],[232,227,34],[235,227,34],[237,227,33],[238,227,33],[239,227,33],[239,227,33],[240,228,34],[241,228,34],[241,228,34],[242,228,34],[242,228,34],[243,228,34],[244,228,34],[244,229,35],[245,229,35],[245,229,35],[246,229,35],[247,229,35],[247,229,35],[248,230,36],[248,230,36],[249,230,36],[249,230,36],[250,230,36],[251,230,36],[251,231,37],[252,231,37],[252,231,37],[253,231,37]];

/**
 * Samples a colormap by normalized position t in [0, 1].
 *
 * @param {number} t - Normalized value [0, 1]
 * @param {Array<[number, number, number]> | 'jet' | 'viridis'} colormap - LUT or colormap name
 * @returns {[number, number, number]} RGB array [0..255]
 */
export function sampleColormap(t, colormap = 'jet') {
  const lut = typeof colormap === 'string'
    ? (colormap.toLowerCase() === 'viridis' ? VIRIDIS_LUT : JET_LUT)
    : (colormap || JET_LUT);

  const clamped = Math.max(0, Math.min(1, Number.isFinite(t) ? t : 0));
  const idx = Math.min(255, Math.floor(clamped * 255));
  return lut[idx] || [0, 0, 0];
}

/**
 * Generates a CSS linear-gradient string for colorbars.
 *
 * @param {'jet' | 'viridis'} colormap - Colormap name
 * @param {string} [direction='to right'] - CSS gradient direction
 * @returns {string} CSS linear-gradient expression
 */
export function getColormapCssGradient(colormap = 'jet', direction = 'to right') {
  const stops = [0, 0.2, 0.4, 0.6, 0.8, 1.0].map((t) => {
    const [r, g, b] = sampleColormap(t, colormap);
    return `rgb(${r}, ${g}, ${b}) ${Math.round(t * 100)}%`;
  });
  return `linear-gradient(${direction}, ${stops.join(', ')})`;
}

/**
 * Paints a 2D scalar grid into a Canvas or OffscreenCanvas context with smooth bilinear interpolation
 * and subtle iso-contour lines.
 *
 * @param {Float32Array | number[]} grid - Flattened scalar grid of size nx * ny
 * @param {number} nx - Number of columns
 * @param {number} ny - Number of rows
 * @param {HTMLCanvasElement | OffscreenCanvas} canvas - Target canvas
 * @param {object} [options]
 * @param {'jet' | 'viridis' | Array} [options.colormap='jet'] - Colormap to apply
 * @param {number} [options.minVal] - Value corresponding to t=0 (auto-derived if omitted)
 * @param {number} [options.maxVal] - Value corresponding to t=1 (auto-derived if omitted)
 * @param {number} [options.opacity=0.7] - Layer alpha in [0, 1]
 * @param {number|null} [options.isoStep=null] - Spacing for iso-contour lines (e.g. 0.5 for µs, 10 for dB)
 * @param {number} [options.width] - Output canvas pixel width (defaults to canvas.width or nx * 4)
 * @param {number} [options.height] - Output canvas pixel height (defaults to canvas.height or ny * 4)
 * @returns {{ minVal: number, maxVal: number }}
 */
export function renderGridToCanvas(grid, nx, ny, canvas, options = {}) {
  if (!grid || nx <= 1 || ny <= 1 || !canvas) {
    return { minVal: 0, maxVal: 0 };
  }

  // Derive min/max if not provided
  let minV = options.minVal;
  let maxV = options.maxVal;
  if (minV === undefined || maxV === undefined) {
    let gMin = Infinity;
    let gMax = -Infinity;
    for (let i = 0; i < grid.length; i++) {
      const v = grid[i];
      if (Number.isFinite(v)) {
        if (v < gMin) gMin = v;
        if (v > gMax) gMax = v;
      }
    }
    if (minV === undefined) minV = Number.isFinite(gMin) ? gMin : 0;
    if (maxV === undefined) maxV = Number.isFinite(gMax) ? gMax : 1;
  }

  const range = Math.max(1e-6, maxV - minV);
  const colormap = options.colormap || 'jet';
  const alphaByte = Math.round(Math.max(0, Math.min(1, options.opacity ?? 0.7)) * 255);
  const isoStep = options.isoStep && options.isoStep > 0 ? options.isoStep : null;

  const outW = options.width || canvas.width || nx * 4;
  const outH = options.height || canvas.height || ny * 4;

  if (canvas.width !== outW) canvas.width = outW;
  if (canvas.height !== outH) canvas.height = outH;

  const ctx = canvas.getContext('2d');
  if (!ctx) return { minVal: minV, maxVal: maxV };

  const imgData = ctx.createImageData(outW, outH);
  const data = imgData.data;

  // Bilinear interpolation from (nx, ny) grid to (outW, outH) canvas pixels
  const getGridVal = (gx, gy) => {
    const cx = Math.max(0, Math.min(nx - 1, gx));
    const cy = Math.max(0, Math.min(ny - 1, gy));
    return grid[cy * nx + cx] || 0;
  };

  const scaleX = (nx - 1) / (outW - 1);
  const scaleY = (ny - 1) / (outH - 1);

  let p = 0;
  for (let py = 0; py < outH; py++) {
    const gy = py * scaleY;
    const y0 = Math.floor(gy);
    const y1 = Math.min(ny - 1, y0 + 1);
    const wy = gy - y0;

    for (let px = 0; px < outW; px++, p += 4) {
      const gx = px * scaleX;
      const x0 = Math.floor(gx);
      const x1 = Math.min(nx - 1, x0 + 1);
      const wx = gx - x0;

      // 4 neighbors
      const v00 = getGridVal(x0, y0);
      const v10 = getGridVal(x1, y0);
      const v01 = getGridVal(x0, y1);
      const v11 = getGridVal(x1, y1);

      // Bilinear blend
      const top = v00 * (1 - wx) + v10 * wx;
      const bot = v01 * (1 - wx) + v11 * wx;
      const val = top * (1 - wy) + bot * wy;

      const t = (val - minV) / range;
      let [r, g, b] = sampleColormap(t, colormap);

      // Subtle iso-contour line effect
      if (isoStep) {
        const distToIso = Math.abs(val % isoStep);
        const normDist = Math.min(distToIso, isoStep - distToIso) / isoStep;
        if (normDist < 0.04) {
          // Darken pixel slightly along contour boundary
          r = Math.round(r * 0.45);
          g = Math.round(g * 0.45);
          b = Math.round(b * 0.45);
        }
      }

      data[p] = r;
      data[p + 1] = g;
      data[p + 2] = b;
      data[p + 3] = alphaByte;
    }
  }

  ctx.putImageData(imgData, 0, 0);
  return { minVal: minV, maxVal: maxV };
}
