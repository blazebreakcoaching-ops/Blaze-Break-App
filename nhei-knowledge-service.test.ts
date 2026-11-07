import { describe, it, expect } from 'vitest';
import {
  createDraftKnowledgeEntry,
  approveKnowledgeEntry,
  rejectKnowledgeEntry,
  approveKnowledgeEntryAsVerifiedReviewer,
  rejectKnowledgeEntryAsVerifiedReviewer,
  retrieveApprovedKnowledge,
  clearKnowledgeCache,
  listAllKnowledgeEntriesForReview,
} from './nhei-knowledge-service';
import type { FirestoreLike, FirestoreCollectionRefLike, FirestoreTransactionLike } from './nhei-persistence-service';
import type { NheiKnowledgeReviewChecklist } from './nhei-knowledge-governance';
import { NHEI_KNOWLEDGE_REVIEWER_ROLE } from './nhei-authority-contract';

// Same minimal in-memory fake pattern used across every NHEI persistence
// test file in this repo.
function createFakeFirestore(): FirestoreLike {
  const store = new Map<string, Record<string, unknown>>();
  function collection(path: string): FirestoreCollectionRefLike {
    return {
      doc(id?: string) {
        const docId = id ?? `auto_${Math.random().toString(36).slice(2, 10)}`;
        const key = `${path}/${docId}`;
        return {
          id: docId,
          async get() {
            const data = store.get(key);
            return { id: docId, exists: data !== undefined, data: () => data };
          },
          async set(data: Record<string, unknown>, options?: { merge?: boolean }) {
            if (options?.merge && store.has(key)) store.set(key, { ...store.get(key), ...data });
            else store.set(key, { ...data });
          },
          async update(data: Record<string, unknown>) {
            if (!store.has(key)) throw new Error('no such document');
            store.set(key, { ...store.get(key), ...data });
          },
          async delete() { store.delete(key); },
        };
      },
      async get() {
        const prefix = `${path}/`;
        const docs = [...store.entries()]
          .filter(([k]) => k.startsWith(prefix) && !k.slice(prefix.length).includes('/'))
          .map(([k, data]) => ({ id: k.slice(prefix.length), exists: true, data: () => data }));
        return { docs };
      },
    };
  }
  // Phase 3 Closure §2: approveKnowledgeEntry/rejectKnowledgeEntry now
  // require db.runTransaction (see nhei-knowledge-service.ts's
  // runReviewTransaction) - same simple, non-rigorous transaction support
  // used by every other NHEI fake Firestore in this repo (writes apply
  // immediately rather than being staged; sufficient for every test here
  // that is not specifically about race/conflict detection, which uses
  // createRaceableFakeFirestore below instead).
  async function runTransaction<T>(fn: (tx: FirestoreTransactionLike) => Promise<T>): Promise<T> {
    const tx: FirestoreTransactionLike = {
      get: ((ref: any) => ref.get()) as FirestoreTransactionLike['get'],
      set: (ref, data, options) => { void ref.set(data, options); },
      update: (ref, data) => { void ref.update(data); },
      delete: (ref) => { void ref.delete(); },
    };
    return fn(tx);
  }
  return { collection, runTransaction };
}

// Phase 3 Closure §2/§8: isolated scaffolding for the "fails closed
// without transaction support" requirement, mirroring
// nhei-persistence-service.test.ts's own createFakeFirestoreWithoutTransactionSupport.
function createFakeFirestoreWithoutTransactionSupport(): FirestoreLike {
  const { collection } = createFakeFirestore();
  return { collection };
}

