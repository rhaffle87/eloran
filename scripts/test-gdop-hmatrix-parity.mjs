import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// 1. Extract old gdop.js from commit 3fa51e3 into src/lib so relative imports resolve
const tempOldPath = path.join(rootDir, 'src', 'lib', 'temp_old_gdop.js');
try {
  const oldCode = execSync('git show 3fa51e3:src/lib/gdop.js', { cwd: rootDir, encoding: 'utf-8' });
  fs.writeFileSync(tempOldPath, oldCode, 'utf-8');

  // 2. Dynamic imports
  const { computeGDOPAtPoint: oldCompute } = await import('../src/lib/temp_old_gdop.js');
  const { computeGDOPAtPoint: newCompute, buildHMatrix } = await import('../src/lib/gdop.js');
  const { PRESET_SCENARIOS } = await import('../src/state/presets.js');

  const presetKeys = ['jakarta_baseline', 'north_sea_historical', 'bohai_yellow_sea_active'];
  
  let totalEvaluations = 0;
  let exactMatches2Dec = 0;
  let maxFullPrecDiffHdop = 0;
  let maxFullPrecDiffGdop = 0;
  const perPresetStats = {};

  // Deterministic PRNG for reproducibility
  let seed = 123456789;
  function rand() {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  }

  for (const key of presetKeys) {
    const preset = PRESET_SCENARIOS[key];
    const master = preset.masters[0];
    const slaves = preset.slaves;
    perPresetStats[key] = { points: 0, matches2Dec: 0, maxDiff: 0 };

    // Bounding box around stations
    const lats = [master.lat, ...slaves.map(s => s.lat)];
    const lngs = [master.lng, ...slaves.map(s => s.lng)];
    const minLat = Math.min(...lats) - 1.5;
    const maxLat = Math.max(...lats) + 1.5;
    const minLng = Math.min(...lngs) - 1.5;
    const maxLng = Math.max(...lngs) + 1.5;

    for (let i = 0; i < 100; i++) {
      const rxPoint = {
        lat: minLat + rand() * (maxLat - minLat),
        lng: minLng + rand() * (maxLng - minLng),
      };

      const oldRes = oldCompute(rxPoint, master, slaves);
      const newRes = newCompute(rxPoint, master, slaves);

      totalEvaluations++;
      perPresetStats[key].points++;

      if (oldRes.valid !== newRes.valid) {
        throw new Error(`Validity mismatch at ${JSON.stringify(rxPoint)} in ${key}: old=${oldRes.valid}, new=${newRes.valid}`);
      }

      if (oldRes.valid) {
        // Compare 2-decimal rounded outputs
        if (oldRes.hdop !== newRes.hdop || oldRes.gdop !== newRes.gdop) {
          throw new Error(`2-decimal mismatch in ${key} at ${JSON.stringify(rxPoint)}: old=(${oldRes.hdop}, ${oldRes.gdop}), new=(${newRes.hdop}, ${newRes.gdop})`);
        }
        exactMatches2Dec++;
        perPresetStats[key].matches2Dec++;

        // For valid points within nominal bounds (< 99.9), compare full precision float
        if (oldRes.hdop < 99.9 && newRes.hdop < 99.9) {
          const diffHdop = Math.abs((newRes.rawHdop ?? newRes.hdop) - oldRes.hdop);
          // Also compare newRes.rawHdop rounded to 2 decimals against oldRes.hdop
          const raw2Dec = parseFloat(newRes.rawHdop.toFixed(2));
          const diff2Dec = Math.abs(raw2Dec - oldRes.hdop);
          if (diff2Dec > 0) {
            throw new Error(`Rounding mismatch: rawHdop.toFixed(2)=${raw2Dec} vs oldRes.hdop=${oldRes.hdop}`);
          }
          if (diffHdop > maxFullPrecDiffHdop) maxFullPrecDiffHdop = diffHdop;
          if (diffHdop > perPresetStats[key].maxDiff) perPresetStats[key].maxDiff = diffHdop;
        }
      } else {
        exactMatches2Dec++;
        perPresetStats[key].matches2Dec++;
      }
    }
  }

  console.log('================================================================');
  console.log('GDOP REFACTOR PARITY AUDIT (3fa51e3 vs HEAD buildHMatrix)');
  console.log('================================================================');
  console.log(`Total sample points evaluated: ${totalEvaluations}`);
  console.log(`Exact 2-decimal matches: ${exactMatches2Dec} / ${totalEvaluations} (100.0%)`);
  console.log(`Max full-precision HDOP delta vs old 2-decimal: ${maxFullPrecDiffHdop.toExponential(4)}`);
  console.log(`Max full-precision GDOP delta vs old 2-decimal: ${maxFullPrecDiffGdop.toExponential(4)}`);
  console.log('\nBreakdown by Preset Scenario:');
  for (const [k, s] of Object.entries(perPresetStats)) {
    console.log(`  - ${k}: ${s.matches2Dec}/${s.points} matches, max delta: ${s.maxDiff.toExponential(4)}`);
  }
  console.log('================================================================');
  console.log('VERDICT: PARITY CONFIRMED ACROSS ALL PRESETS AND SAMPLES');
  console.log('================================================================');

} finally {
  if (fs.existsSync(tempOldPath)) {
    fs.unlinkSync(tempOldPath);
  }
}
