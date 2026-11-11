import { defineConfig } from 'vitest/config';

// GitHub Pages serves the site at /<repo-name>/; CI passes it via BASE_PATH.
export default defineConfig({
  base: process.env.BASE_PATH || '/',
  build: { target: 'es2020' },
  test: { include: ['src/**/*.test.ts'], testTimeout: 60000 },
});
