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
  await (fakeDb as any).collection('users').doc('user_a').collection('nova_permissions').doc('current').set({ allowCalendarSignals: true });
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
});
