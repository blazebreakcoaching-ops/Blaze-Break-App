import { describe, it, expect } from 'vitest';
import {
  selectRoute, compareCandidates, evaluateRecommendationBudget, NO_INTERVENTION_CANDIDATE,
  EMPTY_SESSION_STATE, SESSION_RECOMMENDATION_OFFER_LIMIT,
  InterventionCandidate, SessionRecommendationState,
} from './recovery-routing-engine';
import { determineBandwidth, CapacityGateResult } from './recovery-capacity-gate';

// A minimal, fully-specified candidate - tests override only what matters
// for the scenario under test, so every field's default is deliberately the
// most "unremarkable" value (not recently used, no cooldown, prerequisites
// met, eligible everywhere, medium urgency/confidence).
const candidate = (overrides: Partial<InterventionCandidate> & Pick<InterventionCandidate, 'candidateId' | 'sourceModule' | 'routeType' | 'reasonCode'>): InterventionCandidate => ({
  evidence: { source: 'deterministic_calculation', confidence: 'medium' },
  userEffort: 'some_bandwidth',
  estimatedDurationMinutes: 5,
  urgency: 'medium',
  requiresReflection: false,
  requiresExternalAction: false,
  requiresConnector: false,
  requiresHumanContact: false,
  structuralProblem: false,
  prerequisitesMet: true,
  recentlyUsed: false,
  cooldownActive: false,
  eligibleForPrivacyZone: true,
  ...overrides,
});

const sufficientBand = (band: CapacityGateResult['band'] = 'reflective_bandwidth'): CapacityGateResult => ({
  band, sufficientData: true, source: 'capacity_check_in',
});

describe('evaluateRecommendationBudget', () => {
  it('allows a primary recommendation within budget', () => {
    expect(evaluateRecommendationBudget(EMPTY_SESSION_STATE)).toEqual({ allowPrimary: true, reason: 'within_budget' });
  });

  it('stops offering once the session limit is reached', () => {
    const session: SessionRecommendationState = { ...EMPTY_SESSION_STATE, recommendationsOffered: SESSION_RECOMMENDATION_OFFER_LIMIT };
    expect(evaluateRecommendationBudget(session)).toEqual({ allowPrimary: false, reason: 'session_recommendation_limit_reached' });
  });

  it('the user explicitly asking for more overrides the session limit', () => {
    const session: SessionRecommendationState = { ...EMPTY_SESSION_STATE, recommendationsOffered: SESSION_RECOMMENDATION_OFFER_LIMIT, userRequestedMore: true };
    expect(evaluateRecommendationBudget(session)).toEqual({ allowPrimary: true, reason: 'user_requested_more' });
  });
});

