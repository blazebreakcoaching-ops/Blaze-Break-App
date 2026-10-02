import { db } from './firestore';
import { collection, doc, setDoc, getDoc, getDocs, query, orderBy, limit } from 'firebase/firestore';
import {
  NoticeAnswer, IntensityLevel, AnxietyIntervention, AnxietyCheckResponse, AnxietyHelpfulness,
} from '../../anxiety-reset-engine';

// Anxiety Reset's Firestore layer - mirrors breathing-reset-service.ts
// and decompression-doorway-service.ts exactly: try/catch-to-safe-default
// on every read, a session log with narrow updates added after creation
// for the checkpoint response and the occasional helpfulness feedback,
// and a simple completion counter gating how often "Did that feel
// useful?" is asked.

export interface AnxietyResetSessionRecord {
  id: string;
  notice: NoticeAnswer;
  intensity: IntensityLevel;
  intervention: AnxietyIntervention;
  checkResponse: AnxietyCheckResponse | null;
  helpful: AnxietyHelpfulness | null;
  createdAt: string;
}

const randomId = (prefix: string) => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

export const recordAnxietyResetSession = async (
  uid: string,
  data: { notice: NoticeAnswer; intensity: IntensityLevel; intervention: AnxietyIntervention }
): Promise<string> => {
  const record: AnxietyResetSessionRecord = {
    id: randomId('anxiety'),
    ...data,
    checkResponse: null,
    helpful: null,
    createdAt: new Date().toISOString(),
  };
  await setDoc(doc(db, 'users', uid, 'anxiety_reset_sessions', record.id), record);
  return record.id;
};

// The mandatory post-reset checkpoint and the occasional "did that feel
// useful?" both land on the same session record rather than a second
// collection.
export const updateAnxietyResetSessionFeedback = async (
  uid: string,
  sessionId: string,
  update: { checkResponse?: AnxietyCheckResponse; helpful?: AnxietyHelpfulness }
): Promise<void> => {
  await setDoc(doc(db, 'users', uid, 'anxiety_reset_sessions', sessionId), update, { merge: true });
};

const SESSIONS_LOAD_LIMIT = 30;

export const loadRecentAnxietyResetSessions = async (uid: string): Promise<AnxietyResetSessionRecord[]> => {
  try {
    const snap = await getDocs(query(
      collection(db, 'users', uid, 'anxiety_reset_sessions'),
      orderBy('createdAt', 'desc'),
      limit(SESSIONS_LOAD_LIMIT)
    ));
    return snap.docs.map((d) => d.data() as AnxietyResetSessionRecord);
  } catch (e) {
    return [];
  }
};

// Gates how often "Did that feel useful?" is asked - read-then-write is
// fine for a single-user button click, same tolerance as this
// codebase's other simple completion counters.
export const loadAnxietyResetTotalCount = async (uid: string): Promise<number> => {
  try {
    const snap = await getDoc(doc(db, 'users', uid, 'preferences', 'anxiety_reset'));
    if (snap.exists() && typeof snap.data().totalSessions === 'number') {
      return snap.data().totalSessions;
    }
  } catch (e) {
    // Falls back to 0 rather than pretending a history exists.
  }
  return 0;
};

export const recordAnxietyResetCompletion = async (uid: string): Promise<number> => {
  const current = await loadAnxietyResetTotalCount(uid);
  const next = current + 1;
  await setDoc(doc(db, 'users', uid, 'preferences', 'anxiety_reset'), {
    totalSessions: next,
    updatedAt: new Date().toISOString(),
  }, { merge: true });
  return next;
};

// ---- Parked worries ---------------------------------------------------------
// WORRY OFFLOAD - PARK IT: "It's captured. You don't have to keep
// rehearsing it to remember it." Retrievable and resolvable, same shape
// as Decompression Doorway's parked-items store.

export interface ParkedWorry {
  id: string;
  text: string;
  resolved: boolean;
  createdAt: string;
}

export const parkWorry = async (uid: string, text: string): Promise<string> => {
  const item: ParkedWorry = { id: randomId('worry'), text, resolved: false, createdAt: new Date().toISOString() };
  await setDoc(doc(db, 'users', uid, 'anxiety_parked_worries', item.id), item);
  return item.id;
};

const PARKED_WORRIES_LOAD_LIMIT = 50;

export const loadParkedWorries = async (uid: string): Promise<ParkedWorry[]> => {
  try {
    const snap = await getDocs(query(
      collection(db, 'users', uid, 'anxiety_parked_worries'),
      orderBy('createdAt', 'desc'),
      limit(PARKED_WORRIES_LOAD_LIMIT)
    ));
    return snap.docs.map((d) => d.data() as ParkedWorry).filter((w) => !w.resolved);
  } catch (e) {
    return [];
  }
};

export const resolveParkedWorry = async (uid: string, itemId: string): Promise<void> => {
  await setDoc(doc(db, 'users', uid, 'anxiety_parked_worries', itemId), { resolved: true }, { merge: true });
};
