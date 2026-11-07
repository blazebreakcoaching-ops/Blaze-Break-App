// NHEI PHASE 4 - RECOVERY INTELLIGENCE BRIDGE: TYPES
//
// The typed contract for the NHEI-to-Recovery integration layer. This
// file defines data shapes only - no logic. See nhei-recovery-bridge.ts
// for the pure functions that build an NheiRecoveryBridgeResult from an
// NheiRecoveryBridgeInput.
//
// OFFLINE AT THIS PHASE: nothing in this file, or in nhei-recovery-bridge.ts,
// is imported by server.ts or any live route. Building this contract is
// Phase 4's whole job; wiring it into a real conversation turn is
// explicitly future work, gated on its own approval (see this phase's
// delivery report, "Remaining Phase 4 work").
//
// DESIGN PRINCIPLE this file encodes structurally, not just in prose: a
// suggestion is data to inspect, never a command to execute. Nothing
// here has a "run this" method, a deep link, or a navigation action -
// only fields a future Nova-facing layer would read to construct an
// explanation and offer a choice.

import type { SelfSystem, Dimension } from './nhei-types';
import type { NheiAgeBand } from './nhei-knowledge-retrieval-engine';
import type { NheiSafeguardingClearance } from './nhei-safeguarding-contract';
import type { NheiPersonalContextSummary } from './nhei-context-integration';
import type { RouteType, InterventionCandidate } from './recovery-routing-engine';
import type { BandwidthBand } from './recovery-capacity-gate';
import type { NheiKnowledgeSafetyRestriction } from './nhei-knowledge-types';

// Mirrors the directive's own three words exactly. Describes whether the
// SELF-SYSTEM/DIMENSION TAGGING a suggestion rests on is user-confirmed
// (NheiEvidenceRecord.confirmationState === 'user_confirmed', surfaced via
// NheiPersonalContextSummary.confirmedInterpretations), a system
// hypothesis not yet confirmed or disputed (openHypotheses/
// behaviouralPatterns), or purely general educational association with no
// personal evidence behind it at all (e.g. "this dimension is generally
// associated with this kind of support"). A suggestion must never claim
// 'confirmed' for anything beyond the tagging itself - the SUGGESTION
// (that this recovery capability might help) is always Nova's own
// inference, never something a user "confirmed" by confirming an
// unrelated self-system tag.
export type NheiRecoveryInterpretationKind = 'confirmed' | 'tentative' | 'educational';

// 'unknown' is a real, structurally-forced outcome - see
// recovery-capacity-gate.ts's own CapacityGateResult.band: null discipline.
// This file never invents a capacity score or label when none exists.
export type NheiRecoveryCapacitySuitability = 'suitable' | 'unsuitable' | 'unknown';

// Reuses RouteType/BandwidthBand rather than inventing a parallel "goal"
// vocabulary - a user who says "I just want something quick" is expressed
// as preferredEffort: 'low_bandwidth'; a user who explicitly asks to work
// on something is preferredRouteType: 'ACT'. Both optional - most turns
// carry no explicit stated goal at all, and this must never be guessed.
export interface NheiUserStatedGoal {
  preferredRouteType?: RouteType;
  preferredEffort?: BandwidthBand;
}

