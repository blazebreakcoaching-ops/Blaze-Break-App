import { getFirestore } from 'firebase/firestore';
import { app } from './firebase';
import firebaseConfig from '../../firebase-applet-config.json';

// Synchronous `db` for components that are already lazy()-loaded from
// App.tsx - safe to initialize Firestore eagerly *within this module*,
// since importing this module only ever happens as part of one of those
// components' own already-deferred chunk load, never as part of the eager
// entry chunk. src/lib/firebase.ts (imported eagerly by App.tsx/auth.tsx)
// deliberately does NOT export this - see the getDb() comment there for why.
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
