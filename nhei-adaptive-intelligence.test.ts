import { describe, expect, it } from 'vitest';
import { adaptInterventionCandidates } from './nhei-adaptive-intelligence';
import { NO_INTERVENTION_CANDIDATE, selectRoute, EMPTY_SESSION_STATE, type InterventionCandidate } from './recovery-routing-engine';

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
      learningEnabled: true, currentBandwidthBand: 'low_bandwidth',
      outcomes: Array.from({ length: 3 }, () => ({ sourceModule: 'recover', feedback: 'better' as const, bandwidthBand: 'low_bandwidth' as const })),
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

describe('changing circumstances', () => {
  it('does not generalise helpfulness from a different capacity state', () => {
    const context = {
      learningEnabled: true,
      currentBandwidthBand: 'low_bandwidth' as const,
      outcomes: Array.from({ length: 3 }, () => ({
        sourceModule: 'recover',
        feedback: 'better' as const,
        bandwidthBand: 'reflective_bandwidth' as const,
      })),
    };
    const changed = adaptInterventionCandidates([candidate()], context);
    expect(changed.candidates[0].userPreferenceMatch).toBe('neutral');
    expect(changed.explanations).toEqual([]);
  });
  it('can learn within repeated comparable contexts', () => {
    const context = {
      learningEnabled: true,
      currentBandwidthBand: 'low_bandwidth' as const,
      outcomes: Array.from({ length: 3 }, () => ({
        sourceModule: 'recover',
        feedback: 'better' as const,
        bandwidthBand: 'low_bandwidth' as const,
      })),
    };
    expect(adaptInterventionCandidates([candidate()], context).candidates[0].userPreferenceMatch).toBe('preferred');
  });
});

describe('adaptive routing integration', () => {
  const band = { band: 'reflective_bandwidth' as const, sufficientData: true, source: 'capacity_check_in' as const };
  const other = candidate({
    candidateId: 'other-1', sourceModule: 'my_patterns',
    routeType: 'UNDERSTAND', urgency: 'low',
  });
  it('favours known helpful options among otherwise equivalent candidates', () => {
    const a = candidate({ candidateId: 'a-recover' });
    const b = candidate({ candidateId: 'b-recover', sourceModule: 'my_patterns' });
    const decision = selectRoute([a, b], band, EMPTY_SESSION_STATE, {
      learningEnabled: true,
      currentBandwidthBand: 'reflective_bandwidth',
      outcomes: Array.from({ length: 3 }, () => ({ sourceModule: 'my_patterns', feedback: 'better' as const, bandwidthBand: 'reflective_bandwidth' as const })),
    });
    expect(decision.selectedCandidate?.sourceModule).toBe('my_patterns');
  });
  it('never lets a learned preference bypass privacy restrictions', () => {
    const restricted = candidate({ candidateId: 'preferred-restricted', eligibleForPrivacyZone: false, urgency: 'high' });
    const decision = selectRoute([restricted, other], band, EMPTY_SESSION_STATE, {
      learningEnabled: true, outcomes: [], preferredModules: ['recover'],
    });
    expect(decision.selectedCandidate?.candidateId).toBe('other-1');
  });
  it('does not override a higher-urgency need with past preferences', () => {
    const urgent = candidate({ candidateId: 'urgent', urgency: 'high' });
    const decision = selectRoute([urgent, other], band, EMPTY_SESSION_STATE, {
      learningEnabled: true, outcomes: [], preferredModules: ['my_patterns'],
    });
    expect(decision.selectedCandidate?.candidateId).toBe('urgent');
  });
});

describe('adaptive inference uses comparable capacity evidence', () => {
  it('never infers preference without a known current capacity context', () => {
    const result = adaptInterventionCandidates([candidate()], {
      learningEnabled: true,
      outcomes: Array.from({ length: 5 }, () => ({ sourceModule: 'recover', feedback: 'better' as const, bandwidthBand: 'low_bandwidth' as const })),
    });
    expect(result.candidates[0].userPreferenceMatch).toBe('neutral');
    expect(result.explanations).toEqual([]);
  });

  it('does not treat past unknown capacity as comparable to a known band', () => {
    const result = adaptInterventionCandidates([candidate()], {
      learningEnabled: true,
      currentBandwidthBand: 'low_bandwidth',
      outcomes: Array.from({ length: 4 }, () => ({ sourceModule: 'recover', feedback: 'better' as const })),
    });
    expect(result.candidates[0].userPreferenceMatch).toBe('neutral');
  });

  it('still honours a direct declared module preference without a recorded capacity band', () => {
    const result = adaptInterventionCandidates([candidate()], {
      learningEnabled: true, outcomes: [], preferredModules: ['recover'],
    });
    expect(result.candidates[0].userPreferenceMatch).toBe('preferred');
    expect(result.explanations[0].basis).toBe('explicit_preference');
  });
});
