import { describe, it, expect, beforeEach } from 'vitest';
import {
  identifyCalendarPressure, prepareCalendarProtectionProposal, presentCalendarProtectionForApproval,
  recordCalendarProtectionApproval, executeCalendarProtectionProposal, retryCalendarProtectionExecution,
  undoCalendarProtectionProposal, CALENDAR_PROTECTION_EXECUTION_ENABLED, TEST_ONLY_FORCE_EXECUTION_ENABLED,
} from './nova-calendar-protection-service';
import { createFakeConnectorForTesting } from './nova-take-the-load-connector-contract';
import { resetStore, fakeDb } from './test/fake-firestore';
import type { CalendarSignalState } from './calendar-workload-defence-engine';
import crypto from 'node:crypto';

beforeEach(() => resetStore());

const UID = 'user_a';
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
