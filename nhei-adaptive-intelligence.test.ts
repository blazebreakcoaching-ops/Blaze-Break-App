import { describe, expect, it } from 'vitest';
import { adaptInterventionCandidates } from './nhei-adaptive-intelligence';
import { NO_INTERVENTION_CANDIDATE, type InterventionCandidate } from './recovery-routing-engine';

const candidate = (overrides: Partial<InterventionCandidate> = {}): InterventionCandidate => ({
  ...NO_INTERVENTION_CANDIDATE,
  candidateId: 'recover-1',
  sourceModule: 'recover',
  routeType: 'RECOVER',
  ...overrides,
});

describe('NHEI adaptive intelligence', () => {
  it('does not adapt without explicit learning consent', () => {
    const original = candidate();
    const result = adaptInterventionCandidates([original], {
      learningEnabled: false,
      preferredModules: ['recover'],
      outcomes: [],
    });
    expect(result.candidates[0]).toEqual(original);
    expect(result.explanations).toEqual([]);
  });

  it('uses a declared preference and never changes eligibility', () => {
    const result = adaptInterventionCandidates([candidate({ eligibleForPrivacyZone: false })], {
      learningEnabled: true, outcomes: [], avoidedModules: ['recover'],
    });
    expect(result.candidates[0].userPreferenceMatch).toBe('avoided');
    expect(result.candidates[0].eligibleForPrivacyZone).toBe(false);
  });

  it('requires at least three consistently positive outcomes', () => {
    const result = adaptInterventionCandidates([candidate()], {
      learningEnabled: true,
      outcomes: Array.from({ length: 3 }, () => ({ sourceModule: 'recover', feedback: 'better' as const })),
    });
    expect(result.candidates[0].userPreferenceMatch).toBe('preferred');
    expect(result.explanations[0].basis).toBe('confirmed_outcomes');
  });

  it('does not extrapolate from weak or ambiguous feedback', () => {
    const result = adaptInterventionCandidates([candidate()], {
      learningEnabled: true,
      outcomes: [
        { sourceModule: 'recover', feedback: 'better' },
        { sourceModule: 'recover', feedback: 'not_really' },
        { sourceModule: 'recover', feedback: 'not_sure' },
      ],
    });
    expect(result.candidates[0].userPreferenceMatch).toBe('neutral');
  });

  it('honours explicit user requests over learned avoidance', () => {
    const result = adaptInterventionCandidates([candidate({ explicitUserRequest: true })], {
      learningEnabled: true, outcomes: [], avoidedModules: ['recover'],
    });
    expect(result.candidates[0].userPreferenceMatch).toBeUndefined();
  });
});
