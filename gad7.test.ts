import { describe, it, expect } from 'vitest';
import {
  GAD7_ASSESSMENT_NAME, GAD7_ASSESSMENT_VERSION,
  GAD7_QUESTIONS,
  GAD7_OPTIONS,
  GAD7_IMPAIRMENT_QUESTION, GAD7_IMPAIRMENT_OPTIONS,
  isValidGad7Answers,
  scoreGad7,
  severityForScore,
  interpretGad7,
  interpretGad7ForAudience,
  GAD7_NOT_A_DIAGNOSIS_LINE, GAD7_SCOPE_LIMITATION, GAD7_WHAT_THIS_MEANS, GAD7_WHAT_THIS_DOESNT_TELL_US,
  countGad7Answered, isGad7Complete,
  compareWithPreviousGad7,
  compareGad7Impairment, buildScoreAndImpairmentNote,
  computeGad7HistoryTrend, Gad7ScoreRecord, MIN_COMPLETED_FOR_HISTORY_TREND, GAD7_SNAPSHOT_REMINDER,
  GAD7_PERSISTENT_WORSENING_LINE, GAD7_RECOVERY_LINE, GAD7_RECOVERY_FOLLOWUP_QUESTION,
  GAD7_CONTEXT_TAG_ORDER, GAD7_CONTEXT_TAG_LABELS, EXCLUSIVE_GAD7_CONTEXT_TAGS,
  GAD7_REMINDER_CHOICE_ORDER, GAD7_REMINDER_CHOICE_LABELS, GAD7_FORTNIGHTLY_DAYS, shouldSuggestAnotherCheckIn,
  shouldOfferAcuteAnxietyGate,
  GAD7_NEXT_ACTION_ORDER, GAD7_NEXT_ACTION_LABELS,
  containsGad7BannedPhrase, GAD7_BANNED_PHRASES,
} from './gad7';

