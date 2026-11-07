import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import { MotionConfig } from 'motion/react';
import { AccountAccessGate } from './components/AccountAccessGate.tsx';
import { AllyView } from './components/AllyView.tsx';
import { AuthActionPage } from './components/AuthActionPage.tsx';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import './index.css';
import { testFirebaseConnection } from './lib/firebase.ts';
import { AuthProvider } from './lib/auth.tsx';
import { isSafeAuthenticatedStorageKey } from './lib/secure-local-storage-keys';

// The older secure-account interceptor silently dropped all newly scoped
// profile, consent, pulse and guide keys. Use a strict, UID-aware allowlist
// so registered customers retain their own data without seeing another
// account's keys or the old browser-wide personal values.
if (typeof window !== 'undefined') {
  try {
    const storage = window.localStorage;
    const originalGet = storage.getItem;
    const originalSet = storage.setItem;
    const originalRemove = storage.removeItem;
    const isAllowed = (key: string): boolean =>
      isSafeAuthenticatedStorageKey(key, (window as any).__ACTIVE_USER_UID__ ?? null);

    storage.getItem = function (key: string) {
      if ((window as any).__ACTIVE_USER_EMAIL__ && !isAllowed(key)) return null;
      return originalGet.call(this, key);
    };
    storage.setItem = function (key: string, value: string) {
      if ((window as any).__ACTIVE_USER_EMAIL__ && !isAllowed(key)) return;
      originalSet.call(this, key, value);
    };
    storage.removeItem = function (key: string) {
      if ((window as any).__ACTIVE_USER_EMAIL__ && !isAllowed(key)) return;
      originalRemove.call(this, key);
    };
  } catch {
    // Some private-browser modes block Storage APIs at boot. The app must
    // still render, and individual callers already handle storage failure.
  }
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
            <AccountAccessGate />
          )}
        </MotionConfig>
      </AuthProvider>
    </ErrorBoundary>
  </StrictMode>,
);
