/**
 * Safe Sandboxed ASF (Additional Secondary Factor) Expression Evaluator
 * Implements a strict Whitelist-based Recursive Descent AST Parser.
 * Never uses `eval` or `new Function` on user text.
 */

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
