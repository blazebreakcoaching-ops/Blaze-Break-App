import { db } from './firestore';
import {
  collection, doc, addDoc, setDoc, updateDoc, deleteDoc, getDocs, query, orderBy, limit,
} from 'firebase/firestore';
import {
  CapacityCheckIn, CapacityLevel, Stressor, StressorCategory, StressorSeverity, StressorPersistence,
  ReductionLevel, StressorAction, computeCapacityScore, computeGrossLoad, computeNetLoad, computeCapacityProtected,
  RecoveryActionType, RecoveryHelpfulness, RecoveryFeedbackEntry,
} from '../../energy-delta-engine';

// Energy Delta Model v1's Firestore layer - mirrors every other service
// file in this codebase (movement-snacks-service.ts, recovery-recipes-
// service.ts): try/catch-to-safe-default on every read, so the feature
// degrades to its "not checked in yet"/"no stressors logged" empty states
// rather than breaking if Firestore is unreachable - the deterministic
// engine in energy-delta-engine.ts never depends on this layer succeeding.

// ---------- Capacity check-ins (sections 1, 9) ----------

export interface CapacityCheckInRecord extends CapacityCheckIn {
  id: string;
  score: number;
  createdAt: string;
}

// Every check-in is a new, append-only history entry - never overwritten -
// so a same-day re-check (section 9) adds a second entry rather than
// losing the morning's reading. "Current capacity" is always just the
// most recent one.
export const recordCapacityCheckIn = async (uid: string, checkIn: CapacityCheckIn): Promise<CapacityCheckInRecord> => {
  const score = computeCapacityScore(checkIn);
  const createdAt = new Date().toISOString();
  const ref = await addDoc(collection(db, 'users', uid, 'capacity_checkins'), {
    physical: checkIn.physical,
    mental: checkIn.mental,
    emotional: checkIn.emotional,
    score,
    createdAt,
  });
  return { id: ref.id, ...checkIn, score, createdAt };
};

const RECENT_CHECKIN_LIMIT = 60; // enough for several weeks of multiple-per-day check-ins

export const loadRecentCapacityCheckIns = async (uid: string): Promise<CapacityCheckInRecord[]> => {
  try {
    const snap = await getDocs(query(
      collection(db, 'users', uid, 'capacity_checkins'),
      orderBy('createdAt', 'desc'),
      limit(RECENT_CHECKIN_LIMIT)
    ));
    return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<CapacityCheckInRecord, 'id'>) }));
  } catch (e) {
    return [];
  }
};

// The single most recent check-in, or null if the person has never
// checked in - section 17's "Not checked in yet" is this returning null,
// never a synthesised 0.
export const loadLatestCapacityCheckIn = async (uid: string): Promise<CapacityCheckInRecord | null> => {
  const recent = await loadRecentCapacityCheckIns(uid);
  return recent[0] ?? null;
};

// ---------- Stressors (sections 2-4, 15) ----------

export const loadStressors = async (uid: string): Promise<Stressor[]> => {
  try {
    const snap = await getDocs(query(collection(db, 'users', uid, 'energy_stressors'), orderBy('createdAt', 'desc')));
    return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Stressor, 'id'>) }));
  } catch (e) {
    return [];
  }
};

export const addStressor = async (
  uid: string,
  stressor: { name: string; category: StressorCategory; severity: StressorSeverity; persistence: StressorPersistence }
): Promise<Stressor> => {
  const now = new Date().toISOString();
  const ref = await addDoc(collection(db, 'users', uid, 'energy_stressors'), {
    name: stressor.name,
    category: stressor.category,
    severity: stressor.severity,
    persistence: stressor.persistence,
    status: 'active',
    createdAt: now,
    updatedAt: now,
  });
  return { id: ref.id, ...stressor, status: 'active', createdAt: now, updatedAt: now };
};

// Section 4's "Did this reduce the demand?" report - updates the
// stressor's current reduction level in place. Only ever the most recent
// report is kept (section 4 doesn't ask for a reduction history), which
// keeps computeStressorCurrentValue's "most recently reported reduction"
// contract simple and exact.
export const reportStressorReduction = async (uid: string, stressorId: string, reduction: ReductionLevel): Promise<void> => {
  await updateDoc(doc(db, 'users', uid, 'energy_stressors', stressorId), {
    reduction, updatedAt: new Date().toISOString(),
  });
};

