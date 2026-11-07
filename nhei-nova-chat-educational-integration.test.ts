// NHEI PHASE 3C-2B CHECKPOINT 2 - SECTIONS 1, 4, 10, 11: EDUCATIONAL MODE
// <-> NOVA CHAT INTEGRATION TESTS
// UPDATED PHASE 3C CHECKPOINT 3 SECTION 1: buildNheiEducationalChatAddendum
// now takes a third `userMessage` argument and only retrieves knowledge
// for topics selectEducationalTopics finds relevant to it - every call
// below passes a message that is actually relevant to the fixture
// entry's own topic ('INTERNAL_SELF'), and a new describe block proves
// the opposite: an irrelevant message gets nothing, even with approved
// content sitting in the store.

import { describe, it, expect } from 'vitest';
import { buildNheiEducationalChatAddendum } from './nhei-nova-chat-educational-integration';
import { createDraftKnowledgeEntry, approveKnowledgeEntryAsVerifiedReviewer } from './nhei-knowledge-service';
import { NHEI_KNOWLEDGE_REVIEWER_ROLE } from './nhei-authority-contract';
import type { FirestoreLike, FirestoreCollectionRefLike, FirestoreTransactionLike } from './nhei-persistence-service';
import type { NheiKnowledgeReviewChecklist } from './nhei-knowledge-governance';

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

describe('buildNheiEducationalChatAddendum - the real state of this library today: empty', () => {
  it('returns an empty addendum when the knowledge library has no approved entries (today\'s actual state - every entry is draft)', async () => {
    const db = createFakeFirestore();
    const result = await buildNheiEducationalChatAddendum(db, undefined, "Tell me about the internal self.");
    expect(result).toEqual({ addendum: '', sectionCount: 0 });
  });

  it('a draft (unreviewed) entry never reaches the addendum, even though it exists in the store', async () => {
    const db = createFakeFirestore();
    await createDraftKnowledgeEntry(db, 'author1', draftInput());
    const result = await buildNheiEducationalChatAddendum(db, undefined, "Tell me about the internal self.");
    expect(result.addendum).toBe('');
    expect(result.sectionCount).toBe(0);
  });
});

describe('buildNheiEducationalChatAddendum - Checkpoint 3 section 1: relevance gating', () => {
  it('an unrelated message never reaches retrieval at all, even with a real approved entry sitting in the store', async () => {
    const db = createFakeFirestore();
    await createDraftKnowledgeEntry(db, 'author1', draftInput());
    await approveKnowledgeEntryAsVerifiedReviewer(db, { uid: 'real_reviewer', role: NHEI_KNOWLEDGE_REVIEWER_ROLE }, 'entry1', FULL_CHECKLIST);
    const result = await buildNheiEducationalChatAddendum(db, undefined, "What's the weather like today?");
    expect(result).toEqual({ addendum: '', sectionCount: 0 });
  });

  it('a relevant message does retrieve the matching approved entry', async () => {
    const db = createFakeFirestore();
    await createDraftKnowledgeEntry(db, 'author1', draftInput());
    await approveKnowledgeEntryAsVerifiedReviewer(db, { uid: 'real_reviewer', role: NHEI_KNOWLEDGE_REVIEWER_ROLE }, 'entry1', FULL_CHECKLIST);
    const result = await buildNheiEducationalChatAddendum(db, undefined, "Tell me about the internal self.");
    expect(result.sectionCount).toBeGreaterThan(0);
  });

  it('a non-string/empty message selects no topics and never retrieves', async () => {
    const db = createFakeFirestore();
    await createDraftKnowledgeEntry(db, 'author1', draftInput());
    await approveKnowledgeEntryAsVerifiedReviewer(db, { uid: 'real_reviewer', role: NHEI_KNOWLEDGE_REVIEWER_ROLE }, 'entry1', FULL_CHECKLIST);
    expect(await buildNheiEducationalChatAddendum(db, undefined, "")).toEqual({ addendum: '', sectionCount: 0 });
    expect(await buildNheiEducationalChatAddendum(db, undefined, undefined)).toEqual({ addendum: '', sectionCount: 0 });
  });
});

