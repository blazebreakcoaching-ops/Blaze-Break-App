// Nova Take the Load — Task Deferral workflow (Phase 5F Agentic Expansion,
// directive §2). The second complete Agentic Nova workflow, built on the
// same persisted-state-machine pattern Calendar Protection established
// (nova-calendar-protection-service.ts) — audited before writing this file
// and found to be the codebase's own established "give a category a real
// workflow" template: idempotent preparation, a fingerprint-bound approval
// gate, a Firestore-transaction-claimed execute step, capped retries, and
// an append-only audit trail.
//
// WHERE THIS DELIBERATELY DIFFERS FROM CALENDAR PROTECTION, AND WHY:
//  - No `ambiguous` state or reconciliation functions. Calendar
//    Protection's `ambiguous` state exists because its connector, once
//    enabled, would be a REAL Google Calendar write whose true outcome
//    could be genuinely unknown after a thrown/timed-out call. This
//    category's connector (nova-task-deferral-connector-contract.ts) is
//    permanently mock-only per the directive — a thrown execute() call is
//    this codebase's own code failing, not an external system whose state
//    might have silently changed, so it is recorded directly as `failed`
//    (safe to retry) rather than `ambiguous`.
//  - No `undone`/undo path at all. The generic Take the Load engine's own
//    CATEGORY_DEPENDENCIES map (nova-take-the-load-engine.ts) already
//    records `undoSupported: false` for `task_deferral` — "a task-list
//    reorder is not assumed reversible." This file keeps that stance.
//  - A `requires_other_person` terminal state with NO execution path at
//    all, reachable the moment `clarifyTaskDeferralControl` records that
//    the user does not control the task's deadline or ownership — see
//    nova-task-deferral-types.ts's own header on why this is structural,
//    not a convention a caller could skip past.
//  - `prepareTaskDeferralProposal` records a `reasonablyPostponable`
//    assessment as a visible caveat (directive §2 step 3), never as a
//    block on presenting the proposal — the user still decides. Only the
//    ownership/control answer from clarify is ever a hard block.
//
// Server-side authorisation (same contract every NHEI/Nova persistence
// function in this codebase uses): `uid` is always an already-verified
// value, never read from untrusted request input by this file itself —
// that is entirely server.ts's job.

import crypto from 'node:crypto';
import type {
  NovaTaskDeferralState,
  NovaTaskDeferralProposal,
  NovaTaskDeferralIdentification,
  NovaTaskDeferralControlClarification,
  NovaTaskDeferralPostponementConsideration,
  NovaTaskDeferralProposedChange,
  NovaTaskDeferralConsequences,
} from './nova-task-deferral-types';
import { assertValidNovaTaskDeferralTransition, controlIsConfirmedByUser } from './nova-task-deferral-types';
import type { NovaTaskDeferralConnector, NovaTaskDeferralConnectorRequest } from './nova-task-deferral-connector-contract';

export const NOVA_TASK_DEFERRAL_APPROVAL_TTL_MS = 15 * 60 * 1000;
export const NOVA_TASK_DEFERRAL_MAX_RETRIES = 5;

export interface FirestoreDocRefLike {
  get(): Promise<{ exists: boolean; data(): any }>;
  set(data: any, options?: { merge?: boolean }): Promise<any>;
}

export interface FirestoreTransactionLike {
  get(ref: FirestoreDocRefLike): Promise<{ exists: boolean; data(): any }>;
  set(ref: FirestoreDocRefLike, data: any, options?: { merge?: boolean }): void;
}

export interface FirestoreLike {
  collection(path: string): {
    doc(id: string): FirestoreDocRefLike;
    add(data: any): Promise<{ id: string }>;
  };
  runTransaction?<T>(fn: (tx: FirestoreTransactionLike) => Promise<T>): Promise<T>;
}

export class TaskDeferralTransactionSupportRequiredError extends Error {
  constructor() {
    super('nova-task-deferral-service: db.runTransaction is required for this operation and was not provided.');
    this.name = 'TaskDeferralTransactionSupportRequiredError';
  }
}

