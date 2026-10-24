// NHEI/Nova PHASE 5C (directive §5) - calendar protection routes, at the
// actual route boundary. Same supertest + mocked firebase-admin pattern
// as nhei-consent-route.test.ts. Covers: permission gating on
// allowCalendarSignals, the full prepare->present->approve->execute
// flow, the fingerprint-mismatch rejection, and that execution is
// ALWAYS disabled through this route regardless of approval state.

process.env.TEST_MODE = 'true';
process.env.NODE_ENV = 'test';

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('express-rate-limit', () => ({ default: () => (_req: any, _res: any, next: any) => next() }));
vi.mock('firebase-admin/app', () => ({ initializeApp: vi.fn(), getApps: () => [{}] }));
vi.mock('firebase-admin/app-check', () => ({ getAppCheck: () => ({ verifyToken: vi.fn() }) }));

const USERS: Record<string, { email: string; role?: string }> = { user_a: { email: 'a@test.dev' } };

vi.mock('firebase-admin/auth', () => ({
  getAuth: () => ({
    verifyIdToken: async (t: string) => {
      const u = USERS[t];
      if (!u) throw new Error('unknown test uid');
      return { uid: t, email: u.email, role: u.role };
    },
    getUser: async () => ({ customClaims: {} }),
  }),
}));
vi.mock('firebase-admin/firestore', async () => {
  const fake = await import('./test/fake-firestore');
  return { getFirestore: () => fake.fakeDb, FieldValue: fake.FakeFieldValue };
});
vi.mock('twilio', () => ({ default: () => ({ messages: { create: vi.fn() } }) }));

// Phase 5I, directive §9 - the regression this mock exists to make
// possible: server.ts's execute/undo routes now import a REAL connector
// factory (nova-google-calendar-connector-factory.ts) capable of making
// real Google Calendar API calls through a real fetch-backed transport.
// Spying on both of its exports, rather than merely re-asserting
// `execution_disabled` in the response (already covered below), is what
// actually proves the production route never even CONSTRUCTS that real
// transport while CALENDAR_PROTECTION_EXECUTION_ENABLED is false - the
// response body alone could stay "disabled" even if a real network call
// had already fired and been ignored, which is specifically the
// scenario this test must rule out, not just the visible outcome.
const { buildGoogleCalendarConnectorSpy, createRealGoogleCalendarHttpTransportSpy } = vi.hoisted(() => ({
  buildGoogleCalendarConnectorSpy: vi.fn(),
  createRealGoogleCalendarHttpTransportSpy: vi.fn(),
}));
vi.mock('./nova-google-calendar-connector-factory', () => ({
  buildGoogleCalendarConnector: buildGoogleCalendarConnectorSpy,
  createRealGoogleCalendarHttpTransport: createRealGoogleCalendarHttpTransportSpy,
}));

import request from 'supertest';
import { app } from './server';
import { resetStore, fakeDb, allPaths, getDocRaw } from './test/fake-firestore';

const auth = (uid: string) => ({ Authorization: `Bearer ${uid}` });
const CHANGE = { idempotencyKey: 'route-test-1', startIso: '2026-03-01T10:00:00.000Z', endIso: '2026-03-01T10:30:00.000Z', title: 'Protected block' };

// requireAdmin (server.ts) accepts any of: user.platform_admin === true,
// user.admin === true, isPlatformAdminRole(user.role), or
// isOwnerBootstrapEmail(user.email). 'platform_owner' is a real member of
// PLATFORM_ADMIN_ROLES (admin-roles.ts) - same pattern used by
// evolution-registry.route.test.ts's OWNER fixture - so this uid passes
// requireAdmin without needing to fake a bootstrap email or custom claim.
const ADMIN = 'admin_1';

beforeEach(async () => {
  resetStore();
  USERS.user_a = { email: 'a@test.dev' };
  USERS[ADMIN] = { email: 'admin@test.dev', role: 'platform_owner' };
});

