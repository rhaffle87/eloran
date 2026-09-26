/**
 * Safe Sandboxed ASF (Additional Secondary Factor) Expression Evaluator & Millington Mixed-Path Library
 * Implements:
 * 1. Safe AST Recursive Descent Expression Parser (Strict Whitelist, No eval)
 * 2. Physical Mixed-Path Groundwave ASF via Millington's Method (ITU-R P.832 & Williams & Last 2000)
 */

import { SPEED_OF_LIGHT, haversineDistance } from './geodesy.js';
import {
  computeMixedPathAsfMeters as computeGrwaveMixedPathAsfMeters,
  computeHomogeneousAsfMicroseconds as computeGrwaveHomogeneousAsfMicroseconds,
  computeMillingtonAsfMicroseconds as computeGrwaveMillingtonAsfMicroseconds,
  computeSurfaceImpedance,
  computeGroundwavePhaseProfile,
  ITU_GROUND_TYPES,
} from './grwave.js';

export {
  computeGrwaveMixedPathAsfMeters,
  computeGrwaveHomogeneousAsfMicroseconds,
  computeGrwaveMillingtonAsfMicroseconds,
  computeSurfaceImpedance,
  computeGroundwavePhaseProfile,
  ITU_GROUND_TYPES,
};

// Supported math functions created with null prototype to avoid prototype pollution
const ALLOWED_FUNCS = Object.create(null);
ALLOWED_FUNCS.sin = Math.sin;
ALLOWED_FUNCS.cos = Math.cos;
ALLOWED_FUNCS.tan = Math.tan;
ALLOWED_FUNCS.asin = Math.asin;
ALLOWED_FUNCS.acos = Math.acos;
ALLOWED_FUNCS.atan = Math.atan;
ALLOWED_FUNCS.sqrt = Math.sqrt;
ALLOWED_FUNCS.abs = Math.abs;
ALLOWED_FUNCS.log = Math.log;
ALLOWED_FUNCS.exp = Math.exp;
ALLOWED_FUNCS.floor = Math.floor;
ALLOWED_FUNCS.ceil = Math.ceil;
ALLOWED_FUNCS.round = Math.round;

const ALLOWED_CONSTANTS = Object.create(null);
ALLOWED_CONSTANTS.pi = Math.PI;
ALLOWED_CONSTANTS.e = Math.E;

/**
 * Tokenizes mathematical expression string into safe tokens.
 * @param {string} expr - Expression string
 * @returns {Array<{type: string, value: string|number}>}
 */
export function tokenizeAsf(expr) {
  if (typeof expr !== 'string') {
    throw new Error('Expression must be a string');
  }

  const src = expr.trim();
  if (!src) return [{ type: 'NUMBER', value: 0 }];

  const tokens = [];
  let i = 0;

  while (i < src.length) {
    const ch = src[i];

    if (/\s/.test(ch)) {
      i++;
      continue;
    }

    // Number literals (including optional decimal point and scientific notation)
    if (/[0-9]/.test(ch) || (ch === '.' && /[0-9]/.test(src[i + 1] || ''))) {
      let numStr = '';
      while (i < src.length && /[0-9.]/.test(src[i])) {
        numStr += src[i++];
      }
      if (i < src.length && (src[i] === 'e' || src[i] === 'E')) {
        numStr += src[i++];
        if (i < src.length && (src[i] === '+' || src[i] === '-')) {
          numStr += src[i++];
        }
        while (i < src.length && /[0-9]/.test(src[i])) {
          numStr += src[i++];
        }
      }
      const val = parseFloat(numStr);
      if (Number.isNaN(val)) throw new Error(`Invalid number: ${numStr}`);
      tokens.push({ type: 'NUMBER', value: val });
      continue;
    }

    // Operators and Parentheses
    if ('+-*/%^(),'.includes(ch)) {
      tokens.push({ type: ch, value: ch });
      i++;
      continue;
    }

    // Identifiers (variables, functions, constants)
    if (/[a-zA-Z_]/.test(ch)) {
      let id = '';
      while (i < src.length && /[a-zA-Z0-9_]/.test(src[i])) {
        id += src[i++];
      }
      const lower = id.toLowerCase();
      if (lower === 'lat' || lower === 'lng') {
        tokens.push({ type: 'VAR', value: lower });
      } else if (Object.prototype.hasOwnProperty.call(ALLOWED_CONSTANTS, lower)) {
        tokens.push({ type: 'NUMBER', value: ALLOWED_CONSTANTS[lower] });
      } else if (Object.prototype.hasOwnProperty.call(ALLOWED_FUNCS, lower)) {
        tokens.push({ type: 'FUNC', value: lower });
      } else {
        throw new Error(`Unauthorized symbol or function '${id}'. Only lat, lng, pi, e and standard math functions allowed.`);
      }
      continue;
    }

    throw new Error(`Forbidden character '${ch}' in expression`);
  }

  return tokens;
}

