/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// In dev, serve from root; for production builds, serve under the GitHub Pages
// project path. Override either with VITE_BASE.
export default defineConfig(({ command }) => ({
  base: process.env.VITE_BASE ?? (command === 'build' ? '/recovery-trail/' : '/'),
  plugins: [react()],
  worker: {
    format: 'es',
  },
  test: {
    include: ['src/**/*.test.ts'],
    // Date bucketing is offset-derived (timezone-independent) by design; pin TZ
    // anyway so any future locale-sensitive assertion stays deterministic in CI.
    environment: 'node',
    env: { TZ: 'America/Los_Angeles' },
  },
}))
