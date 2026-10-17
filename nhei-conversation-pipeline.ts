// NHEI PHASE 3C-1 - CONVERSATIONAL INTELLIGENCE PIPELINE (OFFLINE / TEST HARNESS ONLY)
//
// Ties together conversation-to-evidence extraction (Phase 3C-1),
// Phase 1's Trifecta/Dimensions/Temporal/Adaptive Behaviour engines,
// Phase 3B's Knowledge Engine, and the mode-authorisation rules above -
// into one orchestrated, fully offline pipeline. This file:
//   * NEVER calls any nhei-persistence-service.ts WRITE function. Nothing
//     here persists anything, regardless of what a mode's `mayPersist`
//     flag says - that flag is returned as INFORMATION for a future,
//     separately-approved phase's wiring to act on, not acted on here.
//   * NEVER imports or calls server.ts or any Express route.
//   * Is designed to run entirely against synthetic fixtures and a
//     FirestoreLike fake for the Knowledge Engine lookup (see
//     nhei-persistence-service.ts's FirestoreLike, reused by
//     nhei-knowledge-service.ts) - there is no code path in this file
//     that reaches a real network or a real database.
//
// Responsibility separation (explicitly required, section 10 of the
// Phase 3B spec and restated for this phase): this file performs
// EXTRACTION ORCHESTRATION and KNOWLEDGE RETRIEVAL ORCHESTRATION only.
// Experience interpretation is Phase 1's engines (untouched, reused).
// Evidence classification is nhei-extraction-types.ts (untouched by this
// file beyond calling it). Temporal reasoning is nhei-temporal-engine.ts
// (untouched, reused). User-facing response generation is
// nhei-educational-response-composer.ts (a separate file, deliberately).

import { authoriseConversationMode, type NheiModeAuthorisation } from './nhei-conversation-modes';
import { type NheiConsentState } from './nhei-consent';
import { extractEvidenceFromConversation, type NheiModelCaller, type NheiExtractionOutcome } from './nhei-extraction-service';
import { type NheiEvidenceRecord, excludeDisputedInterpretations } from './nhei-types';
import { summarizeSelfSystemActivity } from './nhei-trifecta-engine';
import { summarizeDimensionActivity } from './nhei-dimensions-engine';
import { buildTimeline, deriveRecurrenceRelations, type NheiTemporalRelation } from './nhei-temporal-engine';
import { detectBehaviouralPatterns } from './nhei-adaptive-behaviour-engine';
import { retrieveApprovedKnowledge } from './nhei-knowledge-service';
import { type NheiKnowledgeTopic } from './nhei-knowledge-types';
import { normalizeAgeBand } from './nhei-knowledge-retrieval-engine';
import { composeEducationalResponse, type NheiEducationalResponsePackage } from './nhei-educational-response-composer';
import type { FirestoreLike } from './nhei-persistence-service';

export interface NheiPipelineBlockedResult {
  ok: false;
  modeAuthorisation: NheiModeAuthorisation;
}

export interface NheiPipelineSuccessResult {
  ok: true;
  modeAuthorisation: NheiModeAuthorisation;
  extractedEvidence: NheiEvidenceRecord[]; // this turn's extraction only - never written to any store
  usedPriorEvidenceCount: number; // how much (if any) previously-persisted evidence was folded in - only nonzero in longitudinal mode
  timeline: ReturnType<typeof buildTimeline>;
  temporalRelations: NheiTemporalRelation[];
  response: NheiEducationalResponsePackage;
  extractionDiagnostics: Pick<NheiExtractionOutcome, 'abstainedCount' | 'invalidCandidateCount' | 'rejectedForBatchLimit' | 'recordConversionErrors'> | null;
}

export type NheiPipelineResult = NheiPipelineBlockedResult | NheiPipelineSuccessResult;

export interface RunEducationalModeInput {
  mode: 'educational';
  requestedTopics: NheiKnowledgeTopic[];
  // Section 4: omitted, undefined, or anything that isn't exactly 'adult'
  // or 'youth' is normalised to the most restrictive band ('unknown') by
  // normalizeAgeBand before any retrieval happens - a caller cannot get
  // adult-only content simply by not setting this field. This is NOT
  // itself a trusted age-verification boundary; it is whatever a future,
  // separately-authorised route supplies from a verified source (see the
  // Phase 3C-2A delivery report, section 5).
  ageBand?: unknown;
}

