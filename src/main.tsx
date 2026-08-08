import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import { MotionConfig } from 'motion/react';
import App from './App.tsx';
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
    'blaze_feature_flags'
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

testFirebaseConnection();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <MotionConfig reducedMotion="user">
        <App />
      </MotionConfig>
    </AuthProvider>
  </StrictMode>,
);
