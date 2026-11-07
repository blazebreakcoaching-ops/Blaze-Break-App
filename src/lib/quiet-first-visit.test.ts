import { describe, expect, it } from 'vitest';
import { shouldPausePassivePrompts, type FirstVisitUIState } from './quiet-first-visit';

const idle: FirstVisitUIState = {
  welcome: false,
  novaGuide: false,
  coachMarks: false,
  dailyCheckIn: false,
  settings: false,
  walkthrough: false,
  support: false,
  launcher: false,
};

describe('quiet-first-visit presentation priority', () => {
  it('allows optional announcements when no important task is in progress', () => {
    expect(shouldPausePassivePrompts(idle)).toBe(false);
  });

  it.each(Object.keys(idle) as (keyof FirstVisitUIState)[])(
    'pauses passive nudges while %s is active',
    key => {
      expect(shouldPausePassivePrompts({ ...idle, [key]: true })).toBe(true);
    },
  );

  it('returns to normal once the visitor closes the guide and welcome', () => {
    const busy = { ...idle, novaGuide: true, welcome: true };
    expect(shouldPausePassivePrompts(busy)).toBe(true);
    expect(shouldPausePassivePrompts({ ...busy, novaGuide: false, welcome: false })).toBe(false);
  });
});
