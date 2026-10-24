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
  ];

  localStorage.getItem = function (key: string) {
    const activeEmail = (window as any).__ACTIVE_USER_EMAIL__;
    if (activeEmail && !ALLOWED_AUTHED_KEYS.includes(key)) {
      return null; // Block reading sensitive demo data in Secure Account mode
    }
    return originalGet.call(this, key);
  };

  localStorage.setItem = function (key: string, value: string) {
    const activeEmail = (window as any).__ACTIVE_USER_EMAIL__;
    if (activeEmail && !ALLOWED_AUTHED_KEYS.includes(key)) {
      return; // Block writing sensitive demo data in Secure Account mode
    }
    originalSet.call(this, key, value);
  };

  localStorage.removeItem = function (key: string) {
    const activeEmail = (window as any).__ACTIVE_USER_EMAIL__;
    if (activeEmail && !ALLOWED_AUTHED_KEYS.includes(key)) {
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
