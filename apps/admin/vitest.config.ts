import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/** Unit tests for pure helpers in the admin (components render-free). */
export default defineConfig({
  test: { include: ['lib/**/*.test.ts'], environment: 'node' },
  resolve: { alias: { '@': fileURLToPath(new URL('./', import.meta.url)) } },
});
