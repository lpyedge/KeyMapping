/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,svelte}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#f0f8ff',
          500: '#34b3ff',
          600: '#1492df',
          700: '#0d6ea7'
        }
      }
    }
  },
  plugins: []
};
