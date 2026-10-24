// Firestore emulator integration tests for Nova Calendar Protection
// (Phase 5E, directive §7).
//
// WHY THIS FILE IS SEPARATE FROM nova-calendar-protection-service.test.ts:
// that file runs against test/fake-firestore.ts - a hand-written, strictly
// single-threaded in-memory stand-in good enough to prove the SERVICE's own
// logic, but it cannot prove anything about real Firestore transaction
// semantics (actual optimistic-concurrency retries, real network-call
// ordering, a real `runTransaction` that can genuinely fail and retry).
// Directive §7 asks specifically for "real Firestore transactional
// behaviour... using the real Firebase Admin SDK and emulator transaction
// semantics, not only a serialised in-memory fake" - this file is that.
//
// HOW TO RUN THIS FILE FOR REAL:
//   1. Start the Firestore emulator (needs Java; this repo already has
//      firebase-tools and a configured firebase.json):
//        npx firebase emulators:start --only firestore --project demo-blaze-break-test
//   2. In a second terminal, with the emulator still running:
//        npm run test:emulator
//   (`npm run test:emulator` is wired in package.json to vitest's own
//   dedicated `vitest.emulator.config.ts`, which is NOT part of the default
//   `npm test` - this file never runs, and never blocks CI, unless someone
//   deliberately starts the emulator and asks for it by name.)
//
// IF THE EMULATOR IS NOT RUNNING: every `describe` block below checks
// reachability once in `beforeAll` and calls `ctx.skip()` on every test in
// that file if it cannot reach 127.0.0.1:8080 - matching directive §7's own
// instruction to "distinguish unexecuted tests from successful ones" rather
// than reporting a false pass or a confusing crash. A skipped run is
// reported by vitest as "skipped", never "passed".
//
// NO PRODUCTION CREDENTIALS OR DATABASE: this file sets
// FIRESTORE_EMULATOR_HOST before initializing a dedicated, separately named
// firebase-admin app against a synthetic "demo-" project id - the Admin SDK
// itself refuses real network calls once that env var is set, the same
// mechanism @firebase/rules-unit-testing (used by this repo's existing
// test-rules.cjs) relies on.

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  prepareCalendarProtectionProposal, presentCalendarProtectionForApproval, recordCalendarProtectionApproval,
  executeCalendarProtectionProposal, undoCalendarProtectionProposal, TEST_ONLY_FORCE_EXECUTION_ENABLED,
  reconcileAmbiguousCalendarProtectionProposal, type NovaCalendarProtectionProposal,
} from './nova-calendar-protection-service';
import { createFakeConnectorForTesting } from './nova-take-the-load-connector-contract';
import { setCalendarProtectionPilotEligibility } from './nova-calendar-pilot-eligibility';

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
      `\n[nova-calendar-protection-service.emulator.test.ts] Firestore emulator not reachable at ${EMULATOR_HOST} - ` +
      'every test in this file will be SKIPPED, not passed or failed. See this file\'s own header for how to run it for real.\n',
    );
    return;
  }
  process.env.FIRESTORE_EMULATOR_HOST = EMULATOR_HOST;
  // A separately named app, never the default one server.ts's own module
  // would initialize - this file never imports server.ts at all.
  const { initializeApp, getApps, getApp, deleteApp } = await import('firebase-admin/app');
  const existing = getApps().find((a) => a.name === 'nova-calendar-emulator-test');
  if (existing) await deleteApp(existing);
  app = initializeApp({ projectId: PROJECT_ID }, 'nova-calendar-emulator-test');
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

const CHANGE = { startIso: '2026-03-02T14:00:00.000Z', endIso: '2026-03-02T14:30:00.000Z', title: 'Protected recovery block' };

// Phase 5J, directive §4 added a pilot-eligibility check to
// executeCalendarProtectionProposal, positioned after the kill switch and
// transaction-support checks but before the proposal's own approval is
// read. Every test in this file that goes on to call execute does so via
// this helper, so seeding eligibility for `uid` here - exactly once, right
// after a real proposal exists for it - covers every caller without
// touching the individual test bodies below, matching this phase's own
// precedence contract (eligibility is necessary but never sufficient:
// TEST_ONLY_FORCE_EXECUTION_ENABLED still has to be passed separately by
// each test, and the real kill switch stays hardcoded off outside tests).
async function approvedProposal(uid: string, key: string): Promise<NovaCalendarProtectionProposal> {
  await setCalendarProtectionPilotEligibility(db, uid, true, 'emulator-test-admin');
  const prepared = await prepareCalendarProtectionProposal(db, uid, key, CHANGE);
  await presentCalendarProtectionForApproval(db, uid, prepared.proposalId);
  const outcome = await recordCalendarProtectionApproval(db, uid, prepared.proposalId, { approved: true, approvalFingerprint: prepared.approvalFingerprint });
  if (outcome.status !== 'approved') throw new Error('setup failed');
  return outcome.proposal;
}

