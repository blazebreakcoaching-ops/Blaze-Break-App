// Nova proactive assistance contract (Phase 5F Agentic Expansion,
// directive §5).
//
// "Prepare Nova's next level of usefulness without introducing
// unapproved autonomous actions." This file formalises the five-stage
// distinction the directive names, and implements ONLY the first stage.
//
//   1. possible_suggestion   - THIS FILE. A plain, transparent "this
//                               might help" representation, derived only
//                               from inputs the caller explicitly
//                               supplies. Never persisted, never acted
//                               on, never shown to a connector.
//   2. prepared_for_review   - nova-calendar-protection-service.ts's
//                               `prepareCalendarProtectionProposal` /
//                               nova-task-deferral-service.ts's
//                               `prepareTaskDeferralProposal`. Turning a
//                               suggestion from stage 1 into a stage-2
//                               proposal is always a separate, explicit
//                               user action (the user re-states or
//                               confirms the suggestion through the real
//                               UI) - this file has no function that
//                               calls either of those for the caller.
//   3. approved               - `recordCalendarProtectionApproval` /
//                               `recordTaskDeferralApprovalDecision`.
//                               Fingerprint-bound; see those files.
//   4. executed                - `executeCalendarProtectionProposal`
//                               (permanently kill-switched off) /
//                               `executeTaskDeferralProposal` (mock-only
//                               connector, permanently).
//   5. confirmed_outcome       - the `confirmed` proposal state, plus the
//                               separate, optional user-confirmed
//                               feedback contract
//                               (nova-task-assistance-outcome.ts).
//
// WHY A NEW FILE RATHER THAN A FOURTH STATE MACHINE: an independent
// audit before this phase found THREE already-existing, near-identical
// suggested->prepared->approved->executed->confirmed state machines in
// this codebase (nova-take-the-load-types.ts's generic engine,
// nova-calendar-protection-service.ts's real one, and
// nhei-agentic-action-contract.ts's synthetic preview one) and
// recommended consolidating rather than adding a fourth. This file adds
// no new state machine at all - stages 2-5 above are exactly the
// existing ones. The only genuinely new thing here is stage 1, which
// none of the three prior machines modelled: a suggestion that exists
// BEFORE any proposal object does, built from context the user has
// already, separately, made available (a stated goal, a voluntarily
// shared obligation, their capacity, authorised calendar/task context, a
// prior confirmed plan) - not from a server-side inference about the
// user.
//
// HARD RULES THIS FILE ENFORCES STRUCTURALLY:
//  - Zero import of anything under the `nhei-` prefix (verified by this
//    file's own test, same discipline as nova-take-the-load-types.ts) -
//    "no NHEI inference may independently authorise an action" is true
//    here because there is no code path by which an NHEI value could
//    reach this file at all.
//  - No function in this file calls a connector, a Firestore write, or
//    any of the prepare/approve/execute functions listed above. A
//    suggestion this file returns is inert - it has already told you so
//    in its own `stage` field, which is always the literal
//    `'possible_suggestion'`.
//  - No scheduling, no cron, no queue, no "run this later" - every call
//    is synchronous and one-shot. "Do not enable background autonomous
//    execution or outbound messaging" is true here because there is no
//    asynchronous or persistent code path in this file at all.
//  - A suggestion for `calendar_protection` is only ever produced when
//    the caller supplies `hasAuthorisedCalendarActionContext: true` -
//    this file never assumes authorisation; the caller (server.ts) is
//    responsible for checking the real `allowCalendarActions` permission
//    (nova-calendar-action-permission.ts) before setting this flag.
//    Likewise for `hasAuthorisedTaskContext` and a real, existing,
//    user-connected task-provider integration token.

export type NovaProactiveAssistanceStage =
  | 'possible_suggestion'
  | 'prepared_for_review'
  | 'approved'
  | 'executed'
  | 'confirmed_outcome';

export type NovaProactiveSuggestionCategory = 'calendar_protection' | 'task_deferral';

export interface NovaProactiveSuggestionInput {
  /** The user's own words, or null if none was stated this session. Never required. */
  statedGoal: string | null;
  /** The user's own words, voluntarily shared (e.g. via Invisible Load or chat) - never inferred. */
  voluntarilySharedObligation: string | null;
  capacityBand: 'low_bandwidth' | 'some_bandwidth' | 'reflective_bandwidth' | null;
  /** True only when the caller has verified the real allowCalendarActions grant is current - never assumed here. */
  hasAuthorisedCalendarActionContext: boolean;
  /** True only when the caller has verified a real, existing, user-connected task-provider integration - never assumed here. */
  hasAuthorisedTaskContext: boolean;
  /** The user's own words describing a plan they have already explicitly confirmed, e.g. from a prior approved proposal - never a system-generated plan. */
  priorUserConfirmedPlan: string | null;
}

