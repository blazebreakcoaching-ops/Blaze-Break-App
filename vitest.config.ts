import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['**/*.test.ts'],
    // functions/ and mobile/ are each a separate project with their own
    // package.json/vitest.config.ts/npm test (see functions/package.json
    // and mobile/package.json) - and mobile/tsconfig.json extends
    // expo/tsconfig.base, a package that only exists under mobile/'s own
    // node_modules, never installed by this root project's `npm install`.
    // Without this exclude, vitest's oxc transform fails outright trying
    // to resolve that tsconfig for any mobile/**/*.test.ts file.
    exclude: ['node_modules/**', 'dist/**', 'functions/**', 'mobile/**'],
  },
});
