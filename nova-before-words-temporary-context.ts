// Before Words -> temporary Nova context (Phase 5D, directive §6).
//
// AUDIT FINDING THIS FILE CLOSES: `buildNovaIntakeSummaryFromBeforeWords`
// (nova-before-words-handoff-contract.ts, Phase 5B) only ever produces a
// summary when `state.decision === 'retain_as_reflection_evidence'` - by
// design, since it is the precursor to a real `reflection_storage`
// evidence write that does not exist yet. That leaves the OTHER, equally
// real ending - `proceed_without_retaining` - with no handoff at all:
// someone who shares something in Before Words and explicitly chooses
// not to retain it currently gets nothing useful out of that for the
// conversation that follows. Directive §6 asks for "a temporary,
// session-scoped handoff letting Nova respond usefully without
// persisting as NHEI evidence, for BOTH endings."
//
// THE DISTINCTION THIS FILE EXISTS TO PRESERVE: a
// NovaTemporaryBeforeWordsContext is NOT NHEI evidence, NOT a
// NovaIntakeSummary, and NOT persisted by anything in this file -
// `persisted` is a literal `false`, not a flag a caller could set true.
// It exists so the CALLER (a live chat turn) can pass what the user just
// said into Nova's response for THIS TURN ONLY, then discard it. This
// file performs no Firestore write, no model call, and no logging of any
// kind - "no unintended conversation logging" (directive §6) means the
// responsibility for not persisting this past one turn belongs to
// whatever caller eventually wires this in, and this file gives that
// caller nothing it could accidentally persist by habit (no `.save()`,
// no doc id, no collection path - just a plain object).
//
// Built from BOTH endings - `proceed_without_retaining` and
// `retain_as_reflection_evidence` alike produce the same shape here,
// because "temporary context for this turn" and "whether this also gets
// permanently retained as NHEI evidence" are two independent questions.
// A caller that reaches `retain_as_reflection_evidence` should use BOTH
// this function (for the immediate turn) AND, separately, once real
// NHEI evidence-writing exists for Before Words specifically,
// `buildNovaIntakeSummaryFromBeforeWords` (for the permanent record) -
// this file does not replace that one or write anything itself.
//
// No diagnosis, trait, or interpretation is added here - every field is a
// direct, structural carry-over of what the user already said or marked
// uncertain, exactly like nova-before-words-handoff-contract.ts.

import type { NheiBeforeWordsState, NheiBeforeWordsPromptResponse } from './nhei-before-words-contract';
import { hasAnyContent } from './nhei-before-words-contract';

export interface NovaTemporaryBeforeWordsContext {
  /** Tags this object so it is never mistaken for a NovaIntakeSummary (which implies an eventual permanent write) in a log, a type cast, or a careless caller. */
  readonly kind: 'temporary_before_words_context';
  freeExpressionText: string;
  promptResponses: NheiBeforeWordsPromptResponse[];
  corrections: string[];
  /** A plain boolean roll-up of the user's OWN uncertainty flags - never this module's own judgement. */
  hasUncertainty: boolean;
  /** Always `false`, structurally - see this file's own header. Not a setting; there is no code path that produces `true`. */
  readonly persisted: false;
}

/**
 * Returns a temporary context usable for exactly one conversational turn,
 * for EITHER real ending (`proceed_without_retaining` or
 * `retain_as_reflection_evidence`) - or `null` if no decision has been
 * reached yet, or the user never actually said or marked anything (an
 * empty Before Words session has nothing to hand off, regardless of
 * which button was pressed).
 */
export function buildTemporaryNovaContextFromBeforeWords(state: NheiBeforeWordsState): NovaTemporaryBeforeWordsContext | null {
  if (state.decision === null) return null;
  if (!hasAnyContent(state)) return null;
  return {
    kind: 'temporary_before_words_context',
    freeExpressionText: state.freeExpressionText,
    promptResponses: state.promptResponses,
    corrections: state.corrections,
    hasUncertainty: state.promptResponses.some((r) => r.uncertain),
    persisted: false,
  };
}

// Phase 5E (directive §5): "the real Nova text-chat and voice architecture"
// both build their per-turn system instruction client-side
// (NovaChat.tsx's `fullSystemInstruction`, useNovaLiveVoice's caller-
// supplied `buildInitialPrompt`) and send it fresh with every request -
// neither persists it server-side beyond that one request/connection.
// This function formats a NovaTemporaryBeforeWordsContext into the exact
// plain-text addendum a caller folds into that per-turn instruction - the
// session-scoped handoff this directive asks for, using a channel that
// already exists rather than adding a new one or an extra model call.
//
// Deliberately plain and literal: this is a carry-over of the user's own
// words, never a diagnosis, trait, or "here is what this means"
// interpretation - the one rule nhei-before-words-contract.ts and
// nova-before-words-handoff-contract.ts both already hold to. Bounded in
// length (NOVA_SYSTEM_INSTRUCTION_LIMIT in NovaChat.tsx is 2800 characters
// for the WHOLE instruction, not just this addendum) so a long free-text
// entry can never silently push a real chat request over that cap and
// break the whole turn.
const MAX_FORMATTED_LENGTH = 1200;

export function formatTemporaryBeforeWordsContextForNova(context: NovaTemporaryBeforeWordsContext): string {
  const lines: string[] = [
    'The person just shared the following before this message, as part of a "Before Words" check-in. ' +
    'This is temporary context for THIS reply only - it is not saved anywhere, and must not be treated as a diagnosis or a label.',
  ];
  if (context.freeExpressionText.trim()) {
    lines.push(`In their own words: "${context.freeExpressionText.trim()}"`);
  }
  for (const response of context.promptResponses) {
    if (!response.text.trim()) continue;
    lines.push(`${response.category.replace(/_/g, ' ')}: "${response.text.trim()}"${response.uncertain ? ' (they marked this as not sure)' : ''}`);
  }
  for (const correction of context.corrections) {
    if (correction.trim()) lines.push(`They later corrected/added: "${correction.trim()}"`);
  }
  if (context.hasUncertainty) {
    lines.push('Treat anything marked "not sure" as genuinely uncertain, not as something to resolve for them.');
  }
  const formatted = lines.join('\n');
  return formatted.length > MAX_FORMATTED_LENGTH ? `${formatted.slice(0, MAX_FORMATTED_LENGTH)}…` : formatted;
}
