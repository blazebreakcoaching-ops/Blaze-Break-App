import { auth, getDb } from './firebase';

export type MemoryType = 'profile' | 'trigger' | 'state' | 'rule' | 'preference';
export type ConfidenceLevel = 'low' | 'medium' | 'high' | 'verified';

export interface NovaMemory {
  id: string;
  type: MemoryType;
  content: string;
  source: string;
  confidence: ConfidenceLevel;
  createdAt: string;
  updatedAt: string;
  canEdit: boolean;
}

// Nova's memory is genuinely persisted to Firestore (users/{uid}/nova_memories),
// not just localStorage - but every caller across 13 components expects
// synchronous reads (getNovaBrain() returning an array immediately) and
// fire-and-forget writes (addNovaMemory() with no await). Rather than making
// every one of those call sites async, this keeps an in-memory cache that all
// the synchronous functions read/write instantly for a responsive UI, while
// each write also fires a real Firestore call in the background. The cache
// is populated once per session via initNovaBrain(), called from App.tsx
// when auth resolves - before that, or if it hasn't finished yet, callers
// safely get an empty/partial array rather than an error.

let cachedBrain: NovaMemory[] = [];
let cachedUid: string | null = null;
let initPromise: Promise<void> | null = null;

const memoriesCollection = async (uid: string) => {
  const db = await getDb();
  const { collection } = await import('firebase/firestore');
  return collection(db, 'users', uid, 'nova_memories');
};

// The onboarding "Personalised learning" toggle (profile.letNovaLearn) is
// the one real switch for whether Nova learns about someone at all. It's
// mirrored into localStorage's blaze_profile (kept in sync by App.tsx on
// both onboarding completion and every Settings save) because every
// function below is called synchronously, fire-and-forget, from deep
// inside ~40 feature components that have no React context to read the
// canonical Firestore profile from directly.
export const isNovaLearningAllowed = (): boolean => {
  try {
    const stored = localStorage.getItem('blaze_profile');
    // No profile yet means onboarding hasn't completed - default open,
    // matching the toggle's own on-by-default stance once it does exist.
    if (!stored) return true;
    const profile = JSON.parse(stored);
    return profile.letNovaLearn !== false;
  } catch (e) {
    return true;
  }
};

// Everything Nova's server-side context builder (getNovaContextAndMetadata
// in server.ts) is willing to use, gated per category on this doc. Defaults
// to on for every category except the two memory ones, which the caller
// decides based on what the user actually chose during onboarding.
const NOVA_PERMISSION_DEFAULTS = {
  allowCheckins: true,
  allowEnergyBudgets: true,
  allowMoodPulses: true,
  allowBodyCheckins: true,
  allowWins: true,
  allowWeeklyReviews: true,
  allowBoundaryScripts: true,
  allowGoals: true,
  allowRecoveryDebt: true,
  allowRecoveryVelocity: true,
  allowEnergyTrend: true,
  allowMoodTrend: true,
  // Not part of Nova's chat context builder like the categories above -
  // gates whether App.tsx's calendar-signal sync (src/lib/calendar-signals.ts)
  // runs at all. Lives in the same doc since it's the same "how Nova-branded
  // features use my data" consent surface the user sees in one place
  // (DataPrivacyDashboard.tsx / "Nova Privacy Controls").
  allowCalendarSignals: true,
  // Broader "Nova sees the whole app" pass - same default-on, compact-
  // aggregate-only treatment as every category above. Each gates one more
  // module's summary in server.ts's getNovaContextAndMetadata.
  allowFingerprint: true,
  allowOnboardingProfile: true,
  allowRecoveryPlanProgress: true,
  allowDiagnosisProgress: true,
  allowEnergyCommitments: true,
  allowStressTriggers: true,
  allowHabitCycles: true,
  allowFuelLogs: true,
  allowFocusSessions: true,
  allowSomaticResets: true,
  allowRecoveryAlly: true,
};

// Called once, right when onboarding completes. Without this doc existing,
// getNovaContextAndMetadata returns nothing at all (server.ts), so a user
// who never separately visits Settings > Nova Privacy Controls would
// otherwise leave Nova completely context-blind. allowMemory carries
// through exactly what the user chose on the onboarding consent step.
export const initNovaPermissionsForNewUser = (uid: string, allowMemory: boolean) => {
  (async () => {
    try {
      const db = await getDb();
      const { doc, setDoc } = await import('firebase/firestore');
      await setDoc(doc(db, 'users', uid, 'nova_permissions', 'current'), {
        ...NOVA_PERMISSION_DEFAULTS,
        allowNovaMemory: allowMemory,
        allowNovaUseSavedMemories: allowMemory,
        updatedAt: new Date().toISOString(),
      }, { merge: true });
    } catch {
      // Non-fatal - Nova just stays context-blind for this session; the next
      // successful write (e.g. a later Settings change) will fix it.
    }
  })();
};

