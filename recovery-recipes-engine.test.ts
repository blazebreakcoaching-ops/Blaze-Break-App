import { describe, it, expect } from 'vitest';
import { buildRecoveryRecipe, getRecipeFallback, adaptRecoveryRecipe, getSuggestedRecipe } from './recovery-recipes-engine';
import { RECIPE_TEMPLATES, SITUATION_ORDER } from './recovery-recipes-content';
import { MovementUsageEntry } from './movement-snacks-recommendation';

describe('buildRecoveryRecipe', () => {
  it('builds a valid recipe for every real situation with default capacity', () => {
    for (const key of SITUATION_ORDER) {
      const recipe = buildRecoveryRecipe({ situationKey: key });
      expect(recipe.steps.length).toBeGreaterThan(0);
      expect(recipe.recipeTitle.length).toBeGreaterThan(0);
      expect(recipe.estimatedDurationMinutes).toBeGreaterThan(0);
    }
  });

  it('falls back to the universal reset recipe for an unrecognised situation, never throwing', () => {
    const recipe = buildRecoveryRecipe({ situationKey: 'not_a_real_situation' as any });
    expect(recipe.templateId).toBe('just_need_reset');
    expect(recipe.steps.length).toBeGreaterThan(0);
  });

  it('gives an over-capacity user at "almost nothing" only 1-2 steps, never a long protocol (acceptance test)', () => {
    const recipe = buildRecoveryRecipe({ situationKey: 'over_capacity', capacity: 'almost_nothing' });
    expect(recipe.steps.length).toBeLessThanOrEqual(2);
  });

  it('never includes the deepStep unless capacity is "can_go_deeper"', () => {
    for (const capacity of ['almost_nothing', 'a_little', 'some_space'] as const) {
      const recipe = buildRecoveryRecipe({ situationKey: 'slept_badly', capacity });
      const deepStepId = RECIPE_TEMPLATES.slept_badly.deepStep!.id;
      expect(recipe.steps.some((s) => s.id === deepStepId)).toBe(false);
    }
    const deep = buildRecoveryRecipe({ situationKey: 'slept_badly', capacity: 'can_go_deeper' });
    expect(deep.steps.some((s) => s.id === RECIPE_TEMPLATES.slept_badly.deepStep!.id)).toBe(true);
  });

  it('optionalSteps mirrors whatever capacity left out, so the UI can offer "add one more step"', () => {
    const recipe = buildRecoveryRecipe({ situationKey: 'slept_badly', capacity: 'almost_nothing' });
    const leftOverIds = new Set(recipe.optionalSteps.map((s) => s.id));
    expect(leftOverIds.has(RECIPE_TEMPLATES.slept_badly.expandedSteps[0]!.id)).toBe(true);
    expect(leftOverIds.has(RECIPE_TEMPLATES.slept_badly.deepStep!.id)).toBe(true);
  });

  it('respects a time budget by trimming optional content, never the core steps', () => {
    const recipe = buildRecoveryRecipe({ situationKey: 'need_switch_off', capacity: 'can_go_deeper', timeAvailableMinutes: 1 });
    const coreIds = RECIPE_TEMPLATES.need_switch_off.coreSteps.map((s) => s.id);
    for (const id of coreIds) expect(recipe.steps.some((s) => s.id === id)).toBe(true);
  });

  it('swaps a movement step away from a recently "more uncomfortable" movement, using the real recommendation engine', () => {
    // 'angry's whole_body_shake falls back to the 'restless_stuck' context,
    // which has several other real candidates - unlike shake_meeting
    // (hard_meeting's only context match), so a swap actually has
    // somewhere to go.
    const usage: MovementUsageEntry[] = [{ movementId: 'whole_body_shake', completionCount: 1, recentlyUncomfortable: true }];
    const recipe = buildRecoveryRecipe({ situationKey: 'angry', movementUsage: usage });
    const movementStep = recipe.steps.find((s) => s.type === 'movement');
    expect(movementStep?.movementId).not.toBe('whole_body_shake');
  });

  it('leaves a movement step alone when there is no usage history for it', () => {
    const recipe = buildRecoveryRecipe({ situationKey: 'hard_meeting' });
    const movementStep = recipe.steps.find((s) => s.type === 'movement');
    expect(movementStep?.movementId).toBe('shake_meeting');
  });

  it('reports the originally requested situation as sourceContext even when it falls back', () => {
    const recipe = buildRecoveryRecipe({ situationKey: 'nonsense' as any });
    expect(recipe.sourceContext).toBe('nonsense');
  });
});

