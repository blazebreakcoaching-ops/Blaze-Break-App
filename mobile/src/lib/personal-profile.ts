import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { auth, getDb } from './firebase';
import {
  canonicalPreferenceWrites, defaultPersonalPreferences, resolvePersonalPreferences, sanitisePersonalPreferences,
  type PersonalPreferences,
} from '../../../personal-preferences';

// The canonical record and its rules live in /personal-preferences.ts and
// are shared with the web app, so both platforms read and write the same
// documents and the same consent rules apply everywhere.
export type PersonalProfile = PersonalPreferences;
export const emptyPersonalProfile = defaultPersonalPreferences;
export const sanitisePersonalProfile = sanitisePersonalPreferences;

export async function readPersonalProfile(uid: string): Promise<PersonalProfile> {
  if (!uid || auth.currentUser?.uid !== uid) throw new Error('Account changed');
  const db = await getDb();
  const [user, ui, stats] = await Promise.all([
    getDoc(doc(db, 'users', uid)),
    getDoc(doc(db, 'users', uid, 'preferences', 'ui')),
    // Older web accounts only have these choices on their web profile.
    getDoc(doc(db, 'users', uid, 'user_stats', 'core')).catch(() => null),
  ]);
  if (auth.currentUser?.uid !== uid) throw new Error('Account changed');
  return resolvePersonalPreferences({
    root: user.data(), ui: ui.data(), legacyProfile: stats?.data()?.profile,
  });
}

export async function savePersonalProfile(uid: string, input: PersonalProfile): Promise<void> {
  if (!uid || auth.currentUser?.uid !== uid) throw new Error('Account changed');
  const writes = canonicalPreferenceWrites(input);
  const db = await getDb();
  const userRef = doc(db, 'users', uid);
  const existing = await getDoc(userRef);
  if (auth.currentUser?.uid !== uid) throw new Error('Account changed');
  const stamp = new Date().toISOString();
  if (existing.exists()) {
    await updateDoc(userRef, { ...writes.root, updatedAt: stamp });
  } else {
    // A fresh account may not yet have completed the auth listener's
    // ensureUserDocument; preserve createdAt when creating its first doc.
    await setDoc(userRef, { ...writes.root, updatedAt: stamp, createdAt: stamp });
  }
  if (auth.currentUser?.uid !== uid) throw new Error('Account changed');
  await setDoc(doc(db, 'users', uid, 'preferences', 'ui'), writes.ui, { merge: true });
}
