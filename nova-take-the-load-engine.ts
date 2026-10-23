// Nova "Take the Load" — offline orchestration engine (Phase 5B, directive §4).
//
// Given a user-stated practical problem, this identifies possible
// workload-reduction actions from two synthetic categories, prepares one,
// checks dependency/feasibility and capacity fit, explains itself, requires
// an explicit approval, and only then executes through the abstract
// connector interface (nova-take-the-load-connector-contract.ts) - never a
// real one in this codebase today. Zero import of anything under the
// `nhei-` prefix: this file cannot read NHEI consent, cannot read
// safeguarding clearance, and has no code path where an NHEI
// interpretation could stand in for the explicit approval step below.
//
// Existing real-world precedent reviewed before writing this (Phase 5B
// audit): Boundary Autopilot (`server.ts`'s `/api/boundary-autopilot/
// slack/*` routes) already sends real Slack messages/DND/status today,
// server-side audit-logged, via the user's own OAuth token. This engine
// deliberately does not reuse or touch that connector, or any of the
// read-only Asana/Monday/Calendly/Google Calendar/Gmail integration
// tokens found in the same audit (confirmed to have zero write capability
// today) - every execution in this file goes only through a caller-
// supplied NovaExternalConnector, and the only one that exists in this
// codebase is the test-only fake in the connector-contract file.

import {
  type NovaStatedPracticalProblem,
  type NovaTakeTheLoadProposal,
  type NovaFeasibilityCheck,
  type NovaPracticalActionCategory,
  assertValidNovaTakeTheLoadTransition,
} from './nova-take-the-load-types';
import { isEffortWithinBandwidth, type BandwidthBand } from './recovery-capacity-gate';
import type { NovaExternalConnector, NovaExternalConnectorRequest } from './nova-take-the-load-connector-contract';

let proposalCounter = 0;
function nextProposalId(): string {
  proposalCounter += 1;
  return `nova_take_the_load_${proposalCounter}`;
}

const CATEGORY_EFFORT: Record<NovaPracticalActionCategory, BandwidthBand> = {
  // Blocking out protected time is a small, bounded action.
  calendar_protection: 'some_bandwidth',
  // Deciding what to defer/deprioritise asks more of someone than a single click.
  task_deferral: 'reflective_bandwidth',
};

const CATEGORY_DEPENDENCIES: Record<NovaPracticalActionCategory, string[]> = {
  calendar_protection: ['a connected calendar', 'a free slot to protect'],
  task_deferral: ['a connected task list', 'at least one task the user is willing to move'],
};

/**
 * One proposal per known category - never invents a category beyond the
 * two this phase scopes. A real system would filter by what's actually
 * connected; this offline engine always returns both, since "connected"
 * is not evaluable without a real connector.
 */
export function identifyCandidateActions(problem: NovaStatedPracticalProblem): NovaTakeTheLoadProposal[] {
  const categories: NovaPracticalActionCategory[] = ['calendar_protection', 'task_deferral'];
  return categories.map((category) => ({
    proposalId: nextProposalId(),
    category,
    sourceProblemDescription: problem.description,
    state: 'identified' as const,
    proposedChangeDescription: buildProposedChangeDescription(category),
    explanation: buildExplanation(category, problem),
    feasibility: null,
    approved: null,
    undoSupported: category === 'calendar_protection', // a calendar block can be removed; a task-list reorder is not assumed reversible
    failureReason: null,
    retryCount: 0,
  }));
}

function buildProposedChangeDescription(category: NovaPracticalActionCategory): string {
  if (category === 'calendar_protection') {
    return 'Block a protected window on your calendar so nothing else can be booked over it.';
  }
  return 'Move one task further down your list so it is not due as soon.';
}

function buildExplanation(category: NovaPracticalActionCategory, problem: NovaStatedPracticalProblem): string {
  const base = category === 'calendar_protection'
    ? 'Based on what you described, protecting a block of time is one concrete way to reduce the load right now.'
    : 'Based on what you described, deferring one task is one concrete way to reduce the load right now.';
  return `${base} You described: "${problem.description}". Nothing has changed yet - this is only a proposal.`;
}

/**
 * Dependency/feasibility and capacity consideration. Never invents a
 * capacity score - a null band is reported as 'unknown', never treated as
 * either fitting or not fitting.
 */
