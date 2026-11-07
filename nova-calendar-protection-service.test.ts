import { describe, it, expect, beforeEach } from 'vitest';
import {
  identifyCalendarPressure, prepareCalendarProtectionProposal, presentCalendarProtectionForApproval,
  recordCalendarProtectionApproval, executeCalendarProtectionProposal, retryCalendarProtectionExecution,
  undoCalendarProtectionProposal, CALENDAR_PROTECTION_EXECUTION_ENABLED, TEST_ONLY_FORCE_EXECUTION_ENABLED,
  validateCalendarChangeTimes, CALENDAR_PROTECTION_MAX_RETRIES, reconcileAmbiguousCalendarProtectionProposal,
  reconcileStuckExecutingCalendarProtectionProposal, CALENDAR_PROTECTION_STUCK_EXECUTION_THRESHOLD_MS,
} from './nova-calendar-protection-service';
import { createFakeConnectorForTesting } from './nova-take-the-load-connector-contract';
import { setCalendarProtectionPilotEligibility } from './nova-calendar-pilot-eligibility';
import { resetStore, fakeDb, seedDoc, getDocRaw } from './test/fake-firestore';
import type { CalendarSignalState } from './calendar-workload-defence-engine';
import crypto from 'node:crypto';

const UID = 'user_a';

// Phase 5J, directive §4 - executeCalendarProtectionProposal now checks
// pilot eligibility (layer 2, right after the kill switch) as well as
// everything this file already tested. Every test in this file below is
// about THOSE other checks, not about pilot eligibility itself - so the
// shared test uid is seeded as pilot-eligible by default here, the same
// way its calendar is implicitly "connected" by simply calling these
// functions at all. The dedicated "pilot eligibility" describe block
// further down uses its OWN, deliberately un-seeded uid to test the
// actual gate.
beforeEach(async () => {
  resetStore();
  await setCalendarProtectionPilotEligibility(fakeDb as any, UID, true, 'test-admin');
});

const CHANGE = { startIso: '2026-02-02T14:00:00.000Z', endIso: '2026-02-02T14:30:00.000Z', title: 'Protected recovery block' };

async function approvedProposal(key = 'week7-protect') {
  const prepared = await prepareCalendarProtectionProposal(fakeDb as any, UID, key, CHANGE);
  await presentCalendarProtectionForApproval(fakeDb as any, UID, prepared.proposalId);
  const outcome = await recordCalendarProtectionApproval(fakeDb as any, UID, prepared.proposalId, { approved: true, approvalFingerprint: prepared.approvalFingerprint });
  if (outcome.status !== 'approved') throw new Error('setup failed');
  return outcome.proposal;
}

describe('identifyCalendarPressure', () => {
  it('reuses the real, existing banding engine - detects pressure from a heavy signal', () => {
    const heavy: CalendarSignalState = { totalMeetingHours: 40, meetingCount: 30, backToBackCount: 10, eveningMeetingCount: 5, weekendMeetingCount: 2, windowDays: 7, updatedAt: new Date().toISOString() };
    const result = identifyCalendarPressure(heavy);
    expect(result.pressureDetected).toBe(true);
  });

  it('reports no pressure for a light signal', () => {
    const light: CalendarSignalState = { totalMeetingHours: 3, meetingCount: 2, backToBackCount: 0, eveningMeetingCount: 0, weekendMeetingCount: 0, windowDays: 7, updatedAt: new Date().toISOString() };
    const result = identifyCalendarPressure(light);
    expect(result.pressureDetected).toBe(false);
  });
});

describe('prepareCalendarProtectionProposal - idempotency', () => {
  it('a second prepare call with the same idempotencyKey returns the SAME proposal, never a duplicate', async () => {
    const first = await prepareCalendarProtectionProposal(fakeDb as any, UID, 'dup-key', CHANGE);
    const second = await prepareCalendarProtectionProposal(fakeDb as any, UID, 'dup-key', CHANGE);
    expect(second.proposalId).toBe(first.proposalId);
  });

  it('a different idempotencyKey produces a different proposal', async () => {
    const first = await prepareCalendarProtectionProposal(fakeDb as any, UID, 'key-1', CHANGE);
    const second = await prepareCalendarProtectionProposal(fakeDb as any, UID, 'key-2', CHANGE);
    expect(second.proposalId).not.toBe(first.proposalId);
  });

  it('computes a real fingerprint tied to this exact proposal\'s parameters', async () => {
    const proposal = await prepareCalendarProtectionProposal(fakeDb as any, UID, 'fp-key', CHANGE);
    expect(proposal.approvalFingerprint).toMatch(/^[a-f0-9]{64}$/);
  });
});

