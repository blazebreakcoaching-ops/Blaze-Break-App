import { initializeApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, setPersistence, browserLocalPersistence, browserSessionPersistence, inMemoryPersistence } from 'firebase/auth';
import { initializeAppCheck, ReCaptchaEnterpriseProvider, getToken } from 'firebase/app-check';
import firebaseConfig from '../../firebase-applet-config.json';
import type { Firestore } from 'firebase/firestore';

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

// Phase 5M (directive §1/§2) - the minimum infrastructure identified for a
// real-application Playwright harness: an explicit, dev-only opt-in to
// route this real client bundle's Auth/Firestore calls at local emulators
// instead of the real `firebase-applet-config.json` project, so a browser
// test exercising the REAL App.tsx (anonymous sign-in, Firestore reads/
// writes, everything) never touches a live external service. Gated on a
// Vite env var only this harness's own webServer ever sets - a normal
// `npm run dev` or a real production build leaves it unset, so this can
// never affect a real developer's data or a real user. Auth emulator
// connection must happen before any Auth SDK call, so it runs here
// synchronously, immediately after getAuth(app) - the Firestore equivalent
// lives in getDb() below, right after getFirestore() is first called.
const USE_FIREBASE_EMULATOR = typeof window !== 'undefined' && (import.meta as any).env?.VITE_USE_FIREBASE_EMULATOR === 'true';
if (USE_FIREBASE_EMULATOR) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
}

// Firestore has two separate initialization call sites (this file's own
// getDb() below, and src/lib/firestore.ts's synchronous `db` for already
// lazy()-loaded components - see that file's own comment for why) that
// both resolve to the SAME underlying Firestore singleton (getFirestore()
// caches by app+databaseId), but connectFirestoreEmulator() itself throws
// if called more than once against that singleton. This guard lets both
// call sites call it unconditionally and safely - only the first call
// actually connects the emulator, whichever call site runs first.
let _firestoreEmulatorConnected = false;
export async function connectFirestoreEmulatorIfNeeded(firestoreDb: Firestore): Promise<void> {
  if (!USE_FIREBASE_EMULATOR || _firestoreEmulatorConnected) return;
  _firestoreEmulatorConnected = true;
  const { connectFirestoreEmulator } = await import('firebase/firestore');
  connectFirestoreEmulator(firestoreDb, '127.0.0.1', 8080);
}

// getAuth(app) alone relies on Firebase's implicit default (IndexedDB-backed
// local persistence) with no visible fallback - if IndexedDB is unavailable
// in the browser context (blocked storage, some private-browsing modes,
// partitioned/embedded iframe contexts), the SDK silently degrades to an
// in-memory session with no error. That means the signed-in session doesn't
// survive a reload at all: every app open looks like a brand-new visitor,
// a fresh anonymous account gets created, and onboarding (gated on finding
// a saved profile) shows every single time. Setting persistence explicitly,
// with an explicit fallback chain, makes the app actually keep working
// (session for the tab, at worst) instead of failing invisibly.
async function configurePersistence() {
  try {
    await setPersistence(auth, browserLocalPersistence);
  } catch {
    try {
      await setPersistence(auth, browserSessionPersistence);
    } catch {
      try {
        await setPersistence(auth, inMemoryPersistence);
      } catch {
        // Nothing left to fall back to - auth proceeds with whatever
        // persistence the SDK already defaulted to.
      }
    }
  }
}
export const authPersistenceReady = configurePersistence();

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
    _dbPromise = import('firebase/firestore').then(async ({ getFirestore }) => {
      _db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
      await connectFirestoreEmulatorIfNeeded(_db);
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

