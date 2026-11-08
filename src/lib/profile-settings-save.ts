import type { UserProfileData } from '../types';
import { auth, getDb } from './firebase';
import { NOVA_PERMISSION_DEFAULTS } from './nova-brain';
import { hasExplicitNovaLearningConsent } from './nova-learning-consent';
import { canonicalPreferenceWrites, preferencesFromWebProfile } from '../../personal-preferences';

/**
 * A Settings success message must mean the database actually committed.
 * Save the profile and its memory-consent flags in one Firestore batch so
 * a failed write cannot leave a contradictory "learning off" UI/server.
 */
export async function saveVerifiedProfileSettings(
  uid: string,
  profile: UserProfileData,
  options: { lastSeenChangelogVersion?: string } = {},
): Promise<void> {
  if (!uid || auth.currentUser?.uid !== uid) throw new Error('Account changed');
  const db = await getDb();
  if (auth.currentUser?.uid !== uid) throw new Error('Account changed');
  const { doc, getDoc, writeBatch } = await import('firebase/firestore');

  // Firestore rejects explicit undefined values. Do not silently discard
  // the legitimate "Off" questioning style: it is persisted as null.
  const cleanProfile = Object.fromEntries(
    Object.entries(profile).filter(([key, value]) =>
      value !== undefined && key !== 'subscription'),
  );
  const updatedAt = new Date().toISOString();
  const permissionsRef = doc(db, 'users', uid, 'nova_permissions', 'current');
  // Rules require 13 named fields on a NEW permissions document.
  // Read first to distinguish a missing document from an existing one:
  // merging all defaults into an existing record could overwrite choices
  // the customer has already withdrawn in the Privacy Centre.
  const rootRef = doc(db, 'users', uid);
  const [existingPermissions, existingRoot] = await Promise.all([getDoc(permissionsRef), getDoc(rootRef)]);
  if (auth.currentUser?.uid !== uid) throw new Error('Account changed');
  // Personal welcome preferences also go to the canonical documents the
  // Expo app reads (users/{uid} + preferences/ui), in the SAME batch, so web
  // and native stay in step and a failed save changes nothing. Throws a
  // readable message for an invalid time zone before anything is written.
  const canonical = canonicalPreferenceWrites(preferencesFromWebProfile(profile as unknown as Record<string, unknown>));
  const batch = writeBatch(db);
  batch.set(doc(db, 'users', uid, 'user_stats', 'core'),
    { profile: cleanProfile, updatedAt,
      ...(options.lastSeenChangelogVersion ? {
        lastSeenChangelogVersion: options.lastSeenChangelogVersion,
      } : {}),
    }, { merge: true });
  batch.set(permissionsRef, {
    ...(existingPermissions.exists() ? {} : NOVA_PERMISSION_DEFAULTS),
    allowNovaMemory: hasExplicitNovaLearningConsent(profile.letNovaLearn),
    allowNovaUseSavedMemories: hasExplicitNovaLearningConsent(profile.letNovaLearn),
    updatedAt,
  }, { merge: true });
  // The root document's rules differ for create (createdAt required) and
  // update (createdAt must not change), so check which this is.
  batch.set(rootRef, existingRoot.exists()
    ? { ...canonical.root, updatedAt }
    : { ...canonical.root, createdAt: updatedAt, updatedAt }, { merge: true });
  batch.set(doc(db, 'users', uid, 'preferences', 'ui'), canonical.ui, { merge: true });
  if (auth.currentUser?.uid !== uid) throw new Error('Account changed');
  await batch.commit();
  if (auth.currentUser?.uid !== uid) throw new Error('Account changed after save');
}
