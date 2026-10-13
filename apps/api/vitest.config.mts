import { defineConfig } from 'vitest/config';

// Unit tests: domain rules, use cases with in-memory fakes, guards. No database.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
