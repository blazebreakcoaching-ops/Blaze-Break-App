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
  },
});
