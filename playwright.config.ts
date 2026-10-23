import { defineConfig, devices } from '@playwright/test';

// Phase 5E (directive §8) - the integrated Nova/NHEI journey, in a real
// browser. Drives dev-nhei-phase5-preview.html (see that file's own
// header and src/nhei-phase5-preview-e2e-entry.tsx) - never the
// production app's own index.html/App.tsx, which this suite never
// touches. webServer below starts the project's OWN local Vite dev
// server - "local test servers" per the directive, not a deployed
// environment. Every network call the page makes is answered by
// page.route() mocks inside the spec files, not by real
// Firestore/Firebase Auth/Gemini - directive §8's "mocked provider
// responses."
//
// Uses the Chromium binary already present in this environment
// (PLAYWRIGHT_BROWSERS_PATH points at /opt/pw-browsers) rather than
// downloading a new one - see each project's launchOptions below.
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  fullyParallel: false,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:5183',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npx vite --port 5183 --strictPort',
    url: 'http://127.0.0.1:5183/dev-nhei-phase5-preview.html',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
  projects: [
    {
      name: 'desktop-chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 900 },
        launchOptions: { executablePath: '/opt/pw-browsers/chromium' },
      },
    },
    {
      name: 'mobile-chromium',
      use: {
        ...devices['Pixel 7'],
        launchOptions: { executablePath: '/opt/pw-browsers/chromium' },
      },
    },
  ],
});
