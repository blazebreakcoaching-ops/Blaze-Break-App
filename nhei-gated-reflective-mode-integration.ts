// NHEI PHASE 3C-2B CHECKPOINT 2 - SECTION 9: THE REQUIRED SAFEGUARDING
// INTEGRATION INTERFACE FOR PERSONAL REFLECTION / LONGITUDINAL MODE
// (PREPARED, NOT WIRED INTO ANY ROUTE)
//
// Checkpoint 2's instruction: "prepare the required integration interface
// without inventing unreviewed clinical or youth-specific detection
// policies." This file is that interface - not the safeguarding layer
// itself (which does not exist and is not specified here beyond what
// nhei-safeguarding-contract.ts and the Phase 3C-2B Checkpoint 1
// safeguarding specification document already cover), but the one
// function any future route wiring Personal Reflection or Longitudinal
// Mode would have to call through, structured so that function CANNOT be
// called without supplying a safeguarding gate - there is no optional
// parameter, no default that quietly does nothing, and no way to reach
// extraction without going through this check first.
//
// Nothing in this file is imported by server.ts or any route. Per
// instruction: "do not activate Personal Reflection or Longitudinal
// extraction" - this file exists so a future, separately-approved
// checkpoint has an already-reviewed, already-tested integration point,
// exactly the same "prepare but do not activate" pattern already used
// for createGeminiExtractionCaller, the authority contract, and the
// knowledge-to-model interface.
//
// What this file guarantees, by construction:
//   * The safeguarding gate is REQUIRED, not optional - there is no
//     default parameter and no overload that omits it. A caller that
//     wants to skip the check cannot do so by simply not passing an
//     argument; TypeScript itself refuses to compile a call site missing
//     this parameter.
//   * The gate is checked BEFORE runNheiConversationPipeline is ever
//     called - extraction (extractEvidenceFromConversation, inside the
//     pipeline's personal_reflection/longitudinal branch) never runs for
//     a turn the gate did not clear. Educational Mode is explicitly out
//     of scope for this file - it never needs a safeguarding gate at all
//     (it never interprets personal conversation content), and routing
//     it through this interface would incorrectly suggest otherwise.
//   * A `cleared: false` result from the gate is returned immediately,
//     with no fallback, no retry-without-the-gate, and no partial
//     extraction. The caller's own context (uid, conversationId) is the
//     ONLY thing passed to the gate - never any NHEI evidence, never any
//     Trifecta classification - preserving "the safeguarding component
//     must remain independent of Trifecta classification."
//   * This file imports nothing from nhei-trifecta-engine.ts,
//     nhei-dimensions-engine.ts, or nhei-adaptive-behaviour-engine.ts
//     directly - it has no way to feed Trifecta/Dimension classification
//     INTO a safeguarding decision, by construction, not by convention.
//   * This file does not import or call anything from guardian-alert.ts.
//     A `cleared: false` result is returned as DATA to whatever future
//     route calls this function; it is that route's job (not this file's)
//     to decide what, if anything, to show the user - and even then, per
//     the Checkpoint 1 safeguarding specification §0.2, any Guardian
//     notification remains strictly user-initiated, never automatic.

import {
  type NheiSafeguardingGate,
  type NheiSafeguardingGateContext,
  type NheiSafeguardingClearance,
} from './nhei-safeguarding-contract';
import {
  runNheiConversationPipeline,
  type RunReflectiveModeInput,
  type NheiPipelineResult,
} from './nhei-conversation-pipeline';
import { type NheiConsentState } from './nhei-consent';
import type { FirestoreLike } from './nhei-persistence-service';

export type NheiGatedReflectiveModeResult =
  | { stage: 'safeguarding'; ok: false; clearance: NheiSafeguardingClearance & { cleared: false } }
  | ({ stage: 'pipeline' } & NheiPipelineResult);

// THE one entry point a future route must call for personal_reflection
// or longitudinal mode. `safeguardingGate` has no default value and
// cannot be omitted - this is the structural enforcement this
// checkpoint's instruction asks for. Pass UNINTEGRATED_SAFEGUARDING_GATE
// explicitly if (and only if) the honest answer is "no real gate exists
// yet" - which is the correct answer today, and which this function's
// own tests confirm results in an unconditional block, never a silent
// pass-through.
export async function runGatedReflectiveModeTurn(
  safeguardingGate: NheiSafeguardingGate,
  gateContext: NheiSafeguardingGateContext,
  consent: NheiConsentState,
  input: RunReflectiveModeInput,
  knowledgeDb: FirestoreLike,
): Promise<NheiGatedReflectiveModeResult> {
  const clearance = await safeguardingGate(gateContext);
  // Recurring discriminated-union narrowing quirk in this tsconfig
  // (isolatedModules) - `if (!clearance.cleared)` does not narrow the
  // union; `=== false` does. See nhei-safeguarding-contract.test.ts and
  // every other NHEI file that has hit this same pattern.
  if (clearance.cleared === false) {
    return { stage: 'safeguarding', ok: false, clearance };
  }

  const pipelineResult = await runNheiConversationPipeline(consent, input, knowledgeDb);
  return { stage: 'pipeline', ...pipelineResult };
}
