import { defineConfig } from 'vitest/config';

// PHASE 6A - dedicated config for the controlled live-Gemini Nova chat
// evaluation (directive §4). Mirrors vitest.emulator.config.ts's own
// precedent exactly: a test category that must never run under the
// default `npm test`/CI is given its own file-name pattern and its own
// config, rather than a runtime skip living inside vitest.config.ts's
// shared include list (a skip can be forgotten or disabled by accident;
// a separate config/npm-script pair cannot be reached without a human
// deliberately running `npm run test:nova-live-eval`).
//
// Running this file WITHOUT NOVA_LIVE_CHAT_EVAL=1 and a real
// GEMINI_API_KEY still runs successfully and exits 0 - it asserts the
// live-model run was correctly BLOCKED, and writes a "NOT RUN" report
// artifact saying so (see nova-chat-live-model-evaluation.live-eval.test.ts).
// Only when both are set does it make a real, metered Gemini call.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['**/*.live-eval.test.ts'],
    exclude: ['node_modules/**', 'dist/**', 'functions/**', 'mobile/**'],
    env: { TEST_MODE: 'true' },
    // A real Gemini round-trip is much slower than the mocked path the
    // default suite uses.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
