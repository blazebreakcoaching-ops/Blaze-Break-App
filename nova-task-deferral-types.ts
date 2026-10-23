// Nova "Take the Load" — Task Deferral domain types (Phase 5F Agentic
// Expansion, directive §2).
//
// The generic Take the Load engine (nova-take-the-load-types.ts /
// nova-take-the-load-engine.ts) has carried `task_deferral` as a category
// enum value since Phase 5B but never had a dedicated workflow: no server
// route, no UI, no connector. This file is that dedicated workflow's
// domain model, built the way Calendar Protection's was
// (nova-calendar-protection-service.ts) — its own persisted state machine,
// not a reuse of the generic offline engine's — because that is this
// codebase's own established pattern for "this category is getting a real
// workflow now" (confirmed by independent audit before writing this).
//
// HARD SAFETY RULE this type model exists to enforce structurally, not just
// by convention (directive §2's "never automatically contact another person
// or assume that a user has authority to change someone else's
// commitments"): `userControlsDeadline` and `userControlsOwnership` are
// REQUIRED fields, asked before any proposal is prepared. If either is
// false, the only reachable next state is `requires_other_person` — a
// terminal state with no transition to `prepared`/`awaiting_approval`/
// `executing` at all (see NOVA_TASK_DEFERRAL_VALID_TRANSITIONS below). There
// is no code path in nova-task-deferral-service.ts that can reach execution
// for a task the user does not control.
//
// MOCKED CONNECTOR ONLY, PERMANENTLY (directive §2's "use mocked external
// task connectors only... do not modify real Asana, Monday, Jira"): unlike
// Calendar Protection, whose connector is real-but-disabled by a kill
// switch, nova-task-deferral-connector-contract.ts never implements a real
// provider at all this phase. See that file's own header.

export type NovaTaskDeferralState =
  | 'identified'
  | 'clarified'
  | 'requires_other_person' // terminal — user does not control the deadline/ownership
  | 'prepared'
  | 'awaiting_approval'
  | 'approved'
  | 'declined'
  | 'executing'
  | 'confirmed'
  | 'failed';

export class NovaTaskDeferralInvalidTransitionError extends Error {
  constructor(from: NovaTaskDeferralState, to: NovaTaskDeferralState) {
    super(`Nova Task Deferral: cannot move from "${from}" to "${to}"`);
    this.name = 'NovaTaskDeferralInvalidTransitionError';
  }
}

// `confirmed` has no outgoing transition: the generic engine's own
// CATEGORY_DEPENDENCIES/undoSupported map already records
// `undoSupported: false` for `task_deferral` ("a task-list reorder is not
// assumed reversible") — this dedicated workflow keeps that same stance
// rather than inventing an undo this category was never granted.
export const NOVA_TASK_DEFERRAL_VALID_TRANSITIONS: Record<NovaTaskDeferralState, NovaTaskDeferralState[]> = {
  identified: ['clarified', 'requires_other_person'],
  clarified: ['prepared'],
  requires_other_person: [],
  prepared: ['awaiting_approval'],
  awaiting_approval: ['approved', 'declined', 'prepared'], // 'prepared' = user asked to modify the proposal before deciding
  approved: ['executing'],
  declined: [],
  executing: ['confirmed', 'failed'],
  confirmed: [],
  failed: ['executing'], // retry only, never auto-retried — see service file
};

export function assertValidNovaTaskDeferralTransition(from: NovaTaskDeferralState, to: NovaTaskDeferralState): void {
  if (!NOVA_TASK_DEFERRAL_VALID_TRANSITIONS[from].includes(to)) {
    throw new NovaTaskDeferralInvalidTransitionError(from, to);
  }
}

/** Step 1 of the directive's workflow — the user's own words, never interpreted or scored. */
export interface NovaTaskDeferralIdentification {
  taskDescription: string;
  /** Optional — a plain-language current due date/priority the user stated, never parsed or validated as a real calendar instant. */
  currentDueDescription: string | null;
}

/**
 * Step 2 — control/ownership clarification. Both fields are REQUIRED before
 * a proposal can be prepared (see the transition map above). `'unsure'` is a
 * genuine third answer, never defaulted to true or false — an unsure answer
 * is treated the same as `false` for the purpose of blocking execution
 * (never proceed on an assumption of authority), but is recorded distinctly
 * so the UI can offer "ask the person who'd know" rather than a flat refusal.
 */
export type NovaTaskDeferralControlAnswer = 'yes' | 'no' | 'unsure';

export interface NovaTaskDeferralControlClarification {
  userControlsDeadline: NovaTaskDeferralControlAnswer;
  userControlsOwnership: NovaTaskDeferralControlAnswer;
}

export function controlIsConfirmedByUser(clarification: NovaTaskDeferralControlClarification): boolean {
  return clarification.userControlsDeadline === 'yes' && clarification.userControlsOwnership === 'yes';
}

/** Step 3 — never a hard block; a caveat the user sees before deciding, not a refusal to propose. */
export interface NovaTaskDeferralPostponementConsideration {
  reasonablyPostponable: boolean;
  /** Plain-language reasons, e.g. "no one else is waiting on this immediately." Never a numeric score. */
  reasoning: string;
}

/** Step 4 — the proposed change. Exactly one of the two is set; never both, never neither. */
export interface NovaTaskDeferralProposedChange {
  proposedNewDueDescription: string | null;
  proposedNewPriority: 'lower' | 'unchanged' | 'higher' | null;
}

/** Step 5 — transparency, not a disclaimer buried in fine print. */
export interface NovaTaskDeferralConsequences {
  consequences: string[];
  uncertainties: string[];
}

export interface NovaTaskDeferralProposal {
  readonly proposalId: string;
  readonly idempotencyKey: string;
  readonly uid: string;
  state: NovaTaskDeferralState;
  identification: NovaTaskDeferralIdentification;
  controlClarification: NovaTaskDeferralControlClarification | null;
  postponementConsideration: NovaTaskDeferralPostponementConsideration | null;
  proposedChange: NovaTaskDeferralProposedChange | null;
  consequences: NovaTaskDeferralConsequences | null;
  /** Set once prepared; recomputed (and the proposal's fingerprint invalidated) every time the proposal is modified. */
  readonly approvalFingerprint: string;
  /** true only via an explicit, separate approval call — never inferred from preparing or presenting a proposal. */
  approved: boolean | null;
  failureReason: string | null;
  retryCount: number;
  approvedAt: string | null;
  approvalExpiresAt: string | null;
  activeAttemptId: string | null;
  lastTransitionAt: string;
}
