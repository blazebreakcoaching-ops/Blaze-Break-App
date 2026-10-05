import { describe, it, expect, beforeEach, vi } from 'vitest';

// Route test for GET /api/admin/audit-logs - previously zero coverage.
// Specifically proves two real bugs found while building the Access &
// Entitlements workspace, both now fixed:
//   1. logAdminAction (server.ts) stores actorEmail/metadata, but this
//      route used to return the raw Firestore Timestamp for createdAt
//      (no toJSON, so it serializes to {_seconds,_nanoseconds}) - the
//      client's `new Date(log.createdAt)` silently produced "Invalid
//      Date" for every single audit entry. Fixed to convert it, the same
//      way other routes in this file already do.
//   2. The client's AdminDashboard.tsx read `log.adminEmail`/`log.details`,
//      fields that were never written (the real fields are `actorEmail`/
//      `metadata`) - every entry showed "Admin undefined" and never
//      rendered its Details block. Covered by this route returning the
//      real field names unchanged; the client fix is covered by this
//      route test staying honest about the actual response shape.
process.env.TEST_MODE = 'true';
process.env.NODE_ENV = 'test';

vi.mock('express-rate-limit', () => ({ default: () => (_req: any, _res: any, next: any) => next() }));
vi.mock('firebase-admin/app', () => ({ initializeApp: vi.fn(), getApps: () => [{}] }));
vi.mock('firebase-admin/app-check', () => ({ getAppCheck: () => ({ verifyToken: vi.fn() }) }));
vi.mock('firebase-admin/auth', () => ({
  getAuth: () => ({
    verifyIdToken: async (t: string) => ({ uid: t, email: `${t}@test.dev`, role: t === 'owner_1' ? 'platform_owner' : undefined }),
  }),
}));
vi.mock('firebase-admin/firestore', async () => {
  const fake = await import('./test/fake-firestore');
  return { getFirestore: () => fake.fakeDb, FieldValue: fake.FakeFieldValue };
});
vi.mock('twilio', () => ({ default: () => ({ messages: { create: vi.fn() } }) }));

import request from 'supertest';
import { app } from './server';
import { seedDoc, resetStore } from './test/fake-firestore';

const OWNER = 'owner_1';
const auth = (uid: string) => ({ Authorization: `Bearer ${uid}` });

beforeEach(() => {
  resetStore();
});

describe('GET /api/admin/audit-logs', () => {
  it('returns each entry with a usable ISO createdAt string, not a raw Timestamp-shaped object', async () => {
    // A real Firestore Timestamp (resolved via FieldValue.serverTimestamp())
    // would carry no toJSON and serialize as {_seconds,_nanoseconds} if sent
    // unconverted - this seeds the already-ISO-string shape the fake
    // Firestore's serverTimestamp() resolves to, which the route must also
    // pass through unchanged (not null it out).
    seedDoc('admin_audit_logs/log1', {
      actorUid: 'owner_1', actorEmail: 'owner@test.dev', actorRole: 'platform_owner',
      action: 'grant_entitlement', targetUid: 'target_uid', targetEmail: '',
      metadata: { plan: 'performance', status: 'active', durationDays: 30, previousPlan: 'free', planChange: 'upgrade' },
      createdAt: '2026-01-01T00:00:00.000Z', ipAddress: '', userAgent: '',
    });
    const res = await request(app).get('/api/admin/audit-logs').set(auth(OWNER));
    expect(res.status).toBe(200);
    expect(res.body.logs).toHaveLength(1);
    const log = res.body.logs[0];
    expect(log.createdAt).toBe('2026-01-01T00:00:00.000Z');
    expect(new Date(log.createdAt).toString()).not.toBe('Invalid Date');
  });

  it("surfaces the real actorEmail/metadata fields logAdminAction stores, not 'adminEmail'/'details'", async () => {
    seedDoc('admin_audit_logs/log1', {
      actorUid: 'owner_1', actorEmail: 'owner@test.dev', actorRole: 'platform_owner',
      action: 'grant_entitlement', targetUid: 'target_uid', targetEmail: '',
      metadata: { plan: 'performance', status: 'active' },
      createdAt: '2026-01-01T00:00:00.000Z', ipAddress: '', userAgent: '',
    });
    const res = await request(app).get('/api/admin/audit-logs').set(auth(OWNER));
    expect(res.status).toBe(200);
    const log = res.body.logs[0];
    expect(log.actorEmail).toBe('owner@test.dev');
    expect(log.metadata).toEqual({ plan: 'performance', status: 'active' });
  });
});
