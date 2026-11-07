import { describe, it, expect } from 'vitest';
import { topicsFromNheiPersonalContextSummary, retrieveEducationForNheiContext } from './nhei-knowledge-bridge';
import { createDraftKnowledgeEntry, approveKnowledgeEntry } from './nhei-knowledge-service';
import type { FirestoreLike, FirestoreCollectionRefLike, FirestoreTransactionLike } from './nhei-persistence-service';
import type { NheiPersonalContextSummary } from './nhei-context-integration';
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
          async get() { const data = store.get(key); return { id: docId, exists: data !== undefined, data: () => data }; },
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
  noUnsupportedPsychologicalClaims: true, noUnnecessaryMedicalisation: true, noMisleadingCausation: true,
  noUnsupportedIdentityAssumptions: true, noExcessiveEmotionalAiDependence: true,
  appropriateForYouthLanguageWhereRelevant: true, noUnnecessarySensitiveDataCollection: true, noCulturalOrPhilosophicalBias: true,
};

function emptySummary(overrides: Partial<NheiPersonalContextSummary> = {}): NheiPersonalContextSummary {
  return {
    insufficientEvidence: false,
    selfSystemActivity: [
      { selfSystem: 'INTERNAL_SELF', evidenceCount: 0, confirmedCount: 0, disputedCount: 0, earliestOccurredAt: null, latestOccurredAt: null, evidenceIds: [] },
      { selfSystem: 'RELATIONAL_SELF', evidenceCount: 0, confirmedCount: 0, disputedCount: 0, earliestOccurredAt: null, latestOccurredAt: null, evidenceIds: [] },
      { selfSystem: 'PERCEIVED_RECEIVED_SELF', evidenceCount: 0, confirmedCount: 0, disputedCount: 0, earliestOccurredAt: null, latestOccurredAt: null, evidenceIds: [] },
    ],
    dimensionActivity: [
      { dimension: 'METAPHYSICAL', evidenceCount: 0, confirmedCount: 0, disputedCount: 0, earliestOccurredAt: null, latestOccurredAt: null, evidenceIds: [] },
      { dimension: 'PHYSICAL', evidenceCount: 0, confirmedCount: 0, disputedCount: 0, earliestOccurredAt: null, latestOccurredAt: null, evidenceIds: [] },
      { dimension: 'MENTAL', evidenceCount: 0, confirmedCount: 0, disputedCount: 0, earliestOccurredAt: null, latestOccurredAt: null, evidenceIds: [] },
      { dimension: 'EMOTIONAL', evidenceCount: 0, confirmedCount: 0, disputedCount: 0, earliestOccurredAt: null, latestOccurredAt: null, evidenceIds: [] },
    ],
    behaviouralPatterns: [],
    confirmedInterpretations: [],
    openHypotheses: [],
    provenanceNote: 'note',
    ...overrides,
  };
}

describe('topicsFromNheiPersonalContextSummary', () => {
  it('derives no topics at all from a summary with zero evidence activity', () => {
    expect(topicsFromNheiPersonalContextSummary(emptySummary())).toEqual([]);
  });

  it('derives topics only from self-systems/dimensions that actually have evidence', () => {
    const summary = emptySummary({
      selfSystemActivity: [
        { selfSystem: 'INTERNAL_SELF', evidenceCount: 2, confirmedCount: 0, disputedCount: 0, earliestOccurredAt: null, latestOccurredAt: null, evidenceIds: ['a', 'b'] },
        { selfSystem: 'RELATIONAL_SELF', evidenceCount: 0, confirmedCount: 0, disputedCount: 0, earliestOccurredAt: null, latestOccurredAt: null, evidenceIds: [] },
        { selfSystem: 'PERCEIVED_RECEIVED_SELF', evidenceCount: 0, confirmedCount: 0, disputedCount: 0, earliestOccurredAt: null, latestOccurredAt: null, evidenceIds: [] },
      ],
    });
    expect(topicsFromNheiPersonalContextSummary(summary)).toEqual(['INTERNAL_SELF']);
  });

  it('adds ADAPTIVE_BEHAVIOUR when behavioural patterns were detected', () => {
    const summary = emptySummary({ behaviouralPatterns: [{ behaviourEventIds: ['b1'], outcomeEventIds: ['o1'], occurrenceCount: 2, selfSystems: [], dimensions: [], relationTypesObserved: ['SEQUENCE'], interpretationConfidence: 'low', causalClaim: false }] });
    expect(topicsFromNheiPersonalContextSummary(summary)).toEqual(['ADAPTIVE_BEHAVIOUR']);
  });
});

describe('retrieveEducationForNheiContext', () => {
  it('returns found: false, with no library query, for a summary with no active topics', async () => {
    const db = createFakeFirestore();
    const result = await retrieveEducationForNheiContext(db, emptySummary());
    expect(result.found).toBe(false);
    expect(result.entries).toEqual([]);
  });

  it('retrieves approved content for a self-system the summary shows as active', async () => {
    const db = createFakeFirestore();
    await createDraftKnowledgeEntry(db, 'author1', {
      id: 'internal_self_entry', title: 'T', educationalSummary: 'S', detailedExplanation: 'D',
      topics: ['INTERNAL_SELF'], learningObjective: 'L', selfSystems: ['INTERNAL_SELF'], dimensions: [],
      exampleScenarios: [], reflectionQuestions: [], recoveryToolReferences: [],
      evidenceCategory: 'BLAZE_BREAK_PROPRIETARY_CONCEPT', sourceReferences: [], sourcePublicationInfo: null,
      safetyRestrictions: [], ageGroup: 'all_ages', perceivedReceivedSelfDistinctions: null,
    });
    await approveKnowledgeEntry(db, 'internal_self_entry', 'reviewer1', FULL_CHECKLIST);

    const summary = emptySummary({
      selfSystemActivity: [
        { selfSystem: 'INTERNAL_SELF', evidenceCount: 1, confirmedCount: 0, disputedCount: 0, earliestOccurredAt: null, latestOccurredAt: null, evidenceIds: ['a'] },
        { selfSystem: 'RELATIONAL_SELF', evidenceCount: 0, confirmedCount: 0, disputedCount: 0, earliestOccurredAt: null, latestOccurredAt: null, evidenceIds: [] },
        { selfSystem: 'PERCEIVED_RECEIVED_SELF', evidenceCount: 0, confirmedCount: 0, disputedCount: 0, earliestOccurredAt: null, latestOccurredAt: null, evidenceIds: [] },
      ],
    });
    const result = await retrieveEducationForNheiContext(db, summary);
    expect(result.found).toBe(true);
    expect(result.entries.map((e) => e.id)).toEqual(['internal_self_entry']);
  });
});