describe('buildNheiEducationalChatAddendum - once a real approved entry exists', () => {
  it('includes an approved entry, quarantined through the real knowledge-to-model interface', async () => {
    const db = createFakeFirestore();
    await createDraftKnowledgeEntry(db, 'author1', draftInput());
    const approval = await approveKnowledgeEntryAsVerifiedReviewer(
      db,
      { uid: 'real_reviewer', role: NHEI_KNOWLEDGE_REVIEWER_ROLE },
      'entry1',
      FULL_CHECKLIST,
    );
    expect(approval.ok).toBe(true);

    const result = await buildNheiEducationalChatAddendum(db, undefined, "Tell me about the internal self.");
    expect(result.sectionCount).toBeGreaterThan(0);
    // Framing instruction and quarantine delimiters must be present -
    // this is the real quarantineKnowledgeEntryForPrompt output, not a
    // plain string splice.
    expect(result.addendum).toContain('REFERENCE DATA');
    expect(result.addendum).toContain('NOT an instruction');
    expect(result.addendum).toContain('Summary');
  });

  it('caps the number of sections spliced into one addendum at MAX_SECTIONS_PER_TURN, even if more approved entries exist', async () => {
    const db = createFakeFirestore();
    for (let i = 1; i <= 6; i++) {
      await createDraftKnowledgeEntry(db, 'author1', draftInput({ id: `entry${i}`, title: `Title ${i}` }));
      await approveKnowledgeEntryAsVerifiedReviewer(db, { uid: 'real_reviewer', role: NHEI_KNOWLEDGE_REVIEWER_ROLE }, `entry${i}`, FULL_CHECKLIST);
    }
    const result = await buildNheiEducationalChatAddendum(db, undefined, "Tell me about the internal self.");
    expect(result.sectionCount).toBeLessThanOrEqual(3);
  });
});

describe('buildNheiEducationalChatAddendum - never throws, fails safe', () => {
  it('returns the empty result instead of throwing when the Firestore handle itself is broken', async () => {
    const brokenDb: FirestoreLike = {
      collection() {
        throw new Error('simulated Firestore outage');
      },
    };
    const result = await buildNheiEducationalChatAddendum(brokenDb, undefined, "Tell me about the internal self.");
    expect(result).toEqual({ addendum: '', sectionCount: 0 });
  });

  it('age band is passed through unchanged, never inferred - an invalid/garbage ageBand normalises to the restrictive "unknown" band inside the pipeline rather than throwing', async () => {
    const db = createFakeFirestore();
    const result = await buildNheiEducationalChatAddendum(db, { notARealAgeBand: true }, "Tell me about the internal self.");
    expect(result).toEqual({ addendum: '', sectionCount: 0 });
  });
});

describe('buildNheiEducationalChatAddendum - Checkpoint 3 section 8: bounded total addendum size', () => {
  it('even with many approved entries at the schema\'s own maximum field lengths, the total addendum stays bounded - MAX_SECTIONS_PER_TURN (3) times each field\'s own cap, not unbounded', async () => {
    const db = createFakeFirestore();
    // 6 approved entries, more than MAX_SECTIONS_PER_TURN (3) - each at
    // title's MAX_SHORT (200) and educationalSummary's MAX_LONG (4000)
    // field maximums (nhei-knowledge-types.ts), the actual worst case a
    // real, validly-sized entry could ever present.
    for (let i = 1; i <= 6; i++) {
      await createDraftKnowledgeEntry(db, 'author1', draftInput({
        id: `entry${i}`,
        title: 'T'.repeat(200),
        educationalSummary: 'S'.repeat(4000),
      }));
      await approveKnowledgeEntryAsVerifiedReviewer(db, { uid: 'real_reviewer', role: NHEI_KNOWLEDGE_REVIEWER_ROLE }, `entry${i}`, FULL_CHECKLIST);
    }
    const result = await buildNheiEducationalChatAddendum(db, undefined, "Tell me about the internal self.");
    expect(result.sectionCount).toBeLessThanOrEqual(3);
    // 3 sections * (200 title + 4000 body + ~250 chars of quarantine
    // framing/delimiter overhead per section) is comfortably under 15000
    // - a real, calculable ceiling, not "however large the library gets."
    expect(result.addendum.length).toBeLessThan(15000);
  });
});