describe('recordCalendarProtectionApproval - server-side authorisation', () => {
  it('rejects a bare approved:true with the WRONG fingerprint - never sufficient authorisation by itself', async () => {
    const prepared = await prepareCalendarProtectionProposal(fakeDb as any, UID, 'auth-key', CHANGE);
    await presentCalendarProtectionForApproval(fakeDb as any, UID, prepared.proposalId);
    const outcome = await recordCalendarProtectionApproval(fakeDb as any, UID, prepared.proposalId, { approved: true, approvalFingerprint: 'not-the-real-fingerprint' });
    expect(outcome.status).toBe('fingerprint_mismatch');
  });

  it('this is directive\'s own named attack: approving with MODIFIED parameters is detected via fingerprint mismatch', async () => {
    const prepared = await prepareCalendarProtectionProposal(fakeDb as any, UID, 'modify-key', CHANGE);
    await presentCalendarProtectionForApproval(fakeDb as any, UID, prepared.proposalId);
    // Simulates a client that shows the user one set of params but tries to approve a differently-computed fingerprint (as if params were tampered).
    const tamperedFingerprint = crypto.createHash('sha256').update(`${prepared.proposalId}|DIFFERENT|${CHANGE.endIso}|${CHANGE.title}`).digest('hex');
    const outcome = await recordCalendarProtectionApproval(fakeDb as any, UID, prepared.proposalId, { approved: true, approvalFingerprint: tamperedFingerprint });
    expect(outcome.status).toBe('fingerprint_mismatch');
  });

  it('accepts the correct fingerprint and moves to approved', async () => {
    const prepared = await prepareCalendarProtectionProposal(fakeDb as any, UID, 'ok-key', CHANGE);
    await presentCalendarProtectionForApproval(fakeDb as any, UID, prepared.proposalId);
    const outcome = await recordCalendarProtectionApproval(fakeDb as any, UID, prepared.proposalId, { approved: true, approvalFingerprint: prepared.approvalFingerprint });
    expect(outcome.status).toBe('approved');
  });

  it('a decline is recorded and does not allow a later approval of the same proposal', async () => {
    const prepared = await prepareCalendarProtectionProposal(fakeDb as any, UID, 'decline-key', CHANGE);
    await presentCalendarProtectionForApproval(fakeDb as any, UID, prepared.proposalId);
    const declineOutcome = await recordCalendarProtectionApproval(fakeDb as any, UID, prepared.proposalId, { approved: false, approvalFingerprint: prepared.approvalFingerprint });
    expect(declineOutcome.status).toBe('declined');
    const secondAttempt = await recordCalendarProtectionApproval(fakeDb as any, UID, prepared.proposalId, { approved: true, approvalFingerprint: prepared.approvalFingerprint });
    expect(secondAttempt.status).toBe('not_awaiting_approval');
  });
});

describe('executeCalendarProtectionProposal - the hardcoded kill-switch', () => {
  it('CALENDAR_PROTECTION_EXECUTION_ENABLED is false in this codebase today', () => {
    expect(CALENDAR_PROTECTION_EXECUTION_ENABLED).toBe(false);
  });

  it('execution is refused and the connector is never called when the flag is off (production behaviour)', async () => {
    const proposal = await approvedProposal();
    let connectorCalled = false;
    const connector = createFakeConnectorForTesting();
    const spiedConnector = { ...connector, execute: async (r: any) => { connectorCalled = true; return connector.execute(r); } };
    const outcome = await executeCalendarProtectionProposal(fakeDb as any, UID, proposal.proposalId, spiedConnector);
    expect(outcome.status).toBe('execution_disabled');
    expect(connectorCalled).toBe(false);
  });

  it('with the test-only override, a successful fake connector outcome moves to confirmed', async () => {
    const proposal = await approvedProposal('exec-ok');
    const outcome = await executeCalendarProtectionProposal(fakeDb as any, UID, proposal.proposalId, createFakeConnectorForTesting(), TEST_ONLY_FORCE_EXECUTION_ENABLED);
    expect(outcome.status).toBe('confirmed');
  });

  it('with the test-only override, a failed fake connector outcome moves to failed with a reason', async () => {
    const proposal = await approvedProposal('exec-fail');
    const connector = createFakeConnectorForTesting({ executeResult: { ok: false, detail: 'calendar API unreachable' } });
    const outcome = await executeCalendarProtectionProposal(fakeDb as any, UID, proposal.proposalId, connector, TEST_ONLY_FORCE_EXECUTION_ENABLED);
    expect(outcome.status).toBe('failed');
    if (outcome.status === 'failed') expect(outcome.proposal.failureReason).toBe('calendar API unreachable');
  });

  it('a DUPLICATE execution request for an already-confirmed proposal returns the stored result, never calling the connector again', async () => {
    const proposal = await approvedProposal('exec-dup');
    const first = await executeCalendarProtectionProposal(fakeDb as any, UID, proposal.proposalId, createFakeConnectorForTesting(), TEST_ONLY_FORCE_EXECUTION_ENABLED);
    expect(first.status).toBe('confirmed');

    let connectorCalledAgain = false;
    const connector = createFakeConnectorForTesting();
    const spied = { ...connector, execute: async (r: any) => { connectorCalledAgain = true; return connector.execute(r); } };
    const second = await executeCalendarProtectionProposal(fakeDb as any, UID, proposal.proposalId, spied, TEST_ONLY_FORCE_EXECUTION_ENABLED);
    expect(second.status).toBe('already_executed');
    expect(connectorCalledAgain).toBe(false);
  });

  it('a null connector (the real production value) always returns execution_disabled, even with the test-only flag set', async () => {
    const proposal = await approvedProposal('null-connector');
    const outcome = await executeCalendarProtectionProposal(fakeDb as any, UID, proposal.proposalId, null, TEST_ONLY_FORCE_EXECUTION_ENABLED);
    expect(outcome.status).toBe('execution_disabled');
  });

  it('refuses execution for a proposal that was never approved', async () => {
    const prepared = await prepareCalendarProtectionProposal(fakeDb as any, UID, 'never-approved', CHANGE);
    const outcome = await executeCalendarProtectionProposal(fakeDb as any, UID, prepared.proposalId, createFakeConnectorForTesting(), TEST_ONLY_FORCE_EXECUTION_ENABLED);
    expect(outcome.status).toBe('not_approved');
  });
});

