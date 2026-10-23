// NHEI PHASE 4 - RECOVERY INTELLIGENCE BRIDGE
//
// Connects NHEI's existing interpretation output (NheiPersonalContextSummary -
// already built by nhei-context-integration.ts from Phase 1's
// Trifecta/Dimensions/Adaptive-Behaviour engines) to Blaze Break's existing
// Recovery Routing vocabulary (RouteType, BandwidthBand, the known-module
// registry in recovery-signal-candidates.ts). Pure functions only - no
// Firestore, no React, no model call. Mirrors recovery-signal-candidates.ts's
// own shape exactly: one independently-evaluated mapping rule per function,
// combined by filtering out nulls - the choice between multiple suggestions
// is left to whatever future consumer reads NheiRecoveryBridgeResult, the
// same way choosing between InterventionCandidates is selectRoute's job, not
// buildSignalCandidates's.
//
// OFFLINE AT THIS PHASE: not imported by server.ts or any live route. See
// nhei-recovery-bridge-types.ts's header for the full "prepare but do not
// activate" framing, and this phase's delivery report for what remains
// before any future phase could wire this in.
//
// AUDIT FINDING (Phase 4 §2): recovery-signal-candidates.ts's MODULE_ROUTE_MAP
// has no entry for Energy Delta Management - it is reachable today only as
// its own standalone page (EnergyBudget.tsx), never through Recovery
// Routing. The directive's own example ("Energy and recovery management
// questions -> Energy Delta Management") is therefore NOT a verified,
// routable mapping today - this file targets 'recovery_fuel' instead
// (MODULE_ROUTE_MAP: RECOVER), the nearest module that both already exists
// in the registry and addresses the same depleted-foundation signal,
// rather than inventing a route Recovery Routing cannot actually reach.

import { MODULE_ROUTE_MAP, isKnownRoutingModule } from './recovery-signal-candidates';
import { isEffortWithinBandwidth, type BandwidthBand } from './recovery-capacity-gate';
import type { RouteType } from './recovery-routing-engine';
import type { SelfSystem, Dimension, EvidenceQuality } from './nhei-types';
import type {
  NheiRecoveryBridgeInput,
  NheiRecoveryBridgeResult,
  NheiRecoverySuggestion,
  NheiRecoveryInterpretationKind,
  NheiRecoveryCapacitySuitability,
} from './nhei-recovery-bridge-types';

// Human-readable labels for the modules this file can target - distinct
// from MODULE_ROUTE_MAP (which only carries the routing classification),
// since a suggestion needs something a future UI could actually display.
// Deliberately only the subset this file's rules actually use - adding an
// entry here is not itself a verification that the module is reachable;
// isKnownRoutingModule (checked by every rule below) is.
const RECOVERY_CAPABILITY_LABELS: Record<string, string> = {
  boundary_architect: 'Boundary Architect',
  capacity_firewall: 'Capacity Firewall',
  reset_studio: 'Reset Studio',
  anxiety_reset: 'Anxiety Reset',
  guided_reset: 'Guided Reset',
  action_engine: 'Action Engine',
  recovery_fuel: 'Recovery Fuel',
  my_patterns: 'My Patterns',
  one_less_thing: 'One Less Thing',
  workload_reality_check: 'Workload Reality Check',
  digital_boundary_shield: 'Digital Boundary Shield',
};

function capabilityLabel(sourceModule: string): string {
  return RECOVERY_CAPABILITY_LABELS[sourceModule] ?? sourceModule;
}

// Required minimum evidenceQuality for a confirmed-interpretation item to
// count as a real positive trigger - excludes 'low' and 'unknown' so a
// rule never fires on contradictory or low-quality evidence alone
// (directive §11, scenario 11). This never blocks a BEHAVIOURAL PATTERN-
// based rule, which has its own, separate interpretationConfidence gate.
const USABLE_EVIDENCE_QUALITIES: EvidenceQuality[] = ['high', 'medium'];

let suggestionCounter = 0;
function nextSuggestionId(prefix: string): string {
  suggestionCounter += 1;
  return `${prefix}_${suggestionCounter}`;
}

interface BuildContext {
  input: NheiRecoveryBridgeInput;
}

