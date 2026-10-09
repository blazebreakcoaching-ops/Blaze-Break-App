// Recovery Routing Engine - the deterministic arbitration core that decides,
// from whatever intervention candidates existing Blaze Break modules submit,
// which ONE (if any) is surfaced to the user right now. Pure functions only
// (no Firestore, no React, no AI) - this is the "decision compression"
// doctrine's mechanical half: Nova explains the result, it does not
// calculate it.
//
// Internal routing states (never shown to the user as literal labels - Nova
// translates each into plain language):
//   STABILISE - reduce intensity before anything else.
//   REDUCE    - the problem is too much demand; make something smaller.
//   PROTECT   - pressure keeps entering; a boundary is needed.
//   RECOVER   - a basic recovery foundation looks depleted.
//   UNDERSTAND - a pattern is recurring; reflection may help.
//   ACT       - the issue is understood; a real behavioural change fits.
//   CONNECT   - another person might make this easier.
//   NONE      - no intervention is necessary. Always a valid outcome.
//
// A module never pushes itself onto the user directly - it submits an
// InterventionCandidate here, and the router compares candidates using
// deterministic tie-break rules (never an opaque single score), enforcing a
// hard Recommendation Budget of one primary recommendation per evaluation.

import { isEffortWithinBandwidth, type BandwidthBand, type CapacityGateResult } from './recovery-capacity-gate';

export type RouteType = 'STABILISE' | 'REDUCE' | 'PROTECT' | 'RECOVER' | 'UNDERSTAND' | 'ACT' | 'CONNECT' | 'NONE';

export const ROUTE_TYPES: RouteType[] = ['STABILISE', 'REDUCE', 'PROTECT', 'RECOVER', 'UNDERSTAND', 'ACT', 'CONNECT', 'NONE'];

// Routes that address the structural cause of a problem rather than asking
// the user to self-regulate around an unchanged situation - used to prefer
// REDUCE/PROTECT/ACT over repeated STABILISE/UNDERSTAND when a candidate
// itself reports the underlying problem is structural.
const STRUCTURAL_PREFERRED_ROUTES: RouteType[] = ['REDUCE', 'PROTECT', 'ACT'];

// Distinguishes what a recommendation's reasoning actually rests on, so Nova
// can never present a hypothesis as settled fact.
export type EvidenceSource =
  | 'current_user_report'
  | 'recent_repeated_pattern'
  | 'user_confirmed_pattern'
  | 'deterministic_calculation'
  | 'user_preference'
  | 'connected_data'
  | 'nova_hypothesis';

// Structured, privacy-minimised reasons - Nova translates these into
// sentences; the router and its storage never need the private narrative
// itself to explain why a route was chosen.
export type ReasonCode =
  | 'high_demand_low_capacity'
  | 'recovery_foundation_low'
  | 'repeated_pressure_pattern'
  | 'explicit_user_request'
  | 'boundary_issue_confirmed'
  | 'recent_reset_completed'
  | 'human_support_requested'
  | 'no_intervention_needed';

export type ConfidenceLevel = 'high' | 'medium' | 'low';

export type Urgency = 'low' | 'medium' | 'high';

export type PreferenceMatch = 'preferred' | 'neutral' | 'avoided';

export interface InterventionEvidence {
  source: EvidenceSource;
  confidence: ConfidenceLevel;
  // Short plain-language detail for "Why this?" - never a formula or score.
  detail?: string;
}

