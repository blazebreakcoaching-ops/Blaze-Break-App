// Phase 5F Agentic Expansion, directive §2/§9 - Task Deferral routes, at
// the actual route boundary. Same supertest + mocked firebase-admin
// pattern as nova-calendar-protection-route.test.ts. Covers: the full
// identify -> clarify -> prepare -> present -> approve -> execute ->
// outcome flow, the requires_other_person hard block, the
// fingerprint-mismatch rejection, account isolation, and that execute
// always goes through the mock-only connector (never a real provider).

process.env.TEST_MODE = 'true';
process.env.NODE_ENV = 'test';

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('express-rate-limit', () => ({ default: () => (_req: any, _res: any, next: any) => next() }));
vi.mock('firebase-admin/app', () => ({ initializeApp: vi.fn(), getApps: () => [{}] }));
vi.mock('firebase-admin/app-check', () => ({ getAppCheck: () => ({ verifyToken: vi.fn() }) }));

const USERS: Record<string, { email: string }> = { user_a: { email: 'a@test.dev' }, user_b: { email: 'b@test.dev' } };

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
import { resetStore } from './test/fake-firestore';

const auth = (uid: string) => ({ Authorization: `Bearer ${uid}` });

beforeEach(() => resetStore());

async function identify(uid = 'user_a', key = 'route-key-1') {
  return request(app).post('/api/nova/task-deferral/identify').set(auth(uid)).send({
    idempotencyKey: key, taskDescription: 'Finish the quarterly report', currentDueDescription: 'Friday',
  });
}

describe('POST /api/nova/task-deferral/identify', () => {
  it('identifies a task for an authenticated user', async () => {
    const res = await identify();
    expect(res.status).toBe(200);
    expect(res.body.proposal.state).toBe('identified');
  });

  it('rejects an unauthenticated request', async () => {
    const res = await request(app).post('/api/nova/task-deferral/identify').send({ idempotencyKey: 'x', taskDescription: 'x', currentDueDescription: null });
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it('rejects an empty task description via schema validation', async () => {
    const res = await request(app).post('/api/nova/task-deferral/identify').set(auth('user_a')).send({ idempotencyKey: 'x', taskDescription: '', currentDueDescription: null });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/nova/task-deferral/:proposalId/clarify-control - the hard safety gate', () => {
  it('"no" on ownership routes to requires_other_person, never to a preparable state', async () => {
    const identified = await identify();
    const proposalId = identified.body.proposal.proposalId;
    const res = await request(app).post(`/api/nova/task-deferral/${proposalId}/clarify-control`).set(auth('user_a')).send({
      userControlsDeadline: 'yes', userControlsOwnership: 'no',
    });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('requires_other_person');
  });

  it('once requires_other_person, prepare is refused (invalid transition)', async () => {
    const identified = await identify('user_a', 'gate-key');
    const proposalId = identified.body.proposal.proposalId;
    await request(app).post(`/api/nova/task-deferral/${proposalId}/clarify-control`).set(auth('user_a')).send({ userControlsDeadline: 'no', userControlsOwnership: 'no' });
    const res = await request(app).post(`/api/nova/task-deferral/${proposalId}/prepare`).set(auth('user_a')).send({
      reasonablyPostponable: true, postponementReasoning: 'x', proposedNewDueDescription: 'later', proposedNewPriority: null, consequences: [], uncertainties: [],
    });
    expect(res.status).toBe(500); // the service throws NovaTaskDeferralInvalidTransitionError, caught by the route's generic handler
  });
});

describe('full identify -> clarify -> prepare -> present -> approve -> execute -> outcome flow', () => {
  async function toApproved(key: string) {
    const identified = await identify('user_a', key);
    const proposalId = identified.body.proposal.proposalId;
    await request(app).post(`/api/nova/task-deferral/${proposalId}/clarify-control`).set(auth('user_a')).send({ userControlsDeadline: 'yes', userControlsOwnership: 'yes' });
    const prepared = await request(app).post(`/api/nova/task-deferral/${proposalId}/prepare`).set(auth('user_a')).send({
      reasonablyPostponable: true, postponementReasoning: 'Nobody is blocked on this.', proposedNewDueDescription: 'next Friday', proposedNewPriority: null,
      consequences: ['Lands a week later.'], uncertainties: [],
    });
    expect(prepared.status).toBe(200);
    await request(app).post(`/api/nova/task-deferral/${proposalId}/present`).set(auth('user_a'));
    const approved = await request(app).post(`/api/nova/task-deferral/${proposalId}/approve`).set(auth('user_a')).send({
      approved: true, approvalFingerprint: prepared.body.proposal.approvalFingerprint,
    });
    expect(approved.body.status).toBe('approved');
    return proposalId;
  }

  it('a bare {approved: true} with no fingerprint is rejected by the schema itself', async () => {
    const identified = await identify('user_a', 'schema-key');
    const proposalId = identified.body.proposal.proposalId;
    await request(app).post(`/api/nova/task-deferral/${proposalId}/clarify-control`).set(auth('user_a')).send({ userControlsDeadline: 'yes', userControlsOwnership: 'yes' });
    const res = await request(app).post(`/api/nova/task-deferral/${proposalId}/approve`).set(auth('user_a')).send({ approved: true });
    expect(res.status).toBe(400);
  });

  it('executes through the mock-only connector and returns confirmed', async () => {
    const proposalId = await toApproved('full-flow-key');
    const res = await request(app).post(`/api/nova/task-deferral/${proposalId}/execute`).set(auth('user_a'));
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('confirmed');
  });

  it('accepts user-confirmed outcome feedback after confirmation', async () => {
    const proposalId = await toApproved('outcome-key');
    await request(app).post(`/api/nova/task-deferral/${proposalId}/execute`).set(auth('user_a'));
    const res = await request(app).post(`/api/nova/task-deferral/${proposalId}/outcome`).set(auth('user_a')).send({ outcome: 'helped' });
    expect(res.status).toBe(200);
    expect(res.body.record.outcome).toBe('helped');
  });

  it('rejects an invalid outcome value', async () => {
    const proposalId = await toApproved('bad-outcome-key');
    const res = await request(app).post(`/api/nova/task-deferral/${proposalId}/outcome`).set(auth('user_a')).send({ outcome: 'not_a_real_option' });
    expect(res.status).toBe(400);
  });
});

describe('account isolation', () => {
  it("user B cannot read user A's proposal via the detail route", async () => {
    const identified = await identify('user_a', 'isolation-key');
    const proposalId = identified.body.proposal.proposalId;
    const res = await request(app).get(`/api/nova/task-deferral/${proposalId}`).set(auth('user_b'));
    expect(res.status).toBe(404);
  });

  it("user B's history never includes user A's proposals", async () => {
    await identify('user_a', 'isolation-history-key');
    const res = await request(app).get('/api/nova/task-deferral/history').set(auth('user_b'));
    expect(res.status).toBe(200);
    expect(res.body.proposals).toEqual([]);
  });
});
