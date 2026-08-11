import { auth, db } from './firebase';
import { collection, doc, getDocs, setDoc, deleteDoc, query, orderBy } from 'firebase/firestore';

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

const memoriesCollection = (uid: string) => collection(db, 'users', uid, 'nova_memories');

export const initNovaBrain = (uid: string): Promise<void> => {
  if (cachedUid === uid && initPromise) return initPromise;
  cachedUid = uid;
  initPromise = (async () => {
    try {
      const snap = await getDocs(query(memoriesCollection(uid), orderBy('createdAt', 'desc')));
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
  setDoc(doc(db, 'users', uid, 'nova_memories', memory.id), {
    type: memory.type,
    content: memory.content,
    source: memory.source,
    confidence: memory.confidence,
    createdAt: memory.createdAt,
    updatedAt: memory.updatedAt,
    canEdit: memory.canEdit,
  }).catch(() => {
    // Non-fatal - the cache (and therefore the UI) still reflects the
    // memory even if the Firestore write fails; it just won't survive
    // a reload or be visible on another device until the next successful write.
  });
};

const persistDelete = (uid: string, id: string) => {
  deleteDoc(doc(db, 'users', uid, 'nova_memories', id)).catch(() => {
    // Non-fatal, same reasoning as persistMemory.
  });
};

export const getNovaBrain = (): NovaMemory[] => {
  return cachedBrain;
};

export const addNovaMemory = (memory: Omit<NovaMemory, 'id' | 'createdAt' | 'updatedAt'>) => {
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
