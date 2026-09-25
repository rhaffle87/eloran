const fs = require('fs');
const path = require('path');

const srcDir = path.resolve(__dirname, '../src');
const extensions = ['.js', '.jsx', '.css'];

function getAllFiles(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  for (const file of list) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      results = results.concat(getAllFiles(fullPath));
    } else if (extensions.includes(path.extname(file))) {
      results.push(fullPath);
    }
  }
  return results;
}

const files = getAllFiles(srcDir);
console.log(`Auditing ${files.length} files in src/ for strict UTF-8 validity...`);

const decoder = new TextDecoder('utf-8', { fatal: true });
let invalidUtf8Files = [];
let replacementCharFiles = [];

for (const file of files) {
  const relPath = path.relative(path.resolve(__dirname, '..'), file);
  const buf = fs.readFileSync(file);
  
  // 1. Strict byte sequence decoding (equivalent to iconv -f UTF-8 -t UTF-8)
  try {
    const text = decoder.decode(buf);
    
    // 2. Also check if U+FFFD (Unicode replacement character) is present
    if (text.includes('\uFFFD')) {
      replacementCharFiles.push({ file: relPath, count: (text.match(/\uFFFD/g) || []).length });
    }
  } catch (err) {
    invalidUtf8Files.push({ file: relPath, error: err.message });
  }
}

console.log('\n--- STRICT UTF-8 VALIDATION REPORT ---');
console.log(`Total files inspected: ${files.length}`);
console.log(`Files with invalid UTF-8 byte sequences: ${invalidUtf8Files.length}`);
if (invalidUtf8Files.length > 0) {
  invalidUtf8Files.forEach(f => console.error(`  FAIL: ${f.file} - ${f.error}`));
} else {
  console.log('  PASS: All files are 100% valid UTF-8 sequences (0 byte errors).');
}

console.log(`\nFiles containing Unicode replacement character (U+FFFD): ${replacementCharFiles.length}`);
if (replacementCharFiles.length > 0) {
  replacementCharFiles.forEach(f => console.warn(`  WARN: ${f.file} (${f.count} instances)`));
} else {
  console.log('  PASS: Zero U+FFFD replacement characters found.');
}

if (invalidUtf8Files.length > 0 || replacementCharFiles.length > 0) {
  process.exit(1);
} else {
  console.log('\nStrict UTF-8 Verification: CLEAN');
  process.exit(0);
}