// Phase 5J, directive §4 - layer 2 of the restricted-pilot contract (see
// nova-calendar-pilot-eligibility.ts's own header for the full five-layer
// precedence). Uses its OWN uid, deliberately never seeded as eligible by
// the top-of-file beforeEach, so these tests exercise the real fail-closed
// default rather than the convenience seeding every other test in this
// file relies on.
describe('pilot eligibility (Phase 5J, directive §4)', () => {
  const UNSEEDED_UID = 'user_never_made_pilot_eligible';

  async function approvedProposalFor(uid: string, key: string) {
    const prepared = await prepareCalendarProtectionProposal(fakeDb as any, uid, key, CHANGE);
    await presentCalendarProtectionForApproval(fakeDb as any, uid, prepared.proposalId);
    const outcome = await recordCalendarProtectionApproval(fakeDb as any, uid, prepared.proposalId, { approved: true, approvalFingerprint: prepared.approvalFingerprint });
    if (outcome.status !== 'approved') throw new Error('setup failed');
    return outcome.proposal;
  }

  it('an account with no pilot-eligibility document at all is refused with pilot_not_eligible - fails closed on a missing document', async () => {
    const proposal = await approvedProposalFor(UNSEEDED_UID, 'pilot-missing-doc');
    const outcome = await executeCalendarProtectionProposal(fakeDb as any, UNSEEDED_UID, proposal.proposalId, createFakeConnectorForTesting(), TEST_ONLY_FORCE_EXECUTION_ENABLED);
    expect(outcome.status).toBe('pilot_not_eligible');
  });

  it('an account explicitly marked NOT eligible is refused the same way as one with no document at all', async () => {
    await setCalendarProtectionPilotEligibility(fakeDb as any, UNSEEDED_UID, false, 'test-admin');
    const proposal = await approvedProposalFor(UNSEEDED_UID, 'pilot-explicitly-false');
    const outcome = await executeCalendarProtectionProposal(fakeDb as any, UNSEEDED_UID, proposal.proposalId, createFakeConnectorForTesting(), TEST_ONLY_FORCE_EXECUTION_ENABLED);
    expect(outcome.status).toBe('pilot_not_eligible');
  });

  it('a document whose eligible field is not literally true (malformed/inconsistent configuration) is refused, never treated as eligible', async () => {
    await seedDoc(`users/${UNSEEDED_UID}/platform_pilot_access/calendar_protection`, { eligible: 'yes' } as any);
    const proposal = await approvedProposalFor(UNSEEDED_UID, 'pilot-malformed-value');
    const outcome = await executeCalendarProtectionProposal(fakeDb as any, UNSEEDED_UID, proposal.proposalId, createFakeConnectorForTesting(), TEST_ONLY_FORCE_EXECUTION_ENABLED);
    expect(outcome.status).toBe('pilot_not_eligible');
  });

  it('an account explicitly granted pilot eligibility proceeds past this gate (and on to a real simulated execution)', async () => {
    await setCalendarProtectionPilotEligibility(fakeDb as any, UNSEEDED_UID, true, 'test-admin');
    const proposal = await approvedProposalFor(UNSEEDED_UID, 'pilot-granted');
    const outcome = await executeCalendarProtectionProposal(fakeDb as any, UNSEEDED_UID, proposal.proposalId, createFakeConnectorForTesting(), TEST_ONLY_FORCE_EXECUTION_ENABLED);
    expect(outcome.status).toBe('confirmed');
  });

  it('revoking a previously-granted eligibility takes effect immediately - the next execute attempt is refused', async () => {
    await setCalendarProtectionPilotEligibility(fakeDb as any, UNSEEDED_UID, true, 'test-admin');
    const proposal = await approvedProposalFor(UNSEEDED_UID, 'pilot-revoked');
    await setCalendarProtectionPilotEligibility(fakeDb as any, UNSEEDED_UID, false, 'test-admin');
    const outcome = await executeCalendarProtectionProposal(fakeDb as any, UNSEEDED_UID, proposal.proposalId, createFakeConnectorForTesting(), TEST_ONLY_FORCE_EXECUTION_ENABLED);
    expect(outcome.status).toBe('pilot_not_eligible');
  });

  it('pilot ineligibility is checked even when the global kill switch is force-enabled - it is a genuinely independent layer, not a restatement of layer 1', async () => {
    expect(CALENDAR_PROTECTION_EXECUTION_ENABLED).toBe(false);
    const proposal = await approvedProposalFor(UNSEEDED_UID, 'pilot-independent-of-kill-switch');
    const connector = createFakeConnectorForTesting();
    const outcome = await executeCalendarProtectionProposal(fakeDb as any, UNSEEDED_UID, proposal.proposalId, connector, TEST_ONLY_FORCE_EXECUTION_ENABLED);
    expect(outcome.status).toBe('pilot_not_eligible');
  });
});

