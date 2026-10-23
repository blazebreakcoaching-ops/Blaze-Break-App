// NHEI PHASE 4 - RECOVERY INTELLIGENCE BRIDGE: TESTS
//
// All fixtures are synthetic - no real conversation text, no real user
// data. Covers the 16 named acceptance scenarios from the Phase 4
// directive section 11, plus the fail-closed consent/safeguarding checks
// and the Energy Delta audit-finding substitution. Every scenario asserts
// what the directive asked it to prove: no invented causation, no
// promised outcome, no overridden choice, no suggestion naming a
// capability that doesn't actually exist in MODULE_ROUTE_MAP.

import { describe, it, expect } from 'vitest';
import { buildNheiRecoverySuggestions } from './nhei-recovery-bridge';
import type { NheiRecoveryBridgeInput } from './nhei-recovery-bridge-types';
import type { NheiPersonalContextSummary } from './nhei-context-integration';
import type { NheiBehaviouralPattern } from './nhei-adaptive-behaviour-engine';
import { isKnownRoutingModule } from './recovery-signal-candidates';
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

function pattern(overrides: Partial<NheiBehaviouralPattern> = {}): NheiBehaviouralPattern {
  return {
    behaviourEventIds: ['ev_behaviour_1'],
    outcomeEventIds: ['ev_outcome_1'],
    occurrenceCount: 2,
    selfSystems: ['RELATIONAL_SELF'],
    dimensions: ['EMOTIONAL'],
    relationTypesObserved: ['RECURRENCE'],
    interpretationConfidence: 'medium',
    causalClaim: false,
    ...overrides,
  };
}

describe('buildNheiRecoverySuggestions - fail-closed gates', () => {
  it('returns consent_not_granted and no suggestions when routing_insights is not consented', () => {
    const result = buildNheiRecoverySuggestions(baseInput({ routingInsightsConsented: false }));
    expect(result.suggestions).toEqual([]);
    expect(result.noSuggestionReason).toBe('consent_not_granted');
  });

  it('returns safeguarding_not_cleared and no suggestions when safeguarding is not cleared (the only real-world value today)', () => {
    const result = buildNheiRecoverySuggestions(baseInput({ safeguardingClearance: NOT_CLEARED }));
    expect(result.suggestions).toEqual([]);
    expect(result.noSuggestionReason).toBe('safeguarding_not_cleared');
  });

  it('checks consent before safeguarding, never leaking which gate is real', () => {
    const result = buildNheiRecoverySuggestions(
      baseInput({ routingInsightsConsented: false, safeguardingClearance: NOT_CLEARED }),
    );
    expect(result.noSuggestionReason).toBe('consent_not_granted');
  });
});

