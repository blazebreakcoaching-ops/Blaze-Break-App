import { describe, it, expect } from 'vitest';
import {
  PUSHBACK_PATTERN_ORDER, PUSHBACK_PATTERN_LABELS, PUSHBACK_PATTERN_ROLEPLAY_HINT,
  BACK_DOWN_REASON_ORDER, BACK_DOWN_REASON_LABELS, WHAT_MIGHT_MAKE_YOU_BACK_DOWN_QUESTION,
  recommendPushbackPattern, BackDownReason,
  MOMENT_OF_CAVE_LINE, PUSHBACK_END_CHOICE_ORDER, PUSHBACK_END_CHOICE_LABELS,
  containsPushbackBannedPhrase, PUSHBACK_BANNED_PHRASES,
} from './boundary-pushback-engine';

describe('Pushback patterns: the ten spec patterns, skill-building content only', () => {
  it('has exactly ten patterns, each with a label and a roleplay hint', () => {
    expect(PUSHBACK_PATTERN_ORDER).toHaveLength(10);
    expect(Object.keys(PUSHBACK_PATTERN_LABELS)).toHaveLength(10);
    for (const p of PUSHBACK_PATTERN_ORDER) {
      expect(PUSHBACK_PATTERN_ROLEPLAY_HINT[p].length).toBeGreaterThan(0);
    }
  });
  it('never labels the other person manipulative in any roleplay hint', () => {
    for (const p of PUSHBACK_PATTERN_ORDER) {
      expect(PUSHBACK_PATTERN_ROLEPLAY_HINT[p].toLowerCase()).not.toMatch(/manipulat|toxic|narcissist/);
    }
  });
});

describe('"What might make you back down?": behavioural self-knowledge, not personality diagnosis', () => {
  it('has all eight spec answers', () => {
    expect(BACK_DOWN_REASON_ORDER).toHaveLength(8);
    expect(Object.keys(BACK_DOWN_REASON_LABELS)).toHaveLength(8);
  });
  it('uses the exact spec question', () => {
    expect(WHAT_MIGHT_MAKE_YOU_BACK_DOWN_QUESTION).toBe('What might make you back down?');
  });
  it('maps every answer to a real pattern - "not sure" still gets a starting point', () => {
    for (const reason of BACK_DOWN_REASON_ORDER as BackDownReason[]) {
      const pattern = recommendPushbackPattern(reason);
      expect(PUSHBACK_PATTERN_ORDER).toContain(pattern);
    }
  });
});

describe('Moment of cave: identified, never scored', () => {
  it('uses the exact spec line', () => {
    expect(MOMENT_OF_CAVE_LINE).toBe('That was the moment the original trade-off disappeared.');
  });
  it('has all three spec end choices', () => {
    expect(PUSHBACK_END_CHOICE_ORDER).toEqual(['try_again', 'show_options', 'end_practice']);
    expect(Object.keys(PUSHBACK_END_CHOICE_LABELS)).toHaveLength(3);
  });
});

describe('banned-phrase guardrail: no manipulative-person labels, no numeric scoring', () => {
  it('flags scoring and character-labelling phrases', () => {
    expect(containsPushbackBannedPhrase('They are manipulative and toxic.')).toBe(true);
    expect(containsPushbackBannedPhrase('You scored 6 out of 10 on assertiveness.')).toBe(true);
    expect(containsPushbackBannedPhrase(MOMENT_OF_CAVE_LINE)).toBe(false);
  });
  it('every built-in line passes the guardrail', () => {
    const lines = [
      MOMENT_OF_CAVE_LINE, WHAT_MIGHT_MAKE_YOU_BACK_DOWN_QUESTION,
      ...PUSHBACK_PATTERN_ORDER.map((p) => PUSHBACK_PATTERN_ROLEPLAY_HINT[p]),
      ...Object.values(PUSHBACK_END_CHOICE_LABELS),
      ...Object.values(BACK_DOWN_REASON_LABELS),
    ];
    for (const line of lines) expect(containsPushbackBannedPhrase(line)).toBe(false);
  });
  it('PUSHBACK_BANNED_PHRASES is non-empty', () => {
    expect(PUSHBACK_BANNED_PHRASES.length).toBeGreaterThan(0);
  });
});