// A true concurrency test needs a fake where tx.get() inside the
// transaction can observe a write made by ANOTHER transaction that
// started earlier but has not yet "committed" - this fake models exactly
// that: writes staged via tx.set/tx.update only land in the store once the
// callback's promise resolves, in commit order, and a transaction that
// read a document before a conflicting commit landed is itself retried
// (by simply re-running the callback once) - a close enough approximation
// of real Firestore optimistic-concurrency semantics to prove
// approveKnowledgeEntry/rejectKnowledgeEntry's two-caller race is actually
// closed, without needing the real emulator.
function createRaceableFakeFirestore(): FirestoreLike {
  const store = new Map<string, Record<string, unknown>>();
  function docRef(path: string, id: string) {
    const key = `${path}/${id}`;
    return {
      id,
      async get() {
        const data = store.get(key);
        return { id, exists: data !== undefined, data: () => data };
      },
      async set(data: Record<string, unknown>) { store.set(key, { ...data }); },
      async update(data: Record<string, unknown>) {
        if (!store.has(key)) throw new Error('no such document');
        store.set(key, { ...store.get(key), ...data });
      },
      async delete() { store.delete(key); },
    };
  }
  function collection(path: string): FirestoreCollectionRefLike {
    return {
      doc(id?: string) {
        return docRef(path, id ?? `auto_${Math.random().toString(36).slice(2, 10)}`);
      },
      async get() {
        const prefix = `${path}/`;
        const docs = [...store.entries()]
          .filter(([k]) => k.startsWith(prefix) && !k.slice(prefix.length).includes('/'))
          .map(([k, data]) => ({ id: k.slice(prefix.length), exists: true, data: () => data }));
        return { docs };
      },
    };
  }
  // Each transaction snapshots the version of every document it reads;
  // when it goes to commit, if any read document's version has since
  // changed (another transaction committed first), this one is retried
  // from scratch - a direct analogue of real Firestore optimistic locking,
  // which is the exact mechanism approveKnowledgeEntry/rejectKnowledgeEntry
  // depend on to close the read-then-write race.
  const versions = new Map<string, number>();
  const versionOf = (key: string) => versions.get(key) ?? 0;
  async function runTransaction<T>(fn: (tx: FirestoreTransactionLike) => Promise<T>): Promise<T> {
    for (;;) {
      const readVersions = new Map<string, number>();
      const staged: Array<{ key: string; op: 'set' | 'update' | 'delete'; data?: Record<string, unknown> }> = [];
      const tx: FirestoreTransactionLike = {
        get: (async (ref: any) => {
          const snap = await ref.get();
          const refKey = ref.__key ?? null;
          if (refKey) readVersions.set(refKey, versionOf(refKey));
          return snap;
        }) as FirestoreTransactionLike['get'],
        set: (ref, data) => { staged.push({ key: (ref as any).__key, op: 'set', data }); },
        update: (ref, data) => { staged.push({ key: (ref as any).__key, op: 'update', data }); },
        delete: (ref) => { staged.push({ key: (ref as any).__key, op: 'delete' }); },
      };
      const result = await fn(tx);
      const conflict = [...readVersions.entries()].some(([key, seenVersion]) => versionOf(key) !== seenVersion);
      if (conflict) continue;
      for (const op of staged) {
        if (op.op === 'delete') { store.delete(op.key); }
        else if (op.op === 'set') { store.set(op.key, { ...op.data }); }
        else { store.set(op.key, { ...(store.get(op.key) ?? {}), ...op.data }); }
        versions.set(op.key, versionOf(op.key) + 1);
      }
      return result;
    }
  }
  // Tag every doc ref with its storage key so the transaction wrapper
  // above can track read/write versions without re-deriving the path.
  const taggedCollection = (path: string): FirestoreCollectionRefLike => {
    const base = collection(path);
    return {
      ...base,
      doc(id?: string) {
        const ref: any = base.doc(id);
        ref.__key = `${path}/${ref.id}`;
        return ref;
      },
    };
  };
  return { collection: taggedCollection, runTransaction };
}

const FULL_CHECKLIST: NheiKnowledgeReviewChecklist = {
  noUnsupportedPsychologicalClaims: true,
  noUnnecessaryMedicalisation: true,
  noMisleadingCausation: true,
  noUnsupportedIdentityAssumptions: true,
  noExcessiveEmotionalAiDependence: true,
  appropriateForYouthLanguageWhereRelevant: true,
  noUnnecessarySensitiveDataCollection: true,
  noCulturalOrPhilosophicalBias: true,
};

function draftInput(overrides: Record<string, unknown> = {}) {
  return {
    id: 'entry1', title: 'Title', educationalSummary: 'Summary', detailedExplanation: 'Explanation',
    topics: ['INTERNAL_SELF'], learningObjective: 'Learn', selfSystems: [], dimensions: [],
    exampleScenarios: [], reflectionQuestions: [], recoveryToolReferences: [],
    evidenceCategory: 'BLAZE_BREAK_PROPRIETARY_CONCEPT', sourceReferences: [], sourcePublicationInfo: null,
    safetyRestrictions: [], ageGroup: 'all_ages', perceivedReceivedSelfDistinctions: null,
    ...overrides,
  };
}

