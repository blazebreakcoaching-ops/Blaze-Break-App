import { describe, it, expect, beforeEach, vi } from 'vitest';

// Route tests for Context Brain Health (Evolution Engine PR4) - a
// platform-wide, metadata-only aggregate across every user's
// nova_memories. The one thing this exists to prove, beyond the pure
// aggregation logic already covered by nova-memory-governance.test.ts,
// is that the route itself never leaks a memory's `content` field.
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
const NOT_ADMIN = 'random_person';
const auth = (uid: string) => ({ Authorization: `Bearer ${uid}` });

beforeEach(() => resetStore());

describe('GET /api/admin/evolution/context-brain/health', () => {
  it('requires an Evolution Engine role', async () => {
    const res = await request(app).get('/api/admin/evolution/context-brain/health').set(auth(NOT_ADMIN));
    expect(res.status).toBe(403);
  });

  it('returns an honest zero summary when no memories exist anywhere', async () => {
    const res = await request(app).get('/api/admin/evolution/context-brain/health').set(auth(OWNER));
    expect(res.status).toBe(200);
    expect(res.body.totalMemories).toBe(0);
    expect(res.body.usersScanned).toBe(0);
    expect(res.body.capped).toBe(false);
  });

  it('aggregates across multiple users without ever exposing memory content', async () => {
    seedDoc('users/uid_1/nova_memories/mem_1', { type: 'profile', content: 'Prefers direct coaching style - deeply private.', confidence: 'high', canonicalKey: 'Onboarding::profile' });
    seedDoc('users/uid_2/nova_memories/mem_2', { type: 'state', content: 'Completed a boundary rehearsal about asking for a raise.', confidence: 'verified', canonicalKey: null });

    const res = await request(app).get('/api/admin/evolution/context-brain/health').set(auth(OWNER));
    expect(res.status).toBe(200);
    expect(res.body.totalMemories).toBe(2);
    expect(res.body.usersScanned).toBe(2);
    expect(res.body.byType).toEqual({ profile: 1, state: 1 });

    const raw = JSON.stringify(res.body);
    expect(raw).not.toMatch(/direct coaching style/);
    expect(raw).not.toMatch(/boundary rehearsal about asking for a raise/);
  });

  it('flags a real duplicate when the structural dedup path was bypassed for the same user', async () => {
    seedDoc('users/uid_1/nova_memories/mem_a', { type: 'profile', content: 'x', confidence: 'high', canonicalKey: 'Onboarding::profile' });
    seedDoc('users/uid_1/nova_memories/mem_b', { type: 'profile', content: 'y', confidence: 'high', canonicalKey: 'Onboarding::profile' });

    const res = await request(app).get('/api/admin/evolution/context-brain/health').set(auth(OWNER));
    expect(res.body.duplicateCandidateGroups).toBe(1);
    expect(res.body.duplicateCandidateMemories).toBe(2);
  });
});