/**
 * Builds an executable AST evaluator function from tokens using Recursive Descent.
 */
class Parser {
  constructor(tokens) {
    this.tokens = tokens;
    this.pos = 0;
  }

  peek() {
    return this.tokens[this.pos];
  }

  consume(expectedType) {
    const t = this.tokens[this.pos];
    if (!t) throw new Error('Unexpected end of expression');
    if (expectedType && t.type !== expectedType) {
      throw new Error(`Expected '${expectedType}', got '${t.value}'`);
    }
    this.pos++;
    return t;
  }

  parse() {
    const node = this.expr();
    if (this.pos < this.tokens.length) {
      throw new Error(`Unexpected token '${this.tokens[this.pos].value}' after valid expression`);
    }
    return node;
  }

  expr() {
    let left = this.term();
    while (this.pos < this.tokens.length) {
      const op = this.peek();
      if (op.type === '+' || op.type === '-') {
        this.consume();
        const right = this.term();
        const l = left;
        left = op.type === '+'
          ? (ctx) => l(ctx) + right(ctx)
          : (ctx) => l(ctx) - right(ctx);
      } else {
        break;
      }
    }
    return left;
  }

  term() {
    let left = this.factor();
    while (this.pos < this.tokens.length) {
      const op = this.peek();
      if (op.type === '*' || op.type === '/' || op.type === '%') {
        this.consume();
        const right = this.factor();
        const l = left;
        if (op.type === '*') {
          left = (ctx) => l(ctx) * right(ctx);
        } else if (op.type === '/') {
          left = (ctx) => {
            const denom = right(ctx);
            return denom === 0 ? 0 : l(ctx) / denom;
          };
        } else {
          left = (ctx) => l(ctx) % right(ctx);
        }
      } else {
        break;
      }
    }
    return left;
  }

  factor() {
    let left = this.unary();
    if (this.pos < this.tokens.length && this.peek().type === '^') {
      this.consume('^');
      const right = this.factor();
      const l = left;
      left = (ctx) => Math.pow(l(ctx), right(ctx));
    }
    return left;
  }

  unary() {
    if (this.peek()?.type === '-') {
      this.consume('-');
      const operand = this.unary();
      return (ctx) => -operand(ctx);
    }
    if (this.peek()?.type === '+') {
      this.consume('+');
      return this.unary();
    }
    return this.primary();
  }

  primary() {
    const t = this.peek();
    if (!t) throw new Error('Unexpected end of expression');

    if (t.type === 'NUMBER') {
      this.consume('NUMBER');
      const val = t.value;
      return () => val;
    }

    if (t.type === 'VAR') {
      this.consume('VAR');
      const varName = t.value;
      return (ctx) => (ctx[varName] !== undefined ? ctx[varName] : 0);
    }

    if (t.type === 'FUNC') {
      const funcName = t.value;
      this.consume('FUNC');
      this.consume('(');
      const arg = this.expr();
      this.consume(')');
      const fn = ALLOWED_FUNCS[funcName];
      return (ctx) => {
        const val = fn(arg(ctx));
        return Number.isFinite(val) ? val : 0;
      };
    }

    if (t.type === '(') {
      this.consume('(');
      const inside = this.expr();
      this.consume(')');
      return inside;
    }

    throw new Error(`Unexpected token '${t.value}'`);
  }
}

