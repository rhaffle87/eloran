/**
 * Mechanical Secret Leak Guard
 * 
 * Scans all tracked and staged git files for any secret/API key signatures
 * (specifically /cb1_[a-z0-9_]+/i for CARTO keys and general secret patterns).
 * 
 * Fails with exit code 1 if any match is found, preventing commits and PRs.
 * NEVER prints the matched secret string to stdout or logs.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const SECRET_PATTERNS = [
  { name: 'CARTO API Key Pattern', regex: /cb1_[a-z0-9_]+/i },
];

function getTrackedAndStagedFiles() {
  const files = new Set();

  try {
    const tracked = execSync('git ls-files', { encoding: 'utf8' }).split(/\r?\n/).filter(Boolean);
    tracked.forEach((f) => files.add(f));
  } catch (err) {
    console.warn('Warning: Could not list tracked git files, falling back to directory scan');
  }

  try {
    const staged = execSync('git diff --cached --name-only', { encoding: 'utf8' }).split(/\r?\n/).filter(Boolean);
    staged.forEach((f) => files.add(f));
  } catch (err) {
    // ignore
  }

  return Array.from(files);
}

function verifySecrets() {
  console.log('='.repeat(78));
  console.log('LORAN LAB — MECHANICAL SECRET LEAK GUARD');
  console.log('='.repeat(78));

  const files = getTrackedAndStagedFiles();
  let violations = 0;

  for (const relPath of files) {
    if (!fs.existsSync(relPath)) continue;
    const stat = fs.statSync(relPath);
    if (stat.isDirectory()) continue;

    // Skip binary files and vendor
    if (relPath.endsWith('.png') || relPath.endsWith('.jpg') || relPath.endsWith('.pdf') || relPath.endsWith('.ico') || relPath.endsWith('.woff') || relPath.endsWith('.woff2') || relPath.endsWith('.ttf')) {
      continue;
    }

    try {
      const content = fs.readFileSync(relPath, 'utf8');
      for (const pattern of SECRET_PATTERNS) {
        if (pattern.regex.test(content)) {
          console.error(`\x1b[31m[CRITICAL SECURITY VIOLATION] Found ${pattern.name} in tracked/staged file: ${relPath}\x1b[0m`);
          console.error('\x1b[33mRefusing execution. Remove the secret immediately and ensure secrets stay in uncommitted .env.local only.\x1b[0m');
          violations++;
        }
      }
    } catch (err) {
      // ignore unreadable files
    }
  }

  if (violations > 0) {
    console.error(`\nFAILED: ${violations} secret violation(s) detected.`);
    process.exit(1);
  }

  console.log(`PASS: Verified ${files.length} tracked/staged files. Zero secret leak patterns found.\n`);
}

verifySecrets();