export function prepareAction(proposal: NovaTakeTheLoadProposal, problem: NovaStatedPracticalProblem): NovaTakeTheLoadProposal {
  const capacityFit: NovaFeasibilityCheck['capacityFit'] = problem.capacityBand === null
    ? 'unknown'
    : (isEffortWithinBandwidth(CATEGORY_EFFORT[proposal.category], problem.capacityBand) ? 'fits' : 'does_not_fit');

  const feasibility: NovaFeasibilityCheck = {
    capacityFit,
    dependencies: CATEGORY_DEPENDENCIES[proposal.category],
    // Feasible at the proposal-structure level whenever capacity is known
    // not to block it; 'unknown' capacity is treated as feasible-to-offer
    // (the user can still say no), never silently withheld.
    feasible: capacityFit !== 'does_not_fit',
  };

  const nextState = feasibility.feasible ? 'prepared' : 'infeasible';
  assertValidNovaTakeTheLoadTransition(proposal.state, nextState);
  return { ...proposal, feasibility, state: nextState };
}

export function presentForApproval(proposal: NovaTakeTheLoadProposal): NovaTakeTheLoadProposal {
  assertValidNovaTakeTheLoadTransition(proposal.state, 'awaiting_approval');
  return { ...proposal, state: 'awaiting_approval' };
}

/**
 * The ONLY function that can move a proposal out of awaiting_approval.
 * No NHEI type, consent flag, or interpretation is a parameter here or
 * anywhere upstream of this call - structurally, approval can only ever
 * come from this explicit call.
 */
export function recordApprovalDecision(proposal: NovaTakeTheLoadProposal, approved: boolean): NovaTakeTheLoadProposal {
  const nextState = approved ? 'approved' : 'declined';
  assertValidNovaTakeTheLoadTransition(proposal.state, nextState);
  return { ...proposal, state: nextState, approved };
}

export function beginExecution(proposal: NovaTakeTheLoadProposal): NovaTakeTheLoadProposal {
  assertValidNovaTakeTheLoadTransition(proposal.state, 'executing');
  return { ...proposal, state: 'executing' };
}

/**
 * The one place this engine ever calls out through a connector. Never
 * reaches this point except from 'executing' (i.e. only after explicit
 * approval). Failure is recorded, never silently retried.
 */
export async function executeViaConnector(
  proposal: NovaTakeTheLoadProposal,
  connector: NovaExternalConnector,
): Promise<NovaTakeTheLoadProposal> {
  if (proposal.state !== 'executing') {
    throw new Error('Nova Take the Load: executeViaConnector called outside the executing state.');
  }
  const request: NovaExternalConnectorRequest = {
    category: proposal.category,
    proposedChangeDescription: proposal.proposedChangeDescription,
  };
  const outcome = await connector.execute(request);
  if (outcome.ok) {
    return { ...proposal, state: 'confirmed', failureReason: null };
  }
  return { ...proposal, state: 'failed', failureReason: outcome.detail };
}

/**
 * A caller-initiated retry only - this file never calls itself again on
 * failure. Each retry is its own explicit call and increments the count
 * so a caller can cap attempts.
 */
export function retryExecution(proposal: NovaTakeTheLoadProposal): NovaTakeTheLoadProposal {
  assertValidNovaTakeTheLoadTransition(proposal.state, 'executing');
  return { ...proposal, state: 'executing', retryCount: proposal.retryCount + 1, failureReason: null };
}

/**
 * Only ever valid when the category's own undoSupported flag is true -
 * never attempted for a category whose real-world connector wouldn't
 * genuinely support reversal.
 */
export async function undoViaConnector(
  proposal: NovaTakeTheLoadProposal,
  connector: NovaExternalConnector,
): Promise<NovaTakeTheLoadProposal> {
  if (!proposal.undoSupported) {
    throw new Error(`Nova Take the Load: undo is not supported for category "${proposal.category}".`);
  }
  assertValidNovaTakeTheLoadTransition(proposal.state, 'undone');
  const request: NovaExternalConnectorRequest = {
    category: proposal.category,
    proposedChangeDescription: proposal.proposedChangeDescription,
  };
  await connector.undo(request);
  return { ...proposal, state: 'undone' };
}