describe('Phase 4 §11 synthetic acceptance scenarios', () => {
  // 1. A user who expected leave to be refused, received approval, and
  // found it hard to rest/settle afterwards - confirmed Emotional evidence,
  // no relational boundary pattern. Must not invent a causal story about
  // why rest is hard; must surface as 'confirmed' tagging / suggestion only.
  it('1. leave-guilt / difficulty resting after an approved request', () => {
    const result = buildNheiRecoverySuggestions(baseInput({
      contextSummary: emptySummary({
        confirmedInterpretations: [
          { evidenceId: 'ev_1', selfSystems: ['PERCEIVED_RECEIVED_SELF'], dimensions: ['EMOTIONAL'], evidenceQuality: 'high' },
        ],
      }),
    }));
    const settling = result.suggestions.find((s) => s.targetModule === 'reset_studio');
    expect(settling).toBeDefined();
    expect(settling!.interpretationKind).toBe('confirmed');
    expect(settling!.explanationForUser).not.toMatch(/because you felt guilty/i);
    expect(settling!.evidenceReferences).toEqual(['ev_1']);
  });

  // 2. A workplace boundary request (e.g. asking a colleague to stop a
  // behaviour) - recurring Relational Self pattern -> Boundary Architect,
  // never auto-navigated, never claiming to know the colleague's intent.
  it('2. workplace boundary request pattern', () => {
    const result = buildNheiRecoverySuggestions(baseInput({
      contextSummary: emptySummary({ behaviouralPatterns: [pattern({ selfSystems: ['RELATIONAL_SELF'] })] }),
    }));
    const boundary = result.suggestions.find((s) => s.targetModule === 'boundary_architect');
    expect(boundary).toBeDefined();
    expect(boundary!.routeType).toBe('PROTECT');
    expect(boundary!.safetyRestrictions).toContain('never_assert_unreported_third_party_beliefs');
    expect(boundary!.interpretationKind).toBe('tentative');
  });

  // 3. Overload with an explicit, stated request for something short ->
  // Anxiety Reset (STABILISE/low_bandwidth) only, never a longer programme.
  it('3. overload + explicit short-action request', () => {
    const result = buildNheiRecoverySuggestions(baseInput({
      contextSummary: emptySummary({
        openHypotheses: [{ evidenceId: 'ev_2', selfSystems: ['INTERNAL_SELF'], dimensions: ['EMOTIONAL'], evidenceQuality: 'medium' }],
      }),
      userStatedGoal: { preferredEffort: 'low_bandwidth' },
    }));
    const short = result.suggestions.find((s) => s.targetModule === 'anxiety_reset');
    expect(short).toBeDefined();
    expect(short!.capacitySuitability === 'unknown' || short!.capacitySuitability === 'suitable').toBe(true);
    expect(result.suggestions.some((s) => s.targetModule === 'action_engine')).toBe(false);
  });

  // 4. Unexplained fatigue with no established cause - still surfaces a
  // Physical-dimension suggestion (Recovery Fuel, substituting for the
  // non-routable Energy Delta module) without asserting a cause.
  it('4. unexplained fatigue with no established cause', () => {
    const result = buildNheiRecoverySuggestions(baseInput({
      contextSummary: emptySummary({
        openHypotheses: [{ evidenceId: 'ev_3', selfSystems: ['INTERNAL_SELF'], dimensions: ['PHYSICAL'], evidenceQuality: 'medium' }],
      }),
    }));
    const fuel = result.suggestions.find((s) => s.targetModule === 'recovery_fuel');
    expect(fuel).toBeDefined();
    expect(fuel!.interpretationKind).toBe('tentative');
    expect(fuel!.reason).not.toMatch(/caused by|because/i);
  });

  // 5. A difficult relationship interaction, reported once (no recurrence
  // yet) - must NOT produce a boundary suggestion; one anecdote is not a
  // pattern.
  it('5. a single difficult relationship interaction produces no boundary suggestion', () => {
    const result = buildNheiRecoverySuggestions(baseInput({
      contextSummary: emptySummary({
        openHypotheses: [{ evidenceId: 'ev_4', selfSystems: ['RELATIONAL_SELF'], dimensions: ['EMOTIONAL'], evidenceQuality: 'medium' }],
      }),
    }));
    expect(result.suggestions.some((s) => s.targetModule === 'boundary_architect')).toBe(false);
  });

  // 6. An improved outcome report - the bridge never claims credit or
  // promises the improvement will continue; it simply has nothing urgent
  // to suggest if evidence doesn't match a rule.
  it('6. improved outcome report results in no overpromising suggestion', () => {
    const result = buildNheiRecoverySuggestions(baseInput({
      contextSummary: emptySummary({
        confirmedInterpretations: [{ evidenceId: 'ev_5', selfSystems: ['INTERNAL_SELF'], dimensions: ['MENTAL'], evidenceQuality: 'high' }],
      }),
    }));
    for (const s of result.suggestions) {
      expect(s.explanationForUser).not.toMatch(/will keep improving|guaranteed|always works/i);
    }
  });

  // 7. The user disagrees with a system interpretation - represented here
  // as that evidence simply not appearing in confirmedInterpretations
  // (excludeDisputedInterpretations already strips it upstream); the
  // bridge must not re-derive or route around a disputed tag.
  it('7. disagreement with interpretation - disputed evidence is simply absent, never re-asserted', () => {
    const result = buildNheiRecoverySuggestions(baseInput({ contextSummary: emptySummary() }));
    expect(result.suggestions).toEqual([]);
    expect(result.noSuggestionReason).toBe('no_relevant_pattern');
  });

  // 8. A rejected recommendation - the bridge has no notion of "resistance"
  // anywhere in its types; it never penalises or excludes future
  // suggestions based on a past decline (no such field exists to check).
  it('8. rejected recommendation: result shape has no resistance/penalty field to check', () => {
    const result = buildNheiRecoverySuggestions(baseInput({
      contextSummary: emptySummary({ behaviouralPatterns: [pattern()] }),
    }));
    for (const s of result.suggestions) {
      expect(s).not.toHaveProperty('wasDeclinedBefore');
      expect(s).not.toHaveProperty('resistanceScore');
    }
  });

  // 9. No relevant NHEI evidence at all -> explicit no_relevant_pattern,
  // never a generic/filler suggestion.
  it('9. no relevant evidence produces an explicit no-suggestion reason', () => {
    const result = buildNheiRecoverySuggestions(baseInput({ contextSummary: emptySummary() }));
    expect(result.suggestions).toEqual([]);
    expect(result.noSuggestionReason).toBe('no_relevant_pattern');
  });

  // 10. Multiple possible recovery pathways exist (a relational pattern AND
  // a physical-dimension signal) - the bridge returns multiple inspectable
  // suggestions rather than silently picking a winner; ACT never appears
  // just because a pattern exists (requires an explicit stated goal too).
  it('10. multiple possible pathways returns multiple suggestions, none is ACT without a stated goal', () => {
    const result = buildNheiRecoverySuggestions(baseInput({
      contextSummary: emptySummary({
        behaviouralPatterns: [pattern({ selfSystems: ['RELATIONAL_SELF'] })],
        confirmedInterpretations: [{ evidenceId: 'ev_6', selfSystems: ['INTERNAL_SELF'], dimensions: ['PHYSICAL'], evidenceQuality: 'high' }],
      }),
    }));
    expect(result.suggestions.length).toBeGreaterThan(1);
    expect(result.suggestions.some((s) => s.routeType === 'ACT')).toBe(false);
  });

  // 11. Contradictory / low-quality evidence only - must not produce a
  // confident suggestion from low-quality evidence alone.
  it('11. low-quality-only evidence does not trigger a suggestion', () => {
    const result = buildNheiRecoverySuggestions(baseInput({
      contextSummary: emptySummary({
        confirmedInterpretations: [
          { evidenceId: 'ev_7', selfSystems: ['INTERNAL_SELF'], dimensions: ['EMOTIONAL'], evidenceQuality: 'low' },
          { evidenceId: 'ev_8', selfSystems: ['INTERNAL_SELF'], dimensions: ['PHYSICAL'], evidenceQuality: 'unknown' },
        ],
      }),
    }));
    expect(result.suggestions.some((s) => s.interpretationKind === 'confirmed')).toBe(false);
  });

  // 12. Repeated episodes (occurrenceCount above threshold) with a stated
  // ACT goal -> Action Engine fires, correctly cross-referencing the
  // directive's own worked example.
  it('12. repeated episodes with a stated goal -> Action Engine', () => {
    const result = buildNheiRecoverySuggestions(baseInput({
      contextSummary: emptySummary({ behaviouralPatterns: [pattern({ selfSystems: ['INTERNAL_SELF'], occurrenceCount: 4 })] }),
      userStatedGoal: { preferredRouteType: 'ACT' },
    }));
    const action = result.suggestions.find((s) => s.targetModule === 'action_engine');
    expect(action).toBeDefined();
    expect(action!.routeType).toBe('ACT');
  });

  // 13. Youth-appropriate interactions - ageBand is carried through
  // untouched from the safeguarding clearance, never re-derived.
  it('13. youth age band is carried through from safeguarding clearance, not re-derived', () => {
    const result = buildNheiRecoverySuggestions(baseInput({
      contextSummary: emptySummary({ behaviouralPatterns: [pattern({ selfSystems: ['RELATIONAL_SELF'] })] }),
      safeguardingClearance: { cleared: true, ageBand: 'youth' },
    }));
    expect(result.ageBand).toBe('youth');
  });

  // 14. Missing consent -> fail closed, covered by the gate tests above;
  // repeated here with real evidence present to prove evidence never
  // overrides consent.
  it('14. missing consent fails closed even with strong evidence present', () => {
    const result = buildNheiRecoverySuggestions(baseInput({
      contextSummary: emptySummary({ behaviouralPatterns: [pattern({ selfSystems: ['RELATIONAL_SELF'], occurrenceCount: 10 })] }),
      routingInsightsConsented: false,
    }));
    expect(result.suggestions).toEqual([]);
    expect(result.noSuggestionReason).toBe('consent_not_granted');
  });

  // 15. Safeguarding denial -> fail closed even with strong evidence
  // present (this is also every real call today, since
  // UNINTEGRATED_SAFEGUARDING_GATE always returns cleared: false).
  it('15. safeguarding denial fails closed even with strong evidence present', () => {
    const result = buildNheiRecoverySuggestions(baseInput({
      contextSummary: emptySummary({ behaviouralPatterns: [pattern({ selfSystems: ['RELATIONAL_SELF'], occurrenceCount: 10 })] }),
      safeguardingClearance: NOT_CLEARED,
    }));
    expect(result.suggestions).toEqual([]);
    expect(result.noSuggestionReason).toBe('safeguarding_not_cleared');
  });

  // 16. An unavailable/removed tool - simulated by a rule's target module
  // no longer existing in MODULE_ROUTE_MAP. Proven structurally: every
  // suggestion this file could ever emit must already pass
  // isKnownRoutingModule, so there is no code path that emits an
  // unverified module. This test asserts that invariant directly against
  // every suggestion from a run that exercises every rule at once.
  it('16. every suggestion names only a verified, currently-known routing module', () => {
    const result = buildNheiRecoverySuggestions(baseInput({
      contextSummary: emptySummary({
        behaviouralPatterns: [pattern({ selfSystems: ['RELATIONAL_SELF'] }), pattern({ selfSystems: ['INTERNAL_SELF'] })],
        confirmedInterpretations: [
          { evidenceId: 'ev_9', selfSystems: ['INTERNAL_SELF'], dimensions: ['EMOTIONAL'], evidenceQuality: 'high' },
          { evidenceId: 'ev_10', selfSystems: ['INTERNAL_SELF'], dimensions: ['PHYSICAL'], evidenceQuality: 'high' },
        ],
      }),
      userStatedGoal: { preferredRouteType: 'ACT', preferredEffort: 'low_bandwidth' },
    }));
    expect(result.suggestions.length).toBeGreaterThan(0);
    for (const s of result.suggestions) {
      expect(isKnownRoutingModule(s.targetModule)).toBe(true);
      for (const alt of s.alternativeModules) expect(isKnownRoutingModule(alt)).toBe(true);
    }
  });
});

