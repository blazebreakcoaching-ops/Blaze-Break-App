// Nova Take the Load - Calendar Protection workflow (Phase 5C, directive
// §5; hardened Phase 5D, directive §3/§4). The first complete Agentic
// Nova workflow, chosen because Blaze Break already has a real, operational
// Google Calendar READ integration (calendar-workload-defence-engine.ts,
// src/lib/calendar-signals.ts) to identify pressure from.
//
// AUDIT FINDING THIS FILE IS BUILT AROUND (recorded in Phase 5C's
// delivery report): `signInWithCalendar` (src/lib/auth.tsx) already
// requests `calendar.events` (a WRITE-capable scope) at sign-in time,
// for every user who has ever connected their calendar through
// CalendarDefenseView.tsx/MicroRecovery.tsx/IntegrationsDashboard.tsx -
// this is a real, already-granted OAuth scope, not a hypothetical future
// one.
//
// Phase 5J CORRECTION of this comment's own prior claim: an earlier
// version said "NO code anywhere in this codebase has ever made a write
// call with it" - that was already false when written. Boundary
// Autopilot's `declineCalendarEvent` (src/lib/boundary-autopilot.ts) is
// a real, live, already-shipped feature that PATCHes a calendar event's
// attendee response using this exact client-held scope - a genuine
// write, reachable today from App.tsx's live navigation. That write is
// unrelated to Calendar Protection's own category and does not use any
// function in this file; it simply means the broader claim "this scope
// has never been used for a write" was never true. See
// NOVA_PHASE5J_PILOT_SAFETY_REPORT.md for the full scope audit (which
// also removed the separate, genuinely redundant `calendar.readonly`
// scope auth.tsx used to request alongside `calendar.events`).
//
// What remains true, and is what this file's own kill-switch exists for:
// `CALENDAR_PROTECTION_EXECUTION_ENABLED` below is hardcoded `false` -
// the directive's own instruction ("keep the execution path disabled...
// without separate explicit authorisation") is enforced structurally:
// `executeCalendarProtectionProposal` checks this flag BEFORE ever
// calling a connector, real or fake, in production code, regardless of
// what other, unrelated features in this codebase do with their own
// separately-scoped client-held tokens. Only this file's own test suite
// flips it, through a loudly-named test-only override, to exercise the
// execution path against the fake connector contract
// (nova-take-the-load-connector-contract.ts) - never a real Google
// Calendar write.
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
//  - Phase 5J, directive §4: `executeCalendarProtectionProposal` checks
//    pilot eligibility (nova-calendar-pilot-eligibility.ts) immediately
//    after the kill switch and transaction-support checks, before any
//    per-proposal state is touched - see that file's own header for the
//    full five-layer precedence (global kill switch, pilot eligibility,
//    provider connection, allowCalendarActions, this proposal's own
//    approval). Modifying a proposal (Phase 5J, directive §2) is a
//    further, independent check layered on top of all five: a proposal's
//    own `supersededBy` field, once set, blocks its approval from being
//    acted on by execute/approve/retry regardless of what any of those
//    five layers would otherwise allow.
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
import { isCalendarProtectionPilotEligible } from './nova-calendar-pilot-eligibility';
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
  /**
   * Phase 5J, directive §2 - the proposal this one REPLACES, if it was
   * created via Modify rather than from scratch. Null for an ordinary
   * fresh proposal. Purely a backward-pointing audit link - it does not
   * itself change this proposal's own authorisation.
   */
  supersedes: string | null;
  /**
   * Phase 5J, directive §2 - set the moment ANOTHER proposal supersedes
   * THIS one (via Modify). Once set, this proposal's own approval - even
   * a still-valid, unexpired one - can never again authorise an execute,
   * an undo-eligible confirm, or a retry: see
   * `NON_SUPERSEDABLE_STATES`/the `supersedes` guard inside
   * `executeCalendarProtectionProposal`, `recordCalendarProtectionApproval`,
   * and `retryCalendarProtectionExecution`. Deliberately a SEPARATE field
   * from `state` - `state` keeps recording the truthful history of what
   * this proposal actually was (e.g. "approved"), while this field is the
   * authoritative, independent gate that an already-approved state can no
   * longer be acted on. A proposal can be superseded at most once - this
   * is never overwritten after being set.
   */
  supersededBy: string | null;
}