/**
 * Validates an ASF formula without executing it.
 * @param {string} exprStr - User input expression
 * @returns {{valid: boolean, error?: string}}
 */
export function validateAsfExpression(exprStr) {
  try {
    const tokens = tokenizeAsf(exprStr);
    const parser = new Parser(tokens);
    const fn = parser.parse();
    const res = fn({ lat: 0, lng: 0 });
    if (!Number.isFinite(res)) {
      return { valid: false, error: 'Expression produces non-finite result (NaN or Infinity)' };
    }
    return { valid: true };
  } catch (err) {
    return { valid: false, error: err.message };
  }
}

/**
 * Compiles a user-supplied ASF expression into an executable (lat, lng) => number evaluator.
 * Throws if the expression is invalid or unauthorized.
 * @param {string} exprStr - e.g. "100 * sin((lat / 90) * pi) + 50 * cos((lng / 180) * pi)"
 * @returns {(lat: number, lng: number) => number}
 */
export function compileAsfExpression(exprStr) {
  const validation = validateAsfExpression(exprStr);
  if (!validation.valid) {
    throw new Error(validation.error || 'Invalid ASF expression');
  }
  const tokens = tokenizeAsf(exprStr);
  const parser = new Parser(tokens);
  const evaluator = parser.parse();
  return function asfEvaluator(lat, lng) {
    const val = evaluator({ lat, lng });
    return Number.isFinite(val) ? val : 0;
  };
}

/**
 * ============================================================================
 * MIXED-PATH ADDITIONAL SECONDARY FACTOR (ASF) VIA MILLINGTON'S METHOD
 *
 * Sourced ground conductivities:
 *   - ITU-R P.832-4 (2015), "World Atlas of Ground Conductivities"
 *   - ITU-R P.368-10 (2022), "Ground-wave propagation curves for frequencies
 *     between 10 kHz and 30 MHz"
 *
 * Mixed-path phase delay reference:
 *   - Williams & Last, "Mapping the ASFs of the Northwest European Loran-C System,"
 *     The Journal of Navigation, 53(2), pp. 225–235, 2000.
 *   - Millington, G. (1949), "Ground-wave propagation over an inhomogeneous smooth earth."
 * ============================================================================
 */

/**
 * Standard ground conductivity categories per ITU-R Recommendation P.832-4.
 * Conductivities in Siemens per meter (S/m).
 */
export const ITU_R_P832_CONDUCTIVITIES = {
  seawater: {
    id: 'seawater',
    label: 'Seawater (5 S/m)',
    sigma: 5.0,
    category: 'Sea',
    provenance: 'SOURCED (ITU-R P.832)',
  },
  marsh_wet_soil: {
    id: 'marsh_wet_soil',
    label: 'Highly Conductive Marsh / Wet Soil (0.01 S/m)',
    sigma: 0.01,
    category: 'Land - High',
    provenance: 'SOURCED (ITU-R P.832)',
  },
  agricultural_forest: {
    id: 'agricultural_forest',
    label: 'Agricultural / Forest Land (0.003 S/m)',
    sigma: 0.003,
    category: 'Land - Medium',
    provenance: 'SOURCED (ITU-R P.832)',
  },
  rocky_mountain: {
    id: 'rocky_mountain',
    label: 'Low Conductivity / Rocky Mountain (0.001 S/m)',
    sigma: 0.001,
    category: 'Land - Low',
    provenance: 'SOURCED (ITU-R P.832)',
  },
  very_dry_granite: {
    id: 'very_dry_granite',
    label: 'Very Dry Soil / Industrial Granite (0.0001 S/m)',
    sigma: 0.0001,
    category: 'Land - Very Low',
    provenance: 'SOURCED (ITU-R P.832)',
  },
};

