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

function seedOrg(orgId: string, opts: { memberUids?: string[]; adminUids?: string[]; hrViewerUids?: string[]; privacyThreshold?: number } = {}) {
  seedDoc(`organisations/${orgId}`, {
    name: 'Test Org',
    adminUids: opts.adminUids || [],
    memberUids: opts.memberUids || [],
    hrViewerUids: opts.hrViewerUids || [],
    privacyThreshold: opts.privacyThreshold ?? 3,
  });
}

function consenting(uid: string) {
  seedDoc(`users/${uid}`, { shareAnonymizedDataWithOrg: true });
}

function connectCalendar(uid: string) {
  seedDoc(`users/${uid}/nova_permissions/current`, { allowCalendarSignals: true });
  seedDoc(`users/${uid}/live_signals/calendar`, { updatedAt: new Date().toISOString() });
}

beforeEach(() => resetStore());

describe('GET /api/org/:orgId/my-privacy-status — Employee Trust Mirror', () => {
  it('returns the fixed cannotSee list regardless of org state', async () => {
    seedOrg(ORG, { memberUids: ['a1'] });
    const res = await request(app).get(`/api/org/${ORG}/my-privacy-status`).set(auth('a1'));
    expect(res.status).toBe(200);
    expect(res.body.cannotSee).toEqual(expect.arrayContaining(['Your Nova conversations', 'Your journal']));
  });

  it('marks every canSee category inactive when none of the backing features are in use', async () => {
    seedOrg(ORG, { memberUids: ['a1'] });
    const res = await request(app).get(`/api/org/${ORG}/my-privacy-status`).set(auth('a1'));
    const categories = res.body.canSee as { key: string; active: boolean }[];
    expect(categories.every((c) => c.active === false)).toBe(true);
  });

  it('marks meeting_pressure active once a consenting member has a fresh calendar connection', async () => {
    seedOrg(ORG, { memberUids: ['a1'] });
    consenting('a1');
    connectCalendar('a1');
    const res = await request(app).get(`/api/org/${ORG}/my-privacy-status`).set(auth('a1'));
    const meetingPressure = res.body.canSee.find((c: any) => c.key === 'meeting_pressure');
    expect(meetingPressure.active).toBe(true);
  });

  it('marks team_voice active once the org has an anonymous suggestion on record', async () => {
    seedOrg(ORG, { memberUids: ['a1'] });
    seedDoc(`organisations/${ORG}/anonymous_suggestions/s1`, { text: 'something' });
    const res = await request(app).get(`/api/org/${ORG}/my-privacy-status`).set(auth('a1'));
    const teamVoice = res.body.canSee.find((c: any) => c.key === 'team_voice');
    expect(teamVoice.active).toBe(true);
  });

  it('marks intervention_outcomes active once the org has a work design intervention on record', async () => {
    seedOrg(ORG, { memberUids: ['a1'] });
    seedDoc(`organisations/${ORG}/work_design_interventions/i1`, { team: 'Team A', status: 'active' });
    const res = await request(app).get(`/api/org/${ORG}/my-privacy-status`).set(auth('a1'));
    const outcomes = res.body.canSee.find((c: any) => c.key === 'intervention_outcomes');
    expect(outcomes.active).toBe(true);
  });
});

describe('GET /api/org/:orgId/privacy-receipts', () => {
  it('requires authentication', async () => {
    seedOrg(ORG, { memberUids: ['a1'] });
    const res = await request(app).get(`/api/org/${ORG}/privacy-receipts`);
    expect(res.status).toBe(401);
  });

  it('refuses a non-member', async () => {
    seedOrg(ORG, { memberUids: ['a1'] });
    const res = await request(app).get(`/api/org/${ORG}/privacy-receipts`).set(auth('stranger'));
    expect(res.status).toBe(403);
  });

  it('a plain member can read receipts', async () => {
    seedOrg(ORG, { memberUids: ['a1'] });
    const res = await request(app).get(`/api/org/${ORG}/privacy-receipts`).set(auth('a1'));
    expect(res.status).toBe(200);
    expect(res.body.receipts).toEqual([]);
  });

  it('records a receipt when an admin changes the privacy threshold via /settings', async () => {
    seedOrg(ORG, { memberUids: ['a1', 'admin1'], adminUids: ['admin1'], privacyThreshold: 5 });
    const settingsRes = await request(app)
      .post(`/api/org/${ORG}/settings`)
      .set(auth('admin1'))
      .send({ privacyThreshold: 10 });
    expect(settingsRes.status).toBe(200);

    const res = await request(app).get(`/api/org/${ORG}/privacy-receipts`).set(auth('a1'));
    expect(res.body.receipts).toHaveLength(1);
    expect(res.body.receipts[0].category).toBe('privacy_threshold');
    expect(res.body.receipts[0].summary).toContain('5');
    expect(res.body.receipts[0].summary).toContain('10');
  });

  it('does not record a receipt when /settings is called without changing the threshold', async () => {
    seedOrg(ORG, { memberUids: ['a1', 'admin1'], adminUids: ['admin1'], privacyThreshold: 5 });
    await request(app).post(`/api/org/${ORG}/settings`).set(auth('admin1')).send({ name: 'New Name' });

    const res = await request(app).get(`/api/org/${ORG}/privacy-receipts`).set(auth('a1'));
    expect(res.body.receipts).toHaveLength(0);
  });

  it('records a receipt when hr-viewers changes, without naming any individual', async () => {
    seedOrg(ORG, { memberUids: ['a1', 'admin1', 'hr1'], adminUids: ['admin1'], hrViewerUids: [] });
    const res1 = await request(app)
      .post(`/api/org/${ORG}/hr-viewers`)
      .set(auth('admin1'))
      .send({ uids: ['hr1'] });
    expect(res1.status).toBe(200);

    const res = await request(app).get(`/api/org/${ORG}/privacy-receipts`).set(auth('a1'));
    expect(res.body.receipts).toHaveLength(1);
    expect(res.body.receipts[0].category).toBe('hr_viewers');
    expect(res.body.receipts[0].summary).not.toContain('hr1');
  });
});
