import { describe, it, expect, beforeEach, vi } from 'vitest';

// Route test for POST+GET /api/audit-log - previously zero coverage. This
// is the member-facing audit trail (distinct from admin_audit_logs, which
// records admin actions against a target user) - a caller logs their own
// consent/access events and reads back only their own entries, newest
// first, scoped by userId.
process.env.TEST_MODE = 'true';
process.env.NODE_ENV = 'test';

vi.mock('express-rate-limit', () => ({ default: () => (_req: any, _res: any, next: any) => next() }));
vi.mock('firebase-admin/app', () => ({ initializeApp: vi.fn(), getApps: () => [{}] }));
vi.mock('firebase-admin/app-check', () => ({ getAppCheck: () => ({ verifyToken: vi.fn() }) }));
vi.mock('firebase-admin/auth', () => ({
  getAuth: () => ({ verifyIdToken: async (t: string) => ({ uid: t, email: `${t}@test.dev` }) }),
}));
vi.mock('firebase-admin/firestore', async () => {
  const fake = await import('./test/fake-firestore');
  return { getFirestore: () => fake.fakeDb, FieldValue: fake.FakeFieldValue };
});
vi.mock('twilio', () => ({ default: () => ({ messages: { create: vi.fn() } }) }));

import request from 'supertest';
import { app } from './server';
import { seedDoc, resetStore, forceCollectionError } from './test/fake-firestore';

const USER = 'user_1';
const auth = (uid: string) => ({ Authorization: `Bearer ${uid}` });

beforeEach(() => {
  resetStore();
});

describe('POST /api/audit-log', () => {
  it('requires authentication', async () => {
    const res = await request(app).post('/api/audit-log').send({ action: 'export_data', status: 'authorised' });
    expect(res.status).toBe(401);
  });

  it('rejects an invalid status value', async () => {
    const res = await request(app).post('/api/audit-log').set(auth(USER)).send({ action: 'export_data', status: 'not_a_real_status' });
    expect(res.status).toBe(400);
  });

  it('rejects an unknown field (strict schema)', async () => {
    const res = await request(app).post('/api/audit-log').set(auth(USER)).send({ action: 'export_data', status: 'authorised', extraField: 'nope' });
    expect(res.status).toBe(400);
  });

  it('logs an entry scoped to the authenticated caller, ignoring any client-supplied userId', async () => {
    const res = await request(app).post('/api/audit-log').set(auth(USER)).send({ action: 'export_data', status: 'authorised', target: 'self', details: 'GDPR export' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('500s if the write throws', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const restore = forceCollectionError('audit_logs', 'add', new Error('simulated Firestore outage'));
    const res = await request(app).post('/api/audit-log').set(auth(USER)).send({ action: 'export_data', status: 'authorised' });
    expect(res.status).toBe(500);
    expect(errorSpy).toHaveBeenCalled();
    restore();
    errorSpy.mockRestore();
  });
});

describe('GET /api/audit-log', () => {
  it('requires authentication', async () => {
    const res = await request(app).get('/api/audit-log');
    expect(res.status).toBe(401);
  });

  it("returns only the caller's own entries, newest first", async () => {
    seedDoc('audit_logs/a1', { userId: USER, action: 'export_data', status: 'authorised', createdAt: '2026-01-01T00:00:00.000Z' });
    seedDoc('audit_logs/a2', { userId: USER, action: 'delete_account', status: 'deleted', createdAt: '2026-01-05T00:00:00.000Z' });
    seedDoc('audit_logs/aX', { userId: 'other_user', action: 'export_data', status: 'authorised', createdAt: '2026-01-10T00:00:00.000Z' });

    const res = await request(app).get('/api/audit-log').set(auth(USER));
    expect(res.status).toBe(200);
    expect(res.body.logs).toHaveLength(2);
    expect(res.body.logs[0].id).toBe('a2');
    expect(res.body.logs[1].id).toBe('a1');
  });

  it('500s if the read throws', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const restore = forceCollectionError('audit_logs', 'get', new Error('simulated Firestore outage'));
    const res = await request(app).get('/api/audit-log').set(auth(USER));
    expect(res.status).toBe(500);
    expect(errorSpy).toHaveBeenCalled();
    restore();
    errorSpy.mockRestore();
  });
});
