import { describe, it, expect } from 'vitest';
import { PRESET_ROUTINES, PRESET_ROUTINE_ORDER, EVENING_ISLAMIC_CLOSING } from './grounding-routines';

describe('PRESET_ROUTINES', () => {
  it('has all 4 preset routines from the brief', () => {
    expect(PRESET_ROUTINE_ORDER).toEqual(['morning', 'evening', 'before_difficult', 'after_difficult']);
  });

  it('gives every preset routine at least 3 real questions', () => {
    for (const type of PRESET_ROUTINE_ORDER) {
      const routine = PRESET_ROUTINES[type];
      expect(routine.prompts.length).toBeGreaterThanOrEqual(3);
      for (const p of routine.prompts) {
        expect(p.trim().endsWith('?')).toBe(true);
      }
    }
  });

  it('Morning Grounding ends with an intention, not another open question', () => {
    expect(PRESET_ROUTINES.morning.finishPrompt).toBeTruthy();
  });

  it('only Morning and Evening support a daily reminder - the Difficult routines are event-triggered, not time-of-day', () => {
    expect(PRESET_ROUTINES.morning.supportsDailyReminder).toBe(true);
    expect(PRESET_ROUTINES.evening.supportsDailyReminder).toBe(true);
    expect(PRESET_ROUTINES.before_difficult.supportsDailyReminder).toBe(false);
    expect(PRESET_ROUTINES.after_difficult.supportsDailyReminder).toBe(false);
  });
});

describe('EVENING_ISLAMIC_CLOSING', () => {
  it('is the brief\'s exact non-obligatory closing line', () => {
    expect(EVENING_ISLAMIC_CLOSING).toBe("You have taken today's available means. Allow tonight to end.");
  });
});