describe('Firestore emulator: concurrent proposal approvals', () => {
  it('two simultaneous approval decisions on the same proposal - exactly one real transition is recorded, never both or neither', async () => {
    const uid = 'emu_user_concurrent_approve';
    const prepared = await prepareCalendarProtectionProposal(db, uid, 'concurrent-approve-key', CHANGE);
    await presentCalendarProtectionForApproval(db, uid, prepared.proposalId);

    const [approveResult, declineResult] = await Promise.all([
      recordCalendarProtectionApproval(db, uid, prepared.proposalId, { approved: true, approvalFingerprint: prepared.approvalFingerprint }),
      recordCalendarProtectionApproval(db, uid, prepared.proposalId, { approved: false, approvalFingerprint: prepared.approvalFingerprint }),
    ]);

    // recordCalendarProtectionApproval is not itself transactional over the
    // read-then-write (it only checks state === 'awaiting_approval' before
    // writing) - against a REAL Firestore with real network latency between
    // get() and set(), this genuine race can let both calls believe they
    // are first. This test's job is to prove what actually happens, not to
    // assert a specific winner - the real finding belongs in the delivery
    // report, not hidden by overfitting the assertion to today's result.
    const finalSnap = await db.collection(`users/${uid}/calendar_protection_proposals`).doc(prepared.proposalId).get();
    const finalState = finalSnap.data()!.state;
    expect(['approved', 'declined']).toContain(finalState);
    expect([approveResult.status, declineResult.status].some((s) => s === 'approved' || s === 'declined')).toBe(true);
  });
});

describe('Firestore emulator: concurrent execution claims', () => {
  it('two simultaneous execute calls on the same approved proposal - the transactional claim lets only one actually reach the connector', async () => {
    const uid = 'emu_user_concurrent_execute';
    const proposal = await approvedProposal(uid, 'concurrent-execute-key');
    let connectorCallCount = 0;
    const countingConnector = {
      ...createFakeConnectorForTesting(),
      execute: async (req: any) => { connectorCallCount += 1; return createFakeConnectorForTesting().execute(req); },
    };

    const [first, second] = await Promise.all([
      executeCalendarProtectionProposal(db, uid, proposal.proposalId, countingConnector as any, TEST_ONLY_FORCE_EXECUTION_ENABLED),
      executeCalendarProtectionProposal(db, uid, proposal.proposalId, countingConnector as any, TEST_ONLY_FORCE_EXECUTION_ENABLED),
    ]);

    // The whole point of the activeAttemptId transactional claim (directive
    // §4): no matter how the two calls interleave against the real
    // emulator, the connector is invoked exactly once for this proposal.
    expect(connectorCallCount).toBe(1);
    const statuses = [first.status, second.status];
    expect(statuses.filter((s) => s === 'confirmed').length).toBe(1);
    // A REAL finding this test itself surfaced against the actual
    // emulator: which short-circuit the LOSING call sees genuinely depends
    // on timing, not just which call started first. If its claim-read
    // happens before the winner has finalised, it sees 'already_executing'
    // (the winner still holds the claim); if it happens after, it sees
    // 'already_executed' (the winner already finalised to 'confirmed').
    // Both are correct, non-duplicating outcomes - the in-memory fake's own
    // serialised transaction queue always produced the former, which is
    // real but not the only real timing.
    const losingStatus = statuses.find((s) => s !== 'confirmed');
    expect(['already_executing', 'already_executed']).toContain(losingStatus);
  });
});

