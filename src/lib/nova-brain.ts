import { hasExplicitCalendarSignalConsent } from './calendar-signal-consent';
import { auth, getDb } from './firebase';
import { NOVA_MEMORY_DATA_ZONE, deriveCanonicalKey } from '../../nova-memory-governance';

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
  // Added in Evolution Engine PR4 - see nova-memory-governance.ts. Only
  // ever set for memories written through updateNovaMemoryBySourceAndType
  // (the one path with a real structural identity to dedup on); freeform
  // writes (addNovaMemory, logJourney, Nova's own remember_about_user
  // tool) leave this undefined rather than guessing one.
  canonicalKey?: string | null;
  // Always NOVA_MEMORY_DATA_ZONE - every Nova memory is personal coaching
  // context, there is no second zone to choose between. Stored explicitly
  // so the platform-wide Context Brain Health view (and any future data-
  // zone-flow check) can read it directly off the document.
  dataZone?: string;
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
// A fresh Firebase session for the same UID must not inherit cached private
// memories or an in-flight permission read from the prior login.
let cachedSession: typeof auth.currentUser = null;
let initPromise: Promise<void> | null = null;
let cacheEpoch = 0;
let cacheLoadSucceeded = false;

export const isNovaBrainReadyForAutoSync = (uid: string): boolean =>
  cachedUid === uid && cachedSession !== null &&
  auth.currentUser === cachedSession && cacheLoadSucceeded;

const announceNovaBrainUpdated = () => {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('nova-brain-updated'));
};

const isCurrentBrainOwner = () =>
  cachedSession !== null && auth.currentUser === cachedSession &&
  cachedUid === cachedSession.uid;

// Store only a consent bit, never private profile answers. The account
// must be verified by Firebase Auth before a client memory write is allowed.
export const novaLearningConsentKey = (uid: string) =>
  `blaze_nova_learning_consent_v2:${encodeURIComponent(uid)}`;

export const setNovaLearningAllowedForUid = (uid: string, allowed: boolean) => {
  try {
    localStorage.setItem(novaLearningConsentKey(uid), allowed ? 'yes' : 'no');
  } catch {
    // Fail closed if browser storage is unavailable.
  }
};

const memoriesCollection = async (uid: string) => {
  const db = await getDb();
  const { collection } = await import('firebase/firestore');
  return collection(db, 'users', uid, 'nova_memories');
};

// The saved profile in Firestore is authoritative. App.tsx refreshes this
// synchronous, account-scoped consent bit after loading that profile and
// when onboarding or Settings changes the preference. Never reuse the
// previous account's browser-global "blaze_profile" preference.
export const isNovaLearningAllowed = (): boolean => {
  const uid = auth.currentUser?.uid;
  if (!uid) return false;
  try {
    return localStorage.getItem(novaLearningConsentKey(uid)) === 'yes';
  } catch {
    return false;
  }
};

