import { db } from './firestore';
import { collection, doc, setDoc, getDoc, getDocs, query, orderBy, limit } from 'firebase/firestore';
import {
  DoorwayDepth,
  ArrivalCheckResponse,
  FollowedThroughAnswer,
  NudgeFrequency,
  CAPACITY_HISTORY_MAX,
  appendCapacityHistory,
} from '../../decompression-doorway-engine';

// My Thresholds: one profile per recurring leaving->arriving pair, not
// one row per crossing - a preferred arrival quality, a saved "My
// Transition Anchor", nudge consent and a bounded capacity-at-arrival
// history (for pattern detection) live here. totalPrompted/totalSkipped
// track the pair's own skip rate, never a global streak.
export interface ThresholdProfile {
  pairKey: string;
  leaving: string;
  arriving: string;
  preferredArrivalQuality: string | null;
  transitionAnchor: string | null;
  nudgeConsent: NudgeFrequency;
  totalCrossings: number;
  totalPrompted: number;
  totalSkipped: number;
  capacityHistory: (number | null)[];
  createdAt: string;
  updatedAt: string;
}

const thresholdDoc = (uid: string, pairKey: string) => doc(db, 'users', uid, 'decompression_thresholds', pairKey);

export const loadThresholdProfile = async (uid: string, pairKey: string): Promise<ThresholdProfile | null> => {
  try {
    const snap = await getDoc(thresholdDoc(uid, pairKey));
    return snap.exists() ? (snap.data() as ThresholdProfile) : null;
  } catch (e) {
    return null;
  }
};

const THRESHOLDS_LOAD_LIMIT = 50;

export const loadAllThresholdProfiles = async (uid: string): Promise<ThresholdProfile[]> => {
  try {
    const snap = await getDocs(query(
      collection(db, 'users', uid, 'decompression_thresholds'),
      orderBy('updatedAt', 'desc'),
      limit(THRESHOLDS_LOAD_LIMIT)
    ));
    return snap.docs.map((d) => d.data() as ThresholdProfile);
  } catch (e) {
    return [];
  }
};

// Creates the profile on first crossing of a pair, otherwise merges -
// this is the only place a pair's saved preferences (arrival quality,
// anchor, nudge consent) get written, always from an explicit user choice.
export const upsertThresholdProfile = async (
  uid: string,
  leaving: string,
  arriving: string,
  pairKey: string,
  update: Partial<Pick<ThresholdProfile, 'preferredArrivalQuality' | 'transitionAnchor' | 'nudgeConsent'>>
): Promise<void> => {
  const existing = await loadThresholdProfile(uid, pairKey);
  const now = new Date().toISOString();
  const next: ThresholdProfile = existing ?? {
    pairKey, leaving, arriving,
    preferredArrivalQuality: null, transitionAnchor: null, nudgeConsent: 'only_hard_days',
    totalCrossings: 0, totalPrompted: 0, totalSkipped: 0, capacityHistory: [],
    createdAt: now, updatedAt: now,
  };
  await setDoc(thresholdDoc(uid, pairKey), { ...next, ...update, updatedAt: now }, { merge: true });
};

// Called once per real crossing (not a skip) - advances the crossing
// count and appends real capacity-at-arrival to the bounded history used
// for the low-capacity-arrival pattern.
export const recordCrossingForThreshold = async (
  uid: string,
  leaving: string,
  arriving: string,
  pairKey: string,
  capacityAtEntry: number | null
): Promise<void> => {
  const existing = await loadThresholdProfile(uid, pairKey);
  const now = new Date().toISOString();
  const base: ThresholdProfile = existing ?? {
    pairKey, leaving, arriving,
    preferredArrivalQuality: null, transitionAnchor: null, nudgeConsent: 'only_hard_days',
    totalCrossings: 0, totalPrompted: 0, totalSkipped: 0, capacityHistory: [],
    createdAt: now, updatedAt: now,
  };
  await setDoc(thresholdDoc(uid, pairKey), {
    ...base,
    totalCrossings: base.totalCrossings + 1,
    totalPrompted: base.totalPrompted + 1,
    capacityHistory: appendCapacityHistory(base.capacityHistory ?? [], capacityAtEntry).slice(-CAPACITY_HISTORY_MAX),
    updatedAt: now,
  }, { merge: true });
};

