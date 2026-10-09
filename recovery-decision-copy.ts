// Recovery Decision Copy - Nova's "Decision Compression": deterministic,
// plain-language templates that translate a RoutingDecision (an internal
// route like REDUCE, a structured reason code, an evidence source) into
// the sentences a person actually reads. Pure functions only (no React, no
// AI) - the routing decision itself is already fully computed by the time
// anything here runs; this module only ever chooses words, never a route.
//
// The spec is explicit that Nova explains, it never calculates - so every
// template here is static, reviewable text, not a model generation. A
// route/reason combination this module doesn't recognise falls back to an
// honest, generic sentence rather than inventing specifics.

import type { RouteType, ReasonCode, EvidenceSource, ConfidenceLevel, RoutingOutcome } from './recovery-routing-engine';
import { BANDWIDTH_SELF_REPORT_OPTIONS } from './recovery-capacity-gate';

export const MODULE_DISPLAY_NAMES: Record<string, string> = {
  guided_reset: 'Guided Reset',
  reset_studio: 'Reset Studio',
  anxiety_reset: 'Anxiety Reset',
  one_less_thing: 'One Less Thing',
  workload_reality_check: 'Workload Reality Check',
  capacity_firewall: 'Capacity Firewall',
  boundary_architect: 'Boundary Architect',
  digital_boundary_shield: 'Digital Boundary Shield',
  recovery_fuel: 'Recovery Fuel',
  my_patterns: 'My Patterns',
  weekly_review: 'Weekly Review',
  action_engine: 'Action Engine',
  recovery_ally: 'Recovery Ally',
  support_circle: 'My Support Circle',
};

export const moduleDisplayName = (sourceModule: string | null): string =>
  (sourceModule && MODULE_DISPLAY_NAMES[sourceModule]) || 'this';

// Which real App.tsx nav tab actually hosts each destination module -
// Recovery Intelligence never builds a second copy of any of these tools,
// it only ever points at where the real one already lives.
export const MODULE_TARGET_TAB: Record<string, string> = {
  guided_reset: 'reset',
  reset_studio: 'reset',
  anxiety_reset: 'anxiety_reset',
  one_less_thing: 'recover',
  workload_reality_check: 'recover',
  capacity_firewall: 'communicate',
  boundary_architect: 'communicate',
  digital_boundary_shield: 'communicate',
  recovery_fuel: 'fuel',
  my_patterns: 'reflect',
  weekly_review: 'reflect',
  action_engine: 'reflect',
  recovery_ally: 'ally',
  support_circle: 'ally',
};

// One human headline per route - never the literal internal label. Written
// to stand alone as the card's main line, matching the spec's own examples
// ("Today looks heavier than your recent capacity... let's make one thing
// smaller").
const ROUTE_HEADLINES: Record<RouteType, string> = {
  STABILISE: "Let's calm things down first",
  REDUCE: 'Make today lighter',
  PROTECT: "This looks like something to protect, not push through",
  RECOVER: 'A recovery foundation might need tending to',
  UNDERSTAND: 'A pattern might be worth a closer look',
  ACT: "This might be worth changing, not just recovering from",
  CONNECT: 'Would another person make this easier?',
  NONE: '',
};

// A short, generic fallback rationale per reason code - used only when a
// candidate didn't supply its own evidence detail (recovery-signal-
// candidates.ts normally does).
const REASON_FALLBACK_RATIONALE: Record<ReasonCode, string> = {
  high_demand_low_capacity: 'What you have on right now looks heavier than the capacity you have available for it.',
  recovery_foundation_low: 'A basic recovery foundation looks like it could use some attention.',
  repeated_pressure_pattern: 'The same kind of pressure has come up more than once recently.',
  explicit_user_request: 'You asked for this directly.',
  boundary_issue_confirmed: 'The same source of pressure keeps coming back.',
  recent_reset_completed: 'You just finished a reset - this follows on from that.',
  human_support_requested: 'You asked to involve someone else.',
  no_intervention_needed: "Nothing in what you've logged points to a specific step right now.",
};

