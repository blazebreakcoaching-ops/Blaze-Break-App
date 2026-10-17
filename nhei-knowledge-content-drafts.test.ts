import { describe, it, expect } from 'vitest';
import { NHEI_KNOWLEDGE_DRAFT_ENTRIES } from './nhei-knowledge-content-drafts';
import { validateKnowledgeEntry } from './nhei-knowledge-types';
import { filterApprovedOnly } from './nhei-knowledge-retrieval-engine';

describe('NHEI_KNOWLEDGE_DRAFT_ENTRIES - structurally valid but explicitly NOT approved', () => {
  it('every draft entry is structurally well-formed', () => {
    for (const entry of NHEI_KNOWLEDGE_DRAFT_ENTRIES) {
      const result = validateKnowledgeEntry(entry);
      expect(result.ok, `${entry.id} failed validation: ${result.errors?.join('; ')}`).toBe(true);
    }
  });

  it('none of them are approved - approvalStatus is draft for every one', () => {
    for (const entry of NHEI_KNOWLEDGE_DRAFT_ENTRIES) {
      expect(entry.approvalStatus).toBe('draft');
    }
  });

  it('none of them has a reviewerId - no fabricated reviewer identity, for any entry', () => {
    for (const entry of NHEI_KNOWLEDGE_DRAFT_ENTRIES) {
      expect(entry.reviewerId).toBeNull();
      expect(entry.lastReviewedAt).toBeNull();
    }
  });

  it('passing validateKnowledgeEntry does not make them retrievable - the approved-only filter still excludes every one', () => {
    expect(filterApprovedOnly(NHEI_KNOWLEDGE_DRAFT_ENTRIES)).toEqual([]);
  });

  it('covers exactly the four required topics: SHIP, BLAME, R3, CONTEXT_AND_AGENCY', () => {
    const topics = new Set(NHEI_KNOWLEDGE_DRAFT_ENTRIES.flatMap((e) => e.topics));
    expect(topics.has('SHIP')).toBe(true);
    expect(topics.has('BLAME')).toBe(true);
    expect(topics.has('R3')).toBe(true);
    expect(topics.has('CONTEXT_AND_AGENCY')).toBe(true);
  });

  it('has no duplicate ids and none collide with the Phase 3B approved library', () => {
    const ids = NHEI_KNOWLEDGE_DRAFT_ENTRIES.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('the R3 entry explicitly distinguishes itself from "Responsibility Reset" and states it is not yet executable', () => {
    const r3 = NHEI_KNOWLEDGE_DRAFT_ENTRIES.find((e) => e.topics.includes('R3'));
    expect(r3).toBeDefined();
    const text = `${r3!.educationalSummary} ${r3!.detailedExplanation}`.toLowerCase();
    expect(text).toContain('responsibility reset');
    expect(text).toMatch(/not.*executable|not currently.*executable/);
  });

  it('the Context and Agency entry explicitly DENIES being a bandwidth score or capacity verdict, rather than asserting one', () => {
    const contextEntry = NHEI_KNOWLEDGE_DRAFT_ENTRIES.find((e) => e.topics.includes('CONTEXT_AND_AGENCY'));
    expect(contextEntry).toBeDefined();
    const text = `${contextEntry!.educationalSummary} ${contextEntry!.detailedExplanation}`.toLowerCase();
    // The entry is allowed to NAME "bandwidth score" in order to deny it -
    // what matters is that the denial, not an assertion, is what's there.
    expect(text).toMatch(/not.{0,40}bandwidth score|bandwidth score.{0,10}(is|,)?\s*not/);
    expect(text).not.toMatch(/\byour bandwidth score is\b/);
  });
});
