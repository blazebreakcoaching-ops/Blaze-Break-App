// NHEI PHASE 3C-2B CHECKPOINT 2 - SECTIONS 1, 4, 10, 11: EDUCATIONAL MODE
// INTEGRATION WITH POST /api/nova/chat
// UPDATED PHASE 3C CHECKPOINT 3 SECTION 1: topic selection is now relevant
// to the user's actual message, not every topic unconditionally - see
// nhei-educational-topic-selector.ts and the "Checkpoint 3" paragraph
// below.
//
// This is the one function server.ts's chat route calls. Everything it
// needs to get right is concentrated here, deliberately, so the route
// handler itself only ever needs one try/caught call, not a scattered
// set of NHEI-specific decisions mixed into an already-large function.
//
// What this function guarantees, by construction:
//   * NEVER extracts conversation-to-evidence. It calls
//     runNheiConversationPipeline with mode: 'educational' only - the
//     pipeline's own code for that mode (nhei-conversation-pipeline.ts)
//     never calls extractEvidenceFromConversation at all, by construction,
//     not by a flag this function could get wrong.
//   * NEVER persists anything. Takes no FirestoreLike write surface, and
//     the educational-mode pipeline path performs reads only
//     (retrieveApprovedKnowledge).
//   * NEVER reads longitudinal history. Passes no priorEvidence (that
//     field does not exist on RunEducationalModeInput at all).
//   * NEVER requires NHEI tracking consent. Passes NHEI_CONSENT_DEFAULTS
//     (all-false) as the consent object - authoriseConversationMode's
//     'educational' branch ignores its consent parameter entirely
//     (nhei-conversation-modes.ts's authoriseEducational takes none), so
//     this is not a loophole, it is simply the correct input for a mode
//     that was designed to need no consent at all.
//   * NEVER infers age from the conversation. `ageBand` is passed through
//     UNCHANGED from whatever the caller supplies - this function adds no
//     inference of its own. Per section 10, no trusted server-side age
//     source exists anywhere in this codebase today, so server.ts's call
//     site passes `undefined`, and normalizeAgeBand (inside the pipeline)
//     turns that into the most restrictive band, 'unknown', automatically.
//     The moment a real trusted source exists, server.ts's call site -
//     not this function - is where it would be wired in.
//   * NEVER serves draft/unapproved content. retrieveApprovedKnowledge
//     (called inside the pipeline) only ever returns approvalStatus ===
//     'approved' entries - today, literally zero, since Phase 3C-2B
//     section 5 demoted every existing entry to draft. That means this
//     function currently always returns an empty addendum in practice -
//     expected, not a bug, and exactly "preserve existing Nova chat
//     behaviour rather than presenting unapproved content."
//   * Bounds context length/cost (section 4/11): at most
//     MAX_SECTIONS_PER_TURN quarantined sections are ever spliced into a
//     prompt, and the whole call is bounded by PIPELINE_TIMEOUT_MS,
//     racing a timeout rather than letting a slow Firestore read or a
//     retrieval-engine stall hold up the chat request indefinitely.
//   * Never throws to its caller. Every failure mode (timeout, a thrown
//     error from the pipeline, a malformed result) resolves to the same
//     safe empty result - section 11's "a timeout or retrieval error
//     must not prevent existing Nova functionality from continuing
//     safely." The caller (server.ts) still wraps this in its own
//     try/catch as defence in depth, but this function does not rely on
//     that alone.
//   * Logs no raw user conversation and no psychological interpretation -
//     this function never receives the user's message or history at all;
//     its only inputs are a Firestore handle and an age band. There is
//     nothing personal in its parameters to log in the first place.
//
// Checkpoint 3 section 1: Checkpoint 2's version of this function
// requested every topic in the taxonomy on every call - its own prior
// comment admitted this was "unfiltered by any guess at what the
// conversation is about." This version calls selectEducationalTopics on
// the user's own message FIRST, and only proceeds to the pipeline/
// retrieval engine at all if at least one topic clears that selector's
// threshold - an unrelated question (confirmed by this file's own tests)
// never reaches retrieveApprovedKnowledge, which is both the relevance
// fix and a further Firestore-cost bound beyond MAX_SECTIONS_PER_TURN.
// selectEducationalTopics performs no extraction, creates no evidence
// record, and needs no consent - see that file's own header comment for
// why a topic-selection function is not itself an interpretation of the
// user's psychology.
//
// What this function deliberately does NOT do: check the feature flag
// itself. That check belongs to the call site (server.ts), one line
// before this function is ever invoked, so that the flag's effect is
// visible at the route level - "when disabled, NHEI must execute no
// processing" (section 11) must be true even if this file were somehow
// called in error; putting the check only here would still run the
// (harmless but real) retrieval engine call before deciding to discard
// its result. See server.ts's /api/nova/chat handler for the actual
// `if (!nheiEducationalModeIsEnabledNow()) return;`-shaped guard.

