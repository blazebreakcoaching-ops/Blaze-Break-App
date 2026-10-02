import { db } from './firestore';
import { collection, doc, setDoc, getDoc, deleteDoc, getDocs, query, orderBy, limit } from 'firebase/firestore';
import { SparkAnswer } from '../../reset-studio-engine';

// Reset Studio's "Not Ready Yet" save (Rumination Furnace) - the one
// place in Reset Studio where raw text is deliberately kept, because the
// user explicitly asked for it to be saved for later rather than burned.
// Everywhere else in Reset Studio the promise is that nothing typed
// survives the session unless the user says otherwise.

export interface SavedRuminationEntry {
  id: string;
  text: string;
  createdAt: string;
}

const randomId = (prefix: string) => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

export const saveRuminationEntry = async (uid: string, text: string): Promise<void> => {
  const entry: SavedRuminationEntry = { id: randomId('rumination'), text: text.slice(0, 2000), createdAt: new Date().toISOString() };
  await setDoc(doc(db, 'users', uid, 'rumination_saved_entries', entry.id), entry);
};

const SAVED_ENTRIES_LOAD_LIMIT = 30;

export const loadSavedRuminationEntries = async (uid: string): Promise<SavedRuminationEntry[]> => {
  try {
    const snap = await getDocs(query(
      collection(db, 'users', uid, 'rumination_saved_entries'),
      orderBy('createdAt', 'desc'),
      limit(SAVED_ENTRIES_LOAD_LIMIT)
    ));
    return snap.docs.map((d) => d.data() as SavedRuminationEntry);
  } catch (e) {
    return [];
  }
};

export const deleteSavedRuminationEntry = async (uid: string, id: string): Promise<void> => {
  await deleteDoc(doc(db, 'users', uid, 'rumination_saved_entries', id));
};

// Spark Check's rolling answer history - just enough real signal for
// shouldOfferQuickSupportForSpark's repeat-pattern gate (FLAT — THE
// SPARK CHECK: "if persistent low mood...emerges, route appropriately"),
// never a mood score or anything resembling a diagnosis.
const SPARK_HISTORY_LIMIT = 5;

export const loadRecentSparkAnswers = async (uid: string): Promise<SparkAnswer[]> => {
  try {
    const snap = await getDoc(doc(db, 'users', uid, 'preferences', 'spark_check'));
    if (snap.exists() && Array.isArray(snap.data().recentAnswers)) {
      return snap.data().recentAnswers as SparkAnswer[];
    }
  } catch (e) {
    // Falls back to an empty history rather than pretending one exists.
  }
  return [];
};

export const recordSparkAnswer = async (uid: string, answer: SparkAnswer): Promise<SparkAnswer[]> => {
  const existing = await loadRecentSparkAnswers(uid);
  const next = [...existing, answer].slice(-SPARK_HISTORY_LIMIT);
  await setDoc(doc(db, 'users', uid, 'preferences', 'spark_check'), {
    recentAnswers: next,
    updatedAt: new Date().toISOString(),
  }, { merge: true });
  return next;
};
