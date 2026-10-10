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

function seedOrg(orgId: string, memberUids: string[] = []) {
  seedDoc(`organisations/${orgId}`, { name: 'Test Org', adminUids: [], memberUids });
}

beforeEach(() => resetStore());

describe('GET /api/org/:orgId/work-design-interventions-summary', () => {
  it('requires authentication', async () => {
    seedOrg(ORG, ['a1']);
    const res = await request(app).get(`/api/org/${ORG}/work-design-interventions-summary`);
    expect(res.status).toBe(401);
  });

  it('refuses a non-member', async () => {
    seedOrg(ORG, ['a1']);
    const res = await request(app).get(`/api/org/${ORG}/work-design-interventions-summary`).set(auth('stranger'));
    expect(res.status).toBe(403);
  });

  it('a plain member (no admin/manager rights needed) can access it', async () => {
    seedOrg(ORG, ['a1']);
    const res = await request(app).get(`/api/org/${ORG}/work-design-interventions-summary`).set(auth('a1'));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ totalTried: 0, byStatus: {}, byOutcome: {}, recent: [] });
  });

  it('aggregates by status and outcome without ever naming a team', async () => {
    seedOrg(ORG, ['a1']);
    seedDoc(`organisations/${ORG}/work_design_interventions/i1`, { team: 'Secret Team', signalKey: 'meeting_pressure', status: 'trialling', outcomeRating: null });
    seedDoc(`organisations/${ORG}/work_design_interventions/i2`, { team: 'Secret Team', signalKey: 'focus_fragmentation', status: 'completed', outcomeRating: 'useful' });
    seedDoc(`organisations/${ORG}/work_design_interventions/i3`, { team: 'Other Team', signalKey: 'meeting_pressure', status: 'completed', outcomeRating: 'no_clear_difference' });

    const res = await request(app).get(`/api/org/${ORG}/work-design-interventions-summary`).set(auth('a1'));
    expect(res.status).toBe(200);
    expect(res.body.totalTried).toBe(3);
    expect(res.body.byStatus).toEqual({ trialling: 1, completed: 2 });
    expect(res.body.byOutcome).toEqual({ useful: 1, no_clear_difference: 1 });
    expect(JSON.stringify(res.body)).not.toContain('Secret Team');
    expect(JSON.stringify(res.body)).not.toContain('Other Team');
  });
});
