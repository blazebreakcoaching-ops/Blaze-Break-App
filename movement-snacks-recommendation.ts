// Movement Snacks' recommendation layer (section 17) - deterministic by
// design, same reasoning as grounding-adaptive.ts: no AI/token cost for the
// core "what should I suggest" decision, so this works even when Nova is
// completely unavailable (section 31's "Movement Snacks remains fully
// usable" acceptance test). AI/Nova may add contextual language on top
// (section 5's Nova integration), but never gates whether a recommendation
// exists.

import {
  MovementContext, MovementCategory, MOVEMENT_SNACKS, MOVEMENT_ORDER, MOVEMENTS_BY_CATEGORY,
} from './movement-snacks-content';

export interface MovementUsageEntry {
  movementId: string;
  lastCompletedAt?: string; // ISO
  completionCount: number;
  lastSkippedAt?: string;
  favourite?: boolean;
  // Section 6's "more uncomfortable" check-out was the most recent feedback
  // for this movement - a real signal to deprioritise it (never exclude it
  // outright; the person can still reach it via Browse all).
  recentlyUncomfortable?: boolean;
}

export interface MovementRecommendationInput {
  context: MovementContext;
  seatedOnly?: boolean;
  maxDurationSeconds?: number;
  usage?: MovementUsageEntry[];
}

export interface MovementRecommendation {
  movementId: string;
  reason: string;
  durationSeconds: number;
  alternativeMovementId: string | null;
}

// A movement shown/completed within this window is deprioritised so repeat
// visits don't always land on the exact same suggestion (section 18's
// "avoid repetition" / acceptance test "recommendations do not feel
// identical every time") - it can still surface again, just not first.
const RECENCY_COOLDOWN_HOURS = 20;

const hoursSince = (iso: string | undefined, now: number): number =>
  iso ? (now - new Date(iso).getTime()) / (60 * 60 * 1000) : Infinity;

// Ranks candidates for a context: a movement last marked "more
// uncomfortable" sinks lowest of all (never excluded outright - Browse all
// still reaches it), on-cooldown (recently shown) sinks next, and among the
// rest, never-tried and least-recently-used rise to the top. Deterministic
// given the same usage history and current time.
const rankCandidates = (candidateIds: string[], usage: MovementUsageEntry[], now: number): string[] => {
  const usageById = new Map(usage.map((u) => [u.movementId, u]));
  return [...candidateIds].sort((a, b) => {
    const ua = usageById.get(a);
    const ub = usageById.get(b);
    const aUncomfortable = ua?.recentlyUncomfortable === true;
    const bUncomfortable = ub?.recentlyUncomfortable === true;
    if (aUncomfortable !== bUncomfortable) return aUncomfortable ? 1 : -1;
    const aOnCooldown = ua ? hoursSince(ua.lastCompletedAt, now) < RECENCY_COOLDOWN_HOURS : false;
    const bOnCooldown = ub ? hoursSince(ub.lastCompletedAt, now) < RECENCY_COOLDOWN_HOURS : false;
    if (aOnCooldown !== bOnCooldown) return aOnCooldown ? 1 : -1;
    const aHours = ua ? hoursSince(ua.lastCompletedAt, now) : Infinity;
    const bHours = ub ? hoursSince(ub.lastCompletedAt, now) : Infinity;
    return bHours - aHours;
  });
};

const CONTEXT_REASONS: Record<MovementContext, string> = {
  sitting_too_long: 'A short break from sitting still.',
  neck_shoulders_tight: 'Eases tension held in your neck and shoulders.',
  meeting_lingering: 'Helps your body register that the interaction has ended.',
  switch_off_work: 'A physical boundary between work and the rest of your day.',
  need_air_daylight: 'A change of environment and some daylight.',
  restless_stuck: 'A quick change of physical state.',
  quick: 'Something short, right now.',
};