/**
 * States a proposal can be superseded FROM (directive §2's "Modify").
 * Deliberately excludes every state where something real has already
 * happened, or might still be happening, or is genuinely unknown whether
 * it happened - `confirmed`/`executing`/`undoing`/`undone` because the
 * real world has already been (or is being) touched, and `ambiguous`
 * because whether it was touched is not yet known - walking away from an
 * ambiguous proposal via Modify, before reconciliation ever resolves it,
 * would let a real, unresolved external action go permanently
 * unreconciled. Every other state - `prepared`, `awaiting_approval`,
 * `approved`, `declined`, `failed` - represents a point where nothing
 * real has happened yet (or, for `declined`/`failed`, nothing real ever
 * will from that specific proposal), so replacing it is always safe.
 */
const NON_SUPERSEDABLE_STATES: ReadonlySet<NovaCalendarProtectionState> = new Set([
  'confirmed', 'executing', 'undoing', 'undone', 'ambiguous',
]);

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
 *
 * `options.supersedesProposalId` (Phase 5J, directive §2) - set when this
 * proposal is being created by "Modify" against an earlier one. When
 * given, the ORIGINAL proposal's `supersededBy` is set to this new
 * proposal's id in the SAME Firestore transaction that creates this new
 * proposal - either both happen, or neither does. The two writes are
 * forced through the real transaction's own optimistic-concurrency
 * conflict detection, which is what actually makes "modify this proposal
 * while someone else concurrently executes/modifies the very same one"
 * resolve safely: whichever transaction's read of the original commits
 * first wins, and the loser re-reads the now-current state and reacts to
 * it (either refusing to supersede an already-superseded/already-
 * executing original, or - for a concurrent execute - seeing
 * `supersededBy` already set and refusing to execute). Throws a
 * `cannot_supersede: ...`-prefixed Error (matching this function's
 * existing `invalid_time_range: ...` convention) rather than returning a
 * union type, so every existing caller that never passes `options` keeps
 * its exact current return shape.
 */
