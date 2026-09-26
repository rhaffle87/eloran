/**
 * OpenFreeMap Upstream Style Refresher & Sanitizer
 * 
 * Fetches the latest vector styles from OpenFreeMap upstream,
 * applies the MapLibre runtime sanitizer to wrap null-vulnerable
 * comparisons (coalesce/to-number), and updates local fallback JSONs.
 */
const fs = require('fs');
const path = require('path');

function sanitizeExpr(expr) {
  if (!expr) return expr;
  if (Array.isArray(expr)) {
    const op = expr[0];
    const args = expr.slice(1).map(sanitizeExpr);

    if (['<', '<=', '>', '>='].includes(op)) {
      const sanitizedArgs = args.map(arg => {
        if (Array.isArray(arg) && arg[0] === 'get') {
          return ['coalesce', ['to-number', arg], 0];
        }
        return arg;
      });
      return [op, ...sanitizedArgs];
    }

    return [op, ...args];
  }

  if (typeof expr === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(expr)) {
      out[k] = sanitizeExpr(v);
    }
    return out;
  }

  return expr;
}

function sanitizeStyle(style) {
  const cloned = JSON.parse(JSON.stringify(style));
  let modifiedLayers = 0;

  if (Array.isArray(cloned.layers)) {
    for (const layer of cloned.layers) {
      const before = JSON.stringify(layer);
      if (layer.filter) layer.filter = sanitizeExpr(layer.filter);
      if (layer.paint) layer.paint = sanitizeExpr(layer.paint);
      if (layer.layout) layer.layout = sanitizeExpr(layer.layout);
      if (JSON.stringify(layer) !== before) {
        modifiedLayers++;
      }
    }
  }

  return { style: cloned, modifiedLayers };
}

async function refresh() {
  console.log('Fetching upstream OpenFreeMap styles...');
  const targets = [
    { name: 'dark', file: 'openfreemap-dark.json' },
    { name: 'bright', file: 'openfreemap-bright.json' }
  ];

  for (const t of targets) {
    const url = `https://tiles.openfreemap.org/styles/${t.name}`;
    console.log(`Downloading ${url}...`);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to download ${url}: HTTP ${res.status}`);
    const raw = await res.json();
    const { style: sanitized, modifiedLayers } = sanitizeStyle(raw);
    const dest = path.join(__dirname, '..', 'src', 'lib', 'styles', t.file);
    fs.writeFileSync(dest, JSON.stringify(sanitized, null, 2), 'utf8');
    console.log(`Saved sanitized upstream style to ${t.file} (${modifiedLayers} layers patched).`);
  }
  console.log('Refresh completed successfully.');
}

refresh().catch(err => {
  console.error('Error refreshing styles:', err);
  process.exit(1);
});
