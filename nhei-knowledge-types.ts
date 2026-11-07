// NHEI PHASE 3B - KNOWLEDGE & EDUCATION ENGINE: SHARED TYPES
//
// Educational reference content ABOUT the NHEI framework (Trifecta, Four
// Dimensions, Temporal/Adaptive/Context concepts, SHIP/BLAME/R3) - never
// about any individual user. Nothing in this file (or any other Phase 3B
// file) has a uid field, a user identifier, or any way to attach a
// knowledge entry to a specific person. This is shared platform content,
// not personal data - NHEI's consent-purpose gating (nhei-consent.ts)
// does not apply to it at all, and that is a deliberate distinction, not
// an oversight: see the Phase 3B delivery report.
//
// Why this is a NEW collection, not an extension of the existing
// app_config/knowledge_chunks: that path is a SINGLE Firestore document
// (collection "app_config", doc id "knowledge_chunks") holding one
// `chunks` array field - confirmed by reading the real write path
// (server.ts's POST /api/admin/knowledge-chunks) and its test directly,
// not assumed from the name. Firestore's array-contains/where query
// operators filter across documents in a COLLECTION; they cannot filter
// within a single document's array field at all - that would just be a
// full-document fetch followed by plain JS array filtering, with no real
// query capability (no topic index, no approval-status filter, no
// pagination). It also has no schema today (`{id, text}`, nothing else)
// and zero read consumers anywhere in this codebase - it is pure
// write-only admin scaffolding for a feature that was apparently never
// finished being wired up. Reusing it for NHEI's much richer, heavily-
// governed contract would mean redefining someone else's (unused)
// collection's shape rather than genuinely reusing it. This file's
// `nhei_knowledge_entries` is a real Firestore COLLECTION (one document
// per entry), which is what actually makes topic-based queries,
// evidence-category filtering, and approval-status filtering possible
// server-side. Nothing about app_config/knowledge_chunks is touched,
// read, or depended on by any Phase 3B file.

import { type SelfSystem, type Dimension, isValidSelfSystem, isValidDimension } from './nhei-types';

// ---- Taxonomy ------------------------------------------------------------

export type NheiKnowledgeTopic =
  | 'INTERNAL_SELF'
  | 'RELATIONAL_SELF'
  | 'PERCEIVED_RECEIVED_SELF'
  | 'METAPHYSICAL'
  | 'PHYSICAL'
  | 'MENTAL'
  | 'EMOTIONAL'
  | 'TEMPORAL_SELF_INTERACTION'
  | 'ADAPTIVE_BEHAVIOUR'
  | 'CONTEXT_AND_AGENCY'
  | 'SHIP'
  | 'BLAME'
  | 'R3';

export const NHEI_KNOWLEDGE_TOPICS: readonly NheiKnowledgeTopic[] = [
  'INTERNAL_SELF', 'RELATIONAL_SELF', 'PERCEIVED_RECEIVED_SELF',
  'METAPHYSICAL', 'PHYSICAL', 'MENTAL', 'EMOTIONAL',
  'TEMPORAL_SELF_INTERACTION', 'ADAPTIVE_BEHAVIOUR', 'CONTEXT_AND_AGENCY',
  'SHIP', 'BLAME', 'R3',
];

export const isValidNheiKnowledgeTopic = (value: unknown): value is NheiKnowledgeTopic =>
  typeof value === 'string' && (NHEI_KNOWLEDGE_TOPICS as readonly string[]).includes(value);

// R3 = Rethink, Reflect, Rejuvenate - planned EDUCATIONAL content, not an
// executable module anywhere in this codebase (confirmed again this
// phase - still true). Deliberately distinct from "Responsibility Reset"
// (an unrelated, real, already-shipped feature elsewhere in the app) -
// this constant exists so nothing in this file's own content or tests
// can conflate the two by name.
export const R3_MEANING = 'Rethink, Reflect, Rejuvenate' as const;
export const R3_IS_EXECUTABLE_MODULE = false as const;

// ---- Evidence governance -------------------------------------------------

export type NheiEvidenceCategory =
  | 'ESTABLISHED_SCIENCE'
  | 'EVIDENCE_INFORMED_PRACTICE'
  | 'BLAZE_BREAK_PROPRIETARY_CONCEPT';

export const NHEI_EVIDENCE_CATEGORIES: readonly NheiEvidenceCategory[] = [
  'ESTABLISHED_SCIENCE', 'EVIDENCE_INFORMED_PRACTICE', 'BLAZE_BREAK_PROPRIETARY_CONCEPT',
];

export const isValidNheiEvidenceCategory = (value: unknown): value is NheiEvidenceCategory =>
  typeof value === 'string' && (NHEI_EVIDENCE_CATEGORIES as readonly string[]).includes(value);

