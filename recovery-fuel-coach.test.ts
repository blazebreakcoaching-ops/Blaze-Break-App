import { describe, it, expect } from 'vitest';
import {
  getFuelOpening, hasRichOverloadContext, getFuelFollowUpQuestion, getFuelRecommendation,
  getProactiveRecommendation, computeFuelPatternConfidence, computeMostHelpfulFuelAction,
  FuelContextSnapshot, FuelHelpfulnessEntry,
} from './recovery-fuel-coach';

const emptyCtx: FuelContextSnapshot = { capacityLow: null, energyDeltaNegative: null, sleepShortfallHigh: null, loggedAteToday: null };
const richCtx: FuelContextSnapshot = { capacityLow: true, energyDeltaNegative: true, sleepShortfallHigh: true, loggedAteToday: null };

describe('getFuelOpening', () => {
  it('uses the default prompt when context is not rich enough', () => {
    expect(getFuelOpening(emptyCtx)).toEqual({ proactive: false, line: 'How are you doing right now?' });
  });

  it("matches the brief's own rich-context example exactly - capacity low, sleep short, delta negative", () => {
    const opening = getFuelOpening(richCtx);
    expect(opening.proactive).toBe(true);
    expect(opening.line).toContain('capacity is already low');
  });

  it('is not proactive when only some of the three signals are known', () => {
    expect(hasRichOverloadContext({ ...richCtx, sleepShortfallHigh: null })).toBe(false);
    expect(hasRichOverloadContext({ ...richCtx, capacityLow: false })).toBe(false);
  });
});

describe('getFuelFollowUpQuestion', () => {
  it('never asks a follow-up for self-explanatory triggers', () => {
    for (const trigger of ['not_eaten', 'need_drink', 'running_on_caffeine', 'no_sleep', 'okay'] as const) {
      expect(getFuelFollowUpQuestion(trigger, emptyCtx)).toBeNull();
    }
  });

  it('asks the eating question for an ambiguous "running low" trigger with no known context', () => {
    const q = getFuelFollowUpQuestion('running_low', emptyCtx);
    expect(q?.prompt).toBe('Have you eaten anything substantial recently?');
  });

  it('does not ask again when today\'s eating status is already logged', () => {
    expect(getFuelFollowUpQuestion('running_low', { ...emptyCtx, loggedAteToday: true })).toBeNull();
    expect(getFuelFollowUpQuestion('overloaded', { ...emptyCtx, loggedAteToday: false })).toBeNull();
  });

  it('skips the question for "overloaded" when the rich overload context already resolves it', () => {
    expect(getFuelFollowUpQuestion('overloaded', richCtx)).toBeNull();
  });

  it('still asks for "overloaded" when context is only partially known', () => {
    expect(getFuelFollowUpQuestion('overloaded', emptyCtx)).not.toBeNull();
  });
});

describe('getFuelRecommendation - matches the brief\'s 20-second example exactly', () => {
  it('"Not really" (not eaten) -> single primary action, no optimisation pile-on', () => {
    const rec = getFuelRecommendation('running_low', 'not_really', emptyCtx);
    expect(rec.novaLine).toBe("Okay. Don't optimise everything. Start with one basic.");
    expect(rec.primary).toBe('eat');
    expect(rec.secondary).toEqual(['drink', 'take_break', 'reduce_load']);
  });
});

