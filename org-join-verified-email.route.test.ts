import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  process.env.TEST_MODE = 'true';
  process.env.NODE_ENV = 'test';
});
vi.mock('express-rate-limit', () => ({ default: () => (_req: any, _res: any, next: any) => next() }));
vi.mock('firebase-admin/app', () => ({ initializeApp: vi.fn(), getApps: () => [{}] }));
vi.mock('firebase-admin/app-check', () => ({ getAppCheck: () => ({ verifyToken: vi.fn() }) }));
vi.mock('firebase-admin/auth', () => ({
  getAuth: () => ({
    verifyIdToken: async (token: string) => ({
      uid: token,
      email: `${token}@test.dev`,
      email_verified: token === 'verified_employee',
    }),
  }),
}));
vi.mock('firebase-admin/firestore', async () => {
  const fake = await import('./test/fake-firestore');
  return { getFirestore: () => fake.fakeDb, FieldValue: fake.FakeFieldValue };
});
vi.mock('twilio', () => ({ default: () => ({ messages: { create: vi.fn() } }) }));

import request from 'supertest';
import { app } from './server';
import { resetStore, seedDoc, getDocRaw } from './test/fake-firestore';

const auth = (uid: string) => ({ Authorization: `Bearer ${uid}` });

beforeEach(() => {
  resetStore();
  seedDoc('organisations/company_a', {
    name: 'Company A', joinCode: 'ABC123', adminUids: ['owner'],
    memberUids: ['owner'], billing: { seatCount: 20 },
  });
});

describe('shared company code verified-email boundary', () => {
  it('denies a non-verified account even with the correct legacy shared code', async () => {
    const response = await request(app).post('/api/org/join')
      .set(auth('unverified_employee')).send({ joinCode: 'ABC123' });
    expect(response.status).toBe(403);
    expect(response.body.error).toMatch(/verify your email/i);
    expect(getDocRaw('users/unverified_employee')?.organisationId).toBeUndefined();
    expect(getDocRaw('organisations/company_a')?.memberUids).not.toContain('unverified_employee');
  });

  it('denies a non-verified account even with a new-format invitation code', async () => {
    const response = await request(app).post('/api/org/join')
      .set(auth('unverified_employee')).send({ joinCode: 'BBI.COMPANY_A.0123456789ABCDEF0123456789ABCDEF' });
    expect(response.status).toBe(403);
    expect(getDocRaw('users/unverified_employee')?.organisationId).toBeUndefined();
  });

  it('still rejects incorrect company codes for a verified account', async () => {
    const response = await request(app).post('/api/org/join')
      .set(auth('verified_employee')).send({ joinCode: 'WRONGCODE' });
    expect(response.status).toBe(404);
    expect(getDocRaw('users/verified_employee')?.organisationId).toBeUndefined();
  });
});


describe('orphan memberships cannot be revived by joining', () => {
  it('rejects a suspended member document left off the roster', async () => {
    seedDoc('organisations/company_a/members/verified_employee', {
      role: 'admin', status: 'suspended', email: 'verified_employee@test.dev',
    });
    const res = await request(app).post('/api/org/join')
      .set(auth('verified_employee')).send({ joinCode: 'ABC123' });
    expect(res.status).toBe(409);
    expect(getDocRaw('organisations/company_a/members/verified_employee')?.status).toBe('suspended');
    expect(getDocRaw('organisations/company_a')?.memberUids).not.toContain('verified_employee');
  });

  it('rejects a stale active member document absent from the company roster', async () => {
    seedDoc('organisations/company_a/members/verified_employee', {
      role: 'owner', status: 'active', email: 'verified_employee@test.dev',
    });
    const res = await request(app).post('/api/org/join')
      .set(auth('verified_employee')).send({ joinCode: 'ABC123' });
    expect(res.status).toBe(409);
    expect(getDocRaw('organisations/company_a/members/verified_employee')?.role).toBe('owner');
    expect(getDocRaw('users/verified_employee')?.organisationId).toBeUndefined();
  });
});