export interface NheiRecoveryBridgeInput {
  // Already-built, already-consent-checked at the point it was produced
  // (buildNheiPersonalContextSummary returns null, never a stub summary,
  // when reflection_storage isn't consented) - this bridge adds no
  // Firestore access of its own and performs no further evidence
  // interpretation beyond what this summary already states.
  contextSummary: NheiPersonalContextSummary;
  userStatedGoal?: NheiUserStatedGoal;
  // null is a real, legitimate value - "no reliable capacity information
  // exists right now" - never defaulted to a specific band.
  capacityBand: BandwidthBand | null;
  // The Recovery Routing candidates signal-based generation has already
  // independently produced for this same turn (buildSignalCandidates) -
  // used only for cross-reference (matchingExistingCandidateId below),
  // never required, never mutated, never fed back into selectRoute by
  // this file.
  existingRoutingCandidates: InterventionCandidate[];
  // Must be the caller's own verified isNheiPurposeConsented(state,
  // 'routing_insights') result (nhei-consent.ts - this exact purpose was
  // reserved in Phase 2 specifically for "future use of confirmed NHEI
  // insights in Recovery Routing," which is exactly what this file is).
  // Never computed or assumed here - this file does no consent I/O.
  routingInsightsConsented: boolean;
  // The real safeguarding gate's result for this turn. Any real caller
  // today can only ever supply UNINTEGRATED_SAFEGUARDING_GATE's fixed
  // { cleared: false, reason: 'safeguarding_layer_not_integrated' } -
  // there is no implemented gate to return true. This field exists so
  // the fail-closed behaviour is structural (the function below refuses
  // to produce suggestions without cleared: true), not a comment someone
  // could skip past once a real gate eventually exists.
  safeguardingClearance: NheiSafeguardingClearance;
}

export interface NheiRecoverySuggestion {
  suggestionId: string;
  // Must satisfy isKnownRoutingModule (recovery-signal-candidates.ts) -
  // this file never emits a suggestion for a module that isn't a real,
  // already-routable destination.
  targetModule: string;
  routeType: RouteType;
  relevantCapabilityLabel: string;
  // Short, structured reason - mirrors InterventionCandidate.evidence.detail's
  // own discipline (recovery-routing-engine.ts): plain language, never a
  // formula, never naming a private evidence detail.
  reason: string;
  // A fuller plain-language explanation for the user-agency requirements
  // (directive §8): why Nova is suggesting this, which part of the user's
  // own self-reported activity it relates to, and that it is a suggestion,
  // not a settled fact.
  explanationForUser: string;
  // Evidence record IDs ONLY - never raw text, matching
  // NheiEvidenceRecord's own "ids only" discipline throughout this
  // codebase. A future consumer could look a record up by id if it ever
  // needed to, but nothing here carries the content itself.
  evidenceReferences: string[];
  // Both arrays, never a single value - multiple self-systems/dimensions
  // may legitimately be relevant to one suggestion (directive §4/§5).
  selfSystems: SelfSystem[];
  dimensions: Dimension[];
  interpretationKind: NheiRecoveryInterpretationKind;
  safetyRestrictions: NheiKnowledgeSafetyRestriction[];
  // Always 'routing_insights' today - a fixed literal, not a free string,
  // so a future caller cannot invent a different purpose name by accident.
  consentPrerequisite: 'routing_insights';
  capacitySuitability: NheiRecoveryCapacitySuitability;
  // Whether this suggestion's routeType/effort matches an explicitly
  // stated goal, when one was given - informational only, never used to
  // silently drop a suggestion (directive §8: every option stays
  // inspectable; the user decides, not this file).
  matchesStatedGoal: boolean;
  // Cross-reference only - if Recovery Routing's own independent signal-
  // based candidate generation already produced a candidate for the same
  // route, its candidateId is named here so a future consumer can see
  // the two systems agree, rather than presenting two disconnected
  // recommendations.
  matchingExistingCandidateId: string | null;
  // Other valid, verified modules that could also address the same
  // signal - never acted on, just offered, per "what alternative options
  // are available."
  alternativeModules: string[];
}

export type NheiRecoveryNoSuggestionReason =
  | 'consent_not_granted'
  | 'safeguarding_not_cleared'
  | 'insufficient_evidence'
  | 'no_relevant_pattern';

export interface NheiRecoveryBridgeResult {
  suggestions: NheiRecoverySuggestion[];
  // Present (non-null) only when suggestions is empty - an explicit,
  // inspectable "why nothing was suggested," never silence (directive §8:
  // "Support an explicit no-recommendation outcome").
  noSuggestionReason: NheiRecoveryNoSuggestionReason | null;
  // Carried through only when safeguardingClearance.cleared is true - a
  // future consumer needing youth-appropriate phrasing reads it from
  // here, never re-derives its own age judgement.
  ageBand: NheiAgeBand | null;
}