describe('getFuelRecommendation - trigger-specific behaviour', () => {
  it('no_sleep reuses Recovery Debt framing and recommends reducing load, not another fix', () => {
    const rec = getFuelRecommendation('no_sleep', null, emptyCtx);
    expect(rec.primary).toBe('reduce_load');
    expect(rec.novaLine).toContain('Sleep was short');
  });

  it('okay gives no forced primary action', () => {
    const rec = getFuelRecommendation('okay', null, emptyCtx);
    expect(rec.primary).toBeNull();
    expect(rec.secondary).toEqual([]);
  });

  it('overloaded with rich context recommends One Less Thing over another recovery task', () => {
    const rec = getFuelRecommendation('overloaded', null, richCtx);
    expect(rec.primary).toBe('one_less_thing');
    expect(rec.novaLine).toContain("let's remove something");
  });

  it('overloaded without rich context falls back to the eating answer', () => {
    const rec = getFuelRecommendation('overloaded', 'not_really', emptyCtx);
    expect(rec.primary).toBe('eat');
  });

  it('overloaded without rich context and a fine eating answer recommends slowing down', () => {
    const rec = getFuelRecommendation('overloaded', 'yes', emptyCtx);
    expect(rec.primary).toBe('take_break');
  });

  it('running_low with an implied (already-logged) "not eaten" answer skips straight to the same recommendation', () => {
    const rec = getFuelRecommendation('running_low', null, { ...emptyCtx, loggedAteToday: false });
    expect(rec.primary).toBe('eat');
  });

  it('running_low with a fine eating answer falls back to checking capacity, not a forced task', () => {
    const rec = getFuelRecommendation('running_low', 'yes', emptyCtx);
    expect(rec.primary).toBe('check_capacity');
  });
});

describe('getProactiveRecommendation', () => {
  it('"Not really" leads with eating, same as the standard flow', () => {
    expect(getProactiveRecommendation('not_really').primary).toBe('eat');
  });

  it('"Can\'t remember" is treated the same as "Not really" - still actionable, never stuck', () => {
    expect(getProactiveRecommendation('cant_remember').primary).toBe('eat');
  });

  it('"Yes" (basics covered) recommends removing load instead of adding another task', () => {
    const rec = getProactiveRecommendation('yes');
    expect(rec.primary).toBe('one_less_thing');
  });
});

describe('computeFuelPatternConfidence', () => {
  it('is null below the 3-checkin minimum - never implies a pattern from almost nothing', () => {
    expect(computeFuelPatternConfidence(0)).toBeNull();
    expect(computeFuelPatternConfidence(2)).toBeNull();
  });

  it('moves from early to emerging to consistent as the sample grows', () => {
    expect(computeFuelPatternConfidence(3)).toBe('early');
    expect(computeFuelPatternConfidence(6)).toBe('emerging');
    expect(computeFuelPatternConfidence(12)).toBe('consistent');
  });
});

describe('computeMostHelpfulFuelAction', () => {
  const entry = (action: FuelHelpfulnessEntry['action'], helpful: FuelHelpfulnessEntry['helpful']): FuelHelpfulnessEntry => ({ action, helpful });

  it('returns null with no entries', () => {
    expect(computeMostHelpfulFuelAction([])).toBeNull();
  });

  it('returns null below the minimum sample size even if every rating is glowing', () => {
    expect(computeMostHelpfulFuelAction([entry('daylight', 'yes'), entry('daylight', 'yes')])).toBeNull();
  });

  it('surfaces an action once it clears the minimum and trends positive', () => {
    const result = computeMostHelpfulFuelAction([entry('daylight', 'yes'), entry('daylight', 'yes'), entry('daylight', 'a_little')]);
    expect(result?.action).toBe('daylight');
    expect(result?.confidence).toBe('early');
  });

  it('does not surface an action that trends non-positive even with enough samples', () => {
    const result = computeMostHelpfulFuelAction([entry('somatic_reset', 'not_really'), entry('somatic_reset', 'a_little'), entry('somatic_reset', 'not_really')]);
    expect(result).toBeNull();
  });

  it('picks the single best-performing action when several qualify', () => {
    const result = computeMostHelpfulFuelAction([
      ...Array(3).fill(null).map(() => entry('daylight', 'a_little' as const)),
      ...Array(3).fill(null).map(() => entry('take_break', 'yes' as const)),
    ]);
    expect(result?.action).toBe('take_break');
  });
});