/**
 * Default empirical scaling parameter for groundwave phase delay.
 * Relates conductivity deficit to phase delay in microseconds per km:
 *   asf_us = dist_km * k_scale * (1 / sqrt(sigma) - 1 / sqrt(5.0))
 * 
 * Marked UNVERIFIED: while conductivity is SOURCED, the empirical proportionality
 * constant depends on local sub-surface strata depth profiles and seasonal water tables.
 */
export const DEFAULT_MILLINGTON_SCALE = 0.0008;

/**
 * Computes homogeneous path ASF phase lag in microseconds relative to an all-seawater path.
 * Sourced: Over all-seawater (sigma >= 5 S/m), ASF is zero by definition.
 * 
 * @param {number} distKm - Path distance in kilometers (>= 0)
 * @param {number} sigma - Ground conductivity in S/m (> 0)
 * @param {number} [scale=DEFAULT_MILLINGTON_SCALE] - Empirical scale constant (UNVERIFIED)
 * @returns {number} Phase lag in microseconds (>= 0)
 */
export function computeHomogeneousAsfMicroseconds(distKm, sigma, scale = DEFAULT_MILLINGTON_SCALE) {
  if (distKm <= 0 || sigma >= 5.0) return 0;
  const safeSigma = Math.max(1e-5, sigma);
  const diff = (1.0 / Math.sqrt(safeSigma)) - (1.0 / Math.sqrt(5.0));
  return Math.max(0, distKm * scale * diff);
}

/**
 * Computes mixed-path ASF in microseconds using Millington's method.
 * Evaluates the forward path profile, reverses the path profile, and averages
 * the two to enforce electromagnetic reciprocity across land/sea boundaries.
 * 
 * @param {Array<{distKm: number, sigma: number}>} segments - Ordered path segments from Tx to Rx
 * @param {number} [scale=DEFAULT_MILLINGTON_SCALE] - Empirical scaling factor
 * @returns {number} Mixed-path ASF in microseconds
 */
export function computeMillingtonAsfMicroseconds(segments, scale = DEFAULT_MILLINGTON_SCALE) {
  if (!segments || segments.length === 0) return 0;

  // Filter out non-positive segments
  const valid = segments.filter((s) => s.distKm > 0);
  if (valid.length === 0) return 0;

  const M = valid.length;
  if (M === 1) {
    return computeHomogeneousAsfMicroseconds(valid[0].distKm, valid[0].sigma, scale);
  }

  // Cumulative boundary distances from Tx: x[0] = 0, x[1] = d1, x[2] = d1 + d2, ...
  const x = [0];
  for (let i = 0; i < M; i++) {
    x.push(x[i] + valid[i].distKm);
  }

  // 1. Forward phase evaluation (Tx -> Rx)
  // Phi_F = asf(x[1], s[0]) + sum_{k=1}^{M-1} [ asf(x[k+1], s[k]) - asf(x[k], s[k]) ]
  let phiF = computeHomogeneousAsfMicroseconds(x[1], valid[0].sigma, scale);
  for (let k = 1; k < M; k++) {
    const delta = computeHomogeneousAsfMicroseconds(x[k + 1], valid[k].sigma, scale)
                - computeHomogeneousAsfMicroseconds(x[k], valid[k].sigma, scale);
    phiF += delta;
  }

  // 2. Reverse phase evaluation (Rx -> Tx)
  const revValid = [...valid].reverse();
  const y = [0];
  for (let i = 0; i < M; i++) {
    y.push(y[i] + revValid[i].distKm);
  }

  let phiR = computeHomogeneousAsfMicroseconds(y[1], revValid[0].sigma, scale);
  for (let k = 1; k < M; k++) {
    const delta = computeHomogeneousAsfMicroseconds(y[k + 1], revValid[k].sigma, scale)
                - computeHomogeneousAsfMicroseconds(y[k], revValid[k].sigma, scale);
    phiR += delta;
  }

  // Reciprocal Millington average: (Phi_F + Phi_R) / 2
  return Math.max(0, 0.5 * (phiF + phiR));
}

