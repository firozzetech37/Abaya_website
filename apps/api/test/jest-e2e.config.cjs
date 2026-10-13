/**
 * API end-to-end tests: the real Nest app against a LOCAL Postgres that is
 * reset before the run (see global-setup.cjs). Payment and storage providers
 * are replaced with fakes; Razorpay signatures use the real algorithm.
 */
module.exports = {
  rootDir: '..',
  testEnvironment: 'node',
  testMatch: ['<rootDir>/test/**/*.e2e-spec.ts'],
  globalSetup: '<rootDir>/test/global-setup.cjs',
  setupFiles: ['<rootDir>/test/env.cjs'],
  testTimeout: 30000,
  transform: {
    '^.+\\.(t|j)s$': [
      'ts-jest',
      { tsconfig: '<rootDir>/test/tsconfig.e2e.json', diagnostics: false },
    ],
  },
  // jose ships ESM only; let ts-jest turn it into CommonJS for Jest.
  transformIgnorePatterns: ['/node_modules/(?!(\\.pnpm/jose@[^/]+/node_modules/)?jose/)'],
  moduleNameMapper: {
    '^@abaya/contracts$': '<rootDir>/../../packages/contracts/src/index.ts',
    '^@abaya/db$': '<rootDir>/../../packages/db/src/index.ts',
  },
};