// How "Why this?" should frame the evidence behind a recommendation -
// distinguishing what it actually rests on so a hypothesis is never
// presented as settled fact (spec: "Nova hypothesis alone must not
// dominate routing" and "if evidence is insufficient, say so").
const EVIDENCE_SOURCE_PREFIX: Record<EvidenceSource, string> = {
  current_user_report: 'Based on what you just told me: ',
  recent_repeated_pattern: 'Based on a pattern in your recent entries: ',
  user_confirmed_pattern: "Based on a pattern you've confirmed before: ",
  deterministic_calculation: 'Based on your current capacity and workload: ',
  user_preference: 'Based on what has tended to help you before: ',
  connected_data: 'Based on information from a connected source: ',
  nova_hypothesis: "This hasn't been confirmed yet, but it looks like: ",
};

export interface DecisionCopyInput {
  routingOutcome: RoutingOutcome;
  selectedRoute: RouteType;
  selectedModule: string | null;
  reasonCodes: ReasonCode[];
  confidence: ConfidenceLevel;
  // The submitting candidate's own short, real-data-grounded detail
  // (recovery-signal-candidates.ts sets this) - preferred over the generic
  // fallback whenever present.
  evidenceDetail?: string | null;
  evidenceSource?: EvidenceSource | null;
}

export interface DecisionCopy {
  headline: string;
  rationale: string;
  whyThis: string;
  primaryActionLabel: string;
  showBandwidthQuestion: boolean;
}

const NONE_OUTCOME_COPY: Record<Exclude<RoutingOutcome, 'selected'>, { headline: string; rationale: string; whyThis: string }> = {
  none_needed: {
    headline: 'Nothing here needs fixing right now',
    rationale: "Nothing in what you've logged points to needing a specific step right now.",
    whyThis: "Based on your current capacity, workload and recent entries, nothing stands out as needing attention right now.",
  },
  suppressed_by_budget: {
    headline: "You've done enough here for now",
    rationale: "You've already been offered a few things to try today.",
    whyThis: "Blaze Break limits how many suggestions it offers in a day so this doesn't turn into another task list. You can ask for more if you want it.",
  },
  needs_clarification: {
    headline: 'What have you got room for right now?',
    rationale: "I don't have enough information to tell yet.",
    whyThis: "There isn't enough current information to judge what would actually help - answering this one question is quicker than guessing.",
  },
};

// The single entry point: turns a routing decision into exactly the
// headline/rationale/"Why this?"/primary action text a Nova Recommendation
// Card needs, never anything the card has to compute itself.
export const buildDecisionCopy = (input: DecisionCopyInput): DecisionCopy => {
  if (input.routingOutcome !== 'selected') {
    const copy = NONE_OUTCOME_COPY[input.routingOutcome];
    return {
      headline: copy.headline,
      rationale: copy.rationale,
      whyThis: copy.whyThis,
      primaryActionLabel: '',
      showBandwidthQuestion: input.routingOutcome === 'needs_clarification',
    };
  }

  const reasonCode = input.reasonCodes[0] ?? 'no_intervention_needed';
  const rationale = input.evidenceDetail || REASON_FALLBACK_RATIONALE[reasonCode];
  const prefix = input.evidenceSource ? EVIDENCE_SOURCE_PREFIX[input.evidenceSource] : '';

  return {
    headline: ROUTE_HEADLINES[input.selectedRoute] || "Here's something that might help",
    rationale,
    whyThis: `${prefix}${rationale}`,
    primaryActionLabel: `Start ${moduleDisplayName(input.selectedModule)}`,
    showBandwidthQuestion: false,
  };
};

// The spec's own fixed "Something Else" intent menu - a handful of
// human choices, never a re-opening of all eleven rooms at once. 'browse'
// is the one non-route escape hatch ("Browse everything").
export interface SomethingElseIntent {
  label: string;
  routeType: RouteType | 'browse';
}

export const SOMETHING_ELSE_INTENTS: SomethingElseIntent[] = [
  { label: 'I need to calm things down', routeType: 'STABILISE' },
  { label: 'I need to make today lighter', routeType: 'REDUCE' },
  { label: 'I need to protect my time', routeType: 'PROTECT' },
  { label: 'I want to understand what keeps happening', routeType: 'UNDERSTAND' },
  { label: 'I want to change something', routeType: 'ACT' },
  { label: 'I want another person', routeType: 'CONNECT' },
  { label: 'Browse everything', routeType: 'browse' },
];

export { BANDWIDTH_SELF_REPORT_OPTIONS };
