/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{js,ts,jsx,tsx}', './components/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#0F1C2E',
        paper: '#F3F5F7',
        mist: '#D8DEE6',
        sea: '#0D7377',
        seaDark: '#095456',
        sand: '#E8EDF2',
        alert: '#B42318',
      },
      fontFamily: {
        display: ['var(--font-display)', 'Georgia', 'serif'],
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        soft: '0 12px 40px rgba(15, 28, 46, 0.08)',
      },
    },
  },
  plugins: [],
};