async function requireTransaction<T>(db: FirestoreLike, fn: (tx: FirestoreTransactionLike) => Promise<T>): Promise<T> {
  if (!db.runTransaction) throw new TaskDeferralTransactionSupportRequiredError();
  return db.runTransaction(fn);
}

function proposalDoc(db: FirestoreLike, uid: string, proposalId: string): FirestoreDocRefLike {
  return db.collection(`users/${uid}/task_deferral_proposals`).doc(proposalId);
}

async function recordAuditEntry(db: FirestoreLike, uid: string, proposalId: string, event: string, detail: Record<string, unknown>): Promise<void> {
  await db.collection(`users/${uid}/task_deferral_audit`).add({ proposalId, event, detail, at: new Date().toISOString() });
}

function computeApprovalFingerprint(input: { proposalId: string; proposedChange: NovaTaskDeferralProposedChange }): string {
  const hash = crypto.createHash('sha256');
  hash.update(`${input.proposalId}|${input.proposedChange.proposedNewDueDescription ?? ''}|${input.proposedChange.proposedNewPriority ?? ''}`);
  return hash.digest('hex');
}

/**
 * Directive §2 step 1 — identify the specific task. Idempotent on
 * `idempotencyKey`, same discipline as Calendar Protection's proposal
 * creation: a double-tap or retried request can never create two
 * competing proposals for the same stated intent.
 */
export async function identifyTaskDeferralCandidate(
  db: FirestoreLike,
  uid: string,
  idempotencyKey: string,
  identification: NovaTaskDeferralIdentification,
): Promise<NovaTaskDeferralProposal> {
  if (!identification.taskDescription.trim()) {
    throw new Error('invalid_identification: taskDescription must not be empty.');
  }
  const proposalId = `tdp_${idempotencyKey}`;
  const existing = await proposalDoc(db, uid, proposalId).get();
  if (existing.exists) return existing.data() as NovaTaskDeferralProposal;

  const now = new Date().toISOString();
  const proposal: NovaTaskDeferralProposal = {
    proposalId, idempotencyKey, uid, state: 'identified',
    identification, controlClarification: null, postponementConsideration: null,
    proposedChange: null, consequences: null,
    approvalFingerprint: '', approved: null, failureReason: null, retryCount: 0,
    approvedAt: null, approvalExpiresAt: null, activeAttemptId: null,
    lastTransitionAt: now,
  };
  await proposalDoc(db, uid, proposalId).set(proposal);
  await recordAuditEntry(db, uid, proposalId, 'identified', { taskDescription: identification.taskDescription });
  return proposal;
}

export type NovaTaskDeferralClarifyOutcome =
  | { status: 'requires_other_person'; proposal: NovaTaskDeferralProposal }
  | { status: 'clarified'; proposal: NovaTaskDeferralProposal }
  | { status: 'not_identified' };

/**
 * Directive §2 step 2 — clarify control/ownership. This is the hard safety
 * gate: a `false` (recorded as `controlIsConfirmedByUser(...) === false`,
 * which covers both an explicit "no" and an honest "unsure" on either
 * question — see nova-task-deferral-types.ts) moves the proposal straight
 * to `requires_other_person`, a terminal state with no further transition
 * defined at all. There is no later function in this file that can move a
 * proposal out of `requires_other_person`.
 */
export async function clarifyTaskDeferralControl(
  db: FirestoreLike,
  uid: string,
  proposalId: string,
  clarification: NovaTaskDeferralControlClarification,
): Promise<NovaTaskDeferralClarifyOutcome> {
  const snap = await proposalDoc(db, uid, proposalId).get();
  if (!snap.exists) throw new Error('No such task deferral proposal.');
  const proposal = snap.data() as NovaTaskDeferralProposal;
  if (proposal.state !== 'identified') {
    if (proposal.state === 'requires_other_person') return { status: 'requires_other_person', proposal };
    return { status: 'not_identified' };
  }

  const nextState: NovaTaskDeferralState = controlIsConfirmedByUser(clarification) ? 'clarified' : 'requires_other_person';
  assertValidNovaTaskDeferralTransition(proposal.state, nextState);
  const next: NovaTaskDeferralProposal = {
    ...proposal, state: nextState, controlClarification: clarification, lastTransitionAt: new Date().toISOString(),
  };
  await proposalDoc(db, uid, proposalId).set(next);
  await recordAuditEntry(db, uid, proposalId, nextState === 'clarified' ? 'control_clarified' : 'requires_other_person', { clarification });
  return { status: nextState === 'clarified' ? 'clarified' : 'requires_other_person', proposal: next };
}

