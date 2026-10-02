// Recovery Debt v2 - "what hasn't had enough time to recover?" Pure
// functions only, same reasoning as energy-delta-engine.ts: every number
// shown to the user traces back to a function here, never a model guess,
// and every one of them reuses the SAME Energy Delta data (capacity
// check-ins, stressors) rather than standing up a second, competing
// numeric system.
//
// Sleep Shortfall, Mental Fatigue and Social Load are the three areas.
// Each can genuinely be unknown (no check-in, no stressors logged, no
// sleep logged yet) - that is always returned as `null`, never coerced
// into a 0, per the "never convert missing information into zero" rule
// this codebase already holds itself to elsewhere.

import { CapacityLevel, Stressor, computeStressorBaseValue, saturate } from './energy-delta-engine';

// ---------- Sleep Shortfall ----------

export interface SleepNight {
  date: string; // YYYY-MM-DD
  hours: number;
}

// The rolling window the brief asks for ("display the rolling seven-day
// shortfall where appropriate").
export const SLEEP_SHORTFALL_WINDOW = 7;

// Average of (target - actual) across whatever recent nights exist,
// floored at 0 per night (a night of MORE sleep than target isn't a
// negative shortfall - it just isn't a shortfall). null with zero nights
// logged - "Not enough sleep data yet", never a fabricated 0.
export const computeSleepShortfall = (targetHours: number, recentNights: SleepNight[]): number | null => {
  const nights = recentNights.slice(-SLEEP_SHORTFALL_WINDOW);
  if (nights.length === 0) return null;
  const totalShortfall = nights.reduce((sum, n) => sum + Math.max(0, targetHours - n.hours), 0);
  return Math.round((totalShortfall / nights.length) * 10) / 10;
};

// ---------- Mental Fatigue ----------
//
// Deliberately a self-reported signal only (the brief allows combining
// workload patterns, focus duration and meeting density too, but those
// aren't genuinely wired up anywhere in this codebase yet - rather than
// fabricate an "inferred" half, this stays honestly reported-only and
// says so in the UI).

export type MentalFatigueLevel = 'low' | 'moderate' | 'high';

export const MENTAL_FATIGUE_LABELS: Record<MentalFatigueLevel, string> = {
  low: 'Low', moderate: 'Moderate', high: 'High',
};

const MENTAL_LEVEL_TO_FATIGUE: Record<CapacityLevel, MentalFatigueLevel> = {
  very_low: 'high', low: 'high', okay: 'moderate', good: 'low', strong: 'low',
};

// null when there's no check-in yet to read from - "Not checked in yet",
// the same phrase Energy Delta already uses for the same real condition.
export const computeMentalFatigue = (latestMental: CapacityLevel | null): MentalFatigueLevel | null => {
  if (latestMental === null) return null;
  return MENTAL_LEVEL_TO_FATIGUE[latestMental];
};

// ---------- Social Load ----------

export type SocialLoadBand = 'low' | 'moderate' | 'high';

export const SOCIAL_LOAD_LABELS: Record<SocialLoadBand, string> = {
  low: 'Low', moderate: 'Moderate', high: 'High',
};

export interface SocialLoadResult {
  score: number; // 0-100, saturate() of active social stressors - internal only, never shown raw
  band: SocialLoadBand | null; // null = no social demands logged yet
  commitmentCount: number;
  acceptedWhileLow: boolean; // at least one was logged while capacity was already low (<=40, describeCapacity's own "Low" cutoff)
}

const CAPACITY_LOW_CUTOFF = 40;

// Reuses the exact saturation formula Gross Load is built from (section
// 3 of the Energy Delta brief) rather than inventing a second way to
// combine several demands into one number.
export const computeSocialLoad = (
  activeSocialStressors: Pick<Stressor, 'severity' | 'persistence' | 'capacityAtLogging'>[]
): SocialLoadResult => {
  const commitmentCount = activeSocialStressors.length;
  if (commitmentCount === 0) {
    return { score: 0, band: null, commitmentCount: 0, acceptedWhileLow: false };
  }
  const score = saturate(activeSocialStressors.map((s) => computeStressorBaseValue(s.severity, s.persistence)));
  const band: SocialLoadBand = score < 30 ? 'low' : score < 60 ? 'moderate' : 'high';
  const acceptedWhileLow = activeSocialStressors.some(
    (s) => s.capacityAtLogging !== null && s.capacityAtLogging !== undefined && s.capacityAtLogging <= CAPACITY_LOW_CUTOFF
  );
  return { score, band, commitmentCount, acceptedWhileLow };
};
