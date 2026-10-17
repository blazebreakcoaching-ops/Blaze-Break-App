import { describe, it, expect } from 'vitest';
import { NHEI_KNOWLEDGE_CONTENT_LIBRARY } from './nhei-knowledge-content-library';
import { validateKnowledgeEntry } from './nhei-knowledge-types';

describe('NHEI_KNOWLEDGE_CONTENT_LIBRARY - structural integrity', () => {
  it('every entry passes the real validator unchanged', () => {
    for (const entry of NHEI_KNOWLEDGE_CONTENT_LIBRARY) {
      const result = validateKnowledgeEntry(entry);
      expect(result.ok, `${entry.id} failed validation: ${result.errors?.join('; ')}`).toBe(true);
    }
  });

  it('Phase 3C-2B section 5: every entry is now a draft, pending real independent review - none carries a reviewer identity', () => {
    for (const entry of NHEI_KNOWLEDGE_CONTENT_LIBRARY) {
      expect(entry.approvalStatus).toBe('draft');
      expect(entry.reviewerId).toBeNull();
      expect(entry.lastReviewedAt).toBeNull();
    }
  });

  it('has no duplicate ids', () => {
    const ids = NHEI_KNOWLEDGE_CONTENT_LIBRARY.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('covers all three Trifecta self-systems and all four Dimensions, per section 6', () => {
    const topics = new Set(NHEI_KNOWLEDGE_CONTENT_LIBRARY.flatMap((e) => e.topics));
    for (const required of ['INTERNAL_SELF', 'RELATIONAL_SELF', 'PERCEIVED_RECEIVED_SELF', 'METAPHYSICAL', 'PHYSICAL', 'MENTAL', 'EMOTIONAL']) {
      expect(topics.has(required as any)).toBe(true);
    }
  });

  it('never tags a Trifecta entry as ESTABLISHED_SCIENCE - the Trifecta is not a validated diagnostic model', () => {
    const trifectaEntries = NHEI_KNOWLEDGE_CONTENT_LIBRARY.filter((e) =>
      e.topics.some((t) => t === 'INTERNAL_SELF' || t === 'RELATIONAL_SELF' || t === 'PERCEIVED_RECEIVED_SELF'));
    expect(trifectaEntries.length).toBeGreaterThan(0);
    for (const entry of trifectaEntries) {
      expect(entry.evidenceCategory).toBe('BLAZE_BREAK_PROPRIETARY_CONCEPT');
    }
  });

  it('the Perceived-Received Self entry carries the mandatory triad and never claims to know another person\'s unreported beliefs', () => {
    const prs = NHEI_KNOWLEDGE_CONTENT_LIBRARY.find((e) => e.topics.includes('PERCEIVED_RECEIVED_SELF'));
    expect(prs).toBeDefined();
    expect(prs!.perceivedReceivedSelfDistinctions).not.toBeNull();
    expect(prs!.safetyRestrictions).toContain('never_assert_unreported_third_party_beliefs');
  });

  it('no entry fabricates a specific citation - ESTABLISHED_SCIENCE is never used without being able to name a real source, and this library avoids the category entirely rather than risk one', () => {
    const establishedScience = NHEI_KNOWLEDGE_CONTENT_LIBRARY.filter((e) => e.evidenceCategory === 'ESTABLISHED_SCIENCE');
    expect(establishedScience).toEqual([]);
  });
});
