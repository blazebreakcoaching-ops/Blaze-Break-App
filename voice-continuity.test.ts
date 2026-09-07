import { describe, it, expect } from 'vitest';
import {
  buildContinuityPreamble,
  describeGap,
  shouldSuggestCheckin,
  VoiceSessionRecord,
} from './voice-continuity';

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse('2026-02-01T12:00:00.000Z');
const rec = (endedAt: string, durationMs = 120000, turnCount = 6): VoiceSessionRecord => ({ endedAt, durationMs, turnCount });

describe('describeGap: honest, human phrasing for time since last call', () => {
  it('same day', () => expect(describeGap(new Date(NOW - 2 * 60 * 60 * 1000).toISOString(), NOW)).toBe('earlier today'));
  it('yesterday', () => expect(describeGap(new Date(NOW - DAY - 1000).toISOString(), NOW)).toBe('yesterday'));
  it('a few days', () => expect(describeGap(new Date(NOW - 3 * DAY).toISOString(), NOW)).toBe('3 days ago'));
  it('about a week', () => expect(describeGap(new Date(NOW - 9 * DAY).toISOString(), NOW)).toBe('about a week ago'));
  it('weeks', () => expect(describeGap(new Date(NOW - 20 * DAY).toISOString(), NOW)).toBe('about 3 weeks ago'));
  it('long ago', () => expect(describeGap(new Date(NOW - 90 * DAY).toISOString(), NOW)).toBe('a while ago'));
  it('is defensive about a future/garbage timestamp rather than saying something absurd', () => {
    expect(describeGap(new Date(NOW + DAY).toISOString(), NOW)).toBe('recently');
    expect(describeGap('not-a-date', NOW)).toBe('recently');
  });
});

describe('buildContinuityPreamble: warm continuity without fabricating memory', () => {
  it('returns empty for a first-ever call so nothing is invented', () => {
    expect(buildContinuityPreamble([], NOW)).toBe('');
  });

  it('acknowledges a returning caller and names how long it has been', () => {
    const p = buildContinuityPreamble([rec(new Date(NOW - 3 * DAY).toISOString())], NOW);
    expect(p).toContain('once before');
    expect(p).toContain('3 days ago');
  });

  it('counts multiple past calls and uses the MOST RECENT for the gap', () => {
    const p = buildContinuityPreamble(
      [rec(new Date(NOW - 10 * DAY).toISOString()), rec(new Date(NOW - DAY - 1000).toISOString()), rec(new Date(NOW - 30 * DAY).toISOString())],
      NOW,
    );
    expect(p).toContain('3 times before');
    expect(p).toContain('yesterday'); // most recent, not the oldest
  });

  it('explicitly forbids Nova from claiming to remember specifics (no fabrication)', () => {
    const p = buildContinuityPreamble([rec(new Date(NOW - DAY).toISOString())], NOW);
    expect(p.toLowerCase()).toContain('never pretend to remember');
    expect(p.toLowerCase()).toContain('do not have a record of what was said');
  });
});

describe('shouldSuggestCheckin: consented, gentle, never unsolicited', () => {
  it('never suggests without explicit consent', () => {
    expect(shouldSuggestCheckin([rec(new Date(NOW - 30 * DAY).toISOString())], NOW, 7, false)).toBe(false);
  });
  it('never suggests to someone who has never called', () => {
    expect(shouldSuggestCheckin([], NOW, 7, true)).toBe(false);
  });
  it('suggests once the cadence window has passed', () => {
    expect(shouldSuggestCheckin([rec(new Date(NOW - 8 * DAY).toISOString())], NOW, 7, true)).toBe(true);
  });
  it('stays quiet inside the cadence window', () => {
    expect(shouldSuggestCheckin([rec(new Date(NOW - 2 * DAY).toISOString())], NOW, 7, true)).toBe(false);
  });
  it('treats a non-positive cadence as disabled', () => {
    expect(shouldSuggestCheckin([rec(new Date(NOW - 30 * DAY).toISOString())], NOW, 0, true)).toBe(false);
  });
});
