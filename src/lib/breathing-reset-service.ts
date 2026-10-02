import { db } from './firestore';
import { collection, doc, setDoc, getDoc, getDocs, query, orderBy, limit } from 'firebase/firestore';
import { BreathingPracticeId, BreathingHelpfulness, CheckpointResponse } from '../../breathing-reset-engine';

export interface BreathingSessionRecord {
  id: string;
  practiceId: BreathingPracticeId;
  durationSeconds: number;
  checkpointResponse: CheckpointResponse | null;
  helpful: BreathingHelpfulness | null;
  createdAt: string;
}

const randomId = (prefix: string) => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

export const recordBreathingSession = async (
  uid: string,
  data: { practiceId: BreathingPracticeId; durationSeconds: number; checkpointResponse?: CheckpointResponse | null; helpful?: BreathingHelpfulness | null }
): Promise<string> => {
  const record: BreathingSessionRecord = {
    id: randomId('breathing'),
    practiceId: data.practiceId,
    durationSeconds: data.durationSeconds,
    checkpointResponse: data.checkpointResponse ?? null,
    helpful: data.helpful ?? null,
    createdAt: new Date().toISOString(),
  };
  await setDoc(doc(db, 'users', uid, 'breathing_reset_sessions', record.id), record);
  return record.id;
};

// Lets a session already written get its checkpoint response or
// helpfulness feedback added afterwards, without a second collection -
// the post-session checkpoint and the occasional "did it help?" both
// happen after the session itself was already logged.
export const updateBreathingSessionFeedback = async (
  uid: string,
  sessionId: string,
  update: { checkpointResponse?: CheckpointResponse; helpful?: BreathingHelpfulness }
): Promise<void> => {
  await setDoc(doc(db, 'users', uid, 'breathing_reset_sessions', sessionId), update, { merge: true });
};

const SESSIONS_LOAD_LIMIT = 30;

export const loadRecentBreathingSessions = async (uid: string): Promise<BreathingSessionRecord[]> => {
  try {
    const snap = await getDocs(query(
      collection(db, 'users', uid, 'breathing_reset_sessions'),
      orderBy('createdAt', 'desc'),
      limit(SESSIONS_LOAD_LIMIT)
    ));
    return snap.docs.map((d) => d.data() as BreathingSessionRecord);
  } catch (e) {
    return [];
  }
};

// Gates "Did it help?" to every third session - read-then-write is fine
// for a single-user button click, same tolerance as this codebase's
// other simple completion counters.
export const loadBreathingSessionTotalCount = async (uid: string): Promise<number> => {
  try {
    const snap = await getDoc(doc(db, 'users', uid, 'preferences', 'breathing_reset'));
    if (snap.exists() && typeof snap.data().totalSessions === 'number') {
      return snap.data().totalSessions;
    }
  } catch (e) {
    // Falls back to 0 rather than pretending a history exists.
  }
  return 0;
};

export const recordBreathingSessionCompletion = async (uid: string): Promise<number> => {
  const current = await loadBreathingSessionTotalCount(uid);
  const next = current + 1;
  await setDoc(doc(db, 'users', uid, 'preferences', 'breathing_reset'), {
    totalSessions: next,
    updatedAt: new Date().toISOString(),
  }, { merge: true });
  return next;
};
