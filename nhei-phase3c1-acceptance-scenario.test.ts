// NHEI PHASE 3C-1 - MANDATORY CRITICAL THREE-SELF SCENARIO (section 4)
//
// The same narrative every earlier phase's own fixture has used, run
// end to end through THIS phase's full pipeline: synthetic conversation
// turns -> a fixture model caller simulating a well-behaved extraction
// response -> Phase 1 engines -> Phase 3B knowledge retrieval ->
// deterministic response composition. Nothing here calls a real model;
// the "model" is a fixed, reproducible fixture function.

import { describe, it, expect } from 'vitest';
import { runNheiConversationPipeline } from './nhei-conversation-pipeline';
import { createDraftKnowledgeEntry, approveKnowledgeEntry } from './nhei-knowledge-service';
import { NHEI_KNOWLEDGE_CONTENT_LIBRARY } from './nhei-knowledge-content-library';
import type { FirestoreLike, FirestoreCollectionRefLike, FirestoreTransactionLike } from './nhei-persistence-service';
import type { NheiConsentState } from './nhei-consent';
import type { NheiModelCaller } from './nhei-extraction-service';
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

const REFLECTION_ONLY: NheiConsentState = { reflection_storage: true, longitudinal_tracking: false, routing_insights: false };
const FULL_CHECKLIST: NheiKnowledgeReviewChecklist = {
  noUnsupportedPsychologicalClaims: true, noUnnecessaryMedicalisation: true, noMisleadingCausation: true,
  noUnsupportedIdentityAssumptions: true, noExcessiveEmotionalAiDependence: true,
  appropriateForYouthLanguageWhereRelevant: true, noUnnecessarySensitiveDataCollection: true, noCulturalOrPhilosophicalBias: true,
};

const SYNTHETIC_CONVERSATION = [
  'I was dreading asking my manager for time off - I was sure they would say no.',
  'They actually approved it without any pushback.',
  'Later that evening I felt guilty about being away from work.',
  'I found it really difficult to rest, even though I had the time.',
  'Looking back, the whole thing knocked my confidence.',
];

// The fixture "model" response - fixed and reproducible, standing in for
// a well-behaved extraction call. In a real (future, unapproved) wiring
// this would come from createGeminiExtractionCaller; here it is a plain
// synchronous fixture, per instruction ("use synthetic conversation
// fixtures only... do not make successful tests depend only on an LLM
// asserting that its own response was correct").
const fixtureCaller: NheiModelCaller = async () => JSON.stringify({
  candidates: [
    { candidateId: 'A', abstain: false, sourceType: 'USER_REPORTED_THOUGHT', selfSystems: ['PERCEIVED_RECEIVED_SELF'], dimensions: ['MENTAL'], relativeOrder: 0, timeUncertainty: 'unknown', evidenceQuality: 'medium', relatedCandidateIds: [] },
    { candidateId: 'B', abstain: false, sourceType: 'USER_REPORTED_EVENT', selfSystems: ['RELATIONAL_SELF'], dimensions: [], relativeOrder: 1, timeUncertainty: 'unknown', evidenceQuality: 'medium', relatedCandidateIds: [] },
    { candidateId: 'C', abstain: false, sourceType: 'USER_REPORTED_EMOTION', selfSystems: ['INTERNAL_SELF'], dimensions: ['EMOTIONAL'], relativeOrder: 2, timeUncertainty: 'unknown', evidenceQuality: 'medium', relatedCandidateIds: [] },
    { candidateId: 'D', abstain: false, sourceType: 'USER_REPORTED_BEHAVIOUR', selfSystems: [], dimensions: ['PHYSICAL'], relativeOrder: 3, timeUncertainty: 'unknown', evidenceQuality: 'medium', relatedCandidateIds: [] },
    { candidateId: 'E', abstain: false, sourceType: 'USER_REPORTED_OUTCOME', selfSystems: [], dimensions: [], relativeOrder: 4, timeUncertainty: 'unknown', evidenceQuality: 'medium', relatedCandidateIds: [] },
  ],
});

async function seedApprovedContentLibrary(db: FirestoreLike) {
  for (const entry of NHEI_KNOWLEDGE_CONTENT_LIBRARY) {
    await createDraftKnowledgeEntry(db, 'author1', { ...entry, approvalStatus: 'draft', reviewerId: null, lastReviewedAt: null });
    await approveKnowledgeEntry(db, entry.id, 'reviewer1', FULL_CHECKLIST);
  }
}

