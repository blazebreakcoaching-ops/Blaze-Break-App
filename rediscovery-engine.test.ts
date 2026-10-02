import { describe, it, expect } from 'vitest';
import {
  nextStateForConfirmation, pickNextQuietQuestion, QUIET_QUESTIONS, isReadyForDeeperReflection,
  shouldAskWhyOnPlate, WHY_ON_PLATE_ASK_INTERVAL, detectOneLessThingCategoryImbalance,
  detectRecurringMustDo, detectCapacityMismatchWithoutReduction, suggestExperimentForInsight,
  GENERIC_EXPERIMENT_PROMPT, OneLessThingReductionRecord, WorkloadCheckSnapshot,
} from './rediscovery-engine';

describe('nextStateForConfirmation', () => {
  it('only "yes" confirms - never presenting a tentative read as fact', () => {
    expect(nextStateForConfirmation('yes')).toBe('user_confirmed');
  });
  it('"no" rejects rather than quietly keeping it around', () => {
    expect(nextStateForConfirmation('no')).toBe('rejected');
  });
  it('"partly" and "explore" both stay tentative', () => {
    expect(nextStateForConfirmation('partly')).toBe('still_exploring');
    expect(nextStateForConfirmation('explore')).toBe('still_exploring');
  });
});

describe('pickNextQuietQuestion', () => {
  it('starts at the first question with no history', () => {
    expect(pickNextQuietQuestion(null).id).toBe(QUIET_QUESTIONS[0].id);
  });
  it('rotates deterministically through the whole bank, never repeating back-to-back', () => {
    let lastId: string | null = null;
    const seen = new Set<string>();
    for (let i = 0; i < QUIET_QUESTIONS.length; i++) {
      const q = pickNextQuietQuestion(lastId);
      expect(seen.has(q.id)).toBe(false);
      seen.add(q.id);
      lastId = q.id;
    }
    expect(seen.size).toBe(QUIET_QUESTIONS.length);
  });
  it('wraps back to the first question after the last', () => {
    const lastQuestion = QUIET_QUESTIONS[QUIET_QUESTIONS.length - 1];
    expect(pickNextQuietQuestion(lastQuestion.id).id).toBe(QUIET_QUESTIONS[0].id);
  });
});

describe('isReadyForDeeperReflection', () => {
  it('stabilises first when capacity is low and the delta is negative', () => {
    expect(isReadyForDeeperReflection({ capacityLow: true, energyDeltaNegative: true, requestedPracticalHelp: false })).toBe(false);
  });
  it('never goes deeper when the user explicitly asked for practical help', () => {
    expect(isReadyForDeeperReflection({ capacityLow: false, energyDeltaNegative: false, requestedPracticalHelp: true })).toBe(false);
  });
  it('is ready when neither condition holds', () => {
    expect(isReadyForDeeperReflection({ capacityLow: false, energyDeltaNegative: null, requestedPracticalHelp: false })).toBe(true);
  });
  it('is ready when only one of the two overload signals is true', () => {
    expect(isReadyForDeeperReflection({ capacityLow: true, energyDeltaNegative: false, requestedPracticalHelp: false })).toBe(true);
  });
});

describe('shouldAskWhyOnPlate', () => {
  it('does not ask on the first or second completion', () => {
    expect(shouldAskWhyOnPlate(0)).toBe(false);
    expect(shouldAskWhyOnPlate(1)).toBe(false);
  });
  it('asks on every interval-th completion, never every time', () => {
    expect(shouldAskWhyOnPlate(WHY_ON_PLATE_ASK_INTERVAL - 1)).toBe(true);
    expect(shouldAskWhyOnPlate(2 * WHY_ON_PLATE_ASK_INTERVAL - 1)).toBe(true);
    expect(shouldAskWhyOnPlate(WHY_ON_PLATE_ASK_INTERVAL)).toBe(false);
  });
});

describe('detectOneLessThingCategoryImbalance', () => {
  const rec = (category: OneLessThingReductionRecord['category']): OneLessThingReductionRecord => ({ category });

  it('returns null below the minimum sample', () => {
    expect(detectOneLessThingCategoryImbalance([rec('professional'), rec('professional')])).toBeNull();
  });
  it('returns null when the mix is not genuinely dominant', () => {
    const records = [rec('professional'), rec('professional'), rec('social'), rec('social'), rec('emotional')];
    expect(detectOneLessThingCategoryImbalance(records)).toBeNull();
  });
  it('surfaces the dominant category once it clearly dominates', () => {
    const records = [rec('professional'), rec('professional'), rec('professional'), rec('professional'), rec('social')];
    expect(detectOneLessThingCategoryImbalance(records)).toBe('professional');
  });
});

describe('detectRecurringMustDo', () => {
  const snap = (titles: string[]): WorkloadCheckSnapshot => ({ mustDoTitles: titles });

  it('returns null below the minimum number of checks', () => {
    expect(detectRecurringMustDo([snap(['Quarterly review']), snap(['Quarterly review'])])).toBeNull();
  });
  it('returns null when nothing recurs enough', () => {
    expect(detectRecurringMustDo([snap(['A']), snap(['B']), snap(['C'])])).toBeNull();
  });
  it('surfaces a title that keeps recurring, case/whitespace-insensitively', () => {
    const snapshots = [snap(['  Quarterly Review  ']), snap(['quarterly review']), snap(['Quarterly review', 'Other task'])];
    expect(detectRecurringMustDo(snapshots)).toBe('quarterly review');
  });
  it('counts a repeated title within one snapshot only once', () => {
    const snapshots = [snap(['Same', 'Same']), snap(['Same']), snap(['Same']), snap(['Other'])];
    // 4 snapshots, "same" appears in 3 of them (deduped within the first) - meets the threshold.
    expect(detectRecurringMustDo(snapshots)).toBe('same');
  });
});

describe('detectCapacityMismatchWithoutReduction', () => {
  it('is false when reductions have kept pace', () => {
    expect(detectCapacityMismatchWithoutReduction(4, 3)).toBe(false);
  });
  it('is true when mismatches pile up with almost no reduction', () => {
    expect(detectCapacityMismatchWithoutReduction(3, 1)).toBe(true);
    expect(detectCapacityMismatchWithoutReduction(5, 0)).toBe(true);
  });
  it('is false below the mismatch threshold', () => {
    expect(detectCapacityMismatchWithoutReduction(2, 0)).toBe(false);
  });
});

describe('suggestExperimentForInsight', () => {
  it('matches a known insight keyword to its template', () => {
    expect(suggestExperimentForInsight('I rarely protect time for myself')).toContain('30 minutes');
    expect(suggestExperimentForInsight('I miss creativity in my week')).toContain('creative');
  });
  it('falls back to the generic prompt for anything unmatched', () => {
    expect(suggestExperimentForInsight('something totally unrelated')).toBe(GENERIC_EXPERIMENT_PROMPT);
  });
});
