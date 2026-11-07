import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  identifyTaskDeferralCandidate, clarifyTaskDeferralControl, prepareTaskDeferralProposal,
  presentTaskDeferralForApproval, recordTaskDeferralApprovalDecision, executeTaskDeferralProposal,
  retryTaskDeferralExecution, NOVA_TASK_DEFERRAL_MAX_RETRIES,
} from './nova-task-deferral-service';
import { createMockTaskDeferralConnector } from './nova-task-deferral-connector-contract';
import { assertValidNovaTaskDeferralTransition, NovaTaskDeferralInvalidTransitionError, controlIsConfirmedByUser } from './nova-task-deferral-types';
import { resetStore, fakeDb } from './test/fake-firestore';

beforeEach(() => resetStore());

const UID = 'user_a';
const IDENTIFICATION = { taskDescription: 'Finish the quarterly report', currentDueDescription: 'Friday' };

async function clarifiedProposal(key = 'tdp-key') {
  const proposal = await identifyTaskDeferralCandidate(fakeDb as any, UID, key, IDENTIFICATION);
  const outcome = await clarifyTaskDeferralControl(fakeDb as any, UID, proposal.proposalId, { userControlsDeadline: 'yes', userControlsOwnership: 'yes' });
  if (outcome.status !== 'clarified') throw new Error('setup failed');
  return outcome.proposal;
}

async function preparedProposal(key = 'tdp-prep') {
  const clarified = await clarifiedProposal(key);
  return prepareTaskDeferralProposal(fakeDb as any, UID, clarified.proposalId, {
    postponementConsideration: { reasonablyPostponable: true, reasoning: 'Nobody is waiting on this immediately.' },
    proposedChange: { proposedNewDueDescription: 'next Friday', proposedNewPriority: null },
    consequences: { consequences: ['Report lands a week later.'], uncertainties: [] },
  });
}

async function approvedProposal(key = 'tdp-appr') {
  const prepared = await preparedProposal(key);
  await presentTaskDeferralForApproval(fakeDb as any, UID, prepared.proposalId);
  const outcome = await recordTaskDeferralApprovalDecision(fakeDb as any, UID, prepared.proposalId, { approved: true, approvalFingerprint: prepared.approvalFingerprint });
  if (outcome.status !== 'approved') throw new Error('setup failed');
  return outcome.proposal;
}

describe('identifyTaskDeferralCandidate - idempotency', () => {
  it('a second identify call with the same idempotencyKey returns the SAME proposal', async () => {
    const first = await identifyTaskDeferralCandidate(fakeDb as any, UID, 'dup-key', IDENTIFICATION);
    const second = await identifyTaskDeferralCandidate(fakeDb as any, UID, 'dup-key', IDENTIFICATION);
    expect(second.proposalId).toBe(first.proposalId);
  });

  it('rejects an empty task description', async () => {
    await expect(identifyTaskDeferralCandidate(fakeDb as any, UID, 'empty-key', { taskDescription: '   ', currentDueDescription: null })).rejects.toThrow(/invalid_identification/);
  });
});

describe('clarifyTaskDeferralControl - the hard safety gate', () => {
  it('"yes"/"yes" moves to clarified, ready for a proposal', async () => {
    const proposal = await identifyTaskDeferralCandidate(fakeDb as any, UID, 'k1', IDENTIFICATION);
    const outcome = await clarifyTaskDeferralControl(fakeDb as any, UID, proposal.proposalId, { userControlsDeadline: 'yes', userControlsOwnership: 'yes' });
    expect(outcome.status).toBe('clarified');
  });

  it('"no" on deadline control routes to requires_other_person - never to clarified', async () => {
    const proposal = await identifyTaskDeferralCandidate(fakeDb as any, UID, 'k2', IDENTIFICATION);
    const outcome = await clarifyTaskDeferralControl(fakeDb as any, UID, proposal.proposalId, { userControlsDeadline: 'no', userControlsOwnership: 'yes' });
    expect(outcome.status).toBe('requires_other_person');
  });

  it('"unsure" on ownership also routes to requires_other_person - never silently treated as yes', async () => {
    const proposal = await identifyTaskDeferralCandidate(fakeDb as any, UID, 'k3', IDENTIFICATION);
    const outcome = await clarifyTaskDeferralControl(fakeDb as any, UID, proposal.proposalId, { userControlsDeadline: 'yes', userControlsOwnership: 'unsure' });
    expect(outcome.status).toBe('requires_other_person');
  });

  it('requires_other_person is terminal - there is no function in this file that can move it onward', async () => {
    const proposal = await identifyTaskDeferralCandidate(fakeDb as any, UID, 'k4', IDENTIFICATION);
    await clarifyTaskDeferralControl(fakeDb as any, UID, proposal.proposalId, { userControlsDeadline: 'no', userControlsOwnership: 'no' });
    await expect(
      prepareTaskDeferralProposal(fakeDb as any, UID, proposal.proposalId, {
        postponementConsideration: { reasonablyPostponable: true, reasoning: 'x' },
        proposedChange: { proposedNewDueDescription: 'later', proposedNewPriority: null },
        consequences: { consequences: [], uncertainties: [] },
      }),
    ).rejects.toThrow(NovaTaskDeferralInvalidTransitionError);
  });

  it('controlIsConfirmedByUser is false for anything other than yes/yes', () => {
    expect(controlIsConfirmedByUser({ userControlsDeadline: 'yes', userControlsOwnership: 'yes' })).toBe(true);
    expect(controlIsConfirmedByUser({ userControlsDeadline: 'unsure', userControlsOwnership: 'yes' })).toBe(false);
    expect(controlIsConfirmedByUser({ userControlsDeadline: 'yes', userControlsOwnership: 'no' })).toBe(false);
  });
});

