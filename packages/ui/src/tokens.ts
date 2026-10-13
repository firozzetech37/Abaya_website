// Tokens are authored once as JSON in @abaya/config so the Tailwind/NativeWind
// preset and TypeScript code (web, admin, mobile) read the same values.
import rawTokens from '@abaya/config/tailwind/tokens.json';

type Scale = Record<'50' | '100' | '200' | '300' | '400' | '500' | '600' | '700' | '800' | '900' | '950', string>;

export interface DesignTokens {
  colors: {
    neutral: Scale;
    accent: Scale;
    success: string;
    warning: string;
    danger: string;
    info: string;
    background: string;
    surface: string;
    foreground: string;
    muted: string;
    border: string;
    primary: string;
    'primary-foreground': string;
  };
  fontFamily: { sans: string[]; display: string[] };
  /** Font size and line height in px. */
  fontScale: Record<'xs' | 'sm' | 'base' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl' | '5xl', { size: number; lineHeight: number }>;
  /** Corner radius in px. */
  radius: Record<'sm' | 'md' | 'lg' | 'xl' | 'full', number>;
}

export const tokens: DesignTokens = rawTokens as DesignTokens;
export const { colors, fontFamily, fontScale, radius } = tokens;