// What an existing module submits to the router instead of surfacing itself
// directly. Every field here is something the submitting module must already
// know about its own real state - the router never fills in a guess for a
// field a candidate omitted (TypeScript requires every one of these).
export interface InterventionCandidate {
  candidateId: string;
  sourceModule: string;
  routeType: RouteType;
  reasonCode: ReasonCode;
  evidence: InterventionEvidence;
  userEffort: BandwidthBand;
  estimatedDurationMinutes: number;
  urgency: Urgency;
  requiresReflection: boolean;
  requiresExternalAction: boolean;
  requiresConnector: boolean;
  requiresHumanContact: boolean;
  // True when the submitting module has determined the underlying problem
  // is structural (unrealistic workload, repeated requests, no boundaries)
  // rather than something self-regulation alone will fix.
  structuralProblem: boolean;
  // False means a real prerequisite this candidate depends on isn't met
  // (e.g. the target feature doesn't exist, onboarding incomplete) - the
  // router excludes it outright rather than guessing around the gap.
  prerequisitesMet: boolean;
  recentlyUsed: boolean;
  recentOutcome?: 'helped' | 'about_the_same' | 'not_really' | null;
  cooldownActive: boolean;
  // False means a genuine restriction applies right now (under-18 content
  // rule, organisation-sponsored data boundary, Support Circle/connector
  // unavailable) - the router excludes it outright, the same as a missing
  // prerequisite, and this is never bypassed even by an explicit request.
  eligibleForPrivacyZone: boolean;
  userPreferenceMatch?: PreferenceMatch;
  // True when the user is directly asking for this specific candidate right
  // now - per the spec, a direct request is always respected unless a
  // genuine safety/technical restriction applies (modelled here as
  // prerequisitesMet/eligibleForPrivacyZone), so it bypasses cooldown,
  // budget and bandwidth-ceiling exclusions.
  explicitUserRequest?: boolean;
}

export interface SessionRecommendationState {
  recommendationsOffered: number;
  recommendationsDeclined: number;
  interventionsStarted: number;
  interventionsCompleted: number;
  interventionsAbandoned: number;
  secondsSinceLastIntervention: number | null;
  userRequestedMore: boolean;
}

export const EMPTY_SESSION_STATE: SessionRecommendationState = {
  recommendationsOffered: 0,
  recommendationsDeclined: 0,
  interventionsStarted: 0,
  interventionsCompleted: 0,
  interventionsAbandoned: 0,
  secondsSinceLastIntervention: null,
  userRequestedMore: false,
};

// Default Recommendation Budget: exactly one primary recommendation. After
// this many have already been offered in the session (and the user hasn't
// asked for more), the router stops offering new ones rather than turning
// Blaze Break into a task list.
export const DEFAULT_MAX_PRIMARY_RECOMMENDATIONS = 1;
export const SESSION_RECOMMENDATION_OFFER_LIMIT = 3;

export type RecommendationBudgetReason = 'within_budget' | 'session_recommendation_limit_reached' | 'user_requested_more';

export interface RecommendationBudgetResult {
  allowPrimary: boolean;
  reason: RecommendationBudgetReason;
}

export const evaluateRecommendationBudget = (session: SessionRecommendationState): RecommendationBudgetResult => {
  if (session.userRequestedMore) {
    return { allowPrimary: true, reason: 'user_requested_more' };
  }
  if (session.recommendationsOffered >= SESSION_RECOMMENDATION_OFFER_LIMIT) {
    return { allowPrimary: false, reason: 'session_recommendation_limit_reached' };
  }
  return { allowPrimary: true, reason: 'within_budget' };
};

export type ExclusionReason =
  | 'prerequisites_not_met'
  | 'cooldown_active'
  | 'privacy_zone_restricted'
  | 'effort_exceeds_bandwidth'
  | 'budget_exhausted'
  | 'lower_priority_than_selected';

export interface ExcludedCandidate {
  candidateId: string;
  excludedReason: ExclusionReason;
}

// Why the router landed on NONE, or why a real route needs a clarifying
// question before being shown confidently - three different user-facing
// situations ("nothing needs fixing" / "you've done enough for now" / "I
// don't have enough information yet") that all start from the same internal
// shape, so the UI/Nova layer must branch on this rather than inferring it.
export type RoutingOutcome = 'selected' | 'none_needed' | 'suppressed_by_budget' | 'needs_clarification';

