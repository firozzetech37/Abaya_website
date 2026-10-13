/** @type {import('tailwindcss').Config} */
module.exports = {
  // The app is light-only (app.config userInterfaceStyle 'light'). 'class' lets Expo set that
  // scheme on the web; NativeWind's default 'media' throws "Cannot manually set color scheme".
  darkMode: 'class',
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset'), require('@abaya/config/tailwind')],
  theme: {
    extend: {
      // Same type as the website: Inter for text, Cormorant Garamond for display headings.
      // Each weight is its own font file (loaded in app/_layout.tsx), so components/text.tsx
      // picks the file from the font-* weight class; these are the defaults.
      fontFamily: {
        sans: ['Inter_400Regular'],
        'sans-medium': ['Inter_500Medium'],
        'sans-semibold': ['Inter_600SemiBold'],
        'sans-bold': ['Inter_700Bold'],
        display: ['CormorantGaramond_600SemiBold'],
        'display-medium': ['CormorantGaramond_500Medium'],
        'display-bold': ['CormorantGaramond_700Bold'],
        'display-italic': ['CormorantGaramond_500Medium_Italic'],
      },
      colors: {
        sand: { 50: '#FBF8F3', 100: '#F5EFE5', 200: '#EADFCD' },
        // Antique gold accents (stars, hairlines, highlights) next to the deep green — as on the website.
        gold: {
          50: '#FBF6E9',
          100: '#F5EACB',
          200: '#EBD59C',
          300: '#DDBB6B',
          400: '#CCA24A',
          500: '#B48734',
          600: '#95692A',
          700: '#765124',
        },
      },
    },
  },
  plugins: [],
};