async function connectCalendar() {
  // allowCalendarActions (Phase 5D, directive §3): the separate
  // action-authorisation permission, distinct from the read-only
  // allowCalendarSignals consent - both are required to reach `propose`.
  await (fakeDb as any).collection('users').doc('user_a').collection('nova_permissions').doc('current').set({ allowCalendarSignals: true, allowCalendarActions: true });
  await (fakeDb as any).collection('users').doc('user_a').collection('live_signals').doc('calendar').set({
    totalMeetingHours: 10, meetingCount: 8, backToBackCount: 1, eveningMeetingCount: 0, weekendMeetingCount: 0, windowDays: 7,
    updatedAt: new Date().toISOString(),
  });
}

describe('POST /api/nova/calendar-protection/propose', () => {
  it('is refused when calendar signals are not enabled for this account', async () => {
    const res = await request(app).post('/api/nova/calendar-protection/propose').set(auth('user_a')).send(CHANGE);
    expect(res.status).toBe(403);
  });

  it('prepares a real proposal once calendar signals are enabled, including a real fingerprint', async () => {
    await connectCalendar();
    const res = await request(app).post('/api/nova/calendar-protection/propose').set(auth('user_a')).send(CHANGE);
    expect(res.status).toBe(200);
    expect(res.body.proposal.state).toBe('prepared');
    expect(res.body.proposal.approvalFingerprint).toMatch(/^[a-f0-9]{64}$/);
  });

  it('rejects an unauthenticated request', async () => {
    const res = await request(app).post('/api/nova/calendar-protection/propose').send(CHANGE);
    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});

describe('full prepare -> present -> approve -> execute flow', () => {
  it('a bare {approved: true} with no fingerprint is rejected by the schema itself', async () => {
    await connectCalendar();
    const prepared = await request(app).post('/api/nova/calendar-protection/propose').set(auth('user_a')).send(CHANGE);
    const proposalId = prepared.body.proposal.proposalId;
    await request(app).post(`/api/nova/calendar-protection/${proposalId}/present`).set(auth('user_a'));
    const res = await request(app).post(`/api/nova/calendar-protection/${proposalId}/approve`).set(auth('user_a')).send({ approved: true });
    expect(res.status).toBe(400);
  });

  it('an approval with the WRONG fingerprint (simulating modified parameters) is rejected with 409', async () => {
    await connectCalendar();
    const prepared = await request(app).post('/api/nova/calendar-protection/propose').set(auth('user_a')).send(CHANGE);
    const proposalId = prepared.body.proposal.proposalId;
    await request(app).post(`/api/nova/calendar-protection/${proposalId}/present`).set(auth('user_a'));
    const res = await request(app).post(`/api/nova/calendar-protection/${proposalId}/approve`).set(auth('user_a')).send({ approved: true, approvalFingerprint: 'wrong' });
    expect(res.status).toBe(409);
  });

  it('the correct fingerprint approves successfully, but execution is STILL disabled end to end', async () => {
    await connectCalendar();
    const prepared = await request(app).post('/api/nova/calendar-protection/propose').set(auth('user_a')).send(CHANGE);
    const proposalId = prepared.body.proposal.proposalId;
    const fingerprint = prepared.body.proposal.approvalFingerprint;
    await request(app).post(`/api/nova/calendar-protection/${proposalId}/present`).set(auth('user_a'));
    const approveRes = await request(app).post(`/api/nova/calendar-protection/${proposalId}/approve`).set(auth('user_a')).send({ approved: true, approvalFingerprint: fingerprint });
    expect(approveRes.body.status).toBe('approved');

    const executeRes = await request(app).post(`/api/nova/calendar-protection/${proposalId}/execute`).set(auth('user_a'));
    expect(executeRes.status).toBe(200);
    expect(executeRes.body.status).toBe('execution_disabled');
  });

  it('a duplicate propose with the same idempotencyKey returns the same proposal through the route', async () => {
    await connectCalendar();
    const first = await request(app).post('/api/nova/calendar-protection/propose').set(auth('user_a')).send(CHANGE);
    const second = await request(app).post('/api/nova/calendar-protection/propose').set(auth('user_a')).send(CHANGE);
    expect(second.body.proposal.proposalId).toBe(first.body.proposal.proposalId);
  });

  it('undo is unreachable through the route since no proposal can ever be confirmed while execution is disabled', async () => {
    await connectCalendar();
    const prepared = await request(app).post('/api/nova/calendar-protection/propose').set(auth('user_a')).send(CHANGE);
    const proposalId = prepared.body.proposal.proposalId;
    const fingerprint = prepared.body.proposal.approvalFingerprint;
    await request(app).post(`/api/nova/calendar-protection/${proposalId}/present`).set(auth('user_a'));
    await request(app).post(`/api/nova/calendar-protection/${proposalId}/approve`).set(auth('user_a')).send({ approved: true, approvalFingerprint: fingerprint });
    await request(app).post(`/api/nova/calendar-protection/${proposalId}/execute`).set(auth('user_a'));
    const undoRes = await request(app).post(`/api/nova/calendar-protection/${proposalId}/undo`).set(auth('user_a'));
    expect(undoRes.status).toBe(409);
  });

  // Phase 5I, directive §9 - the specific regression the directive asks
  // for: "a regression test that proves the production execution route
  // cannot reach the external Google transport while its execution gate
  // is OFF." This goes further than asserting `execution_disabled` in
  // the response (already covered above) - it proves the real connector
  // factory server.ts now imports is never even CALLED on either route,
  // which is what actually rules out a real Google API call having fired
  // regardless of what the response body claims.
  it('never calls the real Google Calendar connector factory on execute, approved proposal, while the kill-switch is off', async () => {
    buildGoogleCalendarConnectorSpy.mockClear();
    createRealGoogleCalendarHttpTransportSpy.mockClear();
    await connectCalendar();
    const prepared = await request(app).post('/api/nova/calendar-protection/propose').set(auth('user_a')).send(CHANGE);
    const proposalId = prepared.body.proposal.proposalId;
    const fingerprint = prepared.body.proposal.approvalFingerprint;
    await request(app).post(`/api/nova/calendar-protection/${proposalId}/present`).set(auth('user_a'));
    await request(app).post(`/api/nova/calendar-protection/${proposalId}/approve`).set(auth('user_a')).send({ approved: true, approvalFingerprint: fingerprint });

    await request(app).post(`/api/nova/calendar-protection/${proposalId}/execute`).set(auth('user_a'));

    expect(buildGoogleCalendarConnectorSpy).not.toHaveBeenCalled();
    expect(createRealGoogleCalendarHttpTransportSpy).not.toHaveBeenCalled();
  });

  it('never calls the real Google Calendar connector factory on undo either, while the kill-switch is off', async () => {
    buildGoogleCalendarConnectorSpy.mockClear();
    createRealGoogleCalendarHttpTransportSpy.mockClear();
    await connectCalendar();
    const prepared = await request(app).post('/api/nova/calendar-protection/propose').set(auth('user_a')).send(CHANGE);
    const proposalId = prepared.body.proposal.proposalId;
    const fingerprint = prepared.body.proposal.approvalFingerprint;
    await request(app).post(`/api/nova/calendar-protection/${proposalId}/present`).set(auth('user_a'));
    await request(app).post(`/api/nova/calendar-protection/${proposalId}/approve`).set(auth('user_a')).send({ approved: true, approvalFingerprint: fingerprint });
    await request(app).post(`/api/nova/calendar-protection/${proposalId}/execute`).set(auth('user_a'));

    await request(app).post(`/api/nova/calendar-protection/${proposalId}/undo`).set(auth('user_a'));

    expect(buildGoogleCalendarConnectorSpy).not.toHaveBeenCalled();
    expect(createRealGoogleCalendarHttpTransportSpy).not.toHaveBeenCalled();
  });

  it('invalid (non-offset-qualified) start/end times are rejected with 400, not 500', async () => {
    await connectCalendar();
    const res = await request(app).post('/api/nova/calendar-protection/propose').set(auth('user_a')).send({
      idempotencyKey: 'bad-times', startIso: '2026-03-01T10:00:00', endIso: '2026-03-01T10:30:00', title: 'No offset',
    });
    expect(res.status).toBe(400);
  });
});

// Phase 5J, directive §2 - route-level proof of the stale-approval fix,
// through the real propose/approve/execute routes (not calling the
// service functions directly, the way nova-calendar-protection-service.test.ts
// does) - this is what an actual Modify click on the real app does.
describe('Modify/supersession (Phase 5J, directive §2)', () => {
  it('proposing with supersedesProposalId marks the original superseded and the new one records the link', async () => {
    await connectCalendar();
    const original = await request(app).post('/api/nova/calendar-protection/propose').set(auth('user_a')).send(CHANGE);
    const originalId = original.body.proposal.proposalId;

    const replacement = await request(app).post('/api/nova/calendar-protection/propose').set(auth('user_a')).send({
      idempotencyKey: 'route-test-replacement', startIso: '2026-03-01T11:00:00.000Z', endIso: '2026-03-01T11:30:00.000Z', title: 'Protected block (moved)',
      supersedesProposalId: originalId,
    });
    expect(replacement.status).toBe(200);
    expect(replacement.body.proposal.supersedes).toBe(originalId);

    const originalAfter = await request(app).get(`/api/nova/calendar-protection/${originalId}`).set(auth('user_a'));
    expect(originalAfter.body.proposal.supersededBy).toBe(replacement.body.proposal.proposalId);
  });

  // NOTE on what this route-level test can and cannot prove: with
  // CALENDAR_PROTECTION_EXECUTION_ENABLED hardcoded false,
  // executeCalendarProtectionProposal's very first check
  // (`!executionEnabled || !connector`) short-circuits to
  // execution_disabled BEFORE it ever reaches the supersededBy check - so
  // through the REAL production route today, a superseded original still
  // reports execution_disabled, same as always, never "superseded". That
  // is correct and not a gap: the kill switch is a stronger, unconditional
  // guarantee than the supersession check, and checking it first is this
  // file's own established fail-closed pattern. The actual proof that
  // supersession independently blocks execution - i.e. what happens the
  // day the kill switch is ever lifted - is
  // nova-calendar-protection-service.test.ts's own
  // TEST_ONLY_FORCE_EXECUTION_ENABLED-based test ("THE CORE FIX"), which
  // exercises executeCalendarProtectionProposal directly with execution
  // force-enabled. This route-level test instead confirms the two
  // independent safeguards compose correctly: superseding an approved
  // proposal never weakens or bypasses the kill switch that is already
  // there.
  it('approving and then superseding a proposal does not weaken the kill switch - execute still honestly reports execution_disabled', async () => {
    await connectCalendar();
    const original = await request(app).post('/api/nova/calendar-protection/propose').set(auth('user_a')).send(CHANGE);
    const originalId = original.body.proposal.proposalId;
    const fingerprint = original.body.proposal.approvalFingerprint;
    await request(app).post(`/api/nova/calendar-protection/${originalId}/present`).set(auth('user_a'));
    await request(app).post(`/api/nova/calendar-protection/${originalId}/approve`).set(auth('user_a')).send({ approved: true, approvalFingerprint: fingerprint });

    // Modify: supersede the now-approved original with a replacement.
    await request(app).post('/api/nova/calendar-protection/propose').set(auth('user_a')).send({
      idempotencyKey: 'route-test-core-fix-replacement', startIso: '2026-03-01T11:00:00.000Z', endIso: '2026-03-01T11:30:00.000Z', title: 'Protected block (moved)',
      supersedesProposalId: originalId,
    });

    const executeRes = await request(app).post(`/api/nova/calendar-protection/${originalId}/execute`).set(auth('user_a'));
    expect(executeRes.status).toBe(200);
    expect(executeRes.body.status).toBe('execution_disabled');
  });

  it('approving an original that was superseded while awaiting approval reports superseded, not approved', async () => {
    await connectCalendar();
    const original = await request(app).post('/api/nova/calendar-protection/propose').set(auth('user_a')).send(CHANGE);
    const originalId = original.body.proposal.proposalId;
    const fingerprint = original.body.proposal.approvalFingerprint;
    await request(app).post(`/api/nova/calendar-protection/${originalId}/present`).set(auth('user_a'));

    await request(app).post('/api/nova/calendar-protection/propose').set(auth('user_a')).send({
      idempotencyKey: 'route-test-approve-after-supersede-replacement', startIso: '2026-03-01T11:00:00.000Z', endIso: '2026-03-01T11:30:00.000Z', title: 'Protected block (moved)',
      supersedesProposalId: originalId,
    });

    const approveRes = await request(app).post(`/api/nova/calendar-protection/${originalId}/approve`).set(auth('user_a')).send({ approved: true, approvalFingerprint: fingerprint });
    expect(approveRes.body.status).toBe('superseded');
  });

  it('cannot supersede a proposal that does not exist under this account - refused with 409, not a crash', async () => {
    await connectCalendar();
    const res = await request(app).post('/api/nova/calendar-protection/propose').set(auth('user_a')).send({
      idempotencyKey: 'route-test-missing-original', ...CHANGE, supersedesProposalId: 'cpp_does_not_exist',
    });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/cannot_supersede/);
  });

  it("cannot supersede another user's proposal - account isolation is structural (the lookup is scoped to the caller's own uid path)", async () => {
    await connectCalendar();
    USERS.user_b = { email: 'b@test.dev' };
    await (fakeDb as any).collection('users').doc('user_b').collection('nova_permissions').doc('current').set({ allowCalendarSignals: true, allowCalendarActions: true });
    await (fakeDb as any).collection('users').doc('user_b').collection('live_signals').doc('calendar').set({
      totalMeetingHours: 10, meetingCount: 8, backToBackCount: 1, eveningMeetingCount: 0, weekendMeetingCount: 0, windowDays: 7,
      updatedAt: new Date().toISOString(),
    });
    const victimProposal = await request(app).post('/api/nova/calendar-protection/propose').set(auth('user_b')).send(CHANGE);
    const victimProposalId = victimProposal.body.proposal.proposalId;

    const res = await request(app).post('/api/nova/calendar-protection/propose').set(auth('user_a')).send({
      idempotencyKey: 'route-test-cross-account-supersede', ...CHANGE, supersedesProposalId: victimProposalId,
    });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/cannot_supersede/);
    const victimAfter = await request(app).get(`/api/nova/calendar-protection/${victimProposalId}`).set(auth('user_b'));
    expect(victimAfter.body.proposal.supersededBy).toBeNull();
  });
});

