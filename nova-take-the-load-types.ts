// Nova "Take the Load" — shared types (Phase 5B, directive §4).
//
// ARCHITECTURAL SEPARATION (directive §3): this is the "Agentic Nova"
// layer — responsible for preparing and, only once explicitly approved,
// executing a permitted external action. It is deliberately independent
// of NHEI: this file has no import of anything under the `nhei-` prefix,
// takes no NHEI consent flag as an input anywhere, and a caller cannot
// construct an approval from an NHEI interpretation alone. NHEI may be
// one optional SOURCE of a stated problem (via a caller-supplied plain
// string, see nova-take-the-load-engine.ts), never a bypass of the
// approval gate itself.
//
// OFFLINE THIS PHASE: no file in this group is imported by server.ts,
// any route, or any .tsx component — confirmed by grep before this
// phase's delivery report was written. No real connector exists; see
// nova-take-the-load-connector-contract.ts's own header.

export type NovaPracticalActionCategory = 'calendar_protection' | 'task_deferral';

export type NovaTakeTheLoadState =
  | 'identified'
  | 'prepared'
  | 'infeasible'
  | 'awaiting_approval'
  | 'approved'
  | 'declined'
  | 'executing'
  | 'confirmed'
  | 'failed'
  | 'undone';

export interface NovaStatedPracticalProblem {
  /** The user's own words. Never interpreted, scored, or diagnosed here. */
  description: string;
  /** Optional, caller-supplied capacity band — null means genuinely unknown, never defaulted. */
  capacityBand: 'low_bandwidth' | 'some_bandwidth' | 'reflective_bandwidth' | null;
}

export interface NovaFeasibilityCheck {
  /** Whether this proposal's required effort fits the stated capacity band. Null band -> 'unknown'. */
  capacityFit: 'fits' | 'does_not_fit' | 'unknown';
  /** A plain list of things that would need to be true for this to actually work — never invented beyond what the category itself requires. */
  dependencies: string[];
  /** True only when every dependency is satisfiable by this proposal's own category — never a guess about the real world. */
  feasible: boolean;
}

export interface NovaTakeTheLoadProposal {
  readonly proposalId: string;
  readonly category: NovaPracticalActionCategory;
  readonly sourceProblemDescription: string;
  state: NovaTakeTheLoadState;
  /** Plain-language description of exactly what would change. Never a diagnosis or a judgement of the user. */
  proposedChangeDescription: string;
  /** Why this was proposed — transparent, never hidden. */
  explanation: string;
  feasibility: NovaFeasibilityCheck | null;
  /** Set once an approval decision is recorded. True only via an explicit, separate user action. */
  approved: boolean | null;
  /** Whether this category's real-world connector genuinely supports reversal — a property of the category, never assumed. */
  undoSupported: boolean;
  failureReason: string | null;
  retryCount: number;
}

export interface NovaConnectorOutcome {
  ok: boolean;
  detail: string;
}

export class NovaTakeTheLoadInvalidTransitionError extends Error {
  constructor(from: NovaTakeTheLoadState, to: NovaTakeTheLoadState) {
    super(`Nova Take the Load: cannot move from "${from}" to "${to}"`);
    this.name = 'NovaTakeTheLoadInvalidTransitionError';
  }
}

export const NOVA_TAKE_THE_LOAD_VALID_TRANSITIONS: Record<NovaTakeTheLoadState, NovaTakeTheLoadState[]> = {
  identified: ['prepared', 'infeasible'],
  prepared: ['awaiting_approval'],
  infeasible: [],
  awaiting_approval: ['approved', 'declined'],
  approved: ['executing'],
  declined: [],
  executing: ['confirmed', 'failed'],
  confirmed: ['undone'],
  failed: ['executing'], // retry only, never auto-retried (see engine)
  undone: [],
};

export function assertValidNovaTakeTheLoadTransition(from: NovaTakeTheLoadState, to: NovaTakeTheLoadState): void {
  if (!NOVA_TAKE_THE_LOAD_VALID_TRANSITIONS[from].includes(to)) {
    throw new NovaTakeTheLoadInvalidTransitionError(from, to);
  }
}