export type NheiKnowledgeApprovalStatus = 'draft' | 'approved' | 'rejected';
export const NHEI_KNOWLEDGE_APPROVAL_STATUSES: readonly NheiKnowledgeApprovalStatus[] = ['draft', 'approved', 'rejected'];
export const isValidNheiKnowledgeApprovalStatus = (value: unknown): value is NheiKnowledgeApprovalStatus =>
  typeof value === 'string' && (NHEI_KNOWLEDGE_APPROVAL_STATUSES as readonly string[]).includes(value);

// A closed, named set rather than free text - "applicable safety
// restrictions" as real, checkable tags a future safeguarding review can
// enumerate and audit, not prose a reviewer has to re-read every time.
export type NheiKnowledgeSafetyRestriction =
  | 'never_assert_unreported_third_party_beliefs'
  | 'not_for_crisis_context'
  | 'not_diagnostic'
  | 'not_a_substitute_for_professional_care';

export const NHEI_KNOWLEDGE_SAFETY_RESTRICTIONS: readonly NheiKnowledgeSafetyRestriction[] = [
  'never_assert_unreported_third_party_beliefs',
  'not_for_crisis_context',
  'not_diagnostic',
  'not_a_substitute_for_professional_care',
];
export const isValidNheiKnowledgeSafetyRestriction = (value: unknown): value is NheiKnowledgeSafetyRestriction =>
  typeof value === 'string' && (NHEI_KNOWLEDGE_SAFETY_RESTRICTIONS as readonly string[]).includes(value);

export type NheiKnowledgeAgeGroup = 'all_ages' | 'adult_only' | 'not_recommended_for_youth';
export const NHEI_KNOWLEDGE_AGE_GROUPS: readonly NheiKnowledgeAgeGroup[] = ['all_ages', 'adult_only', 'not_recommended_for_youth'];
export const isValidNheiKnowledgeAgeGroup = (value: unknown): value is NheiKnowledgeAgeGroup =>
  typeof value === 'string' && (NHEI_KNOWLEDGE_AGE_GROUPS as readonly string[]).includes(value);

// ---- The Perceived-Received Self's mandatory triad -----------------------
//
// Section 6's explicit requirement: Nova must distinguish what the user
// intended, what the user expected another person to think, and what
// that other person actually said or communicated. Made structural
// (a required, typed field whenever an entry carries this topic) rather
// than relying on prose containing the right words - the same choice
// Phase 1 made for its own structural guarantees.
export interface NheiPerceivedReceivedSelfDistinctions {
  whatUserIntended: string;
  whatUserExpectedOtherToThink: string;
  whatOtherActuallyCommunicated: string;
}

// ---- The knowledge entry contract ----------------------------------------

export interface NheiKnowledgeEntry {
  id: string;
  title: string;
  educationalSummary: string;
  detailedExplanation: string;
  topics: NheiKnowledgeTopic[];
  learningObjective: string;
  selfSystems: SelfSystem[]; // may be empty - not every topic maps to a self-system (e.g. SHIP/BLAME/R3)
  dimensions: Dimension[]; // may be empty, same reasoning
  exampleScenarios: string[];
  reflectionQuestions: string[];
  recoveryToolReferences: string[]; // plain labels only (e.g. "BLAME Reset") - never a functional link/deeplink
  evidenceCategory: NheiEvidenceCategory;
  sourceReferences: string[]; // citations; required (>=1) when evidenceCategory is ESTABLISHED_SCIENCE
  sourcePublicationInfo: string | null;
  contentVersion: number;
  approvalStatus: NheiKnowledgeApprovalStatus;
  authorId: string; // who created/last-edited this draft - needed to enforce "a reviewer cannot approve their own content"
  reviewerId: string | null; // set only once approved/rejected
  lastReviewedAt: string | null; // ISO 8601, set only once reviewed
  safetyRestrictions: NheiKnowledgeSafetyRestriction[];
  ageGroup: NheiKnowledgeAgeGroup;
  // Required (and only meaningful) when 'PERCEIVED_RECEIVED_SELF' is among
  // this entry's topics - see the type comment above.
  perceivedReceivedSelfDistinctions: NheiPerceivedReceivedSelfDistinctions | null;
}

export interface NheiKnowledgeValidationResult {
  ok: boolean;
  entry?: NheiKnowledgeEntry;
  errors: string[];
}

const MAX_SHORT = 200;
const MAX_LONG = 4000;
const MAX_LIST_ITEMS = 20;