import { runNheiConversationPipeline, type RunEducationalModeInput } from './nhei-conversation-pipeline';
import { NHEI_CONSENT_DEFAULTS } from './nhei-consent';
import { quarantineKnowledgeEntryForPrompt } from './nhei-knowledge-model-interface';
import { selectEducationalTopics } from './nhei-educational-topic-selector';
import type { FirestoreLike } from './nhei-persistence-service';

// Bounds how many quarantined knowledge sections can ever be spliced into
// one Nova chat system prompt - a cost/context-length ceiling independent
// of retrieveApprovedKnowledge's own DEFAULT_RETRIEVAL_LIMIT (which
// bounds how many entries the retrieval ENGINE considers, not how many
// this specific integration point injects into a prompt).
const MAX_SECTIONS_PER_TURN = 3;

// Bounds how long this integration may hold up the chat request before
// giving up and returning an empty result - existing Nova chat latency
// characteristics must stay close to unaffected per section 2's own
// requirement, and NHEI is explicitly "optional to existing Nova chat"
// per section 11.
const PIPELINE_TIMEOUT_MS = 3000;

export interface NheiEducationalChatAddendumResult {
  // Empty string when there is nothing to add (the overwhelmingly common
  // case today, since no approved content exists) - the caller appends
  // this unconditionally; appending an empty string is a safe no-op.
  addendum: string;
  sectionCount: number;
}

const EMPTY_RESULT: NheiEducationalChatAddendumResult = { addendum: '', sectionCount: 0 };

// The one entry point server.ts's chat route calls. `knowledgeDb` is the
// real Firestore handle (getDb()) - this function performs read-only
// Firestore access through retrieveApprovedKnowledge, nothing else.
// `trustedAgeBand` must come from a verified server-side source if one
// ever exists; today, every call site passes `undefined` because none
// does (see this file's header comment and section 10). `userMessage` is
// the person's own chat turn, read ONLY by selectEducationalTopics (a
// pure, local, non-persisting classifier - see that file) to decide
// which topics are even worth asking retrieveApprovedKnowledge about;
// this function itself never stores, logs, or forwards that text
// anywhere else.
export async function buildNheiEducationalChatAddendum(
  knowledgeDb: FirestoreLike,
  trustedAgeBand: unknown,
  userMessage: unknown,
): Promise<NheiEducationalChatAddendumResult> {
  const topicSelection = selectEducationalTopics(userMessage);
  // Checkpoint 3 acceptance item: "unrelated questions are not forced
  // through NHEI." Zero selected topics means retrieveApprovedKnowledge
  // is never called at all - not called-and-discarded, never called -
  // which is also a further bound on Firestore read cost beyond
  // MAX_SECTIONS_PER_TURN (section 8).
  if (topicSelection.topics.length === 0) return EMPTY_RESULT;

  const input: RunEducationalModeInput = {
    mode: 'educational',
    requestedTopics: topicSelection.topics,
    ageBand: trustedAgeBand,
  };

  try {
    const timeout = new Promise<null>((resolve) => {
      setTimeout(() => resolve(null), PIPELINE_TIMEOUT_MS);
    });
    const result = await Promise.race([
      runNheiConversationPipeline(NHEI_CONSENT_DEFAULTS, input, knowledgeDb),
      timeout,
    ]);

    if (!result || !result.ok) return EMPTY_RESULT;

    const sections = result.response.sections.slice(0, MAX_SECTIONS_PER_TURN);
    if (sections.length === 0) return EMPTY_RESULT;

    // Every section's text goes through the same quarantine-by-delimiter
    // construction this phase adversarially tested (Checkpoint 1 section
    // 7) - the actual Nova prompt-construction boundary, not a
    // stand-in. One shared nonce per turn is sufficient (and simpler to
    // reason about) since all sections here are quarantined into the
    // same prompt in the same call.
    const nonce = `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    const quarantinedBlocks = sections.map((section) =>
      quarantineKnowledgeEntryForPrompt(
        { id: section.sourceKnowledgeEntryId ?? 'nhei_section', title: section.heading, educationalSummary: section.body },
        nonce,
      ).quarantinedText,
    );

    return { addendum: `\n\n${quarantinedBlocks.join('\n\n')}`, sectionCount: sections.length };
  } catch {
    // Never let a retrieval/pipeline failure propagate into the chat
    // route - existing Nova chat functionality must continue exactly as
    // if this integration did not exist. No raw error detail is logged
    // here (it carries no personal data to begin with, since this
    // function never receives conversation content) - the caller's own
    // try/catch is responsible for whatever logging it already does.
    return EMPTY_RESULT;
  }
}
