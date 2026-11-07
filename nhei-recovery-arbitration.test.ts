// NHEI PHASE 4B - RECOVERY RECOMMENDATION ARBITRATION: TESTS
//
// All fixtures are synthetic. Builds NheiRecoverySuggestion objects
// directly (not via the bridge) so arbitration's own logic is tested in
// isolation from bridge rule-matching.

import { describe, it, expect } from 'vitest';
import { arbitrateNheiRecoverySuggestions } from './nhei-recovery-arbitration';
import type { NheiRecoverySuggestion, NheiRecoveryInterpretationKind, NheiRecoveryCapacitySuitability } from './nhei-recovery-bridge-types';
import type { RouteType } from './recovery-routing-engine';

function suggestion(overrides: Partial<NheiRecoverySuggestion> & { targetModule: string; routeType: RouteType }): NheiRecoverySuggestion {
  return {
    suggestionId: `${overrides.targetModule}_1`,
    relevantCapabilityLabel: overrides.targetModule,
    reason: 'synthetic reason',
    explanationForUser: 'synthetic explanation',
    evidenceReferences: [],
    selfSystems: [],
    dimensions: [],
    interpretationKind: 'tentative' as NheiRecoveryInterpretationKind,
    safetyRestrictions: [],
    consentPrerequisite: 'routing_insights',
    capacitySuitability: 'unknown' as NheiRecoveryCapacitySuitability,
    matchesStatedGoal: false,
    matchingExistingCandidateId: null,
    alternativeModules: [],
    ...overrides,
  };
}

describe('arbitrateNheiRecoverySuggestions - abstention', () => {
  it('abstains with no_candidates when given an empty suggestion list', () => {
    const result = arbitrateNheiRecoverySuggestions({ suggestions: [] });
    expect(result.selected).toBeNull();
    expect(result.abstentionReason).toBe('no_candidates');
    expect(result.selectionReason).toBeTruthy();
  });

  it('abstains with all_targets_unavailable when every suggested module is caller-flagged unavailable', () => {
    const result = arbitrateNheiRecoverySuggestions({
      suggestions: [suggestion({ targetModule: 'reset_studio', routeType: 'STABILISE' })],
      unavailableModules: ['reset_studio'],
    });
    expect(result.selected).toBeNull();
    expect(result.abstentionReason).toBe('all_targets_unavailable');
  });

  it('abstains with all_targets_unavailable for a module not in MODULE_ROUTE_MAP at all', () => {
    const result = arbitrateNheiRecoverySuggestions({
      suggestions: [suggestion({ targetModule: 'nonexistent_module', routeType: 'STABILISE' })],
    });
    expect(result.selected).toBeNull();
    expect(result.abstentionReason).toBe('all_targets_unavailable');
  });

  it('never selects a capacity-unsuitable suggestion as the default - abstains with all_unsuitable_for_capacity when that is the only option', () => {
    const result = arbitrateNheiRecoverySuggestions({
      suggestions: [suggestion({ targetModule: 'action_engine', routeType: 'ACT', capacitySuitability: 'unsuitable' })],
    });
    expect(result.selected).toBeNull();
    expect(result.abstentionReason).toBe('all_unsuitable_for_capacity');
    // Still surfaced, never silently discarded - but in its own field,
    // never as an ordinary alternative (directive: "capacity-unsuitable
    // suggestions must not appear as ordinary default or equivalent
    // alternatives").
    expect(result.unsuitableForCapacity).toHaveLength(1);
    expect(result.alternatives).toHaveLength(0);
  });
});

describe('arbitrateNheiRecoverySuggestions - capacity never overridden by a default pick', () => {
  it('skips an unsuitable suggestion in favour of a suitable one for a DIFFERENT route, keeping it out of alternatives', () => {
    const unsuitable = suggestion({ targetModule: 'action_engine', routeType: 'ACT', capacitySuitability: 'unsuitable' });
    const suitable = suggestion({ targetModule: 'reset_studio', routeType: 'STABILISE', capacitySuitability: 'suitable' });
    const result = arbitrateNheiRecoverySuggestions({ suggestions: [unsuitable, suitable] });
    expect(result.selected?.targetModule).toBe('reset_studio');
    expect(result.unsuitableForCapacity.some((a) => a.targetModule === 'action_engine')).toBe(true);
    expect(result.alternatives.some((a) => a.targetModule === 'action_engine')).toBe(false);
  });

  it('preserves unknown capacity as unknown - an unknown-capacity suggestion can still be selected (never promoted to suitable, never treated as unsuitable)', () => {
    const result = arbitrateNheiRecoverySuggestions({
      suggestions: [suggestion({ targetModule: 'my_patterns', routeType: 'UNDERSTAND', capacitySuitability: 'unknown' })],
    });
    expect(result.selected?.targetModule).toBe('my_patterns');
    expect(result.selected?.capacitySuitability).toBe('unknown');
  });

  it('prefers a suitable suggestion over an unknown one when both exist for different routes', () => {
    const unknown = suggestion({ targetModule: 'my_patterns', routeType: 'UNDERSTAND', capacitySuitability: 'unknown' });
    const suitable = suggestion({ targetModule: 'reset_studio', routeType: 'STABILISE', capacitySuitability: 'suitable' });
    const result = arbitrateNheiRecoverySuggestions({ suggestions: [unknown, suitable] });
    expect(result.selected?.targetModule).toBe('reset_studio');
  });
});