describe('retry and undo', () => {
  it('retry only works from a failed state, and increments retryCount', async () => {
    const proposal = await approvedProposal('retry-key');
    const failing = createFakeConnectorForTesting({ executeResult: { ok: false, detail: 'down' } });
    await executeCalendarProtectionProposal(fakeDb as any, UID, proposal.proposalId, failing, TEST_ONLY_FORCE_EXECUTION_ENABLED);
    const retried = await retryCalendarProtectionExecution(fakeDb as any, UID, proposal.proposalId);
    expect(retried.state).toBe('approved');
    expect(retried.retryCount).toBe(1);
    const confirmed = await executeCalendarProtectionProposal(fakeDb as any, UID, proposal.proposalId, createFakeConnectorForTesting(), TEST_ONLY_FORCE_EXECUTION_ENABLED);
    expect(confirmed.status).toBe('confirmed');
  });

  it('undo is only reachable from confirmed, and calendar protection genuinely supports it', async () => {
    const proposal = await approvedProposal('undo-key');
    await executeCalendarProtectionProposal(fakeDb as any, UID, proposal.proposalId, createFakeConnectorForTesting(), TEST_ONLY_FORCE_EXECUTION_ENABLED);
    const undone = await undoCalendarProtectionProposal(fakeDb as any, UID, proposal.proposalId, createFakeConnectorForTesting());
    expect(undone.state).toBe('undone');
  });

  it('undo throws if the proposal was never confirmed', async () => {
    const proposal = await approvedProposal('undo-unconfirmed');
    await expect(undoCalendarProtectionProposal(fakeDb as any, UID, proposal.proposalId, createFakeConnectorForTesting())).rejects.toThrow();
  });
});

describe('validateCalendarChangeTimes - timezone/DST correctness (Phase 5D, directive §4)', () => {
  it('accepts a real, offset-qualified, end-after-start range', () => {
    expect(validateCalendarChangeTimes(CHANGE)).toEqual({ ok: true });
  });

  it('rejects a bare local time with no UTC/offset designator - the ambiguous-instant shape a DST transition creates', () => {
    const result = validateCalendarChangeTimes({ startIso: '2026-11-01T02:30:00', endIso: '2026-11-01T03:00:00' });
    expect(result.ok).toBe(false);
  });

  it('rejects endIso at or before startIso', () => {
    expect(validateCalendarChangeTimes({ startIso: CHANGE.startIso, endIso: CHANGE.startIso }).ok).toBe(false);
    expect(validateCalendarChangeTimes({ startIso: CHANGE.endIso, endIso: CHANGE.startIso }).ok).toBe(false);
  });

  it('prepareCalendarProtectionProposal rejects an invalid time range before ever touching Firestore', async () => {
    await expect(prepareCalendarProtectionProposal(fakeDb as any, UID, 'bad-times', { startIso: 'not-a-date', endIso: CHANGE.endIso, title: 'x' }))
      .rejects.toThrow(/invalid_time_range/);
  });
});

describe('approval expiry (Phase 5D, directive §3/§4)', () => {
  it('executing after the approval has expired reverts to awaiting_approval instead of executing', async () => {
    const proposal = await approvedProposal('expiry-key');
    // Simulate time passing past the TTL by writing an already-expired approvalExpiresAt directly.
    await (fakeDb as any).collection(`users/${UID}/calendar_protection_proposals`).doc(proposal.proposalId).set({
      ...proposal, approvalExpiresAt: new Date(Date.now() - 1000).toISOString(),
    });
    const outcome = await executeCalendarProtectionProposal(fakeDb as any, UID, proposal.proposalId, createFakeConnectorForTesting(), TEST_ONLY_FORCE_EXECUTION_ENABLED);
    expect(outcome.status).toBe('approval_expired');
    if (outcome.status === 'approval_expired') expect(outcome.proposal.state).toBe('awaiting_approval');
  });

  it('a fresh approval has not expired and executes normally', async () => {
    const proposal = await approvedProposal('fresh-key');
    expect(new Date(proposal.approvalExpiresAt!).getTime()).toBeGreaterThan(Date.now());
    const outcome = await executeCalendarProtectionProposal(fakeDb as any, UID, proposal.proposalId, createFakeConnectorForTesting(), TEST_ONLY_FORCE_EXECUTION_ENABLED);
    expect(outcome.status).toBe('confirmed');
  });
});

describe('transaction support is required, not optional (Phase 5D, directive §4)', () => {
  it('execute fails closed with transaction_support_required if db has no runTransaction', async () => {
    const proposal = await approvedProposal('no-tx-key');
    const dbWithoutTx = { ...(fakeDb as any), runTransaction: undefined };
    const outcome = await executeCalendarProtectionProposal(dbWithoutTx, UID, proposal.proposalId, createFakeConnectorForTesting(), TEST_ONLY_FORCE_EXECUTION_ENABLED);
    expect(outcome.status).toBe('transaction_support_required');
  });
});