// A skip is still a real, counted event - the skip-rate pattern needs it
// to tell "rarely offered" apart from "often declined".
export const recordSkipForThreshold = async (uid: string, leaving: string, arriving: string, pairKey: string): Promise<void> => {
  const existing = await loadThresholdProfile(uid, pairKey);
  const now = new Date().toISOString();
  const base: ThresholdProfile = existing ?? {
    pairKey, leaving, arriving,
    preferredArrivalQuality: null, transitionAnchor: null, nudgeConsent: 'only_hard_days',
    totalCrossings: 0, totalPrompted: 0, totalSkipped: 0, capacityHistory: [],
    createdAt: now, updatedAt: now,
  };
  await setDoc(thresholdDoc(uid, pairKey), {
    ...base,
    totalPrompted: base.totalPrompted + 1,
    totalSkipped: base.totalSkipped + 1,
    updatedAt: now,
  }, { merge: true });
};

// ---- Unfinished-business parking lot ---------------------------------------
// PARK IT / SCHEDULE IT: retrievable, never silently lost - a reminder
// day is optional and only ever set when the user picked Schedule It.

export interface ParkedItem {
  id: string;
  text: string;
  disposition: 'park' | 'schedule';
  reminderDay: string | null;
  resolved: boolean;
  createdAt: string;
}

const randomId = (prefix: string) => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

export const parkUnfinishedBusiness = async (
  uid: string,
  text: string,
  disposition: 'park' | 'schedule',
  reminderDay: string | null
): Promise<string> => {
  const item: ParkedItem = { id: randomId('parked'), text, disposition, reminderDay, resolved: false, createdAt: new Date().toISOString() };
  await setDoc(doc(db, 'users', uid, 'decompression_parked_items', item.id), item);
  return item.id;
};

const PARKED_ITEMS_LOAD_LIMIT = 50;

export const loadParkedItems = async (uid: string): Promise<ParkedItem[]> => {
  try {
    const snap = await getDocs(query(
      collection(db, 'users', uid, 'decompression_parked_items'),
      orderBy('createdAt', 'desc'),
      limit(PARKED_ITEMS_LOAD_LIMIT)
    ));
    return snap.docs.map((d) => d.data() as ParkedItem).filter((i) => !i.resolved);
  } catch (e) {
    return [];
  }
};

export const resolveParkedItem = async (uid: string, itemId: string): Promise<void> => {
  await setDoc(doc(db, 'users', uid, 'decompression_parked_items', itemId), { resolved: true }, { merge: true });
};

// ---- Transition session logs ------------------------------------------------

export interface DoorwaySessionRecord {
  id: string;
  pairKey: string;
  leaving: string;
  arriving: string;
  depth: DoorwayDepth;
  capacityAtEntry: number | null;
  arrivalQuality: string | null;
  anchorUsed: string | null;
  arrivalCheck: ArrivalCheckResponse | null;
  followedThrough: FollowedThroughAnswer | null;
  // Decided once, at write time, from that pair's real crossing count -
  // never recomputed later, so the sparse interval can't double-fire if
  // the pair's count moves on before this session gets its later check.
  pendingArrivalCheck: boolean;
  createdAt: string;
}

export const recordDoorwaySession = async (
  uid: string,
  data: {
    pairKey: string; leaving: string; arriving: string; depth: DoorwayDepth;
    capacityAtEntry: number | null; arrivalQuality: string | null; anchorUsed: string | null;
    pendingArrivalCheck: boolean;
  }
): Promise<string> => {
  const record: DoorwaySessionRecord = {
    id: randomId('doorway'),
    ...data,
    arrivalCheck: null,
    followedThrough: null,
    createdAt: new Date().toISOString(),
  };
  await setDoc(doc(db, 'users', uid, 'decompression_sessions', record.id), record);
  return record.id;
};

// The sparse, optional later arrival check (and, if it surfaces
// something, what followed through) both land on the same session
// record rather than a second collection.
export const updateDoorwaySessionFollowUp = async (
  uid: string,
  sessionId: string,
  update: { arrivalCheck?: ArrivalCheckResponse; followedThrough?: FollowedThroughAnswer }
): Promise<void> => {
  await setDoc(doc(db, 'users', uid, 'decompression_sessions', sessionId), update, { merge: true });
};

const SESSIONS_LOAD_LIMIT = 30;

export const loadRecentDoorwaySessions = async (uid: string): Promise<DoorwaySessionRecord[]> => {
  try {
    const snap = await getDocs(query(
      collection(db, 'users', uid, 'decompression_sessions'),
      orderBy('createdAt', 'desc'),
      limit(SESSIONS_LOAD_LIMIT)
    ));
    return snap.docs.map((d) => d.data() as DoorwaySessionRecord);
  } catch (e) {
    return [];
  }
};

// The "sparse, optional later check-in" - never asked right as someone
// crosses, only surfaced the next time they open the tool.
export const loadPendingArrivalCheckSession = async (uid: string): Promise<DoorwaySessionRecord | null> => {
  const recent = await loadRecentDoorwaySessions(uid);
  return recent.find((s) => s.pendingArrivalCheck && s.arrivalCheck === null) ?? null;
};
