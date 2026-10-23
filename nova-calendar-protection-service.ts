// Nova Take the Load - Calendar Protection workflow (Phase 5C, directive
// §5; hardened Phase 5D, directive §3/§4). The first complete Agentic
// Nova workflow, chosen because Blaze Break already has a real, operational
// Google Calendar READ integration (calendar-workload-defence-engine.ts,
// src/lib/calendar-signals.ts) to identify pressure from.
//
// AUDIT FINDING THIS FILE IS BUILT AROUND (recorded in Phase 5C's
// delivery report): `signInWithCalendar` (src/lib/auth.tsx) already
// requests BOTH `calendar.readonly` AND `calendar.events` (a WRITE-
// capable scope) at sign-in time, for every user who has ever connected
// their calendar through CalendarDefenseView.tsx/MicroRecovery.tsx/
// IntegrationsDashboard.tsx - this is a real, already-granted OAuth
// scope, not a hypothetical future one. Despite that, NO code anywhere
// in this codebase has ever made a write call with it (confirmed by
// grep: every existing fetch against googleapis.com/calendar is a GET).
// This file does not change that. `CALENDAR_PROTECTION_EXECUTION_ENABLED`
// below is hardcoded `false` - the directive's own instruction ("keep
// the execution path disabled... without separate explicit
// authorisation") is enforced structurally: `executeCalendarProtection`
// checks this flag BEFORE ever calling a connector, real or fake, in
// production code. Only this file's own test suite flips it, through a
// loudly-named test-only override, to exercise the execution path
// against the fake connector contract (nova-take-the-load-connector-
// contract.ts) - never a real Google Calendar write.
//
// SECOND AUDIT FINDING, Phase 5D: the `getCalendarConnectionState`
// permission check server.ts's routes used through Phase 5C
// (`allowCalendarSignals`) is a READ-signal consent flag - it has never
// meant "this user has authorised an external write." Phase 5D closes
// that gap with a separate, fail-closed `allowCalendarActions` permission
// (nova-calendar-action-permission.ts), checked by server.ts at both
// propose time and, authoritatively, at execute time. "No NHEI inference
// or consent flag may substitute for action authorisation" - this file's
// own functions never check that permission themselves (they take no
// permission flag as a parameter at all); it is entirely server.ts's job,
// the same separation this file already keeps from NHEI.
//
// Server-side authorisation and concurrency discipline (directive §5,
// hardened per directive §4):
//  - `uid` is never a parameter from untrusted input anywhere in this
//    file - every function takes it as an already-verified value, the
//    same contract every other NHEI/Nova persistence function in this
//    codebase uses.
//  - Approval is tied to a specific proposal's exact parameters via
//    `approvalFingerprint` (a hash of the proposal's own id + start/end
//    time + title) - `recordCalendarProtectionApproval` REJECTS a
//    caller-supplied fingerprint that doesn't match what the server
//    itself computed when the proposal was prepared. A bare
//    `approved: true` is never sufficient - there is no code path that
//    accepts one without the matching fingerprint.
//  - An approval EXPIRES (`CALENDAR_PROTECTION_APPROVAL_TTL_MS` after it
//    was granted). Executing against a stale approval reverts the
//    proposal to `awaiting_approval` and returns `approval_expired`
//    rather than treating an old "yes" as still authorising today's
//    action - the calendar itself, or the user's circumstances, may have
//    changed since.
//  - Idempotency: preparing with the same `idempotencyKey` twice returns
//    the SAME proposal, never a duplicate; executing an
//    already-confirmed/failed/undone proposal returns its STORED result
//    rather than calling the connector again.
//  - The approved -> executing transition, and the confirmed -> undoing
//    transition, are each claimed inside a real Firestore transaction
//    (`db.runTransaction`, required - this file fails closed with
//    `transaction_support_required` if the given `db` does not support
//    one, exactly like nhei-persistence-service.ts's own transactional
//    writes) with a fresh, randomly-generated attempt id staged into the
//    same write. That closes the actual race directive §4 names: two
//    concurrent execute (or undo) calls for the same proposal both read
//    "approved" (or "confirmed") before either writes, but only one can
//    win the transaction; the loser's transaction re-reads the
//    now-already-claimed state and returns `already_executing` (or
//    `already_undoing`) instead of a second connector call. The
//    connector call itself happens OUTSIDE the transaction (real I/O has
//    no place inside one); the transaction only ever stages Firestore
//    reads/writes.
//  - A connector call that THROWS (e.g. a network timeout) rather than
//    resolving is never treated as a clean failure - the outcome is
//    genuinely unknown, so the proposal moves to `ambiguous`, not
//    `failed`. `retryCalendarProtectionExecution` only accepts a `failed`
//    proposal, so an ambiguous outcome is structurally unretryable
//    through this file; resolving it needs a human to check the real
//    calendar, never an automatic "try again."
//  - `retryCalendarProtectionExecution` is capped
//    (`CALENDAR_PROTECTION_MAX_RETRIES`) - a proposal cannot be retried
//    indefinitely.
//  - Undo is bound to the specific thing that was actually created:
//    `externalEventId` is populated only from a genuine `ok: true`
//    connector outcome, and `undoCalendarProtectionProposal` refuses to
//    proceed without one - "never promise an undo unless the actual
//    connector can provide it."
//  - Every state transition is written through `recordAuditEntry` - this
//    file performs no transition without one.
//  - Start/end times are validated as real, offset-qualified ISO 8601
//    instants with end strictly after start - "timezone/DST correctness"
//    (directive §4) means never accepting a bare local time with no
//    offset, which is exactly the ambiguous-instant bug class DST
//    transitions create.

