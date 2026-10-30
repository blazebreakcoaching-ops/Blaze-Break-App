import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import { MotionConfig } from 'motion/react';
import App from './App.tsx';
import { AllyView } from './components/AllyView.tsx';
import { AuthActionPage } from './components/AuthActionPage.tsx';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import './index.css';
import { testFirebaseConnection } from './lib/firebase.ts';
import { AuthProvider } from './lib/auth.tsx';

// Transparent localStorage interceptor to isolate profiles automatically per-user
if (typeof window !== 'undefined') {
  const originalGet = localStorage.getItem;
  const originalSet = localStorage.setItem;
  const originalRemove = localStorage.removeItem;

  const ALLOWED_AUTHED_KEYS = [
    'blaze_dark_mode',
    'blaze_notification_preferences',
    'blaze_feature_flags',
    // Phase 5M (directive §4/§5) - a real signed-in (non-anonymous)
    // account's Nova conversation was being silently discarded on every
    // page load: this "Secure Account mode" block is correct to stop a
    // shared/demo-mode localStorage profile (blaze_profile and friends)
    // leaking into a newly-signed-in real account, but it was never meant
    // to make Nova's own chat history and in-chat preferences
    // unrecoverable the moment a real account exists - nothing elsewhere
    // persists them to Firestore as a fallback, so blocking these keys
    // just destroyed the conversation outright, discovered only once a
    // real browser test actually exercised src/main.tsx's real entry point
    // (the dev-preview harness used in earlier phases never ran this file
    // at all). These five keys are all Nova-chat-specific and scoped to
    // one person's own device; none of them carry another person's data
    // the way a shared-device blaze_profile leak would.
    'nova_chat_history',
    'nova_chat_ratings',
    'nova_chat_feedback_notes',
    'nova_chat_feedback_tags',
    'nova_chat_feedback_submitted',
    'nova_voice_enabled',
    // Phase 5N (directive §1/§2) - added alongside the five keys above.
    // The modal's own cooldown timestamp isn't conversation content, but
    // it's scoped the same way (see src/lib/nova-chat-storage.ts) for the
    // same shared-device correctness reason, so it needs the same allow.
    'nova_feedback_last_shown',
  ];

  // Phase 5N (directive §1/§2) - the six keys above now never appear in
  // localStorage by their bare names for ANY signed-in identity (real or
  // anonymous): src/lib/nova-chat-storage.ts's novaStorageKey() always
  // writes them as `${baseKey}::${uid}`, so a second real account signing
  // in on the same browser gets its OWN uid-suffixed key, never the first
  // account's. Before this helper, this guard checked exact string
  // equality against ALLOWED_AUTHED_KEYS, which matched only the bare,
  // unscoped name - so switching this guard's own allowlist to the
  // uid-scoped shape without ALSO updating this check would have made
  // Secure Account mode block a real account's OWN Nova data again (the
  // exact Phase 5M regression this allowlist exists to prevent), just
  // under a new key shape. Prefix-matching against each known base name
  // recognises the scoped form for whichever allowed key it extends,
  // without needing to know any specific uid here.
  const isAllowedAuthedKey = (key: string): boolean =>
    ALLOWED_AUTHED_KEYS.some((allowed) => key === allowed || key.startsWith(`${allowed}::`));

  localStorage.getItem = function (key: string) {
    const activeEmail = (window as any).__ACTIVE_USER_EMAIL__;
    if (activeEmail && !isAllowedAuthedKey(key)) {
      return null; // Block reading sensitive demo data in Secure Account mode
    }
    return originalGet.call(this, key);
  };

  localStorage.setItem = function (key: string, value: string) {
    const activeEmail = (window as any).__ACTIVE_USER_EMAIL__;
    if (activeEmail && !isAllowedAuthedKey(key)) {
      return; // Block writing sensitive demo data in Secure Account mode
    }
    originalSet.call(this, key, value);
  };

  localStorage.removeItem = function (key: string) {
    const activeEmail = (window as any).__ACTIVE_USER_EMAIL__;
    if (activeEmail && !isAllowedAuthedKey(key)) {
      return;
    }
    originalRemove.call(this, key);
  };
}

// Deferred off the critical rendering path - this is a connectivity check,
// not something any part of the first paint depends on, and calling it here
// unconditionally used to force an immediate Firestore chunk fetch on every
// load regardless of what page was showing. requestIdleCallback runs it once
// the browser is actually idle; setTimeout is the fallback for Safari, which
// doesn't implement it.
if (typeof window.requestIdleCallback === "function") {
  window.requestIdleCallback(() => testFirebaseConnection());
} else {
  setTimeout(() => testFirebaseConnection(), 2000);
}

const allyTokenMatch = window.location.pathname.match(/^\/ally\/([a-zA-Z0-9]+)$/);
const isAuthActionPath = window.location.pathname === '/auth/action';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary level="app">
      <AuthProvider>
        <MotionConfig reducedMotion="user">
          {allyTokenMatch ? (
            <AllyView token={allyTokenMatch[1]} />
          ) : isAuthActionPath ? (
            <AuthActionPage />
          ) : (
            <App />
          )}
        </MotionConfig>
      </AuthProvider>
    </ErrorBoundary>
  </StrictMode>,
);