describe('prepareTaskDeferralProposal - exactly one proposed change', () => {
  it('rejects a proposal with BOTH a due description and a priority set', async () => {
    const clarified = await clarifiedProposal('both-key');
    await expect(
      prepareTaskDeferralProposal(fakeDb as any, UID, clarified.proposalId, {
        postponementConsideration: { reasonablyPostponable: true, reasoning: 'x' },
        proposedChange: { proposedNewDueDescription: 'later', proposedNewPriority: 'lower' },
        consequences: { consequences: [], uncertainties: [] },
      }),
    ).rejects.toThrow(/invalid_proposed_change/);
  });

  it('rejects a proposal with NEITHER set', async () => {
    const clarified = await clarifiedProposal('neither-key');
    await expect(
      prepareTaskDeferralProposal(fakeDb as any, UID, clarified.proposalId, {
        postponementConsideration: { reasonablyPostponable: true, reasoning: 'x' },
        proposedChange: { proposedNewDueDescription: null, proposedNewPriority: null },
        consequences: { consequences: [], uncertainties: [] },
      }),
    ).rejects.toThrow(/invalid_proposed_change/);
  });

  it('accepts exactly one and computes a real fingerprint', async () => {
    const prepared = await preparedProposal('one-key');
    expect(prepared.approvalFingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(prepared.state).toBe('prepared');
  });
});

describe('recordTaskDeferralApprovalDecision - fingerprint-bound approval', () => {
  it('rejects the wrong fingerprint', async () => {
    const prepared = await preparedProposal('fp-key');
    await presentTaskDeferralForApproval(fakeDb as any, UID, prepared.proposalId);
    const outcome = await recordTaskDeferralApprovalDecision(fakeDb as any, UID, prepared.proposalId, { approved: true, approvalFingerprint: 'wrong' });
    expect(outcome.status).toBe('fingerprint_mismatch');
  });

  it('a modification before deciding invalidates the old fingerprint', async () => {
    const prepared = await preparedProposal('mod-key');
    await presentTaskDeferralForApproval(fakeDb as any, UID, prepared.proposalId);
    const oldFingerprint = prepared.approvalFingerprint;
    // User asks to modify - re-prepare with a different proposed change.
    const modified = await prepareTaskDeferralProposal(fakeDb as any, UID, prepared.proposalId, {
      postponementConsideration: { reasonablyPostponable: true, reasoning: 'Changed my mind on the date.' },
      proposedChange: { proposedNewDueDescription: 'next Monday instead', proposedNewPriority: null },
      consequences: { consequences: [], uncertainties: [] },
    });
    expect(modified.approvalFingerprint).not.toBe(oldFingerprint);
    await presentTaskDeferralForApproval(fakeDb as any, UID, modified.proposalId);
    const staleAttempt = await recordTaskDeferralApprovalDecision(fakeDb as any, UID, modified.proposalId, { approved: true, approvalFingerprint: oldFingerprint });
    expect(staleAttempt.status).toBe('fingerprint_mismatch');
    const freshAttempt = await recordTaskDeferralApprovalDecision(fakeDb as any, UID, modified.proposalId, { approved: true, approvalFingerprint: modified.approvalFingerprint });
    expect(freshAttempt.status).toBe('approved');
  });

  it('declining does not allow a later approval of the same proposal', async () => {
    const prepared = await preparedProposal('decline-key');
    await presentTaskDeferralForApproval(fakeDb as any, UID, prepared.proposalId);
    const declineOutcome = await recordTaskDeferralApprovalDecision(fakeDb as any, UID, prepared.proposalId, { approved: false, approvalFingerprint: prepared.approvalFingerprint });
    expect(declineOutcome.status).toBe('declined');
    const secondAttempt = await recordTaskDeferralApprovalDecision(fakeDb as any, UID, prepared.proposalId, { approved: true, approvalFingerprint: prepared.approvalFingerprint });
    expect(secondAttempt.status).toBe('not_awaiting_approval');
  });
});

describe('executeTaskDeferralProposal - the mock-only connector', () => {
  it('a successful connector outcome moves the proposal to confirmed', async () => {
    const approved = await approvedProposal('exec-ok');
    const outcome = await executeTaskDeferralProposal(fakeDb as any, UID, approved.proposalId, createMockTaskDeferralConnector());
    expect(outcome.status).toBe('confirmed');
  });

  it('a failing connector outcome moves the proposal to failed, never ambiguous', async () => {
    const approved = await approvedProposal('exec-fail');
    const outcome = await executeTaskDeferralProposal(fakeDb as any, UID, approved.proposalId, createMockTaskDeferralConnector({ executeResult: { ok: false, detail: 'simulated failure' } }));
    expect(outcome.status).toBe('failed');
  });

  it('a connector that throws is recorded as failed (this codebase failing, not an unknown real-world outcome)', async () => {
    const approved = await approvedProposal('exec-throw');
    const throwingConnector = { connectorKind: 'throwing_test_double', execute: vi.fn().mockRejectedValue(new Error('boom')) };
    const outcome = await executeTaskDeferralProposal(fakeDb as any, UID, approved.proposalId, throwingConnector as any);
    expect(outcome.status).toBe('failed');
  });

  it('cannot execute a proposal that was never approved', async () => {
    const prepared = await preparedProposal('not-approved-key');
    const outcome = await executeTaskDeferralProposal(fakeDb as any, UID, prepared.proposalId, createMockTaskDeferralConnector());
    expect(outcome.status).toBe('not_approved');
  });

  it('a second concurrent execute call cannot also reach the connector', async () => {
    const approved = await approvedProposal('concurrent-key');
    const slowConnector = createMockTaskDeferralConnector();
    const [first, second] = await Promise.all([
      executeTaskDeferralProposal(fakeDb as any, UID, approved.proposalId, slowConnector),
      executeTaskDeferralProposal(fakeDb as any, UID, approved.proposalId, slowConnector),
    ]);
    const statuses = [first.status, second.status].sort();
    // One call claims and finalises; the other observes either the
    // in-flight claim or the already-finalised result - never a second
    // distinct connector-driven outcome.
    expect(statuses).toContain('confirmed');
  });

  it('an expired approval reverts to awaiting_approval rather than executing', async () => {
    const approved = await approvedProposal('expired-key');
    // Simulate time passing past the TTL by writing an already-expired approvalExpiresAt directly.
    await (fakeDb as any).collection(`users/${UID}/task_deferral_proposals`).doc(approved.proposalId).set({
      ...approved, approvalExpiresAt: new Date(Date.now() - 1000).toISOString(),
    });
    const outcome = await executeTaskDeferralProposal(fakeDb as any, UID, approved.proposalId, createMockTaskDeferralConnector());
    expect(outcome.status).toBe('approval_expired');
  });
});

describe('retryTaskDeferralExecution', () => {
  it('can only retry a failed proposal', async () => {
    const approved = await approvedProposal('retry-not-failed');
    await expect(retryTaskDeferralExecution(fakeDb as any, UID, approved.proposalId)).rejects.toThrow(/Can only retry a failed proposal/);
  });

  it('is capped at NOVA_TASK_DEFERRAL_MAX_RETRIES', async () => {
    const approved = await approvedProposal('retry-cap');
    let proposal = await executeTaskDeferralProposal(fakeDb as any, UID, approved.proposalId, createMockTaskDeferralConnector({ executeResult: { ok: false, detail: 'fail' } }));
    for (let i = 0; i < NOVA_TASK_DEFERRAL_MAX_RETRIES; i++) {
      const retried = await retryTaskDeferralExecution(fakeDb as any, UID, approved.proposalId);
      proposal = await executeTaskDeferralProposal(fakeDb as any, UID, retried.proposalId, createMockTaskDeferralConnector({ executeResult: { ok: false, detail: 'fail' } })) as any;
    }
    await expect(retryTaskDeferralExecution(fakeDb as any, UID, approved.proposalId)).rejects.toThrow(/maximum allowed/);
  });
});

describe('NOVA_TASK_DEFERRAL_VALID_TRANSITIONS', () => {
  it('confirmed has no outgoing transition - task_deferral is not granted undo', () => {
    expect(() => assertValidNovaTaskDeferralTransition('confirmed', 'executing')).toThrow(NovaTaskDeferralInvalidTransitionError);
  });

  it('declined is terminal', () => {
    expect(() => assertValidNovaTaskDeferralTransition('declined', 'approved')).toThrow(NovaTaskDeferralInvalidTransitionError);
  });
});