import type { CalendarSignalState, RedZone } from './calendar-workload-defence-engine';
import { computeRedZones, hasAnyElevatedZone } from './calendar-workload-defence-engine';
import type { NovaExternalConnector, NovaExternalConnectorRequest } from './nova-take-the-load-connector-contract';
import crypto from 'node:crypto';

// Structural kill-switch - see this file's own header. Never read from an
// environment variable or a Firestore document, so it cannot be flipped
// by configuration alone; changing this requires a code change and a
// fresh review, the same bar directive §5's "separate explicit
// authorisation" sets.
export const CALENDAR_PROTECTION_EXECUTION_ENABLED = false;

// Exported ONLY for this file's own test suite, to exercise the
// execution path against the fake connector - never imported by
// server.ts or any route (see nova-calendar-protection-no-real-execution-audit.test.ts).
export const TEST_ONLY_FORCE_EXECUTION_ENABLED = Symbol('test-only-force-execution-enabled');

// An approval is only valid for this long after it was granted - see this
// file's own header. 15 minutes is long enough for a user to review and
// confirm, short enough that "approve, then come back the next day" is
// never silently treated as still-current authorisation.
export const CALENDAR_PROTECTION_APPROVAL_TTL_MS = 15 * 60 * 1000;

// A proposal cannot be retried forever - see this file's own header.
export const CALENDAR_PROTECTION_MAX_RETRIES = 5;

export type NovaCalendarProtectionState =
  | 'prepared' | 'awaiting_approval' | 'approved' | 'declined'
  | 'executing' | 'confirmed' | 'failed' | 'ambiguous'
  | 'undoing' | 'undone';

export interface NovaCalendarProtectionProposal {
  readonly proposalId: string;
  readonly idempotencyKey: string;
  readonly uid: string;
  state: NovaCalendarProtectionState;
  readonly startIso: string;
  readonly endIso: string;
  readonly title: string;
  readonly approvalFingerprint: string;
  failureReason: string | null;
  retryCount: number;
  approvedAt: string | null;
  approvalExpiresAt: string | null;
  /** Set only while an execute or undo attempt actually holds the claim - lets a finalising write confirm it is still the current attempt before applying. */
  activeAttemptId: string | null;
  /** Populated only from a genuine `ok: true` connector execution outcome - see this file's own header on undo. */
  externalEventId: string | null;
  lastTransitionAt: string;
}

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
  // Required for every state-claiming transition below - see this file's
  // own header on why there is no nontransactional fallback.
  runTransaction?<T>(fn: (tx: FirestoreTransactionLike) => Promise<T>): Promise<T>;
}