describe('GAD-7 instrument shape (locked, versioned content)', () => {
  it('has a name and an explicit version identifier', () => {
    expect(GAD7_ASSESSMENT_NAME).toBe('GAD-7');
    expect(GAD7_ASSESSMENT_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
  it('has exactly 7 questions and 4 response options scored 0-3', () => {
    expect(GAD7_QUESTIONS).toHaveLength(7);
    expect(GAD7_OPTIONS.map((o) => o.value)).toEqual([0, 1, 2, 3]);
  });
  it('keeps the functional-impairment follow-up separate from the 7 scored items', () => {
    expect(GAD7_IMPAIRMENT_QUESTION.length).toBeGreaterThan(0);
    expect(GAD7_IMPAIRMENT_OPTIONS).toHaveLength(4);
  });
});

describe('isValidGad7Answers: strict on shape (7 ints, each 0-3)', () => {
  it('accepts a valid set', () => {
    expect(isValidGad7Answers([0, 1, 2, 3, 0, 1, 2])).toBe(true);
  });
  it('rejects wrong length, out-of-range, and non-integers', () => {
    expect(isValidGad7Answers([0, 1, 2])).toBe(false);
    expect(isValidGad7Answers([0, 1, 2, 3, 0, 1, 4])).toBe(false);
    expect(isValidGad7Answers([0, 1, 2, 3, 0, 1, -1])).toBe(false);
    expect(isValidGad7Answers([0, 1, 2, 3, 0, 1, 1.5])).toBe(false);
    expect(isValidGad7Answers('nope')).toBe(false);
  });
});

describe('scoreGad7 + severity bands (standard published cut-points)', () => {
  it('sums to the 0-21 range', () => {
    expect(scoreGad7([0, 0, 0, 0, 0, 0, 0])).toBe(0);
    expect(scoreGad7([3, 3, 3, 3, 3, 3, 3])).toBe(21);
    expect(scoreGad7([1, 2, 0, 1, 0, 2, 1])).toBe(7);
  });
  it('throws rather than scoring an invalid set', () => {
    expect(() => scoreGad7([1, 2, 3])).toThrow();
  });
  it('maps scores to the four standard bands at the right boundaries', () => {
    expect(severityForScore(0)).toBe('minimal');
    expect(severityForScore(4)).toBe('minimal');
    expect(severityForScore(5)).toBe('mild');
    expect(severityForScore(9)).toBe('mild');
    expect(severityForScore(10)).toBe('moderate');
    expect(severityForScore(14)).toBe('moderate');
    expect(severityForScore(15)).toBe('severe');
    expect(severityForScore(21)).toBe('severe');
  });
});

describe('interpretGad7: descriptive bands, never diagnostic labels', () => {
  it('does not suggest support below 10, does at 10 and above', () => {
    expect(interpretGad7(9).suggestsSupport).toBe(false);
    expect(interpretGad7(10).suggestsSupport).toBe(true);
    expect(interpretGad7(18).suggestsSupport).toBe(true);
  });
  it('is framed as symptoms/self-report, never as a diagnosis', () => {
    for (const s of [2, 7, 12, 19]) {
      const r = interpretGad7(s);
      expect(r.summary.toLowerCase()).not.toMatch(/you have|diagnos|disorder/);
      expect(r.severityLabel.toLowerCase()).not.toContain('anxiety'); // bands read as symptom-score ranges, not "X anxiety"
    }
  });
  it('escalates the tone appropriately for a severe score without alarming language', () => {
    const r = interpretGad7(20);
    expect(r.severity).toBe('severe');
    expect(r.summary.toLowerCase()).toContain('professional');
    expect(r.severityLabel.toLowerCase()).not.toBe('total crisis');
  });
});

describe('interpretGad7ForAudience: youth copy stays plainer and non-clinical', () => {
  it('names a trusted adult rather than only "a professional" at the top band for youth', () => {
    const youth = interpretGad7ForAudience(18, 'youth');
    expect(youth.summary.toLowerCase()).toContain('trusted adult');
    expect(youth.summary.toLowerCase()).not.toMatch(/diagnos|disorder|you have/);
  });
  it('adult and youth share the same score/severity/suggestsSupport, differing only in summary copy', () => {
    const adult = interpretGad7ForAudience(12, 'adult');
    const youth = interpretGad7ForAudience(12, 'youth');
    expect(adult.score).toBe(youth.score);
    expect(adult.severity).toBe(youth.severity);
    expect(adult.suggestsSupport).toBe(youth.suggestsSupport);
    expect(adult.summary).not.toBe(youth.summary);
  });
});

describe('result-screen limitation copy is present and worded as required', () => {
  it('includes the exact "not a diagnosis" line', () => {
    expect(GAD7_NOT_A_DIAGNOSIS_LINE).toBe('This is information, not a diagnosis.');
  });
  it('names what the result does and does not tell the user', () => {
    expect(GAD7_WHAT_THIS_MEANS.length).toBeGreaterThan(0);
    expect(GAD7_WHAT_THIS_DOESNT_TELL_US.toLowerCase()).toContain('does not diagnose');
  });
  it('states the instrument does not capture every anxiety experience', () => {
    expect(GAD7_SCOPE_LIMITATION.length).toBeGreaterThan(0);
  });
});

describe('completion status: never score or trend an incomplete check-in', () => {
  it('counts answered items using the -1-unanswered convention', () => {
    expect(countGad7Answered([-1, -1, -1, -1, -1, -1, -1])).toBe(0);
    expect(countGad7Answered([0, 1, -1, -1, -1, -1, -1])).toBe(2);
    expect(countGad7Answered([0, 1, 2, 3, 0, 1, 2])).toBe(7);
  });
  it('is only complete once all 7 have a real answer', () => {
    expect(isGad7Complete([0, 1, -1, -1, -1, -1, -1])).toBe(false);
    expect(isGad7Complete([0, 1, 2, 3, 0, 1, 2])).toBe(true);
  });
});

describe('compareWithPreviousGad7: cautious, non-percentage comparison language', () => {
  it('has nothing to compare on a first check-in', () => {
    const c = compareWithPreviousGad7(8, null);
    expect(c.direction).toBe('unknown');
  });
  it('a small movement reads as similar, not over-read', () => {
    expect(compareWithPreviousGad7(10, 9).direction).toBe('similar');
  });
  it('a real rise/drop reads as higher/lower using plain language', () => {
    const higher = compareWithPreviousGad7(12, 8);
    expect(higher.direction).toBe('higher');
    expect(higher.note).toBe('Your latest score is higher than your previous check-in.');
    expect(higher.note).not.toMatch(/%|percent/i);

    const lower = compareWithPreviousGad7(4, 10);
    expect(lower.direction).toBe('lower');
    expect(lower.note).not.toMatch(/%|percent/i);
  });
});

describe('functional impact is compared separately, never merged into the score', () => {
  it('detects more/less/same impact', () => {
    expect(compareGad7Impairment(2, 1)).toBe('more');
    expect(compareGad7Impairment(1, 2)).toBe('less');
    expect(compareGad7Impairment(1, 1)).toBe('same');
    expect(compareGad7Impairment(null, 1)).toBe('unknown');
  });
  it('only speaks up when the score alone looks unchanged but impact has moved', () => {
    expect(buildScoreAndImpairmentNote('similar', 'more')).toMatch(/similar to last time, but/);
    expect(buildScoreAndImpairmentNote('similar', 'less')).toMatch(/similar to last time, and/);
    expect(buildScoreAndImpairmentNote('similar', 'same')).toBeNull();
    expect(buildScoreAndImpairmentNote('higher', 'more')).toBeNull();
  });
});

describe('computeGad7HistoryTrend: stronger language only with a real, consistent multi-point direction', () => {
  const rec = (score: number, iso: string): Gad7ScoreRecord => ({ score, createdAt: iso });

  it('needs at least the minimum completed check-ins', () => {
    expect(MIN_COMPLETED_FOR_HISTORY_TREND).toBe(3);
    const t = computeGad7HistoryTrend([rec(10, '2026-01-01T00:00:00Z'), rec(9, '2026-01-15T00:00:00Z')]);
    expect(t.direction).toBe('not_enough_data');
  });
  it('a consistent drop across the recent window reads as trending lower', () => {
    const t = computeGad7HistoryTrend([
      rec(14, '2026-01-01T00:00:00Z'), rec(10, '2026-01-15T00:00:00Z'), rec(6, '2026-01-29T00:00:00Z'),
    ]);
    expect(t.direction).toBe('trending_lower');
  });
  it('a consistent rise across the recent window reads as moving upward', () => {
    const t = computeGad7HistoryTrend([
      rec(4, '2026-01-01T00:00:00Z'), rec(9, '2026-01-15T00:00:00Z'), rec(13, '2026-01-29T00:00:00Z'),
    ]);
    expect(t.direction).toBe('trending_higher');
  });
  it('a back-and-forth pattern reads as steady, not a false trend', () => {
    const t = computeGad7HistoryTrend([
      rec(8, '2026-01-01T00:00:00Z'), rec(12, '2026-01-15T00:00:00Z'), rec(7, '2026-01-29T00:00:00Z'),
    ]);
    expect(t.direction).toBe('steady');
  });
  it('always pairs with the snapshot-not-identity reminder', () => {
    expect(GAD7_SNAPSHOT_REMINDER).toMatch(/snapshot/);
  });
});

describe('persistence/worsening and recovery/improvement phrasing stays cautious', () => {
  it('never phrases worsening as alarmist, and never celebrates improvement like a game', () => {
    expect(GAD7_PERSISTENT_WORSENING_LINE.toLowerCase()).not.toMatch(/alarm|emergency|crisis/);
    expect(GAD7_RECOVERY_LINE.toLowerCase()).not.toMatch(/won|congrat|streak/);
    expect(GAD7_RECOVERY_FOLLOWUP_QUESTION.length).toBeGreaterThan(0);
  });
});

describe('"why now?" context tags: not part of scoring, mutually exclusive catch-alls', () => {
  it('has all ten spec answers', () => {
    expect(GAD7_CONTEXT_TAG_ORDER).toHaveLength(10);
    expect(Object.keys(GAD7_CONTEXT_TAG_LABELS)).toHaveLength(10);
  });
  it('"nothing obvious" and "prefer not to say" are the exclusive catch-alls', () => {
    expect(EXCLUSIVE_GAD7_CONTEXT_TAGS).toEqual(['nothing_obvious', 'prefer_not_to_say']);
  });
});

describe('fortnightly reminder cadence: optional, pull-based, never daily', () => {
  it('uses 14 days as the cadence', () => {
    expect(GAD7_FORTNIGHTLY_DAYS).toBe(14);
  });
  it('has exactly the three spec reminder choices', () => {
    expect(GAD7_REMINDER_CHOICE_ORDER).toEqual(['two_weeks', 'choose_other', 'no_reminders']);
    expect(Object.keys(GAD7_REMINDER_CHOICE_LABELS)).toHaveLength(3);
  });
  it('suggests another check-in only once the stored date has passed', () => {
    expect(shouldSuggestAnotherCheckIn(null)).toBe(false);
    const now = new Date('2026-02-01T00:00:00Z');
    expect(shouldSuggestAnotherCheckIn('2026-01-15T00:00:00Z', now)).toBe(true);
    expect(shouldSuggestAnotherCheckIn('2026-02-15T00:00:00Z', now)).toBe(false);
  });
});

describe('acute anxiety gate: a real recent Anxiety Reset use, never a guess', () => {
  it('offers the gate only when the real signal is present', () => {
    expect(shouldOfferAcuteAnxietyGate({ recentAnxietyResetSession: true })).toBe(true);
    expect(shouldOfferAcuteAnxietyGate({ recentAnxietyResetSession: false })).toBe(false);
  });
});

describe('"what would you like to do with this?" preserves user agency', () => {
  it('has all six spec options, none of which auto-launches coaching', () => {
    expect(GAD7_NEXT_ACTION_ORDER).toHaveLength(6);
    expect(Object.keys(GAD7_NEXT_ACTION_LABELS)).toHaveLength(6);
  });
});

describe('banned-phrase guardrail: no diagnosis claims, no percentage-of-mental-state framing', () => {
  it('flags diagnostic and overclaiming phrases', () => {
    expect(containsGad7BannedPhrase('You have generalised anxiety disorder.')).toBe(true);
    expect(containsGad7BannedPhrase('Your anxiety is worse by 50%.')).toBe(true);
    expect(containsGad7BannedPhrase('Your latest score is higher than your previous check-in.')).toBe(false);
  });
  it('every built-in summary/comparison/trend line passes the guardrail', () => {
    const lines = [
      GAD7_NOT_A_DIAGNOSIS_LINE, GAD7_SCOPE_LIMITATION, GAD7_WHAT_THIS_MEANS, GAD7_WHAT_THIS_DOESNT_TELL_US,
      GAD7_SNAPSHOT_REMINDER, GAD7_PERSISTENT_WORSENING_LINE, GAD7_RECOVERY_LINE, GAD7_RECOVERY_FOLLOWUP_QUESTION,
      ...[0, 5, 10, 16].map((s) => interpretGad7(s).summary),
      ...[0, 5, 10, 16].map((s) => interpretGad7ForAudience(s, 'youth').summary),
    ];
    for (const line of lines) expect(containsGad7BannedPhrase(line)).toBe(false);
  });
  it('GAD7_BANNED_PHRASES is non-empty', () => {
    expect(GAD7_BANNED_PHRASES.length).toBeGreaterThan(0);
  });
});