describe('capacity suitability - never invents a score', () => {
  it('is "unknown" when capacityBand is null, never defaulted to suitable or unsuitable', () => {
    const result = buildNheiRecoverySuggestions(baseInput({
      contextSummary: emptySummary({ behaviouralPatterns: [pattern({ selfSystems: ['RELATIONAL_SELF'] })] }),
      capacityBand: null,
    }));
    const boundary = result.suggestions.find((s) => s.targetModule === 'boundary_architect');
    expect(boundary?.capacitySuitability).toBe('unknown');
  });

  it('is "unsuitable" when a real band exists but does not fit the required effort', () => {
    const result = buildNheiRecoverySuggestions(baseInput({
      contextSummary: emptySummary({ behaviouralPatterns: [pattern({ selfSystems: ['RELATIONAL_SELF'] })] }),
      capacityBand: 'low_bandwidth', // boundary_architect requires some_bandwidth
    }));
    const boundary = result.suggestions.find((s) => s.targetModule === 'boundary_architect');
    expect(boundary?.capacitySuitability).toBe('unsuitable');
  });

  it('is "suitable" when the real band covers the required effort', () => {
    const result = buildNheiRecoverySuggestions(baseInput({
      contextSummary: emptySummary({ behaviouralPatterns: [pattern({ selfSystems: ['RELATIONAL_SELF'] })] }),
      capacityBand: 'reflective_bandwidth',
    }));
    const boundary = result.suggestions.find((s) => s.targetModule === 'boundary_architect');
    expect(boundary?.capacitySuitability).toBe('suitable');
  });
});