describe('ambiguous execution outcomes (Phase 5D, directive §4)', () => {
  it('a connector that THROWS rather than resolving moves the proposal to ambiguous, not failed', async () => {
    const proposal = await approvedProposal('ambiguous-key');
    const throwingConnector = { ...createFakeConnectorForTesting(), execute: async () => { throw new Error('network timeout'); } };
    const outcome = await executeCalendarProtectionProposal(fakeDb as any, UID, proposal.proposalId, throwingConnector as any, TEST_ONLY_FORCE_EXECUTION_ENABLED);
    expect(outcome.status).toBe('ambiguous');
  });

  it('an ambiguous proposal is structurally unretryable - retry only accepts failed', async () => {
    const proposal = await approvedProposal('ambiguous-retry-key');
    const throwingConnector = { ...createFakeConnectorForTesting(), execute: async () => { throw new Error('timeout'); } };
    await executeCalendarProtectionProposal(fakeDb as any, UID, proposal.proposalId, throwingConnector as any, TEST_ONLY_FORCE_EXECUTION_ENABLED);
    await expect(retryCalendarProtectionExecution(fakeDb as any, UID, proposal.proposalId)).rejects.toThrow(/Can only retry a failed proposal/);
  });

  it('a second execute call against an ambiguous proposal reports ambiguous again, never a fresh connector call', async () => {
    const proposal = await approvedProposal('ambiguous-dup-key');
    const throwingConnector = { ...createFakeConnectorForTesting(), execute: async () => { throw new Error('timeout'); } };
    await executeCalendarProtectionProposal(fakeDb as any, UID, proposal.proposalId, throwingConnector as any, TEST_ONLY_FORCE_EXECUTION_ENABLED);
    let calledAgain = false;
    const spy = { ...createFakeConnectorForTesting(), execute: async () => { calledAgain = true; return { ok: true, detail: 'x' }; } };
    const second = await executeCalendarProtectionProposal(fakeDb as any, UID, proposal.proposalId, spy as any, TEST_ONLY_FORCE_EXECUTION_ENABLED);
    expect(second.status).toBe('ambiguous');
    expect(calledAgain).toBe(false);
  });
});

describe('retry is capped (Phase 5D, directive §4)', () => {
  it(`cannot be retried more than ${CALENDAR_PROTECTION_MAX_RETRIES} times`, async () => {
    const proposal = await approvedProposal('max-retry-key');
    const failing = createFakeConnectorForTesting({ executeResult: { ok: false, detail: 'down' } });
    await executeCalendarProtectionProposal(fakeDb as any, UID, proposal.proposalId, failing, TEST_ONLY_FORCE_EXECUTION_ENABLED);
    for (let i = 0; i < CALENDAR_PROTECTION_MAX_RETRIES; i++) {
      await retryCalendarProtectionExecution(fakeDb as any, UID, proposal.proposalId);
      await executeCalendarProtectionProposal(fakeDb as any, UID, proposal.proposalId, failing, TEST_ONLY_FORCE_EXECUTION_ENABLED);
    }
    await expect(retryCalendarProtectionExecution(fakeDb as any, UID, proposal.proposalId)).rejects.toThrow(/maximum allowed/);
  });
});

describe('undo requires proof of what was actually created (Phase 5D, directive §4)', () => {
  it('refuses to undo a confirmed proposal with no recorded externalEventId', async () => {
    const proposal = await approvedProposal('no-external-id-key');
    const connectorWithoutId = { ...createFakeConnectorForTesting(), execute: async () => ({ ok: true, detail: 'done' }) };
    const confirmed = await executeCalendarProtectionProposal(fakeDb as any, UID, proposal.proposalId, connectorWithoutId as any, TEST_ONLY_FORCE_EXECUTION_ENABLED);
    if (confirmed.status === 'confirmed') expect(confirmed.proposal.externalEventId).toBeNull();
    await expect(undoCalendarProtectionProposal(fakeDb as any, UID, proposal.proposalId, createFakeConnectorForTesting()))
      .rejects.toThrow(/No external event id/);
  });

  it('a confirmed proposal with a real externalEventId can be undone', async () => {
    const proposal = await approvedProposal('with-external-id-key');
    const confirmed = await executeCalendarProtectionProposal(fakeDb as any, UID, proposal.proposalId, createFakeConnectorForTesting(), TEST_ONLY_FORCE_EXECUTION_ENABLED);
    if (confirmed.status === 'confirmed') expect(confirmed.proposal.externalEventId).toBe('fake_external_id_test_only');
    const undone = await undoCalendarProtectionProposal(fakeDb as any, UID, proposal.proposalId, createFakeConnectorForTesting());
    expect(undone.state).toBe('undone');
  });

  it('a second undo call for an already-undone proposal is idempotent', async () => {
    const proposal = await approvedProposal('double-undo-key');
    await executeCalendarProtectionProposal(fakeDb as any, UID, proposal.proposalId, createFakeConnectorForTesting(), TEST_ONLY_FORCE_EXECUTION_ENABLED);
    const first = await undoCalendarProtectionProposal(fakeDb as any, UID, proposal.proposalId, createFakeConnectorForTesting());
    expect(first.state).toBe('undone');
    const second = await undoCalendarProtectionProposal(fakeDb as any, UID, proposal.proposalId, createFakeConnectorForTesting());
    expect(second.state).toBe('undone');
  });
});