// Backfills the same defaults for anyone who onboarded before this existed
// and has never visited Settings > Nova Privacy Controls, so they aren't
// stuck context-blind forever. Only fills in what's missing - never
// overwrites a doc that already exists, since someone may have
// deliberately turned individual categories off.
export const ensureNovaPermissionsExist = async (uid: string, allowMemory: boolean) => {
  try {
    const db = await getDb();
    const { doc, getDoc, setDoc } = await import('firebase/firestore');
    const ref = doc(db, 'users', uid, 'nova_permissions', 'current');
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      await setDoc(ref, {
        ...NOVA_PERMISSION_DEFAULTS,
        allowNovaMemory: allowMemory,
        allowNovaUseSavedMemories: allowMemory,
        updatedAt: new Date().toISOString(),
      });
    }
  } catch (e) {
    // Non-fatal, same reasoning as initNovaPermissionsForNewUser.
  }
};

// Gate for App.tsx's calendar-signal sync (src/lib/calendar-signals.ts),
// which previously ran unconditionally for anyone signed in with a Google
// access token - the DataPrivacyDashboard.tsx toggle for it referenced a
// feature-flag name that didn't exist in the flag schema, so it had no
// effect at all. Fails open (true) on a missing doc or a read error, same
// default as every other category here - the real gate on whether this
// even fires is still "did the user grant the Google Calendar OAuth scope
// in the first place."
export const isCalendarSignalConsentGranted = async (uid: string): Promise<boolean> => {
  try {
    const db = await getDb();
    const { doc, getDoc } = await import('firebase/firestore');
    const snap = await getDoc(doc(db, 'users', uid, 'nova_permissions', 'current'));
    if (snap.exists() && typeof snap.data().allowCalendarSignals === 'boolean') {
      return snap.data().allowCalendarSignals;
    }
    return true;
  } catch (e) {
    return true;
  }
};

// Updates just the memory-specific permissions from Settings or the Trust
// Centre's "Let Nova remember..." toggle - never touches the other
// categories, so flipping this doesn't silently reset someone's other
// preferences.
export const setNovaMemoryConsent = (uid: string, enabled: boolean) => {
  (async () => {
    try {
      const db = await getDb();
      const { doc, setDoc } = await import('firebase/firestore');
      await setDoc(doc(db, 'users', uid, 'nova_permissions', 'current'), {
        allowNovaMemory: enabled,
        allowNovaUseSavedMemories: enabled,
        updatedAt: new Date().toISOString(),
      }, { merge: true });
    } catch {
      // Non-fatal, same reasoning as persistMemory.
    }
  })();
};

export const initNovaBrain = (uid: string): Promise<void> => {
  if (cachedUid === uid && initPromise) return initPromise;
  cachedUid = uid;
  initPromise = (async () => {
    try {
      const { getDocs, query, orderBy } = await import('firebase/firestore');
      const snap = await getDocs(query(await memoriesCollection(uid), orderBy('createdAt', 'desc')));
      cachedBrain = snap.docs.map(d => ({ id: d.id, ...d.data() } as NovaMemory));
    } catch (e) {
      // Leaves the cache empty rather than pretending memories loaded.
      cachedBrain = [];
    }
    window.dispatchEvent(new Event('nova-brain-updated'));
  })();
  return initPromise;
};

// Called on sign-out so the next user's session never sees a stale cache
// from whoever was signed in before them.
export const clearNovaBrainCache = () => {
  cachedBrain = [];
  cachedUid = null;
  initPromise = null;
};

const persistMemory = (uid: string, memory: NovaMemory) => {
  (async () => {
    try {
      const db = await getDb();
      const { doc, setDoc } = await import('firebase/firestore');
      await setDoc(doc(db, 'users', uid, 'nova_memories', memory.id), {
        type: memory.type,
        content: memory.content,
        source: memory.source,
        confidence: memory.confidence,
        createdAt: memory.createdAt,
        updatedAt: memory.updatedAt,
        canEdit: memory.canEdit,
      });
    } catch {
      // Non-fatal - the cache (and therefore the UI) still reflects the
      // memory even if the Firestore write fails; it just won't survive
      // a reload or be visible on another device until the next successful write.
    }
  })();
};

