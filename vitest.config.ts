import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['**/*.test.ts'],
    // functions/ is a separate Cloud Functions deployment with its own
    // package.json/vitest.config.ts/npm test - see functions/package.json.
    exclude: ['node_modules/**', 'dist/**', 'functions/**'],
  },
});
