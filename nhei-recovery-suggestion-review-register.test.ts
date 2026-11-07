// NHEI PHASE 4B - REVIEW REGISTER DRIFT GUARD
//
// Proves the register's recorded text actually matches what
// nhei-recovery-bridge.ts's rules produce today - if a future edit to
// the bridge's wording isn't mirrored here, this test fails loudly
// rather than letting the review register go silently stale.

import { describe, it, expect } from 'vitest';
import { buildNheiRecoverySuggestions } from './nhei-recovery-bridge';
import { NHEI_RECOVERY_SUGGESTION_REVIEW_REGISTER } from './nhei-recovery-suggestion-review-register';
import type { NheiRecoveryBridgeInput } from './nhei-recovery-bridge-types';
import type { NheiPersonalContextSummary } from './nhei-context-integration';
import type { NheiBehaviouralPattern } from './nhei-adaptive-behaviour-engine';

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

function baseInput(overrides: Partial<NheiRecoveryBridgeInput> = {}): NheiRecoveryBridgeInput {
  return {
    contextSummary: emptySummary(),
    capacityBand: null,
    existingRoutingCandidates: [],
    routingInsightsConsented: true,
    safeguardingClearance: { cleared: true, ageBand: 'adult' },
    ...overrides,
  };
}

function registerEntryFor(targetModule: string) {
  const entry = NHEI_RECOVERY_SUGGESTION_REVIEW_REGISTER.find((e) => e.targetModule === targetModule);
  if (!entry) throw new Error(`no register entry for ${targetModule}`);
  return entry;
}

describe('review register matches live rule output exactly', () => {
  it('every register entry has at least one flag, and never claims approval', () => {
    for (const entry of NHEI_RECOVERY_SUGGESTION_REVIEW_REGISTER) {
      expect(entry.flags.length).toBeGreaterThan(0);
      expect(entry).not.toHaveProperty('approved');
      expect(entry).not.toHaveProperty('reviewed');
      expect(entry).not.toHaveProperty('safe');
    }
  });

  it('boundary_architect (ruleBoundaryRelated)', () => {
    const result = buildNheiRecoverySuggestions(baseInput({
      contextSummary: emptySummary({ behaviouralPatterns: [pattern({ selfSystems: ['RELATIONAL_SELF'] })] }),
    }));
    const live = result.suggestions.find((s) => s.targetModule === 'boundary_architect')!;
    const entry = registerEntryFor('boundary_architect');
    expect(live.reason).toBe(entry.reason);
    expect(live.explanationForUser).toBe(entry.explanationForUser);
  });

  it('reset_studio (ruleDifficultySettling)', () => {
    const result = buildNheiRecoverySuggestions(baseInput({
      contextSummary: emptySummary({
        confirmedInterpretations: [{ evidenceId: 'ev1', selfSystems: ['INTERNAL_SELF'], dimensions: ['EMOTIONAL'], evidenceQuality: 'high' }],
      }),
    }));
    const live = result.suggestions.find((s) => s.targetModule === 'reset_studio')!;
    const entry = registerEntryFor('reset_studio');
    expect(live.reason).toBe(entry.reason);
    expect(live.explanationForUser).toBe(entry.explanationForUser);
  });

  it('anxiety_reset (ruleShortGroundingRequest)', () => {
    const result = buildNheiRecoverySuggestions(baseInput({
      contextSummary: emptySummary({
        confirmedInterpretations: [{ evidenceId: 'ev2', selfSystems: ['INTERNAL_SELF'], dimensions: ['EMOTIONAL'], evidenceQuality: 'high' }],
      }),
      userStatedGoal: { preferredEffort: 'low_bandwidth' },
    }));
    const live = result.suggestions.find((s) => s.targetModule === 'anxiety_reset')!;
    const entry = registerEntryFor('anxiety_reset');
    expect(live.reason).toBe(entry.reason);
    expect(live.explanationForUser).toBe(entry.explanationForUser);
  });

  it('action_engine (ruleActionWithStatedGoal)', () => {
    const result = buildNheiRecoverySuggestions(baseInput({
      contextSummary: emptySummary({ behaviouralPatterns: [pattern({ selfSystems: ['INTERNAL_SELF'] })] }),
      userStatedGoal: { preferredRouteType: 'ACT' },
    }));
    const live = result.suggestions.find((s) => s.targetModule === 'action_engine')!;
    const entry = registerEntryFor('action_engine');
    expect(live.reason).toBe(entry.reason);
    expect(live.explanationForUser).toBe(entry.explanationForUser);
  });

  it('energy_delta (ruleRecoveryFoundationLow)', () => {
    const result = buildNheiRecoverySuggestions(baseInput({
      contextSummary: emptySummary({
        confirmedInterpretations: [{ evidenceId: 'ev3', selfSystems: ['INTERNAL_SELF'], dimensions: ['PHYSICAL'], evidenceQuality: 'high' }],
      }),
    }));
    const live = result.suggestions.find((s) => s.targetModule === 'energy_delta')!;
    const entry = registerEntryFor('energy_delta');
    expect(live.reason).toBe(entry.reason);
    expect(live.explanationForUser).toBe(entry.explanationForUser);
  });

  it('my_patterns (ruleGeneralRepeatedPattern)', () => {
    const result = buildNheiRecoverySuggestions(baseInput({
      contextSummary: emptySummary({ behaviouralPatterns: [pattern({ selfSystems: ['INTERNAL_SELF'] })] }),
    }));
    const live = result.suggestions.find((s) => s.targetModule === 'my_patterns')!;
    const entry = registerEntryFor('my_patterns');
    expect(live.reason).toBe(entry.reason);
    expect(live.explanationForUser).toBe(entry.explanationForUser);
  });

  it('the register covers exactly the six rules - no more, no fewer', () => {
    expect(NHEI_RECOVERY_SUGGESTION_REVIEW_REGISTER).toHaveLength(6);
    const modules = NHEI_RECOVERY_SUGGESTION_REVIEW_REGISTER.map((e) => e.targetModule).sort();
    expect(modules).toEqual(['action_engine', 'anxiety_reset', 'boundary_architect', 'energy_delta', 'my_patterns', 'reset_studio']);
  });
});
