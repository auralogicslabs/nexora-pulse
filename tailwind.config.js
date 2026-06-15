/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./frontend/**/*.{tsx,ts,jsx,js}'],
  theme: {
    extend: {
      colors: {
        // ── Comvi-inspired brand palette ───────────────────────
        // Deep teal sidebar
        teal: {
          50:  '#EFFBF9',
          100: '#D4F3EE',
          200: '#A8E6DD',
          300: '#74D0C3',
          400: '#3FB2A4',
          500: '#1F8E84',
          600: '#13716A',
          700: '#0F5A55',
          800: '#0E4D4D',
          900: '#0B3D3D',
          950: '#072828',
        },
        // Orange CTA / active accent
        brand: {
          50:  '#FFF4ED',
          100: '#FFE6D5',
          200: '#FECCAA',
          300: '#FDA674',
          400: '#FB7E3C',
          500: '#F97316',
          600: '#EA670C',
          700: '#C2530C',
          800: '#9A4411',
          900: '#7C3911',
        },
        // Warm cream background
        cream: {
          50:  '#FDFBF5',
          100: '#FAF8F2',
          200: '#F4EFE2',
          300: '#EBE3D0',
          400: '#D9CDB1',
          500: '#C5B695',
        },
        // Legacy "pulse" mapped to teal so existing classes don't break.
        pulse: {
          50:  '#EFFBF9',
          100: '#D4F3EE',
          200: '#A8E6DD',
          300: '#74D0C3',
          400: '#3FB2A4',
          500: '#1F8E84',
          600: '#13716A',
          700: '#0F5A55',
          800: '#0E4D4D',
          900: '#0B3D3D',
          950: '#072828',
        },
      },
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      borderRadius: {
        'lg':  '8px',
        'xl':  '8px',
        '2xl': '8px',
        '3xl': '10px',
      },
      boxShadow: {
        'np-card':       '0 1px 2px 0 rgb(15 23 42 / 0.04), 0 1px 6px 0 rgb(15 23 42 / 0.04)',
        'np-card-hover': '0 4px 12px -2px rgb(15 23 42 / 0.08), 0 2px 6px -1px rgb(15 23 42 / 0.05)',
        'np-modal':      '0 24px 80px -12px rgb(15 23 42 / 0.30), 0 8px 24px -6px rgb(15 23 42 / 0.15)',
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4,0,0.6,1) infinite',
        'fade-in':    'fadeIn 0.2s ease-out',
        'slide-up':   'slideUp 0.25s ease-out',
      },
      keyframes: {
        fadeIn:  { from: { opacity: '0' }, to: { opacity: '1' } },
        slideUp: { from: { opacity: '0', transform: 'translateY(8px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
      },
    },
  },
  plugins: [
    require('@tailwindcss/forms'),
  ],
};
