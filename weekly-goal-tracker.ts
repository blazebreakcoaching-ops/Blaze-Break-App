// Pure logic for the Weekly Recovery Goal Tracker ("System Habit OS"), kept
// I/O-free and unit-tested - same pattern as the other logic modules in this
// codebase (guardian-alert.ts, gad7.ts, org-risk-trend.ts).
//
// This restores a feature that existed in the original AI Studio prototype
// this project was uploaded from, but never made it into this repository (a
// gap in that original upload, confirmed by an exhaustive search of this
// repo's entire git history - the feature's own name and copy never
// appeared in a single commit). The rebuild is deliberately REAL rather than
// a re-creation of the prototype's look: the original screen showed fixed,
// hardcoded numbers (e.g. "Habit Consistency Index: 53%", specific
// progress fractions) with no data behind them. Here, every number is
// computed from what the user has actually logged - a brand new user
// genuinely starts at 0%, not a fabricated mid-progress figure.

// The five real pillars a habit goal can belong to - both a default goal
// and a user-added custom one. Matches the original prototype exactly
// (it offered the same five as a dropdown, no separate "custom" bucket).
export const HABIT_CATEGORIES = ['Focus', 'Boundaries', 'Energy', 'Somatic', 'Sleep'] as const;
export type HabitCategory = (typeof HABIT_CATEGORIES)[number];

export interface HabitGoal {
  id: string;
  category: HabitCategory;
  label: string; // the actual goal text, e.g. "Complete 3 Deep Work Focus Zone Blocks"
  target: number; // how many times per week this needs doing
  progress: number; // how many times logged so far this week, 0..target
  xpAwarded: boolean; // true once the one-time completion XP has been paid out
}

// The five default weekly habits, matching the original prototype's design
// (same categories, same targets) so returning users see the same shape of
// tracker, just with real numbers behind it instead of fixed placeholders.
export const DEFAULT_HABIT_GOALS: Omit<HabitGoal, 'progress' | 'xpAwarded'>[] = [
  { id: 'focus', category: 'Focus', label: 'Complete 3 Deep Work Focus Zone Blocks', target: 3 },
  { id: 'boundaries', category: 'Boundaries', label: 'Rehearse or Deploy 2 Boundary Pushbacks', target: 2 },
  { id: 'energy', category: 'Energy', label: 'Maintain Daily Energy Deficit < 15%', target: 5 },
  { id: 'somatic', category: 'Somatic', label: 'Practice Somatic Resets (4-7-8 Breathing)', target: 4 },
  { id: 'sleep', category: 'Sleep', label: 'Digital Screen Cutoff by 10:00 PM', target: 5 },
];

export function buildDefaultGoals(): HabitGoal[] {
  return DEFAULT_HABIT_GOALS.map((g) => ({ ...g, progress: 0, xpAwarded: false }));
}

// The XP paid out for finishing one goal for the week, matching the
// prototype's own stated reward ("+100 XP / Achievement").
export const GOAL_COMPLETION_XP = 100;

// ISO-8601 week identifier (Monday-start, e.g. "2026-W06"), used as the
// document key for a week's cycle. Standard algorithm: shift to the Thursday
// of the same ISO week, then count weeks from that year's first Thursday.
export function getIsoWeekId(date: Date): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7; // Sunday (0) becomes 7, so Monday=1..Sunday=7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

export function clampProgress(value: number, target: number): number {
  return Math.max(0, Math.min(target, value));
}

// Whether adjusting a goal's progress from `before` to `after` should award
// this week's one-time completion XP - only the moment it FIRST reaches its
// target, never again if nudged up and down past that point, and never for a
// goal that already got its XP.
export function shouldAwardXp(before: number, after: number, target: number, alreadyAwarded: boolean): boolean {
  if (alreadyAwarded) return false;
  return before < target && after >= target;
}

export function countGoalsMet(goals: HabitGoal[]): number {
  return goals.filter((g) => g.progress >= g.target).length;
}

// A real, computed percentage - the average of each goal's own completion
// ratio, not an invented single number. Returns 0 for an empty goal list
// rather than dividing by zero or faking a value.
export function computeConsistencyIndex(goals: HabitGoal[]): number {
  if (goals.length === 0) return 0;
  const ratios = goals.map((g) => (g.target > 0 ? Math.min(1, g.progress / g.target) : 0));
  const avg = ratios.reduce((sum, r) => sum + r, 0) / ratios.length;
  return Math.round(avg * 100);
}
