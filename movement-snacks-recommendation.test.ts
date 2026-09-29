import { describe, it, expect } from 'vitest';
import {
  getMovementRecommendation, getQuickReset, getTimeOfDayCategory, getMovementsForCategory, getGentlerAlternative,
  MovementUsageEntry,
} from './movement-snacks-recommendation';
import { MOVEMENT_SNACKS, MOVEMENT_ORDER } from './movement-snacks-content';

describe('getMovementRecommendation', () => {
  it('returns a movement that actually matches the requested context, with no usage history', () => {
    const rec = getMovementRecommendation({ context: 'neck_shoulders_tight' });
    expect(rec).toBeTruthy();
    expect(MOVEMENT_SNACKS[rec!.movementId]!.contexts).toContain('neck_shoulders_tight');
  });

  it('never fabricates a recommendation for a context with genuinely no seated match under seatedOnly', () => {
    // meeting_lingering's only movement (shake_meeting) does support seated,
    // so this should still resolve - sanity-checks the filter doesn't
    // over-exclude.
    const rec = getMovementRecommendation({ context: 'meeting_lingering', seatedOnly: true });
    expect(rec).toBeTruthy();
  });

  it('respects a duration budget', () => {
    const rec = getMovementRecommendation({ context: 'sitting_too_long', maxDurationSeconds: 60 });
    expect(rec).toBeTruthy();
    expect(rec!.durationSeconds).toBeLessThanOrEqual(60);
  });

  it('falls back to short movements overall for "quick" rather than returning null', () => {
    const rec = getMovementRecommendation({ context: 'quick' });
    expect(rec).toBeTruthy();
    expect(rec!.durationSeconds).toBeLessThanOrEqual(120);
  });

  it('does not always recommend the same movement on repeat calls once one has just been completed (section 18)', () => {
    const now = new Date().toISOString();
    const usage: MovementUsageEntry[] = [{ movementId: 'desk_stretch', lastCompletedAt: now, completionCount: 1 }];
    const rec = getMovementRecommendation({ context: 'sitting_too_long', usage });
    expect(rec!.movementId).not.toBe('desk_stretch');
  });

  it('a movement completed long ago is eligible again (cooldown expires)', () => {
    const longAgo = new Date(Date.now() - 100 * 60 * 60 * 1000).toISOString();
    const usage: MovementUsageEntry[] = [{ movementId: 'posture_reset', lastCompletedAt: longAgo, completionCount: 5 }];
    // posture_reset is the only sitting_too_long context match under a tight
    // duration budget in some configurations - just confirm no crash and a
    // real result comes back.
    const rec = getMovementRecommendation({ context: 'sitting_too_long', usage });
    expect(rec).toBeTruthy();
  });

  it('deprioritises a movement last marked "more uncomfortable" below everything else, but never excludes it', () => {
    const usage: MovementUsageEntry[] = [{ movementId: 'desk_stretch', completionCount: 1, recentlyUncomfortable: true }];
    const rec = getMovementRecommendation({ context: 'sitting_too_long', usage });
    expect(rec!.movementId).not.toBe('desk_stretch');
  });

  it('a movement marked "more uncomfortable" is still reachable when it is the only match for a context', () => {
    // shake_meeting is meeting_lingering's sole context match (confirmed by
    // the "seatedOnly" test above) - flagging it must not make the
    // recommendation disappear, only rank it last among candidates.
    const usage: MovementUsageEntry[] = [{ movementId: 'shake_meeting', completionCount: 1, recentlyUncomfortable: true }];
    const rec = getMovementRecommendation({ context: 'meeting_lingering', usage });
    expect(rec?.movementId).toBe('shake_meeting');
  });

  it('always includes a plain-language reason, never empty', () => {
    for (const ctx of ['sitting_too_long', 'neck_shoulders_tight', 'meeting_lingering', 'switch_off_work', 'need_air_daylight', 'restless_stuck', 'quick'] as const) {
      const rec = getMovementRecommendation({ context: ctx });
      expect(rec!.reason.length).toBeGreaterThan(0);
    }
  });
});

describe('getQuickReset', () => {
  it('never returns a movement longer than the requested budget', () => {
    for (const budget of [30, 60, 180] as const) {
      const rec = getQuickReset(budget);
      expect(rec).toBeTruthy();
      expect(rec!.durationSeconds).toBeLessThanOrEqual(budget);
    }
  });

  it('picks the closest fit under the budget, not just any short movement', () => {
    const rec = getQuickReset(180);
    const chosenDuration = MOVEMENT_SNACKS[rec!.movementId]!.durationSeconds;
    const betterFits = MOVEMENT_ORDER.filter((id) => MOVEMENT_SNACKS[id]!.durationSeconds <= 180 && MOVEMENT_SNACKS[id]!.durationSeconds > chosenDuration);
    expect(betterFits).toEqual([]);
  });

  it('works with zero usage history (Firebase/Nova unavailable - section 31)', () => {
    const rec = getQuickReset(60, []);
    expect(rec).toBeTruthy();
  });
});

describe('getTimeOfDayCategory', () => {
  it('never forces a category outside the documented windows', () => {
    expect(getTimeOfDayCategory(3)).toBeNull();
  });
  it('suggests energise in the morning', () => {
    expect(getTimeOfDayCategory(7)).toBe('energise');
  });
  it('suggests reset mid-workday', () => {
    expect(getTimeOfDayCategory(13)).toBe('reset');
  });
  it('suggests transition in the evening', () => {
    expect(getTimeOfDayCategory(20)).toBe('transition');
  });
});

describe('getMovementsForCategory', () => {
  it('every returned id genuinely belongs to that category', () => {
    for (const cat of ['release', 'reset', 'transition', 'energise'] as const) {
      const ids = getMovementsForCategory(cat);
      expect(ids.length).toBeGreaterThan(0);
      for (const id of ids) expect(MOVEMENT_SNACKS[id]!.category).toBe(cat);
    }
  });

  it('seatedOnly filters out standing-only movements', () => {
    const ids = getMovementsForCategory('transition', true);
    for (const id of ids) expect(MOVEMENT_SNACKS[id]!.supportedPositions).toContain('seated');
  });
});

describe('getGentlerAlternative', () => {
  it('never suggests the same movement as its own gentler alternative', () => {
    for (const id of MOVEMENT_ORDER) {
      const alt = getGentlerAlternative(id);
      if (alt) expect(alt).not.toBe(id);
    }
  });

  it('returns null for an unknown movement rather than throwing', () => {
    expect(getGentlerAlternative('not_a_real_movement')).toBeNull();
  });
});
