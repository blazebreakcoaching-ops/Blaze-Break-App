import { db } from './firestore';
import { collection, doc, setDoc, getDoc, getDocs, query, orderBy, limit } from 'firebase/firestore';
import {
  NoticeAnswer, IntensityLevel, AnxietyIntervention, AnxietyCheckResponse, AnxietyHelpfulness,
  SettingContext, BreathingPreference, LaterFollowUpResponse, WorryReminderChoice,
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
  settingContext: SettingContext | null;
  checkResponse: AnxietyCheckResponse | null;
  helpful: AnxietyHelpfulness | null;
  // Decided once, at write time, from the real total-session count -
  // never recomputed later, same reasoning as Decompression Doorway's
  // pendingArrivalCheck (the sparse interval can't double-fire if the
  // count moves on before this session gets its later follow-up).
  pendingLaterFollowUp: boolean;
  laterFollowUp: LaterFollowUpResponse | null;
  createdAt: string;
}

const randomId = (prefix: string) => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

export const recordAnxietyResetSession = async (
  uid: string,
  data: {
    notice: NoticeAnswer; intensity: IntensityLevel; intervention: AnxietyIntervention;
    settingContext: SettingContext | null; pendingLaterFollowUp: boolean;
  }
): Promise<string> => {
  const record: AnxietyResetSessionRecord = {
    id: randomId('anxiety'),
    ...data,
    checkResponse: null,
    helpful: null,
    laterFollowUp: null,
    createdAt: new Date().toISOString(),
  };
  await setDoc(doc(db, 'users', uid, 'anxiety_reset_sessions', record.id), record);
  return record.id;
};

// The mandatory post-reset checkpoint, the occasional "did that feel
// useful?", and the selective later follow-up all land on the same
// session record rather than a third collection.
export const updateAnxietyResetSessionFeedback = async (
  uid: string,
  sessionId: string,
  update: { checkResponse?: AnxietyCheckResponse; helpful?: AnxietyHelpfulness; laterFollowUp?: LaterFollowUpResponse }
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

// A durable, user-set preference - distinct from (and respected
// alongside) the per-session "breathing made this worse before" signal.
export const loadBreathingPreference = async (uid: string): Promise<BreathingPreference | null> => {
  try {
    const snap = await getDoc(doc(db, 'users', uid, 'preferences', 'anxiety_reset'));
    if (snap.exists() && typeof snap.data().breathingPreference === 'string') {
      return snap.data().breathingPreference as BreathingPreference;
    }
  } catch (e) {
    // Falls back to null - no durable preference set yet.
  }
  return null;
};

export const saveBreathingPreference = async (uid: string, preference: BreathingPreference): Promise<void> => {
  await setDoc(doc(db, 'users', uid, 'preferences', 'anxiety_reset'), {
    breathingPreference: preference,
    updatedAt: new Date().toISOString(),
  }, { merge: true });
};

// The sparse, optional later follow-up - never asked right after the
// reset, only surfaced the next time the tool is opened.
export const loadPendingLaterFollowUpSession = async (uid: string): Promise<AnxietyResetSessionRecord | null> => {
  const recent = await loadRecentAnxietyResetSessions(uid);
  return recent.find((s) => s.pendingLaterFollowUp && s.laterFollowUp === null) ?? null;
};

// ---- Parked worries ---------------------------------------------------------
// WORRY OFFLOAD - PARK IT: "It's captured. You don't have to keep
// rehearsing it to remember it." Retrievable and resolvable, same shape
// as Decompression Doorway's parked-items store. Only ever written when
// the user chose Save Privately or Let Nova Use This to Notice Patterns
// - "Don't Save This" never calls this function at all.

export interface ParkedWorry {
  id: string;
  text: string;
  reminderDay: WorryReminderChoice | null;
  availableForPatterns: boolean;
  resolved: boolean;
  createdAt: string;
}

export const parkWorry = async (
  uid: string,
  text: string,
  reminderDay: WorryReminderChoice | null,
  availableForPatterns: boolean
): Promise<string> => {
  const item: ParkedWorry = {
    id: randomId('worry'), text, reminderDay, availableForPatterns, resolved: false, createdAt: new Date().toISOString(),
  };
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