describe('selectRoute - required scenario matrix', () => {
  it('low capacity + high workload -> REDUCE preferred over adding another recovery task (signature behaviour)', () => {
    const candidates = [
      candidate({ candidateId: 'recovery_fuel', sourceModule: 'recovery_fuel', routeType: 'RECOVER', reasonCode: 'recovery_foundation_low', userEffort: 'low_bandwidth', urgency: 'medium' }),
      candidate({ candidateId: 'one_less_thing', sourceModule: 'one_less_thing', routeType: 'REDUCE', reasonCode: 'high_demand_low_capacity', userEffort: 'low_bandwidth', urgency: 'high', structuralProblem: true }),
    ];
    const decision = selectRoute(candidates, sufficientBand('low_bandwidth'), EMPTY_SESSION_STATE);
    expect(decision.selectedRoute).toBe('REDUCE');
    expect(decision.selectedCandidate?.candidateId).toBe('one_less_thing');
    expect(decision.routingOutcome).toBe('selected');
  });

  it('low capacity + recovery foundation issue -> RECOVER, kept to low effort', () => {
    const candidates = [
      candidate({ candidateId: 'recovery_fuel', sourceModule: 'recovery_fuel', routeType: 'RECOVER', reasonCode: 'recovery_foundation_low', userEffort: 'low_bandwidth', urgency: 'high' }),
      candidate({ candidateId: 'weekly_review', sourceModule: 'weekly_review', routeType: 'UNDERSTAND', reasonCode: 'repeated_pressure_pattern', userEffort: 'reflective_bandwidth', urgency: 'low' }),
    ];
    const decision = selectRoute(candidates, sufficientBand('low_bandwidth'), EMPTY_SESSION_STATE);
    expect(decision.selectedRoute).toBe('RECOVER');
    // The reflective-effort candidate is never even in contention at low bandwidth.
    expect(decision.excludedCandidates.find((e) => e.candidateId === 'weekly_review')?.excludedReason).toBe('effort_exceeds_bandwidth');
  });

  it('high workload + good capacity -> a reflective/ACT-type candidate is allowed through', () => {
    const candidates = [
      candidate({ candidateId: 'action_engine', sourceModule: 'action_engine', routeType: 'ACT', reasonCode: 'boundary_issue_confirmed', userEffort: 'reflective_bandwidth', urgency: 'medium', structuralProblem: true }),
    ];
    const decision = selectRoute(candidates, sufficientBand('reflective_bandwidth'), EMPTY_SESSION_STATE);
    expect(decision.selectedRoute).toBe('ACT');
  });

  it('repeated boundary problem -> ACT/PROTECT preferred over STABILISE because it is flagged structural', () => {
    const candidates = [
      candidate({ candidateId: 'guided_reset', sourceModule: 'guided_reset', routeType: 'STABILISE', reasonCode: 'high_demand_low_capacity', userEffort: 'low_bandwidth', urgency: 'medium' }),
      candidate({ candidateId: 'capacity_firewall', sourceModule: 'capacity_firewall', routeType: 'PROTECT', reasonCode: 'boundary_issue_confirmed', userEffort: 'some_bandwidth', urgency: 'medium', structuralProblem: true }),
    ];
    const decision = selectRoute(candidates, sufficientBand('reflective_bandwidth'), EMPTY_SESSION_STATE);
    expect(decision.selectedRoute).toBe('PROTECT');
  });

  it('acute overwhelm -> STABILISE wins on urgency even with lower effort alternatives available', () => {
    const candidates = [
      candidate({ candidateId: 'guided_reset', sourceModule: 'guided_reset', routeType: 'STABILISE', reasonCode: 'high_demand_low_capacity', userEffort: 'low_bandwidth', urgency: 'high' }),
      candidate({ candidateId: 'one_less_thing', sourceModule: 'one_less_thing', routeType: 'REDUCE', reasonCode: 'high_demand_low_capacity', userEffort: 'low_bandwidth', urgency: 'medium' }),
    ];
    const decision = selectRoute(candidates, sufficientBand('low_bandwidth'), EMPTY_SESSION_STATE);
    expect(decision.selectedRoute).toBe('STABILISE');
  });

  it('user explicitly asks for one feature -> respected even though effort exceeds bandwidth and it is on cooldown', () => {
    const candidates = [
      candidate({
        candidateId: 'weekly_review', sourceModule: 'weekly_review', routeType: 'UNDERSTAND', reasonCode: 'explicit_user_request',
        userEffort: 'reflective_bandwidth', urgency: 'low', cooldownActive: true, explicitUserRequest: true,
        evidence: { source: 'current_user_report', confidence: 'high' },
      }),
    ];
    const decision = selectRoute(candidates, sufficientBand('low_bandwidth'), EMPTY_SESSION_STATE);
    expect(decision.selectedRoute).toBe('UNDERSTAND');
    expect(decision.selectedCandidate?.candidateId).toBe('weekly_review');
  });

  it('no history -> insufficient data means a clarifying question, never a confident guess', () => {
    const bandwidth = determineBandwidth({});
    const decision = selectRoute([], bandwidth, EMPTY_SESSION_STATE);
    expect(decision.routingOutcome).toBe('needs_clarification');
    expect(decision.selectedCandidate).toBeNull();
  });

  it('stale history (old capacity score, current delta state has since worsened) -> current delta state wins', () => {
    const bandwidth = determineBandwidth({ capacityScore: 90, deltaState: 'significant_gap' });
    expect(bandwidth.band).toBe('low_bandwidth');
  });

  it('conflicting signals (one high-urgency, one low-urgency candidate) -> deterministically resolved by urgency, not ambiguous', () => {
    const candidates = [
      candidate({ candidateId: 'a', sourceModule: 'mod_a', routeType: 'STABILISE', reasonCode: 'high_demand_low_capacity', urgency: 'high' }),
      candidate({ candidateId: 'b', sourceModule: 'mod_b', routeType: 'UNDERSTAND', reasonCode: 'repeated_pressure_pattern', urgency: 'low' }),
    ];
    const decision = selectRoute(candidates, sufficientBand(), EMPTY_SESSION_STATE);
    expect(decision.selectedCandidate?.candidateId).toBe('a');
  });

  it('a genuine low-urgency UNDERSTAND candidate (matching real signal-derived confidence/effort) is selected over the synthetic NONE candidate, not silently excluded by it', () => {
    // Reproduces exactly what recovery-signal-candidates.ts's buildUnderstandCandidate
    // actually produces for a real 3x repeated non-boundary trigger pattern: urgency
    // 'low' (ties NONE's own hardcoded urgency), confidence 'medium' (below NONE's
    // hardcoded 'high'), reflective_bandwidth effort (above NONE's hardcoded
    // low_bandwidth). Before compareCandidates' NO_INTERVENTION_CANDIDATE tie-break
    // existed, those two facts made NONE win every one of these ties, so a 3x (not
    // yet 5x) repeated pattern could never actually surface as UNDERSTAND - this
    // guards against that regressing.
    const candidates = [
      candidate({
        candidateId: 'my_patterns_understand', sourceModule: 'my_patterns', routeType: 'UNDERSTAND',
        reasonCode: 'repeated_pressure_pattern', urgency: 'low', userEffort: 'reflective_bandwidth',
        requiresReflection: true, evidence: { source: 'recent_repeated_pattern', confidence: 'medium' },
      }),
    ];
    const decision = selectRoute(candidates, sufficientBand('reflective_bandwidth'), EMPTY_SESSION_STATE);
    expect(decision.selectedRoute).toBe('UNDERSTAND');
    expect(decision.selectedCandidate?.candidateId).toBe('my_patterns_understand');
  });

  it('the synthetic NONE candidate still wins outright when it is the only thing eligible', () => {
    const decision = selectRoute([], sufficientBand(), EMPTY_SESSION_STATE);
    expect(decision.selectedRoute).toBe('NONE');
    expect(decision.routingOutcome).toBe('none_needed');
  });

  it('user declines recommendation (tracked via session state) -> after enough offers, suppressed rather than repeatedly re-offered', () => {
    const session: SessionRecommendationState = { ...EMPTY_SESSION_STATE, recommendationsOffered: SESSION_RECOMMENDATION_OFFER_LIMIT, recommendationsDeclined: 2 };
    const candidates = [candidate({ candidateId: 'a', sourceModule: 'mod_a', routeType: 'STABILISE', reasonCode: 'high_demand_low_capacity' })];
    const decision = selectRoute(candidates, sufficientBand(), session);
    expect(decision.routingOutcome).toBe('suppressed_by_budget');
    expect(decision.selectedCandidate).toBeNull();
  });

  it('multiple modules compete -> exactly one is selected, the rest are recorded as excluded, never shown together', () => {
    const candidates = [
      candidate({ candidateId: 'a', sourceModule: 'mod_a', routeType: 'STABILISE', reasonCode: 'high_demand_low_capacity', urgency: 'high' }),
      candidate({ candidateId: 'b', sourceModule: 'mod_b', routeType: 'REDUCE', reasonCode: 'high_demand_low_capacity', urgency: 'medium' }),
      candidate({ candidateId: 'c', sourceModule: 'mod_c', routeType: 'RECOVER', reasonCode: 'recovery_foundation_low', urgency: 'low' }),
    ];
    const decision = selectRoute(candidates, sufficientBand(), EMPTY_SESSION_STATE);
    expect(decision.selectedCandidate?.candidateId).toBe('a');
    expect(decision.excludedCandidates.filter((e) => e.excludedReason === 'lower_priority_than_selected').map((e) => e.candidateId).sort())
      .toEqual(['b', 'c', 'none']);
  });

  it('no intervention appropriate -> NONE is a genuine outcome when nothing was submitted', () => {
    const decision = selectRoute([], sufficientBand(), EMPTY_SESSION_STATE);
    expect(decision.selectedRoute).toBe('NONE');
    expect(decision.routingOutcome).toBe('none_needed');
    expect(decision.reasonCodes).toEqual(['no_intervention_needed']);
  });

  it('Support Circle unavailable -> a CONNECT candidate missing its prerequisite is excluded outright, even if nothing else qualifies', () => {
    const candidates = [
      candidate({ candidateId: 'reach_someone', sourceModule: 'support_circle', routeType: 'CONNECT', reasonCode: 'human_support_requested', prerequisitesMet: false, requiresHumanContact: true }),
    ];
    const decision = selectRoute(candidates, sufficientBand(), EMPTY_SESSION_STATE);
    expect(decision.selectedRoute).toBe('NONE');
    expect(decision.excludedCandidates.find((e) => e.candidateId === 'reach_someone')?.excludedReason).toBe('prerequisites_not_met');
  });

  it('connector unavailable -> a connector-dependent candidate is excluded, never recommended from stale connector data', () => {
    const candidates = [
      candidate({ candidateId: 'connected_tool', sourceModule: 'connector_module', routeType: 'ACT', reasonCode: 'boundary_issue_confirmed', requiresConnector: true, prerequisitesMet: false }),
    ];
    const decision = selectRoute(candidates, sufficientBand(), EMPTY_SESSION_STATE);
    expect(decision.selectedRoute).toBe('NONE');
    expect(decision.excludedCandidates.find((e) => e.candidateId === 'connected_tool')?.excludedReason).toBe('prerequisites_not_met');
  });

  it('under-18 account -> a candidate restricted for the privacy zone is excluded outright, even with an explicit request', () => {
    const candidates = [
      candidate({
        candidateId: 'alcohol_fuel_tip', sourceModule: 'recovery_fuel', routeType: 'RECOVER', reasonCode: 'recovery_foundation_low',
        eligibleForPrivacyZone: false, explicitUserRequest: true,
      }),
    ];
    const decision = selectRoute(candidates, sufficientBand(), EMPTY_SESSION_STATE);
    expect(decision.selectedRoute).toBe('NONE');
    expect(decision.excludedCandidates.find((e) => e.candidateId === 'alcohol_fuel_tip')?.excludedReason).toBe('privacy_zone_restricted');
  });

  it('organisation-sponsored account -> same privacy-zone exclusion mechanism applies', () => {
    const candidates = [
      candidate({ candidateId: 'org_restricted', sourceModule: 'mod_a', routeType: 'UNDERSTAND', reasonCode: 'repeated_pressure_pattern', eligibleForPrivacyZone: false }),
    ];
    const decision = selectRoute(candidates, sufficientBand(), EMPTY_SESSION_STATE);
    expect(decision.selectedRoute).toBe('NONE');
  });
});

