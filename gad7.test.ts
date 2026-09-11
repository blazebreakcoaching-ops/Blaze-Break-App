import { describe, it, expect } from 'vitest';
import {
  GAD7_QUESTIONS,
  GAD7_OPTIONS,
  isValidGad7Answers,
  scoreGad7,
  severityForScore,
  interpretGad7,
  computeGad7Trend,
  Gad7ScoreRecord,
} from './gad7';

describe('GAD-7 instrument shape', () => {
  it('has exactly 7 questions and 4 response options scored 0-3', () => {
    expect(GAD7_QUESTIONS).toHaveLength(7);
    expect(GAD7_OPTIONS.map((o) => o.value)).toEqual([0, 1, 2, 3]);
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

describe('interpretGad7: descriptive, and flags support at the standard >=10 threshold', () => {
  it('does not suggest support below 10, does at 10 and above', () => {
    expect(interpretGad7(9).suggestsSupport).toBe(false);
    expect(interpretGad7(10).suggestsSupport).toBe(true);
    expect(interpretGad7(18).suggestsSupport).toBe(true);
  });
  it('is framed as symptoms/self-report, never as a diagnosis', () => {
    for (const s of [2, 7, 12, 19]) {
      const r = interpretGad7(s);
      expect(r.summary.toLowerCase()).not.toMatch(/you have|diagnos|disorder/);
    }
  });
  it('escalates the tone appropriately for a severe score without alarming language', () => {
    const r = interpretGad7(20);
    expect(r.severity).toBe('severe');
    expect(r.summary.toLowerCase()).toContain('professional');
  });
});

describe('computeGad7Trend: lower is better, small changes are stable', () => {
  const rec = (score: number, iso: string): Gad7ScoreRecord => ({ score, createdAt: iso });
  it('needs at least two data points', () => {
    expect(computeGad7Trend([rec(10, '2026-01-01T00:00:00Z')]).direction).toBe('unknown');
  });
  it('a drop of >=2 is improving; a rise of >=2 is worsening', () => {
    const improving = computeGad7Trend([rec(6, '2026-02-01T00:00:00Z'), rec(12, '2026-01-01T00:00:00Z')]);
    expect(improving.direction).toBe('improving');
    expect(improving.delta).toBe(-6);
    const worsening = computeGad7Trend([rec(14, '2026-02-01T00:00:00Z'), rec(8, '2026-01-01T00:00:00Z')]);
    expect(worsening.direction).toBe('worsening');
  });
  it('uses the two most RECENT scores, not the oldest', () => {
    const t = computeGad7Trend([
      rec(5, '2026-03-01T00:00:00Z'),
      rec(15, '2026-02-01T00:00:00Z'),
      rec(3, '2026-01-01T00:00:00Z'),
    ]);
    // most recent 5 vs previous 15 => improving
    expect(t.direction).toBe('improving');
  });
  it('a change under 2 points reads as stable', () => {
    expect(computeGad7Trend([rec(9, '2026-02-01T00:00:00Z'), rec(10, '2026-01-01T00:00:00Z')]).direction).toBe('stable');
  });
});