describe('cross-referencing existing Recovery Routing candidates', () => {
  it('sets matchingExistingCandidateId when an independent candidate already exists for the same route', () => {
    const result = buildNheiRecoverySuggestions(baseInput({
      contextSummary: emptySummary({ behaviouralPatterns: [pattern({ selfSystems: ['RELATIONAL_SELF'] })] }),
      existingRoutingCandidates: [{
        candidateId: 'capacity_firewall_live',
        sourceModule: 'capacity_firewall',
        routeType: 'PROTECT',
        reasonCode: 'boundary_issue_confirmed',
        userEffort: 'some_bandwidth',
        urgency: 'medium',
        evidence: { source: 'user_report', confidence: 'medium' },
        structuralProblem: false,
        prerequisitesMet: true,
        eligibleForPrivacyZone: true,
        recentlyUsed: false,
        userPreferenceMatch: 'neutral',
        requiresConnector: false,
        requiresHumanContact: false,
      } as any],
    }));
    const boundary = result.suggestions.find((s) => s.targetModule === 'boundary_architect');
    expect(boundary?.matchingExistingCandidateId).toBe('capacity_firewall_live');
  });

  it('leaves matchingExistingCandidateId null when no existing candidate shares the route', () => {
    const result = buildNheiRecoverySuggestions(baseInput({
      contextSummary: emptySummary({ behaviouralPatterns: [pattern({ selfSystems: ['RELATIONAL_SELF'] })] }),
      existingRoutingCandidates: [],
    }));
    const boundary = result.suggestions.find((s) => s.targetModule === 'boundary_architect');
    expect(boundary?.matchingExistingCandidateId).toBeNull();
  });
});