describe('createDraftKnowledgeEntry', () => {
  it('creates a well-formed draft, forcing the correct starting state regardless of what the input claims', async () => {
    const db = createFakeFirestore();
    const result = await createDraftKnowledgeEntry(db, 'author1', draftInput({
      approvalStatus: 'approved', reviewerId: 'someone', lastReviewedAt: '2020-01-01T00:00:00.000Z', authorId: 'someone_else', contentVersion: 99,
    }));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.approvalStatus).toBe('draft');
      expect(result.value.reviewerId).toBeNull();
      expect(result.value.lastReviewedAt).toBeNull();
      expect(result.value.authorId).toBe('author1'); // the real caller, never the spoofed input value
      expect(result.value.contentVersion).toBe(1);
    }
  });

  it('rejects a malformed entry and writes nothing', async () => {
    const db = createFakeFirestore();
    const result = await createDraftKnowledgeEntry(db, 'author1', { id: 'bad' });
    expect(result.ok).toBe(false);
    if (result.ok === false) expect(result.reason).toBe('invalid_entry');
  });

  it('rejects creating a second entry under an id that already exists', async () => {
    const db = createFakeFirestore();
    await createDraftKnowledgeEntry(db, 'author1', draftInput());
    const result = await createDraftKnowledgeEntry(db, 'author1', draftInput());
    expect(result.ok).toBe(false);
    if (result.ok === false) expect(result.reason).toBe('id_already_exists');
  });
});

describe('approveKnowledgeEntry / rejectKnowledgeEntry - unauthorised content approval', () => {
  it('refuses self-approval end to end through the service layer', async () => {
    const db = createFakeFirestore();
    await createDraftKnowledgeEntry(db, 'author1', draftInput());
    const result = await approveKnowledgeEntry(db, 'entry1', 'author1', FULL_CHECKLIST);
    expect(result.ok).toBe(false);
    if (result.ok === false) expect(result.reason).toBe('reviewer_is_author');
  });

  it('refuses approval with an incomplete checklist', async () => {
    const db = createFakeFirestore();
    await createDraftKnowledgeEntry(db, 'author1', draftInput());
    const incomplete = { ...FULL_CHECKLIST, noMisleadingCausation: false };
    const result = await approveKnowledgeEntry(db, 'entry1', 'reviewer1', incomplete);
    expect(result.ok).toBe(false);
    if (result.ok === false) expect(result.reason).toBe('checklist_incomplete');
  });

  it('approves a legitimate draft with a distinct reviewer and full checklist, and it becomes retrievable', async () => {
    const db = createFakeFirestore();
    await createDraftKnowledgeEntry(db, 'author1', draftInput());
    const approval = await approveKnowledgeEntry(db, 'entry1', 'reviewer1', FULL_CHECKLIST);
    expect(approval.ok).toBe(true);

    const result = await retrieveApprovedKnowledge(db, { topics: ['INTERNAL_SELF'] });
    expect(result.found).toBe(true);
    expect(result.entries.map((e) => e.id)).toEqual(['entry1']);
  });

  it('returns not_found for a nonexistent entry id', async () => {
    const db = createFakeFirestore();
    const result = await approveKnowledgeEntry(db, 'does-not-exist', 'reviewer1', FULL_CHECKLIST);
    expect(result.ok).toBe(false);
    if (result.ok === false) expect(result.reason).toBe('not_found');
  });

  it('rejectKnowledgeEntry also refuses self-rejection', async () => {
    const db = createFakeFirestore();
    await createDraftKnowledgeEntry(db, 'author1', draftInput());
    const result = await rejectKnowledgeEntry(db, 'entry1', 'author1');
    expect(result.ok).toBe(false);
    if (result.ok === false) expect(result.reason).toBe('reviewer_is_author');
  });

  it('a rejected entry never appears in retrieval results', async () => {
    const db = createFakeFirestore();
    await createDraftKnowledgeEntry(db, 'author1', draftInput());
    await rejectKnowledgeEntry(db, 'entry1', 'reviewer1');
    const result = await retrieveApprovedKnowledge(db, { topics: ['INTERNAL_SELF'] });
    expect(result.found).toBe(false);
  });
});

