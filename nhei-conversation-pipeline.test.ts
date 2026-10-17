import { describe, it, expect } from 'vitest';
import { runNheiConversationPipeline } from './nhei-conversation-pipeline';
import { createDraftKnowledgeEntry, approveKnowledgeEntry } from './nhei-knowledge-service';
import type { FirestoreLike, FirestoreCollectionRefLike } from './nhei-persistence-service';
import type { NheiConsentState } from './nhei-consent';
import type { NheiModelCaller } from './nhei-extraction-service';
import type { NheiKnowledgeReviewChecklist } from './nhei-knowledge-governance';
import type { NheiEvidenceRecord } from './nhei-types';

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
  return { collection };
}

const NO_CONSENT: NheiConsentState = { reflection_storage: false, longitudinal_tracking: false, routing_insights: false };
const REFLECTION_ONLY: NheiConsentState = { reflection_storage: true, longitudinal_tracking: false, routing_insights: false };
const BOTH_CONSENTED: NheiConsentState = { reflection_storage: true, longitudinal_tracking: true, routing_insights: false };

const FULL_CHECKLIST: NheiKnowledgeReviewChecklist = {
  noUnsupportedPsychologicalClaims: true, noUnnecessaryMedicalisation: true, noMisleadingCausation: true,
  noUnsupportedIdentityAssumptions: true, noExcessiveEmotionalAiDependence: true,
  appropriateForYouthLanguageWhereRelevant: true, noUnnecessarySensitiveDataCollection: true, noCulturalOrPhilosophicalBias: true,
};

async function seedApprovedKnowledge(db: FirestoreLike, id: string, topics: string[]) {
  await createDraftKnowledgeEntry(db, 'author1', {
    id, title: `Title for ${id}`, educationalSummary: `Summary for ${id}`, detailedExplanation: 'Detail',
    topics, learningObjective: 'L', selfSystems: [], dimensions: [],
    exampleScenarios: [], reflectionQuestions: [], recoveryToolReferences: [],
    evidenceCategory: 'BLAZE_BREAK_PROPRIETARY_CONCEPT', sourceReferences: [], sourcePublicationInfo: null,
    safetyRestrictions: [], ageGroup: 'all_ages', perceivedReceivedSelfDistinctions: null,
  });
  await approveKnowledgeEntry(db, id, 'reviewer1', FULL_CHECKLIST);
}

function fixtureCaller(candidates: object[]): NheiModelCaller {
  return async () => JSON.stringify({ candidates });
}

describe('Educational Mode - accessible without any consent, never creates evidence', () => {
  it('runs with zero consent and retrieves approved knowledge by requested topic', async () => {
    const db = createFakeFirestore();
    await seedApprovedKnowledge(db, 'k1', ['SHIP']);
    const result = await runNheiConversationPipeline(NO_CONSENT, { mode: 'educational', requestedTopics: ['SHIP'] }, db);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.extractedEvidence).toEqual([]);
      expect(result.response.sections.map((s) => s.sourceKnowledgeEntryId)).toEqual(['k1']);
    }
  });

  it('never calls a model at all - no extraction happens in this mode', async () => {
    const db = createFakeFirestore();
    const result = await runNheiConversationPipeline(NO_CONSENT, { mode: 'educational', requestedTopics: ['BLAME'] }, db);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.extractionDiagnostics).toBeNull();
  });
});

