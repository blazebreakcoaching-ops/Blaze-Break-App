import { describe, it, expect, beforeEach, vi } from 'vitest';

// Route test for GET /api/admin/summary - previously zero coverage. The
// specific thing this exists to prove: toolCounts (a real per-tool
// breakdown the handler already computes from anxiety_reset_events) is
// actually included in the response. It used to be computed and then
// silently dropped before res.json(), so AdminDashboard.tsx's "Somatic
// Reset Tool Engagement Rate" panel always rendered an empty list with no
// data behind it.
vi.hoisted(() => {
  process.env.TEST_MODE = 'true';
  process.env.NODE_ENV = 'test';
});

vi.mock('express-rate-limit', () => ({ default: () => (_req: any, _res: any, next: any) => next() }));
vi.mock('firebase-admin/app', () => ({ initializeApp: vi.fn(), getApps: () => [{}] }));
vi.mock('firebase-admin/app-check', () => ({ getAppCheck: () => ({ verifyToken: vi.fn() }) }));
vi.mock('firebase-admin/auth', () => ({
  getAuth: () => ({ verifyIdToken: async (t: string) => ({ uid: t, email: `${t}@test.dev`, role: t === 'owner_1' ? 'platform_owner' : undefined }) }),
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
const NOT_ADMIN = 'random_person';
const auth = (uid: string) => ({ Authorization: `Bearer ${uid}` });

// anxiety_reset_events' real createdAt is a Firestore Timestamp; the fake
// store's serverTimestamp() resolves to a plain ISO string, which has no
// .toDate() - so a real Timestamp-like stub is seeded directly here to
// exercise the handler's actual `data.createdAt.toDate()` call.
const withTimestamp = (iso: string) => ({ toDate: () => new Date(iso) });

beforeEach(() => {
  resetStore();
});

describe('GET /api/admin/summary — toolCounts', () => {
  it('requires admin', async () => {
    const res = await request(app).get('/api/admin/summary').set(auth(NOT_ADMIN));
    expect(res.status).toBe(500);
  });

  it('includes a real per-tool breakdown, not just the single most-used tool', async () => {
    seedDoc('anxiety_reset_events/e1', { selectedTool: 'box_breathing', createdAt: withTimestamp('2026-01-01T10:00:00Z') });
    seedDoc('anxiety_reset_events/e2', { selectedTool: 'box_breathing', createdAt: withTimestamp('2026-01-01T11:00:00Z') });
    seedDoc('anxiety_reset_events/e3', { selectedTool: 'five_senses', createdAt: withTimestamp('2026-01-01T12:00:00Z') });

    const res = await request(app).get('/api/admin/summary').set(auth(OWNER));
    expect(res.status).toBe(200);
    expect(res.body.toolCounts).toEqual({ box_breathing: 2, five_senses: 1 });
    expect(res.body.mostUsedResetTool).toBe('box_breathing');
  });

  it('reports an empty breakdown (not missing) when no resets have been logged yet', async () => {
    const res = await request(app).get('/api/admin/summary').set(auth(OWNER));
    expect(res.status).toBe(200);
    expect(res.body.toolCounts).toEqual({});
  });
});