function computeApprovalFingerprint(input: { proposalId: string; startIso: string; endIso: string; title: string }): string {
  const hash = crypto.createHash('sha256');
  hash.update(`${input.proposalId}|${input.startIso}|${input.endIso}|${input.title}`);
  return hash.digest('hex');
}

// Requires an explicit UTC/offset designator (Z or ±HH:mm) - a bare local
// time like "2026-11-01T02:30:00" is exactly the ambiguous-instant shape a
// DST fall-back transition can mean two different real moments, so it is
// rejected outright rather than guessed at.
const OFFSET_QUALIFIED_ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

export type CalendarChangeTimeValidation = { ok: true } | { ok: false; reason: string };

export function validateCalendarChangeTimes(change: { startIso: string; endIso: string }): CalendarChangeTimeValidation {
  if (!OFFSET_QUALIFIED_ISO_RE.test(change.startIso)) {
    return { ok: false, reason: 'startIso must be an ISO 8601 instant with an explicit UTC/offset designator (e.g. "2026-02-02T14:00:00.000Z").' };
  }
  if (!OFFSET_QUALIFIED_ISO_RE.test(change.endIso)) {
    return { ok: false, reason: 'endIso must be an ISO 8601 instant with an explicit UTC/offset designator (e.g. "2026-02-02T14:30:00.000Z").' };
  }
  const start = Date.parse(change.startIso);
  const end = Date.parse(change.endIso);
  if (Number.isNaN(start) || Number.isNaN(end)) {
    return { ok: false, reason: 'startIso and endIso must both be valid dates.' };
  }
  if (end <= start) {
    return { ok: false, reason: 'endIso must be strictly after startIso.' };
  }
  return { ok: true };
}

/** directive §5's "identify calendar pressure" step - reuses the real, existing banding engine, never a new scoring model. */
export function identifyCalendarPressure(signal: CalendarSignalState): { pressureDetected: boolean; zones: RedZone[] } {
  const zones = computeRedZones(signal);
  return { pressureDetected: hasAnyElevatedZone(zones), zones };
}

async function recordAuditEntry(db: FirestoreLike, uid: string, proposalId: string, event: string, detail: Record<string, unknown>): Promise<void> {
  await db.collection(`users/${uid}/calendar_protection_audit`).add({
    proposalId, event, detail, at: new Date().toISOString(),
  });
}

function proposalDoc(db: FirestoreLike, uid: string, proposalId: string): FirestoreDocRefLike {
  return db.collection(`users/${uid}/calendar_protection_proposals`).doc(proposalId);
}

export class CalendarProtectionTransactionSupportRequiredError extends Error {
  constructor() {
    super('nova-calendar-protection-service: db.runTransaction is required for this operation and was not provided.');
    this.name = 'CalendarProtectionTransactionSupportRequiredError';
  }
}

async function requireTransaction<T>(db: FirestoreLike, fn: (tx: FirestoreTransactionLike) => Promise<T>): Promise<T> {
  if (!db.runTransaction) throw new CalendarProtectionTransactionSupportRequiredError();
  return db.runTransaction(fn);
}

/**
 * Prepares a specific proposed change (an exact start/end time and
 * title) - never a vague "block some time." Idempotent on
 * `idempotencyKey`: a second call with the same key returns the
 * existing proposal rather than creating a duplicate, so a double-tap or
 * a retried request can never produce two competing proposals for the
 * same intent.
 */
