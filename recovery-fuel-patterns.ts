// Pure logic, no React/DOM - shared between RecoveryFuelEngine.tsx (the
// Insights tab's "This Week's Pattern" section) and InAppNudge.tsx (the
// proactive home banner), so the two surfaces can never disagree about
// what counts as a genuine multi-day pattern. Mirrors the shared-module
// convention already used by ship-stages.ts and weekly-goal-tracker.ts.

export interface FuelLogEntry {
  hasEaten?: boolean | null;
  skippedBreakfast?: boolean | null;
  caffeineTiming?: 'early' | 'late' | 'none';
  hydrationGlasses?: number;
  morningLight?: boolean | null;
  alcoholLogged?: boolean | null;
  shakyIrritable?: boolean | null;
}

export type FuelPatternId =
  | 'skipped_meals'
  | 'alcohol_frequent'
  | 'shaky_irritable'
  | 'low_hydration'
  | 'late_caffeine'
  | 'no_morning_light';

export interface FuelPattern {
  id: FuelPatternId;
  daysAffected: number;
  loggedDays: number;
}

// Below this many logged days, a "pattern" would really just be reading too
// much into one or two entries - never surfaces anything until there's
// enough real history to say something honest.
const MIN_LOGGED_DAYS = 4;

// A pattern only qualifies once it shows up on STRICTLY MORE than half of
// the days actually logged - not the last 7 calendar days, since gaps in
// logging are normal and shouldn't be silently treated as "fine" days.
const qualifies = (count: number, loggedDays: number) => count > loggedDays / 2;

/**
 * Detects genuine multi-day patterns from recent daily fuel logs (most
 * recent first or in any order - order doesn't matter here). Returns
 * patterns in a fixed priority order (most physiologically significant
 * first), so a caller that only wants to surface one can just take the
 * first result.
 */
export const detectFuelPatterns = (
  logs: FuelLogEntry[],
  options?: { includeAlcohol?: boolean }
): FuelPattern[] => {
  const loggedDays = logs.length;
  if (loggedDays < MIN_LOGGED_DAYS) return [];

  const count = (pred: (l: FuelLogEntry) => boolean) => logs.filter(pred).length;
  const patterns: FuelPattern[] = [];

  const mealsSkipped = count((l) => l.hasEaten === false || l.skippedBreakfast === true);
  if (qualifies(mealsSkipped, loggedDays)) {
    patterns.push({ id: 'skipped_meals', daysAffected: mealsSkipped, loggedDays });
  }

  if (options?.includeAlcohol !== false) {
    const alcohol = count((l) => l.alcoholLogged === true);
    if (qualifies(alcohol, loggedDays)) {
      patterns.push({ id: 'alcohol_frequent', daysAffected: alcohol, loggedDays });
    }
  }

  const shaky = count((l) => l.shakyIrritable === true);
  if (qualifies(shaky, loggedDays)) {
    patterns.push({ id: 'shaky_irritable', daysAffected: shaky, loggedDays });
  }

  const lowHydration = count((l) => typeof l.hydrationGlasses === 'number' && l.hydrationGlasses < 5);
  if (qualifies(lowHydration, loggedDays)) {
    patterns.push({ id: 'low_hydration', daysAffected: lowHydration, loggedDays });
  }

  const lateCaffeine = count((l) => l.caffeineTiming === 'late');
  if (qualifies(lateCaffeine, loggedDays)) {
    patterns.push({ id: 'late_caffeine', daysAffected: lateCaffeine, loggedDays });
  }

  const noMorningLight = count((l) => l.morningLight === false);
  if (qualifies(noMorningLight, loggedDays)) {
    patterns.push({ id: 'no_morning_light', daysAffected: noMorningLight, loggedDays });
  }

  return patterns;
};

export const FUEL_PATTERN_COPY: Record<
  FuelPatternId,
  { title: string; description: string; coaching: string; nudgeMessage: (p: FuelPattern) => string }
> = {
  skipped_meals: {
    title: 'A recurring meal gap',
    description: "Meals have been skipped or delayed on several of the days you've logged, not just today.",
    coaching: 'One small, reliable anchor meal at a set time - even a short one - can help your baseline feel less erratic.',
    nudgeMessage: (p) =>
      `You've skipped or delayed a meal on ${p.daysAffected} of your last ${p.loggedDays} logged days. A steady meal can help your energy feel more level.`,
  },
  alcohol_frequent: {
    title: 'Alcohol most nights this week',
    description: "Alcohol has come up on several of the nights you've logged this week.",
    coaching: 'Even one or two alcohol-free nights can make a real difference to how rested you feel the next day.',
    nudgeMessage: (p) =>
      `Alcohol's come up on ${p.daysAffected} of your last ${p.loggedDays} logged nights. A night off could help your sleep feel more restorative.`,
  },
  shaky_irritable: {
    title: 'Feeling shaky or foggy, repeatedly',
    description: "You've reported feeling shaky, irritable, or foggy on several of the days you've logged.",
    coaching: 'This often eases with steadier meal timing - worth cross-checking against your Daily Fuel Log.',
    nudgeMessage: (p) =>
      `You've felt shaky, irritable, or foggy on ${p.daysAffected} of your last ${p.loggedDays} logged days. Your Daily Fuel Log might help spot what's connected.`,
  },
  low_hydration: {
    title: 'Hydration below your own baseline',
    description: "Water intake has stayed under 5 glasses on most of the days you've logged.",
    coaching: 'A glass at a fixed point in your routine - waking, lunch, one meeting break - is often easier to sustain than trying to remember it all day.',
    nudgeMessage: (p) =>
      `Hydration's stayed under 5 glasses on ${p.daysAffected} of your last ${p.loggedDays} logged days. Worth keeping water somewhere visible today.`,
  },
  late_caffeine: {
    title: 'Caffeine later in the day, repeatedly',
    description: "Caffeine after 2pm has shown up on most of the days you've logged.",
    coaching: 'Shifting your last cup earlier can make it easier to wind down at night.',
    nudgeMessage: (p) =>
      `Late-day caffeine has come up on ${p.daysAffected} of your last ${p.loggedDays} logged days. An earlier cutoff might help your evenings feel calmer.`,
  },
  no_morning_light: {
    title: 'Morning light has been missed often',
    description: "Natural light before 10am hasn't featured on most of your logged days.",
    coaching: 'Even a few minutes outside shortly after waking can help.',
    nudgeMessage: (p) =>
      `Morning light's been missing on ${p.daysAffected} of your last ${p.loggedDays} logged days. A short few minutes outside after waking could help your body clock.`,
  },
};
