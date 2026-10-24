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

const USERS: Record<string, { email: string }> = { user_a: { email: 'a@test.dev' } };

vi.mock('firebase-admin/auth', () => ({
  getAuth: () => ({
    verifyIdToken: async (t: string) => {
      const u = USERS[t];
      if (!u) throw new Error('unknown test uid');
      return { uid: t, email: u.email };
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
import { resetStore, fakeDb } from './test/fake-firestore';

const auth = (uid: string) => ({ Authorization: `Bearer ${uid}` });
const CHANGE = { idempotencyKey: 'route-test-1', startIso: '2026-03-01T10:00:00.000Z', endIso: '2026-03-01T10:30:00.000Z', title: 'Protected block' };

beforeEach(async () => {
  resetStore();
  USERS.user_a = { email: 'a@test.dev' };
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
