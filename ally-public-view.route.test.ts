import { describe, it, expect, beforeEach, vi } from 'vitest';

// Route tests for the Recovery Ally public/consent surface that previously
// had zero coverage of any kind: GET /api/ally/view/:token (the
// unauthenticated ally page), GET /api/ally/preview (the owner's own
// preview of that same page), and POST /api/ally/view/:token/consent
// (the mandatory accept/decline step). See ally-encourage.route.test.ts for
// POST .../encourage and ally-lifecycle.route.test.ts for the owner-side
// invite/revoke/regenerate-link/pause/resume actions.
vi.hoisted(() => {
  process.env.TEST_MODE = 'true';
  process.env.NODE_ENV = 'test';
});

vi.mock('express-rate-limit', () => ({ default: () => (_req: any, _res: any, next: any) => next() }));
vi.mock('firebase-admin/app', () => ({ initializeApp: vi.fn(), getApps: () => [{}] }));
vi.mock('firebase-admin/app-check', () => ({ getAppCheck: () => ({ verifyToken: vi.fn() }) }));
vi.mock('firebase-admin/auth', () => ({ getAuth: () => ({ verifyIdToken: async (t: string) => ({ uid: t, email: `${t}@test.dev` }) }) }));
vi.mock('firebase-admin/firestore', async () => {
  const fake = await import('./test/fake-firestore');
  return { getFirestore: () => fake.fakeDb, FieldValue: fake.FakeFieldValue };
});
vi.mock('twilio', () => ({ default: () => ({ messages: { create: vi.fn() } }) }));

import request from 'supertest';
import { app } from './server';
import { seedDoc, getDocRaw, resetStore, forceCollectionGroupError, forceDocError } from './test/fake-firestore';

const OWNER = 'owner_1';
const TOKEN = 'a'.repeat(32);

function seedAllyState(state: Record<string, unknown> = {}) {
  seedDoc(`users/${OWNER}/recovery_ally/state`, {
    isInvited: true,
    allyName: 'A Friend',
    allyEmail: 'friend@example.com',
    shareToken: TOKEN,
    consentStatus: 'pending',
    ...state,
  });
}

const auth = (uid: string) => ({ Authorization: `Bearer ${uid}` });

beforeEach(() => resetStore());

describe('GET /api/ally/view/:token', () => {
  it('404s for a token that is too short to be real', async () => {
    const res = await request(app).get('/api/ally/view/short');
    expect(res.status).toBe(404);
  });

  it("404s for a well-formed token that doesn't match anything", async () => {
    const res = await request(app).get(`/api/ally/view/${'b'.repeat(32)}`);
    expect(res.status).toBe(404);
  });

  it('shows the honest pending state without exposing any shared data', async () => {
    seedAllyState({ consentStatus: 'pending' });
    const res = await request(app).get(`/api/ally/view/${TOKEN}`);
    expect(res.status).toBe(200);
    expect(res.body.consentStatus).toBe('pending');
    expect(res.body.allyName).toBe('A Friend');
  });

  it('500s if the lookup query throws', async () => {
    seedAllyState();
    const restore = forceCollectionGroupError('recovery_ally', new Error('simulated Firestore outage'));
    const res = await request(app).get(`/api/ally/view/${TOKEN}`);
    expect(res.status).toBe(500);
    restore();
  });
});

describe('GET /api/ally/preview', () => {
  it('requires authentication', async () => {
    const res = await request(app).get('/api/ally/preview');
    expect(res.status).toBe(401);
  });

  it("404s when there's no ally invited yet", async () => {
    const res = await request(app).get('/api/ally/preview').set(auth(OWNER));
    expect(res.status).toBe(404);
  });

  it('shows the owner exactly what their own pending invite looks like', async () => {
    seedAllyState({ consentStatus: 'pending' });
    const res = await request(app).get('/api/ally/preview').set(auth(OWNER));
    expect(res.status).toBe(200);
    expect(res.body.consentStatus).toBe('pending');
  });

  it('500s if the state read throws', async () => {
    seedAllyState();
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const restore = forceDocError(`users/${OWNER}/recovery_ally/state`, 'get', new Error('simulated Firestore outage'));
    const res = await request(app).get('/api/ally/preview').set(auth(OWNER));
    expect(res.status).toBe(500);
    restore();
    errorSpy.mockRestore();
  });
});

describe('POST /api/ally/view/:token/consent', () => {
  it('rejects a decision that is neither accept nor decline', async () => {
    seedAllyState();
    const res = await request(app).post(`/api/ally/view/${TOKEN}/consent`).send({ decision: 'maybe' });
    expect(res.status).toBe(400);
  });

  it('404s for a token that matches nothing', async () => {
    const res = await request(app).post(`/api/ally/view/${'b'.repeat(32)}/consent`).send({ decision: 'accept' });
    expect(res.status).toBe(404);
  });

  it('accepts a pending invite', async () => {
    seedAllyState({ consentStatus: 'pending' });
    const res = await request(app).post(`/api/ally/view/${TOKEN}/consent`).send({ decision: 'accept' });
    expect(res.status).toBe(200);
    expect(res.body.consentStatus).toBe('accepted');
    expect(getDocRaw(`users/${OWNER}/recovery_ally/state`)?.consentStatus).toBe('accepted');
  });

  it('declines a pending invite', async () => {
    seedAllyState({ consentStatus: 'pending' });
    const res = await request(app).post(`/api/ally/view/${TOKEN}/consent`).send({ decision: 'decline' });
    expect(res.status).toBe(200);
    expect(res.body.consentStatus).toBe('declined');
  });

  it('refuses to re-decide an invite that was already accepted', async () => {
    seedAllyState({ consentStatus: 'accepted' });
    const res = await request(app).post(`/api/ally/view/${TOKEN}/consent`).send({ decision: 'decline' });
    expect(res.status).toBe(409);
  });

  it('410s for an expired, still-pending invite', async () => {
    seedAllyState({ consentStatus: 'pending', inviteExpiresAt: '2000-01-01T00:00:00.000Z' });
    const res = await request(app).post(`/api/ally/view/${TOKEN}/consent`).send({ decision: 'accept' });
    expect(res.status).toBe(410);
  });

  it('500s if the lookup query throws', async () => {
    seedAllyState();
    const restore = forceCollectionGroupError('recovery_ally', new Error('simulated Firestore outage'));
    const res = await request(app).post(`/api/ally/view/${TOKEN}/consent`).send({ decision: 'accept' });
    expect(res.status).toBe(500);
    restore();
  });
});
