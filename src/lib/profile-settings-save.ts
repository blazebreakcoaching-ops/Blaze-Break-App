import type { UserProfileData } from '../types';
import { auth, getDb } from './firebase';

/**
 * A Settings success message must mean the database actually committed.
 * Save the profile and its memory-consent flags in one Firestore batch so
 * a failed write cannot leave a contradictory "learning off" UI/server.
 */
export async function saveVerifiedProfileSettings(
  uid: string,
  profile: UserProfileData,
): Promise<void> {
  if (!uid || auth.currentUser?.uid !== uid) throw new Error('Account changed');
  const db = await getDb();
  if (auth.currentUser?.uid !== uid) throw new Error('Account changed');
  const { doc, writeBatch } = await import('firebase/firestore');

  // Firestore rejects explicit undefined values. Do not silently discard
  // the legitimate "Off" questioning style: it is persisted as null.
  const cleanProfile = Object.fromEntries(
    Object.entries(profile).filter(([, value]) => value !== undefined),
  );
  const updatedAt = new Date().toISOString();
  const batch = writeBatch(db);
  batch.set(doc(db, 'users', uid, 'user_stats', 'core'),
    { profile: cleanProfile, updatedAt }, { merge: true });
  batch.set(doc(db, 'users', uid, 'nova_permissions', 'current'), {
    allowNovaMemory: profile.letNovaLearn !== false,
    allowNovaUseSavedMemories: profile.letNovaLearn !== false,
    updatedAt,
  }, { merge: true });
  if (auth.currentUser?.uid !== uid) throw new Error('Account changed');
  await batch.commit();
  if (auth.currentUser?.uid !== uid) throw new Error('Account changed after save');
}
