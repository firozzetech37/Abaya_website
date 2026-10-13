/** @type {import('tailwindcss').Config} */
module.exports = {
  presets: [require('@abaya/config/tailwind')],
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './content/**/*.ts', './lib/**/*.{ts,tsx}'],
  theme: {
    container: { center: true, padding: { DEFAULT: '1rem', sm: '1.5rem', lg: '2.5rem' }, screens: { '2xl': '1440px' } },
    extend: {
      fontFamily: {
        sans: ['var(--font-sans)', 'Inter', 'system-ui', 'sans-serif'],
        display: ['var(--font-display)', '"Playfair Display"', 'Georgia', 'serif'],
      },
      colors: {
        // Gulf palette (docs/apps/web.md "Look and feel"): desert neutrals for the canvas, deep
        // burgundy for the brand, jewel tones for highlights only, antique gold for ornaments.
        sand: { 50: '#FBF7EF', 100: '#F5EBDA', 200: '#EADBC2', 300: '#D9C3A2', 400: '#C19A6B', 500: '#8A7362' },
        // Warm desert neutrals replace the grey scale: text, hairlines and surfaces all sit on champagne.
        neutral: {
          50: '#FBF7EF',
          100: '#F5EBDA',
          200: '#EADBC2',
          300: '#D9C3A2',
          400: '#B59A78',
          500: '#7D6B5A',
          600: '#61513F',
          700: '#4A3C31',
          800: '#32291F',
          900: '#231C17',
          950: '#15100D',
        },
        background: '#F8F2E7',
        surface: '#FFFCF6',
        foreground: '#231C17',
        muted: '#7D6B5A',
        border: '#EADBC2',
        // Deep burgundy for the brand: buttons, links, dark panels, footer (gold on burgundy is the classic pairing).
        accent: {
          50: '#F6E8EA',
          100: '#EBCDD1',
          200: '#DCA7AF',
          300: '#C97E8A',
          400: '#B05A69',
          500: '#93394B',
          600: '#7C2B3A',
          700: '#6B1F2A',
          800: '#581823',
          900: '#44111B',
          950: '#2E0D14',
        },
        primary: '#6B1F2A',
        // Dusty rose and mauve: the secondary tones (eyebrows, small labels, soft glows).
        rose: { 100: '#F7E6E6', 200: '#EFCFD0', 300: '#DDA7AA', 400: '#C98388', 500: '#AD6068', 600: '#8E4A52', 700: '#6F3840' },
        mauve: { 100: '#F1E6EA', 200: '#E3CFD7', 300: '#CDB0BD', 400: '#B393A3', 500: '#97788A' },
        jewel: { maroon: '#7A2E3B', plum: '#5E3A63', teal: '#1F5F66', brick: '#9A4A33' },
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
      keyframes: {
        'accordion-down': { from: { height: '0' }, to: { height: 'var(--radix-accordion-content-height)' } },
        'accordion-up': { from: { height: 'var(--radix-accordion-content-height)' }, to: { height: '0' } },
        'fade-up': { from: { opacity: '0', transform: 'translateY(18px)' }, to: { opacity: '1', transform: 'none' } },
        float: { '0%, 100%': { transform: 'translate3d(0, 0, 0)' }, '50%': { transform: 'translate3d(0, -14px, 0)' } },
        'float-soft': { '0%, 100%': { transform: 'translate3d(0, 0, 0)' }, '50%': { transform: 'translate3d(0, -8px, 0)' } },
        shine: { from: { transform: 'translateX(-120%) skewX(-20deg)' }, to: { transform: 'translateX(220%) skewX(-20deg)' } },
        pop: { '0%': { transform: 'scale(0.4)' }, '60%': { transform: 'scale(1.18)' }, '100%': { transform: 'scale(1)' } },
        // Editorial hero: a slow push-in on the active photo, and the slide's progress bar.
        'ken-burns': { from: { transform: 'scale(1.04)' }, to: { transform: 'scale(1.14)' } },
        'push-in': { from: { transform: 'scale(1)' }, to: { transform: 'scale(1.06)' } },
        breathe: { '0%, 100%': { transform: 'scale(1)' }, '50%': { transform: 'scale(1.07)' } },
        progress: { from: { transform: 'scaleX(0)' }, to: { transform: 'scaleX(1)' } },
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        // Masked text: words rise out of an invisible line (hero, section titles).
        rise: { from: { transform: 'translateY(110%)', opacity: '0' }, to: { transform: 'none', opacity: '1' } },
        // One silk sheen across the hero doorway on first paint.
        'sheen-once': { from: { transform: 'translateX(-130%) skewX(-18deg)' }, to: { transform: 'translateX(230%) skewX(-18deg)' } },
        // A soft gold glint travelling across the arabesque patterns.
        glint: { '0%, 100%': { transform: 'translateX(-60%)' }, '50%': { transform: 'translateX(160%)' } },
        // Shimmering fabric placeholder while an AI picture is made.
        shimmer: { from: { transform: 'translateX(-100%)' }, to: { transform: 'translateX(100%)' } },
        // The arch monogram draws itself.
        draw: { from: { strokeDashoffset: '1' }, to: { strokeDashoffset: '0' } },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
        'fade-up': 'fade-up 0.8s cubic-bezier(0.22, 1, 0.36, 1) both',
        float: 'float 9s ease-in-out infinite',
        'float-soft': 'float-soft 8s ease-in-out infinite',
        pop: 'pop 0.45s cubic-bezier(0.22, 1, 0.36, 1)',
        'ken-burns': 'ken-burns 7s linear both',
        'push-in': 'push-in 7s linear both',
        breathe: 'breathe 18s ease-in-out infinite',
        progress: 'progress 6s linear both',
        'fade-in': 'fade-in 0.6s ease both',
        rise: 'rise 1s cubic-bezier(0.22, 1, 0.36, 1) both',
        'sheen-once': 'sheen-once 1.6s cubic-bezier(0.4, 0, 0.2, 1) 0.9s both',
        glint: 'glint 11s ease-in-out infinite',
        shimmer: 'shimmer 1.8s ease-in-out infinite',
        draw: 'draw 1.6s cubic-bezier(0.22, 1, 0.36, 1) both',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};
