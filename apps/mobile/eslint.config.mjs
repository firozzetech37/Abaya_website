import base from '@abaya/config/eslint';
import reactHooks from 'eslint-plugin-react-hooks';

export default [
  ...base,
  { ignores: ['.expo/**', 'dist/**', 'expo-env.d.ts', 'nativewind-env.d.ts'] },
  {
    files: ['**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    languageOptions: { globals: { __DEV__: 'readonly' } },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
  // Metro, Babel and Tailwind configs are CommonJS.
  {
    files: ['*.config.js'],
    languageOptions: { sourceType: 'commonjs' },
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
];