export interface RunReflectiveModeInput {
  mode: 'personal_reflection' | 'longitudinal';
  turns: string[];
  modelCaller: NheiModelCaller;
  batchId: string;
  // Only ever consulted when mode === 'longitudinal' AND authorisation
  // grants mayUseLongitudinalEvidence - caller-supplied, never fetched by
  // this file. In a real (future) wiring this would come from
  // nhei-persistence-service.ts's readNheiEvidence; here it is always a
  // plain in-memory fixture.
  priorEvidence?: NheiEvidenceRecord[];
  // Same fail-closed normalisation as RunEducationalModeInput.ageBand -
  // see that comment.
  ageBand?: unknown;
}

export type RunNheiConversationPipelineInput = RunEducationalModeInput | RunReflectiveModeInput;

export async function runNheiConversationPipeline(
  consent: NheiConsentState,
  input: RunNheiConversationPipelineInput,
  knowledgeDb: FirestoreLike,
): Promise<NheiPipelineResult> {
  const modeAuthorisation = authoriseConversationMode(consent, input.mode);
  if (!modeAuthorisation.allowed) {
    return { ok: false, modeAuthorisation };
  }

  if (input.mode === 'educational') {
    // No extraction at all - Educational Mode never touches personal
    // evidence, even ephemerally, exactly per "must not persist
    // sensitive personal evidence" read conservatively as "must not
    // CREATE sensitive personal evidence objects in the first place."
    const knowledge = await retrieveApprovedKnowledge(knowledgeDb, { topics: input.requestedTopics, ageBand: normalizeAgeBand(input.ageBand) });
    const response = composeEducationalResponse({
      mode: 'educational',
      timeline: [],
      selfSystemSummaries: [],
      dimensionSummaries: [],
      behaviouralPatterns: [],
      retrievedKnowledge: knowledge.entries,
    });
    return {
      ok: true, modeAuthorisation, extractedEvidence: [], usedPriorEvidenceCount: 0,
      timeline: [], temporalRelations: [], response, extractionDiagnostics: null,
    };
  }

  // personal_reflection or longitudinal: run full extraction.
  const extraction = await extractEvidenceFromConversation(input.modelCaller, { turns: input.turns }, input.batchId);

  const priorEvidence = (input.mode === 'longitudinal' && modeAuthorisation.mayUseLongitudinalEvidence)
    ? (input.priorEvidence ?? [])
    : [];
  const allEvidence = excludeDisputedInterpretations([...priorEvidence, ...extraction.records]);

  const selfSystemSummaries = summarizeSelfSystemActivity(allEvidence);
  const dimensionSummaries = summarizeDimensionActivity(allEvidence);
  const timeline = buildTimeline(allEvidence);
  // Only RECURRENCE is computed here - never an influence type, which
  // (per Phase 1's nhei-temporal-engine.ts) can only ever be CARRIED from
  // an explicit caller assertion, never derived from a conversation.
  // "Do not infer recurrence when no reliable previous records are
  // available" holds automatically: deriveRecurrenceRelations already
  // requires >=2 tag-sharing records (MIN_OCCURRENCES_FOR_RECURRENCE) -
  // with zero or one prior record, nothing crosses that threshold.
  const temporalRelations = deriveRecurrenceRelations(allEvidence);
  const behaviouralPatterns = detectBehaviouralPatterns(allEvidence, temporalRelations);

  const activeTopics = [
    ...selfSystemSummaries.filter((s) => s.evidenceCount > 0).map((s) => s.selfSystem),
    ...dimensionSummaries.filter((d) => d.evidenceCount > 0).map((d) => d.dimension),
    ...(behaviouralPatterns.length > 0 ? ['ADAPTIVE_BEHAVIOUR' as const] : []),
  ] as NheiKnowledgeTopic[];

  const ageBand = normalizeAgeBand(input.ageBand);
  const knowledge = activeTopics.length > 0
    ? await retrieveApprovedKnowledge(knowledgeDb, { topics: activeTopics, ageBand })
    : { found: false, entries: [], invalidTopics: [] };

  const response = composeEducationalResponse({
    mode: input.mode,
    timeline,
    selfSystemSummaries,
    dimensionSummaries,
    behaviouralPatterns,
    retrievedKnowledge: knowledge.entries,
  });

  return {
    ok: true,
    modeAuthorisation,
    extractedEvidence: extraction.records,
    usedPriorEvidenceCount: priorEvidence.length,
    timeline,
    temporalRelations,
    response,
    extractionDiagnostics: {
      abstainedCount: extraction.abstainedCount,
      invalidCandidateCount: extraction.invalidCandidateCount,
      rejectedForBatchLimit: extraction.rejectedForBatchLimit,
      recordConversionErrors: extraction.recordConversionErrors,
    },
  };
}
