import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { initializeAppCheck, ReCaptchaEnterpriseProvider, getToken } from 'firebase/app-check';
import firebaseConfig from '../../firebase-applet-config.json';
import type { Firestore } from 'firebase/firestore';

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

// Firestore is this app's single largest JS dependency (~480KB) and used to
// be initialized eagerly here, forcing every page load - including the
// anonymous marketing landing page - to fetch and parse it before it was
// ever actually used. Deferred to first real use instead: src/lib/firestore.ts
// holds the synchronous `db` export for the ~24 components that are already
// lazy()-loaded elsewhere (safe - their own chunk load is already deferred,
// so pulling this module in when they load changes nothing about eager
// bundle weight); the couple of remaining call sites that ARE part of the
// eager entry chunk (auth.tsx, App.tsx) use this getter instead.
let _db: Firestore | null = null;
let _dbPromise: Promise<Firestore> | null = null;
export async function getDb(): Promise<Firestore> {
  if (_db) return _db;
  if (!_dbPromise) {
    _dbPromise = import('firebase/firestore').then(({ getFirestore }) => {
      _db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
      return _db;
    });
  }
  return _dbPromise;
}

// Prepare App Check (observation/test mode)
// The actual site key must be configured in environment variables or via the console UI.
// For Phase 1D-B, we prepare this so it is ready once a reCAPTCHA Enterprise key is provided.
export let appCheck: any = null;
if (typeof window !== 'undefined' && (import.meta as any).env?.VITE_RECAPTCHA_ENTERPRISE_SITE_KEY) {
  try {
    appCheck = initializeAppCheck(app, {
      provider: new ReCaptchaEnterpriseProvider((import.meta as any).env.VITE_RECAPTCHA_ENTERPRISE_SITE_KEY),
      isTokenAutoRefreshEnabled: true
    });
    console.log("App Check initialized successfully with reCAPTCHA Enterprise.");
  } catch (err) {
    console.error("App Check failed to initialize", err);
  }
}

export async function getAppCheckToken(forceRefresh: boolean = false): Promise<string> {
  if (!appCheck) return "";
  try {
    const tokenResult = await getToken(appCheck, forceRefresh);
    return tokenResult.token;
  } catch (e: any) {
    console.warn("Failed to get App Check token:", e.message);
    return "";
  }
}

export async function testFirebaseConnection() {
  try {
    const db = await getDb();
    const { doc, getDocFromServer } = await import('firebase/firestore');
    await getDocFromServer(doc(db, 'test', 'connection'));
    console.log("Firebase connected successfully");
  } catch (error: any) {
    if (error.message && error.message.includes('the client is offline')) {
      console.warn("Firebase client is offline. Local data will be used.");
    } else {
      console.log("Firebase connection test complete (expected permission error because test/connection is blocked by rules).");
    }
  }
}