describe('getRecipeFallback', () => {
  it('always returns the universal reset recipe regardless of context (works with no Firebase/no AI - section 31)', () => {
    const recipe = getRecipeFallback();
    expect(recipe.templateId).toBe('just_need_reset');
  });

  it('carries through capacity when given', () => {
    const recipe = getRecipeFallback({ capacity: 'almost_nothing' });
    expect(recipe.steps.length).toBeLessThanOrEqual(2);
  });
});

describe('adaptRecoveryRecipe', () => {
  it('reveal_situation rebuilds under a completely different, more apt template (section 11)', () => {
    const adapted = adaptRecoveryRecipe({ situationKey: 'cannot_focus', capacity: 'some_space' }, { type: 'reveal_situation', situationKey: 'slept_badly' });
    expect(adapted.templateId).toBe('slept_badly');
  });

  it('lower_capacity steps down exactly one level, not straight to the floor', () => {
    const adapted = adaptRecoveryRecipe({ situationKey: 'over_capacity', capacity: 'can_go_deeper' }, { type: 'lower_capacity' });
    // one level below can_go_deeper is some_space, which still includes expandedSteps
    const expandedId = RECIPE_TEMPLATES.over_capacity.expandedSteps[0]!.id;
    expect(adapted.steps.some((s) => s.id === expandedId)).toBe(true);
    expect(adapted.steps.length).toBeLessThan(buildRecoveryRecipe({ situationKey: 'over_capacity', capacity: 'can_go_deeper' }).steps.length + 1);
  });

  it('lower_capacity never goes below "almost_nothing"', () => {
    const adapted = adaptRecoveryRecipe({ situationKey: 'over_capacity', capacity: 'almost_nothing' }, { type: 'lower_capacity' });
    expect(adapted.steps.length).toBeLessThanOrEqual(2);
  });

  it('shorten drops straight to the tightest recipe regardless of starting capacity', () => {
    const adapted = adaptRecoveryRecipe({ situationKey: 'need_switch_off', capacity: 'can_go_deeper' }, { type: 'shorten' });
    expect(adapted.steps.length).toBeLessThanOrEqual(RECIPE_TEMPLATES.need_switch_off.coreSteps.length);
  });
});

describe('situation-level acceptance criteria (Batch 4 content audit)', () => {
  it('numb never surfaces a reflection question at any capacity - "do not force introspection" holds at every level, not just the template default', () => {
    for (const capacity of ['almost_nothing', 'a_little', 'some_space', 'can_go_deeper'] as const) {
      const recipe = buildRecoveryRecipe({ situationKey: 'numb', capacity });
      expect(recipe.steps.some((s) => s.type === 'nova_reflection')).toBe(false);
    }
  });

  it('an over-capacity user at "almost nothing" gets no more than 2 real steps, matching the brief\'s own worked example', () => {
    const recipe = buildRecoveryRecipe({ situationKey: 'over_capacity', capacity: 'almost_nothing' });
    expect(recipe.steps.length).toBeLessThanOrEqual(2);
    expect(recipe.closingAction).toBe('One thing is enough for now.');
  });

  it('a hard-meeting recipe deep-links Shake Off the Meeting and asks only whether action is needed (acceptance test, section 39)', () => {
    const recipe = buildRecoveryRecipe({ situationKey: 'hard_meeting' });
    const movementStep = recipe.steps.find((s) => s.type === 'movement');
    expect(movementStep?.movementId).toBe('shake_meeting');
    const actionStep = recipe.steps.find((s) => s.type === 'practical_action');
    expect(actionStep?.choices?.map((c) => c.id)).toEqual(['yes', 'no']);
  });

  it('a switch-off recipe hands into After-Work Decompression (acceptance test, section 39)', () => {
    const recipe = buildRecoveryRecipe({ situationKey: 'need_switch_off' });
    expect(recipe.steps.some((s) => s.type === 'movement' && s.movementId === 'after_work')).toBe(true);
  });

  it('a rest-guilt recipe may use grounding without ever launching the full Grounding journey (section 39) - only an inline excerpt', () => {
    const recipe = buildRecoveryRecipe({ situationKey: 'guilty_resting', capacity: 'some_space' });
    const groundingStep = recipe.steps.find((s) => s.type === 'grounding');
    expect(groundingStep?.groundingExcerpt).toBeTruthy();
  });

  it('a no-AI build still produces a genuinely useful recipe for every situation (acceptance test, section 39)', () => {
    // buildRecoveryRecipe never calls anything AI/network-backed - this
    // just re-confirms that holds for every situation, not only the
    // fallback template.
    for (const key of SITUATION_ORDER) {
      const recipe = buildRecoveryRecipe({ situationKey: key });
      expect(recipe.steps.length).toBeGreaterThan(0);
    }
  });
});

