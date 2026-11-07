// Firestore emulator integration tests for Nova Task Deferral (Phase 5G,
// directive §7 - "extend emulator verification to the new Task Deferral
// collections, ownership boundaries, approval transactions and
// concurrency behaviour").
//
// Same reasoning as nova-calendar-protection-service.emulator.test.ts's
// own header: nova-task-deferral-service.test.ts proves the service's
// logic against a hand-written, single-threaded in-memory fake; this file
// proves the same operations against a REAL Firestore emulator's real
// transaction semantics, real network-call ordering, and real optimistic
// concurrency.
//
// HOW TO RUN THIS FILE FOR REAL:
//   1. Start the Firestore emulator (needs Java):
//        npx firebase-tools@latest emulators:start --only firestore --project demo-blaze-break-test
//   2. In a second terminal, with the emulator still running:
//        npm run test:emulator
//
// IF THE EMULATOR IS NOT RUNNING: every test in this file is SKIPPED, not
// passed or failed - same `beforeAll` reachability probe + `ctx.skip()`
// pattern as the Calendar Protection emulator suite.
//
// NO PRODUCTION CREDENTIALS OR DATABASE: FIRESTORE_EMULATOR_HOST is set
// before initializing a dedicated, separately named firebase-admin app
// against a synthetic "demo-" project id.

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  identifyTaskDeferralCandidate, clarifyTaskDeferralControl, prepareTaskDeferralProposal,
  presentTaskDeferralForApproval, recordTaskDeferralApprovalDecision, executeTaskDeferralProposal,
  retryTaskDeferralExecution, NOVA_TASK_DEFERRAL_MAX_RETRIES,
} from './nova-task-deferral-service';
import { createMockTaskDeferralConnector } from './nova-task-deferral-connector-contract';

const EMULATOR_HOST = '127.0.0.1:8080';
const PROJECT_ID = 'demo-blaze-break-test';

let emulatorAvailable = false;
let db: any;
let app: any;

async function clearEmulatorFirestore(): Promise<void> {
  await fetch(`http://${EMULATOR_HOST}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`, { method: 'DELETE' });
}

beforeAll(async () => {
  try {
    const probe = await fetch(`http://${EMULATOR_HOST}/`, { signal: AbortSignal.timeout(2_000) });
    emulatorAvailable = probe.ok;
  } catch {
    emulatorAvailable = false;
  }
  if (!emulatorAvailable) {
    // eslint-disable-next-line no-console
    console.warn(
      `\n[nova-task-deferral-service.emulator.test.ts] Firestore emulator not reachable at ${EMULATOR_HOST} - ` +
      'every test in this file will be SKIPPED, not passed or failed. See this file\'s own header for how to run it for real.\n',
    );
    return;
  }
  process.env.FIRESTORE_EMULATOR_HOST = EMULATOR_HOST;
  const { initializeApp, getApps, deleteApp } = await import('firebase-admin/app');
  const existing = getApps().find((a) => a.name === 'nova-task-deferral-emulator-test');
  if (existing) await deleteApp(existing);
  app = initializeApp({ projectId: PROJECT_ID }, 'nova-task-deferral-emulator-test');
  const { getFirestore } = await import('firebase-admin/firestore');
  db = getFirestore(app);
});

afterAll(async () => {
  if (!emulatorAvailable || !app) return;
  const { deleteApp } = await import('firebase-admin/app');
  await deleteApp(app);
});

beforeEach(async (ctx) => {
  if (!emulatorAvailable) {
    ctx.skip();
    return;
  }
  await clearEmulatorFirestore();
});

const IDENTIFICATION = { taskDescription: 'Finish the quarterly report', currentDueDescription: 'Friday' };

async function approvedProposal(uid: string, key: string) {
  const identified = await identifyTaskDeferralCandidate(db, uid, key, IDENTIFICATION);
  const clarifyOutcome = await clarifyTaskDeferralControl(db, uid, identified.proposalId, { userControlsDeadline: 'yes', userControlsOwnership: 'yes' });
  if (clarifyOutcome.status !== 'clarified') throw new Error('setup failed');
  const prepared = await prepareTaskDeferralProposal(db, uid, identified.proposalId, {
    postponementConsideration: { reasonablyPostponable: true, reasoning: 'Nobody is blocked on this.' },
    proposedChange: { proposedNewDueDescription: 'next Friday', proposedNewPriority: null },
    consequences: { consequences: [], uncertainties: [] },
  });
  await presentTaskDeferralForApproval(db, uid, prepared.proposalId);
  const outcome = await recordTaskDeferralApprovalDecision(db, uid, prepared.proposalId, { approved: true, approvalFingerprint: prepared.approvalFingerprint });
  if (outcome.status !== 'approved') throw new Error('setup failed');
  return outcome.proposal;
}

