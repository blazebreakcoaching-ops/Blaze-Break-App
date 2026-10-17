import { describe, it, expect } from 'vitest';
import {
  retrieveKnowledge,
  retrieveKnowledgeForTopic,
  filterApprovedOnly,
  filterByTopics,
  filterByEvidenceCategories,
  stableOrderKnowledgeEntries,
  latestVersionPerEntry,
  isApprovedKnowledgeEntry,
  DEFAULT_RETRIEVAL_LIMIT,
  MAX_RETRIEVAL_LIMIT,
} from './nhei-knowledge-retrieval-engine';
import { type NheiKnowledgeEntry } from './nhei-knowledge-types';

function entry(overrides: Partial<NheiKnowledgeEntry> = {}): NheiKnowledgeEntry {
  return {
    id: 'e1', title: 'T', educationalSummary: 'S', detailedExplanation: 'D',
    topics: ['INTERNAL_SELF'], learningObjective: 'L',
    selfSystems: [], dimensions: [], exampleScenarios: [], reflectionQuestions: [], recoveryToolReferences: [],
    evidenceCategory: 'BLAZE_BREAK_PROPRIETARY_CONCEPT', sourceReferences: [], sourcePublicationInfo: null,
    contentVersion: 1, approvalStatus: 'approved', authorId: 'author', reviewerId: 'reviewer', lastReviewedAt: '2026-01-01T00:00:00.000Z',
    safetyRestrictions: [], ageGroup: 'all_ages', perceivedReceivedSelfDistinctions: null,
    ...overrides,
  };
}

describe('filterApprovedOnly', () => {
  it('excludes draft and rejected entries', () => {
    const entries = [entry({ id: 'a', approvalStatus: 'approved' }), entry({ id: 'b', approvalStatus: 'draft' }), entry({ id: 'c', approvalStatus: 'rejected' })];
    expect(filterApprovedOnly(entries).map((e) => e.id)).toEqual(['a']);
  });
});

describe('isApprovedKnowledgeEntry', () => {
  it('is a plain status check', () => {
    expect(isApprovedKnowledgeEntry(entry({ approvalStatus: 'approved' }))).toBe(true);
    expect(isApprovedKnowledgeEntry(entry({ approvalStatus: 'draft' }))).toBe(false);
  });
});

describe('filterByTopics - multiple topic filters, OR match', () => {
  it('matches an entry carrying ANY of the requested topics', () => {
    const entries = [entry({ id: 'a', topics: ['INTERNAL_SELF'] }), entry({ id: 'b', topics: ['PHYSICAL'] }), entry({ id: 'c', topics: ['SHIP'] })];
    const result = filterByTopics(entries, ['INTERNAL_SELF', 'PHYSICAL']);
    expect(result.map((e) => e.id).sort()).toEqual(['a', 'b']);
  });

  it('returns empty for an empty topic list', () => {
    expect(filterByTopics([entry()], [])).toEqual([]);
  });
});

describe('filterByEvidenceCategories', () => {
  it('filters to only the requested categories', () => {
    const entries = [
      entry({ id: 'a', evidenceCategory: 'ESTABLISHED_SCIENCE' }),
      entry({ id: 'b', evidenceCategory: 'BLAZE_BREAK_PROPRIETARY_CONCEPT' }),
    ];
    expect(filterByEvidenceCategories(entries, ['ESTABLISHED_SCIENCE']).map((e) => e.id)).toEqual(['a']);
  });
});

describe('stableOrderKnowledgeEntries', () => {
  it('orders by id, deterministically, regardless of input order', () => {
    const entries = [entry({ id: 'c' }), entry({ id: 'a' }), entry({ id: 'b' })];
    expect(stableOrderKnowledgeEntries(entries).map((e) => e.id)).toEqual(['a', 'b', 'c']);
  });

  it('produces the same order every time for the same input', () => {
    const entries = [entry({ id: 'z' }), entry({ id: 'm' }), entry({ id: 'a' })];
    const first = stableOrderKnowledgeEntries(entries).map((e) => e.id);
    const second = stableOrderKnowledgeEntries(entries).map((e) => e.id);
    expect(first).toEqual(second);
  });
});

