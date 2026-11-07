// NHEI PHASE 3C CHECKPOINT 3 SECTION 1 - EDUCATIONAL TOPIC SELECTOR TESTS
//
// Tests realistic queries about each of the Three Selves, Four
// Dimensions, SHIP, BLAME, R3, boundaries, recovery, and unrelated
// subjects - exactly the categories Checkpoint 3 section 1 names.

import { describe, it, expect } from 'vitest';
import { selectEducationalTopics, selectorCoversFullTaxonomy } from './nhei-educational-topic-selector';

describe('selectorCoversFullTaxonomy', () => {
  it('covers every topic in NHEI_KNOWLEDGE_TOPICS, not a hand-copied subset', () => {
    expect(selectorCoversFullTaxonomy()).toBe(true);
  });
});

describe('selectEducationalTopics - Three Selves', () => {
  it('selects INTERNAL_SELF for a realistic question about private internal reactions', () => {
    const result = selectEducationalTopics("Why do I still feel bad privately even though the internal self conversation is over and nobody else noticed anything wrong?");
    expect(result.topics).toContain('INTERNAL_SELF');
  });

  it('selects RELATIONAL_SELF for a realistic question about what actually happened between two people', () => {
    const result = selectEducationalTopics("What is the relational self concept about, exactly - is it about what was actually said and decided between us?");
    expect(result.topics).toContain('RELATIONAL_SELF');
  });

  it('selects PERCEIVED_RECEIVED_SELF for a realistic question about anticipated judgement', () => {
    const result = selectEducationalTopics("Can you explain the perceived-received self idea - the gap between what I expected them to think and what they actually said?");
    expect(result.topics).toContain('PERCEIVED_RECEIVED_SELF');
  });
});

describe('selectEducationalTopics - Four Dimensions', () => {
  it('selects METAPHYSICAL for a question about values/identity/meaning', () => {
    const result = selectEducationalTopics("What is the metaphysical dimension - does it cover whether a decision matters to me or fits who I am?");
    expect(result.topics).toContain('METAPHYSICAL');
  });

  it('selects PHYSICAL for a question about bodily rest/fatigue', () => {
    const result = selectEducationalTopics("I keep having difficulty resting even with free time - is that the physical dimension?");
    expect(result.topics).toContain('PHYSICAL');
  });

  it('selects MENTAL for a question about predictions/interpretations', () => {
    const result = selectEducationalTopics("What does the mental dimension mean - is it about assuming the outcome before it happens?");
    expect(result.topics).toContain('MENTAL');
  });

  it('selects EMOTIONAL for a question about naming feelings', () => {
    const result = selectEducationalTopics("How does the emotional dimension work - is it just about naming what I feel, like feeling guilty?");
    expect(result.topics).toContain('EMOTIONAL');
  });
});

describe('selectEducationalTopics - SHIP, BLAME, R3', () => {
  it('selects SHIP for a capitalised acronym reference', () => {
    const result = selectEducationalTopics("Can you tell me what SHIP means in Blaze Break?");
    expect(result.topics).toContain('SHIP');
  });

  it('selects SHIP for the spelled-out framework name in lowercase', () => {
    const result = selectEducationalTopics("what is the ship framework about, safety habits identity purpose?");
    expect(result.topics).toContain('SHIP');
  });

  it('selects BLAME for a capitalised acronym reference', () => {
    const result = selectEducationalTopics("What does BLAME stand for as a Blaze Break method?");
    expect(result.topics).toContain('BLAME');
  });

  it('does NOT select BLAME merely because the lowercase word "blame" appears generically', () => {
    // "blame" used in an ordinary sentence, not referencing the framework
    // or its spelled-out steps - this must not false-positive.
    const result = selectEducationalTopics("I don't want to blame myself for what happened at work today.");
    expect(result.topics).not.toContain('BLAME');
  });

  it('selects R3 for the spelled-out phrase', () => {
    const result = selectEducationalTopics("What is Rethink Reflect Rejuvenate about?");
    expect(result.topics).toContain('R3');
  });

  it('selects R3 for the capitalised acronym R3', () => {
    const result = selectEducationalTopics("Is R3 a real tool I can open in the app?");
    expect(result.topics).toContain('R3');
  });

  it('does NOT select R3 from a bare lowercase "r3" substring inside an unrelated word', () => {
    const result = selectEducationalTopics("my car3 broke down and I need to r3place it");
    expect(result.topics).not.toContain('R3');
  });
});

