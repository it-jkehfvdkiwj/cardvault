/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        pokemon: {
          red: '#CC0000',
          yellow: '#FFCB05',
          blue: '#003A70',
          dark: '#1a1a2e',
          card: '#16213e',
        },
      },
    },
  },
  plugins: [],
}
