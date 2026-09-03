// Pure calculation logic for the org-level wellbeing risk trend, kept
// separate from server.ts so it's genuinely unit-testable without a live
// Firestore instance - same reasoning as nova-tools.ts.
//
// Deliberate scope: this is a transparent, explainable trend indicator
// built entirely from real aggregate signals this app already collects
// (the HSE-aligned climate survey, mood pulses) - not a trained or
// validated predictive model. Nothing here claims a probability of
// absenteeism, a days-per-year estimate, or any other number this app
// has no real basis to produce. It surfaces whether things are getting
// better or worse, and by how much, on the same 0-100 scale for both
// signals so they're honestly comparable - the actual judgment about
// what that means for cost or staffing stays with the person reading it,
// not fabricated by a formula with invented coefficients.

export interface ClimateAverages {
  demands: number;
  control: number;
  support: number;
  relationships: number;
  role: number;
  change: number;
}

// All six dimensions in the real survey (TeamClimateSurvey.tsx) are
// phrased as positive statements ("I have real say over how and when I
// do my work"), scored 1 (strongly disagree) to 5 (strongly agree) - so
// higher is always better across every dimension, with no inversion
// needed. Verified directly against the survey's own question wording
// before writing this, rather than assumed.
const CLIMATE_SCALE_MIN = 1;
const CLIMATE_SCALE_MAX = 5;

// Converts the 1-5 "how good is this" average into a 0-100 "how
// concerning is this" score, so it's on the same scale and same
// direction as the mood-based concern score below. A perfect 5 average
// (everyone strongly agrees things are fine) becomes 0 concern; the
// worst possible 1 average becomes 100 concern.
export const computeClimateConcern = (averages: ClimateAverages | null): number | null => {
  if (!averages) return null;
  const dims = [averages.demands, averages.control, averages.support, averages.relationships, averages.role, averages.change];
  const validDims = dims.filter((d) => typeof d === 'number' && !Number.isNaN(d));
  if (validDims.length === 0) return null;
  const mean = validDims.reduce((sum, d) => sum + d, 0) / validDims.length;
  const clamped = Math.max(CLIMATE_SCALE_MIN, Math.min(CLIMATE_SCALE_MAX, mean));
  return Math.round(((CLIMATE_SCALE_MAX - clamped) / (CLIMATE_SCALE_MAX - CLIMATE_SCALE_MIN)) * 100);
};

// The dashboard endpoint already buckets mood pulses into positive/
// negative/neutral. This is just the negative share as a percentage -
// already a natural 0-100 concern score with no inversion needed.
export const computeMoodConcern = (positive: number, negative: number, neutral: number): number | null => {
  const total = positive + negative + neutral;
  if (total <= 0) return null;
  return Math.round((negative / total) * 100);
};

// Combines whichever concern signals are actually available into one
// overall score. A simple, equal-weighted average of whatever exists -
// not a weighted formula with invented coefficients for how much more
// one signal should count than another, since nothing here validates
// such a weighting. Returns null only when neither signal exists yet
// (e.g. a brand new org with no climate survey responses and no mood
// pulses at all), which the caller should treat as "not enough data",
// not as a risk score of zero.
export const computeOverallConcern = (climateConcern: number | null, moodConcern: number | null): number | null => {
  const values = [climateConcern, moodConcern].filter((v): v is number => v !== null);
  if (values.length === 0) return null;
  return Math.round(values.reduce((sum, v) => sum + v, 0) / values.length);
};

export type TrendDirection = 'improving' | 'worsening' | 'stable' | 'unknown';

export interface TrendResult {
  direction: TrendDirection;
  delta: number | null;
}

// Compares a current concern score against a prior snapshot. A change of
// fewer than 3 points either way is called "stable" rather than
// improving/worsening - real aggregate wellbeing signals move slowly,
// and treating every small fluctuation as a meaningful trend would be
// noise dressed up as insight.
const STABLE_THRESHOLD = 3;

export const computeTrend = (current: number | null, previous: number | null): TrendResult => {
  if (current === null || previous === null) return { direction: 'unknown', delta: null };
  const delta = current - previous;
  if (Math.abs(delta) < STABLE_THRESHOLD) return { direction: 'stable', delta };
  return { direction: delta > 0 ? 'worsening' : 'improving', delta };
};
