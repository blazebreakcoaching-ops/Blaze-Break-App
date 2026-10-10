import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.hoisted(() => {
  process.env.TEST_MODE = 'true';
  process.env.NODE_ENV = 'test';
});

vi.mock('express-rate-limit', () => ({ default: () => (_req: any, _res: any, next: any) => next() }));
vi.mock('firebase-admin/app', () => ({ initializeApp: vi.fn(), getApps: () => [{}] }));
vi.mock('firebase-admin/app-check', () => ({ getAppCheck: () => ({ verifyToken: vi.fn() }) }));
vi.mock('firebase-admin/auth', () => ({ getAuth: () => ({ verifyIdToken: async (t: string) => ({ uid: t, email: `${t}@test.dev` }) }) }));
vi.mock('firebase-admin/firestore', async () => {
  const fake = await import('./test/fake-firestore');
  return { getFirestore: () => fake.fakeDb, FieldValue: fake.FakeFieldValue };
});
vi.mock('twilio', () => ({ default: () => ({ messages: { create: vi.fn() } }) }));

import request from 'supertest';
import { app } from './server';
import { seedDoc, resetStore } from './test/fake-firestore';

const ORG = 'org_1';
const auth = (uid: string) => ({ Authorization: `Bearer ${uid}` });

function seedOrg(orgId: string, opts: { adminUids?: string[]; memberUids?: string[]; privacyThreshold?: number } = {}) {
  seedDoc(`organisations/${orgId}`, {
    name: 'Test Org',
    adminUids: opts.adminUids || [],
    memberUids: opts.memberUids || [],
    privacyThreshold: opts.privacyThreshold ?? 3,
  });
}

function connectCalendar(uid: string, metrics: { totalMeetingHours: number; backToBackCount: number; eveningMeetingCount: number; weekendMeetingCount: number }) {
  seedDoc(`users/${uid}`, { shareAnonymizedDataWithOrg: true });
  seedDoc(`users/${uid}/nova_permissions/current`, { allowCalendarSignals: true });
  seedDoc(`users/${uid}/live_signals/calendar`, { updatedAt: new Date().toISOString(), ...metrics });
}

beforeEach(() => resetStore());

describe('POST /api/org/:orgId/workplace-policies', () => {
  it('requires authentication', async () => {
    const res = await request(app).post(`/api/org/${ORG}/workplace-policies`).send({ type: 'no_evening_meetings', label: 'No evenings' });
    expect(res.status).toBe(401);
  });

  it('refuses a non-admin member', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1', 'member_1'] });
    const res = await request(app).post(`/api/org/${ORG}/workplace-policies`).set(auth('member_1')).send({ type: 'no_evening_meetings', label: 'No evenings' });
    expect(res.status).toBe(403);
  });

  it('an admin can declare a policy', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1'] });
    const res = await request(app).post(`/api/org/${ORG}/workplace-policies`).set(auth('owner_1')).send({ type: 'no_evening_meetings', label: 'No evenings' });
    expect(res.status).toBe(200);
    expect(res.body.policy.type).toBe('no_evening_meetings');
  });

  it('rejects an invalid body with 400', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1'] });
    const res = await request(app).post(`/api/org/${ORG}/workplace-policies`).set(auth('owner_1')).send({ type: 'no_friday_meetings', label: 'x' });
    expect(res.status).toBe(400);
  });
});

describe('GET /api/org/:orgId/workplace-policies — Policy-to-Practice Gap', () => {
  it('returns gap: null when the cohort is not big enough to compute an aggregate', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1', 'a1'] });
    connectCalendar('a1', { totalMeetingHours: 20, backToBackCount: 2, eveningMeetingCount: 5, weekendMeetingCount: 0 });
    await request(app).post(`/api/org/${ORG}/workplace-policies`).set(auth('owner_1')).send({ type: 'no_evening_meetings', label: 'No evenings' });

    const res = await request(app).get(`/api/org/${ORG}/workplace-policies`).set(auth('owner_1'));
    expect(res.status).toBe(200);
    expect(res.body.policies[0].gap).toBeNull();
    expect(res.body.policies[0].cohortSufficient).toBe(false);
  });

  it('flags a real gap when the declared policy does not match the observed pattern', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1', 'a1', 'a2', 'a3'] });
    ['a1', 'a2', 'a3'].forEach((uid) => connectCalendar(uid, { totalMeetingHours: 20, backToBackCount: 2, eveningMeetingCount: 5, weekendMeetingCount: 0 }));
    await request(app).post(`/api/org/${ORG}/workplace-policies`).set(auth('owner_1')).send({ type: 'no_evening_meetings', label: 'No evenings' });

    const res = await request(app).get(`/api/org/${ORG}/workplace-policies`).set(auth('owner_1'));
    expect(res.body.policies[0].gap).not.toBeNull();
    expect(res.body.policies[0].gap.message).toContain('100%');
  });

  it('returns gap: null when the declared policy is actually being followed', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1', 'a1', 'a2', 'a3'] });
    ['a1', 'a2', 'a3'].forEach((uid) => connectCalendar(uid, { totalMeetingHours: 20, backToBackCount: 2, eveningMeetingCount: 0, weekendMeetingCount: 0 }));
    await request(app).post(`/api/org/${ORG}/workplace-policies`).set(auth('owner_1')).send({ type: 'no_evening_meetings', label: 'No evenings' });

    const res = await request(app).get(`/api/org/${ORG}/workplace-policies`).set(auth('owner_1'));
    expect(res.body.policies[0].gap).toBeNull();
    expect(res.body.policies[0].cohortSufficient).toBe(true);
  });

  it('refuses a non-admin member', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1', 'member_1'] });
    const res = await request(app).get(`/api/org/${ORG}/workplace-policies`).set(auth('member_1'));
    expect(res.status).toBe(403);
  });
});

describe('DELETE /api/org/:orgId/workplace-policies/:id', () => {
  it('an admin can delete a declared policy', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1'] });
    const createRes = await request(app).post(`/api/org/${ORG}/workplace-policies`).set(auth('owner_1')).send({ type: 'no_evening_meetings', label: 'No evenings' });
    const id = createRes.body.policy.id;

    const res = await request(app).delete(`/api/org/${ORG}/workplace-policies/${id}`).set(auth('owner_1'));
    expect(res.status).toBe(200);

    const listRes = await request(app).get(`/api/org/${ORG}/workplace-policies`).set(auth('owner_1'));
    expect(listRes.body.policies).toHaveLength(0);
  });

  it('404s for a non-existent policy', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1'] });
    const res = await request(app).delete(`/api/org/${ORG}/workplace-policies/does_not_exist`).set(auth('owner_1'));
    expect(res.status).toBe(404);
  });
});
