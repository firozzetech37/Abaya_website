/** @type {import('tailwindcss').Config} */
module.exports = {
  presets: [require('@abaya/config/tailwind')],
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  theme: {
    extend: {
      keyframes: {
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'zoom-in': { from: { opacity: '0', transform: 'translate(-50%, -48%) scale(0.97)' }, to: { opacity: '1', transform: 'translate(-50%, -50%) scale(1)' } },
      },
      animation: {
        'fade-in': 'fade-in 120ms ease-out',
        'zoom-in': 'zoom-in 140ms ease-out',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};
