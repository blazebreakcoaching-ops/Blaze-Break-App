import { describe, it, expect, beforeEach, vi } from 'vitest';

// Command Centre: suspending an account disables it in Firebase Auth and
// revokes every session. Previously any platform_admin (users.manage) could
// suspend the Platform Owner - locking the founder out of their platform -
// or any fellow administrator. Now only a Platform Owner may suspend or
// reinstate platform staff; self-suspension and suspending the last
// Platform Owner are refused; unknown accounts return 404.
const h = vi.hoisted(() => {
  process.env.TEST_MODE = 'true';
  process.env.NODE_ENV = 'test';
  const accounts: Record<string, { email: string; emailVerified: boolean; customClaims: Record<string, unknown> }> = {
    owner_1: { email: 'owner_1@test.dev', emailVerified: true, customClaims: { role: 'platform_owner', platformOwner: true } },
    padmin_1: { email: 'padmin_1@test.dev', emailVerified: true, customClaims: { role: 'platform_admin' } },
    padmin_2: { email: 'padmin_2@test.dev', emailVerified: true, customClaims: { role: 'platform_admin' } },
    legacy_admin: { email: 'legacy@test.dev', emailVerified: true, customClaims: { admin: true } },
    bootstrap: { email: 'teampublication@googlemail.com', emailVerified: true, customClaims: {} },
    customer: { email: 'customer@test.dev', emailVerified: true, customClaims: {} },
  };
  return { accounts, updateUser: vi.fn(async () => {}), revokeRefreshTokens: vi.fn(async () => {}) };
});

vi.mock('express-rate-limit', () => ({ default: () => (_req: any, _res: any, next: any) => next(), ipKeyGenerator: (ip: string) => ip }));
vi.mock('firebase-admin/app', () => ({ initializeApp: vi.fn(), getApps: () => [{}] }));
vi.mock('firebase-admin/app-check', () => ({ getAppCheck: () => ({ verifyToken: vi.fn() }) }));
vi.mock('firebase-admin/auth', () => ({
  getAuth: () => ({
    verifyIdToken: async (t: string) => ({
      uid: t, email: h.accounts[t]?.email ?? `${t}@test.dev`, email_verified: true,
      ...(h.accounts[t]?.customClaims ?? {}),
    }),
    getUser: async (uid: string) => {
      const a = h.accounts[uid];
      if (!a) { const e: any = new Error('no user'); e.code = 'auth/user-not-found'; throw e; }
      return { uid, ...a };
    },
    updateUser: h.updateUser,
    revokeRefreshTokens: h.revokeRefreshTokens,
  }),
}));
vi.mock('firebase-admin/firestore', async () => {
  const fake = await import('./test/fake-firestore');
  return { getFirestore: () => fake.fakeDb, FieldValue: fake.FakeFieldValue };
});
vi.mock('twilio', () => ({ default: () => ({ messages: { create: vi.fn() } }) }));

import request from 'supertest';
import { app } from './server';
import { resetStore, seedDoc } from './test/fake-firestore';

const auth = (uid: string) => ({ Authorization: `Bearer ${uid}` });
const suspend = (actor: string, target: string, value = true) =>
  request(app).post(`/api/admin/users/${target}/suspend`).set(auth(actor)).send({ suspend: value });

beforeEach(() => {
  resetStore();
  h.updateUser.mockClear();
  h.revokeRefreshTokens.mockClear();
  seedDoc('admin_users/owner_1', { role: 'platform_owner', status: 'active' });
});

describe('POST /api/admin/users/:uid/suspend - platform staff protection', () => {
  for (const target of ['owner_1', 'padmin_2', 'legacy_admin', 'bootstrap']) {
    it(`a platform_admin cannot suspend ${target}`, async () => {
      const res = await suspend('padmin_1', target);
      expect(res.status).toBe(403);
      expect(h.updateUser).not.toHaveBeenCalled();
      expect(h.revokeRefreshTokens).not.toHaveBeenCalled();
    });
  }

  it('a platform_admin cannot reinstate a suspended administrator either', async () => {
    const res = await suspend('padmin_1', 'padmin_2', false);
    expect(res.status).toBe(403);
    expect(h.updateUser).not.toHaveBeenCalled();
  });

  it('a platform_admin can still suspend an ordinary customer (and sessions are revoked)', async () => {
    const res = await suspend('padmin_1', 'customer');
    expect(res.status).toBe(200);
    expect(h.updateUser).toHaveBeenCalledWith('customer', { disabled: true });
    expect(h.revokeRefreshTokens).toHaveBeenCalledWith('customer');
  });

  it('a Platform Owner can suspend a platform administrator', async () => {
    const res = await suspend('owner_1', 'padmin_2');
    expect(res.status).toBe(200);
    expect(h.updateUser).toHaveBeenCalledWith('padmin_2', { disabled: true });
  });

  it('nobody can suspend their own account', async () => {
    expect((await suspend('owner_1', 'owner_1')).status).toBe(400);
    expect((await suspend('padmin_1', 'padmin_1')).status).toBe(400);
    expect(h.updateUser).not.toHaveBeenCalled();
  });

  it('the last Platform Owner cannot be suspended, even by another owner-level account', async () => {
    // bootstrap is a verified owner identity acting; owner_1 is the only
    // recorded platform_owner in admin_users.
    const res = await suspend('bootstrap', 'owner_1');
    expect(res.status).toBe(409);
    expect(h.updateUser).not.toHaveBeenCalled();
  });

  it('an unknown account returns 404, not a server error', async () => {
    const res = await suspend('owner_1', 'does_not_exist');
    expect(res.status).toBe(404);
  });
});

describe('Command Centre account lookups for unknown accounts', () => {
  it('GET /api/admin/users/:uid returns 404', async () => {
    const res = await request(app).get('/api/admin/users/does_not_exist').set(auth('owner_1'));
    expect(res.status).toBe(404);
  });
});
