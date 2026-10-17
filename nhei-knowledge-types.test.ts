import { describe, it, expect } from 'vitest';
import {
  validateKnowledgeEntry,
  validateKnowledgeEntries,
  isValidNheiKnowledgeTopic,
  isValidNheiEvidenceCategory,
  isValidNheiKnowledgeApprovalStatus,
  isValidNheiKnowledgeSafetyRestriction,
  isValidNheiKnowledgeAgeGroup,
  R3_MEANING,
  R3_IS_EXECUTABLE_MODULE,
} from './nhei-knowledge-types';

function validDraft(overrides: Record<string, unknown> = {}) {
  return {
    id: 'entry1',
    title: 'Title',
    educationalSummary: 'Summary',
    detailedExplanation: 'Explanation',
    topics: ['INTERNAL_SELF'],
    learningObjective: 'Learn something',
    selfSystems: ['INTERNAL_SELF'],
    dimensions: [],
    exampleScenarios: ['example'],
    reflectionQuestions: ['question?'],
    recoveryToolReferences: [],
    evidenceCategory: 'BLAZE_BREAK_PROPRIETARY_CONCEPT',
    sourceReferences: [],
    sourcePublicationInfo: null,
    contentVersion: 1,
    approvalStatus: 'draft',
    authorId: 'author1',
    reviewerId: null,
    lastReviewedAt: null,
    safetyRestrictions: [],
    ageGroup: 'all_ages',
    perceivedReceivedSelfDistinctions: null,
    ...overrides,
  };
}

describe('validateKnowledgeEntry - well-formed input', () => {
  it('accepts a well-formed draft entry', () => {
    const result = validateKnowledgeEntry(validDraft());
    expect(result.ok).toBe(true);
  });

  it('accepts a well-formed approved entry with a distinct reviewer', () => {
    const result = validateKnowledgeEntry(validDraft({
      approvalStatus: 'approved', reviewerId: 'reviewer1', lastReviewedAt: '2026-01-01T00:00:00.000Z',
    }));
    expect(result.ok).toBe(true);
  });

  it('strips any unknown field rather than carrying it through', () => {
    const result = validateKnowledgeEntry(validDraft({ secretUid: 'user_abc123' }));
    expect(result.ok).toBe(true);
    expect(JSON.stringify(result.entry)).not.toContain('user_abc123');
  });
});

describe('validateKnowledgeEntry - malformed input and unsupported topics', () => {
  it('rejects a non-object', () => {
    expect(validateKnowledgeEntry(null).ok).toBe(false);
    expect(validateKnowledgeEntry('entry').ok).toBe(false);
    expect(validateKnowledgeEntry([]).ok).toBe(false);
  });

  it('rejects an unsupported topic value', () => {
    const result = validateKnowledgeEntry(validDraft({ topics: ['NOT_A_REAL_TOPIC'] }));
    expect(result.ok).toBe(false);
  });

  it('rejects an empty topics array', () => {
    const result = validateKnowledgeEntry(validDraft({ topics: [] }));
    expect(result.ok).toBe(false);
  });

  it('rejects a missing title', () => {
    const result = validateKnowledgeEntry(validDraft({ title: '' }));
    expect(result.ok).toBe(false);
  });

  it('rejects an invalid evidenceCategory', () => {
    const result = validateKnowledgeEntry(validDraft({ evidenceCategory: 'MADE_UP_CATEGORY' }));
    expect(result.ok).toBe(false);
  });

  it('rejects a non-integer or non-positive contentVersion', () => {
    expect(validateKnowledgeEntry(validDraft({ contentVersion: 0 })).ok).toBe(false);
    expect(validateKnowledgeEntry(validDraft({ contentVersion: 1.5 })).ok).toBe(false);
  });
});

describe('validateKnowledgeEntry - evidence governance', () => {
  it('rejects ESTABLISHED_SCIENCE with zero source references - no uncited scientific claims', () => {
    const result = validateKnowledgeEntry(validDraft({ evidenceCategory: 'ESTABLISHED_SCIENCE', sourceReferences: [] }));
    expect(result.ok).toBe(false);
  });

  it('accepts ESTABLISHED_SCIENCE with at least one source reference', () => {
    const result = validateKnowledgeEntry(validDraft({ evidenceCategory: 'ESTABLISHED_SCIENCE', sourceReferences: ['Some field of literature.'] }));
    expect(result.ok).toBe(true);
  });

  it('allows BLAZE_BREAK_PROPRIETARY_CONCEPT and EVIDENCE_INFORMED_PRACTICE with zero sources', () => {
    expect(validateKnowledgeEntry(validDraft({ evidenceCategory: 'BLAZE_BREAK_PROPRIETARY_CONCEPT', sourceReferences: [] })).ok).toBe(true);
    expect(validateKnowledgeEntry(validDraft({ evidenceCategory: 'EVIDENCE_INFORMED_PRACTICE', sourceReferences: [] })).ok).toBe(true);
  });
});