// Section 15's Energy Audit classification (Control/Reduce/Delegate/
// Defer/Accept) - purely a label the person chooses, never changes the
// load calculation itself.
export const classifyStressor = async (uid: string, stressorId: string, action: StressorAction): Promise<void> => {
  await updateDoc(doc(db, 'users', uid, 'energy_stressors', stressorId), {
    action, updatedAt: new Date().toISOString(),
  });
};

export const resolveStressor = async (uid: string, stressorId: string): Promise<void> => {
  await updateDoc(doc(db, 'users', uid, 'energy_stressors', stressorId), {
    status: 'resolved', updatedAt: new Date().toISOString(),
  });
};

export const deleteStressor = async (uid: string, stressorId: string): Promise<void> => {
  await deleteDoc(doc(db, 'users', uid, 'energy_stressors', stressorId));
};

// ---------- Daily snapshots (sections 10-12) ----------

export interface DailySnapshotRecord {
  date: string; // YYYY-MM-DD, also the doc id
  capacity: number | null;
  grossLoad: number;
  netLoad: number;
  capacityProtected: number;
  energyDelta: number | null;
  updatedAt: string;
}

const todayDateKey = (): string => new Date().toISOString().split('T')[0]!;

// Upserts today's snapshot from whatever the dashboard just computed live
// (section 9: "the latest capacity reading", not a point-in-time
// reconstruction) - called whenever the dashboard has a fresh capacity +
// stressor list to show, so the 7-day pattern is built from real numbers
// actually shown to the user that day, never values Blaze Break invents
// after the fact.
export const recordDailySnapshot = async (
  uid: string, capacity: number | null, stressors: Pick<Stressor, 'severity' | 'persistence' | 'reduction' | 'status'>[]
): Promise<void> => {
  const grossLoad = computeGrossLoad(stressors);
  const netLoad = computeNetLoad(stressors);
  const capacityProtected = computeCapacityProtected(stressors);
  const energyDelta = capacity === null ? null : capacity - netLoad;
  await setDoc(doc(db, 'users', uid, 'energy_daily_snapshots', todayDateKey()), {
    date: todayDateKey(),
    capacity,
    grossLoad,
    netLoad,
    capacityProtected,
    energyDelta,
    updatedAt: new Date().toISOString(),
  }, { merge: true });
};

const RECENT_SNAPSHOT_LIMIT = 7;

// The last 7 calendar days' snapshots, oldest first - ready to feed
// straight into computeSevenDayDelta/detectSustainedCapacityGap. A day
// with no snapshot simply isn't in the array (section 17: never a
// fabricated zero-filled day).
export const loadRecentDailySnapshots = async (uid: string): Promise<DailySnapshotRecord[]> => {
  try {
    const snap = await getDocs(query(
      collection(db, 'users', uid, 'energy_daily_snapshots'),
      orderBy('date', 'desc'),
      limit(RECENT_SNAPSHOT_LIMIT)
    ));
    return snap.docs.map((d) => d.data() as DailySnapshotRecord).reverse();
  } catch (e) {
    return [];
  }
};

// ---------- Recovery feedback (section 8) ----------

export interface RecoveryFeedbackRecord extends RecoveryFeedbackEntry {
  id: string;
  createdAt: string;
}

// Append-only, same reasoning as capacity_checkins - each "did that help?"
// answer is its own history entry, never overwritten, so
// computePreferredRecoveryAction always sees the full rated history.
export const recordRecoveryFeedback = async (
  uid: string, actionType: RecoveryActionType, helpfulness: RecoveryHelpfulness
): Promise<void> => {
  await addDoc(collection(db, 'users', uid, 'energy_recovery_feedback'), {
    actionType, helpfulness, createdAt: new Date().toISOString(),
  });
};

const RECENT_FEEDBACK_LIMIT = 120;

export const loadRecoveryFeedback = async (uid: string): Promise<RecoveryFeedbackRecord[]> => {
  try {
    const snap = await getDocs(query(
      collection(db, 'users', uid, 'energy_recovery_feedback'),
      orderBy('createdAt', 'desc'),
      limit(RECENT_FEEDBACK_LIMIT)
    ));
    return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<RecoveryFeedbackRecord, 'id'>) }));
  } catch (e) {
    return [];
  }
};

export type { CapacityLevel };
