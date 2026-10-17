// NHEI PHASE 3C-1 - CONVERSATION-TO-EVIDENCE EXTRACTION CONTRACT
//
// Section 3's required extraction interface. The candidate shape below
// has NO field capable of holding raw conversation text at all - the
// same structural choice Phase 1 made for NheiEvidenceRecord, applied
// one layer earlier. A model asked to fill this schema is never even
// given a place to put a raw quote; it can only emit structural
// classifications (sourceType/selfSystems/dimensions/order/confidence).
// This is what makes "no raw-text leakage" hold for model-generated
// candidates too, not just for hand-constructed ones.
//
// "Do not automatically promote extracted hypotheses into confirmed user
// facts": confirmationState is never part of the candidate schema at
// all - every candidate that survives validation becomes evidence with
// confirmationState FIXED to 'unconfirmed' (toNheiEvidenceRecord below
// sets this unconditionally). The only way a record ever becomes
// 'user_confirmed' is the existing, separate, explicit
// confirmNheiEvidence call (Phase 2) - never anything in this file.
//
// "Support abstention where evidence is insufficient": a candidate may
// set `abstain: true`, meaning "I could not confidently classify this
// part of the conversation" - an abstained candidate never becomes
// evidence, and is reported separately, never silently dropped.

import {
  type SelfSystem,
  type Dimension,
  type TimeUncertainty,
  type EvidenceQuality,
  type NheiEvidenceRecord,
  isValidSelfSystem,
  isValidDimension,
  isValidTimeUncertainty,
  isValidEvidenceQuality,
  validateEvidenceRecord,
} from './nhei-types';

// Deliberately narrower than the full EvidenceSourceType enum
// (nhei-types.ts) - extraction can only ever produce the plain,
// self-report-shaped types a model reading a conversation could
// legitimately infer. EXTERNALLY_VERIFIED_EVENT, SYSTEM_OBSERVATION,
// SYSTEM_HYPOTHESIS and USER_CONFIRMED_INTERPRETATION are structurally
// unreachable from this schema - there is no value in this list a model
// could emit that maps to one of those, so the "privileged source type"
// restriction from Phase 3A (nhei-persistence-service.ts's
// NheiSystemAuthorityToken) is reinforced here at the schema level
// rather than merely relied upon downstream.
export type NheiExtractableSourceType =
  | 'USER_REPORTED_EVENT'
  | 'USER_REPORTED_THOUGHT'
  | 'USER_REPORTED_EMOTION'
  | 'USER_REPORTED_BEHAVIOUR'
  | 'USER_REPORTED_OUTCOME'
  | 'UNKNOWN';

export const NHEI_EXTRACTABLE_SOURCE_TYPES: readonly NheiExtractableSourceType[] = [
  'USER_REPORTED_EVENT', 'USER_REPORTED_THOUGHT', 'USER_REPORTED_EMOTION',
  'USER_REPORTED_BEHAVIOUR', 'USER_REPORTED_OUTCOME', 'UNKNOWN',
];

export const isValidNheiExtractableSourceType = (value: unknown): value is NheiExtractableSourceType =>
  typeof value === 'string' && (NHEI_EXTRACTABLE_SOURCE_TYPES as readonly string[]).includes(value);

export interface NheiExtractionCandidate {
  candidateId: string; // model-assigned, unique within one extraction call
  abstain: boolean; // true = "insufficient evidence to classify this" - no other field is trusted when true
  sourceType: NheiExtractableSourceType;
  selfSystems: SelfSystem[];
  dimensions: Dimension[];
  relativeOrder: number; // 0-based position in the conversation's own narrative order - never a real timestamp
  timeUncertainty: TimeUncertainty;
  evidenceQuality: EvidenceQuality; // the model's own confidence in this classification
  // Optional, structural-only link to another candidate in the SAME
  // extraction batch by candidateId - never a free-text reference. Used
  // only to carry forward a caller-visible grouping (e.g. "this outcome
  // followed that behaviour") - never a causal claim; converting this to
  // an actual temporal relation still goes through nhei-temporal-engine.ts's
  // existing SEQUENCE/COOCCURRENCE logic, never taken as pre-computed.
  relatedCandidateIds: string[];
}

export interface NheiExtractionCandidateValidationResult {
  ok: boolean;
  candidate?: NheiExtractionCandidate;
  errors: string[];
}

const MAX_CANDIDATES_PER_BATCH = 30;