describe('Phase 3C-2B section 6: approveKnowledgeEntryAsVerifiedReviewer / rejectKnowledgeEntryAsVerifiedReviewer', () => {
  it('denies a caller with no role at all, before the self-approval/checklist checks ever run', async () => {
    const db = createFakeFirestore();
    await createDraftKnowledgeEntry(db, 'author1', draftInput());
    const result = await approveKnowledgeEntryAsVerifiedReviewer(db, { uid: 'reviewer1' }, 'entry1', FULL_CHECKLIST);
    expect(result.ok).toBe(false);
    if (result.ok === false) expect(result.reason).toBe('authorisation_denied');
  });

  it('denies a caller with an unrelated role (e.g. a general platform_admin) - the reviewer role is specific, not implied by admin status', async () => {
    const db = createFakeFirestore();
    await createDraftKnowledgeEntry(db, 'author1', draftInput());
    const result = await approveKnowledgeEntryAsVerifiedReviewer(db, { uid: 'admin1', role: 'platform_admin' }, 'entry1', FULL_CHECKLIST);
    expect(result.ok).toBe(false);
    if (result.ok === false) expect(result.reason).toBe('authorisation_denied');
  });

  it('a request-supplied reviewerId cannot substitute for a verified caller - the wrapper never reads one from anywhere but caller.uid', async () => {
    const db = createFakeFirestore();
    await createDraftKnowledgeEntry(db, 'author1', draftInput());
    // Simulating a forged/spoofed field that a request body could carry -
    // the wrapper's signature has no reviewerId parameter at all, so there
    // is nothing for such a field to reach even if a caller tried.
    const spoofedCaller = { uid: 'real_caller_uid' } as const;
    const result = await approveKnowledgeEntryAsVerifiedReviewer(db, spoofedCaller, 'entry1', FULL_CHECKLIST);
    expect(result.ok).toBe(false); // no role present - denied regardless of what uid claims to be
  });

  it('approves end to end for a caller with the correct reviewer role, using exactly caller.uid as the audit reviewerId', async () => {
    const db = createFakeFirestore();
    await createDraftKnowledgeEntry(db, 'author1', draftInput());
    const result = await approveKnowledgeEntryAsVerifiedReviewer(
      db,
      { uid: 'real_reviewer', role: NHEI_KNOWLEDGE_REVIEWER_ROLE },
      'entry1',
      FULL_CHECKLIST,
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.reviewerId).toBe('real_reviewer');

    const retrieved = await retrieveApprovedKnowledge(db, { topics: ['INTERNAL_SELF'] });
    expect(retrieved.found).toBe(true);
  });

  it('still refuses self-approval through the wrapper, even when the author happens to also hold the reviewer role', async () => {
    const db = createFakeFirestore();
    await createDraftKnowledgeEntry(db, 'author1', draftInput());
    const result = await approveKnowledgeEntryAsVerifiedReviewer(
      db,
      { uid: 'author1', role: NHEI_KNOWLEDGE_REVIEWER_ROLE },
      'entry1',
      FULL_CHECKLIST,
    );
    expect(result.ok).toBe(false);
    if (result.ok === false) expect(result.reason).toBe('reviewer_is_author');
  });

  it('the checklist is still enforced through the wrapper - holding the role does not bypass it', async () => {
    const db = createFakeFirestore();
    await createDraftKnowledgeEntry(db, 'author1', draftInput());
    const incomplete = { ...FULL_CHECKLIST, noMisleadingCausation: false };
    const result = await approveKnowledgeEntryAsVerifiedReviewer(
      db,
      { uid: 'real_reviewer', role: NHEI_KNOWLEDGE_REVIEWER_ROLE },
      'entry1',
      incomplete,
    );
    expect(result.ok).toBe(false);
    if (result.ok === false) expect(result.reason).toBe('checklist_incomplete');
  });

  it('rejectKnowledgeEntryAsVerifiedReviewer denies an unroled caller the same way', async () => {
    const db = createFakeFirestore();
    await createDraftKnowledgeEntry(db, 'author1', draftInput());
    const result = await rejectKnowledgeEntryAsVerifiedReviewer(db, { uid: 'someone' }, 'entry1');
    expect(result.ok).toBe(false);
    if (result.ok === false) expect(result.reason).toBe('authorisation_denied');
  });

  it('rejectKnowledgeEntryAsVerifiedReviewer succeeds end to end for a correctly-roled caller', async () => {
    const db = createFakeFirestore();
    await createDraftKnowledgeEntry(db, 'author1', draftInput());
    const result = await rejectKnowledgeEntryAsVerifiedReviewer(db, { uid: 'real_reviewer', role: NHEI_KNOWLEDGE_REVIEWER_ROLE }, 'entry1');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.reviewerId).toBe('real_reviewer');
  });
});

