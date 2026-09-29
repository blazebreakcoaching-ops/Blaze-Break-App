import { describe, it, expect, beforeEach, vi } from 'vitest';

// Route tests for GET /api/org/me - the source of truth the sidebar uses to
// decide whether "My Team" / "HR Escalation" nav entries appear at all.
// The point of these: isHrViewer here must never diverge from what
// GET /api/org/:orgId/hr-dashboard actually authorizes (hrViewerUids OR
// admin) - a prior gap here meant an org admin had real, working API
// access to that dashboard but no nav entry to ever reach it.
const h = vi.hoisted(() => {
  process.env.TEST_MODE = 'true';
  process.env.NODE_ENV = 'test';
  return {};
});

vi.mock('express-rate-limit', () => ({ default: () => (_req: any, _res: any, next: any) => next() }));
vi.mock('firebase-admin/app', () => ({ initializeApp: vi.fn(), getApps: () => [{}] }));
vi.mock('firebase-admin/app-check', () => ({ getAppCheck: () => ({ verifyToken: vi.fn() }) }));
vi.mock('firebase-admin/auth', () => ({ getAuth: () => ({ verifyIdToken: async (t: string) => ({ uid: t, email: `${t}@test.dev` }) }) }));
vi.mock('firebase-admin/firestore', async () => {
  const fake = await import('./test/fake-firestore');
  return { getFirestore: () => fake.fakeDb, FieldValue: fake.FakeFieldValue };
});

import request from 'supertest';
import { app } from './server';
import { resetStore, seedDoc } from './test/fake-firestore';

const ORG = 'org_1';
const auth = (uid: string) => ({ Authorization: `Bearer ${uid}` });

beforeEach(() => {
  resetStore();
});

describe('GET /api/org/me', () => {
  it('returns organisationId: null when the user is not in an org', async () => {
    seedDoc('users/lone_user', {});
    const res = await request(app).get('/api/org/me').set(auth('lone_user'));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ organisationId: null });
  });

  it('a plain member sees no HR access and no managed teams', async () => {
    seedDoc(`organisations/${ORG}`, { adminUids: ['owner_1'], memberUids: ['member_1'], hrViewerUids: [], teamManagers: {} });
    seedDoc('users/member_1', { organisationId: ORG });
    const res = await request(app).get('/api/org/me').set(auth('member_1'));
    expect(res.status).toBe(200);
    expect(res.body.isOrgAdmin).toBe(false);
    expect(res.body.isHrViewer).toBe(false);
    expect(res.body.managedTeams).toEqual([]);
    expect(res.body.joinCode).toBeUndefined();
  });

  it('someone on the hrViewerUids allow-list gets isHrViewer: true even without being an admin', async () => {
    seedDoc(`organisations/${ORG}`, { adminUids: ['owner_1'], memberUids: ['hr_1'], hrViewerUids: ['hr_1'], teamManagers: {} });
    seedDoc('users/hr_1', { organisationId: ORG });
    const res = await request(app).get('/api/org/me').set(auth('hr_1'));
    expect(res.body.isOrgAdmin).toBe(false);
    expect(res.body.isHrViewer).toBe(true);
  });

  it('an org admin gets isHrViewer: true even when not separately added to hrViewerUids - matches the hr-dashboard route\'s own access rule', async () => {
    seedDoc(`organisations/${ORG}`, { adminUids: ['owner_1'], memberUids: ['owner_1'], hrViewerUids: [], teamManagers: {}, joinCode: 'ABC123', privacyThreshold: 5 });
    seedDoc('users/owner_1', { organisationId: ORG });
    const res = await request(app).get('/api/org/me').set(auth('owner_1'));
    expect(res.status).toBe(200);
    expect(res.body.isOrgAdmin).toBe(true);
    expect(res.body.isHrViewer).toBe(true);
    expect(res.body.joinCode).toBe('ABC123');
    expect(res.body.privacyThreshold).toBe(5);
  });

  it('reflects a real team-manager designation in managedTeams', async () => {
    seedDoc(`organisations/${ORG}`, { adminUids: ['owner_1'], memberUids: ['mgr_1'], hrViewerUids: [], teamManagers: { mgr_1: ['Team A', 'Team B'] } });
    seedDoc('users/mgr_1', { organisationId: ORG });
    const res = await request(app).get('/api/org/me').set(auth('mgr_1'));
    expect(res.body.managedTeams.sort()).toEqual(['Team A', 'Team B']);
  });
});
