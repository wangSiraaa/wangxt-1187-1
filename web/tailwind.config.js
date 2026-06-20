/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        base: {
          950: '#080b0f',
          900: '#0c1117',
          850: '#10161f',
          800: '#141c27',
          700: '#1b2531',
          600: '#243140',
          500: '#33414f',
        },
        steel: {
          400: '#7e8a99',
          300: '#9ba6b4',
          200: '#c3ccd6',
        },
        amber: {
          DEFAULT: '#f5a623',
          glow: '#ffb02e',
        },
        signal: {
          online: '#34d399',
          waiting: '#f5a623',
          maintaining: '#38bdf8',
          offline: '#f43f5e',
          pending: '#a78bfa',
        },
      },
      fontFamily: {
        display: ['"Saira Condensed"', '"Noto Sans SC"', 'sans-serif'],
        sans: ['"Noto Sans SC"', '"IBM Plex Sans"', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', '"IBM Plex Mono"', 'monospace'],
      },
      boxShadow: {
        'amber-glow': '0 0 0 1px rgba(245,166,35,0.35), 0 0 24px -6px rgba(245,166,35,0.45)',
      },
      keyframes: {
        pulseDot: {
          '0%,100%': { opacity: '1', transform: 'scale(1)' },
          '50%': { opacity: '0.35', transform: 'scale(0.8)' },
        },
        scan: {
          '0%': { transform: 'translateY(-100%)' },
          '100%': { transform: 'translateY(2000%)' },
        },
        riseIn: {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        pulseDot: 'pulseDot 1.6s ease-in-out infinite',
        scan: 'scan 6s linear infinite',
        riseIn: 'riseIn 0.4s ease-out both',
      },
    },
  },
  plugins: [],
}
