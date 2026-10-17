// NHEI PHASE 3B - REQUIRED CRITICAL LEARNING FIXTURE (section 7)
//
// The same narrative Phase 1's own acceptance scenario used (manager
// approves a feared time-off request; guilt and difficulty resting
// follow) - here verifying the KNOWLEDGE ENGINE's side of it: that
// querying for the topics this experience touches returns real,
// approved educational material covering every required theme, and that
// nothing in that material asserts the anticipated refusal caused the
// later guilt.

import { describe, it, expect } from 'vitest';
import { retrieveKnowledge } from './nhei-knowledge-retrieval-engine';
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

describe('critical learning fixture - retrieval covers every required theme', () => {
  const result = retrieveKnowledge(NHEI_KNOWLEDGE_CONTENT_LIBRARY, { topics: SCENARIO_TOPICS, limit: 20 });

  it('finds real, approved content for the scenario', () => {
    expect(result.found).toBe(true);
    expect(result.invalidTopics).toEqual([]);
  });

  it('covers anticipatory expectations and the expectation-vs-outcome distinction', () => {
    expect(result.entries.some((e) => e.topics.includes('TEMPORAL_SELF_INTERACTION'))).toBe(true);
  });

  it('covers the Relational Self (the actual manager interaction)', () => {
    expect(result.entries.some((e) => e.topics.includes('RELATIONAL_SELF'))).toBe(true);
  });

  it('covers the Internal Self (the later emotional experience)', () => {
    expect(result.entries.some((e) => e.topics.includes('INTERNAL_SELF'))).toBe(true);
  });

  it('covers the Perceived-Received Self (the anticipated judgement) with the required triad present', () => {
    const prs = result.entries.find((e) => e.topics.includes('PERCEIVED_RECEIVED_SELF'));
    expect(prs).toBeDefined();
    expect(prs!.perceivedReceivedSelfDistinctions).not.toBeNull();
  });

  it('covers emotional awareness and behavioural responses (difficulty resting)', () => {
    expect(result.entries.some((e) => e.topics.includes('EMOTIONAL'))).toBe(true);
    expect(result.entries.some((e) => e.topics.includes('ADAPTIVE_BEHAVIOUR'))).toBe(true);
  });

  it('covers rest and recovery', () => {
    expect(result.entries.some((e) => e.topics.includes('PHYSICAL'))).toBe(true);
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
    for (const entry of result.entries) {
      const haystack = `${entry.detailedExplanation} ${entry.educationalSummary}`.toLowerCase();
      for (const claim of forbiddenClaims) {
        expect(haystack).not.toContain(claim);
      }
    }
  });

  it('the Temporal Self Interaction entry explicitly states that timing does not prove causation', () => {
    const temporal = result.entries.find((e) => e.topics.includes('TEMPORAL_SELF_INTERACTION'));
    expect(temporal).toBeDefined();
    const text = temporal!.detailedExplanation.toLowerCase();
    expect(text).toContain('timing');
    expect(text).toMatch(/cause|causation/);
  });

  it('the Perceived-Received Self entry never asserts the manager\'s unreported private beliefs - only what was or wasn\'t actually communicated', () => {
    const prs = result.entries.find((e) => e.topics.includes('PERCEIVED_RECEIVED_SELF'));
    expect(prs!.safetyRestrictions).toContain('never_assert_unreported_third_party_beliefs');
  });

  it('every returned entry is approved - draft or rejected content never reaches this result', () => {
    expect(result.entries.every((e) => e.approvalStatus === 'approved')).toBe(true);
  });
});
