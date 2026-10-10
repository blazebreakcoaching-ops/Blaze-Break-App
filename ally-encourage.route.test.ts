import { describe, it, expect, beforeEach, vi } from 'vitest';

// Regression coverage for POST /api/ally/view/:token/encourage honouring
// "Stop Sharing" (sharingPaused). The route's permission check used to
// call deriveEffectiveSharing without the paused argument the ally's own
// view (GET /api/ally/view/:token) and the owner's Preview Their View
// both correctly pass - so a paused owner's ally could still send a
// message even though canSendMessage reads false everywhere else.
process.env.TEST_MODE = 'true';
process.env.NODE_ENV = 'test';

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
import { resetStore, seedDoc, allPaths } from './test/fake-firestore';

const TOKEN = 'a'.repeat(32);
const OWNER = 'owner_1';

function seedAcceptedAlly(opts: { sharingPaused?: boolean } = {}) {
  seedDoc(`users/${OWNER}/recovery_ally/state`, {
    shareToken: TOKEN,
    consentStatus: 'accepted',
    allyName: 'A Friend',
    sharingPaused: opts.sharingPaused === true,
  });
  seedDoc(`users/${OWNER}/support_capsules/sendPings`, { category: 'sendPings', expiresAt: null });
}

beforeEach(() => resetStore());

describe('POST /api/ally/view/:token/encourage — honours Stop Sharing', () => {
  it('refuses to send once the owner has paused sharing, even though the sendPings capsule is still technically active', async () => {
    seedAcceptedAlly({ sharingPaused: true });
    const res = await request(app).post(`/api/ally/view/${TOKEN}/encourage`).send({ message: 'Thinking of you!' });
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/turned off messages/i);
    expect(allPaths().some((p) => p.startsWith(`users/${OWNER}/ally_encouragements/`))).toBe(false);
  });

  it('still allows sending when sharing is not paused', async () => {
    seedAcceptedAlly({ sharingPaused: false });
    const res = await request(app).post(`/api/ally/view/${TOKEN}/encourage`).send({ message: 'Thinking of you!' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});