describe('retrieveApprovedKnowledge - malformed documents and no-content behaviour', () => {
  it('excludes a malformed document found directly in Firestore (bypassing validation) rather than erroring or including it', async () => {
    const db = createFakeFirestore();
    await createDraftKnowledgeEntry(db, 'author1', draftInput());
    await approveKnowledgeEntry(db, 'entry1', 'reviewer1', FULL_CHECKLIST);
    // Simulate a malformed document landing directly in Firestore (e.g.
    // a partial write, a manual console edit) - never something this
    // service's own write path would produce.
    await db.collection('nhei_knowledge_entries').doc('malformed1').set({ id: 'malformed1', title: 'incomplete' });

    const result = await retrieveApprovedKnowledge(db, { topics: ['INTERNAL_SELF'] });
    expect(result.entries.map((e) => e.id)).toEqual(['entry1']);
  });

  it('returns an explicit no-content result for a topic nothing approved covers, never inventing a substitute', async () => {
    const db = createFakeFirestore();
    const result = await retrieveApprovedKnowledge(db, { topics: ['SHIP'] });
    expect(result.found).toBe(false);
    expect(result.entries).toEqual([]);
  });
});

describe('Phase 3C-1 - bounded, invalidated-on-write cache (section 8 performance review)', () => {
  it('a second retrieval within the TTL does not need a fresh collection read - the cache serves it', async () => {
    const db = createFakeFirestore();
    await createDraftKnowledgeEntry(db, 'author1', {
      id: 'e1', title: 'T', educationalSummary: 'S', detailedExplanation: 'D',
      topics: ['INTERNAL_SELF'], learningObjective: 'L', selfSystems: [], dimensions: [],
      exampleScenarios: [], reflectionQuestions: [], recoveryToolReferences: [],
      evidenceCategory: 'BLAZE_BREAK_PROPRIETARY_CONCEPT', sourceReferences: [], sourcePublicationInfo: null,
      safetyRestrictions: [], ageGroup: 'all_ages', perceivedReceivedSelfDistinctions: null,
    });
    const checklist: NheiKnowledgeReviewChecklist = {
      noUnsupportedPsychologicalClaims: true, noUnnecessaryMedicalisation: true, noMisleadingCausation: true,
      noUnsupportedIdentityAssumptions: true, noExcessiveEmotionalAiDependence: true,
      appropriateForYouthLanguageWhereRelevant: true, noUnnecessarySensitiveDataCollection: true, noCulturalOrPhilosophicalBias: true,
    };
    await approveKnowledgeEntry(db, 'e1', 'reviewer1', checklist);

    let collectionReads = 0;
    const countingDb: typeof db = {
      collection(path: string) {
        const real = db.collection(path);
        return {
          ...real,
          get: async () => {
            if (path === 'nhei_knowledge_entries') collectionReads += 1;
            return real.get();
          },
        };
      },
    };

    await retrieveApprovedKnowledge(countingDb, { topics: ['INTERNAL_SELF'] });
    await retrieveApprovedKnowledge(countingDb, { topics: ['INTERNAL_SELF'] });
    await retrieveApprovedKnowledge(countingDb, { topics: ['INTERNAL_SELF'] });
    // Three calls, but only the first should have actually read the
    // collection - the next two are served from the per-db cache.
    expect(collectionReads).toBe(1);
  });

  it('a write (approve) invalidates the cache - a subsequent read sees the new state, not stale data', async () => {
    const db = createFakeFirestore();
    await createDraftKnowledgeEntry(db, 'author1', {
      id: 'e1', title: 'T', educationalSummary: 'S', detailedExplanation: 'D',
      topics: ['INTERNAL_SELF'], learningObjective: 'L', selfSystems: [], dimensions: [],
      exampleScenarios: [], reflectionQuestions: [], recoveryToolReferences: [],
      evidenceCategory: 'BLAZE_BREAK_PROPRIETARY_CONCEPT', sourceReferences: [], sourcePublicationInfo: null,
      safetyRestrictions: [], ageGroup: 'all_ages', perceivedReceivedSelfDistinctions: null,
    });
    // Not yet approved - populates the cache with an empty approved set.
    const before = await retrieveApprovedKnowledge(db, { topics: ['INTERNAL_SELF'] });
    expect(before.found).toBe(false);

    const checklist: NheiKnowledgeReviewChecklist = {
      noUnsupportedPsychologicalClaims: true, noUnnecessaryMedicalisation: true, noMisleadingCausation: true,
      noUnsupportedIdentityAssumptions: true, noExcessiveEmotionalAiDependence: true,
      appropriateForYouthLanguageWhereRelevant: true, noUnnecessarySensitiveDataCollection: true, noCulturalOrPhilosophicalBias: true,
    };
    await approveKnowledgeEntry(db, 'e1', 'reviewer1', checklist);

    const after = await retrieveApprovedKnowledge(db, { topics: ['INTERNAL_SELF'] });
    expect(after.found).toBe(true);
  });

  it('clearKnowledgeCache lets a test force a fresh read without waiting for the TTL', async () => {
    const db = createFakeFirestore();
    await retrieveApprovedKnowledge(db, { topics: ['INTERNAL_SELF'] }); // populates the cache
    clearKnowledgeCache(db);
    // Writing directly (bypassing this service) then reading again proves
    // the cache was actually cleared, not just coincidentally fresh.
    await db.collection('nhei_knowledge_entries').doc('direct1').set({
      id: 'direct1', title: 'T', educationalSummary: 'S', detailedExplanation: 'D',
      topics: ['INTERNAL_SELF'], learningObjective: 'L', selfSystems: [], dimensions: [],
      exampleScenarios: [], reflectionQuestions: [], recoveryToolReferences: [],
      evidenceCategory: 'BLAZE_BREAK_PROPRIETARY_CONCEPT', sourceReferences: [], sourcePublicationInfo: null,
      contentVersion: 1, approvalStatus: 'approved', authorId: 'a', reviewerId: 'r', lastReviewedAt: '2026-01-01T00:00:00.000Z',
      safetyRestrictions: [], ageGroup: 'all_ages', perceivedReceivedSelfDistinctions: null,
    });
    clearKnowledgeCache(db);
    const result = await retrieveApprovedKnowledge(db, { topics: ['INTERNAL_SELF'] });
    expect(result.found).toBe(true);
  });

  it('two different db instances never share a cache entry', async () => {
    const dbA = createFakeFirestore();
    const dbB = createFakeFirestore();
    await db_setApproved(dbA, 'onlyInA');

    const resultA = await retrieveApprovedKnowledge(dbA, { topics: ['INTERNAL_SELF'] });
    const resultB = await retrieveApprovedKnowledge(dbB, { topics: ['INTERNAL_SELF'] });
    expect(resultA.entries.map((e) => e.id)).toEqual(['onlyInA']);
    expect(resultB.entries).toEqual([]);
  });
});

