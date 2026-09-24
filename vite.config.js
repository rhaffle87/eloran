import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

function getVercelPreviewHeaders() {
  try {
    const vercelConfigPath = fileURLToPath(new URL('./vercel.json', import.meta.url))
    const vercelConfig = JSON.parse(fs.readFileSync(vercelConfigPath, 'utf-8'))
    const globalHeaderRule = vercelConfig.headers?.find(
      (h) => h.source === '/(.*)'
    )
    if (!globalHeaderRule?.headers) return {}
    const headers = {}
    for (const h of globalHeaderRule.headers) {
      headers[h.key] = h.value
    }
    return headers
  } catch (err) {
    console.warn('Failed to load vercel.json headers for preview:', err)
    return {}
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
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
})