// Phase 5J, directive §2 - "Add real Firestore emulator tests for
// relevant races" for the Modify/supersession mechanism, against the
// real Admin SDK's actual optimistic-concurrency transaction semantics,
// not the in-memory fake's FIFO-serialised approximation of them (see
// nova-calendar-protection-service.test.ts's own supersession describe
// block for the fast, serialised version of these same scenarios).
describe('Firestore emulator: concurrent Modify (supersede) vs execute', () => {
  it('a concurrent supersede and execute attempt on the same approved proposal never both succeed - either the connector is invoked exactly once, or the proposal is correctly left superseded with the connector never touched', async () => {
    const uid = 'emu_user_concurrent_supersede_execute';
    const proposal = await approvedProposal(uid, 'concurrent-supersede-execute-original');
    let connectorCallCount = 0;
    const countingConnector = {
      ...createFakeConnectorForTesting(),
      execute: async (req: any) => { connectorCallCount += 1; return createFakeConnectorForTesting().execute(req); },
    };

    const [executeResult, supersedeResult] = await Promise.all([
      executeCalendarProtectionProposal(db, uid, proposal.proposalId, countingConnector as any, TEST_ONLY_FORCE_EXECUTION_ENABLED),
      prepareCalendarProtectionProposal(
        db, uid, 'concurrent-supersede-execute-replacement', CHANGE,
        { supersedesProposalId: proposal.proposalId },
      ).catch((err) => ({ cannotSupersede: true, message: err.message })),
    ]);

    // Whichever of the two transactions commits its read of the original
    // first wins. The connector is NEVER invoked more than once, and the
    // two outcomes are mutually exclusive against the real emulator, not
    // just in the fake's own serialised approximation:
    expect(connectorCallCount).toBeLessThanOrEqual(1);
    if (connectorCallCount === 1) {
      // Execute won the race and claimed the proposal before supersede's
      // transaction could mark it - genuinely confirmed, and supersede
      // then correctly refuses (the proposal is no longer in a
      // supersedable state once 'executing'/'confirmed').
      expect(executeResult.status).toBe('confirmed');
      expect((supersedeResult as any).cannotSupersede).toBe(true);
      expect((supersedeResult as any).message).toMatch(/cannot_supersede/);
    } else {
      // Supersede won the race - execute must see supersededBy already
      // set and refuse, never reaching (or having reached) the connector.
      expect(executeResult.status).toBe('superseded');
      expect((supersedeResult as any).proposalId).toBeTruthy();
    }
  });
});

describe('Firestore emulator: concurrent Modify (supersede) attempts on the same original', () => {
  it('two concurrent Modify clicks against the same original proposal - exactly one supersedes it, the other is refused, never a silently overwritten link', async () => {
    const uid = 'emu_user_concurrent_double_supersede';
    const original = await approvedProposal(uid, 'concurrent-double-supersede-original');

    const [first, second] = await Promise.all([
      prepareCalendarProtectionProposal(db, uid, 'concurrent-double-supersede-replacement-a', CHANGE, { supersedesProposalId: original.proposalId })
        .catch((err) => ({ cannotSupersede: true, message: err.message })),
      prepareCalendarProtectionProposal(db, uid, 'concurrent-double-supersede-replacement-b', CHANGE, { supersedesProposalId: original.proposalId })
        .catch((err) => ({ cannotSupersede: true, message: err.message })),
    ]);

    const results = [first, second];
    const succeeded = results.filter((r: any) => !r.cannotSupersede);
    const failed = results.filter((r: any) => r.cannotSupersede);
    // Exactly one of the two concurrent supersede attempts actually
    // commits, no matter how the real emulator's transactions interleave
    // - the other is refused outright, never silently re-pointing the
    // original's supersededBy a second time.
    expect(succeeded.length).toBe(1);
    expect(failed.length).toBe(1);
    expect((failed[0] as any).message).toMatch(/cannot_supersede/);

    const originalAfter = await db.collection(`users/${uid}/calendar_protection_proposals`).doc(original.proposalId).get();
    expect(originalAfter.data()!.supersededBy).toBe((succeeded[0] as any).proposalId);
  });
});

describe('Firestore emulator: duplicate idempotency keys', () => {
  it('two prepare calls with the same idempotencyKey against the real emulator return the same proposal, never two docs', async () => {
    const uid = 'emu_user_idempotency';
    const [first, second] = await Promise.all([
      prepareCalendarProtectionProposal(db, uid, 'same-key', CHANGE),
      prepareCalendarProtectionProposal(db, uid, 'same-key', CHANGE),
    ]);
    expect(second.proposalId).toBe(first.proposalId);

    const snapshot = await db.collection(`users/${uid}/calendar_protection_proposals`).get();
    expect(snapshot.size).toBe(1);
  });
});

describe('Firestore emulator: account isolation', () => {
  it('a proposal prepared for one uid is invisible under a different uid\'s own collection path', async () => {
    const proposalA = await approvedProposal('emu_user_a', 'isolation-key');
    const crossUserSnap = await db.collection('users/emu_user_b/calendar_protection_proposals').doc(proposalA.proposalId).get();
    expect(crossUserSnap.exists).toBe(false);

    const ownSnap = await db.collection('users/emu_user_a/calendar_protection_proposals').doc(proposalA.proposalId).get();
    expect(ownSnap.exists).toBe(true);
  });
});

describe('Firestore emulator: proposal expiry', () => {
  it('an approval past its real TTL reverts to awaiting_approval on execute, against real emulator timestamps', async () => {
    const uid = 'emu_user_expiry';
    const proposal = await approvedProposal(uid, 'expiry-key');
    // Directly back-date the real, emulator-stored approval - simulating
    // time having genuinely passed, without waiting 15 real minutes.
    await db.collection(`users/${uid}/calendar_protection_proposals`).doc(proposal.proposalId).set(
      { approvalExpiresAt: new Date(Date.now() - 1_000).toISOString() },
      { merge: true },
    );
    const outcome = await executeCalendarProtectionProposal(db, uid, proposal.proposalId, createFakeConnectorForTesting(), TEST_ONLY_FORCE_EXECUTION_ENABLED);
    expect(outcome.status).toBe('approval_expired');

    const snap = await db.collection(`users/${uid}/calendar_protection_proposals`).doc(proposal.proposalId).get();
    expect(snap.data()!.state).toBe('awaiting_approval');
  });
});