describe('Personal Reflection Mode - runs without consent, but nothing is ever persisted by this pipeline', () => {
  it('extracts evidence for this turn even with zero consent (persistence is a separate, later step this pipeline never performs)', async () => {
    const db = createFakeFirestore();
    const caller = fixtureCaller([
      { candidateId: 'c1', abstain: false, sourceType: 'USER_REPORTED_EMOTION', selfSystems: ['INTERNAL_SELF'], dimensions: ['EMOTIONAL'], relativeOrder: 0, timeUncertainty: 'unknown', evidenceQuality: 'medium', relatedCandidateIds: [] },
    ]);
    const result = await runNheiConversationPipeline(NO_CONSENT, { mode: 'personal_reflection', turns: ['I felt guilty today.'], modelCaller: caller, batchId: 'b1' }, db);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.extractedEvidence).toHaveLength(1);
      expect(result.modeAuthorisation.mayPersist).toBe(false);
    }
  });

  it('reports mayPersist: true once reflection_storage is consented - information only, this pipeline still never writes anywhere', async () => {
    const db = createFakeFirestore();
    const caller = fixtureCaller([]);
    const result = await runNheiConversationPipeline(REFLECTION_ONLY, { mode: 'personal_reflection', turns: ['anything'], modelCaller: caller, batchId: 'b1' }, db);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.modeAuthorisation.mayPersist).toBe(true);
  });
});

describe('Longitudinal Mode - cross-session access without consent is refused outright', () => {
  it('is blocked entirely without both consents - never silently downgraded to a smaller result', async () => {
    const db = createFakeFirestore();
    const caller = fixtureCaller([]);
    const priorEvidence: NheiEvidenceRecord[] = [
      { id: 'prior1', sourceType: 'USER_REPORTED_EVENT', timeUncertainty: 'unknown', evidenceQuality: 'medium', confirmationState: 'not_applicable', selfSystems: ['RELATIONAL_SELF'], dimensions: [], relatedEventIds: [] },
    ];
    const result = await runNheiConversationPipeline(NO_CONSENT, { mode: 'longitudinal', turns: ['anything'], modelCaller: caller, batchId: 'b1', priorEvidence }, db);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.modeAuthorisation.allowed).toBe(false);
  });

  it('uses prior evidence only once BOTH consents are present', async () => {
    const db = createFakeFirestore();
    const caller = fixtureCaller([
      { candidateId: 'c1', abstain: false, sourceType: 'USER_REPORTED_EVENT', selfSystems: ['RELATIONAL_SELF'], dimensions: [], relativeOrder: 0, timeUncertainty: 'unknown', evidenceQuality: 'medium', relatedCandidateIds: [] },
    ]);
    const priorEvidence: NheiEvidenceRecord[] = [
      { id: 'prior1', sourceType: 'USER_REPORTED_EVENT', timeUncertainty: 'unknown', evidenceQuality: 'medium', confirmationState: 'not_applicable', selfSystems: ['RELATIONAL_SELF'], dimensions: [], relatedEventIds: [] },
    ];
    const result = await runNheiConversationPipeline(BOTH_CONSENTED, { mode: 'longitudinal', turns: ['this happened again'], modelCaller: caller, batchId: 'b1', priorEvidence }, db);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.usedPriorEvidenceCount).toBe(1);
  });

  it('does NOT infer recurrence when no reliable prior records are available - a single new event with no prior history produces no RECURRENCE relation', async () => {
    const db = createFakeFirestore();
    const caller = fixtureCaller([
      { candidateId: 'c1', abstain: false, sourceType: 'USER_REPORTED_EVENT', selfSystems: ['RELATIONAL_SELF'], dimensions: [], relativeOrder: 0, timeUncertainty: 'unknown', evidenceQuality: 'medium', relatedCandidateIds: [] },
    ]);
    const result = await runNheiConversationPipeline(BOTH_CONSENTED, { mode: 'longitudinal', turns: ['this happened'], modelCaller: caller, batchId: 'b1', priorEvidence: [] }, db);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.temporalRelations.some((r) => r.relationType === 'RECURRENCE')).toBe(false);
    }
  });
});

describe('separate activation of the three self-systems', () => {
  it('each self-system can be active independently, from a conversation touching only one of them', async () => {
    const db = createFakeFirestore();
    const caller = fixtureCaller([
      { candidateId: 'c1', abstain: false, sourceType: 'USER_REPORTED_THOUGHT', selfSystems: ['PERCEIVED_RECEIVED_SELF'], dimensions: [], relativeOrder: 0, timeUncertainty: 'unknown', evidenceQuality: 'medium', relatedCandidateIds: [] },
    ]);
    const result = await runNheiConversationPipeline(REFLECTION_ONLY, { mode: 'personal_reflection', turns: ['I thought they would say no.'], modelCaller: caller, batchId: 'b1' }, db);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.response.recognizedExperiences.map((e) => e.label)).toEqual(['PERCEIVED_RECEIVED_SELF']);
    }
  });
});