/**
 * Directive §2 steps 3-5 — consider postponement, prepare the proposed
 * change, and explain consequences/uncertainties, all in one call because
 * they describe a single proposal the user reviews together. Exactly one
 * of `proposedNewDueDescription`/`proposedNewPriority` must be set — this
 * is a deferral of ONE concrete thing, never an open-ended "something will
 * change." Computing a fresh `approvalFingerprint` here (and again on
 * every subsequent modification) is what lets
 * `recordTaskDeferralApprovalDecision` reject a stale approval later.
 */
export async function prepareTaskDeferralProposal(
  db: FirestoreLike,
  uid: string,
  proposalId: string,
  input: {
    postponementConsideration: NovaTaskDeferralPostponementConsideration;
    proposedChange: NovaTaskDeferralProposedChange;
    consequences: NovaTaskDeferralConsequences;
  },
): Promise<NovaTaskDeferralProposal> {
  const hasDue = input.proposedChange.proposedNewDueDescription !== null;
  const hasPriority = input.proposedChange.proposedNewPriority !== null;
  if (hasDue === hasPriority) {
    throw new Error('invalid_proposed_change: exactly one of proposedNewDueDescription or proposedNewPriority must be set.');
  }

  const snap = await proposalDoc(db, uid, proposalId).get();
  if (!snap.exists) throw new Error('No such task deferral proposal.');
  const proposal = snap.data() as NovaTaskDeferralProposal;
  // 'clarified' -> 'prepared' is a first preparation; 'awaiting_approval' ->
  // 'prepared' is the user asking to modify a proposal they haven't
  // decided on yet. Both are valid per NOVA_TASK_DEFERRAL_VALID_TRANSITIONS.
  assertValidNovaTaskDeferralTransition(proposal.state, 'prepared');

  const approvalFingerprint = computeApprovalFingerprint({ proposalId, proposedChange: input.proposedChange });
  const next: NovaTaskDeferralProposal = {
    ...proposal, state: 'prepared',
    postponementConsideration: input.postponementConsideration,
    proposedChange: input.proposedChange,
    consequences: input.consequences,
    approvalFingerprint,
    // Modifying an unresolved proposal invalidates any prior approval
    // state entirely — a fresh fingerprint can never match a decision
    // recorded against the old one.
    approved: null, approvedAt: null, approvalExpiresAt: null,
    lastTransitionAt: new Date().toISOString(),
  };
  await proposalDoc(db, uid, proposalId).set(next);
  await recordAuditEntry(db, uid, proposalId, 'prepared', { proposedChange: input.proposedChange });
  return next;
}

export async function presentTaskDeferralForApproval(db: FirestoreLike, uid: string, proposalId: string): Promise<NovaTaskDeferralProposal> {
  const snap = await proposalDoc(db, uid, proposalId).get();
  if (!snap.exists) throw new Error('No such task deferral proposal.');
  const proposal = snap.data() as NovaTaskDeferralProposal;
  if (proposal.state !== 'prepared') return proposal; // idempotent — already past this step
  const next: NovaTaskDeferralProposal = { ...proposal, state: 'awaiting_approval', lastTransitionAt: new Date().toISOString() };
  await proposalDoc(db, uid, proposalId).set(next);
  await recordAuditEntry(db, uid, proposalId, 'presented_for_approval', {});
  return next;
}

export type NovaTaskDeferralApprovalOutcome =
  | { status: 'approved'; proposal: NovaTaskDeferralProposal }
  | { status: 'declined'; proposal: NovaTaskDeferralProposal }
  | { status: 'fingerprint_mismatch' }
  | { status: 'not_awaiting_approval' };