export function validateExtractionCandidate(input: unknown): NheiExtractionCandidateValidationResult {
  const errors: string[] = [];
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return { ok: false, errors: ['candidate must be a non-null object'] };
  }
  const raw = input as Record<string, unknown>;

  if (typeof raw.candidateId !== 'string' || raw.candidateId.length === 0) errors.push('candidateId must be a non-empty string');
  if (typeof raw.abstain !== 'boolean') errors.push('abstain must be a boolean');
  if (!isValidNheiExtractableSourceType(raw.sourceType)) errors.push('sourceType must be a valid NheiExtractableSourceType');

  const selfSystems = Array.isArray(raw.selfSystems) ? raw.selfSystems : undefined;
  if (selfSystems === undefined || !selfSystems.every(isValidSelfSystem)) errors.push('selfSystems must be an array of valid SelfSystem values');

  const dimensions = Array.isArray(raw.dimensions) ? raw.dimensions : undefined;
  if (dimensions === undefined || !dimensions.every(isValidDimension)) errors.push('dimensions must be an array of valid Dimension values');

  if (typeof raw.relativeOrder !== 'number' || !Number.isInteger(raw.relativeOrder) || raw.relativeOrder < 0) {
    errors.push('relativeOrder must be a non-negative integer');
  }
  if (!isValidTimeUncertainty(raw.timeUncertainty)) errors.push('timeUncertainty must be a valid TimeUncertainty');
  if (!isValidEvidenceQuality(raw.evidenceQuality)) errors.push('evidenceQuality must be a valid EvidenceQuality');

  const relatedCandidateIds = raw.relatedCandidateIds === undefined ? [] : raw.relatedCandidateIds;
  if (!Array.isArray(relatedCandidateIds) || !relatedCandidateIds.every((v) => typeof v === 'string')) {
    errors.push('relatedCandidateIds must be an array of strings when present');
  }

  if (errors.length > 0) return { ok: false, errors };

  const candidate: NheiExtractionCandidate = {
    candidateId: raw.candidateId as string,
    abstain: raw.abstain as boolean,
    sourceType: raw.sourceType as NheiExtractableSourceType,
    selfSystems: [...(selfSystems as SelfSystem[])],
    dimensions: [...(dimensions as Dimension[])],
    relativeOrder: raw.relativeOrder as number,
    timeUncertainty: raw.timeUncertainty as TimeUncertainty,
    evidenceQuality: raw.evidenceQuality as EvidenceQuality,
    relatedCandidateIds: [...(relatedCandidateIds as string[])],
  };
  return { ok: true, candidate, errors: [] };
}

export interface NheiExtractionValidationResult {
  valid: NheiExtractionCandidate[];
  invalid: NheiExtractionCandidateValidationResult[];
  abstained: NheiExtractionCandidate[]; // valid in shape, but explicitly abstained - never converted to evidence
  rejectedForBatchLimit: number;
}

// Validates a whole batch of raw model output at once. A batch larger
// than MAX_CANDIDATES_PER_BATCH is truncated, not silently accepted in
// full - an unbounded candidate count from a single call is itself a
// cost/abuse concern independent of per-candidate validity.
export function validateExtractionBatch(inputs: unknown[]): NheiExtractionValidationResult {
  const bounded = inputs.slice(0, MAX_CANDIDATES_PER_BATCH);
  const rejectedForBatchLimit = Math.max(0, inputs.length - MAX_CANDIDATES_PER_BATCH);

  const valid: NheiExtractionCandidate[] = [];
  const invalid: NheiExtractionCandidateValidationResult[] = [];
  const abstained: NheiExtractionCandidate[] = [];

  for (const input of bounded) {
    const result = validateExtractionCandidate(input);
    if (!result.ok || !result.candidate) {
      invalid.push(result);
      continue;
    }
    if (result.candidate.abstain) {
      abstained.push(result.candidate);
      continue;
    }
    valid.push(result.candidate);
  }

  return { valid, invalid, abstained, rejectedForBatchLimit };
}

// Converts one validated, non-abstained candidate into a real
// NheiEvidenceRecord - still passed back through nhei-types.ts's own
// validateEvidenceRecord (Phase 1), not trusted on the strength of this
// file's validation alone. confirmationState is unconditionally
// 'not_applicable' - never 'user_confirmed', regardless of how confident
// the model's evidenceQuality was. id is namespaced to avoid colliding
// with any evidence id from another source.
export function toNheiEvidenceRecord(candidate: NheiExtractionCandidate, batchId: string): { ok: true; record: NheiEvidenceRecord } | { ok: false; errors: string[] } {
  const input = {
    id: `extracted_${batchId}_${candidate.candidateId}`,
    sourceType: candidate.sourceType,
    reportedOrder: candidate.relativeOrder,
    timeUncertainty: candidate.timeUncertainty,
    evidenceQuality: candidate.evidenceQuality,
    confirmationState: 'not_applicable',
    selfSystems: candidate.selfSystems,
    dimensions: candidate.dimensions,
    relatedEventIds: candidate.relatedCandidateIds.map((id) => `extracted_${batchId}_${id}`),
  };
  const validation = validateEvidenceRecord(input);
  if (!validation.ok || !validation.record) return { ok: false, errors: validation.errors };
  return { ok: true, record: validation.record };
}
