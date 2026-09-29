import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

try {
  const realCwd = fs.realpathSync(process.cwd());
  if (realCwd !== process.cwd()) {
    process.chdir(realCwd);
  }
} catch {
  // ignore
}

function getVercelPreviewHeaders() {
  try {
    const vercelConfigPath = fileURLToPath(new URL('./vercel.json', import.meta.url));
    const vercelConfig = JSON.parse(fs.readFileSync(vercelConfigPath, 'utf-8'));
    const globalHeaderRule = vercelConfig.headers?.find(
      (h) => h.source === '/(.*)'
    );
    if (!globalHeaderRule?.headers) return {};
    const headers = {};
    for (const h of globalHeaderRule.headers) {
      headers[h.key] = h.value;
    }
    return headers;
  } catch (err) {
    console.warn('Failed to load vercel.json headers for preview:', err);
    return {};
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const isE2E = mode === 'e2e' || mode === 'development';
  let appVersion = 'v1.1';
  try {
    const pkgPath = fileURLToPath(new URL('./package.json', import.meta.url));
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    appVersion = `v${pkg.version.split('.').slice(0, 2).join('.')}`;
  } catch (e) {
    console.warn('Failed to read package.json version:', e);
  }
  return {
    define: {
      __E2E_HOOKS__: JSON.stringify(isE2E),
      __APP_VERSION__: JSON.stringify(appVersion),
    },
    plugins: [react()],
    server: {
      fs: {
        allow: ['..', 'e:/Projects/simuloran'],
      },
    },
    preview: {
      port: 4173,
      headers: getVercelPreviewHeaders(),
    },
    test: {
      globals: true,
      environment: 'node',
      exclude: ['**/node_modules/**', '**/dist/**', '**/e2e/**'],
    },
    build: {
      chunkSizeWarningLimit: 1500,
      rollupOptions: {
        output: {
          manualChunks: {
            react: ['react', 'react-dom', 'react-router-dom'],
            maplibre: ['maplibre-gl'],
          },
        },
      },
    },
  };
});