export interface RoutingDecision {
  selectedRoute: RouteType;
  selectedCandidate: InterventionCandidate | null;
  routingOutcome: RoutingOutcome;
  consideredCandidateIds: string[];
  excludedCandidates: ExcludedCandidate[];
  reasonCodes: ReasonCode[];
  confidence: ConfidenceLevel;
  budget: RecommendationBudgetResult;
}

// A synthetic, always-available candidate representing "nothing here needs
// attention" - included in every evaluation so NONE is a genuine competitor,
// not just a fallback when the candidate list happens to be empty. It only
// wins when no real candidate out-urgencies it (see compareCandidates).
export const NO_INTERVENTION_CANDIDATE: InterventionCandidate = {
  candidateId: 'none',
  sourceModule: 'recovery_routing_engine',
  routeType: 'NONE',
  reasonCode: 'no_intervention_needed',
  evidence: { source: 'deterministic_calculation', confidence: 'high' },
  userEffort: 'low_bandwidth',
  estimatedDurationMinutes: 0,
  urgency: 'low',
  requiresReflection: false,
  requiresExternalAction: false,
  requiresConnector: false,
  requiresHumanContact: false,
  structuralProblem: false,
  prerequisitesMet: true,
  recentlyUsed: false,
  cooldownActive: false,
  eligibleForPrivacyZone: true,
};

const CONFIDENCE_RANK: Record<ConfidenceLevel, number> = { high: 2, medium: 1, low: 0 };
const URGENCY_RANK: Record<Urgency, number> = { high: 2, medium: 1, low: 0 };
const EFFORT_RANK: Record<BandwidthBand, number> = { low_bandwidth: 0, some_bandwidth: 1, reflective_bandwidth: 2 };
const PREFERENCE_RANK: Record<PreferenceMatch, number> = { preferred: 1, neutral: 0, avoided: -1 };

// Deterministic tie-break chain (spec's priority list, in order): explicit
// user request; structural problem vs self-regulation; urgency/safety; user
// preference; recent recency (avoid repeating what was just used); evidence
// quality; minimum effort; shorter duration; stable id as a last resort.
// Never a single opaque weighted score - every step is independently
// inspectable.
export const compareCandidates = (a: InterventionCandidate, b: InterventionCandidate): number => {
  const aExplicit = !!a.explicitUserRequest;
  const bExplicit = !!b.explicitUserRequest;
  if (aExplicit !== bExplicit) return aExplicit ? -1 : 1;

  const aStructural = a.structuralProblem && STRUCTURAL_PREFERRED_ROUTES.includes(a.routeType);
  const bStructural = b.structuralProblem && STRUCTURAL_PREFERRED_ROUTES.includes(b.routeType);
  if (aStructural !== bStructural) return aStructural ? -1 : 1;

  if (URGENCY_RANK[a.urgency] !== URGENCY_RANK[b.urgency]) return URGENCY_RANK[b.urgency] - URGENCY_RANK[a.urgency];

  const aPref = PREFERENCE_RANK[a.userPreferenceMatch ?? 'neutral'];
  const bPref = PREFERENCE_RANK[b.userPreferenceMatch ?? 'neutral'];
  if (aPref !== bPref) return bPref - aPref;

  if (a.recentlyUsed !== b.recentlyUsed) return a.recentlyUsed ? 1 : -1;

  if (CONFIDENCE_RANK[a.evidence.confidence] !== CONFIDENCE_RANK[b.evidence.confidence]) {
    return CONFIDENCE_RANK[b.evidence.confidence] - CONFIDENCE_RANK[a.evidence.confidence];
  }

  if (EFFORT_RANK[a.userEffort] !== EFFORT_RANK[b.userEffort]) return EFFORT_RANK[a.userEffort] - EFFORT_RANK[b.userEffort];

  if (a.estimatedDurationMinutes !== b.estimatedDurationMinutes) return a.estimatedDurationMinutes - b.estimatedDurationMinutes;

  return a.candidateId.localeCompare(b.candidateId);
};