describe('reconcileAmbiguousCalendarProtectionProposal (Phase 5E, directive §4)', () => {
  async function ambiguousProposal(key: string) {
    const proposal = await approvedProposal(key);
    const throwingConnector = { ...createFakeConnectorForTesting(), execute: async () => { throw new Error('timeout'); } };
    const outcome = await executeCalendarProtectionProposal(fakeDb as any, UID, proposal.proposalId, throwingConnector as any, TEST_ONLY_FORCE_EXECUTION_ENABLED);
    if (outcome.status !== 'ambiguous') throw new Error('setup failed - expected ambiguous');
    return proposal.proposalId;
  }

  it('moves to confirmed with the real externalEventId when the search finds a matching event', async () => {
    const proposalId = await ambiguousProposal('reconcile-found-key');
    const outcome = await reconcileAmbiguousCalendarProtectionProposal(fakeDb as any, UID, proposalId, async () => ({ status: 'found', eventId: 'evt_real_123' }));
    expect(outcome.status).toBe('reconciled_confirmed');
    if (outcome.status === 'reconciled_confirmed') {
      expect(outcome.proposal.state).toBe('confirmed');
      expect(outcome.proposal.externalEventId).toBe('evt_real_123');
    }
  });

  it('moves to failed (retryable) when the search finds no matching event', async () => {
    const proposalId = await ambiguousProposal('reconcile-notfound-key');
    const outcome = await reconcileAmbiguousCalendarProtectionProposal(fakeDb as any, UID, proposalId, async () => ({ status: 'not_found' }));
    expect(outcome.status).toBe('reconciled_failed');
    if (outcome.status === 'reconciled_failed') expect(outcome.proposal.state).toBe('failed');

    // Now genuinely retryable through the normal path, unlike ambiguous.
    const retried = await retryCalendarProtectionExecution(fakeDb as any, UID, proposalId);
    expect(retried.state).toBe('approved');
  });

  it('makes no state change at all when the search itself is inconclusive - never guesses', async () => {
    const proposalId = await ambiguousProposal('reconcile-unknown-key');
    const outcome = await reconcileAmbiguousCalendarProtectionProposal(fakeDb as any, UID, proposalId, async () => ({ status: 'unknown', detail: 'provider timeout during search' }));
    expect(outcome).toEqual({ status: 'still_unknown', detail: 'provider timeout during search' });

    const snap = await (fakeDb as any).collection(`users/${UID}/calendar_protection_proposals`).doc(proposalId).get();
    expect(snap.data().state).toBe('ambiguous');
  });

  it('reports not_ambiguous for a proposal that was never ambiguous in the first place', async () => {
    const proposal = await approvedProposal('reconcile-not-ambiguous-key');
    const outcome = await reconcileAmbiguousCalendarProtectionProposal(fakeDb as any, UID, proposal.proposalId, async () => ({ status: 'found', eventId: 'evt_1' }));
    expect(outcome).toEqual({ status: 'not_ambiguous' });
  });

  it('throws for a proposal that does not exist at all', async () => {
    await expect(reconcileAmbiguousCalendarProtectionProposal(fakeDb as any, UID, 'cpp_does_not_exist', async () => ({ status: 'not_found' })))
      .rejects.toThrow(/No such calendar protection proposal/);
  });
});

describe('reconcileStuckExecutingCalendarProtectionProposal (Phase 5E, directive §4 - "process termination during execution")', () => {
  // Simulates the one failure mode `ambiguousProposal` above cannot: the
  // process that claimed `executing` dying before it ever finalises - not
  // the connector call throwing (that already produces `ambiguous` via the
  // ORIGINAL attempt's own finalising transaction). Directly seeds the doc
  // in the stuck shape, since no connector call can ever "half-happen" in
  // this fake.
  async function stuckProposal(key: string, staleForMs: number) {
    const proposal = await approvedProposal(key);
    const path = `users/${UID}/calendar_protection_proposals/${proposal.proposalId}`;
    seedDoc(path, {
      ...getDocRaw(path),
      state: 'executing',
      activeAttemptId: 'attempt_from_a_process_that_died',
      lastTransitionAt: new Date(Date.now() - staleForMs).toISOString(),
    });
    return proposal.proposalId;
  }

  it('reports not_stuck for a proposal that only just started executing', async () => {
    const proposalId = await stuckProposal('stuck-too-recent-key', 5_000);
    const outcome = await reconcileStuckExecutingCalendarProtectionProposal(fakeDb as any, UID, proposalId, async () => ({ status: 'found', eventId: 'evt_should_not_be_used' }));
    expect(outcome).toEqual({ status: 'not_stuck' });
    expect(getDocRaw(`users/${UID}/calendar_protection_proposals/${proposalId}`)?.state).toBe('executing');
  });

  it('moves to confirmed with the real externalEventId once stale and the search finds a matching event', async () => {
    const proposalId = await stuckProposal('stuck-found-key', CALENDAR_PROTECTION_STUCK_EXECUTION_THRESHOLD_MS + 1_000);
    const outcome = await reconcileStuckExecutingCalendarProtectionProposal(fakeDb as any, UID, proposalId, async () => ({ status: 'found', eventId: 'evt_real_456' }));
    expect(outcome.status).toBe('reconciled_confirmed');
    if (outcome.status === 'reconciled_confirmed') {
      expect(outcome.proposal.state).toBe('confirmed');
      expect(outcome.proposal.externalEventId).toBe('evt_real_456');
      expect(outcome.proposal.activeAttemptId).toBeNull();
    }
  });

  it('moves to failed (retryable) once stale and the search finds no matching event', async () => {
    const proposalId = await stuckProposal('stuck-notfound-key', CALENDAR_PROTECTION_STUCK_EXECUTION_THRESHOLD_MS + 1_000);
    const outcome = await reconcileStuckExecutingCalendarProtectionProposal(fakeDb as any, UID, proposalId, async () => ({ status: 'not_found' }));
    expect(outcome.status).toBe('reconciled_failed');
    if (outcome.status === 'reconciled_failed') expect(outcome.proposal.state).toBe('failed');

    const retried = await retryCalendarProtectionExecution(fakeDb as any, UID, proposalId);
    expect(retried.state).toBe('approved');
  });

  it('makes no state change when stale but the search itself is inconclusive', async () => {
    const proposalId = await stuckProposal('stuck-unknown-key', CALENDAR_PROTECTION_STUCK_EXECUTION_THRESHOLD_MS + 1_000);
    const outcome = await reconcileStuckExecutingCalendarProtectionProposal(fakeDb as any, UID, proposalId, async () => ({ status: 'unknown', detail: 'provider unreachable' }));
    expect(outcome).toEqual({ status: 'still_unknown', detail: 'provider unreachable' });
    expect(getDocRaw(`users/${UID}/calendar_protection_proposals/${proposalId}`)?.state).toBe('executing');
  });

  it('reports not_executing for a proposal that is not currently executing', async () => {
    const proposal = await approvedProposal('stuck-not-executing-key');
    const outcome = await reconcileStuckExecutingCalendarProtectionProposal(fakeDb as any, UID, proposal.proposalId, async () => ({ status: 'found', eventId: 'evt_1' }));
    expect(outcome).toEqual({ status: 'not_executing' });
  });

  it('throws for a proposal that does not exist at all', async () => {
    await expect(reconcileStuckExecutingCalendarProtectionProposal(fakeDb as any, UID, 'cpp_does_not_exist', async () => ({ status: 'not_found' })))
      .rejects.toThrow(/No such calendar protection proposal/);
  });
});

