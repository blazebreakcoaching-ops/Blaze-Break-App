import { describe, it, expect } from 'vitest';
import {
  decideKnowledgeApproval,
  decideKnowledgeRejection,
  isChecklistFullyConfirmed,
  NHEI_KNOWLEDGE_REVIEW_CHECKLIST_KEYS,
  type NheiKnowledgeReviewChecklist,
} from './nhei-knowledge-governance';

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

describe('isChecklistFullyConfirmed', () => {
  it('requires every one of the 8 named concerns to be explicitly true', () => {
    expect(isChecklistFullyConfirmed(FULL_CHECKLIST)).toBe(true);
    expect(NHEI_KNOWLEDGE_REVIEW_CHECKLIST_KEYS).toHaveLength(8);
  });

  it('is false if even one concern is unconfirmed', () => {
    for (const key of NHEI_KNOWLEDGE_REVIEW_CHECKLIST_KEYS) {
      const partial = { ...FULL_CHECKLIST, [key]: false };
      expect(isChecklistFullyConfirmed(partial)).toBe(false);
    }
  });
});

describe('decideKnowledgeApproval', () => {
  it('approves a draft entry with a distinct reviewer and a fully-confirmed checklist', () => {
    const result = decideKnowledgeApproval({ authorId: 'author1', approvalStatus: 'draft' }, 'reviewer1', FULL_CHECKLIST, '2026-01-01T00:00:00.000Z');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.approvalStatus).toBe('approved');
      expect(result.reviewerId).toBe('reviewer1');
    }
  });

  it('refuses self-approval - the reviewer cannot be the author', () => {
    const result = decideKnowledgeApproval({ authorId: 'same_person', approvalStatus: 'draft' }, 'same_person', FULL_CHECKLIST, '2026-01-01T00:00:00.000Z');
    expect(result.ok).toBe(false);
    if (result.ok === false) expect(result.reason).toBe('reviewer_is_author');
  });

  it('refuses approval with an incomplete checklist, regardless of who the reviewer is', () => {
    const incomplete = { ...FULL_CHECKLIST, noMisleadingCausation: false };
    const result = decideKnowledgeApproval({ authorId: 'author1', approvalStatus: 'draft' }, 'reviewer1', incomplete, '2026-01-01T00:00:00.000Z');
    expect(result.ok).toBe(false);
    if (result.ok === false) expect(result.reason).toBe('checklist_incomplete');
  });

  it('refuses to approve an entry that is not currently in draft state', () => {
    const result = decideKnowledgeApproval({ authorId: 'author1', approvalStatus: 'approved' }, 'reviewer1', FULL_CHECKLIST, '2026-01-01T00:00:00.000Z');
    expect(result.ok).toBe(false);
    if (result.ok === false) expect(result.reason).toBe('entry_not_in_draft_state');
  });
});

describe('decideKnowledgeRejection', () => {
  it('rejects a draft entry with a distinct reviewer, without needing the checklist', () => {
    const result = decideKnowledgeRejection({ authorId: 'author1', approvalStatus: 'draft' }, 'reviewer1', '2026-01-01T00:00:00.000Z');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.approvalStatus).toBe('rejected');
  });

  it('refuses self-rejection by the author too', () => {
    const result = decideKnowledgeRejection({ authorId: 'same_person', approvalStatus: 'draft' }, 'same_person', '2026-01-01T00:00:00.000Z');
    expect(result.ok).toBe(false);
    if (result.ok === false) expect(result.reason).toBe('reviewer_is_author');
  });
});