export async function prepareCalendarProtectionProposal(
  db: FirestoreLike,
  uid: string,
  idempotencyKey: string,
  change: { startIso: string; endIso: string; title: string },
): Promise<NovaCalendarProtectionProposal> {
  const timeValidation = validateCalendarChangeTimes(change);
  if (timeValidation.ok === false) {
    throw new Error(`invalid_time_range: ${timeValidation.reason}`);
  }
  // Idempotency lookup by doc-id convention (derived deterministically
  // from the idempotency key) rather than a Firestore query, so this
  // works identically against any FirestoreLike implementation,
  // including simple test doubles with no query engine.
  const proposalId = `cpp_${idempotencyKey}`;
  const existing = await proposalDoc(db, uid, proposalId).get();
  if (existing.exists) {
    return existing.data() as NovaCalendarProtectionProposal;
  }
  const approvalFingerprint = computeApprovalFingerprint({ proposalId, ...change });
  const now = new Date().toISOString();
  const proposal: NovaCalendarProtectionProposal = {
    proposalId, idempotencyKey, uid, state: 'prepared',
    startIso: change.startIso, endIso: change.endIso, title: change.title,
    approvalFingerprint, failureReason: null, retryCount: 0,
    approvedAt: null, approvalExpiresAt: null, activeAttemptId: null,
    externalEventId: null, lastTransitionAt: now,
  };
  await proposalDoc(db, uid, proposalId).set(proposal);
  await recordAuditEntry(db, uid, proposalId, 'prepared', { startIso: change.startIso, endIso: change.endIso, title: change.title });
  return proposal;
}

export async function presentCalendarProtectionForApproval(db: FirestoreLike, uid: string, proposalId: string): Promise<NovaCalendarProtectionProposal> {
  const snap = await proposalDoc(db, uid, proposalId).get();
  if (!snap.exists) throw new Error('No such calendar protection proposal.');
  const proposal = snap.data() as NovaCalendarProtectionProposal;
  if (proposal.state !== 'prepared') return proposal; // idempotent - already past this step
  const next = { ...proposal, state: 'awaiting_approval' as const, lastTransitionAt: new Date().toISOString() };
  await proposalDoc(db, uid, proposalId).set(next);
  await recordAuditEntry(db, uid, proposalId, 'presented_for_approval', {});
  return next;
}

export type NovaCalendarApprovalOutcome =
  | { status: 'approved'; proposal: NovaCalendarProtectionProposal }
  | { status: 'declined'; proposal: NovaCalendarProtectionProposal }
  | { status: 'fingerprint_mismatch' } // the directive's own named attack: "modified approval parameters"
  | { status: 'not_awaiting_approval' };

/**
 * The server-side authorisation gate. `approved: true` ALONE is never
 * sufficient - the caller must also supply the exact `approvalFingerprint`
 * this proposal was prepared with. A caller that approves a DIFFERENT
 * fingerprint than the one actually shown to the user (whether by bug,
 * tampering, or a stale UI) is rejected outright, never partially honoured.
 */
export async function recordCalendarProtectionApproval(
  db: FirestoreLike,
  uid: string,
  proposalId: string,
  decision: { approved: boolean; approvalFingerprint: string },
): Promise<NovaCalendarApprovalOutcome> {
  const snap = await proposalDoc(db, uid, proposalId).get();
  if (!snap.exists) throw new Error('No such calendar protection proposal.');
  const proposal = snap.data() as NovaCalendarProtectionProposal;
  if (proposal.state !== 'awaiting_approval') return { status: 'not_awaiting_approval' };
  if (decision.approvalFingerprint !== proposal.approvalFingerprint) {
    await recordAuditEntry(db, uid, proposalId, 'approval_fingerprint_mismatch', { suppliedFingerprint: decision.approvalFingerprint });
    return { status: 'fingerprint_mismatch' };
  }
  const now = new Date().toISOString();
  const nextState: NovaCalendarProtectionState = decision.approved ? 'approved' : 'declined';
  const next: NovaCalendarProtectionProposal = {
    ...proposal, state: nextState, lastTransitionAt: now,
    approvedAt: decision.approved ? now : null,
    approvalExpiresAt: decision.approved ? new Date(Date.now() + CALENDAR_PROTECTION_APPROVAL_TTL_MS).toISOString() : null,
  };
  await proposalDoc(db, uid, proposalId).set(next);
  await recordAuditEntry(db, uid, proposalId, decision.approved ? 'approved' : 'declined', {});
  return { status: nextState, proposal: next };
}

