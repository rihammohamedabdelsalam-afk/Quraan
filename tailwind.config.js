/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Cairo"', '"Tajawal"', 'system-ui', 'sans-serif'],
      },
      colors: {
        ink: '#1F2A24',
        paper: '#F6F4EE',
        moss: {
          50: '#F1F6F2',
          100: '#DCEAE0',
          300: '#9FC4AA',
          500: '#4E8D62',
          600: '#3D7250',
          700: '#2F5A3F',
        },
        clay: {
          400: '#D89468',
          500: '#C77B4A',
        },
      },
    },
  },
  plugins: [],
};