// Everything Nova's server-side context builder (getNovaContextAndMetadata
// in server.ts) is willing to use, gated per category on this doc. Memory
// requires onboarding opt-in; Calendar aggregation also requires an explicit
// opt-in beyond the Google OAuth scope.
export const NOVA_PERMISSION_DEFAULTS = {
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
  allowCalendarSignals: false,
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
// The entrypoint and existing-user backfill use the SAME create-only
// transaction. A late onboarding write cannot reset someone's revoked
// permissions from Settings or the Privacy Centre.
export const initNovaPermissionsForNewUser = (uid: string, allowMemory: boolean) => {
  void ensureNovaPermissionsExist(uid, allowMemory);
};

/** Atomic create-only defaults: a concurrent consent edit always wins. */
export const ensureNovaPermissionsExist = async (uid: string, allowMemory: boolean) => {
  const session = auth.currentUser;
  // A late onboarding request must not grant permissions under a new session.
  if (!uid || !session || session.uid !== uid) return;
  try {
    const db = await getDb();
    if (auth.currentUser !== session) return;
    const { doc, runTransaction } = await import('firebase/firestore');
    if (auth.currentUser !== session) return;
    const ref = doc(db, 'users', uid, 'nova_permissions', 'current');
    await runTransaction(db, async (transaction) => {
      const snap = await transaction.get(ref);
      if (auth.currentUser !== session || snap.exists()) return;
      transaction.set(ref, {
        ...NOVA_PERMISSION_DEFAULTS,
        allowNovaMemory: allowMemory === true,
        allowNovaUseSavedMemories: allowMemory === true,
        updatedAt: new Date().toISOString(),
      });
    });
  } catch {
    // Failure leaves the permission unset. Nova's context builder fails
    // closed; a later eligible page load can retry without overwriting
    // any preference the customer already saved.
  }
};

// Calendar OAuth scope alone does not grant permission to aggregate it
// for coaching. Missing/failed consent reads must fail closed. Onboarding
// may create a permissions document, and the user can change it in Settings.
export const isCalendarSignalConsentGranted = async (uid: string): Promise<boolean> => {
  const session = auth.currentUser;
  if (!uid || !session || session.uid !== uid) return false;
  try {
    const db = await getDb();
    if (auth.currentUser !== session) return false;
    const { doc, getDoc } = await import('firebase/firestore');
    const snap = await getDoc(doc(db, 'users', uid, 'nova_permissions', 'current'));
    // A stale permission read must not start background sync,
    // including after a same-UID reauthentication.
    return auth.currentUser === session && snap.exists() &&
      hasExplicitCalendarSignalConsent(snap.data());
  } catch {
    return false;
  }
};

/** An explicit Calendar choice may create a new permission record, but
 * must never replace the customer's existing granular consent choices. */
export const saveCalendarSignalConsent = async (uid: string, enabled: boolean): Promise<void> => {
  const session = auth.currentUser;
  if (!uid || !session || session.uid !== uid) throw new Error('Account changed');
  const db = await getDb();
  if (auth.currentUser !== session) throw new Error('Account changed');
  const { doc, runTransaction } = await import('firebase/firestore');
  const ref = doc(db, 'users', uid, 'nova_permissions', 'current');
  await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(ref);
    if (auth.currentUser !== session) throw new Error('Account changed');
    const explicitOptInAt = enabled === true ? new Date().toISOString() : null;
    if (snap.exists()) {
      transaction.update(ref, {
        allowCalendarSignals: enabled === true,
        calendarSignalsExplicitConsentAt: explicitOptInAt,
        updatedAt: new Date().toISOString(),
      });
    } else {
      // Firestore's creation rules require the standard named categories.
      // Never default memory or Calendar aggregation to on.
      transaction.set(ref, {
        ...NOVA_PERMISSION_DEFAULTS,
        allowNovaMemory: false,
        allowNovaUseSavedMemories: false,
        allowCalendarSignals: enabled === true,
        calendarSignalsExplicitConsentAt: explicitOptInAt,
        updatedAt: new Date().toISOString(),
      });
    }
  });
  if (auth.currentUser !== session) throw new Error('Account changed');
};

// Updates just the memory-specific permissions from Settings or the Trust
// Centre's "Let Nova remember..." toggle - never touches the other
// categories, so flipping this doesn't silently reset someone's other
// preferences.
export const setNovaMemoryConsent = (uid: string, enabled: boolean) => {
  const session = auth.currentUser;
  if (!uid || !session || session.uid !== uid) return;
  // Withdraw locally immediately: never keep old consent active while the network resolves.
  if (!enabled) {
    setNovaLearningAllowedForUid(uid, false);
    clearNovaBrainCache();
  }
  (async () => {
    try {
      const db = await getDb();
      if (auth.currentUser !== session) return;
      const { doc, setDoc } = await import('firebase/firestore');
      if (auth.currentUser !== session) return;
      await setDoc(doc(db, 'users', uid, 'nova_permissions', 'current'), {
        allowNovaMemory: enabled,
        allowNovaUseSavedMemories: enabled,
        ...(!enabled ? { allowAdaptiveIntelligence: false } : {}),
        updatedAt: new Date().toISOString(),
      }, { merge: true });
    } catch {
      // Non-fatal, same reasoning as persistMemory.
    }
  })();
};

export const initNovaBrain = (uid: string): Promise<void> => {
  const session = auth.currentUser;
  // A delayed caller for an old account must not evict the new account's cache.
  if (!uid || !session || session.uid !== uid) return Promise.resolve();
  if (cachedUid === uid && cachedSession === session && initPromise) return initPromise;
  const requestedEpoch = ++cacheEpoch;
  cachedUid = uid;
  cachedSession = session;
  cachedBrain = []; // Clear memory on ANY session switch, even for the same UID.
  cacheLoadSucceeded = false;
  announceNovaBrainUpdated();
  initPromise = (async () => {
    let loadedMemories: NovaMemory[] = [];
    let succeeded = false;
    try {
      const { getDocs, getDoc, doc, query, orderBy } = await import('firebase/firestore');
      const db = await getDb();
      if (cachedUid !== uid || cachedSession !== session || requestedEpoch !== cacheEpoch || auth.currentUser !== session) return;
      const permissionSnap = await getDoc(doc(db, 'users', uid, 'nova_permissions', 'current'));
      if (cachedUid !== uid || cachedSession !== session || requestedEpoch !== cacheEpoch || auth.currentUser !== session) return;
      // A saved onboarding preference alone is not authority to read old memories.
      const permitted = permissionSnap.exists() &&
        permissionSnap.data().allowNovaMemory === true &&
        permissionSnap.data().allowNovaUseSavedMemories === true;
      if (permitted && isNovaLearningAllowed()) {
        const snap = await getDocs(query(await memoriesCollection(uid), orderBy('createdAt', 'desc')));
        loadedMemories = snap.docs.map(d => ({ id: d.id, ...d.data() } as NovaMemory));
        succeeded = true;
      }
    } catch {
      // Unknown consent or failed read must not reuse cached personal memory.
    }
    // Account switches, sign-outs and consent withdrawal invalidate pending reads.
    if (cachedUid !== uid || cachedSession !== session || requestedEpoch !== cacheEpoch || auth.currentUser !== session) return;
    cacheLoadSucceeded = succeeded;
    if (!succeeded) {
      cachedBrain = [];
    } else {
      // Only merge optimistic local edits once active consent and the read succeed.
      const localIds = new Set(cachedBrain.map(m => m.id));
      cachedBrain = [...cachedBrain, ...loadedMemories.filter(m => !localIds.has(m.id))];
    }
    announceNovaBrainUpdated();
  })();
  return initPromise;
};

