// NHEI PHASE 3C CHECKPOINT 3 SECTION 3 - EDUCATIONAL CONTENT REVIEW
// SERVICE BOUNDARY TESTS

import { describe, it, expect } from 'vitest';
import { handleNheiKnowledgeReviewRequest } from './nhei-knowledge-review-service-boundary';
import { createDraftKnowledgeEntry } from './nhei-knowledge-service';
import { NHEI_KNOWLEDGE_REVIEWER_ROLE } from './nhei-authority-contract';
import type { FirestoreLike, FirestoreCollectionRefLike } from './nhei-persistence-service';
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
          async set(data: Record<string, unknown>) { store.set(key, { ...data }); },
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

describe('handleNheiKnowledgeReviewRequest - identity check happens first', () => {
  it('refuses an unroled caller before even looking at entryId', async () => {
    const db = createFakeFirestore();
    const result = await handleNheiKnowledgeReviewRequest(db, { uid: 'someone' }, { entryId: 'entry1', decision: 'approve', checklist: FULL_CHECKLIST });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('role_not_granted');
  });

  it('refuses a caller with the wrong role', async () => {
    const db = createFakeFirestore();
    const result = await handleNheiKnowledgeReviewRequest(db, { uid: 'someone', role: 'platform_admin' }, { entryId: 'entry1', decision: 'approve', checklist: FULL_CHECKLIST });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('role_not_granted');
  });

  it('refuses a caller with no uid at all, even with the right role', async () => {
    const db = createFakeFirestore();
    const result = await handleNheiKnowledgeReviewRequest(db, { uid: '', role: NHEI_KNOWLEDGE_REVIEWER_ROLE }, { entryId: 'entry1', decision: 'approve', checklist: FULL_CHECKLIST });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('missing_uid');
  });
});

describe('handleNheiKnowledgeReviewRequest - request-shape validation', () => {
  const VERIFIED = { uid: 'real_reviewer', role: NHEI_KNOWLEDGE_REVIEWER_ROLE };

  it('rejects a missing/empty entryId', async () => {
    const db = createFakeFirestore();
    const result = await handleNheiKnowledgeReviewRequest(db, VERIFIED, { entryId: '', decision: 'approve', checklist: FULL_CHECKLIST });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('invalid_entry_id');
  });

  it('rejects an invalid decision value', async () => {
    const db = createFakeFirestore();
    const result = await handleNheiKnowledgeReviewRequest(db, VERIFIED, { entryId: 'entry1', decision: 'delete' as any });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('invalid_decision');
  });

  it('requires a checklist for an approve decision', async () => {
    const db = createFakeFirestore();
    await createDraftKnowledgeEntry(db, 'author1', draftInput());
    const result = await handleNheiKnowledgeReviewRequest(db, VERIFIED, { entryId: 'entry1', decision: 'approve' });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('checklist_required_for_approval');
  });

  it('does not require a checklist for a reject decision', async () => {
    const db = createFakeFirestore();
    await createDraftKnowledgeEntry(db, 'author1', draftInput());
    const result = await handleNheiKnowledgeReviewRequest(db, VERIFIED, { entryId: 'entry1', decision: 'reject' });
    expect(result.ok).toBe(true);
  });
});

describe('handleNheiKnowledgeReviewRequest - the real approval/rejection path, end to end', () => {
  const VERIFIED = { uid: 'real_reviewer', role: NHEI_KNOWLEDGE_REVIEWER_ROLE };

  it('a correctly-roled reviewer can approve a real draft entry', async () => {
    const db = createFakeFirestore();
    await createDraftKnowledgeEntry(db, 'author1', draftInput());
    const result = await handleNheiKnowledgeReviewRequest(db, VERIFIED, { entryId: 'entry1', decision: 'approve', checklist: FULL_CHECKLIST });
    expect(result.ok).toBe(true);
    const doc = await db.collection('nhei_knowledge_entries').doc('entry1').get();
    expect((doc.data() as any).approvalStatus).toBe('approved');
    expect((doc.data() as any).reviewerId).toBe('real_reviewer');
  });

  it('a reviewer cannot approve their own authored content, even with the right role (self-approval still blocked)', async () => {
    const db = createFakeFirestore();
    await createDraftKnowledgeEntry(db, 'real_reviewer', draftInput());
    const result = await handleNheiKnowledgeReviewRequest(db, VERIFIED, { entryId: 'entry1', decision: 'approve', checklist: FULL_CHECKLIST });
    expect(result.ok).toBe(false);
  });

  it('approving a nonexistent entry fails cleanly, not with a throw', async () => {
    const db = createFakeFirestore();
    const result = await handleNheiKnowledgeReviewRequest(db, VERIFIED, { entryId: 'does_not_exist', decision: 'approve', checklist: FULL_CHECKLIST });
    expect(result.ok).toBe(false);
  });

  it('a correctly-roled reviewer can reject a real draft entry', async () => {
    const db = createFakeFirestore();
    await createDraftKnowledgeEntry(db, 'author1', draftInput());
    const result = await handleNheiKnowledgeReviewRequest(db, VERIFIED, { entryId: 'entry1', decision: 'reject' });
    expect(result.ok).toBe(true);
    const doc = await db.collection('nhei_knowledge_entries').doc('entry1').get();
    expect((doc.data() as any).approvalStatus).toBe('rejected');
  });

  it('the reviewerId recorded is always the verified caller\'s own uid, never anything else the caller object might carry', async () => {
    const db = createFakeFirestore();
    await createDraftKnowledgeEntry(db, 'author1', draftInput());
    await handleNheiKnowledgeReviewRequest(db, { uid: 'real_reviewer', role: NHEI_KNOWLEDGE_REVIEWER_ROLE }, { entryId: 'entry1', decision: 'approve', checklist: FULL_CHECKLIST });
    const doc = await db.collection('nhei_knowledge_entries').doc('entry1').get();
    expect((doc.data() as any).reviewerId).toBe('real_reviewer');
  });
});