// Shared finishing step every rule calls once it knows targetModule/
// routeType/interpretationKind/evidence - verifies the target actually
// exists (directive §2/§7: "verify every target capability actually
// exists"), computes capacity suitability without ever inventing a score,
// cross-references existing Recovery Routing candidates, and checks the
// stated-goal match. Returns null (never a half-built suggestion) if the
// target module turns out not to be a real, known routing destination.
function finishSuggestion(
  ctx: BuildContext,
  partial: {
    targetModule: string;
    routeType: RouteType;
    requiredEffort: BandwidthBand;
    reason: string;
    explanationForUser: string;
    evidenceReferences: string[];
    selfSystems: SelfSystem[];
    dimensions: Dimension[];
    interpretationKind: NheiRecoveryInterpretationKind;
    safetyRestrictions: NheiRecoverySuggestion['safetyRestrictions'];
    alternativeModules?: string[];
  },
): NheiRecoverySuggestion | null {
  if (!isKnownRoutingModule(partial.targetModule)) return null;
  // Defensive consistency check - a rule that passes the wrong routeType
  // for its own targetModule is a bug in this file, not a real suggestion.
  if (MODULE_ROUTE_MAP[partial.targetModule] !== partial.routeType) return null;

  const { capacityBand, userStatedGoal, existingRoutingCandidates } = ctx.input;
  const capacitySuitability: NheiRecoveryCapacitySuitability =
    capacityBand === null ? 'unknown' : (isEffortWithinBandwidth(partial.requiredEffort, capacityBand) ? 'suitable' : 'unsuitable');

  const matchesStatedGoal =
    (userStatedGoal?.preferredRouteType === undefined || userStatedGoal.preferredRouteType === partial.routeType) &&
    (userStatedGoal?.preferredEffort === undefined || userStatedGoal.preferredEffort === partial.requiredEffort);

  const matchingExisting = existingRoutingCandidates.find((c) => c.routeType === partial.routeType);

  const alternativeModules = (partial.alternativeModules ?? [])
    .filter((m) => isKnownRoutingModule(m) && m !== partial.targetModule);

  return {
    suggestionId: nextSuggestionId(partial.targetModule),
    targetModule: partial.targetModule,
    routeType: partial.routeType,
    relevantCapabilityLabel: capabilityLabel(partial.targetModule),
    reason: partial.reason,
    explanationForUser: partial.explanationForUser,
    evidenceReferences: partial.evidenceReferences,
    selfSystems: partial.selfSystems,
    dimensions: partial.dimensions,
    interpretationKind: partial.interpretationKind,
    safetyRestrictions: partial.safetyRestrictions,
    consentPrerequisite: 'routing_insights',
    capacitySuitability,
    matchesStatedGoal,
    matchingExistingCandidateId: matchingExisting?.candidateId ?? null,
    alternativeModules,
  };
}

// Rule 1 - boundary-related experience: a recurring behaviour/outcome
// pattern (nhei-adaptive-behaviour-engine.ts's own >=2-occurrence
// threshold, causalClaim always false) touching the Relational Self.
// Deliberately requires the PATTERN, not merely "any Relational Self
// evidence exists" - one relational experience is an anecdote, not yet a
// boundary struggle worth suggesting a tool for.
function ruleBoundaryRelated(ctx: BuildContext): NheiRecoverySuggestion | null {
  const pattern = ctx.input.contextSummary.behaviouralPatterns.find((p) => p.selfSystems.includes('RELATIONAL_SELF'));
  if (!pattern) return null;

  return finishSuggestion(ctx, {
    targetModule: 'boundary_architect',
    routeType: 'PROTECT',
    requiredEffort: 'some_bandwidth',
    reason: 'A repeated pattern involving how you respond to other people has come up in what you’ve described.',
    explanationForUser:
      'You’ve described something similar happening more than once in situations with other people. ' +
      'This is Nova noticing a pattern across what you’ve shared, not a fact about you or about anyone else - ' +
      'Boundary Architect is a tool for practising how you respond when this comes up again, if that would help.',
    evidenceReferences: [...pattern.behaviourEventIds, ...pattern.outcomeEventIds],
    selfSystems: pattern.selfSystems,
    dimensions: pattern.dimensions,
    interpretationKind: 'tentative', // a descriptive sequence fact (causalClaim: false), never settled
    safetyRestrictions: ['never_assert_unreported_third_party_beliefs', 'not_diagnostic'],
    alternativeModules: ['capacity_firewall', 'digital_boundary_shield'],
  });
}

