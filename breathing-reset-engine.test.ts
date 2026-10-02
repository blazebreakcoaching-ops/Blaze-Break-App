import { describe, it, expect } from 'vitest';
import {
  recommendPractice, DEFAULT_OVERWHELM_PRACTICE, shouldDiscourageMoreBreathing,
  shouldAskDidItHelp, DID_IT_HELP_ASK_INTERVAL, computeMostHelpfulPractice,
  computeBreathingEffectivenessSignal, shouldSuggestLoadIsRealProblem, MIN_RESETS_FOR_LOAD_CALLOUT,
  maxChoicesForIntensity, BREATHING_LIBRARY, BREATHING_LIBRARY_ORDER, PracticeFeedbackEntry, CheckpointResponse,
} from './breathing-reset-engine';

describe('BREATHING_LIBRARY', () => {
  it('never uses an overclaiming clinical phrase in any practice copy', () => {
    const banned = ['carbon dioxide', 'aligns heart rate', 'parasympathetic', 'balances the nervous system', 'resets the nervous system', 'physiological interrupt', 'neural reset'];
    for (const id of BREATHING_LIBRARY_ORDER) {
      const text = `${BREATHING_LIBRARY[id].description} ${BREATHING_LIBRARY[id].supportingCopy || ''}`.toLowerCase();
      for (const phrase of banned) {
        expect(text).not.toContain(phrase);
      }
    }
  });
});

describe('recommendPractice', () => {
  it('defaults to Extended Exhale with no need and no other context - the brief\'s own worked example', () => {
    expect(recommendPractice(null, { isEveningWindDown: false, preferredPractice: null })).toBe(DEFAULT_OVERWHELM_PRACTICE);
  });
  it('recommends gentler Wind Down practice in the evening with no need selected', () => {
    expect(recommendPractice(null, { isEveningWindDown: true, preferredPractice: null })).toBe('478');
  });
  it('maps Steady and Focus both to Box Breathing', () => {
    expect(recommendPractice('steady', { isEveningWindDown: false, preferredPractice: null })).toBe('box');
    expect(recommendPractice('focus', { isEveningWindDown: false, preferredPractice: null })).toBe('box');
  });
  it('Sleep always recommends 4-7-8, even with a different preference override attempted elsewhere', () => {
    expect(recommendPractice('sleep', { isEveningWindDown: false, preferredPractice: null })).toBe('478');
  });
  it('a real learned preference overrides the generic need mapping', () => {
    expect(recommendPractice('clarity', { isEveningWindDown: false, preferredPractice: 'calm' })).toBe('calm');
  });
});

describe('shouldDiscourageMoreBreathing', () => {
  it('is true only for "more_unsettled"', () => {
    expect(shouldDiscourageMoreBreathing('more_unsettled')).toBe(true);
    expect(shouldDiscourageMoreBreathing('calmer')).toBe(false);
    expect(shouldDiscourageMoreBreathing('about_same')).toBe(false);
    expect(shouldDiscourageMoreBreathing('not_sure')).toBe(false);
  });
});

describe('shouldAskDidItHelp', () => {
  it('never asks after a "more_unsettled" session - that answer is itself the feedback', () => {
    expect(shouldAskDidItHelp(DID_IT_HELP_ASK_INTERVAL - 1, 'more_unsettled')).toBe(false);
  });
  it('asks every interval-th session, never every time', () => {
    expect(shouldAskDidItHelp(DID_IT_HELP_ASK_INTERVAL - 1, 'calmer')).toBe(true);
    expect(shouldAskDidItHelp(0, 'calmer')).toBe(false);
    expect(shouldAskDidItHelp(1, 'calmer')).toBe(false);
  });
});

describe('computeMostHelpfulPractice', () => {
  const entry = (practiceId: PracticeFeedbackEntry['practiceId'], helpful: PracticeFeedbackEntry['helpful']): PracticeFeedbackEntry => ({ practiceId, helpful });

  it('returns null with no entries', () => {
    expect(computeMostHelpfulPractice([])).toBeNull();
  });
  it('returns null below the minimum sample even if glowing', () => {
    expect(computeMostHelpfulPractice([entry('extended', 'yes'), entry('extended', 'yes')])).toBeNull();
  });
  it('surfaces a practice once it clears the minimum and trends positive', () => {
    const result = computeMostHelpfulPractice([entry('extended', 'yes'), entry('extended', 'yes'), entry('extended', 'a_little')]);
    expect(result).toBe('extended');
  });
  it('does not surface a practice that trends non-positive', () => {
    const result = computeMostHelpfulPractice([entry('box', 'not_really'), entry('box', 'a_little'), entry('box', 'not_really')]);
    expect(result).toBeNull();
  });
});

describe('computeBreathingEffectivenessSignal', () => {
  it('is null below the minimum sample', () => {
    expect(computeBreathingEffectivenessSignal(['calmer', 'calmer'])).toBeNull();
  });
  it('reads "inconsistent" when most recent checkpoints were not helpful', () => {
    const recent: CheckpointResponse[] = ['more_unsettled', 'about_same', 'calmer'];
    expect(computeBreathingEffectivenessSignal(recent)).toBe('inconsistent');
  });
  it('reads "reliable" when most recent checkpoints were calmer', () => {
    const recent: CheckpointResponse[] = ['calmer', 'calmer', 'about_same'];
    expect(computeBreathingEffectivenessSignal(recent)).toBe('reliable');
  });
});

describe('shouldSuggestLoadIsRealProblem', () => {
  it('requires both repeat use and a genuine capacity/load mismatch', () => {
    expect(shouldSuggestLoadIsRealProblem(MIN_RESETS_FOR_LOAD_CALLOUT, true)).toBe(true);
    expect(shouldSuggestLoadIsRealProblem(MIN_RESETS_FOR_LOAD_CALLOUT - 1, true)).toBe(false);
    expect(shouldSuggestLoadIsRealProblem(MIN_RESETS_FOR_LOAD_CALLOUT, false)).toBe(false);
    expect(shouldSuggestLoadIsRealProblem(MIN_RESETS_FOR_LOAD_CALLOUT, null)).toBe(false);
  });
});

describe('maxChoicesForIntensity', () => {
  it('reduces available choices as intensity increases', () => {
    expect(maxChoicesForIntensity('a_bit')).toBe(3);
    expect(maxChoicesForIntensity('quite')).toBe(2);
    expect(maxChoicesForIntensity('very')).toBe(1);
  });
});
