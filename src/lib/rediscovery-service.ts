import { db } from './firestore';
import { collection, doc, setDoc, getDoc, getDocs, query, orderBy, limit } from 'firebase/firestore';
import { RediscoveryClue, RediscoveryClueSource, WorkloadCheckSnapshot } from '../../rediscovery-engine';

// The Rediscovery Layer's Firestore layer - deliberately thin in this
// first batch. It stores the raw clues several tools feed into it (a One
// Less Thing "why" answer, a Workload Reality Check snapshot) so later
// pattern detection has real history to work from. The confirmed-insight
// store (My Rediscovery itself) is built in the next batch, alongside the
// UI that actually lets someone read/edit/archive what's stored here -
// no point writing an insights collection nobody can see yet.

const randomId = (prefix: string) => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

export const recordRediscoveryClue = async (
  uid: string,
  source: RediscoveryClueSource,
  prompt: string,
  answer: string
): Promise<void> => {
  const clue: RediscoveryClue = { id: randomId('clue'), source, prompt, answer, createdAt: new Date().toISOString() };
  await setDoc(doc(db, 'users', uid, 'rediscovery_clues', clue.id), clue);
};

const CLUES_LOAD_LIMIT = 100;

export const loadRediscoveryClues = async (uid: string, source?: RediscoveryClueSource): Promise<RediscoveryClue[]> => {
  try {
    const snap = await getDocs(query(
      collection(db, 'users', uid, 'rediscovery_clues'),
      orderBy('createdAt', 'desc'),
      limit(CLUES_LOAD_LIMIT)
    ));
    const clues = snap.docs.map((d) => d.data() as RediscoveryClue);
    return source ? clues.filter((c) => c.source === source) : clues;
  } catch (e) {
    return [];
  }
};

// Gates how often One Less Thing asks "Why was this on your plate?" -
// read-then-write is good enough for a single-user button click (not a
// high-contention counter), matching this codebase's existing tolerance
// for the same pattern elsewhere.
export const loadOneLessThingTotalCompletions = async (uid: string): Promise<number> => {
  try {
    const snap = await getDoc(doc(db, 'users', uid, 'preferences', 'one_less_thing'));
    if (snap.exists() && typeof snap.data().totalCompletions === 'number') {
      return snap.data().totalCompletions;
    }
  } catch (e) {
    // Falls back to 0 rather than pretending a history exists.
  }
  return 0;
};

export const recordOneLessThingCompletion = async (uid: string): Promise<number> => {
  const current = await loadOneLessThingTotalCompletions(uid);
  const next = current + 1;
  await setDoc(doc(db, 'users', uid, 'preferences', 'one_less_thing'), {
    totalCompletions: next,
    updatedAt: new Date().toISOString(),
  }, { merge: true });
  return next;
};

const todayDateKey = (): string => new Date().toISOString().split('T')[0]!;

// One snapshot per completed Workload Reality Check, keyed by date (an
// honest "latest check of the day" rather than piling up duplicates if
// someone recalibrates more than once in a day) - just enough history for
// the recurring-Must-Do pattern to work from real data.
export const recordWorkloadRealityCheckSnapshot = async (uid: string, mustDoTitles: string[]): Promise<void> => {
  await setDoc(doc(db, 'users', uid, 'workload_reality_check_history', todayDateKey()), {
    date: todayDateKey(),
    mustDoTitles,
    createdAt: new Date().toISOString(),
  }, { merge: true });
};

const WORKLOAD_HISTORY_LOAD_LIMIT = 14;

export const loadWorkloadRealityCheckHistory = async (uid: string): Promise<WorkloadCheckSnapshot[]> => {
  try {
    const snap = await getDocs(query(
      collection(db, 'users', uid, 'workload_reality_check_history'),
      orderBy('date', 'desc'),
      limit(WORKLOAD_HISTORY_LOAD_LIMIT)
    ));
    return snap.docs.map((d) => {
      const data = d.data();
      return { mustDoTitles: Array.isArray(data.mustDoTitles) ? data.mustDoTitles : [] };
    });
  } catch (e) {
    return [];
  }
};