export const getMovementRecommendation = (input: MovementRecommendationInput): MovementRecommendation | null => {
  const now = Date.now();
  const usage = input.usage || [];

  let candidates = MOVEMENT_ORDER.filter((id) => {
    const m = MOVEMENT_SNACKS[id]!;
    if (!m.active) return false;
    if (!m.contexts.includes(input.context)) return false;
    if (input.seatedOnly && !m.supportedPositions.includes('seated')) return false;
    if (typeof input.maxDurationSeconds === 'number' && m.durationSeconds > input.maxDurationSeconds) return false;
    return true;
  });

  // "Quick" has no natural context match beyond duration - fall back to the
  // shortest active movements overall rather than returning nothing.
  if (candidates.length === 0 && input.context === 'quick') {
    candidates = MOVEMENT_ORDER
      .filter((id) => MOVEMENT_SNACKS[id]!.active && (!input.seatedOnly || MOVEMENT_SNACKS[id]!.supportedPositions.includes('seated')))
      .sort((a, b) => MOVEMENT_SNACKS[a]!.durationSeconds - MOVEMENT_SNACKS[b]!.durationSeconds)
      .slice(0, 5);
  }

  if (candidates.length === 0) return null;

  const ranked = rankCandidates(candidates, usage, now);
  const chosen = MOVEMENT_SNACKS[ranked[0]!]!;
  const alternative = ranked[1] || chosen.alternativeMovementIds?.[0] || null;

  return {
    movementId: chosen.id,
    reason: CONTEXT_REASONS[input.context],
    durationSeconds: chosen.durationSeconds,
    alternativeMovementId: alternative,
  };
};

// Section 20's Quick Access (30s / 1min / 3min taps) - works with zero
// context needed, and without Nova or Firebase (acceptance tests, section
// 31/34). Picks the best-fitting active movement at or under the budget.
export const getQuickReset = (maxDurationSeconds: 30 | 60 | 180, usage: MovementUsageEntry[] = []): MovementRecommendation | null => {
  const candidates = MOVEMENT_ORDER.filter((id) => MOVEMENT_SNACKS[id]!.active && MOVEMENT_SNACKS[id]!.durationSeconds <= maxDurationSeconds);
  if (candidates.length === 0) return null;
  const ranked = rankCandidates(candidates, usage, Date.now());
  // Prefer the closest fit to the requested budget among the top-ranked
  // (non-cooldown) candidates, not just the very first in list order.
  const rankIndex = new Map(ranked.map((id, i) => [id, i]));
  const best = [...ranked].sort((a, b) =>
    MOVEMENT_SNACKS[b]!.durationSeconds - MOVEMENT_SNACKS[a]!.durationSeconds || rankIndex.get(a)! - rankIndex.get(b)!
  )[0]!;
  const chosen = MOVEMENT_SNACKS[best]!;
  return {
    movementId: chosen.id,
    reason: 'A quick one, matched to the time you\'ve got.',
    durationSeconds: chosen.durationSeconds,
    alternativeMovementId: ranked.find((id) => id !== best) || null,
  };
};

// Section 29's time-of-day defaults - a starting suggestion only, never a
// restriction (the person remains free to choose anything; see
// "Do not over-automate").
export const getTimeOfDayCategory = (hourLocal: number): MovementCategory | null => {
  if (hourLocal >= 6 && hourLocal < 10) return 'energise';
  if (hourLocal >= 10 && hourLocal < 16) return 'reset';
  if (hourLocal >= 16 && hourLocal < 19) return 'transition';
  if (hourLocal >= 19 && hourLocal < 23) return 'transition';
  return null;
};

export const getMovementsForCategory = (category: MovementCategory, seatedOnly = false): string[] =>
  MOVEMENTS_BY_CATEGORY[category].filter((id) => !seatedOnly || MOVEMENT_SNACKS[id]!.supportedPositions.includes('seated'));

// Section 5's "offer a gentler alternative" after a "more uncomfortable"
// check-out (section 5/6) - never the same movement, always something
// gentler (shorter, or explicitly listed as an alternative).
export const getGentlerAlternative = (movementId: string): string | null => {
  const m = MOVEMENT_SNACKS[movementId];
  if (!m) return null;
  if (m.alternativeMovementIds && m.alternativeMovementIds.length > 0) return m.alternativeMovementIds[0]!;
  const gentler = MOVEMENT_ORDER
    .filter((id) => id !== movementId && MOVEMENT_SNACKS[id]!.active && MOVEMENT_SNACKS[id]!.durationSeconds < m.durationSeconds)
    .sort((a, b) => MOVEMENT_SNACKS[b]!.durationSeconds - MOVEMENT_SNACKS[a]!.durationSeconds);
  return gentler[0] || null;
};
