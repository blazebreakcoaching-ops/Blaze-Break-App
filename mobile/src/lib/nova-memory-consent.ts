// RN port of the memory-consent slice of ../../../src/lib/nova-brain.ts
// (NOVA_PERMISSION_DEFAULTS / ensureNovaPermissionsExist / setNovaMemoryConsent).
// Same Firestore doc, same field names, same defaults - firestore.rules'
// nova_permissions/current validator requires every one of these
// category booleans present on every write (hasAll), not just the two
// memory ones, so a mobile-only account (which never ran web's
// onboarding flow that would otherwise have created this doc) needs the
// same full-defaults write the web app uses, not a partial one that
// would be rejected.
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { getDb } from './firebase';

const NOVA_PERMISSION_DEFAULTS = {
  allowCheckins: true,
  allowEnergyBudgets: true,
  allowMoodPulses: true,
  allowBodyCheckins: true,
  allowWins: true,
  allowWeeklyReviews: true,
  allowBoundaryScripts: true,
  allowGoals: true,
  allowRecoveryDebt: true,
  allowRecoveryVelocity: true,
  allowEnergyTrend: true,
  allowMoodTrend: true,
};

export async function getNovaMemoryConsent(uid: string): Promise<boolean> {
  try {
    const db = await getDb();
    const snap = await getDoc(doc(db, 'users', uid, 'nova_permissions', 'current'));
    const data = snap.data();
    // Missing doc or missing field both mean "never explicitly turned
    // off" - same default-on reasoning as nova-brain.ts's own
    // isNovaMemoryConsentGrantedSync.
    return data?.allowNovaMemory !== false;
  } catch {
    return true;
  }
}

export async function setNovaMemoryConsent(uid: string, enabled: boolean): Promise<void> {
  const db = await getDb();
  const ref = doc(db, 'users', uid, 'nova_permissions', 'current');
  const existing = await getDoc(ref);
  await setDoc(ref, {
    // Only applied when the doc does not exist yet (a mobile-only
    // account onboarding this preference for the first time) - merge
    // below preserves every field a prior write (web or mobile) already
    // set, matching ensureNovaPermissionsExist's own "never overwrites
    // an existing choice" rule.
    ...(existing.exists() ? {} : NOVA_PERMISSION_DEFAULTS),
    allowNovaMemory: enabled,
    allowNovaUseSavedMemories: enabled,
    updatedAt: new Date().toISOString(),
  }, { merge: true });
}
