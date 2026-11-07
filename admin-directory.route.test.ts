import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => {
  process.env.TEST_MODE = 'true';
  process.env.NODE_ENV = 'test';
  const accounts: any[] = [];
  const notFound = () => Object.assign(new Error('not found'), { code: 'auth/user-not-found' });
  return {
    accounts,
    listUsers: vi.fn(async (size: number, token?: string) => {
      const offset = token ? Number(token) : 0;
      const page = accounts.slice(offset, offset + size);
      return { users: page, pageToken: offset + size < accounts.length ? String(offset + size) : undefined };
    }),
    getUser: vi.fn(async (uid: string) => {
      const record = accounts.find(account => account.uid === uid);
      if (!record) throw notFound();
      return record;
    }),
    getUserByEmail: vi.fn(async (email: string) => {
      const record = accounts.find(account => account.email?.toLowerCase() === email.toLowerCase());
      if (!record) throw notFound();
      return record;
    }),
  };
});

vi.mock('express-rate-limit', () => ({ default: () => (_req: any, _res: any, next: any) => next() }));
vi.mock('firebase-admin/app', () => ({ initializeApp: vi.fn(), getApps: () => [{}] }));
vi.mock('firebase-admin/app-check', () => ({ getAppCheck: () => ({ verifyToken: vi.fn() }) }));
vi.mock('firebase-admin/auth', () => ({
  getAuth: () => ({
    verifyIdToken: async (uid: string) => ({ uid, email: uid + '@test.dev', role: uid === 'owner_1' ? 'platform_owner' : undefined }),
    listUsers: h.listUsers, getUser: h.getUser, getUserByEmail: h.getUserByEmail,
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

const auth = (uid: string) => ({ Authorization: 'Bearer ' + uid });
const account = (uid: string, email: string | null = uid + '@test.dev') => ({
  uid, email, displayName: uid, emailVerified: !!email,
  disabled: false, phoneNumber: undefined, providerData: email ? [{ providerId: 'password' }] : [],
  customClaims: {}, metadata: { creationTime: '2026-01-01', lastSignInTime: '2026-02-02' },
});
beforeEach(() => {
  resetStore(); h.accounts.length = 0;
  h.listUsers.mockClear(); h.getUser.mockClear(); h.getUserByEmail.mockClear();
});

describe('GET /api/admin/directory — operational identity only', () => {
  it('requires users.read and does not query Firebase accounts if denied', async () => {
    const response = await request(app).get('/api/admin/directory').set(auth('unauthorised'));
    expect(response.status).toBe(403);
    expect(h.listUsers).not.toHaveBeenCalled();
  });

  it('uses Auth cursor pagination rather than the first 100 Firestore docs', async () => {
    for (let i = 0; i < 105; i++) h.accounts.push(account('uid_' + i));
    const first = await request(app).get('/api/admin/directory').set(auth('owner_1'));
    expect(first.status).toBe(200);
    expect(first.body.users).toHaveLength(50);
    expect(first.body.nextCursor).toBe('50');
    expect(first.body.total).toBeNull();
    const second = await request(app).get('/api/admin/directory?cursor=50').set(auth('owner_1'));
    expect(second.body.users).toHaveLength(50);
    expect(second.body.nextCursor).toBe('100');
    const last = await request(app).get('/api/admin/directory?cursor=100').set(auth('owner_1'));
    expect(last.body.users).toHaveLength(5);
    expect(last.body.nextCursor).toBeNull();
  });

  it('returns Auth-only accounts and shows a missing profile without inventing profile data', async () => {
    h.accounts.push(account('auth_only'));
    const response = await request(app).get('/api/admin/directory').set(auth('owner_1'));
    expect(response.status).toBe(200);
    expect(response.body.users[0]).toMatchObject({ uid: 'auth_only', profilePresent: false, organisationId: null });
  });

  it('returns selected company metadata but never private Firestore recovery/profile content', async () => {
    h.accounts.push(account('staff_1'));
    seedDoc('users/staff_1', { organisationId: 'company_a', privateJournal: 'never leak this' });
    seedDoc('users/staff_1/recovery/fingerprint', { summary: 'private recovery detail' });
    const response = await request(app).get('/api/admin/directory').set(auth('owner_1'));
    expect(response.status).toBe(200);
    expect(response.body.users[0]).toMatchObject({ organisationId: 'company_a', profilePresent: true });
    expect(JSON.stringify(response.body)).not.toContain('never leak this');
    expect(JSON.stringify(response.body)).not.toContain('private recovery detail');
    expect(response.body.users[0]).not.toHaveProperty('profile');
    expect(response.body.users[0]).not.toHaveProperty('fingerprint');
  });

  it('finds a complete email across the directory without paging/scanning', async () => {
    for (let i = 0; i < 105; i++) h.accounts.push(account('uid_' + i));
    const response = await request(app).get('/api/admin/directory?lookup=uid_104%40test.dev').set(auth('owner_1'));
    expect(response.status).toBe(200);
    expect(response.body.users.map((user: any) => user.uid)).toEqual(['uid_104']);
    expect(response.body.nextCursor).toBeNull();
    expect(h.listUsers).not.toHaveBeenCalled();
    expect(h.getUserByEmail).toHaveBeenCalledOnce();
  });

  it('returns a true empty result for nonexistent exact identity', async () => {
    const response = await request(app).get('/api/admin/directory?lookup=missing%40test.dev').set(auth('owner_1'));
    expect(response.status).toBe(200);
    expect(response.body.users).toEqual([]);
  });

  it('rejects conflicting cursor and lookup input', async () => {
    const response = await request(app).get('/api/admin/directory?cursor=next&lookup=a%40b.test').set(auth('owner_1'));
    expect(response.status).toBe(400);
    expect(h.listUsers).not.toHaveBeenCalled();
  });
});
