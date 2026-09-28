import { describe, it, expect } from 'vitest';
import {
  PROMPT_FAMILIES, selectAdaptivePrompt, getSessionDepthRecommendation,
  RECOMMEND_RESET_MIN_REPEAT_COUNT, CLOSING_STYLES, PROMPT_COOLDOWN_DAYS,
  SESSION_DEPTH_LABELS, CAPACITY_LABELS, PromptHistoryEntry,
} from './grounding-adaptive';
import { PATTERN_DIMENSION_ORDER } from './grounding-patterns-taxonomy';

describe('PROMPT_FAMILIES', () => {
  it('has a prompt family for every one of the 27 taxonomy dimensions, no more, no fewer', () => {
    expect(new Set(Object.keys(PROMPT_FAMILIES))).toEqual(new Set(PATTERN_DIMENSION_ORDER));
  });

  it('gives every dimension at least 4 distinct prompts, each ending in a real question', () => {
    for (const dim of PATTERN_DIMENSION_ORDER) {
      const family = PROMPT_FAMILIES[dim];
      expect(family.length).toBeGreaterThanOrEqual(4);
      const keys = family.map((p) => p.promptKey);
      expect(new Set(keys).size).toBe(keys.length);
      for (const p of family) {
        expect(p.text.trim().endsWith('?')).toBe(true);
        expect(p.text.toLowerCase()).not.toMatch(/you have\b|you suffer from|this proves|you clearly are/);
      }
    }
  });

  it('every promptKey across the whole taxonomy is globally unique', () => {
    const allKeys = Object.values(PROMPT_FAMILIES).flatMap((f) => f.map((p) => p.promptKey));
    expect(new Set(allKeys).size).toBe(allKeys.length);
  });
});

describe('selectAdaptivePrompt', () => {
  it('prefers a never-shown prompt over any already-shown one', () => {
    const history: PromptHistoryEntry[] = [
      { promptKey: 'control_1', lastShownAt: new Date(Date.now() - 200 * 86400000).toISOString(), timesShown: 1, userEngaged: 1, userSkipped: 0 },
      { promptKey: 'control_2', lastShownAt: new Date(Date.now() - 200 * 86400000).toISOString(), timesShown: 1, userEngaged: 1, userSkipped: 0 },
      { promptKey: 'control_3', lastShownAt: new Date(Date.now() - 200 * 86400000).toISOString(), timesShown: 1, userEngaged: 1, userSkipped: 0 },
      // control_4 never shown
    ];
    const chosen = selectAdaptivePrompt('control', history);
    expect(chosen.promptKey).toBe('control_4');
  });

  it('avoids a prompt still within the cooldown window even if every other prompt has been shown before', () => {
    const history: PromptHistoryEntry[] = PROMPT_FAMILIES.control.map((p, i) => ({
      promptKey: p.promptKey,
      lastShownAt: i === 0 ? new Date().toISOString() : new Date(Date.now() - (PROMPT_COOLDOWN_DAYS + 5) * 86400000).toISOString(),
      timesShown: 1,
      userEngaged: 1,
      userSkipped: 0,
    }));
    const chosen = selectAdaptivePrompt('control', history);
    expect(chosen.promptKey).not.toBe('control_1');
  });

  it('prefers a prompt previously marked helpful, once off cooldown, over an unrated one shown the same number of times', () => {
    const longAgo = new Date(Date.now() - 100 * 86400000).toISOString();
    const history: PromptHistoryEntry[] = [
      { promptKey: 'guilt_about_rest_1', lastShownAt: longAgo, timesShown: 2, userEngaged: 2, userSkipped: 0, helpfulRating: 'helpful' },
      { promptKey: 'guilt_about_rest_2', lastShownAt: longAgo, timesShown: 2, userEngaged: 1, userSkipped: 1 },
      { promptKey: 'guilt_about_rest_3', lastShownAt: longAgo, timesShown: 2, userEngaged: 1, userSkipped: 1 },
      { promptKey: 'guilt_about_rest_4', lastShownAt: longAgo, timesShown: 2, userEngaged: 1, userSkipped: 1 },
    ];
    expect(selectAdaptivePrompt('guilt_about_rest', history).promptKey).toBe('guilt_about_rest_1');
  });

  it('strongly avoids a prompt the user has already marked as not helpful', () => {
    const longAgo = new Date(Date.now() - 100 * 86400000).toISOString();
    const history: PromptHistoryEntry[] = [
      { promptKey: 'perfectionism_1', lastShownAt: longAgo, timesShown: 3, userEngaged: 0, userSkipped: 3, helpfulRating: 'not_helpful' },
      { promptKey: 'perfectionism_2', lastShownAt: longAgo, timesShown: 1, userEngaged: 1, userSkipped: 0 },
    ];
    expect(selectAdaptivePrompt('perfectionism', history).promptKey).not.toBe('perfectionism_1');
  });

  it('is deterministic - identical inputs always produce the identical choice', () => {
    const history: PromptHistoryEntry[] = [
      { promptKey: 'trust_1', lastShownAt: new Date(Date.now() - 40 * 86400000).toISOString(), timesShown: 2, userEngaged: 1, userSkipped: 1 },
    ];
    const a = selectAdaptivePrompt('trust', history);
    const b = selectAdaptivePrompt('trust', history);
    expect(a.promptKey).toBe(b.promptKey);
  });
});

