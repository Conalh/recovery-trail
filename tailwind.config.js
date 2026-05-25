/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Geist', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'Consolas', 'monospace'],
      },
      colors: {
        // Prototype palette
        bg: '#0b1015',
        panel: '#0f161d',
        panelDeep: '#070b0f',
        panelLine: 'rgba(255,255,255,0.05)',
        ink: '#d8e4ed',
        muted: 'rgba(216,228,237,0.55)',
        faint: 'rgba(216,228,237,0.32)',
        fainter: 'rgba(216,228,237,0.18)',
        rust: '#e85d4a',
        rustMild: '#c46a55',
        flat: '#1c252e',
        tealMild: '#1f5b6e',
        teal: '#2a8aa3',
        amber: '#e0a458',
      },
    },
  },
  plugins: [],
}
