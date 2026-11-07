import { defineConfig } from 'vitest/config';

// Phase 5E, directive §7 - dedicated config for the Firestore emulator
// integration tests. Deliberately NOT merged into vitest.config.ts: those
// tests need a real Firestore emulator (and Java) already running on
// 127.0.0.1:8080, which the default `npm test`/CI run must never require.
// Run with `npm run test:emulator` after starting the emulator - see
// nova-calendar-protection-service.emulator.test.ts's own header for the
// exact command.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['**/*.emulator.test.ts'],
    exclude: ['node_modules/**', 'dist/**', 'functions/**', 'mobile/**'],
    env: { TEST_MODE: 'true' },
    // A real Firestore emulator round-trip per call is much slower than
    // the in-memory fake the rest of the suite uses.
    testTimeout: 30_000,
    hookTimeout: 30_000,
    // Phase 5G, directive §7 - a REAL finding this suite's own growth
    // surfaced: every emulator test file's `beforeEach` wipes the ENTIRE
    // project's Firestore data (via the emulator's bulk-delete endpoint),
    // because each file was written assuming it was the only one running
    // against the shared, single live emulator process. With a second
    // file added (nova-task-deferral-service.emulator.test.ts), vitest's
    // default file-level parallelism let both files' test runs interleave
    // against that SAME emulator instance - one file's beforeEach wipe
    // could delete documents a concurrently-running test in the OTHER
    // file had just written moments earlier, producing exactly the
    // "No such proposal" failures a real concurrent-access bug would
    // produce, in files whose own tests are each internally correct.
    // Scoping every file's wipe to only its own uid prefixes would also
    // fix this, but disabling cross-FILE parallelism here is the more
    // honest fix: these files already share one real external resource
    // (the live emulator), the same reason a real production Firestore
    // database would need equivalent test isolation, and sequential
    // execution is cheap for a suite this small.
    fileParallelism: false,
  },
});
