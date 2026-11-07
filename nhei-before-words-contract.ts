// NHEI PHASE 5 - "BEFORE WORDS" UX FOUNDATION (directive §7)
//
// AUDIT FINDING: a repo-wide search ("before words"/"beforewords", case
// insensitive, across every .ts/.tsx/.md file) found no prior Blaze
// Break or Nova work under this name - this is a new concept, built
// fresh for this phase, not an extension of something that already
// existed.
//
// PURPOSE: a lightweight, optional entry experience for a user who
// struggles to describe what they're experiencing BEFORE any NHEI
// interpretation runs - free expression first, structure only if and
// when the user wants it. This file is content/state modelling only:
// pure functions and plain data, no model call of any kind (the
// directive explicitly asks for a documented need before adding one,
// and this phase has none - free text plus a fixed, small set of
// optional descriptive prompts needs no model to classify or respond to
// anything), no Firestore, no persistence. "Proceed without retaining"
// is a real, first-class, always-available option - this module itself
// never writes anything anywhere, so that option is true by construction,
// not by a flag someone could leave unset.
//
// WHAT THIS IS NOT: it does not identify, score, or diagnose any
// psychological state - there is no function in this file that outputs
// a confidence number, a trait, or a label about the person. It never
// forces a diagnostic label choice - every prompt category below is a
// plain, descriptive life-domain, not a clinical category, and every one
// of them (and the whole flow) is skippable.
//
// OFFLINE AT THIS PHASE: not imported by server.ts or any live route.

// Deliberately plain, descriptive domains - never clinical terms, never
// implying a category the user must fit themselves into. "Prompt" here
// means an optional, gentle question to help someone start, not a
// required field.
export type NheiBeforeWordsPromptCategory =
  | 'what_happened'
  | 'how_my_body_feels'
  | 'what_im_thinking'
  | 'what_i_need_right_now';

export const NHEI_BEFORE_WORDS_PROMPTS: Record<NheiBeforeWordsPromptCategory, string> = {
  what_happened: 'What happened, in your own words - as much or as little as you want to say?',
  how_my_body_feels: 'If you want to, how does this feel in your body right now?',
  what_im_thinking: 'Is there a thought that keeps coming back?',
  what_i_need_right_now: 'If you knew, what would help right now?',
};

export type NheiBeforeWordsStep =
  | 'intro'
  | 'free_expression'
  | 'optional_prompts'
  | 'review'
  | 'decided';

export interface NheiBeforeWordsPromptResponse {
  category: NheiBeforeWordsPromptCategory;
  // Free text only - never a forced-choice label. Absent entirely if
  // the user skipped this specific prompt.
  text: string;
  // The user may explicitly mark their own response as uncertain -
  // "uncertainty" is something the person states about themselves,
  // never something this module infers about them.
  uncertain: boolean;
}

export interface NheiBeforeWordsState {
  step: NheiBeforeWordsStep;
  freeExpressionText: string;
  promptResponses: NheiBeforeWordsPromptResponse[];
  skippedPromptCategories: NheiBeforeWordsPromptCategory[];
  // Set only by the user explicitly correcting something Nova said back
  // to them during review - never set automatically.
  corrections: string[];
  // The only two real endings. Nothing in this module can reach
  // 'retain_as_reflection_evidence' on its own - that would require the
  // separate reflection_storage consent and a real evidence-write call,
  // neither of which this file performs. A caller that wants that
  // outcome must do so itself, explicitly, outside this module.
  decision: 'proceed_without_retaining' | 'retain_as_reflection_evidence' | null;
}

export function initNheiBeforeWordsState(): NheiBeforeWordsState {
  return {
    step: 'intro',
    freeExpressionText: '',
    promptResponses: [],
    skippedPromptCategories: [],
    corrections: [],
    decision: null,
  };
}

export function beginFreeExpression(state: NheiBeforeWordsState): NheiBeforeWordsState {
  return { ...state, step: 'free_expression' };
}

export function setFreeExpressionText(state: NheiBeforeWordsState, text: string): NheiBeforeWordsState {
  return { ...state, freeExpressionText: text };
}

export function moveToOptionalPrompts(state: NheiBeforeWordsState): NheiBeforeWordsState {
  return { ...state, step: 'optional_prompts' };
}

// Answering a prompt is always optional and the response is always free
// text - there is no enum of allowed answers to pick from.
export function answerPrompt(
  state: NheiBeforeWordsState,
  category: NheiBeforeWordsPromptCategory,
  text: string,
  uncertain: boolean,
): NheiBeforeWordsState {
  const promptResponses = [
    ...state.promptResponses.filter((r) => r.category !== category),
    { category, text, uncertain },
  ];
  return { ...state, promptResponses };
}

// Skipping is a real, explicit, always-available action - never implied
// by leaving a prompt blank. "Allow skipping questions" (directive §7).
export function skipPrompt(state: NheiBeforeWordsState, category: NheiBeforeWordsPromptCategory): NheiBeforeWordsState {
  if (state.skippedPromptCategories.includes(category)) return state;
  return { ...state, skippedPromptCategories: [...state.skippedPromptCategories, category] };
}

export function moveToReview(state: NheiBeforeWordsState): NheiBeforeWordsState {
  return { ...state, step: 'review' };
}

// "Correcting Nova" - the user can add a plain-text correction at
// review time. Never overwrites or deletes what was originally said;
// both the original free text/prompt responses and every correction
// remain visible side by side.
export function addCorrection(state: NheiBeforeWordsState, correctionText: string): NheiBeforeWordsState {
  return { ...state, corrections: [...state.corrections, correctionText] };
}

// The two real endings. Both are equally valid, equally final for this
// module's own purposes - "proceed without retaining the experience" is
// never presented as the lesser or default-avoided option.
export function decideProceedWithoutRetaining(state: NheiBeforeWordsState): NheiBeforeWordsState {
  return { ...state, step: 'decided', decision: 'proceed_without_retaining' };
}

export function decideRetainAsReflectionEvidence(state: NheiBeforeWordsState): NheiBeforeWordsState {
  return { ...state, step: 'decided', decision: 'retain_as_reflection_evidence' };
}

// Whether the person engaged with this at all beyond the intro - used
// only to decide whether there's anything to show on the review step,
// never to judge or score the interaction.
export function hasAnyContent(state: NheiBeforeWordsState): boolean {
  return state.freeExpressionText.trim().length > 0 || state.promptResponses.some((r) => r.text.trim().length > 0);
}