describe('getSuggestedRecipe', () => {
  it('suggests the switch-off recipe in the evening', () => {
    const recipe = getSuggestedRecipe({ hourLocal: 19 });
    expect(recipe.templateId).toBe('need_switch_off');
  });

  it('suggests the universal reset outside the evening window, never returning nothing', () => {
    const recipe = getSuggestedRecipe({ hourLocal: 10 });
    expect(recipe.templateId).toBe('just_need_reset');
  });

  it('works with zero context at all (Firebase/Nova unavailable - section 31)', () => {
    const recipe = getSuggestedRecipe({});
    expect(recipe.steps.length).toBeGreaterThan(0);
  });
});

describe('Batch 6 personalisation', () => {
  it('uses preferredDurationCategory to pick a default capacity only when no explicit capacity is given', () => {
    const quick = buildRecoveryRecipe({ situationKey: 'slept_badly', preferredDurationCategory: 'quick' });
    expect(quick.steps.length).toBeLessThanOrEqual(2);
    const deep = buildRecoveryRecipe({ situationKey: 'slept_badly', preferredDurationCategory: 'deep' });
    expect(deep.steps.some((s) => s.id === RECIPE_TEMPLATES.slept_badly.deepStep!.id)).toBe(true);
  });

  it('an explicit capacity always overrides preferredDurationCategory', () => {
    const recipe = buildRecoveryRecipe({ situationKey: 'slept_badly', capacity: 'almost_nothing', preferredDurationCategory: 'deep' });
    expect(recipe.steps.length).toBeLessThanOrEqual(2);
  });

  it('reorders optionalSteps by helpfulStepTypes without dropping or adding anything', () => {
    const plain = buildRecoveryRecipe({ situationKey: 'slept_badly', capacity: 'almost_nothing' });
    const expandedId = RECIPE_TEMPLATES.slept_badly.expandedSteps[0]!.id;
    const deepId = RECIPE_TEMPLATES.slept_badly.deepStep!.id;
    expect(plain.optionalSteps.map((s) => s.id)).toEqual([expandedId, deepId]);

    // Put nova_reflection (the deepStep's type) ahead of release (the
    // expandedStep's type) and confirm the order flips, same two ids.
    const reordered = buildRecoveryRecipe({ situationKey: 'slept_badly', capacity: 'almost_nothing', helpfulStepTypes: ['nova_reflection', 'release'] });
    expect(reordered.optionalSteps.map((s) => s.id)).toEqual([deepId, expandedId]);
  });

  it('helpfulStepTypes never changes which steps are included, only optionalSteps order', () => {
    const withPref = buildRecoveryRecipe({ situationKey: 'slept_badly', capacity: 'almost_nothing', helpfulStepTypes: ['grounding'] });
    const without = buildRecoveryRecipe({ situationKey: 'slept_badly', capacity: 'almost_nothing' });
    expect(withPref.steps.map((s) => s.id)).toEqual(without.steps.map((s) => s.id));
  });
});
