import { describe, expect, it } from 'vitest';
import { adaptInterventionCandidates } from './nhei-adaptive-intelligence';
import { selectRoute, EMPTY_SESSION_STATE, NO_INTERVENTION_CANDIDATE, type InterventionCandidate } from './recovery-routing-engine';
const band = (name: 'low_bandwidth' | 'reflective_bandwidth') => ({
  band: name, sufficientData: true, source: 'capacity_check_in' as const,
});
const choice = (id: string, sourceModule: string, overrides: Partial<InterventionCandidate> = {}): InterventionCandidate => ({
  ...NO_INTERVENTION_CANDIDATE,
  candidateId: id,
  sourceModule,
  routeType: 'RECOVER',
  urgency: 'medium',
  evidence: { source: 'current_user_report', confidence: 'medium' },
  userEffort: 'low_bandwidth',
  estimatedDurationMinutes: 3,
  ...overrides,
});

describe('NHEI individual situations', () => {
  it('does not choose a banned module, even if previously helpful', () => {
    const restricted = choice('restricted', 'recovery_fuel', { eligibleForPrivacyZone: false });
    const open = choice('open', 'guided_reset');
    const decision = selectRoute([restricted, open], band('low_bandwidth'), EMPTY_SESSION_STATE, {
      learningEnabled: true, preferredModules: ['recovery_fuel'], outcomes: [],
    });
    expect(decision.selectedCandidate?.candidateId).toBe('open');
  });
  it('respects a new direct request over established feedback', () => {
    const previous = choice('old', 'recovery_fuel');
    const now = choice('new', 'guided_reset', { explicitUserRequest: true });
    const decision = selectRoute([previous, now], band('low_bandwidth'), EMPTY_SESSION_STATE, {
      learningEnabled: true, preferredModules: ['recovery_fuel'], outcomes: [],
    });
    expect(decision.selectedCandidate?.candidateId).toBe('new');
  });
  it('will not use experience from another capacity context', () => {
    const candidates = [choice('a', 'recovery_fuel'), choice('b', 'guided_reset')];
    const result = adaptInterventionCandidates(candidates, {
      learningEnabled: true,
      currentBandwidthBand: 'low_bandwidth',
      outcomes: Array.from({ length: 4 }, () => ({
        sourceModule: 'recovery_fuel', feedback: 'better' as const,
        bandwidthBand: 'reflective_bandwidth' as const,
      })),
    });
    expect(result.explanations).toHaveLength(0);
  });
  it('without consent, does not infer preferences at all', () => {
    const candidate = choice('no-consent', 'recovery_fuel');
    expect(adaptInterventionCandidates([candidate], {
      learningEnabled: false,
      preferredModules: ['recovery_fuel'],
      outcomes: Array.from({ length: 4 }, () => ({ sourceModule: 'recovery_fuel', feedback: 'better' as const })),
    }).candidates[0]).toEqual(candidate);
  });
  it('offers no task when recommendation budget is exhausted', () => {
    const session = { ...EMPTY_SESSION_STATE, recommendationsOffered: 3 };
    const decision = selectRoute([choice('a','recovery_fuel')], band('low_bandwidth'), session);
    expect(decision.selectedCandidate).toBeNull();
    expect(decision.routingOutcome).toBe('suppressed_by_budget');
  });
  it('asks for clarification rather than guessing when capacity is unknown', () => {
    const decision = selectRoute([choice('a', 'guided_reset')], {
      band: 'low_bandwidth', sufficientData: false, source: 'unknown',
    }, EMPTY_SESSION_STATE);
    expect(decision.routingOutcome).toBe('needs_clarification');
  });
});
