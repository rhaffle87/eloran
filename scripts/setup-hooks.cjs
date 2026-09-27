/**
 * Git Hook Installer
 * 
 * Automatically called on 'npm install' via the 'prepare' script in package.json.
 * Installs the pre-commit hook that runs scripts/verify-secrets.cjs.
 * Gracefully no-ops in environments without a .git directory (e.g. CI containers).
 */
const fs = require('fs');
const path = require('path');

const gitHooksDir = path.join(__dirname, '..', '.git', 'hooks');

if (fs.existsSync(gitHooksDir)) {
  const preCommitHook = path.join(gitHooksDir, 'pre-commit');
  const hookContent = '#!/bin/sh\nnode scripts/verify-secrets.cjs\n';
  try {
    if (fs.existsSync(preCommitHook)) {
      const existing = fs.readFileSync(preCommitHook, 'utf8');
      if (existing.includes('verify-secrets.cjs')) {
        console.log('[HOOKS] Secret guard pre-commit hook is already installed.');
        process.exit(0);
      }
      console.warn('[HOOKS] Notice: Existing custom .git/hooks/pre-commit detected.');
      console.warn('[HOOKS] Preserving existing hook without overwriting. To enable secret guard, add "node scripts/verify-secrets.cjs" to your hook.');
      process.exit(0);
    }
    fs.writeFileSync(preCommitHook, hookContent, { mode: 0o755 });
    // Attempt to set executable permissions on POSIX systems
    try {
      fs.chmodSync(preCommitHook, 0o755);
    } catch (e) {
      // Windows file systems ignore chmod, which is fine
    }
    console.log('[HOOKS] Successfully installed .git/hooks/pre-commit secret guard.');
  } catch (err) {
    console.warn('[HOOKS] Warning: Could not write .git/hooks/pre-commit:', err.message);
  }
} else {
  console.log('[HOOKS] No .git/hooks directory found; skipping hook installation.');
}
