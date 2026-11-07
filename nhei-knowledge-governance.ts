// NHEI PHASE 3B - KNOWLEDGE CONTENT GOVERNANCE
//
// "Separate content creation from content approval." "Do not accept
// unreviewed admin submissions as production-approved educational
// content." This file is the pure logic behind that separation - the
// Firestore-backed nhei-knowledge-service.ts calls into it rather than
// re-implementing the rule inline.
//
// The review checklist below encodes section 9's required review
// concerns as real, named, individually-checkable fields - a reviewer
// must explicitly mark every one, not tick one "reviewed: true" box that
// could mean anything. approveKnowledgeEntry refuses to approve unless
// every field is explicitly true.

import { type NheiKnowledgeEntry } from './nhei-knowledge-types';

export interface NheiKnowledgeReviewChecklist {
  noUnsupportedPsychologicalClaims: boolean;
  noUnnecessaryMedicalisation: boolean;
  noMisleadingCausation: boolean;
  noUnsupportedIdentityAssumptions: boolean;
  noExcessiveEmotionalAiDependence: boolean;
  appropriateForYouthLanguageWhereRelevant: boolean;
  noUnnecessarySensitiveDataCollection: boolean;
  noCulturalOrPhilosophicalBias: boolean;
}

export const NHEI_KNOWLEDGE_REVIEW_CHECKLIST_KEYS: readonly (keyof NheiKnowledgeReviewChecklist)[] = [
  'noUnsupportedPsychologicalClaims',
  'noUnnecessaryMedicalisation',
  'noMisleadingCausation',
  'noUnsupportedIdentityAssumptions',
  'noExcessiveEmotionalAiDependence',
  'appropriateForYouthLanguageWhereRelevant',
  'noUnnecessarySensitiveDataCollection',
  'noCulturalOrPhilosophicalBias',
];

export const isChecklistFullyConfirmed = (checklist: NheiKnowledgeReviewChecklist): boolean =>
  NHEI_KNOWLEDGE_REVIEW_CHECKLIST_KEYS.every((key) => checklist[key] === true);

export type KnowledgeApprovalBlockedReason =
  | 'reviewer_is_author'
  | 'checklist_incomplete'
  | 'entry_not_in_draft_state';

export type KnowledgeApprovalResult =
  | { ok: true; approvalStatus: 'approved'; reviewerId: string; lastReviewedAt: string }
  | { ok: false; reason: KnowledgeApprovalBlockedReason };

// Pure decision function - "entry" is whatever the service layer already
// fetched; this function performs no I/O and does not mutate its input.
// The caller (nhei-knowledge-service.ts) applies the resulting patch.
export function decideKnowledgeApproval(
  entry: Pick<NheiKnowledgeEntry, 'authorId' | 'approvalStatus'>,
  reviewerId: string,
  checklist: NheiKnowledgeReviewChecklist,
  nowIso: string,
): KnowledgeApprovalResult {
  if (entry.approvalStatus !== 'draft') {
    return { ok: false, reason: 'entry_not_in_draft_state' };
  }
  if (reviewerId === entry.authorId) {
    return { ok: false, reason: 'reviewer_is_author' };
  }
  if (!isChecklistFullyConfirmed(checklist)) {
    return { ok: false, reason: 'checklist_incomplete' };
  }
  return { ok: true, approvalStatus: 'approved', reviewerId, lastReviewedAt: nowIso };
}

export type KnowledgeRejectionResult =
  | { ok: true; approvalStatus: 'rejected'; reviewerId: string; lastReviewedAt: string }
  | { ok: false; reason: 'reviewer_is_author' | 'entry_not_in_draft_state' };

// Rejection deliberately does NOT require the checklist - you don't need
// to confirm something is safe in order to say no to it.
export function decideKnowledgeRejection(
  entry: Pick<NheiKnowledgeEntry, 'authorId' | 'approvalStatus'>,
  reviewerId: string,
  nowIso: string,
): KnowledgeRejectionResult {
  if (entry.approvalStatus !== 'draft') return { ok: false, reason: 'entry_not_in_draft_state' };
  if (reviewerId === entry.authorId) return { ok: false, reason: 'reviewer_is_author' };
  return { ok: true, approvalStatus: 'rejected', reviewerId, lastReviewedAt: nowIso };
}
