// Nova Task Deferral — safe assistance for a restricted proposal (Phase
// 5G, directive §5).
//
// "Where the user does not control a deadline or owns a shared
// commitment, Nova should still be able to offer safe assistance... such
// assistance must not transition the restricted proposal into executable
// status. No messages may be sent automatically."
//
// This file is pure and inert, same discipline as
// nova-invisible-load-help-contract.ts: it only ever builds plain text
// for the user to read, edit, and act on themselves. It has no function
// that touches a `NovaTaskDeferralProposal`'s state, no import of
// nova-task-deferral-service.ts, and no send/dispatch capability of any
// kind - there is no code path anywhere in this file by which a message
// could leave the user's own screen without them copying it themselves.

export type NovaTaskDeferralSafeAssistanceChoice =
  | 'break_into_steps'
  | 'draft_more_time_message'
  | 'identify_decision_maker'
  | 'consider_alternative_priorities';

/**
 * A starting draft only - every word is editable, and nothing here ever
 * sends it. Deliberately generic (no invented specifics about the
 * relationship or the real deadline) since this file has no way to know
 * either honestly.
 */
export function buildMoreTimeMessageDraft(taskDescription: string, currentDueDescription: string | null): string {
  const dueClause = currentDueDescription ? ` by ${currentDueDescription}` : '';
  return `Hi — I wanted to check in about "${taskDescription}"${dueClause}. Is there any flexibility on the timing? ` +
    `I want to make sure it gets done properly, and a bit more time would help with that. Let me know what works on your end.`;
}

// A short, honest checklist - never a judgement, never specific to a
// situation this file can't actually see. The free-text notes field that
// uses this lives entirely in the component's own local state.
export const DECISION_MAKER_PROMPTS: readonly string[] = [
  "Whose calendar does the real deadline actually depend on?",
  'Who originally set this date, if that was someone else?',
  'Is anyone else waiting on this before they can do their own part?',
  "If you're not sure, who would know?",
];

export interface NovaTaskDeferralAlternativePriority {
  readonly tool: string;
  readonly reason: string;
}

// Fixed and honest, same reasoning as nova-invisible-load-help-contract.ts's
// own CATEGORY_RECOVERY_TOOL map: naming a real existing tool rather than
// inventing a prioritisation score this file has no honest way to produce.
export const ALTERNATIVE_PRIORITY_SUGGESTION: NovaTaskDeferralAlternativePriority = {
  tool: 'Workload Reality Check',
  reason: 'Seeing this task next to everything else you are carrying can make it clearer whether something ELSE should move instead.',
};
