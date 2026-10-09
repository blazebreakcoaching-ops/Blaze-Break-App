import { describe, it, expect, beforeEach, vi } from 'vitest';

// Route tests for the Nova Runtime Registry (Evolution Engine PR9) - a
// read-only report, so these mostly confirm the access gate and that the
// route reports the real env-driven provider state rather than a fixed
// stub, matching the resolution logic already unit-tested in
// nova-runtime-registry.test.ts.
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
import { resetStore } from './test/fake-firestore';

const OWNER = 'owner_1';
const NOT_ADMIN = 'random_person';
const auth = (uid: string) => ({ Authorization: `Bearer ${uid}` });

beforeEach(() => resetStore());

describe('GET /api/admin/evolution/nova-runtime', () => {
  it('requires an Evolution Engine role', async () => {
    const res = await request(app).get('/api/admin/evolution/nova-runtime').set(auth(NOT_ADMIN));
    expect(res.status).toBe(403);
  });

  it('reports the three real Nova surfaces with no prompt versioning', async () => {
    const res = await request(app).get('/api/admin/evolution/nova-runtime').set(auth(OWNER));
    expect(res.status).toBe(200);
    expect(res.body.surfaces).toHaveLength(3);
    const surfaceIds = res.body.surfaces.map((s: any) => s.surface);
    expect(surfaceIds).toContain('nova_text_chat');
    expect(surfaceIds).toContain('nova_live_voice');
    expect(surfaceIds).toContain('nova_voice_tts');
    for (const s of res.body.surfaces) {
      expect(s.promptVersioning).toBe('none');
    }
  });

  it('nova_text_chat defaults to gemini in this test environment (no real provider keys configured)', async () => {
    const res = await request(app).get('/api/admin/evolution/nova-runtime').set(auth(OWNER));
    const textChat = res.body.surfaces.find((s: any) => s.surface === 'nova_text_chat');
    expect(textChat.activeProvider).toBe('gemini');
  });
});
