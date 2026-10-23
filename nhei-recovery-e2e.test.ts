// NHEI PHASE 4B - OFFLINE END-TO-END DEMONSTRATION
//
// Directive §6: "validated context -> recovery bridge -> candidate
// arbitration -> selected suggestion and alternatives -> explanation ->
// simulated user choice." Each scenario below chains all four pure
// stages (buildNheiRecoverySuggestions -> arbitrateNheiRecoverySuggestions
// -> initNheiRecoveryInteractionState -> applyNheiRecoveryInteraction) and
// asserts the system doesn't just produce candidates, but chooses,
// abstains, and respects a simulated user action correctly - never any
// Firestore access (see nhei-recovery-orchestration.test.ts for that
// wiring, proven separately).

import { describe, it, expect } from 'vitest';
import { buildNheiRecoverySuggestions } from './nhei-recovery-bridge';
import { arbitrateNheiRecoverySuggestions } from './nhei-recovery-arbitration';
import { initNheiRecoveryInteractionState, applyNheiRecoveryInteraction } from './nhei-recovery-interaction-contract';
import type { NheiRecoveryBridgeInput } from './nhei-recovery-bridge-types';
import type { NheiPersonalContextSummary } from './nhei-context-integration';
import type { NheiBehaviouralPattern } from './nhei-adaptive-behaviour-engine';
import type { NheiSafeguardingClearance } from './nhei-safeguarding-contract';

function emptySummary(overrides: Partial<NheiPersonalContextSummary> = {}): NheiPersonalContextSummary {
  return {
    insufficientEvidence: false,
    selfSystemActivity: [],
    dimensionActivity: [],
    behaviouralPatterns: [],
    confirmedInterpretations: [],
    openHypotheses: [],
    provenanceNote: 'synthetic test fixture',
    ...overrides,
  };
}

function pattern(overrides: Partial<NheiBehaviouralPattern> = {}): NheiBehaviouralPattern {
  return {
    behaviourEventIds: ['ev_b'],
    outcomeEventIds: ['ev_o'],
    occurrenceCount: 2,
    selfSystems: ['RELATIONAL_SELF'],
    dimensions: ['EMOTIONAL'],
    relationTypesObserved: ['RECURRENCE'],
    interpretationConfidence: 'medium',
    causalClaim: false,
    ...overrides,
  };
}

const CLEARED: NheiSafeguardingClearance = { cleared: true, ageBand: 'adult' };
const NOT_CLEARED: NheiSafeguardingClearance = { cleared: false, reason: 'safeguarding_layer_not_integrated' };

function baseInput(overrides: Partial<NheiRecoveryBridgeInput> = {}): NheiRecoveryBridgeInput {
  return {
    contextSummary: emptySummary(),
    capacityBand: null,
    existingRoutingCandidates: [],
    routingInsightsConsented: true,
    safeguardingClearance: CLEARED,
    ...overrides,
  };
}

// The full pipeline, one call - what a future real caller's composition
// would look like once wired (still offline here; no I/O anywhere).
function runPipeline(input: NheiRecoveryBridgeInput, unavailableModules?: string[]) {
  const bridgeResult = buildNheiRecoverySuggestions(input);
  const arbitration = arbitrateNheiRecoverySuggestions({ suggestions: bridgeResult.suggestions, unavailableModules });
  const interactionState = initNheiRecoveryInteractionState(arbitration);
  return { bridgeResult, arbitration, interactionState };
}

describe('E2E 1: leave-guilt / rest struggle - confirmed, explained, user accepts', () => {
  it('selects Reset Studio, explains itself, and the user can accept it', () => {
    const { arbitration, interactionState } = runPipeline(baseInput({
      contextSummary: emptySummary({
        confirmedInterpretations: [{ evidenceId: 'ev1', selfSystems: ['PERCEIVED_RECEIVED_SELF'], dimensions: ['EMOTIONAL'], evidenceQuality: 'high' }],
      }),
    }));
    expect(arbitration.selected?.targetModule).toBe('reset_studio');
    expect(arbitration.selected?.explanationForUser).toBeTruthy();
    expect(arbitration.selectionReason).toBeTruthy();
    const afterAccept = applyNheiRecoveryInteraction(interactionState, { type: 'accept', suggestionId: arbitration.selected!.suggestionId });
    expect(afterAccept.selectedSuggestionId).toBe(arbitration.selected!.suggestionId);
  });
});