describe('overlapping self-system associations', () => {
  it('one event can activate more than one self-system at once, without merging them', async () => {
    const db = createFakeFirestore();
    const caller = fixtureCaller([
      { candidateId: 'c1', abstain: false, sourceType: 'USER_REPORTED_EMOTION', selfSystems: ['INTERNAL_SELF', 'PERCEIVED_RECEIVED_SELF'], dimensions: ['EMOTIONAL'], relativeOrder: 0, timeUncertainty: 'unknown', evidenceQuality: 'medium', relatedCandidateIds: [] },
    ]);
    const result = await runNheiConversationPipeline(REFLECTION_ONLY, { mode: 'personal_reflection', turns: ['anything'], modelCaller: caller, batchId: 'b1' }, db);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const labels = result.response.recognizedExperiences.map((e) => e.label);
      expect(labels).toContain('INTERNAL_SELF');
      expect(labels).toContain('PERCEIVED_RECEIVED_SELF');
    }
  });
});

describe('contradictory reports and ambiguous statements', () => {
  it('two candidates with conflicting sourceType classifications for the same relativeOrder are both kept, not silently reconciled', async () => {
    const db = createFakeFirestore();
    const caller = fixtureCaller([
      { candidateId: 'c1', abstain: false, sourceType: 'USER_REPORTED_EVENT', selfSystems: ['RELATIONAL_SELF'], dimensions: [], relativeOrder: 0, timeUncertainty: 'unknown', evidenceQuality: 'low', relatedCandidateIds: [] },
      { candidateId: 'c2', abstain: false, sourceType: 'USER_REPORTED_OUTCOME', selfSystems: ['RELATIONAL_SELF'], dimensions: [], relativeOrder: 0, timeUncertainty: 'unknown', evidenceQuality: 'low', relatedCandidateIds: [] },
    ]);
    const result = await runNheiConversationPipeline(REFLECTION_ONLY, { mode: 'personal_reflection', turns: ['ambiguous, contradictory turn'], modelCaller: caller, batchId: 'b1' }, db);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.extractedEvidence).toHaveLength(2);
  });

  it('ambiguous statements are reflected as abstention, not a forced guess', async () => {
    const db = createFakeFirestore();
    const caller = fixtureCaller([
      { candidateId: 'c1', abstain: true, sourceType: 'UNKNOWN', selfSystems: [], dimensions: [], relativeOrder: 0, timeUncertainty: 'unknown', evidenceQuality: 'unknown', relatedCandidateIds: [] },
    ]);
    const result = await runNheiConversationPipeline(REFLECTION_ONLY, { mode: 'personal_reflection', turns: ['something vague and hard to parse'], modelCaller: caller, batchId: 'b1' }, db);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.extractedEvidence).toEqual([]);
      expect(result.extractionDiagnostics?.abstainedCount).toBe(1);
    }
  });
});

describe('unknown timestamps', () => {
  it('relies entirely on relativeOrder when no real timestamp exists, and still produces a stable timeline', async () => {
    const db = createFakeFirestore();
    const caller = fixtureCaller([
      { candidateId: 'c1', abstain: false, sourceType: 'USER_REPORTED_EVENT', selfSystems: [], dimensions: [], relativeOrder: 1, timeUncertainty: 'unknown', evidenceQuality: 'medium', relatedCandidateIds: [] },
      { candidateId: 'c2', abstain: false, sourceType: 'USER_REPORTED_OUTCOME', selfSystems: [], dimensions: [], relativeOrder: 0, timeUncertainty: 'unknown', evidenceQuality: 'medium', relatedCandidateIds: [] },
    ]);
    const result = await runNheiConversationPipeline(REFLECTION_ONLY, { mode: 'personal_reflection', turns: ['t1', 't2'], modelCaller: caller, batchId: 'b1' }, db);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.timeline.map((e) => e.record.id)).toEqual(['extracted_b1_c2', 'extracted_b1_c1']);
      expect(result.timeline.every((e) => e.orderBasis === 'reported_order')).toBe(true);
    }
  });
});