describe('selectEducationalTopics - boundaries and recovery (deliberately generic, not NHEI-specific)', () => {
  it('a pure boundary-setting question selects no NHEI topics - that belongs to Boundary Rehearsal, not NHEI education', () => {
    const result = selectEducationalTopics("How do I set a boundary with my manager about working late?");
    expect(result.topics).toEqual([]);
  });

  it('a generic recovery question selects no NHEI topics - that belongs to Recovery Debt Inventory, not NHEI education', () => {
    const result = selectEducationalTopics("What's the best way to recover after a stressful week?");
    expect(result.topics).toEqual([]);
  });
});

describe('selectEducationalTopics - unrelated subjects', () => {
  it('a question with no connection to NHEI concepts selects nothing', () => {
    const result = selectEducationalTopics("What's the weather like today?");
    expect(result.topics).toEqual([]);
  });

  it('a password-reset question selects nothing', () => {
    const result = selectEducationalTopics("How do I reset my password for this app?");
    expect(result.topics).toEqual([]);
  });

  it('an empty message selects nothing', () => {
    expect(selectEducationalTopics("").topics).toEqual([]);
  });

  it('a non-string input selects nothing rather than throwing', () => {
    expect(selectEducationalTopics(undefined).topics).toEqual([]);
    expect(selectEducationalTopics(null).topics).toEqual([]);
    expect(selectEducationalTopics(12345).topics).toEqual([]);
  });
});

describe('selectEducationalTopics - not crude keyword matching as the sole method', () => {
  it('a single generic weak term alone is not enough to select a topic', () => {
    // "tired" alone (one PHYSICAL weak term) should not be enough -
    // needs a second, independently-drawn term from the same topic.
    const result = selectEducationalTopics("I am so tired today.");
    expect(result.topics).not.toContain('PHYSICAL');
  });

  it('two independent weak terms from the same topic DO clear the threshold', () => {
    const result = selectEducationalTopics("I feel exhausted and I have difficulty resting even when I have the time.");
    expect(result.topics).toContain('PHYSICAL');
  });

  it('a strong phrase match alone is sufficient without needing a second term', () => {
    const result = selectEducationalTopics("Tell me about the physical dimension.");
    expect(result.topics).toContain('PHYSICAL');
  });
});

describe('selectEducationalTopics - bounded output', () => {
  it('never returns more than 4 topics even when many are referenced at once', () => {
    const result = selectEducationalTopics(
      "Tell me about the internal self, the relational self, the perceived-received self, the metaphysical dimension, " +
      "the physical dimension, the mental dimension, and the emotional dimension - all of them please."
    );
    expect(result.topics.length).toBeLessThanOrEqual(4);
  });

  it('a pathologically long message does not change asymptotic behaviour - only the first 4000 chars are considered', () => {
    const padding = 'x'.repeat(10000);
    const result = selectEducationalTopics(`${padding} internal self`);
    // "internal self" sits past the 4000-char bound, so it is never seen.
    expect(result.topics).not.toContain('INTERNAL_SELF');
  });
});

describe('selectEducationalTopics - no evidence/consent side effects (by construction, not just by convention)', () => {
  it('returns only a plain topics array and a diagnostic map - no evidence-shaped object', () => {
    const result = selectEducationalTopics("Tell me about the ship framework.");
    expect(Object.keys(result).sort()).toEqual(['matchedStrongPhrase', 'topics']);
  });

  it('is a pure function - calling it twice with the same input gives the same result', () => {
    const a = selectEducationalTopics("Tell me about the blame method.");
    const b = selectEducationalTopics("Tell me about the blame method.");
    expect(a).toEqual(b);
  });
});