export type NovaCalendarExecutionOutcome =
  | { status: 'execution_disabled' } // the hardcoded kill-switch - no connector was ever called
  | { status: 'transaction_support_required' }
  | { status: 'already_executed'; proposal: NovaCalendarProtectionProposal } // idempotent replay - no second connector call
  | { status: 'already_executing'; proposal: NovaCalendarProtectionProposal } // another in-flight attempt currently holds the claim
  | { status: 'ambiguous'; proposal: NovaCalendarProtectionProposal } // the connector call's outcome is genuinely unknown
  | { status: 'approval_expired'; proposal: NovaCalendarProtectionProposal }
  | { status: 'not_approved' }
  | { status: 'confirmed'; proposal: NovaCalendarProtectionProposal }
  | { status: 'failed'; proposal: NovaCalendarProtectionProposal };

/**
 * Executes through the given connector - ONLY ever reachable if
 * CALENDAR_PROTECTION_EXECUTION_ENABLED is true, which it never is in
 * production code. The approved -> executing transition is claimed
 * inside a Firestore transaction with a fresh `activeAttemptId` - see
 * this file's own header for why that, not an application-level
 * check-then-write, is what actually closes the "two workers execute the
 * same proposal" race.
 */
export async function executeCalendarProtectionProposal(
  db: FirestoreLike,
  uid: string,
  proposalId: string,
  // `null` is the real production value - server.ts's route never
  // imports any connector (real or fake) at all, so it always passes
  // null here. The flag check below always short-circuits before this
  // parameter is ever used in production; it is only a real
  // NovaExternalConnector when this file's own test suite passes
  // TEST_ONLY_FORCE_EXECUTION_ENABLED alongside it.
  connector: NovaExternalConnector | null,
  testOnlyForceEnabled?: typeof TEST_ONLY_FORCE_EXECUTION_ENABLED,
): Promise<NovaCalendarExecutionOutcome> {
  const executionEnabled = CALENDAR_PROTECTION_EXECUTION_ENABLED || testOnlyForceEnabled === TEST_ONLY_FORCE_EXECUTION_ENABLED;
  if (!executionEnabled || !connector) {
    return { status: 'execution_disabled' };
  }
  if (!db.runTransaction) {
    return { status: 'transaction_support_required' };
  }

  const ref = proposalDoc(db, uid, proposalId);
  const attemptId = crypto.randomUUID();
  const claim = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new Error('No such calendar protection proposal.');
    const proposal = snap.data() as NovaCalendarProtectionProposal;
    if (proposal.state === 'confirmed' || proposal.state === 'failed' || proposal.state === 'undone' || proposal.state === 'undoing') {
      return { kind: 'short_circuit' as const, outcome: { status: 'already_executed', proposal } as NovaCalendarExecutionOutcome };
    }
    if (proposal.state === 'ambiguous') {
      return { kind: 'short_circuit' as const, outcome: { status: 'ambiguous', proposal } as NovaCalendarExecutionOutcome };
    }
    if (proposal.state === 'executing') {
      return { kind: 'short_circuit' as const, outcome: { status: 'already_executing', proposal } as NovaCalendarExecutionOutcome };
    }
    if (proposal.state !== 'approved') {
      return { kind: 'short_circuit' as const, outcome: { status: 'not_approved' } as NovaCalendarExecutionOutcome };
    }
    if (proposal.approvalExpiresAt && new Date(proposal.approvalExpiresAt).getTime() < Date.now()) {
      const reverted: NovaCalendarProtectionProposal = { ...proposal, state: 'awaiting_approval', lastTransitionAt: new Date().toISOString() };
      tx.set(ref, reverted);
      return { kind: 'short_circuit' as const, outcome: { status: 'approval_expired', proposal: reverted } as NovaCalendarExecutionOutcome };
    }
    const claimed: NovaCalendarProtectionProposal = { ...proposal, state: 'executing', activeAttemptId: attemptId, lastTransitionAt: new Date().toISOString() };
    tx.set(ref, claimed);
    return { kind: 'claimed' as const, proposal: claimed };
  });

  if (claim.kind === 'short_circuit') {
    if (claim.outcome.status === 'approval_expired') {
      await recordAuditEntry(db, uid, proposalId, 'approval_expired', {});
    }
    return claim.outcome;
  }

  const request: NovaExternalConnectorRequest = { category: 'calendar_protection', proposedChangeDescription: claim.proposal.title };
  let outcome: { ok: boolean; detail: string; externalId?: string | null } | null = null;
  let thrown: unknown = null;
  try {
    outcome = await connector.execute(request);
  } catch (err) {
    thrown = err;
  }

  let auditEvent: string | null = null;
  let auditDetail: Record<string, unknown> = {};
  const finalOutcome = await requireTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const current = snap.data() as NovaCalendarProtectionProposal;
    // Only finalise if this is still the attempt that claimed the state -
    // a stale finalisation from a superseded attempt must never clobber a
    // newer one's result.
    if (current.activeAttemptId !== attemptId) {
      return { status: 'already_executed', proposal: current } as NovaCalendarExecutionOutcome;
    }
    let finalState: NovaCalendarProtectionState;
    let failureReason: string | null;
    let externalEventId: string | null = current.externalEventId;
    if (thrown) {
      finalState = 'ambiguous';
      failureReason = thrown instanceof Error ? thrown.message : String(thrown);
      auditEvent = 'execution_ambiguous';
    } else if (outcome && outcome.ok) {
      finalState = 'confirmed';
      failureReason = null;
      externalEventId = outcome.externalId ?? null;
      auditEvent = 'confirmed';
    } else {
      finalState = 'failed';
      failureReason = outcome ? outcome.detail : 'Unknown connector failure.';
      auditEvent = 'failed';
    }
    auditDetail = { detail: failureReason };
    const final: NovaCalendarProtectionProposal = {
      ...current, state: finalState, failureReason, externalEventId,
      activeAttemptId: null, lastTransitionAt: new Date().toISOString(),
    };
    tx.set(ref, final);
    return { status: finalState, proposal: final } as NovaCalendarExecutionOutcome;
  });
  // Audit write happens after the transaction resolves and is awaited
  // before returning (recordAuditEntry is not itself transactional, but
  // the audit trail's own invariant - "every transition has an entry
  // before the caller that triggered it moves on" - still requires this
  // to complete first, not fire-and-forget).
  if (auditEvent) {
    await recordAuditEntry(db, uid, proposalId, auditEvent, auditDetail);
  }
  return finalOutcome;
}