export interface NovaProactiveSuggestion {
  readonly suggestionId: string;
  readonly stage: 'possible_suggestion';
  readonly category: NovaProactiveSuggestionCategory;
  /** Plain language - never a diagnosis, never a judgement of the user. What Nova is suggesting. */
  readonly description: string;
  /** Transparent list of exactly which supplied inputs this suggestion drew from - nothing hidden. */
  readonly basedOn: string[];
  /**
   * Phase 5G (directive §2) - the explanatory fields a real suggestion UI
   * needs so a person can actually decide, not just see a bare sentence:
   */
  /** Why this might help, in plain terms - distinct from `description` ("what"), this is the "so what". */
  readonly whyItMightHelp: string;
  /** Exactly what's required to act on this, and its current real state - never assumed, always named. */
  readonly requiresPermissionOrIntegration: string;
  /** What concretely happens if the user proceeds - always honest about simulation vs. a real effect. */
  readonly whatHappensIfYouProceed: string;
  /** What Nova cannot currently do here - named explicitly, never left implicit. */
  readonly whatNovaCannotDoYet: string;
}

let suggestionCounter = 0;
function nextSuggestionId(): string {
  suggestionCounter += 1;
  return `nova_proactive_suggestion_${suggestionCounter}`;
}

/**
 * Pure, deterministic, synchronous. Returns zero or more suggestions -
 * never guarantees one exists, never forces the caller to act on any of
 * them. Each suggestion is independent; there is no ranking, scoring, or
 * "best" suggestion field anywhere in the output.
 */
export function generateProactiveSuggestions(input: NovaProactiveSuggestionInput): NovaProactiveSuggestion[] {
  const suggestions: NovaProactiveSuggestion[] = [];

  const obligationOrGoal = input.voluntarilySharedObligation ?? input.statedGoal;

  if (obligationOrGoal && input.hasAuthorisedCalendarActionContext) {
    const basedOn = [
      input.voluntarilySharedObligation ? 'the obligation you shared' : 'the goal you stated',
      'your calendar action permission is currently granted',
    ];
    if (input.capacityBand) basedOn.push(`your stated capacity (${input.capacityBand.replace('_', ' ')})`);
    suggestions.push({
      suggestionId: nextSuggestionId(),
      stage: 'possible_suggestion',
      category: 'calendar_protection',
      description: `You could protect a block of time for "${obligationOrGoal}" on your calendar.`,
      basedOn,
      whyItMightHelp: 'Having an actual block of protected time can make it harder for other things to crowd this out, rather than relying on remembering to make time for it.',
      requiresPermissionOrIntegration: 'Calendar action permission - already granted on your account, but you will be asked to confirm the exact time before anything is proposed.',
      whatHappensIfYouProceed: "You'll be taken to Calendar Protection, where you choose the exact time yourself and review the proposal before approving it - nothing is created yet.",
      whatNovaCannotDoYet: 'Real calendar execution is turned off platform-wide right now, so even an approved proposal will not actually reach your calendar yet.',
    });
  }

  if (obligationOrGoal && input.hasAuthorisedTaskContext) {
    const basedOn = [
      input.voluntarilySharedObligation ? 'the obligation you shared' : 'the goal you stated',
      'you have a connected task tool',
    ];
    suggestions.push({
      suggestionId: nextSuggestionId(),
      stage: 'possible_suggestion',
      category: 'task_deferral',
      description: `You could look at moving or reprioritising "${obligationOrGoal}".`,
      basedOn,
      whyItMightHelp: "If this can genuinely wait, moving it can free up attention for what's more pressing right now.",
      requiresPermissionOrIntegration: "A connected task tool - you already have one, but having it connected is not the same as agreeing to change anything in it. You'll be asked two direct questions about who actually controls this before any proposal is prepared.",
      whatHappensIfYouProceed: "You'll be taken to Task Deferral, where you answer those questions and review an exact proposed change before approving it - nothing is changed yet.",
      whatNovaCannotDoYet: 'Task Deferral only ever applies a change to a practice/mocked task list in this preview - no real Asana, Monday, or Jira task is ever modified.',
    });
  }

  if (input.priorUserConfirmedPlan && input.capacityBand === 'low_bandwidth') {
    const basedOn = ['a plan you already confirmed earlier', 'your stated capacity is currently low'];
    suggestions.push({
      suggestionId: nextSuggestionId(),
      stage: 'possible_suggestion',
      category: 'task_deferral',
      description: `Given your capacity right now, you could reconsider the timing of "${input.priorUserConfirmedPlan}".`,
      basedOn,
      whyItMightHelp: 'A plan made at a different capacity level does not always still fit - revisiting it now is a chance to adjust before it becomes a problem.',
      requiresPermissionOrIntegration: 'None beyond answering the same control/ownership questions Task Deferral always asks first.',
      whatHappensIfYouProceed: "You'll be taken to Task Deferral to review and, if you choose, propose a change - nothing is changed yet.",
      whatNovaCannotDoYet: 'Task Deferral only ever applies a change to a practice/mocked task list in this preview - no real provider task is ever modified.',
    });
  }

  return suggestions;
}