describe('Phase 3C-2A section 12 - cross-instance cache correctness via a shared version stamp', () => {
  it('a rejection becomes visible on the NEXT read even without this process ever calling clearKnowledgeCache - simulating another instance writing', async () => {
    const db = createFakeFirestore();
    await createDraftKnowledgeEntry(db, 'author1', draftInput());
    await approveKnowledgeEntry(db, 'entry1', 'reviewer1', FULL_CHECKLIST);

    // Populate this process's cache with the approved entry.
    const before = await retrieveApprovedKnowledge(db, { topics: ['INTERNAL_SELF'] });
    expect(before.entries.map((e) => e.id)).toEqual(['entry1']);

    // Simulate ANOTHER instance rejecting the entry - write the new
    // status AND bump the shared version stamp directly against the
    // underlying store, deliberately bypassing this process's own
    // clearKnowledgeCache (which a real second instance could never call,
    // since that function only clears ITS OWN process-local WeakMap
    // entry).
    await db.collection('nhei_knowledge_entries').doc('entry1').update({ approvalStatus: 'rejected' });
    await db.collection('nhei_knowledge_meta').doc('cache_version').set({ stamp: 'other-instance-wrote-this' }, { merge: true });

    // This process's local WeakMap cache entry is still sitting there,
    // well within its TTL - but the version stamp it was built from no
    // longer matches, so the next read must see the rejection, not the
    // stale cached approval.
    const after = await retrieveApprovedKnowledge(db, { topics: ['INTERNAL_SELF'] });
    expect(after.entries).toEqual([]);
  });

  it('a cache hit costs exactly one small version-document read, never a full collection read, when nothing has changed', async () => {
    const db = createFakeFirestore();
    await db_setApproved(db, 'e1');

    let entryCollectionReads = 0;
    let versionDocReads = 0;
    const countingDb: typeof db = {
      collection(path: string) {
        const real = db.collection(path);
        return {
          ...real,
          get: async () => {
            if (path === 'nhei_knowledge_entries') entryCollectionReads += 1;
            return real.get();
          },
          doc(id?: string) {
            const realDoc = real.doc(id);
            return {
              ...realDoc,
              get: async () => {
                if (path === 'nhei_knowledge_meta') versionDocReads += 1;
                return realDoc.get();
              },
            };
          },
        };
      },
    };
    // First call populates the cache (one entries read, one version
    // read). The SAME countingDb reference is reused for the second call,
    // since the cache is keyed by object identity - this is what makes
    // the second call a genuine cache-hit check.
    await retrieveApprovedKnowledge(countingDb, { topics: ['INTERNAL_SELF'] });
    entryCollectionReads = 0;
    versionDocReads = 0;
    await retrieveApprovedKnowledge(countingDb, { topics: ['INTERNAL_SELF'] });
    expect(entryCollectionReads).toBe(0); // served from cache
    expect(versionDocReads).toBe(1); // the one cheap check that proved the cache was still valid
  });

  it('Phase 3C-2B Checkpoint 2 section 11: an APPROVAL becomes visible on the next read too, not only a revocation - simulating another instance approving what this process had cached as "nothing found"', async () => {
    const db = createFakeFirestore();
    await createDraftKnowledgeEntry(db, 'author1', draftInput());

    // This process reads first, while the entry is still draft, and
    // caches the "nothing approved" result.
    const before = await retrieveApprovedKnowledge(db, { topics: ['INTERNAL_SELF'] });
    expect(before.found).toBe(false);
    expect(before.entries).toEqual([]);

    // Simulate ANOTHER instance approving the entry - same pattern as the
    // revocation test above: write the new status and bump the shared
    // version stamp directly, never calling this process's own
    // clearKnowledgeCache.
    await db.collection('nhei_knowledge_entries').doc('entry1').update({
      approvalStatus: 'approved', reviewerId: 'real_reviewer', lastReviewedAt: new Date().toISOString(),
    });
    await db.collection('nhei_knowledge_meta').doc('cache_version').set({ stamp: 'other-instance-approved-this' }, { merge: true });

    // This process's local cache entry ("nothing found") is still within
    // TTL, but the version mismatch must force a fresh read, surfacing
    // the approval immediately rather than up to TTL seconds late.
    const after = await retrieveApprovedKnowledge(db, { topics: ['INTERNAL_SELF'] });
    expect(after.found).toBe(true);
    expect(after.entries.map((e) => e.id)).toEqual(['entry1']);
  });
});