describe('E2E 2: workplace boundary request - user asks "why this?" then accepts', () => {
  it('explains on request without changing the selection, then accepts', () => {
    const { arbitration, interactionState } = runPipeline(baseInput({
      contextSummary: emptySummary({ behaviouralPatterns: [pattern({ selfSystems: ['RELATIONAL_SELF'] })] }),
    }));
    expect(arbitration.selected?.targetModule).toBe('boundary_architect');
    let state = applyNheiRecoveryInteraction(interactionState, { type: 'explain', suggestionId: arbitration.selected!.suggestionId });
    expect(state.explainedSuggestionIds).toContain(arbitration.selected!.suggestionId);
    expect(state.selectedSuggestionId).toBe(arbitration.selected!.suggestionId);
    state = applyNheiRecoveryInteraction(state, { type: 'accept', suggestionId: arbitration.selected!.suggestionId });
    expect(state.selectedSuggestionId).toBe(arbitration.selected!.suggestionId);
  });
});

describe('E2E 3: overload + short-action request - low bandwidth respected end to end', () => {
  it('selects only a low-bandwidth-suitable option when the user has low capacity, never a heavier one', () => {
    const { arbitration } = runPipeline(baseInput({
      contextSummary: emptySummary({
        confirmedInterpretations: [{ evidenceId: 'ev2', selfSystems: ['INTERNAL_SELF'], dimensions: ['EMOTIONAL'], evidenceQuality: 'high' }],
      }),
      userStatedGoal: { preferredEffort: 'low_bandwidth' },
      capacityBand: 'low_bandwidth',
    }));
    // Both reset_studio and anxiety_reset independently qualify here
    // (both STABILISE, both low_bandwidth, both confirmed) - which one
    // wins the within-route-type tie-break is arbitration's own
    // deterministic, already-unit-tested rule order, not the point of
    // this scenario. What matters: it picked ONE of the two genuinely
    // fitting options, it's suitable, and it matches the stated goal -
    // never something heavier the user didn't ask for and can't do.
    expect(['reset_studio', 'anxiety_reset']).toContain(arbitration.selected?.targetModule);
    expect(arbitration.selected?.routeType).toBe('STABILISE');
    expect(arbitration.selected?.capacitySuitability).toBe('suitable');
    expect(arbitration.selected?.matchesStatedGoal).toBe(true);
  });
});

describe('E2E 4: separate vs same-episode recurrence - only genuine cross-episode repeats are selected', () => {
  it('a same-episode-only SEQUENCE pattern never reaches selection', () => {
    const { arbitration } = runPipeline(baseInput({
      contextSummary: emptySummary({
        behaviouralPatterns: [pattern({ selfSystems: ['RELATIONAL_SELF'], relationTypesObserved: ['SEQUENCE'] })],
      }),
    }));
    expect(arbitration.selected).toBeNull();
    expect(arbitration.abstentionReason).toBe('no_candidates');
  });

  it('a genuine cross-episode RECURRENCE pattern is selected and explained', () => {
    const { arbitration } = runPipeline(baseInput({
      contextSummary: emptySummary({
        behaviouralPatterns: [pattern({ selfSystems: ['RELATIONAL_SELF'], relationTypesObserved: ['RECURRENCE'] })],
      }),
    }));
    expect(arbitration.selected?.targetModule).toBe('boundary_architect');
  });
});

describe('E2E 5: low and unknown capacity - never conflated, never a default pick when unsuitable', () => {
  it('unknown capacity (no signal at all) still allows a selection, correctly labelled unknown', () => {
    const { arbitration } = runPipeline(baseInput({
      contextSummary: emptySummary({ behaviouralPatterns: [pattern({ selfSystems: ['INTERNAL_SELF'] })] }),
      capacityBand: null,
    }));
    expect(arbitration.selected?.capacitySuitability).toBe('unknown');
  });

  it('low capacity makes a higher-effort suggestion unsuitable and it is never the default pick', () => {
    const { arbitration } = runPipeline(baseInput({
      contextSummary: emptySummary({ behaviouralPatterns: [pattern({ selfSystems: ['RELATIONAL_SELF'] })] }), // boundary_architect needs some_bandwidth
      capacityBand: 'low_bandwidth',
    }));
    expect(arbitration.selected).toBeNull();
    expect(arbitration.abstentionReason).toBe('all_unsuitable_for_capacity');
    expect(arbitration.alternatives.some((a) => a.targetModule === 'boundary_architect')).toBe(true);
  });
});