// Phase 5G, directive §8 - the same simple, optional, user-confirmed
// outcome feedback Task Deferral's own route test already covers (see
// nova-task-deferral-route.test.ts), now also offered here.
//
// Phase 5H, directive §4 - hardened: ownership (the proposal must be a
// real document under THIS uid), valid state (only once `confirmed` -
// a REAL applied action, never offered/accepted "as though a real
// action occurred when no action occurred"), and duplicate submission
// (a resubmission replaces the prior answer, never errors).
describe('POST /api/nova/calendar-protection/:proposalId/outcome', () => {
  it('is refused (409) while the proposal is still only prepared - not yet a real applied action', async () => {
    await connectCalendar();
    const prepared = await request(app).post('/api/nova/calendar-protection/propose').set(auth('user_a')).send(CHANGE);
    const proposalId = prepared.body.proposal.proposalId;
    const res = await request(app).post(`/api/nova/calendar-protection/${proposalId}/outcome`).set(auth('user_a')).send({ outcome: 'helped' });
    expect(res.status).toBe(409);
  });

  it('accepts user-confirmed outcome feedback once the proposal is genuinely confirmed, recorded under this workflow', async () => {
    await connectCalendar();
    const prepared = await request(app).post('/api/nova/calendar-protection/propose').set(auth('user_a')).send(CHANGE);
    const proposalId = prepared.body.proposal.proposalId;
    // Real execution stays permanently disabled through this route (see
    // "execution is STILL disabled end to end" above), so a proposal can
    // never genuinely reach `confirmed` through the route itself today -
    // this writes that state directly, the same way it would exist IF a
    // real connector were ever enabled, to test the outcome route's own
    // state gate in isolation from that separate, not-yet-made decision.
    await (fakeDb as any).collection('users').doc('user_a').collection('calendar_protection_proposals').doc(proposalId).update({ state: 'confirmed' });

    const res = await request(app).post(`/api/nova/calendar-protection/${proposalId}/outcome`).set(auth('user_a')).send({ outcome: 'helped' });
    expect(res.status).toBe(200);
    expect(res.body.record.workflow).toBe('calendar_protection');
    expect(res.body.record.itemId).toBe(proposalId);
    expect(res.body.record.outcome).toBe('helped');

    // Duplicate submission (e.g. the user changes their mind) replaces
    // the prior answer rather than erroring or accumulating.
    const second = await request(app).post(`/api/nova/calendar-protection/${proposalId}/outcome`).set(auth('user_a')).send({ outcome: 'changed_plan' });
    expect(second.status).toBe(200);
    expect(second.body.record.outcome).toBe('changed_plan');
  });

  it('is refused (404) for a proposal id that does not exist under this account', async () => {
    const res = await request(app).post('/api/nova/calendar-protection/no_such_proposal/outcome').set(auth('user_a')).send({ outcome: 'helped' });
    expect(res.status).toBe(404);
  });

  it("is refused (404) for another user's real proposal - ownership is enforced, not just account isolation of the write", async () => {
    await connectCalendar();
    const prepared = await request(app).post('/api/nova/calendar-protection/propose').set(auth('user_a')).send(CHANGE);
    const proposalId = prepared.body.proposal.proposalId;
    USERS.user_b = { email: 'b@test.dev' };
    const res = await request(app).post(`/api/nova/calendar-protection/${proposalId}/outcome`).set(auth('user_b')).send({ outcome: 'helped' });
    expect(res.status).toBe(404);
  });

  it('rejects an invalid outcome value', async () => {
    await connectCalendar();
    const prepared = await request(app).post('/api/nova/calendar-protection/propose').set(auth('user_a')).send(CHANGE);
    const proposalId = prepared.body.proposal.proposalId;
    const res = await request(app).post(`/api/nova/calendar-protection/${proposalId}/outcome`).set(auth('user_a')).send({ outcome: 'not_a_real_option' });
    expect(res.status).toBe(400);
  });

  it('rejects an unauthenticated request', async () => {
    const res = await request(app).post('/api/nova/calendar-protection/some_id/outcome').send({ outcome: 'helped' });
    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});

describe('allowCalendarActions - the separate external-action permission boundary (Phase 5D, directive §3)', () => {
  it('defaults to not granted', async () => {
    const res = await request(app).get('/api/nova/calendar-protection/action-permission').set(auth('user_a'));
    expect(res.status).toBe(200);
    expect(res.body.permission.granted).toBe(false);
  });

  it('propose is refused with allowCalendarSignals alone - read consent does not authorise an action', async () => {
    await (fakeDb as any).collection('users').doc('user_a').collection('nova_permissions').doc('current').set({ allowCalendarSignals: true });
    await (fakeDb as any).collection('users').doc('user_a').collection('live_signals').doc('calendar').set({
      totalMeetingHours: 10, meetingCount: 8, backToBackCount: 1, eveningMeetingCount: 0, weekendMeetingCount: 0, windowDays: 7,
      updatedAt: new Date().toISOString(),
    });
    const res = await request(app).post('/api/nova/calendar-protection/propose').set(auth('user_a')).send(CHANGE);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('calendar_action_permission_required');
  });

  it('can be granted and withdrawn through its own route, with a visible timestamp either way', async () => {
    const grant = await request(app).post('/api/nova/calendar-protection/action-permission').set(auth('user_a')).send({ granted: true });
    expect(grant.body.permission.granted).toBe(true);
    expect(typeof grant.body.permission.grantedAt).toBe('string');

    const withdraw = await request(app).post('/api/nova/calendar-protection/action-permission').set(auth('user_a')).send({ granted: false });
    expect(withdraw.body.permission.granted).toBe(false);
    expect(typeof withdraw.body.permission.withdrawnAt).toBe('string');
  });

  it('execute is refused if the permission was withdrawn after approval - the re-check at execute time is authoritative', async () => {
    await connectCalendar(); // grants both allowCalendarSignals and allowCalendarActions
    const prepared = await request(app).post('/api/nova/calendar-protection/propose').set(auth('user_a')).send(CHANGE);
    const proposalId = prepared.body.proposal.proposalId;
    const fingerprint = prepared.body.proposal.approvalFingerprint;
    await request(app).post(`/api/nova/calendar-protection/${proposalId}/present`).set(auth('user_a'));
    await request(app).post(`/api/nova/calendar-protection/${proposalId}/approve`).set(auth('user_a')).send({ approved: true, approvalFingerprint: fingerprint });

    await request(app).post('/api/nova/calendar-protection/action-permission').set(auth('user_a')).send({ granted: false });

    const executeRes = await request(app).post(`/api/nova/calendar-protection/${proposalId}/execute`).set(auth('user_a'));
    expect(executeRes.status).toBe(403);
    expect(executeRes.body.code).toBe('calendar_action_permission_required');
  });
});

describe('read-only status and history routes', () => {
  it('GET a single proposal by id returns 404 for one that does not exist', async () => {
    const res = await request(app).get('/api/nova/calendar-protection/no-such-proposal').set(auth('user_a'));
    expect(res.status).toBe(404);
  });

  it('GET a single proposal returns its current state', async () => {
    await connectCalendar();
    const prepared = await request(app).post('/api/nova/calendar-protection/propose').set(auth('user_a')).send(CHANGE);
    const proposalId = prepared.body.proposal.proposalId;
    const res = await request(app).get(`/api/nova/calendar-protection/${proposalId}`).set(auth('user_a'));
    expect(res.status).toBe(200);
    expect(res.body.proposal.proposalId).toBe(proposalId);
  });

  it('GET history lists this user\'s proposals, most recently transitioned first', async () => {
    await connectCalendar();
    await request(app).post('/api/nova/calendar-protection/propose').set(auth('user_a')).send(CHANGE);
    await request(app).post('/api/nova/calendar-protection/propose').set(auth('user_a')).send({ ...CHANGE, idempotencyKey: 'route-test-2' });
    const res = await request(app).get('/api/nova/calendar-protection/history').set(auth('user_a'));
    expect(res.status).toBe(200);
    expect(res.body.proposals.length).toBe(2);
  });
});

// Phase 5J, directive §4 - the admin-only pilot-eligibility gate
// (nova-calendar-pilot-eligibility.ts) is the fifth layer of the
// execution-authorisation precedence contract and the ONLY writer of
// users/{uid}/platform_pilot_access/calendar_protection. These tests
// cover the route boundary that enforces that: a non-admin can never
// reach it, an admin can grant/revoke it, a malformed body is refused,
// and the grant/revoke is itself audited via logAdminAction - the same
// way every other admin grant in this codebase is.
describe('admin pilot-eligibility routes (Phase 5J, directive §4)', () => {
  const ROUTE = (uid: string) => `/api/admin/users/${uid}/calendar-protection-pilot-eligibility`;

  it('refuses a non-admin caller with 403 on both GET and POST, without touching stored eligibility', async () => {
    const getRes = await request(app).get(ROUTE('user_a')).set(auth('user_a'));
    expect(getRes.status).toBe(403);
    const postRes = await request(app).post(ROUTE('user_a')).set(auth('user_a')).send({ eligible: true });
    expect(postRes.status).toBe(403);
    expect(getDocRaw('users/user_a/platform_pilot_access/calendar_protection')).toBeUndefined();
  });

  it('refuses an unauthenticated caller on both POST and GET', async () => {
    const postRes = await request(app).post(ROUTE('user_a')).send({ eligible: true });
    expect(postRes.status).toBeGreaterThanOrEqual(400);
    const getRes = await request(app).get(ROUTE('user_a'));
    expect(getRes.status).toBeGreaterThanOrEqual(400);
  });

  it('GET defaults to not-eligible for a user with no document yet', async () => {
    const res = await request(app).get(ROUTE('user_a')).set(auth(ADMIN));
    expect(res.status).toBe(200);
    expect(res.body.state).toEqual({ eligible: false, grantedAt: null, grantedBy: null, revokedAt: null });
  });

  it('rejects a non-boolean "eligible" with 400 and writes nothing', async () => {
    const res = await request(app).post(ROUTE('user_a')).set(auth(ADMIN)).send({ eligible: 'yes' });
    expect(res.status).toBe(400);
    expect(getDocRaw('users/user_a/platform_pilot_access/calendar_protection')).toBeUndefined();
  });

  it('an admin can grant pilot eligibility, it is readable back, and it is audit-logged', async () => {
    const grant = await request(app).post(ROUTE('user_a')).set(auth(ADMIN)).send({ eligible: true });
    expect(grant.status).toBe(200);
    expect(grant.body.state.eligible).toBe(true);
    expect(grant.body.state.grantedBy).toBe(ADMIN);
    expect(typeof grant.body.state.grantedAt).toBe('string');

    const get = await request(app).get(ROUTE('user_a')).set(auth(ADMIN));
    expect(get.body.state.eligible).toBe(true);

    const logPaths = allPaths().filter((p) => p.startsWith('admin_audit_logs/'));
    expect(logPaths.length).toBe(1);
    const entry = getDocRaw(logPaths[0]) as any;
    expect(entry.action).toBe('grant_calendar_protection_pilot_eligibility');
    expect(entry.actorUid).toBe(ADMIN);
    expect(entry.targetUid).toBe('user_a');
  });

  it('an admin can revoke previously granted eligibility, and it is audit-logged as a revoke', async () => {
    await request(app).post(ROUTE('user_a')).set(auth(ADMIN)).send({ eligible: true });
    const revoke = await request(app).post(ROUTE('user_a')).set(auth(ADMIN)).send({ eligible: false });
    expect(revoke.status).toBe(200);
    expect(revoke.body.state.eligible).toBe(false);
    expect(typeof revoke.body.state.revokedAt).toBe('string');

    const logPaths = allPaths().filter((p) => p.startsWith('admin_audit_logs/'));
    expect(logPaths.length).toBe(2);
    const revokeEntry = getDocRaw(logPaths[1]) as any;
    expect(revokeEntry.action).toBe('revoke_calendar_protection_pilot_eligibility');
    expect(revokeEntry.targetUid).toBe('user_a');
  });

  it('granting pilot eligibility to an account does not, by itself, authorise any real execution - the kill switch still wins', async () => {
    await connectCalendar();
    const prepared = await request(app).post('/api/nova/calendar-protection/propose').set(auth('user_a')).send(CHANGE);
    const proposalId = prepared.body.proposal.proposalId;
    const fingerprint = prepared.body.proposal.approvalFingerprint;
    await request(app).post(`/api/nova/calendar-protection/${proposalId}/present`).set(auth('user_a'));
    await request(app).post(`/api/nova/calendar-protection/${proposalId}/approve`).set(auth('user_a')).send({ approved: true, approvalFingerprint: fingerprint });

    await request(app).post(ROUTE('user_a')).set(auth(ADMIN)).send({ eligible: true });

    const executeRes = await request(app).post(`/api/nova/calendar-protection/${proposalId}/execute`).set(auth('user_a'));
    expect(executeRes.status).toBe(200);
    expect(executeRes.body.status).toBe('execution_disabled');
  });
});