// Phase 3 Closure §2/§8 - listAllKnowledgeEntriesForReview
describe('listAllKnowledgeEntriesForReview', () => {
  it('returns entries of every approvalStatus, not just approved ones', async () => {
    const db = createFakeFirestore();
    await createDraftKnowledgeEntry(db, 'author1', draftInput({ id: 'draft1' }));
    await db_setApproved(db, 'approved1');
    const { entries, invalidDocumentCount } = await listAllKnowledgeEntriesForReview(db);
    expect(entries.map((e) => e.id).sort()).toEqual(['approved1', 'draft1']);
    expect(invalidDocumentCount).toBe(0);
  });

  it('reports a malformed stored document as an invalid-count, never silently drops or crashes', async () => {
    const db = createFakeFirestore();
    await db.collection('nhei_knowledge_entries').doc('broken1').set({ id: 'broken1' }); // missing required fields
    const { entries, invalidDocumentCount } = await listAllKnowledgeEntriesForReview(db);
    expect(entries).toEqual([]);
    expect(invalidDocumentCount).toBe(1);
  });
});

// Phase 3 Closure §2/§8 - transactional concurrency. The read-then-write
// race this closes: two reviewers acting on the same still-draft entry at
// the same time used to risk the second write silently overwriting the
// first's reviewerId/lastReviewedAt. Both tests below call
// approveKnowledgeEntry/rejectKnowledgeEntry via Promise.all against
// createRaceableFakeFirestore, which actually models Firestore's
// optimistic-concurrency retry (see that helper's own comment) rather than
// just running both calls sequentially - a sequential run would pass even
// against the OLD, non-transactional implementation and prove nothing.
describe('approveKnowledgeEntry / rejectKnowledgeEntry - concurrency (Phase 3 Closure)', () => {
  it('two concurrent review actions on the same draft: exactly one succeeds, the other correctly sees entry_not_in_draft_state - never a silent overwrite', async () => {
    const db = createRaceableFakeFirestore();
    await createDraftKnowledgeEntry(db, 'author1', draftInput({ id: 'race1' }));

    const [approveResult, rejectResult] = await Promise.all([
      approveKnowledgeEntry(db, 'race1', 'reviewerA', FULL_CHECKLIST),
      rejectKnowledgeEntry(db, 'race1', 'reviewerB'),
    ]);

    const outcomes = [approveResult, rejectResult];
    const succeeded = outcomes.filter((r) => r.ok);
    const blocked = outcomes.filter((r) => !r.ok);
    expect(succeeded.length).toBe(1);
    expect(blocked.length).toBe(1);
    expect((blocked[0] as { ok: false; reason: string }).reason).toBe('entry_not_in_draft_state');

    // The entry's final stored state must match whichever one actually
    // won, with no field left half-applied from the other.
    const finalEntries = (await listAllKnowledgeEntriesForReview(db)).entries;
    const final = finalEntries.find((e) => e.id === 'race1')!;
    if (succeeded[0] === approveResult) {
      expect(final.approvalStatus).toBe('approved');
      expect(final.reviewerId).toBe('reviewerA');
    } else {
      expect(final.approvalStatus).toBe('rejected');
      expect(final.reviewerId).toBe('reviewerB');
    }
  });

  it('approveKnowledgeEntry fails closed with transaction_support_required against a db with no runTransaction, and writes nothing', async () => {
    const db = createFakeFirestoreWithoutTransactionSupport();
    await createDraftKnowledgeEntry(db, 'author1', draftInput({ id: 'e1' }));
    expect(db.runTransaction).toBeUndefined();

    const result = await approveKnowledgeEntry(db, 'e1', 'reviewer1', FULL_CHECKLIST);
    expect(result).toEqual({ ok: false, reason: 'transaction_support_required' });

    const stillDraft = (await listAllKnowledgeEntriesForReview(db)).entries.find((e) => e.id === 'e1')!;
    expect(stillDraft.approvalStatus).toBe('draft');
  });

  it('rejectKnowledgeEntry fails closed with transaction_support_required against a db with no runTransaction, and writes nothing', async () => {
    const db = createFakeFirestoreWithoutTransactionSupport();
    await createDraftKnowledgeEntry(db, 'author1', draftInput({ id: 'e1' }));

    const result = await rejectKnowledgeEntry(db, 'e1', 'reviewer1');
    expect(result).toEqual({ ok: false, reason: 'transaction_support_required' });

    const stillDraft = (await listAllKnowledgeEntriesForReview(db)).entries.find((e) => e.id === 'e1')!;
    expect(stillDraft.approvalStatus).toBe('draft');
  });
});

async function db_setApproved(db: FirestoreLike, id: string): Promise<void> {
  await db.collection('nhei_knowledge_entries').doc(id).set({
    id, title: 'T', educationalSummary: 'S', detailedExplanation: 'D',
    topics: ['INTERNAL_SELF'], learningObjective: 'L', selfSystems: [], dimensions: [],
    exampleScenarios: [], reflectionQuestions: [], recoveryToolReferences: [],
    evidenceCategory: 'BLAZE_BREAK_PROPRIETARY_CONCEPT', sourceReferences: [], sourcePublicationInfo: null,
    contentVersion: 1, approvalStatus: 'approved', authorId: 'a', reviewerId: 'r', lastReviewedAt: '2026-01-01T00:00:00.000Z',
    safetyRestrictions: [], ageGroup: 'all_ages', perceivedReceivedSelfDistinctions: null,
  });
}