export async function prepareCalendarProtectionProposal(
  db: FirestoreLike,
  uid: string,
  idempotencyKey: string,
  change: { startIso: string; endIso: string; title: string },
  options?: { supersedesProposalId?: string },
): Promise<NovaCalendarProtectionProposal> {
  const timeValidation = validateCalendarChangeTimes(change);
  if (timeValidation.ok === false) {
    throw new Error(`invalid_time_range: ${timeValidation.reason}`);
  }
  // Idempotency lookup by doc-id convention (derived deterministically
  // from the idempotency key) rather than a Firestore query, so this
  // works identically against any FirestoreLike implementation,
  // including simple test doubles with no query engine. Checked BEFORE
  // any supersession work, so a retried request with the same key never
  // attempts to supersede the original a second time.
  const proposalId = `cpp_${idempotencyKey}`;
  const newRef = proposalDoc(db, uid, proposalId);
  const existing = await newRef.get();
  if (existing.exists) {
    return existing.data() as NovaCalendarProtectionProposal;
  }
  const approvalFingerprint = computeApprovalFingerprint({ proposalId, ...change });
  const now = new Date().toISOString();
  const supersedesProposalId = options?.supersedesProposalId ?? null;
  const proposal: NovaCalendarProtectionProposal = {
    proposalId, idempotencyKey, uid, state: 'prepared',
    startIso: change.startIso, endIso: change.endIso, title: change.title,
    approvalFingerprint, failureReason: null, retryCount: 0,
    approvedAt: null, approvalExpiresAt: null, activeAttemptId: null,
    externalEventId: null, lastTransitionAt: now,
    supersedes: supersedesProposalId, supersededBy: null,
  };

  if (supersedesProposalId) {
    if (supersedesProposalId === proposalId) {
      throw new Error('cannot_supersede: a proposal cannot supersede itself.');
    }
    const originalRef = proposalDoc(db, uid, supersedesProposalId);
    await requireTransaction(db, async (tx) => {
      const originalSnap = await tx.get(originalRef);
      if (!originalSnap.exists) {
        throw new Error('cannot_supersede: the original proposal does not exist.');
      }
      const original = originalSnap.data() as NovaCalendarProtectionProposal;
      if (original.supersededBy) {
        throw new Error('cannot_supersede: this proposal has already been superseded by another.');
      }
      if (NON_SUPERSEDABLE_STATES.has(original.state)) {
        throw new Error(`cannot_supersede: a proposal in state "${original.state}" can no longer be modified.`);
      }
      tx.set(originalRef, { ...original, supersededBy: proposalId, lastTransitionAt: new Date().toISOString() });
      tx.set(newRef, proposal);
    });
    await recordAuditEntry(db, uid, supersedesProposalId, 'superseded', { supersededBy: proposalId });
    await recordAuditEntry(db, uid, proposalId, 'prepared', { startIso: change.startIso, endIso: change.endIso, title: change.title, supersedes: supersedesProposalId });
    return proposal;
  }

  await newRef.set(proposal);
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
  | { status: 'not_awaiting_approval' }
  | { status: 'superseded'; proposal: NovaCalendarProtectionProposal } // Phase 5J, directive §2
  | { status: 'transaction_support_required' };

/**
 * The server-side authorisation gate. `approved: true` ALONE is never
 * sufficient - the caller must also supply the exact `approvalFingerprint`
 * this proposal was prepared with. A caller that approves a DIFFERENT
 * fingerprint than the one actually shown to the user (whether by bug,
 * tampering, or a stale UI) is rejected outright, never partially honoured.
 *
 * Phase 5J, directive §2 - now runs inside a real transaction (previously
 * a plain read-then-write) and checks `supersededBy` before honouring a
 * decision. Without the transaction, a concurrent Modify call that
 * supersedes this exact proposal between this function's own read and
 * write could have its `supersededBy` write silently clobbered by this
 * function's un-transactional `.set()` - the same class of race directive
 * §2 names for execute, just one step earlier in the lifecycle.
 */
export async function recordCalendarProtectionApproval(
  db: FirestoreLike,
  uid: string,
  proposalId: string,
  decision: { approved: boolean; approvalFingerprint: string },
): Promise<NovaCalendarApprovalOutcome> {
  if (!db.runTransaction) {
    return { status: 'transaction_support_required' };
  }
  const ref = proposalDoc(db, uid, proposalId);
  let fingerprintMismatch = false;
  const result = await db.runTransaction(async (tx): Promise<NovaCalendarApprovalOutcome> => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new Error('No such calendar protection proposal.');
    const proposal = snap.data() as NovaCalendarProtectionProposal;
    if (proposal.state !== 'awaiting_approval') return { status: 'not_awaiting_approval' };
    if (proposal.supersededBy) return { status: 'superseded', proposal };
    if (decision.approvalFingerprint !== proposal.approvalFingerprint) {
      fingerprintMismatch = true;
      return { status: 'fingerprint_mismatch' };
    }
    const now = new Date().toISOString();
    const nextState: NovaCalendarProtectionState = decision.approved ? 'approved' : 'declined';
    const next: NovaCalendarProtectionProposal = {
      ...proposal, state: nextState, lastTransitionAt: now,
      approvedAt: decision.approved ? now : null,
      approvalExpiresAt: decision.approved ? new Date(Date.now() + CALENDAR_PROTECTION_APPROVAL_TTL_MS).toISOString() : null,
    };
    tx.set(ref, next);
    return { status: nextState, proposal: next };
  });
  if (fingerprintMismatch) {
    await recordAuditEntry(db, uid, proposalId, 'approval_fingerprint_mismatch', { suppliedFingerprint: decision.approvalFingerprint });
  } else if (result.status === 'approved' || result.status === 'declined') {
    await recordAuditEntry(db, uid, proposalId, result.status, {});
  }
  return result;
}