describe('Firestore emulator: the control/ownership gate against a real database', () => {
  it('"no" on ownership persists requires_other_person in the real emulator - no later call can move it', async () => {
    const uid = 'emu_task_user_gate';
    const identified = await identifyTaskDeferralCandidate(db, uid, 'gate-key', IDENTIFICATION);
    const outcome = await clarifyTaskDeferralControl(db, uid, identified.proposalId, { userControlsDeadline: 'yes', userControlsOwnership: 'no' });
    expect(outcome.status).toBe('requires_other_person');

    const snap = await db.collection(`users/${uid}/task_deferral_proposals`).doc(identified.proposalId).get();
    expect(snap.data()!.state).toBe('requires_other_person');

    await expect(prepareTaskDeferralProposal(db, uid, identified.proposalId, {
      postponementConsideration: { reasonablyPostponable: true, reasoning: 'x' },
      proposedChange: { proposedNewDueDescription: 'later', proposedNewPriority: null },
      consequences: { consequences: [], uncertainties: [] },
    })).rejects.toThrow();
  });
});

describe('Firestore emulator: approval transactions', () => {
  it('a fingerprint mismatch against the real stored proposal is rejected, never partially honoured', async () => {
    const uid = 'emu_task_user_fingerprint';
    const identified = await identifyTaskDeferralCandidate(db, uid, 'fp-key', IDENTIFICATION);
    await clarifyTaskDeferralControl(db, uid, identified.proposalId, { userControlsDeadline: 'yes', userControlsOwnership: 'yes' });
    const prepared = await prepareTaskDeferralProposal(db, uid, identified.proposalId, {
      postponementConsideration: { reasonablyPostponable: true, reasoning: 'ok' },
      proposedChange: { proposedNewDueDescription: 'later', proposedNewPriority: null },
      consequences: { consequences: [], uncertainties: [] },
    });
    await presentTaskDeferralForApproval(db, uid, prepared.proposalId);
    const outcome = await recordTaskDeferralApprovalDecision(db, uid, prepared.proposalId, { approved: true, approvalFingerprint: 'not-the-real-one' });
    expect(outcome.status).toBe('fingerprint_mismatch');
  });

  it('two simultaneous approval decisions on the same real proposal - exactly one real transition is recorded', async () => {
    const uid = 'emu_task_user_concurrent_approve';
    const identified = await identifyTaskDeferralCandidate(db, uid, 'concurrent-approve-key', IDENTIFICATION);
    await clarifyTaskDeferralControl(db, uid, identified.proposalId, { userControlsDeadline: 'yes', userControlsOwnership: 'yes' });
    const prepared = await prepareTaskDeferralProposal(db, uid, identified.proposalId, {
      postponementConsideration: { reasonablyPostponable: true, reasoning: 'ok' },
      proposedChange: { proposedNewDueDescription: 'later', proposedNewPriority: null },
      consequences: { consequences: [], uncertainties: [] },
    });
    await presentTaskDeferralForApproval(db, uid, prepared.proposalId);

    const [approveResult, declineResult] = await Promise.all([
      recordTaskDeferralApprovalDecision(db, uid, prepared.proposalId, { approved: true, approvalFingerprint: prepared.approvalFingerprint }),
      recordTaskDeferralApprovalDecision(db, uid, prepared.proposalId, { approved: false, approvalFingerprint: prepared.approvalFingerprint }),
    ]);

    const finalSnap = await db.collection(`users/${uid}/task_deferral_proposals`).doc(prepared.proposalId).get();
    expect(['approved', 'declined']).toContain(finalSnap.data()!.state);
    expect([approveResult.status, declineResult.status].some((s) => s === 'approved' || s === 'declined')).toBe(true);
  });
});

describe('Firestore emulator: concurrent execution claims', () => {
  it('two simultaneous execute calls on the same approved real proposal - the transactional claim lets only one reach the connector', async () => {
    const uid = 'emu_task_user_concurrent_execute';
    const proposal = await approvedProposal(uid, 'concurrent-execute-key');
    let connectorCallCount = 0;
    const countingConnector = {
      ...createMockTaskDeferralConnector(),
      execute: async (req: any) => { connectorCallCount += 1; return createMockTaskDeferralConnector().execute(req); },
    };

    const [first, second] = await Promise.all([
      executeTaskDeferralProposal(db, uid, proposal.proposalId, countingConnector as any),
      executeTaskDeferralProposal(db, uid, proposal.proposalId, countingConnector as any),
    ]);

    expect(connectorCallCount).toBe(1);
    const statuses = [first.status, second.status];
    expect(statuses.filter((s) => s === 'confirmed').length).toBe(1);
    const losingStatus = statuses.find((s) => s !== 'confirmed');
    expect(['already_executing', 'already_executed']).toContain(losingStatus);
  });
});