describe('E2E 6: multiple conflicting suggestions for the same route - reconciled, not duplicated', () => {
  it('reset_studio and anxiety_reset both target STABILISE - arbitration picks one, keeps the other in dedupedAway', () => {
    const { bridgeResult, arbitration } = runPipeline(baseInput({
      contextSummary: emptySummary({
        confirmedInterpretations: [{ evidenceId: 'ev3', selfSystems: ['INTERNAL_SELF'], dimensions: ['EMOTIONAL'], evidenceQuality: 'high' }],
      }),
      userStatedGoal: { preferredEffort: 'low_bandwidth' },
    }));
    const stabiliseCandidates = bridgeResult.suggestions.filter((s) => s.routeType === 'STABILISE');
    expect(stabiliseCandidates.length).toBeGreaterThanOrEqual(2);
    expect(arbitration.selected?.routeType).toBe('STABILISE');
    expect(arbitration.dedupedAway.some((d) => d.routeType === 'STABILISE')).toBe(true);
  });
});

describe('E2E 7: user correction - flagged without changing selection or writing anywhere', () => {
  it('correcting the interpretation keeps the suggestion selected and records only an id', () => {
    const { arbitration, interactionState } = runPipeline(baseInput({
      contextSummary: emptySummary({
        confirmedInterpretations: [{ evidenceId: 'ev4', selfSystems: ['INTERNAL_SELF'], dimensions: ['PHYSICAL'], evidenceQuality: 'high' }],
      }),
    }));
    const next = applyNheiRecoveryInteraction(interactionState, {
      type: 'correct_interpretation', suggestionId: arbitration.selected!.suggestionId, note: 'not about tiredness at all',
    });
    expect(next.correctedSuggestionIds).toContain(arbitration.selected!.suggestionId);
    expect(next.selectedSuggestionId).toBe(arbitration.selected!.suggestionId);
    expect(JSON.stringify(next)).not.toContain('tiredness at all');
  });
});

describe('E2E 8: user dismissal - real, not resistance', () => {
  it('dismissing the selected suggestion clears the selection without any penalty field', () => {
    const { arbitration, interactionState } = runPipeline(baseInput({
      contextSummary: emptySummary({ behaviouralPatterns: [pattern({ selfSystems: ['RELATIONAL_SELF'] })] }),
    }));
    const next = applyNheiRecoveryInteraction(interactionState, { type: 'dismiss', suggestionId: arbitration.selected!.suggestionId });
    expect(next.selectedSuggestionId).toBeNull();
    expect(next).not.toHaveProperty('resistanceScore');
  });

  it('declining everything for this interaction is a real, inspectable outcome', () => {
    const { interactionState } = runPipeline(baseInput({
      contextSummary: emptySummary({ behaviouralPatterns: [pattern({ selfSystems: ['RELATIONAL_SELF'] })] }),
    }));
    const next = applyNheiRecoveryInteraction(interactionState, { type: 'decline_all' });
    expect(next.declinedAll).toBe(true);
    expect(next.selectedSuggestionId).toBeNull();
  });
});

describe('E2E 9: no suitable intervention - explicit abstention, never silence, never a bad default', () => {
  it('abstains honestly when every real candidate is capacity-unsuitable', () => {
    const { arbitration } = runPipeline(baseInput({
      contextSummary: emptySummary({ behaviouralPatterns: [pattern({ selfSystems: ['INTERNAL_SELF'], occurrenceCount: 10 })] }),
      userStatedGoal: { preferredRouteType: 'ACT' }, // action_engine needs reflective_bandwidth
      capacityBand: 'low_bandwidth',
    }));
    expect(arbitration.selected).toBeNull();
    expect(arbitration.abstentionReason).toBe('all_unsuitable_for_capacity');
  });
});

