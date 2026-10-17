// NHEI PHASE 3C-2A - SECTION 13: SAFEGUARDING INTEGRATION CONTRACT (PREPARED, NOT WIRED)
//
// NHEI does not, and per instruction must never, build its own crisis
// prediction - nothing in nhei-*.ts classifies risk, scores urgency, or
// decides whether a situation is a crisis. This file does not change
// that; it defines the CONTRACT an INDEPENDENT, separately-built
// safeguarding layer would need to satisfy before any future phase is
// allowed to run NHEI's conversational interpretation (extraction) for a
// real user - and it fails CLOSED by default, so "a comprehensive
// safeguarding layer is a release prerequisite" is a structural property
// of this contract, not only a sentence in a report.
//
// Nothing in this file is called by nhei-conversation-pipeline.ts, by
// server.ts, or by any route - wiring a real gate into the pipeline is
// explicitly Phase 3C-2B+ work (it would require a real safeguarding
// layer to exist first, which does not exist in this codebase today).
// This phase prepares the contract only, the same "prepare but do not
// activate" pattern already used for createGeminiExtractionCaller
// (nhei-extraction-service.ts), the authority contract
// (nhei-authority-contract.ts), and the knowledge-to-model interface
// (nhei-knowledge-model-interface.ts).
//
// Existing safeguards this contract is designed to sit ALONGSIDE, never
// replace or absorb: server.ts's hardcoded crisis-safety floor
// (NOVA_ONE_SHOT_SAFETY_FLOOR / the equivalent floor on the primary chat
// surface - "If the person expresses thoughts of suicide, self-harm...
// stop coaching and gently, directly encourage them to contact real
// human help right now") and the existing Guardian Alert escalation path
// (guardian-alert.ts). A future safeguarding layer should build on or
// alongside those, not duplicate or weaken them.

import { type NheiAgeBand } from './nhei-knowledge-retrieval-engine';

export type NheiSafeguardingBlockReason =
  | 'crisis_signal_detected_by_independent_layer'
  | 'safeguarding_layer_not_integrated'
  | 'human_support_handoff_in_progress';

export type NheiSafeguardingClearance =
  | { cleared: true; ageBand: NheiAgeBand }
  | { cleared: false; reason: NheiSafeguardingBlockReason };

// Deliberately NOT the raw conversation text. The safeguarding layer
// reads the ORIGINAL conversation surface independently - it is not fed
// text BY NHEI, and it does not feed detection signals INTO NHEI either.
// They are two separate consumers of the same conversation, never a
// pipeline where one hands data to the other - this is what "independent
//... layer" means structurally, not just organisationally.
export interface NheiSafeguardingGateContext {
  uid: string;
  conversationId: string;
}

// The contract a future safeguarding layer must implement. NHEI's
// conversation pipeline would take an instance of this as a REQUIRED
// input (once Phase 3C-2B wires it in) and would refuse to run
// extraction at all without a `cleared: true` result.
export type NheiSafeguardingGate = (context: NheiSafeguardingGateContext) => Promise<NheiSafeguardingClearance>;

// The default, not-yet-integrated implementation. ALWAYS returns
// cleared: false - there is no safeguarding layer in this codebase today,
// so there is nothing honest this function could return except "blocked."
// Any future code path that calls this (by forgetting to supply a real
// gate) is blocked, never silently allowed through - fail closed, not
// fail open.
export const UNINTEGRATED_SAFEGUARDING_GATE: NheiSafeguardingGate = async () => ({
  cleared: false,
  reason: 'safeguarding_layer_not_integrated',
});

// The non-negotiable requirements section 13 names explicitly. These are
// PRODUCT/CLINICAL/LEGAL requirements, not pure functions this phase can
// implement - encoding them as named, enumerable fields (rather than
// prose a future implementer might skim past) is what makes them
// checkable against a real design later, the same shape
// nhei-knowledge-governance.ts's NheiKnowledgeReviewChecklist already
// uses for a different kind of required-coverage list.
export interface NheiSafeguardingIntegrationRequirements {
  runsBeforeSensitiveInterpretation: string;
  independentOfNhei: string;
  youthSpecific: string;
  humanSupportOptions: string;
  privacyBoundaries: string;
  modelOutputEvaluation: string;
}

export const NHEI_SAFEGUARDING_INTEGRATION_REQUIREMENTS: NheiSafeguardingIntegrationRequirements = {
  runsBeforeSensitiveInterpretation:
    'The gate must be checked, and must return cleared: true, before any conversation turn is ever passed to ' +
    'extractEvidenceFromConversation. NHEI must never run its own crisis detection as a substitute - it only ever ' +
    'consumes this gate\'s decision.',
  independentOfNhei:
    'The safeguarding layer must not import, call, or depend on any NHEI extraction/interpretation code - its ' +
    'detection logic must stand on its own, reviewable and testable independent of NHEI. Folding safety detection ' +
    'into the same system it is meant to safeguard against would defeat the point of independence.',
  youthSpecific:
    'For a youth ageBand (see nhei-knowledge-retrieval-engine.ts\'s NheiAgeBand), the gate must apply whatever ' +
    'additional youth-safeguarding requirements a qualified safeguarding/legal reviewer specifies (e.g. guardian ' +
    'notification policy, age-appropriate crisis resources, stricter default thresholds) BEFORE ever returning ' +
    'cleared: true. This file does not define what those requirements are - that is explicitly outside this ' +
    'phase\'s scope, and no youth-facing rollout is permitted until they are defined and implemented (see Phase ' +
    '3C-2A section 4\'s equivalent instruction for knowledge content).',
  humanSupportOptions:
    'A blocked clearance must always be accompanied by a real path to human support - the existing crisis-safety ' +
    'floor\'s crisis-line redirection and/or Guardian Alert escalation (guardian-alert.ts), never NHEI or the ' +
    'safeguarding layer itself attempting to resolve the situation through further automated conversation.',
  privacyBoundaries:
    'The safeguarding layer\'s own detection signals must never be persisted as NHEI evidence, and NHEI must never ' +
    'be used to infer or score crisis risk retroactively from previously-collected evidence. No autonomous ' +
    'psychological crisis-risk score may exist anywhere in NHEI, restated from Phase 3C-1 section 9 and Phase ' +
    '3C-2A section 13 directly.',
  modelOutputEvaluation:
    'If the safeguarding layer itself uses a model, that model\'s output must be schema-constrained and strictly ' +
    'validated before being trusted for a safeguarding decision - the same discipline nhei-extraction-types.ts ' +
    'already applies to NHEI\'s own extraction, never trusted on confidence alone. This file does not implement ' +
    'that evaluation; it requires it of whatever safeguarding phase builds the real gate.',
};
