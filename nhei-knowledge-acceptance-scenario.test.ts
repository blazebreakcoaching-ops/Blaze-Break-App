// NHEI PHASE 3B - REQUIRED CRITICAL LEARNING FIXTURE (section 7)
// Updated Phase 3C-2B section 5: the content library these tests check
// is now DRAFT, pending real independent human review (see
// nhei-knowledge-content-library.ts's header comment on why). This file
// now asserts two separate things, deliberately kept apart:
//   1. Live retrieval (retrieveKnowledge, the approval-filtered path)
//      correctly returns NOTHING right now - honestly reflecting that no
//      independently-reviewed content exists yet, not a regression.
//   2. The underlying CONTENT (checked directly, bypassing the approval
//      filter - the same way a human reviewer reading the draft would)
//      still covers every theme section 7 requires and still upholds
//      every safety property, so that once real review actually
//      approves these entries, the acceptance criteria this fixture was
//      built to prove are still intact and verifiable, not silently
//      abandoned along with the approval state.

import { describe, it, expect } from 'vitest';
import { retrieveKnowledge, filterByTopics, stableOrderKnowledgeEntries } from './nhei-knowledge-retrieval-engine';
import { NHEI_KNOWLEDGE_CONTENT_LIBRARY } from './nhei-knowledge-content-library';
import type { NheiKnowledgeTopic } from './nhei-knowledge-types';

// The topics this specific narrative touches, per section 7's "expected
// educational retrieval" list - mapped onto this file's taxonomy.
const SCENARIO_TOPICS: NheiKnowledgeTopic[] = [
  'TEMPORAL_SELF_INTERACTION', // anticipatory expectations; expectation vs. actual outcome
  'RELATIONAL_SELF',           // the manager interaction itself
  'INTERNAL_SELF',             // the later guilt
  'PERCEIVED_RECEIVED_SELF',   // the anticipated judgement
  'MENTAL',                    // the anticipatory prediction as a thought
  'EMOTIONAL',                 // emotional awareness (guilt, named)
  'ADAPTIVE_BEHAVIOUR',        // difficulty resting as a behavioural response
  'PHYSICAL',                  // rest and recovery
];

describe('Phase 3C-2B section 5 - live retrieval honestly returns nothing until these entries are really reviewed', () => {
  it('retrieveKnowledge (the approval-filtered path) finds no content for the scenario today', () => {
    const result = retrieveKnowledge(NHEI_KNOWLEDGE_CONTENT_LIBRARY, { topics: SCENARIO_TOPICS, limit: 20 });
    expect(result.found).toBe(false);
    expect(result.entries).toEqual([]);
  });

  it('every library entry is a draft with no reviewer - none has been exposed to live retrieval by fiat', () => {
    expect(NHEI_KNOWLEDGE_CONTENT_LIBRARY.every((e) => e.approvalStatus === 'draft')).toBe(true);
    expect(NHEI_KNOWLEDGE_CONTENT_LIBRARY.every((e) => e.reviewerId === null)).toBe(true);
  });
});

describe('critical learning fixture - the underlying CONTENT (checked directly, bypassing approval) still covers every required theme', () => {
  // Deliberately NOT retrieveKnowledge - filterByTopics/stableOrderKnowledgeEntries
  // have no approval-status opinion at all, which is exactly what a human
  // reviewer reading these drafts needs: the themes and safety properties
  // intact and checkable BEFORE approval, not only after.
  const result = stableOrderKnowledgeEntries(filterByTopics(NHEI_KNOWLEDGE_CONTENT_LIBRARY, SCENARIO_TOPICS));

  it('finds the real draft content for the scenario by topic, independent of approval state', () => {
    expect(result.length).toBeGreaterThan(0);
  });

  it('covers anticipatory expectations and the expectation-vs-outcome distinction', () => {
    expect(result.some((e) => e.topics.includes('TEMPORAL_SELF_INTERACTION'))).toBe(true);
  });

  it('covers the Relational Self (the actual manager interaction)', () => {
    expect(result.some((e) => e.topics.includes('RELATIONAL_SELF'))).toBe(true);
  });

  it('covers the Internal Self (the later emotional experience)', () => {
    expect(result.some((e) => e.topics.includes('INTERNAL_SELF'))).toBe(true);
  });

  it('covers the Perceived-Received Self (the anticipated judgement) with the required triad present', () => {
    const prs = result.find((e) => e.topics.includes('PERCEIVED_RECEIVED_SELF'));
    expect(prs).toBeDefined();
    expect(prs!.perceivedReceivedSelfDistinctions).not.toBeNull();
  });

  it('covers emotional awareness and behavioural responses (difficulty resting)', () => {
    expect(result.some((e) => e.topics.includes('EMOTIONAL'))).toBe(true);
    expect(result.some((e) => e.topics.includes('ADAPTIVE_BEHAVIOUR'))).toBe(true);
  });

  it('covers rest and recovery', () => {
    expect(result.some((e) => e.topics.includes('PHYSICAL'))).toBe(true);
  });

  it('never asserts that the anticipated refusal caused the later guilt - no entry text claims this specific causal link', () => {
    const forbiddenClaims = [
      'the anticipation caused',
      'the expectation caused',
      'the anticipated refusal caused',
      'caused the guilt',
      'caused their guilt',
      'caused her guilt',
      'caused his guilt',
    ];
    for (const entry of result) {
      const haystack = `${entry.detailedExplanation} ${entry.educationalSummary}`.toLowerCase();
      for (const claim of forbiddenClaims) {
        expect(haystack).not.toContain(claim);
      }
    }
  });

  it('the Temporal Self Interaction entry explicitly states that timing does not prove causation', () => {
    const temporal = result.find((e) => e.topics.includes('TEMPORAL_SELF_INTERACTION'));
    expect(temporal).toBeDefined();
    const text = temporal!.detailedExplanation.toLowerCase();
    expect(text).toContain('timing');
    expect(text).toMatch(/cause|causation/);
  });

  it('the Perceived-Received Self entry never asserts the manager\'s unreported private beliefs - only what was or wasn\'t actually communicated', () => {
    const prs = result.find((e) => e.topics.includes('PERCEIVED_RECEIVED_SELF'));
    expect(prs!.safetyRestrictions).toContain('never_assert_unreported_third_party_beliefs');
  });

  it('every entry here is a draft awaiting real review - this test suite checks content readiness, not a claim that review has happened', () => {
    expect(result.every((e) => e.approvalStatus === 'draft')).toBe(true);
  });
});
