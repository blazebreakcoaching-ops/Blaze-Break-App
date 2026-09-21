import { getDb } from './firebase';
import { SupportContact } from '../types';

// Guardian/support contacts previously lived only as a plain array inside
// user_stats/core (`stats.supportCircle`), validated in firestore.rules by
// nothing more than "is a list, size <= 20" - no check that any entry
// actually has the shape a real contact needs (role, isGuardian,
// contactMethod). A fully field-validated `support_circle/{contactId}`
// subcollection already existed in firestore.rules but was never written
// to or read from anywhere. This module makes that the real source of
// truth, with a one-time backfill so nobody's already-saved contacts
// silently disappear.

const supportCircleCollection = async (uid: string) => {
  const db = await getDb();
  const { collection } = await import('firebase/firestore');
  return collection(db, 'users', uid, 'support_circle');
};

export const loadSupportCircle = async (uid: string): Promise<SupportContact[]> => {
  const { getDocs } = await import('firebase/firestore');
  const snap = await getDocs(await supportCircleCollection(uid));
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<SupportContact, 'id'>) }));
};

// Only backfills when the subcollection is genuinely empty - never
// overwrites it, so this can safely run on every load without risking a
// contact added on another device being clobbered by stale local data.
// Writes are sequential rather than batched: a real support circle is a
// handful of contacts at most, and sequential setDoc calls need no extra
// import or transaction-size reasoning for that size.
export const migrateSupportCircleIfNeeded = async (
  uid: string,
  legacyContacts: SupportContact[] | undefined,
): Promise<SupportContact[]> => {
  const existing = await loadSupportCircle(uid);
  if (existing.length > 0) return existing;
  if (!legacyContacts || legacyContacts.length === 0) return [];

  const db = await getDb();
  const { doc, setDoc } = await import('firebase/firestore');
  const now = new Date().toISOString();
  for (const contact of legacyContacts) {
    const { id, ...rest } = contact;
    try {
      await setDoc(doc(db, 'users', uid, 'support_circle', id), {
        ...rest,
        createdAt: now,
        updatedAt: now,
      });
    } catch (e) {
      // Non-fatal per contact - a partial backfill still leaves the rest
      // of this person's circle intact rather than aborting the whole
      // migration over one bad record.
    }
  }
  return legacyContacts;
};

export const addSupportCircleContact = async (uid: string, contact: SupportContact): Promise<void> => {
  const db = await getDb();
  const { doc, setDoc } = await import('firebase/firestore');
  const { id, ...rest } = contact;
  const now = new Date().toISOString();
  await setDoc(doc(db, 'users', uid, 'support_circle', id), {
    ...rest,
    createdAt: now,
    updatedAt: now,
  });
};

export const removeSupportCircleContact = async (uid: string, contactId: string): Promise<void> => {
  const db = await getDb();
  const { doc, deleteDoc } = await import('firebase/firestore');
  await deleteDoc(doc(db, 'users', uid, 'support_circle', contactId));
};