const persistDelete = (uid: string, id: string) => {
  (async () => {
    try {
      const db = await getDb();
      const { doc, deleteDoc } = await import('firebase/firestore');
      await deleteDoc(doc(db, 'users', uid, 'nova_memories', id));
    } catch {
      // Non-fatal, same reasoning as persistMemory.
    }
  })();
};

export const getNovaBrain = (): NovaMemory[] => {
  return cachedBrain;
};

export const addNovaMemory = (memory: Omit<NovaMemory, 'id' | 'createdAt' | 'updatedAt'>) => {
  if (!isNovaLearningAllowed()) return;
  const newMemory: NovaMemory = {
    ...memory,
    id: `mem_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  cachedBrain = [...cachedBrain, newMemory];
  window.dispatchEvent(new Event('nova-brain-updated'));

  const uid = auth.currentUser?.uid;
  if (uid) persistMemory(uid, newMemory);
};

export const logJourney = (action: string, details?: string) => {
  if (!isNovaLearningAllowed()) return;
  const content = `User Action: ${action}${details ? ` - ${details}` : ''}`;
  const newMemory: NovaMemory = {
    id: `mem_journey_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
    type: 'state',
    content,
    source: 'App Journey Protocol',
    confidence: 'verified',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    canEdit: false,
  };

  let brain = [...cachedBrain, newMemory];

  const stateMemories = brain.filter(m => m.type === 'state').sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const olderStatesToRemove = stateMemories.slice(15);
  const idsToRemove = new Set(olderStatesToRemove.map(m => m.id));

  brain = brain.filter(m => !idsToRemove.has(m.id));
  cachedBrain = brain;
  window.dispatchEvent(new Event('nova-brain-updated'));

  const uid = auth.currentUser?.uid;
  if (uid) {
    persistMemory(uid, newMemory);
    idsToRemove.forEach(id => persistDelete(uid, id));
  }
};

export const deleteNovaMemory = (id: string) => {
  cachedBrain = cachedBrain.filter(m => m.id !== id);
  window.dispatchEvent(new Event('nova-brain-updated'));

  const uid = auth.currentUser?.uid;
  if (uid) persistDelete(uid, id);
};

export const updateNovaMemoryBySourceAndType = (
  source: string,
  type: MemoryType,
  memoryParams: Omit<NovaMemory, 'id' | 'createdAt' | 'updatedAt' | 'source' | 'type'>
) => {
  if (!isNovaLearningAllowed()) return;
  const existingIndex = cachedBrain.findIndex(m => m.source === source && m.type === type);

  if (existingIndex > -1) {
    const updated: NovaMemory = {
      ...cachedBrain[existingIndex],
      ...memoryParams,
      updatedAt: new Date().toISOString(),
    };
    cachedBrain = [...cachedBrain.slice(0, existingIndex), updated, ...cachedBrain.slice(existingIndex + 1)];
    window.dispatchEvent(new Event('nova-brain-updated'));

    const uid = auth.currentUser?.uid;
    if (uid) persistMemory(uid, updated);
  } else {
    addNovaMemory({
      source,
      type,
      ...memoryParams,
    });
  }
};

// Lets a user hand-edit the text of a memory they're allowed to change
// (mem.canEdit) from a review screen (MemoryCentre.tsx), mirroring the
// persist-and-cache pattern the rest of this file already uses instead of
// mutating Firestore directly - a raw Firestore write here wouldn't update
// cachedBrain, so other open surfaces (NovaChat.tsx, EvolutionEngine.tsx)
// would keep showing the old content until a reload.
export const editNovaMemoryContent = (id: string, content: string) => {
  const existingIndex = cachedBrain.findIndex(m => m.id === id);
  if (existingIndex === -1) return;

  const updated: NovaMemory = {
    ...cachedBrain[existingIndex],
    content,
    updatedAt: new Date().toISOString(),
  };
  cachedBrain = [...cachedBrain.slice(0, existingIndex), updated, ...cachedBrain.slice(existingIndex + 1)];
  window.dispatchEvent(new Event('nova-brain-updated'));

  const uid = auth.currentUser?.uid;
  if (uid) persistMemory(uid, updated);
};