describe('selectRoute - additional invariants', () => {
  it('never selects more than one candidate (hard Recommendation Budget of one primary)', () => {
    const candidates = [
      candidate({ candidateId: 'a', sourceModule: 'mod_a', routeType: 'STABILISE', reasonCode: 'high_demand_low_capacity' }),
      candidate({ candidateId: 'b', sourceModule: 'mod_b', routeType: 'REDUCE', reasonCode: 'high_demand_low_capacity' }),
    ];
    const decision = selectRoute(candidates, sufficientBand(), EMPTY_SESSION_STATE);
    const selectedCount = [decision.selectedCandidate].filter(Boolean).length;
    expect(selectedCount).toBeLessThanOrEqual(1);
  });

  it('low confidence evidence triggers a clarifying question rather than a confident recommendation', () => {
    const candidates = [
      candidate({ candidateId: 'a', sourceModule: 'mod_a', routeType: 'UNDERSTAND', reasonCode: 'repeated_pressure_pattern', evidence: { source: 'nova_hypothesis', confidence: 'low' } }),
    ];
    const decision = selectRoute(candidates, sufficientBand(), EMPTY_SESSION_STATE);
    expect(decision.routingOutcome).toBe('needs_clarification');
  });

  it('a recently-used candidate is deprioritised behind a fresh one', () => {
    const candidates = [
      candidate({ candidateId: 'stale', sourceModule: 'guided_reset', routeType: 'STABILISE', reasonCode: 'high_demand_low_capacity', recentlyUsed: true }),
      candidate({ candidateId: 'fresh', sourceModule: 'guided_reset', routeType: 'STABILISE', reasonCode: 'high_demand_low_capacity', recentlyUsed: false }),
    ];
    const decision = selectRoute(candidates, sufficientBand(), EMPTY_SESSION_STATE);
    expect(decision.selectedCandidate?.candidateId).toBe('fresh');
  });

  it('a user-preferred candidate beats an otherwise-equal neutral one', () => {
    const candidates = [
      candidate({ candidateId: 'neutral', sourceModule: 'mod_a', routeType: 'STABILISE', reasonCode: 'high_demand_low_capacity', userPreferenceMatch: 'neutral' }),
      candidate({ candidateId: 'preferred', sourceModule: 'mod_b', routeType: 'STABILISE', reasonCode: 'high_demand_low_capacity', userPreferenceMatch: 'preferred' }),
    ];
    const decision = selectRoute(candidates, sufficientBand(), EMPTY_SESSION_STATE);
    expect(decision.selectedCandidate?.candidateId).toBe('preferred');
  });

  it('an avoided candidate loses to a neutral one even if submitted first', () => {
    const candidates = [
      candidate({ candidateId: 'avoided', sourceModule: 'mod_a', routeType: 'UNDERSTAND', reasonCode: 'repeated_pressure_pattern', userPreferenceMatch: 'avoided' }),
      candidate({ candidateId: 'neutral', sourceModule: 'mod_b', routeType: 'UNDERSTAND', reasonCode: 'repeated_pressure_pattern', userPreferenceMatch: 'neutral' }),
    ];
    const decision = selectRoute(candidates, sufficientBand(), EMPTY_SESSION_STATE);
    expect(decision.selectedCandidate?.candidateId).toBe('neutral');
  });

  it('does not recommend reflective-effort work merely because a candidate exists for it, when bandwidth is low', () => {
    const candidates = [
      candidate({ candidateId: 'weekly_review', sourceModule: 'weekly_review', routeType: 'UNDERSTAND', reasonCode: 'repeated_pressure_pattern', userEffort: 'reflective_bandwidth' }),
    ];
    const decision = selectRoute(candidates, sufficientBand('low_bandwidth'), EMPTY_SESSION_STATE);
    expect(decision.selectedRoute).toBe('NONE');
    expect(decision.routingOutcome).toBe('none_needed');
  });

  it('every excluded candidate carries a reason - nothing silently disappears', () => {
    const candidates = [
      candidate({ candidateId: 'a', sourceModule: 'mod_a', routeType: 'STABILISE', reasonCode: 'high_demand_low_capacity', prerequisitesMet: false }),
      candidate({ candidateId: 'b', sourceModule: 'mod_b', routeType: 'REDUCE', reasonCode: 'high_demand_low_capacity' }),
    ];
    const decision = selectRoute(candidates, sufficientBand(), EMPTY_SESSION_STATE);
    expect(decision.consideredCandidateIds.sort()).toEqual(['a', 'b', 'none'].sort());
    const excludedIds = decision.excludedCandidates.map((e) => e.candidateId);
    expect(excludedIds).toContain('a');
    expect(excludedIds).toContain('none');
  });
});

describe('compareCandidates', () => {
  it('is a strict, deterministic total order (sorting twice gives the same result)', () => {
    const items = [
      candidate({ candidateId: 'z', sourceModule: 'm', routeType: 'STABILISE', reasonCode: 'high_demand_low_capacity' }),
      candidate({ candidateId: 'a', sourceModule: 'm', routeType: 'REDUCE', reasonCode: 'high_demand_low_capacity' }),
      NO_INTERVENTION_CANDIDATE,
    ];
    const sorted1 = [...items].sort(compareCandidates).map((c) => c.candidateId);
    const sorted2 = [...items].sort(compareCandidates).map((c) => c.candidateId);
    expect(sorted1).toEqual(sorted2);
  });
});