export type NovaCalendarExecutionOutcome =
  | { status: 'execution_disabled' } // the hardcoded kill-switch - no connector was ever called
  | { status: 'pilot_not_eligible' } // Phase 5J, directive §4 - layer 2: this account is not one of the explicitly chosen pilot accounts
  | { status: 'transaction_support_required' }
  | { status: 'already_executed'; proposal: NovaCalendarProtectionProposal } // idempotent replay - no second connector call
  | { status: 'already_executing'; proposal: NovaCalendarProtectionProposal } // another in-flight attempt currently holds the claim
  | { status: 'ambiguous'; proposal: NovaCalendarProtectionProposal } // the connector call's outcome is genuinely unknown
  | { status: 'approval_expired'; proposal: NovaCalendarProtectionProposal }
  | { status: 'not_approved' }
  | { status: 'superseded'; proposal: NovaCalendarProtectionProposal } // Phase 5J, directive §2 - replaced by a newer proposal via Modify; this approval can no longer authorise anything
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
  // Transaction support is a more fundamental infrastructure capability
  // than pilot eligibility - checked first, before this function ever
  // attempts a Firestore READ (the pilot-eligibility check immediately
  // below) against a `db` that may not support the full feature set this
  // function needs at all.
  if (!db.runTransaction) {
    return { status: 'transaction_support_required' };
  }
  // Phase 5J, directive §4 - layer 2 of the restricted-pilot contract,
  // checked immediately after the global kill switch and the transaction-
  // support check, and before every per-request check below (state,
  // expiry, supersession). See nova-calendar-pilot-eligibility.ts's own
  // header for the full five-layer precedence this sits in. Never
  // reachable in production today since layer 1 above already always
  // short-circuits first - exercised here only via
  // TEST_ONLY_FORCE_EXECUTION_ENABLED.
  if (!(await isCalendarProtectionPilotEligible(db, uid))) {
    return { status: 'pilot_not_eligible' };
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
    // Phase 5J, directive §2 - checked BEFORE the generic not_approved
    // fallthrough below, and inside this same transaction, so a
    // concurrent Modify call that supersedes this exact proposal can
    // never lose the race silently: whichever of this claim or that
    // supersession commits first to Firestore wins, and the other
    // re-reads the now-current document and reacts to it here.
    if (proposal.supersededBy) {
      return { kind: 'short_circuit' as const, outcome: { status: 'superseded', proposal } as NovaCalendarExecutionOutcome };
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

// Phase 5J, directive §2 - now transactional (previously a plain
// read-then-write), for the same reason recordCalendarProtectionApproval
// became transactional: a 'failed' proposal is supersedable, so a
// concurrent Modify call racing against a retry on the exact same
// proposal must not have one silently clobber the other's write.
export async function retryCalendarProtectionExecution(db: FirestoreLike, uid: string, proposalId: string): Promise<NovaCalendarProtectionProposal> {
  return requireTransaction(db, async (tx) => {
    const ref = proposalDoc(db, uid, proposalId);
    const snap = await tx.get(ref);
    if (!snap.exists) throw new Error('No such calendar protection proposal.');
    const proposal = snap.data() as NovaCalendarProtectionProposal;
    if (proposal.supersededBy) {
      throw new Error('This proposal has been superseded by a newer version and can no longer be retried.');
    }
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
    tx.set(ref, next);
    // Firestore transaction update functions must not perform I/O other
    // than through `tx` (the real SDK forbids arbitrary async work inside
    // one, since it may be retried) - the audit write happens after this
    // transaction resolves, same as every other audit write in this file
    // that follows a transactional state change.
    return next;
  }).then(async (next) => {
    await recordAuditEntry(db, uid, proposalId, 'retry_requested', { retryCount: next.retryCount });
    return next;
  });
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

export type NovaCalendarReconciliationOutcome =
  | { status: 'reconciled_confirmed'; proposal: NovaCalendarProtectionProposal }
  | { status: 'reconciled_failed'; proposal: NovaCalendarProtectionProposal }
  | { status: 'still_unknown'; detail: string }
  | { status: 'not_ambiguous' }
  | { status: 'not_executing' }
  | { status: 'not_stuck' };

// How long a proposal can sit in `executing` before it is treated as
// stuck rather than merely slow (Phase 5E, directive §4 - "process
// termination during execution"). `executeCalendarProtectionProposal`'s
// own activeAttemptId claim only ever gets finalised by the SAME process
// invocation that made the claim - if that process is killed (not just
// the connector call throwing, which already produces `ambiguous`)
// between claiming `executing` and finalising, nothing else will ever
// move this proposal on: a second `execute` call short-circuits to
// `already_executing` forever, by design, to avoid two concurrent
// connector calls. Deliberately shorter than the 15-minute approval TTL
// - a real connector call that is still running this long after a crash
// is far less likely than the process simply having died.
export const CALENDAR_PROTECTION_STUCK_EXECUTION_THRESHOLD_MS = 10 * 60 * 1000;

/**
 * Reconciliation for an `ambiguous` proposal (Phase 5E, directive §4) -
 * "do not automatically retry an ambiguous provider operation unless the
 * system can establish that doing so cannot duplicate the action." This
 * function is that establishment step: it takes a caller-supplied `search`
 * function (in practice, `findGoogleCalendarEventByProposalId` from
 * nova-google-calendar-connector.ts, searching by the exact proposal id
 * tagged onto the event at creation time - see that file's own header) and
 * only ever changes the proposal's state when the search gives a genuine
 * answer:
 *  - an event tagged with this proposal id was actually found -> the
 *    connector call DID succeed despite the ambiguous response; move to
 *    `confirmed` with the real externalEventId, so undo can work correctly
 *    against it.
 *  - no such event exists -> the connector call genuinely did not create
 *    anything; move to `failed`, which (unlike `ambiguous`) IS retryable
 *    through the normal retryCalendarProtectionExecution path.
 *  - the search itself could not give a clear answer (a timeout, a
 *    provider error, more than one match) -> no state change at all;
 *    `ambiguous` stays `ambiguous` rather than being guessed at. This is
 *    the one outcome that requires a human to actually look, not another
 *    automatic call.
 *
 * This function is not called from anywhere in server.ts - like the
 * connector it is designed to be used with, it exists as real, tested
 * logic for the day reconciliation is needed for real, not as a currently
 * reachable production code path.
 */
export async function reconcileAmbiguousCalendarProtectionProposal(
  db: FirestoreLike,
  uid: string,
  proposalId: string,
  search: (proposalId: string) => Promise<{ status: 'found'; eventId: string } | { status: 'not_found' } | { status: 'unknown'; detail: string }>,
): Promise<NovaCalendarReconciliationOutcome> {
  const snap = await proposalDoc(db, uid, proposalId).get();
  if (!snap.exists) throw new Error('No such calendar protection proposal.');
  const proposal = snap.data() as NovaCalendarProtectionProposal;
  if (proposal.state !== 'ambiguous') return { status: 'not_ambiguous' };

  const searchResult = await search(proposal.proposalId);

  if (searchResult.status === 'unknown') {
    await recordAuditEntry(db, uid, proposalId, 'reconciliation_inconclusive', { detail: searchResult.detail });
    return { status: 'still_unknown', detail: searchResult.detail };
  }

  const ref = proposalDoc(db, uid, proposalId);
  const final = await requireTransaction(db, async (tx) => {
    const current = (await tx.get(ref)).data() as NovaCalendarProtectionProposal;
    // Re-checked inside the transaction - another reconciliation attempt,
    // or a fresh retry, could have already moved this proposal on.
    if (current.state !== 'ambiguous') return current;
    const next: NovaCalendarProtectionProposal = searchResult.status === 'found'
      ? { ...current, state: 'confirmed', externalEventId: searchResult.eventId, failureReason: null, lastTransitionAt: new Date().toISOString() }
      : { ...current, state: 'failed', failureReason: 'Reconciliation found no matching event - the original attempt did not actually create anything.', lastTransitionAt: new Date().toISOString() };
    tx.set(ref, next);
    return next;
  });

  if (final.state === proposal.state) {
    // Someone else already resolved this between our read and our write.
    return { status: 'not_ambiguous' };
  }

  await recordAuditEntry(db, uid, proposalId, searchResult.status === 'found' ? 'reconciled_confirmed' : 'reconciled_failed', {});
  return searchResult.status === 'found'
    ? { status: 'reconciled_confirmed', proposal: final }
    : { status: 'reconciled_failed', proposal: final };
}

/**
 * Reconciliation for a proposal stuck in `executing` (Phase 5E, directive
 * §4 - "process termination during execution"). This is a DIFFERENT
 * failure mode from `ambiguous`: `ambiguous` means the connector call
 * itself returned or threw and the ORIGINAL attempt's own finalising
 * transaction recorded that outcome. A proposal stuck in `executing` means
 * the process that claimed it (via `activeAttemptId`) never got that far at
 * all - it was killed mid-flight - so nothing has ever finalised this
 * attempt, and no amount of waiting or retrying through the normal routes
 * will either: a second `execute` call short-circuits to
 * `already_executing` forever, by design, specifically so two live
 * connector calls can never race. This function is the only way such a
 * proposal can ever move again.
 *
 * Same conservative shape as `reconcileAmbiguousCalendarProtectionProposal`:
 * only ever changes state on a genuine search answer, and only once the
 * claim has been stale for at least
 * `CALENDAR_PROTECTION_STUCK_EXECUTION_THRESHOLD_MS` - a proposal that
 * claimed `executing` a few seconds ago is far more likely still
 * genuinely in flight than crashed.
 */
export async function reconcileStuckExecutingCalendarProtectionProposal(
  db: FirestoreLike,
  uid: string,
  proposalId: string,
  search: (proposalId: string) => Promise<{ status: 'found'; eventId: string } | { status: 'not_found' } | { status: 'unknown'; detail: string }>,
): Promise<NovaCalendarReconciliationOutcome> {
  const ref = proposalDoc(db, uid, proposalId);
  const snap = await ref.get();
  if (!snap.exists) throw new Error('No such calendar protection proposal.');
  const proposal = snap.data() as NovaCalendarProtectionProposal;
  if (proposal.state !== 'executing') return { status: 'not_executing' };
  const staleForMs = Date.now() - new Date(proposal.lastTransitionAt).getTime();
  if (staleForMs < CALENDAR_PROTECTION_STUCK_EXECUTION_THRESHOLD_MS) return { status: 'not_stuck' };

  const searchResult = await search(proposal.proposalId);

  if (searchResult.status === 'unknown') {
    await recordAuditEntry(db, uid, proposalId, 'reconciliation_inconclusive', { detail: searchResult.detail, from: 'stuck_executing' });
    return { status: 'still_unknown', detail: searchResult.detail };
  }

  const final = await requireTransaction(db, async (tx) => {
    const current = (await tx.get(ref)).data() as NovaCalendarProtectionProposal;
    // Re-checked inside the transaction - the original attempt could have
    // finalised (or a prior reconciliation already resolved this) between
    // our read above and this write.
    if (current.state !== 'executing') return current;
    const next: NovaCalendarProtectionProposal = searchResult.status === 'found'
      ? { ...current, state: 'confirmed', externalEventId: searchResult.eventId, failureReason: null, activeAttemptId: null, lastTransitionAt: new Date().toISOString() }
      : { ...current, state: 'failed', failureReason: 'The attempt that claimed this never finished and no matching event was found - safe to retry.', activeAttemptId: null, lastTransitionAt: new Date().toISOString() };
    tx.set(ref, next);
    return next;
  });

  if (final.state === proposal.state) {
    return { status: 'not_executing' };
  }

  await recordAuditEntry(db, uid, proposalId, searchResult.status === 'found' ? 'reconciled_confirmed' : 'reconciled_failed', { from: 'stuck_executing' });
  return searchResult.status === 'found'
    ? { status: 'reconciled_confirmed', proposal: final }
    : { status: 'reconciled_failed', proposal: final };
}
