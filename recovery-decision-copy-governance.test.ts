import { describe, it, expect } from 'vitest';
import { buildDecisionCopy, MODULE_DISPLAY_NAMES, SOMETHING_ELSE_INTENTS, DecisionCopyInput } from './recovery-decision-copy';
import { ROUTE_TYPES } from './recovery-routing-engine';

// Governance: turns AGENTS.md's anti-chaos rules ("do not turn Nova into a
// therapist", "do not make medical claims") into a permanent, automated
// guard over every string Nova's Decision Compression layer can actually
// say to a user - not just the headline (recovery-decision-copy.test.ts
// already covers that), but every rationale/whyThis combination the real
// route x reason x evidence-source matrix can produce, plus every static
// label this module exports. A future PR adding a new template here is
// free to word it however reads best to a person, but it can never
// reintroduce clinical/diagnostic language, raw internal identifiers, or a
// fabricated-precision number - this test exists so that's never a manual
// review catch, it's a build failure.

// Mirrors recovery-routing-engine.ts's exact ReasonCode/EvidenceSource union
// members - not re-exported as a runtime list by that module (it's a type,
// which only exists at compile time), so this is the one place outside it
// that has to spell them out to iterate every combination.
const ALL_REASON_CODES = [
  'high_demand_low_capacity', 'recovery_foundation_low', 'repeated_pressure_pattern',
  'explicit_user_request', 'boundary_issue_confirmed', 'recent_reset_completed',
  'human_support_requested', 'no_intervention_needed',
] as const;
const ALL_EVIDENCE_SOURCES = [
  'current_user_report', 'recent_repeated_pattern', 'user_confirmed_pattern',
  'deterministic_calculation', 'user_preference', 'connected_data', 'nova_hypothesis',
] as const;
const ALL_ROUTING_OUTCOMES = ['selected', 'none_needed', 'suppressed_by_budget', 'needs_clarification'] as const;

// Clinical/diagnostic/therapist-framing language the spec and AGENTS.md
// both rule out for Nova - "this is not a medical device", "do not turn
// Nova into a therapist", "do not make medical claims". Checked
// case-insensitively against every rendered string.
const BANNED_CLINICAL_TERMS = [
  'diagnos', 'disorder', 'syndrome', 'therapy', 'therapist', 'patient',
  'treatment', 'clinical', 'prescri', 'symptom', 'pathology', 'medical advice',
];

// The internal route labels (never shown literally) and a stray raw reason
// code/evidence source identifier (snake_case leaking past its own
// translation) would both mean Decision Compression broke down - the user
// should only ever read Nova's plain-language sentence, never the
// machinery behind it.
const INTERNAL_ROUTE_LABELS = ['STABILISE', 'REDUCE', 'PROTECT', 'RECOVER', 'UNDERSTAND', 'ACT', 'CONNECT', 'NONE'];

const buildAllSelectedCopy = (): { route: string; reason: string; evidence: string; text: string }[] => {
  const out: { route: string; reason: string; evidence: string; text: string }[] = [];
  for (const route of ROUTE_TYPES) {
    if (route === 'NONE') continue;
    for (const reasonCode of ALL_REASON_CODES) {
      for (const evidenceSource of ALL_EVIDENCE_SOURCES) {
        const input: DecisionCopyInput = {
          routingOutcome: 'selected', selectedRoute: route, selectedModule: 'one_less_thing',
          reasonCodes: [reasonCode], confidence: 'high', evidenceSource, evidenceDetail: null,
        };
        const copy = buildDecisionCopy(input);
        out.push({ route, reason: reasonCode, evidence: evidenceSource, text: `${copy.headline} ${copy.rationale} ${copy.whyThis}` });
      }
    }
  }
  return out;
};

describe('governance - no clinical/therapist language anywhere in Decision Compression output', () => {
  const allSelectedCopy = buildAllSelectedCopy();

  it('every selected-outcome route x reason x evidence-source combination is free of banned clinical terms', () => {
    for (const { route, reason, evidence, text } of allSelectedCopy) {
      const lower = text.toLowerCase();
      for (const term of BANNED_CLINICAL_TERMS) {
        expect(lower, `route=${route} reason=${reason} evidence=${evidence}: "${text}"`).not.toContain(term);
      }
    }
  });

  it('every NONE-family outcome is free of banned clinical terms', () => {
    for (const routingOutcome of ALL_ROUTING_OUTCOMES) {
      if (routingOutcome === 'selected') continue;
      const copy = buildDecisionCopy({ routingOutcome, selectedRoute: 'NONE', selectedModule: null, reasonCodes: ['no_intervention_needed'], confidence: 'high' });
      const lower = `${copy.headline} ${copy.rationale} ${copy.whyThis}`.toLowerCase();
      for (const term of BANNED_CLINICAL_TERMS) expect(lower).not.toContain(term);
    }
  });

  it('MODULE_DISPLAY_NAMES and the Something Else intent menu are both free of banned clinical terms', () => {
    const allLabels = [...Object.values(MODULE_DISPLAY_NAMES), ...SOMETHING_ELSE_INTENTS.map((i) => i.label)];
    for (const label of allLabels) {
      const lower = label.toLowerCase();
      for (const term of BANNED_CLINICAL_TERMS) expect(lower).not.toContain(term);
    }
  });
});

describe('governance - no internal machinery ever leaks into user-facing text', () => {
  const allSelectedCopy = buildAllSelectedCopy();

  it('no selected-outcome combination contains a literal internal route label', () => {
    for (const { route, reason, evidence, text } of allSelectedCopy) {
      for (const label of INTERNAL_ROUTE_LABELS) {
        expect(text, `route=${route} reason=${reason} evidence=${evidence}: "${text}"`).not.toContain(label);
      }
    }
  });

  it('no selected-outcome combination contains a raw snake_case reason code or evidence source identifier', () => {
    for (const { reason, evidence, text } of allSelectedCopy) {
      expect(text).not.toContain(reason);
      expect(text).not.toContain(evidence);
    }
  });

  it('no selected-outcome combination fabricates a numeric confidence/percentage figure', () => {
    for (const { route, reason, evidence, text } of allSelectedCopy) {
      expect(text, `route=${route} reason=${reason} evidence=${evidence}: "${text}"`).not.toMatch(/\d+\s*%/);
    }
  });
});