describe('Phase 3C-1 critical scenario - five distinct experiences, preserved and correctly classified', () => {
  it('runs successfully end to end', async () => {
    const db = createFakeFirestore();
    await seedApprovedContentLibrary(db);
    const result = await runNheiConversationPipeline(
      REFLECTION_ONLY,
      { mode: 'personal_reflection', turns: SYNTHETIC_CONVERSATION, modelCaller: fixtureCaller, batchId: 'scenario1' },
      db,
    );
    expect(result.ok).toBe(true);
  });

  it('preserves all five distinct experiences - none merged, none dropped', async () => {
    const db = createFakeFirestore();
    await seedApprovedContentLibrary(db);
    const result = await runNheiConversationPipeline(REFLECTION_ONLY, { mode: 'personal_reflection', turns: SYNTHETIC_CONVERSATION, modelCaller: fixtureCaller, batchId: 'scenario1' }, db);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.extractedEvidence).toHaveLength(5);
  });

  it('preserves their approximate chronological order', async () => {
    const db = createFakeFirestore();
    await seedApprovedContentLibrary(db);
    const result = await runNheiConversationPipeline(REFLECTION_ONLY, { mode: 'personal_reflection', turns: SYNTHETIC_CONVERSATION, modelCaller: fixtureCaller, batchId: 'scenario1' }, db);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.timeline.map((e) => e.record.id)).toEqual([
        'extracted_scenario1_A', 'extracted_scenario1_B', 'extracted_scenario1_C', 'extracted_scenario1_D', 'extracted_scenario1_E',
      ]);
    }
  });

  it('recognises Perceived-Received, Relational and Internal Self associations, all three simultaneously active', async () => {
    const db = createFakeFirestore();
    await seedApprovedContentLibrary(db);
    const result = await runNheiConversationPipeline(REFLECTION_ONLY, { mode: 'personal_reflection', turns: SYNTHETIC_CONVERSATION, modelCaller: fixtureCaller, batchId: 'scenario1' }, db);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const labels = result.response.recognizedExperiences.filter((e) => e.kind === 'self_system').map((e) => e.label);
      expect(labels.sort()).toEqual(['INTERNAL_SELF', 'PERCEIVED_RECEIVED_SELF', 'RELATIONAL_SELF']);
    }
  });

  it('allows overlapping dimensions (MENTAL, EMOTIONAL, PHYSICAL all active from different events)', async () => {
    const db = createFakeFirestore();
    await seedApprovedContentLibrary(db);
    const result = await runNheiConversationPipeline(REFLECTION_ONLY, { mode: 'personal_reflection', turns: SYNTHETIC_CONVERSATION, modelCaller: fixtureCaller, batchId: 'scenario1' }, db);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const dims = result.response.recognizedExperiences.filter((e) => e.kind === 'dimension').map((e) => e.label);
      expect(dims.sort()).toEqual(['EMOTIONAL', 'MENTAL', 'PHYSICAL']);
    }
  });

  it('distinguishes anticipated refusal (A) from actual approval (B) as separate records', async () => {
    const db = createFakeFirestore();
    await seedApprovedContentLibrary(db);
    const result = await runNheiConversationPipeline(REFLECTION_ONLY, { mode: 'personal_reflection', turns: SYNTHETIC_CONVERSATION, modelCaller: fixtureCaller, batchId: 'scenario1' }, db);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const a = result.extractedEvidence.find((r) => r.id === 'extracted_scenario1_A')!;
      const b = result.extractedEvidence.find((r) => r.id === 'extracted_scenario1_B')!;
      expect(a.sourceType).toBe('USER_REPORTED_THOUGHT'); // the anticipation
      expect(b.sourceType).toBe('USER_REPORTED_EVENT'); // the actual event
      expect(a.id).not.toBe(b.id);
    }
  });

  it('distinguishes later guilt (C) from earlier anticipation (A) - different ids, different order positions', async () => {
    const db = createFakeFirestore();
    await seedApprovedContentLibrary(db);
    const result = await runNheiConversationPipeline(REFLECTION_ONLY, { mode: 'personal_reflection', turns: SYNTHETIC_CONVERSATION, modelCaller: fixtureCaller, batchId: 'scenario1' }, db);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const positionA = result.timeline.find((e) => e.record.id === 'extracted_scenario1_A')!.position;
      const positionC = result.timeline.find((e) => e.record.id === 'extracted_scenario1_C')!.position;
      expect(positionC).toBeGreaterThan(positionA);
    }
  });

  it('recognises impaired rest (D) as a behavioural/recovery consequence - PHYSICAL dimension, USER_REPORTED_BEHAVIOUR source', async () => {
    const db = createFakeFirestore();
    await seedApprovedContentLibrary(db);
    const result = await runNheiConversationPipeline(REFLECTION_ONLY, { mode: 'personal_reflection', turns: SYNTHETIC_CONVERSATION, modelCaller: fixtureCaller, batchId: 'scenario1' }, db);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const d = result.extractedEvidence.find((r) => r.id === 'extracted_scenario1_D')!;
      expect(d.sourceType).toBe('USER_REPORTED_BEHAVIOUR');
      expect(d.dimensions).toContain('PHYSICAL');
    }
  });

  it('recognises reduced confidence (E) as a user-reported impact - USER_REPORTED_OUTCOME source', async () => {
    const db = createFakeFirestore();
    await seedApprovedContentLibrary(db);
    const result = await runNheiConversationPipeline(REFLECTION_ONLY, { mode: 'personal_reflection', turns: SYNTHETIC_CONVERSATION, modelCaller: fixtureCaller, batchId: 'scenario1' }, db);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const e = result.extractedEvidence.find((r) => r.id === 'extracted_scenario1_E')!;
      expect(e.sourceType).toBe('USER_REPORTED_OUTCOME');
    }
  });

  it('does not infer the hidden cause of guilt, and does not assert that anticipated refusal (A) caused the later guilt (C)', async () => {
    const db = createFakeFirestore();
    await seedApprovedContentLibrary(db);
    const result = await runNheiConversationPipeline(REFLECTION_ONLY, { mode: 'personal_reflection', turns: SYNTHETIC_CONVERSATION, modelCaller: fixtureCaller, batchId: 'scenario1' }, db);
    expect(result.ok).toBe(true);
    if (result.ok) {
      // No influence-type relation was ever computed - RECURRENCE is the
      // only relation type this call can produce, and it never implies
      // causation (see nhei-temporal-engine.ts). No causal language
      // appears anywhere in the composed response either.
      expect(result.temporalRelations.every((r) => r.relationType === 'RECURRENCE')).toBe(true);
      const allText = [result.response.disclaimer, ...result.response.uncertaintyNotes, ...result.response.sections.map((s) => s.body)].join(' ').toLowerCase();
      expect(allText).not.toContain('the anticipation caused');
      expect(allText).not.toContain('caused the guilt');
      // The explicit uncertainty note about unestablished causes is present.
      expect(result.response.uncertaintyNotes.some((n) => n.toLowerCase().includes('not established'))).toBe(true);
    }
  });

  it('never claims to know the manager\'s unreported thoughts - no third-party belief appears anywhere in the output', async () => {
    const db = createFakeFirestore();
    await seedApprovedContentLibrary(db);
    const result = await runNheiConversationPipeline(REFLECTION_ONLY, { mode: 'personal_reflection', turns: SYNTHETIC_CONVERSATION, modelCaller: fixtureCaller, batchId: 'scenario1' }, db);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const allText = JSON.stringify(result.response).toLowerCase();
      expect(allText).not.toContain('manager thought');
      expect(allText).not.toContain('manager believed');
      expect(allText).not.toContain('manager felt');
      // The Perceived-Received Self uncertainty note is present, which is
      // exactly the mechanism that keeps this honest.
      expect(result.response.uncertaintyNotes.some((n) => n.toLowerCase().includes('anticipated judgement'))).toBe(true);
    }
  });

  it('produces an educational response, not a diagnosis - no diagnostic/clinical field exists anywhere in the output shape', async () => {
    const db = createFakeFirestore();
    await seedApprovedContentLibrary(db);
    const result = await runNheiConversationPipeline(REFLECTION_ONLY, { mode: 'personal_reflection', turns: SYNTHETIC_CONVERSATION, modelCaller: fixtureCaller, batchId: 'scenario1' }, db);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(Object.keys(result.response)).not.toContain('diagnosis');
      expect(Object.keys(result.response)).not.toContain('riskScore');
      expect(result.response.sections.length).toBeGreaterThan(0);
      expect(result.response.disclaimer).toContain('not a diagnosis');
    }
  });
});