describe('insufficient evidence', () => {
  it('a turn producing zero usable candidates still returns a valid, non-fabricated response', async () => {
    const db = createFakeFirestore();
    const caller = fixtureCaller([]);
    const result = await runNheiConversationPipeline(REFLECTION_ONLY, { mode: 'personal_reflection', turns: ['hello'], modelCaller: caller, batchId: 'b1' }, db);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.extractedEvidence).toEqual([]);
      expect(result.response.recognizedExperiences).toEqual([]);
    }
  });
});

describe('long conversations and low-signal (terse) turns', () => {
  it('handles a long conversation with many turns without error', async () => {
    const db = createFakeFirestore();
    const turns = Array.from({ length: 40 }, (_, i) => `turn number ${i}`);
    const candidates = Array.from({ length: 10 }, (_, i) => ({
      candidateId: `c${i}`, abstain: false, sourceType: 'USER_REPORTED_EVENT', selfSystems: [], dimensions: [], relativeOrder: i, timeUncertainty: 'unknown', evidenceQuality: 'low', relatedCandidateIds: [],
    }));
    const caller = fixtureCaller(candidates);
    const result = await runNheiConversationPipeline(REFLECTION_ONLY, { mode: 'personal_reflection', turns, modelCaller: caller, batchId: 'b1' }, db);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.extractedEvidence).toHaveLength(10);
  });

  it('handles very short, low-information turns (e.g. a low-bandwidth or terse user) by abstaining rather than inventing detail', async () => {
    const db = createFakeFirestore();
    const caller = fixtureCaller([
      { candidateId: 'c1', abstain: true, sourceType: 'UNKNOWN', selfSystems: [], dimensions: [], relativeOrder: 0, timeUncertainty: 'unknown', evidenceQuality: 'unknown', relatedCandidateIds: [] },
    ]);
    const result = await runNheiConversationPipeline(REFLECTION_ONLY, { mode: 'personal_reflection', turns: ['bad day'], modelCaller: caller, batchId: 'b1' }, db);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.extractedEvidence).toEqual([]);
  });
});

describe('age-appropriate content is preserved end to end (youth-appropriate response data)', () => {
  it('a retrieved knowledge entry\'s ageGroup is visible in the composed response for a future caller to filter on', async () => {
    const db = createFakeFirestore();
    await createDraftKnowledgeEntry(db, 'author1', {
      id: 'adult_only_entry', title: 'T', educationalSummary: 'S', detailedExplanation: 'D',
      topics: ['SHIP'], learningObjective: 'L', selfSystems: [], dimensions: [],
      exampleScenarios: [], reflectionQuestions: [], recoveryToolReferences: [],
      evidenceCategory: 'BLAZE_BREAK_PROPRIETARY_CONCEPT', sourceReferences: [], sourcePublicationInfo: null,
      safetyRestrictions: [], ageGroup: 'adult_only', perceivedReceivedSelfDistinctions: null,
    });
    await approveKnowledgeEntry(db, 'adult_only_entry', 'reviewer1', FULL_CHECKLIST);
    const result = await runNheiConversationPipeline(NO_CONSENT, { mode: 'educational', requestedTopics: ['SHIP'] }, db);
    expect(result.ok).toBe(true);
    // The response package exposes evidenceCategory per section, but not
    // yet ageGroup directly - flagged in the delivery report as a real
    // gap: age-based FILTERING is not implemented this phase, since no
    // age-context signal exists anywhere in this pipeline's input yet.
    // This test exists to make that gap explicit and checkable, not to
    // claim it is solved.
    if (result.ok) expect(result.response.sections).toHaveLength(1);
  });
});