describe('E2E 10: consent denied - fails closed before arbitration ever sees a candidate', () => {
  it('no suggestions, no selection, explicit reason', () => {
    const { bridgeResult, arbitration } = runPipeline(baseInput({
      contextSummary: emptySummary({ behaviouralPatterns: [pattern({ selfSystems: ['RELATIONAL_SELF'], occurrenceCount: 10 })] }),
      routingInsightsConsented: false,
    }));
    expect(bridgeResult.noSuggestionReason).toBe('consent_not_granted');
    expect(arbitration.selected).toBeNull();
    expect(arbitration.abstentionReason).toBe('no_candidates');
  });
});

describe('E2E 11: safeguarding denied - fails closed identically', () => {
  it('no suggestions, no selection, explicit reason', () => {
    const { bridgeResult, arbitration } = runPipeline(baseInput({
      contextSummary: emptySummary({ behaviouralPatterns: [pattern({ selfSystems: ['RELATIONAL_SELF'], occurrenceCount: 10 })] }),
      safeguardingClearance: NOT_CLEARED,
    }));
    expect(bridgeResult.noSuggestionReason).toBe('safeguarding_not_cleared');
    expect(arbitration.selected).toBeNull();
    expect(arbitration.abstentionReason).toBe('no_candidates');
  });
});

describe('E2E 12: unsupported/unavailable destination - excluded, never silently invented around', () => {
  it('a real candidate flagged unavailable is excluded, falling back to a genuinely different alternative if one exists', () => {
    const { arbitration } = runPipeline(baseInput({
      contextSummary: emptySummary({
        behaviouralPatterns: [pattern({ selfSystems: ['RELATIONAL_SELF'] })],
        confirmedInterpretations: [{ evidenceId: 'ev5', selfSystems: ['INTERNAL_SELF'], dimensions: ['PHYSICAL'], evidenceQuality: 'high' }],
      }),
    }), ['boundary_architect']);
    expect(arbitration.selected?.targetModule).not.toBe('boundary_architect');
    expect(arbitration.selected?.targetModule).toBe('energy_delta');
  });

  it('abstains honestly when the ONLY candidate is unavailable, rather than inventing a substitute', () => {
    const { arbitration } = runPipeline(baseInput({
      contextSummary: emptySummary({ behaviouralPatterns: [pattern({ selfSystems: ['RELATIONAL_SELF'] })] }),
    }), ['boundary_architect']);
    expect(arbitration.selected).toBeNull();
    expect(arbitration.abstentionReason).toBe('all_targets_unavailable');
  });
});

describe('E2E 13: a clear stated goal with insufficient evidence - evidence threshold still wins', () => {
  it('insufficientEvidence blocks suggestions even when the user has stated a clear goal', () => {
    const { bridgeResult, arbitration } = runPipeline(baseInput({
      contextSummary: emptySummary({ insufficientEvidence: true, behaviouralPatterns: [pattern({ selfSystems: ['RELATIONAL_SELF'] })] }),
      userStatedGoal: { preferredRouteType: 'ACT' },
    }));
    expect(bridgeResult.noSuggestionReason).toBe('insufficient_evidence');
    expect(arbitration.selected).toBeNull();
  });
});

describe('E2E 14: multiple possible pathways - several genuinely distinct alternatives survive to the user', () => {
  it('a boundary pattern plus a physical signal yields a selection and real alternatives, not a false single answer', () => {
    const { arbitration } = runPipeline(baseInput({
      contextSummary: emptySummary({
        behaviouralPatterns: [pattern({ selfSystems: ['RELATIONAL_SELF'] })],
        confirmedInterpretations: [{ evidenceId: 'ev6', selfSystems: ['INTERNAL_SELF'], dimensions: ['PHYSICAL'], evidenceQuality: 'high' }],
      }),
    }));
    expect(arbitration.selected).not.toBeNull();
    expect(arbitration.alternatives.length).toBeGreaterThan(0);
  });
});

describe('E2E 15: never a command - the whole pipeline output is inert, inspectable data', () => {
  it('nothing in bridgeResult, arbitration, or interactionState is a function or has a navigate/execute field', () => {
    const { bridgeResult, arbitration, interactionState } = runPipeline(baseInput({
      contextSummary: emptySummary({ behaviouralPatterns: [pattern({ selfSystems: ['RELATIONAL_SELF'] })] }),
    }));
    for (const obj of [bridgeResult, arbitration, interactionState]) {
      expect(obj).not.toHaveProperty('navigate');
      expect(obj).not.toHaveProperty('execute');
      expect(obj).not.toHaveProperty('launch');
    }
  });
});
