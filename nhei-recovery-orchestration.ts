// NHEI PHASE 4B - RECOVERY ORCHESTRATION: TRUSTED CONSENT/SAFEGUARDING
// BOUNDARY (OFFLINE)
//
// A server-oriented composition layer that assembles a real
// NheiRecoveryBridgeInput from genuinely verified sources, then hands it
// to the already-built, already-tested buildNheiRecoverySuggestions and
// arbitrateNheiRecoverySuggestions - this file adds no new decision
// logic of its own, only trustworthy input assembly.
//
// THE SECURITY PROPERTY THIS FILE EXISTS FOR: its request type
// (NheiRecoveryOrchestrationRequest) has NO field for a consent boolean
// or a safeguarding-cleared boolean. That is not an oversight to work
// around by passing one in anyway - it is the whole point. The only way
// consent and safeguarding status reach this file's output is by this
// file itself reading them from genuinely authoritative sources:
//   - consent: getNheiConsent(db, uid) (nhei-persistence-service.ts),
//     which reads the user's own users/{uid}/nova_permissions document -
//     never a value a caller can simply assert.
//   - safeguarding: whatever `safeguardingGate` (a required
//     NheiSafeguardingGate function, not a boolean) returns when invoked
//     with {uid, conversationId}. There is no code path in this file
//     that can produce {cleared: true} on its own - it only ever
//     forwards whatever the gate itself decides. The real default for
//     any caller that does not explicitly override it is
//     UNINTEGRATED_SAFEGUARDING_GATE, which always returns
//     {cleared: false, reason: 'safeguarding_layer_not_integrated'} - so
//     every call through this file's own default behaves exactly like
//     every other NHEI call site that gate guards, with no special
//     bypass invented here.
//
// `uid` ITSELF is a trust boundary this file documents but does not
// enforce: exactly like getNheiConsent/buildNheiPersonalContextSummary
// elsewhere in this codebase, this file performs no authentication of
// its own. `uid` MUST be the server's own verified identity for the
// current request (e.g. the uid Express's auth middleware already
// attached to req.user after verifying a Firebase ID token) - NEVER a
// bare `req.body.uid` or any other client-asserted value. This file's
// signature does not even offer an alternate uid-ish field a careless
// caller could reach for instead, by the same "no field to misuse"
// discipline as the consent/safeguarding properties above.
//
// synthetic tests may construct an explicitly-named simulated clearance
// via SIMULATED_TEST_ONLY_CLEARED_GATE below - its name states plainly
// what it is, and nothing imports it except this file's own test suite.
//
// OFFLINE AT THIS PHASE: not imported by server.ts or any live route.
// "No production route wiring is authorised" - directive §2.

import { getNheiConsent, type FirestoreLike } from './nhei-persistence-service';
import { isNheiPurposeConsented } from './nhei-consent';
import { buildNheiPersonalContextSummary } from './nhei-context-integration';
import { determineBandwidth, type CapacityGateInput } from './recovery-capacity-gate';
import { buildNheiRecoverySuggestions } from './nhei-recovery-bridge';
import { arbitrateNheiRecoverySuggestions } from './nhei-recovery-arbitration';
import type { NheiRecoveryBridgeResult, NheiUserStatedGoal } from './nhei-recovery-bridge-types';
import type { NheiRecoveryArbitrationResult } from './nhei-recovery-arbitration';
import type { NheiSafeguardingGate, NheiSafeguardingClearance } from './nhei-safeguarding-contract';
import type { InterventionCandidate } from './recovery-routing-engine';

// A deliberately, loudly fake gate - used ONLY by this file's own test
// suite to exercise the "cleared: true" path, which no real gate in this
// codebase can produce yet. Its name alone should stop anyone mistaking
// it for a production default; it is exported so a test file can import
// it explicitly rather than this file having to construct an inline
// stand-in that might look less obviously fake.
export const SIMULATED_TEST_ONLY_CLEARED_GATE: NheiSafeguardingGate = async () => ({
  cleared: true,
  ageBand: 'adult',
});

export interface NheiRecoveryOrchestrationRequest {
  // MUST be the server's own verified identity for this request - see
  // this file's header comment. No alternate "claimedUid" field exists.
  uid: string;
  conversationId: string;
  db: FirestoreLike;
  // Required, not optional-with-a-permissive-default - a caller that
  // forgets this parameter gets a compile error, not a silently granted
  // clearance. Pass UNINTEGRATED_SAFEGUARDING_GATE explicitly for the
  // real, honest, fail-closed behaviour every other NHEI call site uses.
  safeguardingGate: NheiSafeguardingGate;
  // Real capacity signals the caller already fetched elsewhere (a
  // check-in score, a delta state, a self-report) - this file performs
  // no capacity-relevant Firestore read of its own; it only runs the
  // real determineBandwidth (recovery-capacity-gate.ts) over what it is
  // given, never fabricating a band when the caller supplies nothing.
  capacityGateInput: CapacityGateInput;
  // Recovery Routing's own, independently-computed candidates for this
  // same turn - never recomputed here, only cross-referenced (see
  // nhei-recovery-bridge.ts's matchingExistingCandidateId).
  existingRoutingCandidates: InterventionCandidate[];
  // The user's own stated preference - legitimate direct user input
  // (not a security-relevant boolean), may come from the request body.
  userStatedGoal?: NheiUserStatedGoal;
  // Known-but-currently-unavailable modules, forwarded to arbitration.
  unavailableModules?: ReadonlySet<string> | string[];
}

export type NheiRecoveryOrchestrationOutcome =
  // buildNheiPersonalContextSummary itself returned null - this is
  // distinct from the bridge's own 'consent_not_granted', because it
  // means reflection_storage (the summary's own prerequisite, a
  // DIFFERENT consent purpose from routing_insights) isn't held, so
  // there is no summary to even evaluate routing_insights against.
  | { status: 'no_personal_context_available' }
  | {
      status: 'completed';
      safeguardingClearance: NheiSafeguardingClearance;
      routingInsightsConsented: boolean;
      bridgeResult: NheiRecoveryBridgeResult;
      arbitration: NheiRecoveryArbitrationResult;
    };

// The one entry point. Every field of its output is derived from a
// verified source - nothing here is an echo of untrusted caller input.
export async function orchestrateNheiRecoveryRequest(
  request: NheiRecoveryOrchestrationRequest,
): Promise<NheiRecoveryOrchestrationOutcome> {
  const contextSummary = await buildNheiPersonalContextSummary(request.db, request.uid);
  if (contextSummary === null) {
    return { status: 'no_personal_context_available' };
  }

  const consentState = await getNheiConsent(request.db, request.uid);
  const routingInsightsConsented = isNheiPurposeConsented(consentState, 'routing_insights');

  const safeguardingClearance = await request.safeguardingGate({
    uid: request.uid,
    conversationId: request.conversationId,
  });

  const capacityResult = determineBandwidth(request.capacityGateInput);

  const bridgeResult = buildNheiRecoverySuggestions({
    contextSummary,
    userStatedGoal: request.userStatedGoal,
    capacityBand: capacityResult.band,
    existingRoutingCandidates: request.existingRoutingCandidates,
    routingInsightsConsented,
    safeguardingClearance,
  });

  const arbitration = arbitrateNheiRecoverySuggestions({
    suggestions: bridgeResult.suggestions,
    unavailableModules: request.unavailableModules,
  });

  return {
    status: 'completed',
    safeguardingClearance,
    routingInsightsConsented,
    bridgeResult,
    arbitration,
  };
}