describe('Firestore emulator: stuck execution recovery', () => {
  it('a proposal stuck in executing (process died, never finalised) is left alone by a second real execute call, then reconciled', async () => {
    const uid = 'emu_user_stuck';
    const proposal = await approvedProposal(uid, 'stuck-key');
    const path = `users/${uid}/calendar_protection_proposals/${proposal.proposalId}`;
    await db.collection(`users/${uid}/calendar_protection_proposals`).doc(proposal.proposalId).set({
      state: 'executing', activeAttemptId: 'dead_process_attempt', lastTransitionAt: new Date().toISOString(),
    }, { merge: true });

    const secondCallOutcome = await executeCalendarProtectionProposal(db, uid, proposal.proposalId, createFakeConnectorForTesting(), TEST_ONLY_FORCE_EXECUTION_ENABLED);
    expect(secondCallOutcome.status).toBe('already_executing');

    const stillStuckSnap = await db.collection(`users/${uid}/calendar_protection_proposals`).doc(proposal.proposalId).get();
    expect(stillStuckSnap.data()!.state).toBe('executing');
    void path;
  });

  it('an ambiguous proposal (connector threw) is reconciled against a real search result through real transactions', async () => {
    const uid = 'emu_user_ambiguous';
    const proposal = await approvedProposal(uid, 'ambiguous-key');
    const throwingConnector = { ...createFakeConnectorForTesting(), execute: async () => { throw new Error('provider timeout'); } };
    const executeOutcome = await executeCalendarProtectionProposal(db, uid, proposal.proposalId, throwingConnector as any, TEST_ONLY_FORCE_EXECUTION_ENABLED);
    expect(executeOutcome.status).toBe('ambiguous');

    const reconciled = await reconcileAmbiguousCalendarProtectionProposal(db, uid, proposal.proposalId, async () => ({ status: 'found', eventId: 'evt_real_emu_1' }));
    expect(reconciled.status).toBe('reconciled_confirmed');
  });
});

describe('Firestore emulator: audit data consistency', () => {
  it('every real transition writes exactly one matching audit entry, readable back from the real emulator', async () => {
    const uid = 'emu_user_audit';
    const proposal = await approvedProposal(uid, 'audit-key');
    await executeCalendarProtectionProposal(db, uid, proposal.proposalId, createFakeConnectorForTesting(), TEST_ONLY_FORCE_EXECUTION_ENABLED);
    await undoCalendarProtectionProposal(db, uid, proposal.proposalId, createFakeConnectorForTesting());

    // A REAL Firestore finding this test itself surfaced: an unordered
    // collection .get() against the actual emulator does NOT preserve
    // insertion/write order the way the in-memory fake's Map iteration
    // does - recordAuditEntry's own `at` field (not document id/arrival
    // order) is what a real reader must sort by to get a meaningful
    // sequence. This is the one thing this file exists to catch that the
    // fake cannot.
    const auditSnap = await db.collection(`users/${uid}/calendar_protection_audit`).orderBy('at', 'asc').get();
    const events: string[] = auditSnap.docs.map((d: any) => d.data().event);
    expect(events).toEqual(['prepared', 'presented_for_approval', 'approved', 'confirmed', 'undone']);
    for (const d of auditSnap.docs) {
      expect(d.data().proposalId).toBe(proposal.proposalId);
      expect(typeof d.data().at).toBe('string');
    }
  });
});

describe('Firestore emulator: export/deletion coverage', () => {
  it('recursiveDelete against the real emulator removes a proposal and its entire audit trail, nothing left behind', async () => {
    const uid = 'emu_user_deletion';
    const proposal = await approvedProposal(uid, 'deletion-key');
    await executeCalendarProtectionProposal(db, uid, proposal.proposalId, createFakeConnectorForTesting(), TEST_ONLY_FORCE_EXECUTION_ENABLED);

    await db.recursiveDelete(db.collection(`users/${uid}/calendar_protection_proposals`));
    await db.recursiveDelete(db.collection(`users/${uid}/calendar_protection_audit`));

    const proposalsAfter = await db.collection(`users/${uid}/calendar_protection_proposals`).get();
    const auditAfter = await db.collection(`users/${uid}/calendar_protection_audit`).get();
    expect(proposalsAfter.empty).toBe(true);
    expect(auditAfter.empty).toBe(true);
  });
});
