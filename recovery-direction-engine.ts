// Recovery Direction - the single, deterministic, explainable trend that
// replaces the Recovery Velocity Score. Investigation for this rebuild
// found three independent, disagreeing formulas computing something called
// "Recovery Velocity": RecoveryIntelligenceLayer.tsx's own inline
// getVelocityDetails (an arbitrary base-50 +/- fixed-point-per-event
// formula, recomputed fresh from local React state every render, never
// persisted), server.ts's /api/recovery/recalculate ("2. RECOVERY
// VELOCITY" block - a different arbitrary weighted sum, computed from
// whatever arrays the client happens to POST it rather than the server's
// own Firestore reads), and RecoveryVelocityMap.tsx's own separate
// netVelocityBalance calc. None of these produce the same number for the
// same person, and none are deterministic in the sense this file is: pure
// functions over real, already-logged data, with an honest "not enough
// data yet" rather than guessing when there isn't.
//
// This engine deliberately does NOT replace Recovery Debt (kept, per the
// spec, as its own concept - "areas where recovery has not caught up with
// demand") or absorb RecoveryVelocityMap.tsx/the legacy staff-only
// RecoveryIntelligenceLayer.tsx velocity card - those are separate surfaces
// with their own scoped follow-up to actually point at this engine instead
// of their own arithmetic. This file is the one real source of truth going
// forward; nothing else should grow a fourth formula.
//
// Pure functions only (no Firestore, no React, no AI) - matches every
// other engine in this codebase.

export type CapacityTrend = 'rising' | 'falling' | 'stable' | null;
export type DemandReductionTrend = 'more' | 'fewer' | 'same' | null;

export type RecoveryDirectionBand = 'building_capacity' | 'holding_steady' | 'under_more_pressure' | 'mixed';

export const RECOVERY_DIRECTION_LABELS: Record<RecoveryDirectionBand, string> = {
  building_capacity: 'Building capacity',
  holding_steady: 'Holding steady',
  under_more_pressure: 'Under more pressure',
  mixed: 'Mixed',
};

export interface CapacitySample {
  score: number; // 0-100, energy-delta-engine's computeCapacityScore
  atMs: number;
}

export interface RecoveryDirectionInput {
  // Already filtered by the caller to the trailing lookback window (e.g.
  // 14 days) - this module only ever splits what it's given into two
  // halves by time, never decides the window itself.
  recentCapacitySamples: CapacitySample[];
  // How many stressors were marked resolved (energy-delta-service's
  // resolveStressor - a real, deliberate user action) in the most recent
  // half of the window vs. the half before it - genuine demand-reduction
  // evidence, not a guess.
  resolvedStressorCountRecentHalf: number;
  resolvedStressorCountPriorHalf: number;
}

// Never call one or two readings a "trend" - the same floor energy-delta-
// engine.ts's MIN_VALID_DAYS_FOR_PATTERN applies in spirit, adapted here to
// "enough readings in each half to average honestly" rather than calendar
// days, since capacity check-ins aren't guaranteed to be one-per-day.
export const MIN_SAMPLES_PER_HALF = 2;

// How much a half-over-half average capacity difference has to move before
// it counts as a real rising/falling trend rather than noise - chosen
// independently of server.ts's unrelated getDirection threshold (which
// mixes several different 0-100 scales together); this one only ever
// compares capacity scores to other capacity scores.
export const CAPACITY_TREND_THRESHOLD = 5;

const average = (values: number[]): number => values.reduce((sum, v) => sum + v, 0) / values.length;

export const computeCapacityTrend = (samples: CapacitySample[]): { trend: CapacityTrend; sampleCount: number } => {
  if (samples.length < MIN_SAMPLES_PER_HALF * 2) {
    return { trend: null, sampleCount: samples.length };
  }
  const sorted = [...samples].sort((a, b) => a.atMs - b.atMs);
  const mid = Math.floor(sorted.length / 2);
  const earlierHalf = sorted.slice(0, mid);
  const laterHalf = sorted.slice(mid);
  if (earlierHalf.length < MIN_SAMPLES_PER_HALF || laterHalf.length < MIN_SAMPLES_PER_HALF) {
    return { trend: null, sampleCount: samples.length };
  }
  const diff = average(laterHalf.map((s) => s.score)) - average(earlierHalf.map((s) => s.score));
  if (diff >= CAPACITY_TREND_THRESHOLD) return { trend: 'rising', sampleCount: samples.length };
  if (diff <= -CAPACITY_TREND_THRESHOLD) return { trend: 'falling', sampleCount: samples.length };
  return { trend: 'stable', sampleCount: samples.length };
};

export const computeDemandReductionTrend = (recentHalf: number, priorHalf: number): DemandReductionTrend => {
  if (recentHalf === 0 && priorHalf === 0) return null; // no resolved-stressor evidence either way - stay neutral, not "same".
  if (recentHalf > priorHalf) return 'more';
  if (recentHalf < priorHalf) return 'fewer';
  return 'same';
};

export interface RecoveryDirectionResult {
  // null only when there isn't enough real capacity history yet - the
  // honest "not enough information yet" case, never a guessed default.
  band: RecoveryDirectionBand | null;
  capacityTrend: CapacityTrend;
  demandReductionTrend: DemandReductionTrend;
  sampleCount: number;
}

// The single entry point. Capacity trend drives the primary band; the
// demand-reduction trend only ever matters when it actively conflicts with
// what capacity is doing (e.g. capacity rising but demand reduction
// actually went backwards) - that's the one case worth calling out as
// "mixed" rather than confidently "building capacity".
export const computeRecoveryDirection = (input: RecoveryDirectionInput): RecoveryDirectionResult => {
  const { trend: capacityTrend, sampleCount } = computeCapacityTrend(input.recentCapacitySamples);
  const demandReductionTrend = computeDemandReductionTrend(input.resolvedStressorCountRecentHalf, input.resolvedStressorCountPriorHalf);

  if (capacityTrend === null) {
    return { band: null, capacityTrend: null, demandReductionTrend, sampleCount };
  }

  let band: RecoveryDirectionBand;
  if (capacityTrend === 'stable') {
    band = 'holding_steady';
  } else if (capacityTrend === 'rising') {
    band = demandReductionTrend === 'fewer' ? 'mixed' : 'building_capacity';
  } else {
    // capacityTrend === 'falling'
    band = demandReductionTrend === 'more' ? 'mixed' : 'under_more_pressure';
  }

  return { band, capacityTrend, demandReductionTrend, sampleCount };
};

// Plain-language "How is this worked out?" - deterministic, never an AI
// generation, matching every other explanation in this rebuild.
export const explainRecoveryDirection = (result: RecoveryDirectionResult, lookbackDays: number): string => {
  if (result.band === null) {
    return `Not enough capacity check-ins yet over the last ${lookbackDays} days to show a meaningful trend.`;
  }
  return `Based on the capacity check-ins you logged over the last ${lookbackDays} days, split into an earlier and a more recent period.`;
};