export const clearNovaBrainCache = () => {
  ++cacheEpoch;
  cachedBrain = [];
  cachedUid = null;
  cachedSession = null;
  initPromise = null;
  cacheLoadSucceeded = false;
  announceNovaBrainUpdated();
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
        canonicalKey: memory.canonicalKey ?? null,
        dataZone: NOVA_MEMORY_DATA_ZONE,
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
  return isCurrentBrainOwner() ? cachedBrain : [];
};

export const addNovaMemory = (memory: Omit<NovaMemory, 'id' | 'createdAt' | 'updatedAt'>) => {
  if (!isCurrentBrainOwner() || !isNovaLearningAllowed()) return;
  const newMemory: NovaMemory = {
    ...memory,
    id: `mem_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  cachedBrain = [...cachedBrain, newMemory];
  announceNovaBrainUpdated();

  const uid = auth.currentUser?.uid;
  if (uid) persistMemory(uid, newMemory);
};

export const logJourney = (action: string, details?: string) => {
  if (!isCurrentBrainOwner() || !isNovaLearningAllowed()) return;
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
  announceNovaBrainUpdated();

  const uid = auth.currentUser?.uid;
  if (uid) {
    persistMemory(uid, newMemory);
    idsToRemove.forEach(id => persistDelete(uid, id));
  }
};

export const deleteNovaMemory = (id: string) => {
  if (!isCurrentBrainOwner() || !cachedBrain.some(m => m.id === id && m.canEdit)) return;
  cachedBrain = cachedBrain.filter(m => m.id !== id);
  announceNovaBrainUpdated();

  const uid = auth.currentUser?.uid;
  if (uid) persistDelete(uid, id);
};

export const updateNovaMemoryBySourceAndType = (
  source: string,
  type: MemoryType,
  memoryParams: Omit<NovaMemory, 'id' | 'createdAt' | 'updatedAt' | 'source' | 'type'>
) => {
  if (!isCurrentBrainOwner() || !isNovaLearningAllowed()) return;
  const canonicalKey = deriveCanonicalKey(source, type);
  const existingIndex = cachedBrain.findIndex(m => m.source === source && m.type === type);

  if (existingIndex > -1) {
    const previous = cachedBrain[existingIndex];
    // This app synchronises several profile-derived memories on ordinary
    // renders. Identical values are not new information: no Firestore write,
    // updatedAt churn or changed-event should be generated.
    const identical = previous.canonicalKey === canonicalKey &&
      Object.entries(memoryParams).every(([key, value]) =>
        (previous as unknown as Record<string, unknown>)[key] === value);
    if (identical) return;
    const updated: NovaMemory = {
      ...cachedBrain[existingIndex],
      ...memoryParams,
      canonicalKey,
      updatedAt: new Date().toISOString(),
    };
    cachedBrain = [...cachedBrain.slice(0, existingIndex), updated, ...cachedBrain.slice(existingIndex + 1)];
    announceNovaBrainUpdated();

    const uid = auth.currentUser?.uid;
    if (uid) persistMemory(uid, updated);
  } else {
    addNovaMemory({
      ...memoryParams,
      source,
      type,
      canonicalKey,
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
  if (!isCurrentBrainOwner() || !content.trim() || content.length > 1000) return;
  const existingIndex = cachedBrain.findIndex(m => m.id === id);
  if (existingIndex === -1 || !cachedBrain[existingIndex].canEdit) return;

  const updated: NovaMemory = {
    ...cachedBrain[existingIndex],
    content,
    updatedAt: new Date().toISOString(),
  };
  cachedBrain = [...cachedBrain.slice(0, existingIndex), updated, ...cachedBrain.slice(existingIndex + 1)];
  announceNovaBrainUpdated();

  const uid = auth.currentUser?.uid;
  if (uid) persistMemory(uid, updated);
};