// Rule 2 - difficulty settling after a demanding experience: a confirmed
// Emotional-dimension interpretation, optionally alongside the Internal or
// Perceived-Received self (e.g. the directive's own worked example: leave
// was approved, not refused, yet rest still didn't come easily).
function ruleDifficultySettling(ctx: BuildContext): NheiRecoverySuggestion | null {
  const { confirmedInterpretations } = ctx.input.contextSummary;
  const matches = confirmedInterpretations.filter(
    (c) => USABLE_EVIDENCE_QUALITIES.includes(c.evidenceQuality) && c.dimensions.includes('EMOTIONAL'),
  );
  if (matches.length === 0) return null;

  const selfSystems = Array.from(new Set(matches.flatMap((m) => m.selfSystems)));

  return finishSuggestion(ctx, {
    targetModule: 'reset_studio',
    routeType: 'STABILISE',
    requiredEffort: 'low_bandwidth',
    reason: 'You’ve confirmed an emotional experience that’s made it harder to settle.',
    explanationForUser:
      'You told Nova this affected how you felt, and that’s confirmed, not a guess. What it means for what ' +
      'might help is still Nova’s own suggestion, not something you’ve confirmed - Reset Studio offers a few ' +
      'short ways to settle, matched to how this actually feels for you.',
    evidenceReferences: matches.map((m) => m.evidenceId),
    selfSystems,
    dimensions: ['EMOTIONAL'],
    interpretationKind: 'confirmed', // the TAGGING is user-confirmed; the suggestion itself still is not
    safetyRestrictions: ['not_diagnostic', 'not_for_crisis_context'],
    alternativeModules: ['anxiety_reset', 'guided_reset'],
  });
}

// Rule 3 - stress with an immediate, explicitly stated need for something
// short. Only fires when the user has actually said so (preferredEffort)
// - this file never infers "wants something short" from anything else,
// matching the directive's own worked example (\"a user seeking a short
// reset should not automatically receive a complex programme\" implies the
// reverse is equally true: a short-reset suggestion needs the user to
// have actually asked for one).
function ruleShortGroundingRequest(ctx: BuildContext): NheiRecoverySuggestion | null {
  if (ctx.input.userStatedGoal?.preferredEffort !== 'low_bandwidth') return null;
  const { confirmedInterpretations, openHypotheses } = ctx.input.contextSummary;
  const confirmedMatches = confirmedInterpretations.filter((c) => c.dimensions.includes('EMOTIONAL'));
  const hypothesisedMatches = openHypotheses.filter((c) => c.dimensions.includes('EMOTIONAL'));
  const referenced = confirmedMatches.length > 0 ? confirmedMatches : hypothesisedMatches;
  if (referenced.length === 0) return null;

  return finishSuggestion(ctx, {
    targetModule: 'anxiety_reset',
    routeType: 'STABILISE',
    requiredEffort: 'low_bandwidth',
    reason: 'You asked for something quick, and an emotional-dimension signal is present.',
    explanationForUser:
      'You said you wanted something short right now, so Nova is only offering something that fits that - ' +
      'a brief grounding step, not a longer programme.',
    evidenceReferences: referenced.map((m) => m.evidenceId),
    selfSystems: Array.from(new Set(referenced.flatMap((m) => m.selfSystems))),
    dimensions: ['EMOTIONAL'],
    interpretationKind: confirmedMatches.length > 0 ? 'confirmed' : 'tentative',
    safetyRestrictions: ['not_diagnostic', 'not_for_crisis_context'],
    alternativeModules: ['reset_studio', 'guided_reset'],
  });
}

// Rule 4 - action paralysis with a clearly stated goal. Requires BOTH a
// confirmed recurring behavioural pattern AND an explicit preferredRouteType
// of 'ACT' - the directive's own phrase is "with a clearly stated goal,"
// not "whenever a pattern exists," so this deliberately never fires on
// pattern evidence alone (see the synthetic test for "multiple possible
// pathways," which specifically proves ACT does not win by default).
function ruleActionWithStatedGoal(ctx: BuildContext): NheiRecoverySuggestion | null {
  if (ctx.input.userStatedGoal?.preferredRouteType !== 'ACT') return null;
  const pattern = ctx.input.contextSummary.behaviouralPatterns.find((p) => p.occurrenceCount >= 2);
  if (!pattern) return null;

  return finishSuggestion(ctx, {
    targetModule: 'action_engine',
    routeType: 'ACT',
    requiredEffort: 'reflective_bandwidth',
    reason: 'You said you want to work on this, and a repeated pattern is already visible.',
    explanationForUser:
      'You’ve told Nova you want to actually change something here, and you’ve described this happening more ' +
      'than once. Action Engine is for turning an understood pattern into one small, testable change - entirely ' +
      'on your terms.',
    evidenceReferences: [...pattern.behaviourEventIds, ...pattern.outcomeEventIds],
    selfSystems: pattern.selfSystems,
    dimensions: pattern.dimensions,
    interpretationKind: 'tentative',
    safetyRestrictions: ['not_diagnostic'],
    alternativeModules: ['my_patterns'],
  });
}