/**
 * Computes mixed-path ASF in meters for a propagation path with a specified land fraction.
 * 
 * Supports:
 * - 'grwave': Rigorous ITU-R P.368 / Sommerfeld numerical distance & Millington solver (SOURCED).
 * - 'empirical': Legacy square-root conductivity deficit model (UNVERIFIED).
 * 
 * @param {object} params
 * @param {number} params.totalDistMeters - Total great circle distance in meters
 * @param {number} [params.landFraction=0.5] - Fraction of path over land [0.0 = all sea, 1.0 = all land]
 * @param {number} [params.landSigma=0.003] - Land conductivity in S/m (ITU-R P.832)
 * @param {number} [params.landEpslon=15.0] - Land relative permittivity
 * @param {number} [params.scale=DEFAULT_MILLINGTON_SCALE] - Empirical scale constant (UNVERIFIED)
 * @param {'empirical'|'grwave'} [params.method='empirical'] - Propagation calculation engine
 * @param {number} [params.freqMhz=0.1] - Frequency in MHz (100 kHz)
 * @returns {number} Additional Secondary Factor in meters
 */
export function computeMixedPathAsfMeters({
  totalDistMeters,
  landFraction = 0.5,
  landSigma = 0.003,
  landEpslon = 15.0,
  scale = DEFAULT_MILLINGTON_SCALE,
  method = 'empirical',
  freqMhz = 0.1,
}) {
  if (method === 'grwave') {
    return computeGrwaveMixedPathAsfMeters({
      totalDistMeters,
      landFraction,
      landSigma,
      landEpslon,
      freqMhz,
    });
  }

  if (totalDistMeters <= 0 || landFraction <= 0 || landSigma >= 5.0) {
    return 0;
  }

  const fLand = Math.max(0, Math.min(1.0, landFraction));
  const totalKm = totalDistMeters / 1000.0;
  const seaDistKm = (1.0 - fLand) * totalKm;
  const landDistKm = fLand * totalKm;

  // 2-segment path: Seawater (5 S/m) and Land (landSigma)
  const segments = [
    { distKm: seaDistKm, sigma: 5.0 },
    { distKm: landDistKm, sigma: landSigma },
  ];

  const asfUs = computeMillingtonAsfMicroseconds(segments, scale);
  // Convert microseconds to meters: meters = us * 1e-6 * c
  return asfUs * 1e-6 * SPEED_OF_LIGHT;
}

/**
 * Creates an ASF evaluator function (lat, lng) => asfMeters for a transmitter station
 * based on the physical Millington mixed-path model.
 * 
 * @param {object} params
 * @param {object} params.station - Station with { lat, lng }
 * @param {number} [params.landFraction=0.5] - Path land fraction [0.0 to 1.0]
 * @param {number} [params.landSigma=0.003] - Land conductivity in S/m
 * @param {number} [params.landEpslon=15.0] - Land relative permittivity
 * @param {number} [params.scale=DEFAULT_MILLINGTON_SCALE] - Scale factor
 * @param {'empirical'|'grwave'} [params.method='empirical'] - Propagation calculation engine
 * @param {number} [params.freqMhz=0.1] - Frequency in MHz (100 kHz)
 * @returns {(lat: number, lng: number) => number} Evaluator function
 */
export function createMillingtonAsfEvaluator({
  station,
  landFraction = 0.5,
  landSigma = 0.003,
  landEpslon = 15.0,
  scale = DEFAULT_MILLINGTON_SCALE,
  method = 'empirical',
  freqMhz = 0.1,
}) {
  return function millingtonEvaluator(lat, lng) {
    const distMeters = haversineDistance(station, { lat, lng });
    return computeMixedPathAsfMeters({
      totalDistMeters: distMeters,
      landFraction,
      landSigma,
      landEpslon,
      scale,
      method,
      freqMhz,
    });
  };
}