const isStringArray = (v: unknown, maxLen = MAX_LONG): v is string[] =>
  Array.isArray(v) && v.length <= MAX_LIST_ITEMS && v.every((s) => typeof s === 'string' && s.length <= maxLen);

const isNonEmptyShortString = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0 && v.length <= MAX_SHORT;
const isNonEmptyLongString = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0 && v.length <= MAX_LONG;

// Strict, allow-list validation/normalisation - the same shape of
// guarantee as nhei-types.ts's validateEvidenceRecord: unknown fields
// (including anything that looks like a uid or personal-data field a
// careless caller attaches) are rejected from the normalised record
// rather than carried through. "Reject malformed records and unsupported
// topic values" is enforced here, not left to the caller.
export function validateKnowledgeEntry(input: unknown): NheiKnowledgeValidationResult {
  const errors: string[] = [];
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return { ok: false, errors: ['entry must be a non-null object'] };
  }
  const raw = input as Record<string, unknown>;

  if (typeof raw.id !== 'string' || raw.id.length === 0 || raw.id.length > MAX_SHORT) errors.push('id must be a non-empty string');
  if (!isNonEmptyShortString(raw.title)) errors.push('title must be a non-empty string (max 200 chars)');
  if (!isNonEmptyLongString(raw.educationalSummary)) errors.push('educationalSummary must be a non-empty string');
  if (!isNonEmptyLongString(raw.detailedExplanation)) errors.push('detailedExplanation must be a non-empty string');

  const topics = Array.isArray(raw.topics) ? raw.topics : undefined;
  if (!topics || topics.length === 0 || !topics.every(isValidNheiKnowledgeTopic)) {
    errors.push('topics must be a non-empty array of valid NheiKnowledgeTopic values');
  }

  if (!isNonEmptyLongString(raw.learningObjective)) errors.push('learningObjective must be a non-empty string');

  const selfSystems = Array.isArray(raw.selfSystems) ? raw.selfSystems : undefined;
  if (selfSystems === undefined || !selfSystems.every(isValidSelfSystem)) {
    errors.push('selfSystems must be an array of valid SelfSystem values (may be empty)');
  }
  const dimensions = Array.isArray(raw.dimensions) ? raw.dimensions : undefined;
  if (dimensions === undefined || !dimensions.every(isValidDimension)) {
    errors.push('dimensions must be an array of valid Dimension values (may be empty)');
  }

  if (!isStringArray(raw.exampleScenarios)) errors.push('exampleScenarios must be an array of strings');
  if (!isStringArray(raw.reflectionQuestions)) errors.push('reflectionQuestions must be an array of strings');
  if (!isStringArray(raw.recoveryToolReferences)) errors.push('recoveryToolReferences must be an array of strings');

  const evidenceCategory = raw.evidenceCategory;
  if (!isValidNheiEvidenceCategory(evidenceCategory)) errors.push('evidenceCategory must be a valid NheiEvidenceCategory');

  const sourceReferences = Array.isArray(raw.sourceReferences) ? raw.sourceReferences : undefined;
  if (!sourceReferences || !isStringArray(sourceReferences)) {
    errors.push('sourceReferences must be an array of strings (may be empty)');
  } else if (evidenceCategory === 'ESTABLISHED_SCIENCE' && sourceReferences.length === 0) {
    // "Do not fabricate sources... Preserve source attribution" - the
    // inverse guarantee: a claim CANNOT be labelled established science
    // with zero citations backing it. No source, no claim to that
    // category - fall back to a weaker, honest evidence category instead.
    errors.push('an ESTABLISHED_SCIENCE entry must cite at least one sourceReference');
  }

  if (raw.sourcePublicationInfo !== null && typeof raw.sourcePublicationInfo !== 'string') {
    errors.push('sourcePublicationInfo must be a string or null');
  }

  if (typeof raw.contentVersion !== 'number' || raw.contentVersion < 1 || !Number.isInteger(raw.contentVersion)) {
    errors.push('contentVersion must be a positive integer');
  }

  const approvalStatus = raw.approvalStatus;
  if (!isValidNheiKnowledgeApprovalStatus(approvalStatus)) errors.push('approvalStatus must be a valid NheiKnowledgeApprovalStatus');

  if (typeof raw.authorId !== 'string' || raw.authorId.length === 0) errors.push('authorId must be a non-empty string');

  if (raw.reviewerId !== null && (typeof raw.reviewerId !== 'string' || raw.reviewerId.length === 0)) {
    errors.push('reviewerId must be a non-empty string or null');
  }
  if (raw.lastReviewedAt !== null) {
    if (typeof raw.lastReviewedAt !== 'string' || Number.isNaN(Date.parse(raw.lastReviewedAt))) {
      errors.push('lastReviewedAt must be a valid ISO 8601 string or null');
    }
  }
  // An approved/rejected entry must have actually been reviewed - this is
  // what makes "only approved entries may enter retrieval results" mean
  // something more than a label a caller could set without ever engaging
  // the review step.
  if ((approvalStatus === 'approved' || approvalStatus === 'rejected')) {
    if (raw.reviewerId === null) errors.push('an approved or rejected entry must have a non-null reviewerId');
    if (raw.lastReviewedAt === null) errors.push('an approved or rejected entry must have a non-null lastReviewedAt');
    if (typeof raw.reviewerId === 'string' && raw.reviewerId === raw.authorId) {
      errors.push('reviewerId must not be the same as authorId - content creation and approval must be separate');
    }
  }

  const safetyRestrictions = Array.isArray(raw.safetyRestrictions) ? raw.safetyRestrictions : undefined;
  if (!safetyRestrictions || !safetyRestrictions.every(isValidNheiKnowledgeSafetyRestriction)) {
    errors.push('safetyRestrictions must be an array of valid NheiKnowledgeSafetyRestriction values (may be empty)');
  }

  if (!isValidNheiKnowledgeAgeGroup(raw.ageGroup)) errors.push('ageGroup must be a valid NheiKnowledgeAgeGroup');

  let perceivedReceivedSelfDistinctions: NheiPerceivedReceivedSelfDistinctions | null = null;
  const topicsIncludePRS = Array.isArray(topics) && topics.includes('PERCEIVED_RECEIVED_SELF');
  if (raw.perceivedReceivedSelfDistinctions !== null && raw.perceivedReceivedSelfDistinctions !== undefined) {
    const d = raw.perceivedReceivedSelfDistinctions as Record<string, unknown>;
    if (
      typeof d !== 'object' ||
      !isNonEmptyLongString(d.whatUserIntended) ||
      !isNonEmptyLongString(d.whatUserExpectedOtherToThink) ||
      !isNonEmptyLongString(d.whatOtherActuallyCommunicated)
    ) {
      errors.push('perceivedReceivedSelfDistinctions, when present, must have all three non-empty string fields');
    } else {
      perceivedReceivedSelfDistinctions = {
        whatUserIntended: d.whatUserIntended,
        whatUserExpectedOtherToThink: d.whatUserExpectedOtherToThink,
        whatOtherActuallyCommunicated: d.whatOtherActuallyCommunicated,
      };
    }
  } else if (topicsIncludePRS) {
    errors.push('an entry tagged PERCEIVED_RECEIVED_SELF must include perceivedReceivedSelfDistinctions');
  }

  if (errors.length > 0) return { ok: false, errors };

  const entry: NheiKnowledgeEntry = {
    id: raw.id as string,
    title: raw.title as string,
    educationalSummary: raw.educationalSummary as string,
    detailedExplanation: raw.detailedExplanation as string,
    topics: [...(topics as NheiKnowledgeTopic[])],
    learningObjective: raw.learningObjective as string,
    selfSystems: [...(selfSystems as SelfSystem[])],
    dimensions: [...(dimensions as Dimension[])],
    exampleScenarios: [...(raw.exampleScenarios as string[])],
    reflectionQuestions: [...(raw.reflectionQuestions as string[])],
    recoveryToolReferences: [...(raw.recoveryToolReferences as string[])],
    evidenceCategory: evidenceCategory as NheiEvidenceCategory,
    sourceReferences: [...(sourceReferences as string[])],
    sourcePublicationInfo: (raw.sourcePublicationInfo as string | null) ?? null,
    contentVersion: raw.contentVersion as number,
    approvalStatus: approvalStatus as NheiKnowledgeApprovalStatus,
    authorId: raw.authorId as string,
    reviewerId: (raw.reviewerId as string | null) ?? null,
    lastReviewedAt: (raw.lastReviewedAt as string | null) ?? null,
    safetyRestrictions: [...(safetyRestrictions as NheiKnowledgeSafetyRestriction[])],
    ageGroup: raw.ageGroup as NheiKnowledgeAgeGroup,
    perceivedReceivedSelfDistinctions,
  };
  return { ok: true, entry, errors: [] };
}

export function validateKnowledgeEntries(inputs: unknown[]): { valid: NheiKnowledgeEntry[]; invalid: NheiKnowledgeValidationResult[] } {
  const valid: NheiKnowledgeEntry[] = [];
  const invalid: NheiKnowledgeValidationResult[] = [];
  for (const input of inputs) {
    const result = validateKnowledgeEntry(input);
    if (result.ok && result.entry) valid.push(result.entry);
    else invalid.push(result);
  }
  return { valid, invalid };
}