export async function retryCalendarProtectionExecution(db: FirestoreLike, uid: string, proposalId: string): Promise<NovaCalendarProtectionProposal> {
  const snap = await proposalDoc(db, uid, proposalId).get();
  if (!snap.exists) throw new Error('No such calendar protection proposal.');
  const proposal = snap.data() as NovaCalendarProtectionProposal;
  // Deliberately `!== 'failed'` only - an 'ambiguous' outcome is NOT a
  // 'failed' one, so it is structurally excluded from retry here. See
  // this file's own header on why that is the intended, conservative
  // behaviour rather than a gap to close.
  if (proposal.state !== 'failed') throw new Error('Can only retry a failed proposal.');
  if (proposal.retryCount >= CALENDAR_PROTECTION_MAX_RETRIES) {
    throw new Error(`This proposal has already been retried ${proposal.retryCount} times, the maximum allowed (${CALENDAR_PROTECTION_MAX_RETRIES}). It cannot be retried automatically again.`);
  }
  const next: NovaCalendarProtectionProposal = {
    ...proposal, state: 'approved', retryCount: proposal.retryCount + 1, failureReason: null,
    lastTransitionAt: new Date().toISOString(),
    approvalExpiresAt: new Date(Date.now() + CALENDAR_PROTECTION_APPROVAL_TTL_MS).toISOString(),
  };
  await proposalDoc(db, uid, proposalId).set(next);
  await recordAuditEntry(db, uid, proposalId, 'retry_requested', { retryCount: next.retryCount });
  return next;
}

