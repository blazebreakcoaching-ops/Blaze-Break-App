import { describe, it, expect } from 'vitest';
import { buildDecisionCopy, moduleDisplayName, SOMETHING_ELSE_INTENTS, MODULE_DISPLAY_NAMES, MODULE_TARGET_TAB, DecisionCopyInput } from './recovery-decision-copy';

const selected = (overrides: Partial<DecisionCopyInput> = {}): DecisionCopyInput => ({
  routingOutcome: 'selected',
  selectedRoute: 'REDUCE',
  selectedModule: 'one_less_thing',
  reasonCodes: ['high_demand_low_capacity'],
  confidence: 'high',
  ...overrides,
});

describe('buildDecisionCopy - selected outcome', () => {
  it('never shows a literal internal route label as the headline', () => {
    const copy = buildDecisionCopy(selected());
    const internalLabels = ['STABILISE', 'REDUCE', 'PROTECT', 'RECOVER', 'UNDERSTAND', 'ACT', 'CONNECT', 'NONE'];
    for (const label of internalLabels) expect(copy.headline).not.toContain(label);
  });

  it('prefers the candidate\'s own evidence detail over the generic fallback', () => {
    const copy = buildDecisionCopy(selected({ evidenceDetail: 'Pending workload items alongside strained capacity.' }));
    expect(copy.rationale).toBe('Pending workload items alongside strained capacity.');
  });

  it('falls back to a generic, still-plain-language rationale when no detail is given', () => {
    const copy = buildDecisionCopy(selected({ evidenceDetail: null }));
    expect(copy.rationale).toBeTruthy();
    expect(copy.rationale.toLowerCase()).not.toContain('reasoncode');
  });

  it('prefixes "Why this?" with language distinguishing a Nova hypothesis from settled fact', () => {
    const copy = buildDecisionCopy(selected({ evidenceSource: 'nova_hypothesis', evidenceDetail: 'you tend to overcommit on Fridays' }));
    expect(copy.whyThis).toMatch(/hasn't been confirmed yet/i);
  });

  it('prefixes "Why this?" differently for a deterministic calculation than for a hypothesis', () => {
    const calc = buildDecisionCopy(selected({ evidenceSource: 'deterministic_calculation' }));
    const hypothesis = buildDecisionCopy(selected({ evidenceSource: 'nova_hypothesis' }));
    expect(calc.whyThis).not.toBe(hypothesis.whyThis);
  });

  it('the primary action label names the real destination module, not a generic verb alone', () => {
    const copy = buildDecisionCopy(selected({ selectedModule: 'capacity_firewall', selectedRoute: 'PROTECT' }));
    expect(copy.primaryActionLabel).toContain('Capacity Firewall');
  });

  it('never shows the bandwidth question for a selected outcome', () => {
    expect(buildDecisionCopy(selected()).showBandwidthQuestion).toBe(false);
  });
});

describe('buildDecisionCopy - NONE outcomes', () => {
  it('none_needed: "nothing needs fixing", not a route-specific message', () => {
    const copy = buildDecisionCopy({ routingOutcome: 'none_needed', selectedRoute: 'NONE', selectedModule: null, reasonCodes: ['no_intervention_needed'], confidence: 'high' });
    expect(copy.headline.toLowerCase()).toContain('nothing');
    expect(copy.primaryActionLabel).toBe('');
  });

  it('suppressed_by_budget: "you\'ve done enough for now", distinct from none_needed', () => {
    const copy = buildDecisionCopy({ routingOutcome: 'suppressed_by_budget', selectedRoute: 'NONE', selectedModule: null, reasonCodes: ['no_intervention_needed'], confidence: 'high' });
    expect(copy.headline.toLowerCase()).toContain('done enough');
  });

  it('needs_clarification: asks the one lightweight question and flags the bandwidth prompt', () => {
    const copy = buildDecisionCopy({ routingOutcome: 'needs_clarification', selectedRoute: 'NONE', selectedModule: null, reasonCodes: ['no_intervention_needed'], confidence: 'low' });
    expect(copy.showBandwidthQuestion).toBe(true);
    expect(copy.whyThis.toLowerCase()).toContain("isn't enough");
  });

  it('the three NONE-family outcomes are all distinct headlines', () => {
    const headlines = new Set(
      (['none_needed', 'suppressed_by_budget', 'needs_clarification'] as const).map(
        (routingOutcome) => buildDecisionCopy({ routingOutcome, selectedRoute: 'NONE', selectedModule: null, reasonCodes: ['no_intervention_needed'], confidence: 'high' }).headline
      )
    );
    expect(headlines.size).toBe(3);
  });
});

describe('moduleDisplayName', () => {
  it('maps a known module id to its display name', () => {
    expect(moduleDisplayName('one_less_thing')).toBe('One Less Thing');
  });

  it('falls back gracefully for a null or unknown module', () => {
    expect(moduleDisplayName(null)).toBe('this');
    expect(moduleDisplayName('unknown_module')).toBe('this');
  });
});

describe('MODULE_TARGET_TAB', () => {
  it('every module with a display name also has a real target tab, and vice versa', () => {
    expect(Object.keys(MODULE_TARGET_TAB).sort()).toEqual(Object.keys(MODULE_DISPLAY_NAMES).sort());
  });
});

describe('SOMETHING_ELSE_INTENTS', () => {
  it('has exactly the spec\'s own intent menu, ending with the browse escape hatch', () => {
    expect(SOMETHING_ELSE_INTENTS).toHaveLength(7);
    expect(SOMETHING_ELSE_INTENTS[SOMETHING_ELSE_INTENTS.length - 1]).toEqual({ label: 'Browse everything', routeType: 'browse' });
  });

  it('every non-browse intent maps to a real route type', () => {
    const validRoutes = new Set(['STABILISE', 'REDUCE', 'PROTECT', 'RECOVER', 'UNDERSTAND', 'ACT', 'CONNECT']);
    for (const intent of SOMETHING_ELSE_INTENTS) {
      if (intent.routeType === 'browse') continue;
      expect(validRoutes.has(intent.routeType)).toBe(true);
    }
  });
});