const buildResult = (
  selectedRoute: RouteType,
  selectedCandidate: InterventionCandidate | null,
  routingOutcome: RoutingOutcome,
  consideredCandidateIds: string[],
  excludedCandidates: ExcludedCandidate[],
  reasonCodes: ReasonCode[],
  confidence: ConfidenceLevel,
  budget: RecommendationBudgetResult
): RoutingDecision => ({
  selectedRoute, selectedCandidate, routingOutcome, consideredCandidateIds, excludedCandidates, reasonCodes, confidence, budget,
});

// The single entry point: given whatever real candidates modules submitted,
// the current Capacity Gate result, and this session's recommendation
// history, decide exactly one outcome. Candidates are the caller's
// responsibility to source honestly - this function only arbitrates.
export const selectRoute = (
  candidates: InterventionCandidate[],
  bandwidth: CapacityGateResult,
  session: SessionRecommendationState
): RoutingDecision => {
  const budget = evaluateRecommendationBudget(session);
  const allCandidates = [...candidates, NO_INTERVENTION_CANDIDATE];
  const consideredCandidateIds = allCandidates.map((c) => c.candidateId);
  const explicitRequestExists = candidates.some((c) => c.explicitUserRequest);

  // Insufficient data to judge bandwidth at all: the honest move is to ask
  // one lightweight question, not assume low capacity - unless the user has
  // directly asked for something specific, in which case there's nothing to
  // ask about.
  if (!bandwidth.sufficientData && !explicitRequestExists) {
    return buildResult(
      'NONE', null, 'needs_clarification', consideredCandidateIds,
      allCandidates.map((c) => ({ candidateId: c.candidateId, excludedReason: 'effort_exceeds_bandwidth' as const })),
      ['no_intervention_needed'], 'low', budget
    );
  }

  const excluded: ExcludedCandidate[] = [];
  const eligible: InterventionCandidate[] = [];

  for (const c of allCandidates) {
    const isExplicit = !!c.explicitUserRequest;

    if (!c.prerequisitesMet) {
      excluded.push({ candidateId: c.candidateId, excludedReason: 'prerequisites_not_met' });
      continue;
    }
    if (!c.eligibleForPrivacyZone) {
      excluded.push({ candidateId: c.candidateId, excludedReason: 'privacy_zone_restricted' });
      continue;
    }
    if (c.cooldownActive && !isExplicit) {
      excluded.push({ candidateId: c.candidateId, excludedReason: 'cooldown_active' });
      continue;
    }
    if (!isEffortWithinBandwidth(c.userEffort, bandwidth.band) && !isExplicit) {
      excluded.push({ candidateId: c.candidateId, excludedReason: 'effort_exceeds_bandwidth' });
      continue;
    }
    if (!budget.allowPrimary && !isExplicit) {
      excluded.push({ candidateId: c.candidateId, excludedReason: 'budget_exhausted' });
      continue;
    }
    eligible.push(c);
  }

  if (eligible.length === 0) {
    const outcome: RoutingOutcome = !budget.allowPrimary && !explicitRequestExists ? 'suppressed_by_budget' : 'none_needed';
    return buildResult('NONE', null, outcome, consideredCandidateIds, excluded, ['no_intervention_needed'], 'high', budget);
  }

  const sorted = [...eligible].sort(compareCandidates);
  const top = sorted[0];
  for (const loser of sorted.slice(1)) {
    excluded.push({ candidateId: loser.candidateId, excludedReason: 'lower_priority_than_selected' });
  }

  if (top.routeType === 'NONE') {
    return buildResult('NONE', null, 'none_needed', consideredCandidateIds, excluded, ['no_intervention_needed'], 'high', budget);
  }

  if (top.evidence.confidence === 'low' && !top.explicitUserRequest) {
    return buildResult(top.routeType, top, 'needs_clarification', consideredCandidateIds, excluded, [top.reasonCode], 'low', budget);
  }

  return buildResult(top.routeType, top, 'selected', consideredCandidateIds, excluded, [top.reasonCode], top.evidence.confidence, budget);
};