describe('arbitrateNheiRecoverySuggestions - stated goal respected', () => {
  it('prefers the suggestion matching the stated goal over one that does not, even if both are otherwise equal', () => {
    const matches = suggestion({ targetModule: 'anxiety_reset', routeType: 'STABILISE', matchesStatedGoal: true, capacitySuitability: 'suitable' });
    const doesnt = suggestion({ targetModule: 'my_patterns', routeType: 'UNDERSTAND', matchesStatedGoal: false, capacitySuitability: 'suitable' });
    const result = arbitrateNheiRecoverySuggestions({ suggestions: [doesnt, matches] });
    expect(result.selected?.targetModule).toBe('anxiety_reset');
  });

  it('prefers confirmed interpretation over tentative when both otherwise tie', () => {
    const confirmed = suggestion({ targetModule: 'reset_studio', routeType: 'STABILISE', interpretationKind: 'confirmed' });
    const tentative = suggestion({ targetModule: 'my_patterns', routeType: 'UNDERSTAND', interpretationKind: 'tentative' });
    const result = arbitrateNheiRecoverySuggestions({ suggestions: [tentative, confirmed] });
    expect(result.selected?.targetModule).toBe('reset_studio');
  });
});

describe('arbitrateNheiRecoverySuggestions - deduplication and reconciliation', () => {
  it('reconciles two suggestions targeting the exact SAME module into one winner, keeping the loser in dedupedAway (never silently dropped)', () => {
    const weaker: NheiRecoverySuggestion = { ...suggestion({ targetModule: 'reset_studio', routeType: 'STABILISE', interpretationKind: 'educational' }), suggestionId: 'reset_studio_weaker' };
    const stronger: NheiRecoverySuggestion = { ...suggestion({ targetModule: 'reset_studio', routeType: 'STABILISE', interpretationKind: 'confirmed' }), suggestionId: 'reset_studio_stronger' };
    const result = arbitrateNheiRecoverySuggestions({ suggestions: [weaker, stronger] });
    expect(result.selected?.suggestionId).toBe('reset_studio_stronger');
    expect(result.dedupedAway.map((d) => d.suggestionId)).toEqual(['reset_studio_weaker']);
    expect(result.alternatives).toHaveLength(0);
  });

  it('does NOT reconcile two DIFFERENT modules that merely share a routeType - both survive as real, distinct options (Phase 5 fix)', () => {
    const resetStudio = suggestion({ targetModule: 'reset_studio', routeType: 'STABILISE', interpretationKind: 'confirmed' });
    const anxietyReset = suggestion({ targetModule: 'anxiety_reset', routeType: 'STABILISE', interpretationKind: 'tentative' });
    const result = arbitrateNheiRecoverySuggestions({ suggestions: [resetStudio, anxietyReset] });
    expect(result.dedupedAway).toHaveLength(0);
    expect(result.selected?.targetModule).toBe('reset_studio');
    expect(result.alternatives.map((a) => a.targetModule)).toEqual(['anxiety_reset']);
  });

  it('is deterministic - running arbitration twice on the same input yields the same winner', () => {
    const a = suggestion({ targetModule: 'guided_reset', routeType: 'STABILISE', interpretationKind: 'tentative' });
    const b = suggestion({ targetModule: 'reset_studio', routeType: 'STABILISE', interpretationKind: 'tentative' });
    const first = arbitrateNheiRecoverySuggestions({ suggestions: [a, b] });
    const second = arbitrateNheiRecoverySuggestions({ suggestions: [a, b] });
    expect(first.selected?.targetModule).toBe(second.selected?.targetModule);
  });
});

describe('arbitrateNheiRecoverySuggestions - multiple distinct alternatives', () => {
  it('keeps genuinely different route-type suggestions as alternatives, not reconciled away', () => {
    const boundary = suggestion({ targetModule: 'boundary_architect', routeType: 'PROTECT', interpretationKind: 'confirmed' });
    const reset = suggestion({ targetModule: 'reset_studio', routeType: 'STABILISE', interpretationKind: 'tentative' });
    const patterns = suggestion({ targetModule: 'my_patterns', routeType: 'UNDERSTAND', interpretationKind: 'tentative' });
    const result = arbitrateNheiRecoverySuggestions({ suggestions: [boundary, reset, patterns] });
    expect(result.selected?.targetModule).toBe('boundary_architect');
    expect(result.alternatives.map((a) => a.targetModule).sort()).toEqual(['my_patterns', 'reset_studio']);
    expect(result.dedupedAway).toHaveLength(0);
  });
});

describe('arbitrateNheiRecoverySuggestions - never a command', () => {
  it('the result carries no navigation, launch, or execution field - it is inert data', () => {
    const result = arbitrateNheiRecoverySuggestions({
      suggestions: [suggestion({ targetModule: 'reset_studio', routeType: 'STABILISE' })],
    });
    expect(result).not.toHaveProperty('navigate');
    expect(result).not.toHaveProperty('launch');
    expect(result).not.toHaveProperty('execute');
    expect(typeof result.selected).not.toBe('function');
  });
});
