import { defineConfig, devices } from '@playwright/test';

// Phase 5M (directive §1/§2) - browser-level tests against the REAL,
// signed-in Blaze Break application (src/main.tsx -> App.tsx), not the
// dev-only preview harness playwright.config.ts drives. Closes the gap
// named in every Phase 5E-5L delivery report's own "remaining disconnected
// capabilities" section: there was no Playwright coverage at all for the
// real App.tsx SPA.
//
// MINIMUM INFRASTRUCTURE IDENTIFIED (directive §1): a real browser test of
// the real app needs a real, but fully local and disposable, signed-in
// user - not a mock of useAuth(). This config runs the app's own real dev
// server (`tsx server.ts`, the same thing `npm run dev` runs - real Vite
// middleware + the real Express API, one process, per server.ts's own
// setupVite()), pointed at local Firestore/Auth emulators via
// FIRESTORE_EMULATOR_HOST/FIREBASE_AUTH_EMULATOR_HOST (the Admin SDK's own
// documented emulator auto-detection - no server.ts code change needed),
// with the client bundle's own new, dev-only VITE_USE_FIREBASE_EMULATOR
// opt-in (src/lib/firebase.ts) pointing its Auth/Firestore calls at the
// same emulators. The result: a real anonymous Firebase Auth sign-in (the
// same one that already happens for any brand-new real visitor - see
// auth.tsx), real Firestore reads/writes, and real server-side route
// logic (authenticateFirebaseUser, the NOVA_AGENTIC_JOURNEY_ENABLED flag
// endpoint, suggest_feature validation) - all genuinely exercised, all
// entirely local and disposable. Model responses are still mocked per-test
// via page.route('**/api/nova/chat', ...) (directive's own "mocked model
// responses" instruction) since no real GEMINI_API_KEY is provided here
// and a live external model call would violate "no live external actions"
// regardless.
//
// REQUIRES the Firestore + Auth emulators already running on
// 127.0.0.1:8080/9099 before this config's webServers start - see
// NOVA_PHASE5M_REAL_APP_ACCEPTANCE_REPORT.md for the exact command.
//
// TWO webServers, two ports: directive §3 asks to verify BOTH
// NOVA_AGENTIC_JOURNEY_ENABLED configurations. This is the ONLY way to
// test the flag's real, server-side-read value (never by mocking a config
// endpoint, which would prove nothing about the real flag-reading code).
// Neither ever runs with NODE_ENV=production, and the flag-on server is
// used by exactly one project, strictly for isolated testing, per the
// directive's explicit "No production feature-flag activation."
//
// PORTS: must be two of server.ts's own existing non-production CORS
// allowedOrigins (3000, 8081 on 127.0.0.1 - see server.ts's own
// `allowedOrigins` array), not arbitrary free ports. A real browser
// request's Origin header is checked against that list for every single
// request (the cors() middleware is registered globally, ahead of Vite's
// own dev middleware) - an unlisted origin isn't just rejected cleanly,
// it corrupts the response Vite's own middleware then also tries to write
// to the same already-errored connection, producing a garbled
// Content-Length mismatch and a blank page. Found by this phase's own
// real-browser testing failing with exactly that symptom.
const FLAG_OFF_PORT = 3000;
const FLAG_ON_PORT = 8081;

// PHASE 6D (Priority 1) - each webServer below is its own `tsx server.ts`
// process, and each one's Vite middleware opens its own HMR WebSocket
// server (see server.ts's setupVite() comment). Both ran on the same
// default port (24678) before this, racing for it and logging
// "WebSocket server error: Port 24678 is already in use" - a known
// cause of intermittent, unrelated-looking failures under this specific
// two-webServer concurrent setup. Distinct ports per instance via
// VITE_HMR_PORT (server.ts's own new opt-in) removes the collision
// without changing genuine single-instance dev/production behaviour.
const FLAG_OFF_HMR_PORT = 24678;
const FLAG_ON_HMR_PORT = 24679;

const emulatorEnv = {
  FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080',
  FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099',
  VITE_USE_FIREBASE_EMULATOR: 'true',
};

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: /real-app-.*\.spec\.ts/,
  timeout: 30_000,
  fullyParallel: false,
  retries: 0,
  reporter: [['list']],
  webServer: [
    {
      command: 'npx tsx server.ts',
      port: FLAG_OFF_PORT,
      env: { ...emulatorEnv, PORT: String(FLAG_OFF_PORT), NOVA_AGENTIC_JOURNEY_ENABLED: 'false', VITE_HMR_PORT: String(FLAG_OFF_HMR_PORT) },
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
    {
      command: 'npx tsx server.ts',
      port: FLAG_ON_PORT,
      env: { ...emulatorEnv, PORT: String(FLAG_ON_PORT), NOVA_AGENTIC_JOURNEY_ENABLED: 'true', VITE_HMR_PORT: String(FLAG_ON_HMR_PORT) },
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
  ],
  projects: [
    {
      name: 'realapp-desktop',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 900 },
        baseURL: `http://127.0.0.1:${FLAG_OFF_PORT}`,
        launchOptions: { executablePath: '/opt/pw-browsers/chromium' },
      },
      // Phase 5N (directive §3/§4) - real-app-account-continuity.spec.ts
      // added alongside real-app-nova-journey.spec.ts: both need the
      // flag-off webServer and a real signed-in identity, so both run
      // under this same project.
      testMatch: [/real-app-nova-journey\.spec\.ts/, /real-app-account-continuity\.spec\.ts/],
    },
    {
      name: 'realapp-mobile',
      use: {
        ...devices['Pixel 7'],
        baseURL: `http://127.0.0.1:${FLAG_OFF_PORT}`,
        launchOptions: { executablePath: '/opt/pw-browsers/chromium' },
      },
      testMatch: /real-app-nova-journey\.spec\.ts/,
    },
    {
      name: 'realapp-flag-on',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 900 },
        baseURL: `http://127.0.0.1:${FLAG_ON_PORT}`,
        launchOptions: { executablePath: '/opt/pw-browsers/chromium' },
      },
      testMatch: /real-app-flag-gating\.spec\.ts/,
    },
  ],
});
