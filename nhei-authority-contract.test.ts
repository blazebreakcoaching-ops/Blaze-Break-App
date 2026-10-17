// NHEI PHASE 3C-2A - SECTION 10: AUTHORITY CONTRACT TESTS

import { describe, it, expect } from 'vitest';
import {
  deriveKnowledgeReviewerIdentity,
  deriveEvidenceAuthorityGrant,
  NHEI_KNOWLEDGE_REVIEWER_ROLE,
  NHEI_EVIDENCE_AUTHORITY_ROLE,
} from './nhei-authority-contract';

describe('deriveKnowledgeReviewerIdentity', () => {
  it('derives the reviewerId from caller.uid when the correct role is present', () => {
    const result = deriveKnowledgeReviewerIdentity({ uid: 'reviewer_123', role: NHEI_KNOWLEDGE_REVIEWER_ROLE });
    expect(result.ok).toBe(true);
    expect(result.reviewerId).toBe('reviewer_123');
  });

  it('denies a caller without the specific reviewer role, even a general admin/platform_admin role', () => {
    const result = deriveKnowledgeReviewerIdentity({ uid: 'admin_1', role: 'platform_admin' });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('role_not_granted');
  });

  it('denies a caller with no role at all', () => {
    const result = deriveKnowledgeReviewerIdentity({ uid: 'u1' });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('role_not_granted');
  });

  it('denies a caller object with no uid, even if a role string happens to be present', () => {
    const result = deriveKnowledgeReviewerIdentity({ uid: '', role: NHEI_KNOWLEDGE_REVIEWER_ROLE });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('missing_uid');
  });

  it('the reviewerId is always exactly caller.uid - there is no other field this function could read it from', () => {
    const caller = { uid: 'exact_match_id', role: NHEI_KNOWLEDGE_REVIEWER_ROLE };
    const result = deriveKnowledgeReviewerIdentity(caller);
    expect(result.reviewerId).toBe(caller.uid);
  });
});

describe('deriveEvidenceAuthorityGrant', () => {
  it('mints a token only for a caller with the evidence-authority role', () => {
    const result = deriveEvidenceAuthorityGrant({ uid: 'authority_1', role: NHEI_EVIDENCE_AUTHORITY_ROLE });
    expect(result.ok).toBe(true);
    expect(result.token).toBeDefined();
    expect(result.token?.grantedBy).toContain('authority_1');
  });

  it('denies a caller with the reviewer role but not the evidence-authority role - the two are separate authorities', () => {
    const result = deriveEvidenceAuthorityGrant({ uid: 'reviewer_1', role: NHEI_KNOWLEDGE_REVIEWER_ROLE });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('role_not_granted');
    expect(result.token).toBeUndefined();
  });

  it('denies a caller with no uid', () => {
    const result = deriveEvidenceAuthorityGrant({ uid: '', role: NHEI_EVIDENCE_AUTHORITY_ROLE });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('missing_uid');
  });

  it('the grantedBy label on the minted token traces back to the verified caller uid, for audit purposes', () => {
    const result = deriveEvidenceAuthorityGrant({ uid: 'traceable_uid', role: NHEI_EVIDENCE_AUTHORITY_ROLE });
    expect(result.token?.grantedBy).toBe('nhei_evidence_authority:traceable_uid');
  });
});
