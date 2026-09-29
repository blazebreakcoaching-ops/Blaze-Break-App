import { db } from './firestore';
import {
  collection, doc, getDoc, getDocs, setDoc, addDoc, query, orderBy, limit,
} from 'firebase/firestore';
import { MovementFeedback } from '../../movement-snacks-content';
import { MovementContext } from '../../movement-snacks-content';
import { MovementUsageEntry } from '../../movement-snacks-recommendation';

// Movement Snacks' Firebase service (Foundation batch, section 27) - every
// Firestore read/write for the feature lives here, mirroring
// grounding-personalisation.ts's convention: try/catch-to-safe-default on
// every read, so the feature stays usable if Firestore is unreachable
// (section 31's "Firebase unavailable" acceptance test - the movement
// itself is never blocked on this).

export interface MovementPreferences {
  favourites?: string[];
  seatedPreference?: boolean;
  audioPreference?: boolean;
  postMovementFeedbackEnabled?: boolean;
  preferredAfterWorkCue?: string;
  updatedAt: string;
}

const DEFAULT_PREFERENCES: MovementPreferences = { updatedAt: new Date(0).toISOString() };

export const loadMovementPreferences = async (uid: string): Promise<MovementPreferences> => {
  try {
    const snap = await getDoc(doc(db, 'users', uid, 'movementPreferences', 'main'));
    if (!snap.exists()) return DEFAULT_PREFERENCES;
    return snap.data() as MovementPreferences;
  } catch (e) {
    return DEFAULT_PREFERENCES;
  }
};

export const updateMovementPreferences = async (uid: string, partial: Partial<MovementPreferences>): Promise<void> => {
  await setDoc(doc(db, 'users', uid, 'movementPreferences', 'main'), {
    ...partial,
    updatedAt: new Date().toISOString(),
  }, { merge: true });
};

export const toggleFavourite = async (uid: string, movementId: string, isFavourite: boolean): Promise<void> => {
  const prefs = await loadMovementPreferences(uid);
  const current = prefs.favourites || [];
  const next = isFavourite
    ? [...new Set([...current, movementId])].slice(0, 20)
    : current.filter((id) => id !== movementId);
  await updateMovementPreferences(uid, { favourites: next });
};

export interface MovementHistoryEntry {
  id: string;
  movementId: string;
  context?: MovementContext;
  skipped: boolean;
  feedback?: MovementFeedback;
  createdAt: string;
}

// Section 18's "avoid repetition" tracking - one doc per movement attempt.
// Deliberately minimal fields (section 27's "keep stored data minimal") -
// no reflection text, no location, nothing beyond what the recommendation
// engine and favourites screen actually need.
export const recordMovementHistory = async (
  uid: string,
  entry: { movementId: string; context?: MovementContext; skipped: boolean; feedback?: MovementFeedback }
): Promise<void> => {
  await addDoc(collection(db, 'users', uid, 'movementHistory'), {
    movementId: entry.movementId,
    ...(entry.context ? { context: entry.context } : {}),
    skipped: entry.skipped,
    ...(entry.feedback ? { feedback: entry.feedback } : {}),
    createdAt: new Date().toISOString(),
  });
};

const RECENT_HISTORY_LIMIT = 40;

export const loadRecentMovementHistory = async (uid: string): Promise<MovementHistoryEntry[]> => {
  try {
    const snap = await getDocs(query(
      collection(db, 'users', uid, 'movementHistory'),
      orderBy('createdAt', 'desc'),
      limit(RECENT_HISTORY_LIMIT)
    ));
    return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<MovementHistoryEntry, 'id'>) }));
  } catch (e) {
    return [];
  }
};

// Turns raw history entries into the aggregate shape the (pure, stateless)
// recommendation engine expects - kept here rather than in
// movement-snacks-recommendation.ts so that module stays free of any
// Firestore-shaped assumptions and is trivially unit-testable on its own.
export const computeUsageFromHistory = (entries: MovementHistoryEntry[], favourites: string[] = []): MovementUsageEntry[] => {
  const byMovement = new Map<string, MovementUsageEntry>();
  const latestFeedbackAt = new Map<string, string>();
  for (const entry of entries) {
    const existing = byMovement.get(entry.movementId) || { movementId: entry.movementId, completionCount: 0 };
    if (entry.skipped) {
      existing.lastSkippedAt = existing.lastSkippedAt && existing.lastSkippedAt > entry.createdAt ? existing.lastSkippedAt : entry.createdAt;
    } else {
      existing.completionCount += 1;
      existing.lastCompletedAt = existing.lastCompletedAt && existing.lastCompletedAt > entry.createdAt ? existing.lastCompletedAt : entry.createdAt;
    }
    // Whichever feedback is most recent for this movement wins - a later
    // "looser"/"more settled" should un-flag an earlier "more uncomfortable"
    // (section 6), not leave it permanently deprioritised.
    const priorFeedbackAt = latestFeedbackAt.get(entry.movementId);
    if (entry.feedback && (!priorFeedbackAt || entry.createdAt > priorFeedbackAt)) {
      latestFeedbackAt.set(entry.movementId, entry.createdAt);
      existing.recentlyUncomfortable = entry.feedback === 'more_uncomfortable';
    }
    byMovement.set(entry.movementId, existing);
  }
  for (const id of favourites) {
    const existing = byMovement.get(id) || { movementId: id, completionCount: 0 };
    existing.favourite = true;
    byMovement.set(id, existing);
  }
  return [...byMovement.values()];
};
