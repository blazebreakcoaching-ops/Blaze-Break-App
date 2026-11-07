import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  process.env.TEST_MODE = 'true';
  process.env.NODE_ENV = 'test';
});
vi.mock('express-rate-limit', () => ({ default: () => (_req: any, _res: any, next: any) => next() }));
vi.mock('firebase-admin/app', () => ({ initializeApp: vi.fn(), getApps: () => [{}] }));
vi.mock('firebase-admin/app-check', () => ({ getAppCheck: () => ({ verifyToken: vi.fn() }) }));
vi.mock('firebase-admin/auth', () => ({
  getAuth: () => ({ verifyIdToken: async (token: string) => ({ uid: token, email: `${token}@test.dev` }) }),
}));
vi.mock('firebase-admin/firestore', async () => {
  const fake = await import('./test/fake-firestore');
  return { getFirestore: () => fake.fakeDb, FieldValue: fake.FakeFieldValue };
});
vi.mock('twilio', () => ({ default: () => ({ messages: { create: vi.fn() } }) }));

import request from 'supertest';
import { app } from './server';
import { resetStore, seedDoc } from './test/fake-firestore';

const ORG = 'company_a';
const auth = (uid: string) => ({ Authorization: `Bearer ${uid}` });
const protectedRoutes = [
  '/my-privacy-status', '/privacy-receipts', '/recognition',
  '/suggestions', '/cost-inputs', '/challenges',
  '/work-design-interventions-summary', '/action-budget',
  '/what-works-here', '/work-design-drift',
];

beforeEach(() => {
  resetStore();
  seedDoc(`organisations/${ORG}`, {
    name: 'Company A', memberUids: ['former_employee', 'active_employee'],
    adminUids: [], privacyThreshold: 5, memberTeams: {},
  });
  seedDoc(`organisations/${ORG}/members/former_employee`, { role: 'member', status: 'suspended' });
  seedDoc(`organisations/${ORG}/members/active_employee`, { role: 'member', status: 'active' });
});

describe('organisation routes reject stale membership arrays', () => {
  it.each(protectedRoutes)('suspended users cannot access GET %s', async (path) => {
    const res = await request(app).get(`/api/org/${ORG}${path}`).set(auth('former_employee'));
    expect(res.status).toBe(403);
  });

  it.each(['/recognition', '/suggestions', '/challenges/example/join'])(
    'suspended users cannot modify company data with POST %s', async (path) => {
      const res = await request(app).post(`/api/org/${ORG}${path}`)
        .set(auth('former_employee')).send({ message: 'not authorised' });
      expect(res.status).toBe(403);
    }
  );

  it('active users retain access to non-sensitive organisation cost inputs', async () => {
    const res = await request(app).get(`/api/org/${ORG}/cost-inputs`).set(auth('active_employee'));
    expect(res.status).toBe(200);
  });

  it('a member of another company cannot access company A records', async () => {
    seedDoc('organisations/company_b', { name: 'Company B', memberUids: ['outsider'], adminUids: [] });
    seedDoc('organisations/company_b/members/outsider', { role: 'member', status: 'active' });
    const res = await request(app).get(`/api/org/${ORG}/cost-inputs`).set(auth('outsider'));
    expect(res.status).toBe(403);
  });
});
