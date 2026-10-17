/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        stage: {
          bg: '#0a0d14',
          surface: '#121824',
          card: '#182030',
          border: '#222f46',
          accent: '#3b82f6',
          amber: '#f59e0b',
          emerald: '#10b981',
          rose: '#f43f5e',
          text: '#f1f5f9',
          muted: '#94a3b8'
        }
      },
      fontFamily: {
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', 'monospace']
      }
    },
  },
  plugins: [],
}
