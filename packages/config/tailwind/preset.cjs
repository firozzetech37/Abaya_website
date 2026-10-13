// Tailwind preset shared by apps/web, apps/admin (Tailwind) and apps/mobile (NativeWind).
// Usage: tailwind.config: `presets: [require('@abaya/config/tailwind')]`
const { colors, fontFamily, fontScale, radius } = require('./tokens.json');

const px = (n) => `${n}px`;

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [],
  theme: {
    extend: {
      colors,
      fontFamily,
      fontSize: Object.fromEntries(
        Object.entries(fontScale).map(([name, { size, lineHeight }]) => [
          name,
          [px(size), { lineHeight: px(lineHeight) }],
        ]),
      ),
      borderRadius: Object.fromEntries(Object.entries(radius).map(([k, v]) => [k, px(v)])),
    },
  },
};