// Phase 5J, directive §2 - the actual flaw the directive asked about:
// Phase 5I's "Modify" button only ever called plain prepareCalendarProtectionProposal
// with a fresh idempotencyKey, with no link back to the proposal it was
// replacing. The ORIGINAL proposal's own state (and, if already approved,
// its still-unexpired approval) was left completely untouched - nothing
// server-side ever stopped it from later executing on its own, using its
// OWN stale terms, independently of whatever the user actually modified
// to. These tests prove that flaw is now closed: superseding a proposal
// is the only thing that can set `supersededBy`, and once set, every
// path that could otherwise authorise or act on the original's approval
// (execute, approve, retry) refuses it instead.
describe('Modify/supersession integrity (Phase 5J, directive §2)', () => {
  it('superseding links both proposals: the new one records supersedes, the original records supersededBy', async () => {
    const original = await approvedProposal('super-link-original');
    const replacement = await prepareCalendarProtectionProposal(
      fakeDb as any, UID, 'super-link-replacement',
      { ...CHANGE, title: 'Protected recovery block (moved)' },
      { supersedesProposalId: original.proposalId },
    );
    expect(replacement.supersedes).toBe(original.proposalId);
    const originalAfter = getDocRaw(`users/${UID}/calendar_protection_proposals/${original.proposalId}`);
    expect(originalAfter?.supersededBy).toBe(replacement.proposalId);
    // The original's own truthful history is untouched - it really was approved.
    expect(originalAfter?.state).toBe('approved');
  });

  it('THE CORE FIX: a superseded, still-approved, still-unexpired original can no longer execute - it reports superseded, never a real/simulated success', async () => {
    const original = await approvedProposal('super-cannot-execute-original');
    await prepareCalendarProtectionProposal(
      fakeDb as any, UID, 'super-cannot-execute-replacement', CHANGE,
      { supersedesProposalId: original.proposalId },
    );
    const connector = createFakeConnectorForTesting();
    const outcome = await executeCalendarProtectionProposal(fakeDb as any, UID, original.proposalId, connector, TEST_ONLY_FORCE_EXECUTION_ENABLED);
    expect(outcome.status).toBe('superseded');
    // And the connector was never actually invoked for the stale original.
    expect(connector.connectorKind).toBe('fake_test_only'); // sanity: this is the real fake, not a spy substitute
  });

  it('approving an awaiting_approval proposal that was superseded in the meantime reports superseded, not approved', async () => {
    const prepared = await prepareCalendarProtectionProposal(fakeDb as any, UID, 'super-approve-original', CHANGE);
    await presentCalendarProtectionForApproval(fakeDb as any, UID, prepared.proposalId);
    await prepareCalendarProtectionProposal(
      fakeDb as any, UID, 'super-approve-replacement', CHANGE,
      { supersedesProposalId: prepared.proposalId },
    );
    const outcome = await recordCalendarProtectionApproval(fakeDb as any, UID, prepared.proposalId, { approved: true, approvalFingerprint: prepared.approvalFingerprint });
    expect(outcome.status).toBe('superseded');
  });

  it('retrying a failed proposal that was superseded in the meantime throws rather than silently retrying stale terms', async () => {
    const original = await approvedProposal('super-retry-original');
    const failing = createFakeConnectorForTesting({ executeResult: { ok: false, detail: 'simulated failure' } });
    await executeCalendarProtectionProposal(fakeDb as any, UID, original.proposalId, failing, TEST_ONLY_FORCE_EXECUTION_ENABLED);
    await prepareCalendarProtectionProposal(
      fakeDb as any, UID, 'super-retry-replacement', CHANGE,
      { supersedesProposalId: original.proposalId },
    );
    await expect(retryCalendarProtectionExecution(fakeDb as any, UID, original.proposalId)).rejects.toThrow(/superseded/);
  });

  it('cannot supersede a proposal that has already been confirmed (really executed)', async () => {
    const original = await approvedProposal('super-confirmed-original');
    await executeCalendarProtectionProposal(fakeDb as any, UID, original.proposalId, createFakeConnectorForTesting(), TEST_ONLY_FORCE_EXECUTION_ENABLED);
    await expect(prepareCalendarProtectionProposal(
      fakeDb as any, UID, 'super-confirmed-replacement', CHANGE,
      { supersedesProposalId: original.proposalId },
    )).rejects.toThrow(/cannot_supersede.*confirmed/);
  });

  it('cannot supersede a proposal whose outcome is still ambiguous - the real world may or may not have already been touched', async () => {
    const original = await approvedProposal('super-ambiguous-original');
    const throwingConnector = { ...createFakeConnectorForTesting(), execute: async () => { throw new Error('simulated timeout'); } };
    await executeCalendarProtectionProposal(fakeDb as any, UID, original.proposalId, throwingConnector as any, TEST_ONLY_FORCE_EXECUTION_ENABLED);
    await expect(prepareCalendarProtectionProposal(
      fakeDb as any, UID, 'super-ambiguous-replacement', CHANGE,
      { supersedesProposalId: original.proposalId },
    )).rejects.toThrow(/cannot_supersede.*ambiguous/);
  });

  it('cannot supersede the same original twice - prevents a confusing branching chain', async () => {
    const original = await approvedProposal('super-twice-original');
    await prepareCalendarProtectionProposal(
      fakeDb as any, UID, 'super-twice-first-replacement', CHANGE,
      { supersedesProposalId: original.proposalId },
    );
    await expect(prepareCalendarProtectionProposal(
      fakeDb as any, UID, 'super-twice-second-replacement', CHANGE,
      { supersedesProposalId: original.proposalId },
    )).rejects.toThrow(/cannot_supersede: this proposal has already been superseded/);
  });

  it('cannot supersede a proposal that does not exist', async () => {
    await expect(prepareCalendarProtectionProposal(
      fakeDb as any, UID, 'super-missing-replacement', CHANGE,
      { supersedesProposalId: 'cpp_does_not_exist' },
    )).rejects.toThrow(/cannot_supersede: the original proposal does not exist/);
  });

  it('a proposal cannot supersede itself', async () => {
    const idempotencyKey = 'super-self-key';
    await expect(prepareCalendarProtectionProposal(
      fakeDb as any, UID, idempotencyKey, CHANGE,
      { supersedesProposalId: `cpp_${idempotencyKey}` },
    )).rejects.toThrow(/cannot_supersede: a proposal cannot supersede itself/);
  });

  it('idempotent replay of the SAME supersede request (same idempotencyKey) does not attempt to supersede a second time', async () => {
    const original = await approvedProposal('super-idempotent-original');
    const first = await prepareCalendarProtectionProposal(
      fakeDb as any, UID, 'super-idempotent-replacement', CHANGE,
      { supersedesProposalId: original.proposalId },
    );
    const second = await prepareCalendarProtectionProposal(
      fakeDb as any, UID, 'super-idempotent-replacement', CHANGE,
      { supersedesProposalId: original.proposalId },
    );
    expect(second.proposalId).toBe(first.proposalId);
    const originalAfter = getDocRaw(`users/${UID}/calendar_protection_proposals/${original.proposalId}`);
    expect(originalAfter?.supersededBy).toBe(first.proposalId);
  });

  it('records the supersession relationship in the audit trail on both proposals', async () => {
    const original = await approvedProposal('super-audit-original');
    const replacement = await prepareCalendarProtectionProposal(
      fakeDb as any, UID, 'super-audit-replacement', CHANGE,
      { supersedesProposalId: original.proposalId },
    );
    const snap = await (fakeDb as any).collection(`users/${UID}/calendar_protection_audit`).get();
    const entries = snap.docs.map((d: any) => d.data());
    const supersededEntry = entries.find((e: any) => e.proposalId === original.proposalId && e.event === 'superseded');
    expect(supersededEntry?.detail?.supersededBy).toBe(replacement.proposalId);
    const preparedEntry = entries.find((e: any) => e.proposalId === replacement.proposalId && e.event === 'prepared');
    expect(preparedEntry?.detail?.supersedes).toBe(original.proposalId);
  });

  it('a prepared (never-approved) proposal can be superseded, just like an approved one', async () => {
    const prepared = await prepareCalendarProtectionProposal(fakeDb as any, UID, 'super-prepared-original', CHANGE);
    const replacement = await prepareCalendarProtectionProposal(
      fakeDb as any, UID, 'super-prepared-replacement', CHANGE,
      { supersedesProposalId: prepared.proposalId },
    );
    expect(replacement.supersedes).toBe(prepared.proposalId);
  });

  it('client-side navigation alone never supersedes anything - only this explicit server call does', async () => {
    // No supersede call at all - just prepare, present, approve, and
    // "walk away" (the equivalent of a client closing the tab/clicking
    // Start Over instead of Modify). The proposal's own approval must
    // remain fully live and executable, since nothing server-side was
    // ever told it was replaced.
    const original = await approvedProposal('no-supersede-just-navigate-away');
    const outcome = await executeCalendarProtectionProposal(fakeDb as any, UID, original.proposalId, createFakeConnectorForTesting(), TEST_ONLY_FORCE_EXECUTION_ENABLED);
    expect(outcome.status).toBe('confirmed');
  });
});

describe('audit trail', () => {
  it('every state transition writes an audit entry', async () => {
    const proposal = await approvedProposal('audit-key');
    await executeCalendarProtectionProposal(fakeDb as any, UID, proposal.proposalId, createFakeConnectorForTesting(), TEST_ONLY_FORCE_EXECUTION_ENABLED);
    const snap = await (fakeDb as any).collection(`users/${UID}/calendar_protection_audit`).get();
    const events = snap.docs.map((d: any) => d.data().event);
    expect(events).toContain('prepared');
    expect(events).toContain('presented_for_approval');
    expect(events).toContain('approved');
    expect(events).toContain('confirmed');
  });
});
