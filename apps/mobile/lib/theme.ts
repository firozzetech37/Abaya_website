import { colors, radius } from '@abaya/ui';

/** Antique gold (same as the website's `gold-*`), for icons, gradients and SVG ornaments. */
export const gold = {
  50: '#FBF6E9',
  100: '#F5EACB',
  200: '#EBD59C',
  300: '#DDBB6B',
  400: '#CCA24A',
  500: '#B48734',
  600: '#95692A',
  700: '#765124',
} as const;

export const sand = { 50: '#FBF8F3', 100: '#F5EFE5', 200: '#EADFCD' } as const;

/** Font files loaded in app/_layout.tsx (one per weight). */
export const fonts = {
  sans: 'Inter_400Regular',
  sansMedium: 'Inter_500Medium',
  sansSemibold: 'Inter_600SemiBold',
  sansBold: 'Inter_700Bold',
  display: 'CormorantGaramond_600SemiBold',
  displayMedium: 'CormorantGaramond_500Medium',
  displayBold: 'CormorantGaramond_700Bold',
  displayItalic: 'CormorantGaramond_500Medium_Italic',
} as const;

/** Token values for places className cannot reach (icons, native headers, Razorpay). */
export const theme = { colors, radius, gold, sand, fonts };
export { colors };
