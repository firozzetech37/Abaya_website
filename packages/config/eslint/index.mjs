// Shared ESLint flat config for every workspace package.
// Usage in a package: `export { default } from '@abaya/config/eslint';`
// or spread it and append package-specific entries.
import js from '@eslint/js';
import boundaries from 'eslint-plugin-boundaries';
import globals from 'globals';
import tseslint from 'typescript-eslint';

// Libraries that must never appear in a module's domain layer (CLAUDE.md rule 2).
const FRAMEWORK_AND_SDK_IMPORTS = [
  '@nestjs/*',
  '@prisma/*',
  '@abaya/db',
  '@supabase/*',
  'razorpay',
  'express',
];

// Concrete adapters that application code must reach through ports (rule 3).
const CONCRETE_ADAPTER_IMPORTS = [
  '@prisma/*',
  '@abaya/db',
  '@supabase/*',
  'razorpay',
  '**/common/prisma/*',
  '**/common/storage/*',
];

const restricted = (patterns, reason) => [
  'error',
  { patterns: [{ group: patterns, message: reason }] },
];

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.next/**',
      '**/.expo/**',
      '**/.turbo/**',
      '**/coverage/**',
      '**/android/**',
      '**/ios/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.node },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      // `any` is allowed only with an explanatory eslint-disable comment.
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },

  // ---- API clean-architecture boundaries (apps/api/src/modules/<name>/<layer>) ----
  {
    files: ['**/src/modules/**/*.ts', '**/src/common/**/*.ts'],
    plugins: { boundaries },
    settings: {
      // Without a TS resolver, boundaries cannot resolve `.ts` imports and silently skips them.
      'import/resolver': { typescript: { alwaysTryTypes: true } },
      'boundaries/include': ['**/src/modules/**/*', '**/src/common/**/*'],
      'boundaries/elements': [
        { type: 'domain', pattern: 'modules/*/domain', capture: ['module'] },
        { type: 'application', pattern: 'modules/*/application', capture: ['module'] },
        { type: 'infrastructure', pattern: 'modules/*/infrastructure', capture: ['module'] },
        { type: 'interface', pattern: 'modules/*/interface', capture: ['module'] },
        { type: 'module-root', pattern: 'modules/*', mode: 'folder', capture: ['module'] },
        // Plain-TypeScript error base classes: the only shared code domain/ may import.
        { type: 'kernel', pattern: 'common/errors/domain-error.ts', mode: 'file' },
        { type: 'common', pattern: 'common' },
      ],
    },
    rules: {
      // NestJS DI reads constructor parameter types from emitDecoratorMetadata, which
      // `import type` erases. Let injected classes be imported as values.
      '@typescript-eslint/consistent-type-imports': 'off',
      'boundaries/element-types': [
        'error',
        {
          default: 'disallow',
          message: '${file.type} of module "${file.module}" may not import ${dependency.type} of module "${dependency.module}"',
          rules: [
            // Dependencies point inward: interface → application → domain; infrastructure → application/domain.
            { from: 'domain', allow: [['domain', { module: '${from.module}' }], 'kernel'] },
            { from: 'kernel', allow: [] },
            {
              from: 'application',
              allow: [
                ['domain', { module: '${from.module}' }],
                ['application', { module: '${from.module}' }],
                // Other modules are reached through their exported application services only.
                'application',
                'common',
                'kernel',
              ],
            },
            {
              from: 'infrastructure',
              allow: [
                ['domain', { module: '${from.module}' }],
                ['application', { module: '${from.module}' }],
                ['infrastructure', { module: '${from.module}' }],
                'common',
                'kernel',
              ],
            },
            {
              from: 'interface',
              allow: [
                ['domain', { module: '${from.module}' }],
                ['application', { module: '${from.module}' }],
                ['interface', { module: '${from.module}' }],
                'common',
                'kernel',
              ],
            },
            // <name>.module.ts wires the layers together and may import another module's Nest module.
            {
              from: 'module-root',
              allow: ['domain', 'application', 'infrastructure', 'interface', 'module-root', 'common', 'kernel'],
            },
            { from: 'common', allow: ['common', 'kernel'] },
          ],
        },
      ],
    },
  },
  {
    files: ['**/src/modules/*/domain/**/*.ts'],
    rules: {
      'no-restricted-imports': restricted(
        FRAMEWORK_AND_SDK_IMPORTS,
        'domain/ is plain TypeScript: no NestJS, Prisma, Supabase or payment SDK imports.',
      ),
    },
  },
  {
    files: ['**/src/modules/*/application/**/*.ts'],
    rules: {
      'no-restricted-imports': restricted(
        CONCRETE_ADAPTER_IMPORTS,
        'application/ depends on ports; put concrete adapters in infrastructure/.',
      ),
    },
  },

  // Tests may use looser typing for fixtures.
  {
    files: ['**/*.test.ts', '**/*.spec.ts', '**/*.e2e-spec.ts'],
    rules: { '@typescript-eslint/no-non-null-assertion': 'off' },
  },
  // Plain JS config files (tailwind, metro, babel) are CommonJS.
  {
    files: ['**/*.cjs'],
    languageOptions: { sourceType: 'commonjs', globals: { ...globals.node } },
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
);