// Rule 5 - energy/recovery-foundation signal (Physical dimension). Targets
// recovery_fuel, not Energy Delta Management - see this file's header
// comment for why (MODULE_ROUTE_MAP has no entry for Energy Delta).
function ruleRecoveryFoundationLow(ctx: BuildContext): NheiRecoverySuggestion | null {
  const { confirmedInterpretations, openHypotheses } = ctx.input.contextSummary;
  const confirmed = confirmedInterpretations.filter((c) => USABLE_EVIDENCE_QUALITIES.includes(c.evidenceQuality) && c.dimensions.includes('PHYSICAL'));
  const hypothesised = openHypotheses.filter((c) => c.dimensions.includes('PHYSICAL'));
  const matches = confirmed.length > 0 ? confirmed : hypothesised;
  if (matches.length === 0) return null;

  return finishSuggestion(ctx, {
    targetModule: 'recovery_fuel',
    routeType: 'RECOVER',
    requiredEffort: 'low_bandwidth',
    reason: 'A physical-dimension signal (e.g. fatigue) is present in what you’ve described.',
    explanationForUser:
      'You’ve described something in this physical territory - tiredness, depleted energy, that kind of thing. ' +
      'Nova doesn’t know what’s causing it, and isn’t claiming to - Recovery Fuel is a quick check on the basics ' +
      '(food, drink, rest), which sometimes helps regardless of the underlying cause.',
    evidenceReferences: matches.map((m) => m.evidenceId),
    selfSystems: Array.from(new Set(matches.flatMap((m) => m.selfSystems))),
    dimensions: ['PHYSICAL'],
    interpretationKind: confirmed.length > 0 ? 'confirmed' : 'tentative',
    safetyRestrictions: ['not_diagnostic', 'not_a_substitute_for_professional_care'],
    alternativeModules: ['one_less_thing'],
  });
}

// Rule 6 - general repeated pattern, not already covered by a more
// specific rule above (boundary-shaped patterns are Rule 1's job) - a
// genuine recurrence worth reflecting on, offered as UNDERSTAND/
// reflective, never as something requiring immediate action.
function ruleGeneralRepeatedPattern(ctx: BuildContext): NheiRecoverySuggestion | null {
  const pattern = ctx.input.contextSummary.behaviouralPatterns.find((p) => !p.selfSystems.includes('RELATIONAL_SELF'));
  if (!pattern) return null;

  return finishSuggestion(ctx, {
    targetModule: 'my_patterns',
    routeType: 'UNDERSTAND',
    requiredEffort: 'reflective_bandwidth',
    reason: 'A recurring pattern is visible across what you’ve shared.',
    explanationForUser:
      'This has come up more than once in what you’ve told Nova. That’s worth noticing, not necessarily acting ' +
      'on right now - My Patterns is a place to look at it more closely if and when you want to.',
    evidenceReferences: [...pattern.behaviourEventIds, ...pattern.outcomeEventIds],
    selfSystems: pattern.selfSystems,
    dimensions: pattern.dimensions,
    interpretationKind: 'tentative',
    safetyRestrictions: ['not_diagnostic'],
    alternativeModules: [],
  });
}

const ALL_RULES: Array<(ctx: BuildContext) => NheiRecoverySuggestion | null> = [
  ruleBoundaryRelated,
  ruleDifficultySettling,
  ruleShortGroundingRequest,
  ruleActionWithStatedGoal,
  ruleRecoveryFoundationLow,
  ruleGeneralRepeatedPattern,
];

// The one entry point. Fails closed on consent or safeguarding before
// looking at any evidence at all - no rule above ever runs otherwise.
export function buildNheiRecoverySuggestions(input: NheiRecoveryBridgeInput): NheiRecoveryBridgeResult {
  if (!input.routingInsightsConsented) {
    return { suggestions: [], noSuggestionReason: 'consent_not_granted', ageBand: null };
  }
  if (!input.safeguardingClearance.cleared) {
    return { suggestions: [], noSuggestionReason: 'safeguarding_not_cleared', ageBand: null };
  }
  if (input.contextSummary.insufficientEvidence) {
    return { suggestions: [], noSuggestionReason: 'insufficient_evidence', ageBand: input.safeguardingClearance.ageBand };
  }

  const ctx: BuildContext = { input };
  const suggestions = ALL_RULES.map((rule) => rule(ctx)).filter((s): s is NheiRecoverySuggestion => s !== null);

  return {
    suggestions,
    noSuggestionReason: suggestions.length === 0 ? 'no_relevant_pattern' : null,
    ageBand: input.safeguardingClearance.ageBand,
  };
}
