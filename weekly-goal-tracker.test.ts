import { describe, it, expect } from 'vitest';
import {
  DEFAULT_HABIT_GOALS,
  GOAL_COMPLETION_XP,
  HABIT_CATEGORIES,
  buildDefaultGoals,
  getIsoWeekId,
  clampProgress,
  shouldAwardXp,
  countGoalsMet,
  computeConsistencyIndex,
  HabitGoal,
} from './weekly-goal-tracker';

describe('HABIT_CATEGORIES: the five real pillars, matching the defaults exactly', () => {
  it('every default goal uses a category from the shared list', () => {
    for (const g of DEFAULT_HABIT_GOALS) {
      expect(HABIT_CATEGORIES).toContain(g.category);
    }
  });
  it('has exactly the five pillars, no invented sixth "custom" bucket', () => {
    expect(HABIT_CATEGORIES).toEqual(['Focus', 'Boundaries', 'Energy', 'Somatic', 'Sleep']);
  });
});

describe('buildDefaultGoals: honest starting state, not fabricated progress', () => {
  it('has the five default categories with the prototype\'s original targets', () => {
    const goals = buildDefaultGoals();
    expect(goals).toHaveLength(5);
    expect(goals.map((g) => g.category)).toEqual(['Focus', 'Boundaries', 'Energy', 'Somatic', 'Sleep']);
    expect(goals.map((g) => g.target)).toEqual([3, 2, 5, 4, 5]);
  });
  it('every goal genuinely starts at zero progress and unawarded XP', () => {
    for (const g of buildDefaultGoals()) {
      expect(g.progress).toBe(0);
      expect(g.xpAwarded).toBe(false);
    }
  });
  it('DEFAULT_HABIT_GOALS itself carries no progress/xpAwarded fields to fabricate', () => {
    for (const g of DEFAULT_HABIT_GOALS) {
      expect((g as any).progress).toBeUndefined();
      expect((g as any).xpAwarded).toBeUndefined();
    }
  });
});

describe('getIsoWeekId: standard ISO-8601 week numbering', () => {
  it('matches known reference dates', () => {
    // Thursday, Jan 1 2026 is in week 1.
    expect(getIsoWeekId(new Date(Date.UTC(2026, 0, 1)))).toBe('2026-W01');
    // A Monday well into the year.
    expect(getIsoWeekId(new Date(Date.UTC(2026, 1, 9)))).toBe('2026-W07');
  });
  it('the same ISO week for every day Mon-Sun', () => {
    // Monday 2026-02-09 through Sunday 2026-02-15 should all be W07.
    for (let d = 9; d <= 15; d++) {
      expect(getIsoWeekId(new Date(Date.UTC(2026, 1, d)))).toBe('2026-W07');
    }
  });
  it('handles a year-boundary week correctly (a late-Dec date can belong to next year\'s W01)', () => {
    // Dec 29, 2025 is a Monday and starts ISO week 1 of 2026.
    expect(getIsoWeekId(new Date(Date.UTC(2025, 11, 29)))).toBe('2026-W01');
  });
});

describe('clampProgress: never below 0 or above target', () => {
  it('clamps both directions', () => {
    expect(clampProgress(-3, 5)).toBe(0);
    expect(clampProgress(10, 5)).toBe(5);
    expect(clampProgress(2, 5)).toBe(2);
  });
});

describe('shouldAwardXp: exactly once, exactly at the moment of completion', () => {
  it('awards on the transition from below target to at/above target', () => {
    expect(shouldAwardXp(2, 3, 3, false)).toBe(true);
  });
  it('does not award if already at or above target before the change', () => {
    expect(shouldAwardXp(3, 3, 3, false)).toBe(false);
    expect(shouldAwardXp(4, 3, 3, false)).toBe(false); // moving down from above target
  });
  it('never awards twice for the same goal', () => {
    expect(shouldAwardXp(2, 3, 3, true)).toBe(false);
  });
  it('does not award for a decrease that stays below target', () => {
    expect(shouldAwardXp(2, 1, 3, false)).toBe(false);
  });
});

describe('countGoalsMet + computeConsistencyIndex: real numbers, not invented ones', () => {
  const goal = (progress: number, target: number): HabitGoal =>
    ({ id: 'x', category: 'Focus', label: 'x', target, progress, xpAwarded: false });

  it('counts only goals that have reached their target', () => {
    const goals = [goal(3, 3), goal(1, 3), goal(0, 5), goal(5, 5)];
    expect(countGoalsMet(goals)).toBe(2);
  });

  it('computes the average completion ratio, not a fixed placeholder', () => {
    // 1/3, 2/2, 3/5 -> ratios .333, 1, .6 -> avg .644 -> 64%
    const goals = [goal(1, 3), goal(2, 2), goal(3, 5)];
    expect(computeConsistencyIndex(goals)).toBe(Math.round(((1 / 3 + 1 + 3 / 5) / 3) * 100));
  });

  it('a brand new week with zero progress is honestly 0%, never a fake mid-progress figure', () => {
    expect(computeConsistencyIndex(buildDefaultGoals())).toBe(0);
  });

  it('is never negative and never exceeds 100 even with over-target progress data', () => {
    const goals = [goal(10, 3)]; // shouldn't happen once clamped, but the formula itself must still be sane
    const idx = computeConsistencyIndex(goals);
    expect(idx).toBeGreaterThanOrEqual(0);
    expect(idx).toBeLessThanOrEqual(100);
  });

  it('returns 0, not NaN, for an empty goal list', () => {
    expect(computeConsistencyIndex([])).toBe(0);
  });
});

describe('GOAL_COMPLETION_XP matches the prototype\'s stated reward', () => {
  it('is 100', () => {
    expect(GOAL_COMPLETION_XP).toBe(100);
  });
});