describe('getSessionDepthRecommendation', () => {
  it('recommends Reset when capacity is running on empty, regardless of theme history', () => {
    const rec = getSessionDepthRecommendation({ capacity: 'running_on_empty', recentPatternKey: null, recentSameThemeSessionCount: 0 });
    expect(rec).not.toBeNull();
    expect(rec!.depth).toBe('reset');
  });

  it('recommends Reset for a repeated recent theme at low capacity, and explains why', () => {
    const rec = getSessionDepthRecommendation({
      capacity: 'low_capacity', recentPatternKey: 'guilt_about_rest', recentSameThemeSessionCount: RECOMMEND_RESET_MIN_REPEAT_COUNT,
    });
    expect(rec).not.toBeNull();
    expect(rec!.depth).toBe('reset');
    expect(rec!.reason.length).toBeGreaterThan(0);
  });

  it('makes no recommendation (defers to the user) when capacity is healthy and there is no repeated theme', () => {
    const rec = getSessionDepthRecommendation({ capacity: 'ready_to_reflect', recentPatternKey: null, recentSameThemeSessionCount: 0 });
    expect(rec).toBeNull();
  });

  it('never recommends "deep" automatically, under any input combination', () => {
    const inputs = [
      { capacity: 'ready_to_reflect' as const, recentPatternKey: 'purpose' as const, recentSameThemeSessionCount: 10 },
      { capacity: 'some_space' as const, recentPatternKey: 'trust' as const, recentSameThemeSessionCount: 5 },
      { capacity: null, recentPatternKey: null, recentSameThemeSessionCount: 0 },
    ];
    for (const input of inputs) {
      const rec = getSessionDepthRecommendation(input);
      if (rec) expect(rec.depth).not.toBe('deep');
    }
  });

  it('does not recommend Reset for a repeated theme once capacity is comfortably healthy', () => {
    const rec = getSessionDepthRecommendation({
      capacity: 'some_space', recentPatternKey: 'isolation', recentSameThemeSessionCount: 5,
    });
    expect(rec).toBeNull();
  });
});

describe('CLOSING_STYLES', () => {
  it('has all 5 closing styles with the exact brief copy', () => {
    expect(CLOSING_STYLES).toEqual({
      practical: 'You know your next step. Leave the rest until it becomes actionable.',
      compassionate: 'You do not have to resolve everything in one sitting.',
      values: 'Let the next action reflect what matters, not what fear demands.',
      faith_friendly: 'You have done what you can for now. Allow space for what is beyond you.',
      islamic: 'Take the means available to you, then allow the outcome to rest with Allah.',
    });
  });
});

describe('SESSION_DEPTH_LABELS / CAPACITY_LABELS', () => {
  it('has all 3 session depths and all 4 capacity states', () => {
    expect(Object.keys(SESSION_DEPTH_LABELS).sort()).toEqual(['deep', 'ground', 'reset']);
    expect(Object.keys(CAPACITY_LABELS).sort()).toEqual(['low_capacity', 'ready_to_reflect', 'running_on_empty', 'some_space']);
  });
});