describe('retrieveKnowledge', () => {
  const library = [
    entry({ id: 'internal_self', topics: ['INTERNAL_SELF'], approvalStatus: 'approved' }),
    entry({ id: 'relational_self', topics: ['RELATIONAL_SELF'], approvalStatus: 'approved' }),
    entry({ id: 'draft_entry', topics: ['INTERNAL_SELF'], approvalStatus: 'draft' }),
  ];

  it('retrieves approved entries matching the requested topic', () => {
    const result = retrieveKnowledge(library, { topics: ['INTERNAL_SELF'] });
    expect(result.found).toBe(true);
    expect(result.entries.map((e) => e.id)).toEqual(['internal_self']);
  });

  it('never includes a draft entry, even if it matches the topic', () => {
    const result = retrieveKnowledge(library, { topics: ['INTERNAL_SELF'] });
    expect(result.entries.some((e) => e.id === 'draft_entry')).toBe(false);
  });

  it('supports multiple topic filters at once', () => {
    const result = retrieveKnowledge(library, { topics: ['INTERNAL_SELF', 'RELATIONAL_SELF'] });
    expect(result.entries.map((e) => e.id).sort()).toEqual(['internal_self', 'relational_self']);
  });

  it('returns an explicit no-content result (found: false) for a topic with nothing approved, never a fabricated substitute', () => {
    const result = retrieveKnowledge(library, { topics: ['SHIP'] });
    expect(result.found).toBe(false);
    expect(result.entries).toEqual([]);
  });

  it('reports invalid topic values separately from a genuine no-content result', () => {
    const result = retrieveKnowledge(library, { topics: ['NOT_REAL' as any] });
    expect(result.found).toBe(false);
    expect(result.invalidTopics).toEqual(['NOT_REAL']);
  });

  it('handles a mix of valid and invalid topics, retrieving for the valid ones and reporting the rest', () => {
    const result = retrieveKnowledge(library, { topics: ['INTERNAL_SELF', 'NOT_REAL' as any] });
    expect(result.found).toBe(true);
    expect(result.entries.map((e) => e.id)).toEqual(['internal_self']);
    expect(result.invalidTopics).toEqual(['NOT_REAL']);
  });

  it('applies the default limit and clamps an excessive limit to the max', () => {
    const many = Array.from({ length: 20 }, (_, i) => entry({ id: `e${i}`, topics: ['INTERNAL_SELF'] }));
    expect(retrieveKnowledge(many, { topics: ['INTERNAL_SELF'] }).entries).toHaveLength(DEFAULT_RETRIEVAL_LIMIT);
    expect(retrieveKnowledge(many, { topics: ['INTERNAL_SELF'], limit: 999 }).entries).toHaveLength(MAX_RETRIEVAL_LIMIT > 20 ? 20 : MAX_RETRIEVAL_LIMIT);
  });

  it('filters by evidence category when provided', () => {
    const mixed = [
      entry({ id: 'a', topics: ['PHYSICAL'], evidenceCategory: 'ESTABLISHED_SCIENCE' }),
      entry({ id: 'b', topics: ['PHYSICAL'], evidenceCategory: 'BLAZE_BREAK_PROPRIETARY_CONCEPT' }),
    ];
    const result = retrieveKnowledge(mixed, { topics: ['PHYSICAL'], evidenceCategories: ['ESTABLISHED_SCIENCE'] });
    expect(result.entries.map((e) => e.id)).toEqual(['a']);
  });

  it('handles an empty library gracefully', () => {
    const result = retrieveKnowledge([], { topics: ['INTERNAL_SELF'] });
    expect(result.found).toBe(false);
    expect(result.entries).toEqual([]);
  });
});

describe('retrieveKnowledgeForTopic', () => {
  it('is equivalent to retrieveKnowledge with a single-item topics array', () => {
    const library = [entry({ id: 'a', topics: ['SHIP'] })];
    expect(retrieveKnowledgeForTopic(library, 'SHIP').entries.map((e) => e.id)).toEqual(['a']);
  });
});

describe('latestVersionPerEntry', () => {
  it('keeps only the highest contentVersion per id', () => {
    const entries = [
      entry({ id: 'a', contentVersion: 1 }),
      entry({ id: 'a', contentVersion: 3 }),
      entry({ id: 'a', contentVersion: 2 }),
      entry({ id: 'b', contentVersion: 1 }),
    ];
    const result = latestVersionPerEntry(entries);
    expect(result.find((e) => e.id === 'a')?.contentVersion).toBe(3);
    expect(result.find((e) => e.id === 'b')?.contentVersion).toBe(1);
    expect(result).toHaveLength(2);
  });
});
