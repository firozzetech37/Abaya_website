import { forwardRef } from 'react';
import { Text as RNText, type TextProps } from 'react-native';
import { fonts } from '../lib/theme';

/**
 * The app's Text: the website's type (Inter, and Cormorant Garamond for `font-display`).
 * Custom fonts come one file per weight, so the file is picked from the className
 * (`font-medium`, `font-semibold`, `font-bold`, `italic`) and the weight itself is reset —
 * otherwise Android and iOS fake a bold on top of an already bold file.
 */
export function fontFor(className = ''): string {
  const display = /\bfont-display\b/.test(className);
  const italic = /\bitalic\b/.test(className);
  const bold = /\bfont-(bold|extrabold|black)\b/.test(className);
  const semibold = /\bfont-semibold\b/.test(className);
  const medium = /\bfont-medium\b/.test(className);
  if (display) {
    if (italic) return fonts.displayItalic;
    if (bold) return fonts.displayBold;
    if (medium) return fonts.displayMedium;
    return fonts.display;
  }
  if (bold) return fonts.sansBold;
  if (semibold) return fonts.sansSemibold;
  if (medium) return fonts.sansMedium;
  return fonts.sans;
}

export const Text = forwardRef<RNText, TextProps & { className?: string }>(function Text({ className, style, ...props }, ref) {
  return (
    <RNText
      ref={ref}
      className={className}
      style={[{ fontFamily: fontFor(className), fontWeight: 'normal', fontStyle: 'normal' }, style]}
      {...props}
    />
  );
});