describe('Energy Delta audit finding', () => {
  it('never emits a suggestion targeting energy_delta, since it is not in MODULE_ROUTE_MAP', () => {
    expect(isKnownRoutingModule('energy_delta')).toBe(false);
    const result = buildNheiRecoverySuggestions(baseInput({
      contextSummary: emptySummary({
        confirmedInterpretations: [{ evidenceId: 'ev_11', selfSystems: ['INTERNAL_SELF'], dimensions: ['PHYSICAL'], evidenceQuality: 'high' }],
      }),
    }));
    expect(result.suggestions.some((s) => s.targetModule === 'energy_delta')).toBe(false);
    expect(result.suggestions.find((s) => s.dimensions.includes('PHYSICAL'))?.targetModule).toBe('recovery_fuel');
  });
});

describe('insufficient evidence', () => {
  it('returns insufficient_evidence before any rule runs, even if a rule would otherwise fire', () => {
    const result = buildNheiRecoverySuggestions(baseInput({
      contextSummary: emptySummary({
        insufficientEvidence: true,
        behaviouralPatterns: [pattern({ selfSystems: ['RELATIONAL_SELF'] })],
      }),
    }));
    expect(result.suggestions).toEqual([]);
    expect(result.noSuggestionReason).toBe('insufficient_evidence');
  });
});
