import { defineConfig } from 'vitest/config';

// Phase 5C (directive §7): the first real component-test foundation for
// this repository. Deliberately a SEPARATE config/project from the main
// vitest.config.ts, the same way functions/ and mobile/ already are
// (see that file's own comment) - the main suite's hundreds of *.test.ts
// files run in `environment: 'node'` and would break if switched to
// jsdom wholesale (Firestore/Node-builtin mocks, no DOM). This config
// only ever picks up *.test.tsx files, run separately via
// `npm run test:components`, never folded into the main `npm test`.
//
// This does NOT retroactively add coverage for every existing .tsx file
// in this codebase - only the new Phase 5C component tests exist so far.
// See docs/NHEI_ARCHITECTURE.md's "no automated UI test" note, now
// narrowed to describe the files this config doesn't yet cover, not an
// absolute absence.
export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.tsx'],
    exclude: ['node_modules/**', 'dist/**', 'functions/**', 'mobile/**'],
    setupFiles: ['./test/component-test-setup.ts'],
    env: { TEST_MODE: 'true' },
  },
});