/**
 * Directive §2 step 6 — approve or decline. Same discipline as Calendar
 * Protection's approval gate: a bare `approved: true` is never sufficient
 * on its own — the caller must also supply the exact `approvalFingerprint`
 * this proposal currently carries. "Modify" is handled by a separate call
 * to `prepareTaskDeferralProposal` (which computes a new fingerprint and
 * clears any prior approval), not by this function.
 */
export async function recordTaskDeferralApprovalDecision(
  db: FirestoreLike,
  uid: string,
  proposalId: string,
  decision: { approved: boolean; approvalFingerprint: string },
): Promise<NovaTaskDeferralApprovalOutcome> {
  const snap = await proposalDoc(db, uid, proposalId).get();
  if (!snap.exists) throw new Error('No such task deferral proposal.');
  const proposal = snap.data() as NovaTaskDeferralProposal;
  if (proposal.state !== 'awaiting_approval') return { status: 'not_awaiting_approval' };
  if (decision.approvalFingerprint !== proposal.approvalFingerprint) {
    await recordAuditEntry(db, uid, proposalId, 'approval_fingerprint_mismatch', { suppliedFingerprint: decision.approvalFingerprint });
    return { status: 'fingerprint_mismatch' };
  }
  const now = new Date().toISOString();
  const nextState: NovaTaskDeferralState = decision.approved ? 'approved' : 'declined';
  const next: NovaTaskDeferralProposal = {
    ...proposal, state: nextState, lastTransitionAt: now,
    approvedAt: decision.approved ? now : null,
    approvalExpiresAt: decision.approved ? new Date(Date.now() + NOVA_TASK_DEFERRAL_APPROVAL_TTL_MS).toISOString() : null,
  };
  await proposalDoc(db, uid, proposalId).set(next);
  await recordAuditEntry(db, uid, proposalId, decision.approved ? 'approved' : 'declined', {});
  return { status: nextState, proposal: next };
}

export type NovaTaskDeferralExecutionOutcome =
  | { status: 'transaction_support_required' }
  | { status: 'already_executed'; proposal: NovaTaskDeferralProposal }
  | { status: 'already_executing'; proposal: NovaTaskDeferralProposal }
  | { status: 'approval_expired'; proposal: NovaTaskDeferralProposal }
  | { status: 'not_approved' }
  | { status: 'confirmed'; proposal: NovaTaskDeferralProposal }
  | { status: 'failed'; proposal: NovaTaskDeferralProposal };

/**
 * Executes through the given connector — always the mock-only one from
 * nova-task-deferral-connector-contract.ts (see this file's own header on
 * why there is no kill switch here the way Calendar Protection has one:
 * there is no real connector in this codebase for this switch to ever
 * unlock). The approved -> executing transition is claimed inside a
 * Firestore transaction with a fresh `activeAttemptId`, the same
 * concurrency discipline Calendar Protection's own execute step uses, so
 * two concurrent execute calls for the same proposal can never both reach
 * the connector.
 */
