// Native Firebase initialization. Every EAS profile must inject its own
// explicit public Firebase project configuration. The web project's
// firebase-applet-config.json is deliberately NOT imported here: doing
// so would send staging builds to production Auth/Firestore.
// Native App Check remains a separate EAS/dev-client prerequisite.
import 'react-native-get-random-values';
import { initializeApp, getApps, getApp } from 'firebase/app';
// Deliberately from '@firebase/auth', not the 'firebase/auth' umbrella
// re-export: the umbrella package's own exports map (firebase@12.19.0)
// has no "react-native" condition on its "./auth" entry, so it always
// resolves to the generic browser build and getReactNativePersistence
// doesn't exist there at runtime. '@firebase/auth' has a real
// "react-native" condition (see its package.json exports map) pointing
// at a dedicated RN build that does export it - confirmed by reading
// node_modules/@firebase/auth/dist/rn/index.rn.d.ts directly rather than
// trusting training data, per this project's own AGENTS.md guidance.
import { initializeAuth, getAuth, type Auth, type Persistence } from '@firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Firestore } from 'firebase/firestore';
import { buildNativeFirebaseConfig } from './firebase-build-config';

const firebaseConfig = buildNativeFirebaseConfig({
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
  firestoreDatabaseId: process.env.EXPO_PUBLIC_FIREBASE_FIRESTORE_DATABASE_ID,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
});

const existing = getApps()[0];
// React Native Fast Refresh can retain a previous initialized Firebase
// app. Refuse to reuse it if a build/environment switch changed projects.
if (existing && existing.options.projectId !== firebaseConfig.projectId) {
  throw new Error('Native Firebase project mismatch: restart with the correct environment');
}
export const app = existing ? getApp() : initializeApp(firebaseConfig);

// getReactNativePersistence is genuinely part of @firebase/auth's public
// API (its own JSDoc example imports it exactly this way - see
// node_modules/@firebase/auth/dist/src/platform_react_native/persistence/
// react_native.d.ts) and Metro resolves it correctly at runtime. tsc
// can't see it here, though: @firebase/auth's package.json exports map
// lists a top-level "types" key ahead of "react-native" in the "."
// export's conditions object, so tsc's type-checker (which requests a
// "types" condition) always matches that generic, non-RN declaration
// file before "react-native" is ever considered - confirmed with
// `tsc --traceResolution`. Reaching it via require() sidesteps tsc's
// (wrong, RN-blind) static resolution of this one symbol without
// touching how any other symbol in this file resolves.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { getReactNativePersistence } = require('@firebase/auth') as {
  getReactNativePersistence: (storage: typeof AsyncStorage) => Persistence;
};

// getAuth(app) alone does not persist sessions across app restarts in React
// Native - unlike the web SDK, there's no IndexedDB-backed default. This is
// the RN-specific equivalent of web firebase.ts's configurePersistence().
//
// initializeAuth() throws if Auth was already initialized for this app
// instance - it's a one-shot call, unlike getAuth() which is idempotent.
// In production this module only ever evaluates once, but Metro Fast
// Refresh can re-execute a file's top-level code on save during
// development without tearing down the underlying native app/JS engine
// state, which would otherwise crash the whole app on every edit to this
// file. Falling back to getAuth() (which returns the already-initialized
// instance, persistence and all) makes that safe.
let _auth: Auth;
try {
  _auth = initializeAuth(app, {
    persistence: getReactNativePersistence(AsyncStorage),
  });
} catch {
  _auth = getAuth(app);
}
export const auth: Auth = _auth;

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