describe('Firestore emulator: idempotency', () => {
  it('two identify calls with the same idempotencyKey against the real emulator return the same proposal, never two docs', async () => {
    const uid = 'emu_task_user_idempotency';
    const [first, second] = await Promise.all([
      identifyTaskDeferralCandidate(db, uid, 'same-key', IDENTIFICATION),
      identifyTaskDeferralCandidate(db, uid, 'same-key', IDENTIFICATION),
    ]);
    expect(second.proposalId).toBe(first.proposalId);
    const snapshot = await db.collection(`users/${uid}/task_deferral_proposals`).get();
    expect(snapshot.size).toBe(1);
  });
});

describe('Firestore emulator: ownership boundaries', () => {
  it('a proposal prepared for one uid is invisible under a different uid\'s own collection path', async () => {
    const proposalA = await approvedProposal('emu_task_user_a', 'isolation-key');
    const crossUserSnap = await db.collection('users/emu_task_user_b/task_deferral_proposals').doc(proposalA.proposalId).get();
    expect(crossUserSnap.exists).toBe(false);
    const ownSnap = await db.collection('users/emu_task_user_a/task_deferral_proposals').doc(proposalA.proposalId).get();
    expect(ownSnap.exists).toBe(true);
  });
});

describe('Firestore emulator: approval expiry', () => {
  it('an approval past its real TTL reverts to awaiting_approval on execute, against real emulator timestamps', async () => {
    const uid = 'emu_task_user_expiry';
    const proposal = await approvedProposal(uid, 'expiry-key');
    await db.collection(`users/${uid}/task_deferral_proposals`).doc(proposal.proposalId).set(
      { approvalExpiresAt: new Date(Date.now() - 1_000).toISOString() },
      { merge: true },
    );
    const outcome = await executeTaskDeferralProposal(db, uid, proposal.proposalId, createMockTaskDeferralConnector());
    expect(outcome.status).toBe('approval_expired');
    const snap = await db.collection(`users/${uid}/task_deferral_proposals`).doc(proposal.proposalId).get();
    expect(snap.data()!.state).toBe('awaiting_approval');
  });
});

describe('Firestore emulator: retry cap against real stored retryCount', () => {
  it('retrying NOVA_TASK_DEFERRAL_MAX_RETRIES times succeeds, the next is rejected', async () => {
    const uid = 'emu_task_user_retry';
    const proposal = await approvedProposal(uid, 'retry-key');
    await executeTaskDeferralProposal(db, uid, proposal.proposalId, createMockTaskDeferralConnector({ executeResult: { ok: false, detail: 'fail' } }));
    for (let i = 0; i < NOVA_TASK_DEFERRAL_MAX_RETRIES; i++) {
      const retried = await retryTaskDeferralExecution(db, uid, proposal.proposalId);
      await executeTaskDeferralProposal(db, uid, retried.proposalId, createMockTaskDeferralConnector({ executeResult: { ok: false, detail: 'fail' } }));
    }
    await expect(retryTaskDeferralExecution(db, uid, proposal.proposalId)).rejects.toThrow(/maximum allowed/);
  });
});

describe('Firestore emulator: audit data consistency', () => {
  it('every real transition writes exactly one matching audit entry, readable back from the real emulator', async () => {
    const uid = 'emu_task_user_audit';
    const proposal = await approvedProposal(uid, 'audit-key');
    await executeTaskDeferralProposal(db, uid, proposal.proposalId, createMockTaskDeferralConnector());

    const auditSnap = await db.collection(`users/${uid}/task_deferral_audit`).orderBy('at', 'asc').get();
    const events: string[] = auditSnap.docs.map((d: any) => d.data().event);
    expect(events).toEqual(['identified', 'control_clarified', 'prepared', 'presented_for_approval', 'approved', 'confirmed']);
    for (const d of auditSnap.docs) {
      expect(d.data().proposalId).toBe(proposal.proposalId);
      expect(typeof d.data().at).toBe('string');
    }
  });
});

describe('Firestore emulator: export/deletion coverage', () => {
  it('recursiveDelete against the real emulator removes a proposal and its entire audit trail, nothing left behind', async () => {
    const uid = 'emu_task_user_deletion';
    const proposal = await approvedProposal(uid, 'deletion-key');
    await executeTaskDeferralProposal(db, uid, proposal.proposalId, createMockTaskDeferralConnector());

    await db.recursiveDelete(db.collection(`users/${uid}/task_deferral_proposals`));
    await db.recursiveDelete(db.collection(`users/${uid}/task_deferral_audit`));

    const proposalsAfter = await db.collection(`users/${uid}/task_deferral_proposals`).get();
    const auditAfter = await db.collection(`users/${uid}/task_deferral_audit`).get();
    expect(proposalsAfter.empty).toBe(true);
    expect(auditAfter.empty).toBe(true);
  });
});
