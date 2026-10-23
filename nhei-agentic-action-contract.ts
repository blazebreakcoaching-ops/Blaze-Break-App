// NHEI PHASE 5 - AGENTIC NOVA PERMISSION CONTRACT (directive §8)
//
// Prepares the interface contract for a FUTURE authorised agentic
// action - e.g. a recovery recommendation becoming a calendar block or
// a task adjustment through a connected app. Nothing in this file calls
// a real connector, modifies a real calendar, sends a real message, or
// contacts a Guardian - it is a pure state machine over plain data, the
// same "prepare but do not activate" pattern every other NHEI phase has
// used. No background monitoring, no automatic execution: every
// transition in this file is the direct result of an explicit function
// call a future UI/route would make in response to a real user action.
//
// THE ONE RULE THIS FILE EXISTS TO ENFORCE STRUCTURALLY: "Never allow
// NHEI interpretation alone to authorise an external action." There is
// no function in this file that can move a proposal from
// 'awaiting_approval' to 'approved' except recordApprovalDecision(true)
// - and that function takes the approval decision as a required,
// explicit boolean parameter with no default. Nothing here can infer,
// guess, or default to an approval; a caller that never calls
// recordApprovalDecision leaves the proposal sitting at
// 'awaiting_approval' forever, which is the correct, safe outcome.
//
// OFFLINE AT THIS PHASE: not imported by server.ts or any live route.
// Synthetic-only: see nhei-agentic-action-contract.test.ts and this
// phase's delivery report for the worked calendar-adjustment example.

export type NheiAgenticActionState =
  | 'suggested' // a recovery suggestion exists; no action has been proposed from it yet
  | 'prepared' // a specific, concrete external action has been drafted (not yet shown to the user)
  | 'awaiting_approval' // shown to the user; no decision recorded yet
  | 'approved' // the user explicitly said yes
  | 'declined' // the user explicitly said no - terminal, never re-offered automatically
  | 'executing' // handed to an authorised connector; outcome not yet known
  | 'confirmed' // the connector reported success
  | 'failed' // the connector reported failure - never silently retried
  | 'undone'; // a confirmed action was explicitly reversed by the user

// The only two kinds of connector this contract names, matching the
// directive's own worked example ("a recovery recommendation could
// become an approved calendar or task adjustment"). A real connector
// integration is a separate, future, explicitly out-of-scope decision -
// this type exists only so a synthetic preview has something concrete
// to name, never as a claim that either connector is actually wired up.
export type NheiAgenticConnectorKind = 'calendar' | 'task_list';

export interface NheiAgenticActionProposal {
  proposalId: string;
  // Links back to the NheiRecoverySuggestion this proposal was drafted
  // from - never the other way around; a suggestion never knows about
  // any proposal built from it.
  sourceSuggestionId: string;
  connector: NheiAgenticConnectorKind;
  // Plain-language description of the exact external change being
  // proposed (e.g. "Block 30 minutes tomorrow at 2pm for Reset Studio") -
  // never a raw API payload, so a reviewer/user can read exactly what
  // would happen without needing to understand the connector's own
  // data model.
  proposedChangeDescription: string;
  // Always true - structurally cannot be constructed any other way via
  // proposeAgenticAction below. Kept as an explicit field (rather than
  // just implied) so a consumer rendering this type can assert it
  // without reading this file's source.
  requiresUserApproval: true;
  undoSupported: boolean;
  state: NheiAgenticActionState;
  // Present only once executing has actually started/finished.
  executionOutcome: 'confirmed' | 'failed' | null;
}

const VALID_TRANSITIONS: Record<NheiAgenticActionState, NheiAgenticActionState[]> = {
  suggested: ['prepared'],
  prepared: ['awaiting_approval'],
  awaiting_approval: ['approved', 'declined'],
  approved: ['executing'],
  declined: [], // terminal
  executing: ['confirmed', 'failed'],
  confirmed: ['undone'],
  failed: [], // terminal - never auto-retried
  undone: [], // terminal
};

export class NheiAgenticInvalidTransitionError extends Error {
  constructor(from: NheiAgenticActionState, to: NheiAgenticActionState) {
    super(`Invalid agentic action transition: ${from} -> ${to}`);
  }
}

function transition(proposal: NheiAgenticActionProposal, to: NheiAgenticActionState): NheiAgenticActionProposal {
  if (!VALID_TRANSITIONS[proposal.state].includes(to)) {
    throw new NheiAgenticInvalidTransitionError(proposal.state, to);
  }
  return { ...proposal, state: to };
}

let proposalCounter = 0;

// Step 1 (suggested -> prepared). The only way to construct a proposal
// at all - requiresUserApproval is hard-coded true, not a parameter, so
// no caller can construct one without it.
export function proposeAgenticAction(input: {
  sourceSuggestionId: string;
  connector: NheiAgenticConnectorKind;
  proposedChangeDescription: string;
  undoSupported: boolean;
}): NheiAgenticActionProposal {
  proposalCounter += 1;
  return {
    proposalId: `agentic_proposal_${proposalCounter}`,
    sourceSuggestionId: input.sourceSuggestionId,
    connector: input.connector,
    proposedChangeDescription: input.proposedChangeDescription,
    requiresUserApproval: true,
    undoSupported: input.undoSupported,
    state: 'prepared',
    executionOutcome: null,
  };
}

// Step 2 (prepared -> awaiting_approval). Presenting the proposal to the
// user - still no decision recorded.
export function presentForApproval(proposal: NheiAgenticActionProposal): NheiAgenticActionProposal {
  return transition(proposal, 'awaiting_approval');
}

// Step 3 (awaiting_approval -> approved | declined). THE gate. `approved`
// is a required boolean with no default - see this file's header.
export function recordApprovalDecision(proposal: NheiAgenticActionProposal, approved: boolean): NheiAgenticActionProposal {
  return transition(proposal, approved ? 'approved' : 'declined');
}

// Step 4 (approved -> executing). Represents handing the proposal to an
// authorised connector - this function itself calls no connector; it
// only records that execution has begun. A real future caller would
// call this immediately before actually invoking a real connector.
export function beginExecution(proposal: NheiAgenticActionProposal): NheiAgenticActionProposal {
  return transition(proposal, 'executing');
}

// Step 5 (executing -> confirmed | failed). Records the connector's own
// reported outcome - never inferred, never assumed successful.
export function recordExecutionOutcome(proposal: NheiAgenticActionProposal, outcome: 'confirmed' | 'failed'): NheiAgenticActionProposal {
  const next = transition(proposal, outcome);
  return { ...next, executionOutcome: outcome };
}

// Step 6 (confirmed -> undone), only when the connector/action actually
// supports it - never offered as an option otherwise.
export function undoAction(proposal: NheiAgenticActionProposal): NheiAgenticActionProposal {
  if (!proposal.undoSupported) {
    throw new Error('Undo was requested for a proposal that does not support it.');
  }
  return transition(proposal, 'undone');
}
