const fs = require('fs');
const path = require('path');

function walk(dir) {
  let results = [];
  if (!fs.existsSync(dir)) return results;
  const list = fs.readdirSync(dir);
  for (const file of list) {
    if (file === 'node_modules' || file === '.git' || file === 'dist' || file === '.tempmediaStorage') continue;
    const full = path.join(dir, file);
    const stat = fs.statSync(full);
    if (stat && stat.isDirectory()) {
      results = results.concat(walk(full));
    } else if (/\.(jsx?|tsx?|css|html|json|md)$/.test(file)) {
      results.push(full);
    }
  }
  return results;
}

// Patterns that characteristically indicate CP1252 / ISO-8859-1 decoding of UTF-8 multi-byte sequences
// For instance:
// â€™ (right quote), â€” (em dash), â€“ (en dash), â€œ / â€ (quotes)
// ΓÇô (em dash), ΓÇó (bullet), Γ£ô (checkmark), Γôÿ (info icon)
// ┬▒ (±), ┬╡ (µ), ┬░ (°)
// ╧â (σ), ╬╖ (η), ╬ö (Δ)
// \uFFFD (Unicode replacement character )
const MOJIBAKE_PATTERNS = [
  { name: 'Unicode Replacement Char (\uFFFD)', regex: /\uFFFD/ },
  { name: 'Windows-1252 em-dash/bullet (ΓÇô, ΓÇó, Γ£ô, Γôÿ)', regex: /Γ[Ç£ôöòûÿÖÜø¥áíóúñÑªº¿®¬½¼¡«»]/ },
  { name: 'Windows-1252 symbols (┬▒, ┬╡, ┬░, ┬·)', regex: /┬[▒╡▓│┤╣║╗╝╜╛┐└┴┬├─┼╞╟╚╔╩╦╠═╬°·]/ },
  { name: 'Windows-1252 sigma/eta/delta (╧â, ╬╖, ╬ö)', regex: /[╧╬][â╖ö]/ },
  { name: 'UTF-8 decoded as CP1252 quotes/dashes (â€™, â€”, â€œ)', regex: /â€[™—–œ\u009d\u009c]/ },
  { name: 'Corrupted multiplication/division (k├ù)', regex: /├ù/ },
];

const files = [
  ...walk('src'),
  ...walk('docs'),
  ...walk('.').filter(f => !f.includes(path.sep + 'src') && !f.includes(path.sep + 'docs'))
];
let totalMatches = 0;
const report = [];

for (const filePath of files) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');

  lines.forEach((line, index) => {
    for (const pattern of MOJIBAKE_PATTERNS) {
      if (pattern.regex.test(line)) {
        totalMatches++;
        report.push({
          file: filePath,
          line: index + 1,
          pattern: pattern.name,
          text: line.trim(),
        });
        break;
      }
    }
  });
}

console.log('════════════════════════════════════════════════════════');
console.log('         FULL-REPO MOJIBAKE & CORRUPTION SCAN           ');
console.log('════════════════════════════════════════════════════════');
console.log(`Total files scanned: ${files.length}`);
console.log(`Total mojibake lines found: ${totalMatches}`);

if (report.length > 0) {
  console.log('\nFindings:');
  report.forEach((r) => {
    console.log(`  ${r.file}:${r.line} [${r.pattern}]`);
    console.log(`    ${r.text}`);
  });
} else {
  console.log('\n✓ Clean! No mojibake or corrupt multi-byte character sequences detected across src/.');
}
console.log('════════════════════════════════════════════════════════');