describe('validateKnowledgeEntry - approval requires a real, distinct review', () => {
  it('rejects an approved entry with no reviewerId', () => {
    const result = validateKnowledgeEntry(validDraft({ approvalStatus: 'approved', reviewerId: null, lastReviewedAt: '2026-01-01T00:00:00.000Z' }));
    expect(result.ok).toBe(false);
  });

  it('rejects an approved entry with no lastReviewedAt', () => {
    const result = validateKnowledgeEntry(validDraft({ approvalStatus: 'approved', reviewerId: 'reviewer1', lastReviewedAt: null }));
    expect(result.ok).toBe(false);
  });

  it('rejects an approved entry where the reviewer is the same person as the author - no self-approval', () => {
    const result = validateKnowledgeEntry(validDraft({
      approvalStatus: 'approved', authorId: 'same_person', reviewerId: 'same_person', lastReviewedAt: '2026-01-01T00:00:00.000Z',
    }));
    expect(result.ok).toBe(false);
  });

  it('a draft entry does not require a reviewer at all', () => {
    const result = validateKnowledgeEntry(validDraft({ approvalStatus: 'draft' }));
    expect(result.ok).toBe(true);
  });
});

describe('validateKnowledgeEntry - the Perceived-Received Self triad', () => {
  it('requires perceivedReceivedSelfDistinctions when PERCEIVED_RECEIVED_SELF is among the topics', () => {
    const result = validateKnowledgeEntry(validDraft({ topics: ['PERCEIVED_RECEIVED_SELF'], perceivedReceivedSelfDistinctions: null }));
    expect(result.ok).toBe(false);
  });

  it('accepts a well-formed triad', () => {
    const result = validateKnowledgeEntry(validDraft({
      topics: ['PERCEIVED_RECEIVED_SELF'],
      perceivedReceivedSelfDistinctions: {
        whatUserIntended: 'a', whatUserExpectedOtherToThink: 'b', whatOtherActuallyCommunicated: 'c',
      },
    }));
    expect(result.ok).toBe(true);
  });

  it('rejects an incomplete triad', () => {
    const result = validateKnowledgeEntry(validDraft({
      topics: ['PERCEIVED_RECEIVED_SELF'],
      perceivedReceivedSelfDistinctions: { whatUserIntended: 'a', whatUserExpectedOtherToThink: '', whatOtherActuallyCommunicated: 'c' },
    }));
    expect(result.ok).toBe(false);
  });

  it('does not require the triad for an entry without that topic', () => {
    const result = validateKnowledgeEntry(validDraft({ topics: ['INTERNAL_SELF'], perceivedReceivedSelfDistinctions: null }));
    expect(result.ok).toBe(true);
  });
});

describe('validateKnowledgeEntries - batch', () => {
  it('separates valid from invalid without one bad entry blocking the rest', () => {
    const { valid, invalid } = validateKnowledgeEntries([validDraft({ id: 'ok' }), { id: 'bad' }]);
    expect(valid).toHaveLength(1);
    expect(invalid).toHaveLength(1);
  });
});

describe('type guards', () => {
  it('reject values outside their closed sets', () => {
    expect(isValidNheiKnowledgeTopic('SHIP')).toBe(true);
    expect(isValidNheiKnowledgeTopic('not_a_topic')).toBe(false);
    expect(isValidNheiEvidenceCategory('ESTABLISHED_SCIENCE')).toBe(true);
    expect(isValidNheiEvidenceCategory('made_up')).toBe(false);
    expect(isValidNheiKnowledgeApprovalStatus('approved')).toBe(true);
    expect(isValidNheiKnowledgeApprovalStatus('pending')).toBe(false);
    expect(isValidNheiKnowledgeSafetyRestriction('not_diagnostic')).toBe(true);
    expect(isValidNheiKnowledgeSafetyRestriction('whatever')).toBe(false);
    expect(isValidNheiKnowledgeAgeGroup('all_ages')).toBe(true);
    expect(isValidNheiKnowledgeAgeGroup('minors')).toBe(false);
  });
});

describe('R3 is educational content, not an executable module', () => {
  it('states this as a fixed value, not a runtime check', () => {
    expect(R3_MEANING).toBe('Rethink, Reflect, Rejuvenate');
    expect(R3_IS_EXECUTABLE_MODULE).toBe(false);
  });
});
