import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { MotionConfig } from 'motion/react';
import { NheiPhase5Preview } from './components/NheiPhase5Preview';
import './index.css';
import { auth } from './lib/firebase';

// Phase 5E (directive §8) - dedicated Playwright test entry point.
//
// NOT PART OF THE PRODUCTION APP: this file is never imported by
// src/main.tsx or App.tsx, and dev-nhei-phase5-preview.html (the only HTML
// page that loads it) is never linked from index.html or any in-app
// navigation - confirmed the same way every other NHEI/Nova dev-preview
// component in this codebase already states "not reachable by any real
// user." It exists solely so the Playwright suite
// (tests/e2e/nhei-phase5-journey.spec.ts) has a real page, in a real
// browser, to drive - directive §8 asks for exactly that, not a second
// unit-test layer pretending to be a browser test.
//
// __E2E_MOCK_AUTH__ is set by Playwright's own page.addInitScript before
// this module ever runs, so secureApiFetch's narrowly-scoped,
// import.meta.env.DEV-gated bypass (src/lib/secure-api.ts) applies - every
// request this page makes still goes out as a real fetch() call, which
// Playwright's page.route() then answers with a local mock response. No
// Firestore, no Firebase Auth, no Gemini call is ever reached from here.
if (typeof window !== 'undefined' && !(window as any).__E2E_MOCK_AUTH__) {
  console.warn('[nhei-phase5-preview-e2e-entry] __E2E_MOCK_AUTH__ was not set before load - secureApiFetch calls on this page will fail with 401, same as any other unauthenticated page load.');
}

// Nova Chat now refuses to show any conversation until a real Firebase
// identity is confirmed (account-switch privacy gate), so this offline
// preview needs a stable synthetic identity of its own. Applied ONLY here,
// in this dev-only entry, and only when Playwright set the flag - the
// production app and its privacy gate are untouched. The setter is a no-op
// because Firebase assigns currentUser internally while it initialises.
if (typeof window !== 'undefined' && (window as any).__E2E_MOCK_AUTH__ === true) {
  const previewUser = { uid: 'e2e_preview_user', isAnonymous: true, email: null };
  Object.defineProperty(auth, 'currentUser', {
    configurable: true,
    get: () => previewUser,
    set: () => {},
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MotionConfig reducedMotion="user">
      <NheiPhase5Preview />
    </MotionConfig>
  </StrictMode>,
);
