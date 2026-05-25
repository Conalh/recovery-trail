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
}))
