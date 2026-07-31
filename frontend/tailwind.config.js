/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Light palette. The token NAMES are unchanged from the old dark theme
        // on purpose — every page already styles itself through `surface`,
        // `line` and `accent`, so the whole app switches here rather than in
        // 25 files. Values are warm-neutral rather than pure gray, so the amber
        // accent doesn't look out of place next to them.
        pokemon: {
          red: '#DC2626',
          yellow: '#B45309',    // amber dark enough to read as TEXT on light
          blue: '#0369A1',
          dark: '#FAFAF8',      // page background
          card: '#FFFFFF',      // surface
        },
        surface: {
          DEFAULT: '#FFFFFF',   // panels
          2: '#F5F4F0',         // inset / secondary fills
          3: '#EBE9E3',         // pressed / tertiary
        },
        line: '#E4E1D9',        // hairline borders
        // Text scale. `ink` replaces what used to be white-on-dark.
        ink: {
          DEFAULT: '#1A1A17',   // primary text
          2: '#44443F',         // secondary
          3: '#6B6B63',         // muted
          4: '#93938A',         // hints / placeholders
        },
        accent: {
          DEFAULT: '#F0B429',   // brand amber — fills and highlights
          soft: '#FDF3D7',      // tinted background
          ink: '#7A4E07',       // amber that passes AA as text on light
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        display: ['Sora', 'Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        // Light UI needs far softer shadows than dark UI — on white a heavy
        // shadow reads as dirt rather than depth.
        card: '0 1px 2px rgba(26,26,23,.04), 0 8px 24px -16px rgba(26,26,23,.12)',
        lift: '0 2px 4px rgba(26,26,23,.05), 0 12px 32px -16px rgba(26,26,23,.18)',
        glow: '0 0 0 1px rgba(240,180,41,.45), 0 8px 28px -12px rgba(240,180,41,.35)',
      },
      keyframes: {
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        shimmer: {
          '100%': { transform: 'translateX(100%)' },
        },
        scan: {
          '0%, 100%': { transform: 'translateY(2px)' },
          '50%': { transform: 'translateY(116px)' },
        },
      },
      animation: {
        'fade-up': 'fade-up .35s ease-out both',
        shimmer: 'shimmer 1.4s infinite',
        scan: 'scan 2.8s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}
