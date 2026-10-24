import { getFirestore } from 'firebase/firestore';
import { app, connectFirestoreEmulatorIfNeeded } from './firebase';
import firebaseConfig from '../../firebase-applet-config.json';

// Synchronous `db` for components that are already lazy()-loaded from
// App.tsx - safe to initialize Firestore eagerly *within this module*,
// since importing this module only ever happens as part of one of those
// components' own already-deferred chunk load, never as part of the eager
// entry chunk. src/lib/firebase.ts (imported eagerly by App.tsx/auth.tsx)
// deliberately does NOT export this - see the getDb() comment there for why.
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
// Phase 5M (directive §1/§2) - top-level await is safe here (Vite/ESM):
// this only ever connects when this dev-only harness's own
// VITE_USE_FIREBASE_EMULATOR flag is set, and firebase.ts's own guard makes
// this a no-op if getDb() (the other Firestore call site) already connected
// the emulator on this same underlying singleton first.
await connectFirestoreEmulatorIfNeeded(db);