/**
 * Calendar event deletion is a genuinely real, reversible operation for
 * this category - undo is always offered, never assumed unavailable. The
 * confirmed -> undoing transition is claimed inside a transaction for the
 * same reason execute's approved -> executing transition is: two
 * concurrent undo calls must not both invoke the connector.
 */
export async function undoCalendarProtectionProposal(
  db: FirestoreLike,
  uid: string,
  proposalId: string,
  // `null` in production, same reasoning as executeCalendarProtectionProposal's
  // own connector parameter - no proposal can reach 'confirmed' while
  // execution stays disabled, so this is never dereferenced in practice.
  connector: NovaExternalConnector | null,
): Promise<NovaCalendarProtectionProposal> {
  const ref = proposalDoc(db, uid, proposalId);
  const initialSnap = await ref.get();
  if (!initialSnap.exists) throw new Error('No such calendar protection proposal.');
  const initial = initialSnap.data() as NovaCalendarProtectionProposal;
  if (initial.state === 'undone') return initial; // idempotent replay
  if (initial.state !== 'confirmed') throw new Error('Can only undo a confirmed proposal.');
  if (!initial.externalEventId) {
    throw new Error('No external event id was recorded for this proposal - undo cannot be attempted without proof of what was actually created.');
  }
  if (!connector) throw new Error('No connector available to perform undo.');
  if (!db.runTransaction) throw new CalendarProtectionTransactionSupportRequiredError();

  const attemptId = crypto.randomUUID();
  const claim = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const proposal = snap.data() as NovaCalendarProtectionProposal;
    if (proposal.state === 'undone') return { kind: 'already_undone' as const, proposal };
    if (proposal.state === 'undoing') return { kind: 'already_undoing' as const, proposal };
    if (proposal.state !== 'confirmed') throw new Error('Can only undo a confirmed proposal.');
    const claimed: NovaCalendarProtectionProposal = { ...proposal, state: 'undoing', activeAttemptId: attemptId, lastTransitionAt: new Date().toISOString() };
    tx.set(ref, claimed);
    return { kind: 'claimed' as const, proposal: claimed };
  });

  if (claim.kind !== 'claimed') return claim.proposal;

  const request: NovaExternalConnectorRequest = { category: 'calendar_protection', proposedChangeDescription: claim.proposal.title };
  let undoFailed = false;
  try {
    const result = await connector.undo(request);
    undoFailed = !result.ok;
  } catch {
    undoFailed = true;
  }

  let alreadySettled = false;
  const final = await requireTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const current = snap.data() as NovaCalendarProtectionProposal;
    if (current.activeAttemptId !== attemptId) { alreadySettled = true; return current; }
    const next: NovaCalendarProtectionProposal = {
      ...current,
      state: undoFailed ? 'confirmed' : 'undone',
      activeAttemptId: null,
      lastTransitionAt: new Date().toISOString(),
    };
    tx.set(ref, next);
    return next;
  });
  if (!alreadySettled) {
    await recordAuditEntry(db, uid, proposalId, undoFailed ? 'undo_failed' : 'undone', {});
  }
  if (!alreadySettled && undoFailed) {
    throw new Error('The connector reported that undo did not succeed - the proposal remains confirmed.');
  }
  return final;
}
