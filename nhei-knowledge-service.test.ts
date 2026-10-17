import { describe, it, expect } from 'vitest';
import {
  createDraftKnowledgeEntry,
  approveKnowledgeEntry,
  rejectKnowledgeEntry,
  retrieveApprovedKnowledge,
  clearKnowledgeCache,
} from './nhei-knowledge-service';
import type { FirestoreLike, FirestoreCollectionRefLike } from './nhei-persistence-service';
import type { NheiKnowledgeReviewChecklist } from './nhei-knowledge-governance';

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
  return { collection };
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
