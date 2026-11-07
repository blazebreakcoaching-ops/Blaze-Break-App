import { describe, expect, it } from 'vitest';
import {
  pulseHistoryKey, pulseAlertKey, lastCheckInKey,
  parsePulseHistory, mayApplyAccountLoad,
} from './pulse-account-storage';

describe('account-isolated wellbeing data', () => {
  it('never shares pulse, alert or check-in keys across users', () => {
    for (const makeKey of [pulseHistoryKey, pulseAlertKey, lastCheckInKey]) {
      expect(makeKey('account-a')).not.toBe(makeKey('account-b'));
      expect(makeKey('account a')).not.toBe(makeKey('account%20a'));
    }
  });

  it('keeps only valid pulse history in the 0–100 range', () => {
    const valid = { date: 'Nov 7', score: 45 };
    expect(parsePulseHistory(JSON.stringify([
      null, 1, {}, 'fake', { date: '', score: 12 },
      { date: 'Nov 5', score: 101 }, { date: 'Nov 6', score: -1 },
      { date: 'Nov 7', score: '45' }, valid,
    ]))).toEqual([valid]);
  });

  it('rejects corrupt or non-array browser storage safely', () => {
    expect(parsePulseHistory(null)).toEqual([]);
    expect(parsePulseHistory('bad-json')).toEqual([]);
    expect(parsePulseHistory('{"date":"Nov 7","score":45}')).toEqual([]);
    expect(parsePulseHistory('null')).toEqual([]);
  });

  it('caps a long local history at the last 30 valid entries', () => {
    const entries = Array.from({ length: 52 }, (_, i) =>
      ({ date: `Day ${i}`, score: 50 }));
    const records = parsePulseHistory(JSON.stringify(entries));
    expect(records).toHaveLength(30);
    expect(records[0]).toEqual(entries[22]);
  });

  it('rejects the previous account completing a Firestore load late', () => {
    expect(mayApplyAccountLoad('user-A', 'user-B', false)).toBe(false);
    expect(mayApplyAccountLoad('user-A', 'user-A', true)).toBe(false);
    expect(mayApplyAccountLoad('user-A', 'user-A', false)).toBe(true);
    expect(mayApplyAccountLoad(null, null, false)).toBe(true);
  });
});
