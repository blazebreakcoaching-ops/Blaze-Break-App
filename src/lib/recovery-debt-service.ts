import { db } from './firestore';
import { collection, doc, setDoc, getDoc, getDocs, query, orderBy, limit } from 'firebase/firestore';
import { SleepNight } from '../../recovery-debt-engine';

// Recovery Debt v2's own tiny Firestore layer - just enough real data to
// make Sleep Shortfall genuine (a target plus a short nightly log),
// mirroring the rest of this codebase's try/catch-to-safe-default
// convention. Mental Fatigue and Social Load need no service of their
// own here - they're read straight off the existing capacity check-ins
// and stressors (energy-delta-service.ts).

const DEFAULT_SLEEP_TARGET_HOURS = 8;

export const loadSleepTargetHours = async (uid: string): Promise<number> => {
  try {
    const snap = await getDoc(doc(db, 'users', uid, 'preferences', 'recovery_debt'));
    if (snap.exists() && typeof snap.data().sleepTargetHours === 'number') {
      return snap.data().sleepTargetHours;
    }
  } catch (e) {
    // Falls back to the honest default rather than pretending a target was set.
  }
  return DEFAULT_SLEEP_TARGET_HOURS;
};

export const setSleepTargetHours = async (uid: string, targetHours: number): Promise<void> => {
  await setDoc(doc(db, 'users', uid, 'preferences', 'recovery_debt'), {
    sleepTargetHours: targetHours,
    updatedAt: new Date().toISOString(),
  }, { merge: true });
};

const todayDateKey = (): string => new Date().toISOString().split('T')[0]!;

// Upserted by date - one honest reading per night, same reasoning as
// energy_daily_snapshots (the latest log for a given night replaces any
// earlier one rather than accumulating duplicates).
export const logSleepHours = async (uid: string, hours: number): Promise<void> => {
  await setDoc(doc(db, 'users', uid, 'sleep_logs', todayDateKey()), {
    date: todayDateKey(),
    hours,
    updatedAt: new Date().toISOString(),
  }, { merge: true });
};

const RECENT_NIGHTS_LIMIT = 7;

// Oldest-first, ready to feed straight into computeSleepShortfall. A
// night with no log simply isn't in the array - never a fabricated 0.
export const loadRecentSleepNights = async (uid: string): Promise<SleepNight[]> => {
  try {
    const snap = await getDocs(query(
      collection(db, 'users', uid, 'sleep_logs'),
      orderBy('date', 'desc'),
      limit(RECENT_NIGHTS_LIMIT)
    ));
    return snap.docs.map((d) => d.data() as SleepNight).reverse();
  } catch (e) {
    return [];
  }
};
