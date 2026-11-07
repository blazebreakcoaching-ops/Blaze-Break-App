// NHEI PHASE 3C-2A - SECTION 4: AGE-APPROPRIATE KNOWLEDGE ENFORCEMENT TESTS
//
// Covers exactly the six cases the phase instruction names: adult
// eligibility, youth eligibility, unknown age, missing metadata, invalid
// age-group values, and mixed eligible/ineligible results. The core
// guarantee under test throughout: an unknown, missing, or invalid age
// input NEVER resolves to anything more permissive than a known youth
// viewer - there is no code path from "I don't know this viewer's age" to
// "treat them as an adult."

import { describe, it, expect } from 'vitest';
import {
  isValidNheiAgeBand,
  normalizeAgeBand,
  isAgeEligibleKnowledgeEntry,
  filterByAgeEligibility,
  retrieveKnowledge,
} from './nhei-knowledge-retrieval-engine';
import { type NheiKnowledgeEntry, type NheiKnowledgeAgeGroup } from './nhei-knowledge-types';

function entry(ageGroup: NheiKnowledgeAgeGroup, id: string = ageGroup): NheiKnowledgeEntry {
  return {
    id, title: 'T', educationalSummary: 'S', detailedExplanation: 'D',
    topics: ['INTERNAL_SELF'], learningObjective: 'L',
    selfSystems: [], dimensions: [], exampleScenarios: [], reflectionQuestions: [], recoveryToolReferences: [],
    evidenceCategory: 'BLAZE_BREAK_PROPRIETARY_CONCEPT', sourceReferences: [], sourcePublicationInfo: null,
    contentVersion: 1, approvalStatus: 'approved', authorId: 'author', reviewerId: 'reviewer', lastReviewedAt: '2026-01-01T00:00:00.000Z',
    safetyRestrictions: [], ageGroup, perceivedReceivedSelfDistinctions: null,
  };
}

const ALL_AGES = entry('all_ages');
const ADULT_ONLY = entry('adult_only');
const NOT_RECOMMENDED_FOR_YOUTH = entry('not_recommended_for_youth');
const MIXED_LIBRARY = [ALL_AGES, ADULT_ONLY, NOT_RECOMMENDED_FOR_YOUTH];

describe('isValidNheiAgeBand / normalizeAgeBand', () => {
  it('accepts exactly adult/youth/unknown', () => {
    expect(isValidNheiAgeBand('adult')).toBe(true);
    expect(isValidNheiAgeBand('youth')).toBe(true);
    expect(isValidNheiAgeBand('unknown')).toBe(true);
  });

  it('normalises undefined (missing metadata) to unknown, never to adult', () => {
    expect(normalizeAgeBand(undefined)).toBe('unknown');
  });

  it('normalises an invalid/garbage age-group-shaped value to unknown, never to adult', () => {
    expect(normalizeAgeBand('super_adult')).toBe('unknown');
    expect(normalizeAgeBand(42)).toBe('unknown');
    expect(normalizeAgeBand({ age: 30 })).toBe('unknown');
    expect(normalizeAgeBand(null)).toBe('unknown');
  });
});

describe('Adult eligibility', () => {
  it('an adult viewer is eligible for all three ageGroup values', () => {
    expect(isAgeEligibleKnowledgeEntry(ALL_AGES, 'adult')).toBe(true);
    expect(isAgeEligibleKnowledgeEntry(ADULT_ONLY, 'adult')).toBe(true);
    expect(isAgeEligibleKnowledgeEntry(NOT_RECOMMENDED_FOR_YOUTH, 'adult')).toBe(true);
    expect(filterByAgeEligibility(MIXED_LIBRARY, 'adult').map((e) => e.id).sort()).toEqual(
      ['adult_only', 'all_ages', 'not_recommended_for_youth'],
    );
  });
});

describe('Youth eligibility', () => {
  it('a youth viewer is eligible ONLY for all_ages content', () => {
    expect(isAgeEligibleKnowledgeEntry(ALL_AGES, 'youth')).toBe(true);
    expect(isAgeEligibleKnowledgeEntry(ADULT_ONLY, 'youth')).toBe(false);
    expect(isAgeEligibleKnowledgeEntry(NOT_RECOMMENDED_FOR_YOUTH, 'youth')).toBe(false);
    expect(filterByAgeEligibility(MIXED_LIBRARY, 'youth').map((e) => e.id)).toEqual(['all_ages']);
  });
});

describe('Unknown age', () => {
  it('an unknown-band viewer gets exactly the same restriction as youth, never adult eligibility', () => {
    expect(filterByAgeEligibility(MIXED_LIBRARY, 'unknown')).toEqual(filterByAgeEligibility(MIXED_LIBRARY, 'youth'));
    expect(filterByAgeEligibility(MIXED_LIBRARY, 'unknown').map((e) => e.id)).toEqual(['all_ages']);
  });
});

describe('Missing metadata', () => {
  it('retrieveKnowledge with no ageBand field at all restricts to all_ages only - omission is not a bypass', () => {
    const result = retrieveKnowledge(MIXED_LIBRARY, { topics: ['INTERNAL_SELF'] });
    expect(result.entries.map((e) => e.id)).toEqual(['all_ages']);
  });
});

describe('Invalid age-group values', () => {
  it('retrieveKnowledge with a garbage ageBand value restricts to all_ages only, same as missing', () => {
    const result = retrieveKnowledge(MIXED_LIBRARY, { topics: ['INTERNAL_SELF'], ageBand: 'grownup-ish' });
    expect(result.entries.map((e) => e.id)).toEqual(['all_ages']);
  });
});

describe('Mixed eligible and ineligible results', () => {
  it('an adult query against a mixed-ageGroup, mixed-topic library returns only the topic-AND-age-eligible subset', () => {
    const library: NheiKnowledgeEntry[] = [
      { ...entry('all_ages', 'a_physical'), topics: ['PHYSICAL'] },
      { ...entry('adult_only', 'b_physical'), topics: ['PHYSICAL'] },
      { ...entry('all_ages', 'c_other'), topics: ['SHIP'] },
    ];
    const adultResult = retrieveKnowledge(library, { topics: ['PHYSICAL'], ageBand: 'adult' });
    expect(adultResult.entries.map((e) => e.id).sort()).toEqual(['a_physical', 'b_physical']);

    const youthResult = retrieveKnowledge(library, { topics: ['PHYSICAL'], ageBand: 'youth' });
    expect(youthResult.entries.map((e) => e.id)).toEqual(['a_physical']);
  });

  it('age eligibility is applied together with, not instead of, approval-status and topic filtering', () => {
    const library = [
      entry('adult_only', 'draft_adult'),
      { ...entry('adult_only', 'draft_adult_2'), approvalStatus: 'draft' as const },
    ];
    // Even as an adult, a draft entry must never be retrievable.
    const result = retrieveKnowledge(library, { topics: ['INTERNAL_SELF'], ageBand: 'adult' });
    expect(result.entries.map((e) => e.id)).toEqual(['draft_adult']);
  });
});