export async function executeTaskDeferralProposal(
  db: FirestoreLike,
  uid: string,
  proposalId: string,
  connector: NovaTaskDeferralConnector,
): Promise<NovaTaskDeferralExecutionOutcome> {
  if (!db.runTransaction) return { status: 'transaction_support_required' };

  const ref = proposalDoc(db, uid, proposalId);
  const attemptId = crypto.randomUUID();
  const claim = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new Error('No such task deferral proposal.');
    const proposal = snap.data() as NovaTaskDeferralProposal;
    if (proposal.state === 'confirmed' || proposal.state === 'failed') {
      return { kind: 'short_circuit' as const, outcome: { status: 'already_executed', proposal } as NovaTaskDeferralExecutionOutcome };
    }
    if (proposal.state === 'executing') {
      return { kind: 'short_circuit' as const, outcome: { status: 'already_executing', proposal } as NovaTaskDeferralExecutionOutcome };
    }
    if (proposal.state !== 'approved') {
      return { kind: 'short_circuit' as const, outcome: { status: 'not_approved' } as NovaTaskDeferralExecutionOutcome };
    }
    if (proposal.approvalExpiresAt && new Date(proposal.approvalExpiresAt).getTime() < Date.now()) {
      const reverted: NovaTaskDeferralProposal = { ...proposal, state: 'awaiting_approval', lastTransitionAt: new Date().toISOString() };
      tx.set(ref, reverted);
      return { kind: 'short_circuit' as const, outcome: { status: 'approval_expired', proposal: reverted } as NovaTaskDeferralExecutionOutcome };
    }
    const claimed: NovaTaskDeferralProposal = { ...proposal, state: 'executing', activeAttemptId: attemptId, lastTransitionAt: new Date().toISOString() };
    tx.set(ref, claimed);
    return { kind: 'claimed' as const, proposal: claimed };
  });

  if (claim.kind === 'short_circuit') {
    if (claim.outcome.status === 'approval_expired') await recordAuditEntry(db, uid, proposalId, 'approval_expired', {});
    return claim.outcome;
  }

  const proposedChange = claim.proposal.proposedChange as NovaTaskDeferralProposedChange;
  const request: NovaTaskDeferralConnectorRequest = {
    proposalId, taskDescription: claim.proposal.identification.taskDescription,
    proposedNewDueDescription: proposedChange.proposedNewDueDescription,
    proposedNewPriority: proposedChange.proposedNewPriority,
  };
  let outcome: { ok: boolean; detail: string } | null = null;
  try {
    outcome = await connector.execute(request);
  } catch (err) {
    // A permanently-mocked connector throwing is this codebase's own code
    // failing, not a real provider whose true state is unknown — see this
    // file's own header on why that is recorded as `failed`, not
    // `ambiguous`.
    outcome = { ok: false, detail: err instanceof Error ? err.message : String(err) };
  }

  let auditEvent: string;
  const finalOutcome = await requireTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const current = snap.data() as NovaTaskDeferralProposal;
    if (current.activeAttemptId !== attemptId) {
      return { status: 'already_executed', proposal: current } as NovaTaskDeferralExecutionOutcome;
    }
    const finalState: NovaTaskDeferralState = outcome!.ok ? 'confirmed' : 'failed';
    auditEvent = outcome!.ok ? 'confirmed' : 'failed';
    const final: NovaTaskDeferralProposal = {
      ...current, state: finalState, failureReason: outcome!.ok ? null : outcome!.detail,
      activeAttemptId: null, lastTransitionAt: new Date().toISOString(),
    };
    tx.set(ref, final);
    return { status: finalState, proposal: final } as NovaTaskDeferralExecutionOutcome;
  });
  await recordAuditEntry(db, uid, proposalId, auditEvent!, { detail: outcome!.detail });
  return finalOutcome;
}

export async function retryTaskDeferralExecution(db: FirestoreLike, uid: string, proposalId: string): Promise<NovaTaskDeferralProposal> {
  const snap = await proposalDoc(db, uid, proposalId).get();
  if (!snap.exists) throw new Error('No such task deferral proposal.');
  const proposal = snap.data() as NovaTaskDeferralProposal;
  if (proposal.state !== 'failed') throw new Error('Can only retry a failed proposal.');
  if (proposal.retryCount >= NOVA_TASK_DEFERRAL_MAX_RETRIES) {
    throw new Error(`This proposal has already been retried ${proposal.retryCount} times, the maximum allowed (${NOVA_TASK_DEFERRAL_MAX_RETRIES}). It cannot be retried automatically again.`);
  }
  const next: NovaTaskDeferralProposal = {
    ...proposal, state: 'approved', retryCount: proposal.retryCount + 1, failureReason: null,
    lastTransitionAt: new Date().toISOString(),
    approvalExpiresAt: new Date(Date.now() + NOVA_TASK_DEFERRAL_APPROVAL_TTL_MS).toISOString(),
  };
  await proposalDoc(db, uid, proposalId).set(next);
  await recordAuditEntry(db, uid, proposalId, 'retry_requested', { retryCount: next.retryCount });
  return next;
}
