import { describe, it, expect } from 'vitest';
import { isQuietHoursTime, quietHoursCheckPasses } from './ally-nudge-quiet-hours';

describe('isQuietHoursTime', () => {
  it('flags times at and after 9:00 PM', () => {
    expect(isQuietHoursTime('21:00')).toBe(true);
    expect(isQuietHoursTime('23:59')).toBe(true);
  });

  it('flags times before 7:00 AM', () => {
    expect(isQuietHoursTime('00:00')).toBe(true);
    expect(isQuietHoursTime('06:59')).toBe(true);
  });

  it('does not flag 7:00 AM itself or daytime/evening times up to 8:59 PM', () => {
    expect(isQuietHoursTime('07:00')).toBe(false);
    expect(isQuietHoursTime('09:00')).toBe(false);
    expect(isQuietHoursTime('20:59')).toBe(false);
  });

  it('returns false for a malformed time rather than throwing', () => {
    expect(isQuietHoursTime('25:00')).toBe(false);
    expect(isQuietHoursTime('not-a-time')).toBe(false);
    expect(isQuietHoursTime('')).toBe(false);
  });
});

describe('quietHoursCheckPasses', () => {
  it('passes for a daytime time regardless of acknowledgement', () => {
    expect(quietHoursCheckPasses('09:00', undefined)).toBe(true);
    expect(quietHoursCheckPasses('09:00', false)).toBe(true);
  });

  it('blocks a quiet-hours time unless explicitly acknowledged', () => {
    expect(quietHoursCheckPasses('23:00', undefined)).toBe(false);
    expect(quietHoursCheckPasses('23:00', false)).toBe(false);
    expect(quietHoursCheckPasses('23:00', true)).toBe(true);
  });

  it('never blocks when time is undefined - a partial update that does not touch time', () => {
    expect(quietHoursCheckPasses(undefined, undefined)).toBe(true);
  });
});
