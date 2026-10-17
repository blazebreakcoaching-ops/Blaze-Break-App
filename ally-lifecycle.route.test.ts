import { describe, it, expect, beforeEach, vi } from 'vitest';

// Route tests for the Recovery Ally lifecycle actions that previously had
// zero coverage of any kind: POST /api/ally/revoke, POST
// /api/ally/regenerate-link, POST /api/ally/pause-sharing, and POST
// /api/ally/resume-sharing. See recovery-ally-invite.route.test.ts for
// POST /api/ally/invite itself.
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
import { seedDoc, getDocRaw, resetStore, forceDocError } from './test/fake-firestore';

const auth = (uid: string) => ({ Authorization: `Bearer ${uid}` });

function seedAllyState(uid: string, state: Record<string, unknown> = {}) {
  seedDoc(`users/${uid}/recovery_ally/state`, {
    isInvited: true,
    allyName: 'Friend',
    allyEmail: 'friend@example.com',
    shareToken: 'original_token',
    consentStatus: 'active',
    ...state,
  });
}

beforeEach(() => resetStore());

describe('POST /api/ally/revoke', () => {
  it('clears the ally relationship and every support capsule', async () => {
    seedAllyState('u1');
    seedDoc('users/u1/support_capsules/shared_goals', { category: 'shared_goals', expiryType: 'until_off' });

    const res = await request(app).post('/api/ally/revoke').set(auth('u1'));
    expect(res.status).toBe(200);
    expect(getDocRaw('users/u1/recovery_ally/state')?.isInvited).toBe(false);
    expect(getDocRaw('users/u1/support_capsules/shared_goals')).toBeUndefined();
  });

  it('requires authentication', async () => {
    const res = await request(app).post('/api/ally/revoke');
    expect(res.status).toBe(401);
  });

  it('500s if the state write throws', async () => {
    seedAllyState('u1');
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const restore = forceDocError('users/u1/recovery_ally/state', 'set', new Error('simulated Firestore outage'));
    const res = await request(app).post('/api/ally/revoke').set(auth('u1'));
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Something went wrong on our end. Please try again.' });
    expect(errorSpy).toHaveBeenCalled();
    restore();
    errorSpy.mockRestore();
  });
});

describe('POST /api/ally/regenerate-link', () => {
  it('issues a new token and resets consent to pending', async () => {
    seedAllyState('u1', { shareToken: 'original_token', consentStatus: 'active' });
    const res = await request(app).post('/api/ally/regenerate-link').set(auth('u1'));
    expect(res.status).toBe(200);
    expect(res.body.shareToken).not.toBe('original_token');
    expect(getDocRaw('users/u1/recovery_ally/state')?.consentStatus).toBe('pending');
  });

  it("404s when there's no ally invited yet", async () => {
    const res = await request(app).post('/api/ally/regenerate-link').set(auth('u1'));
    expect(res.status).toBe(404);
  });

  it('500s if the state read throws', async () => {
    seedAllyState('u1');
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const restore = forceDocError('users/u1/recovery_ally/state', 'get', new Error('simulated Firestore outage'));
    const res = await request(app).post('/api/ally/regenerate-link').set(auth('u1'));
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Something went wrong on our end. Please try again.' });
    expect(errorSpy).toHaveBeenCalled();
    restore();
    errorSpy.mockRestore();
  });
});

describe('POST /api/ally/pause-sharing', () => {
  it('sets sharingPaused without touching the relationship itself', async () => {
    seedAllyState('u1');
    const res = await request(app).post('/api/ally/pause-sharing').set(auth('u1'));
    expect(res.status).toBe(200);
    const state = getDocRaw('users/u1/recovery_ally/state');
    expect(state?.sharingPaused).toBe(true);
    expect(state?.isInvited).toBe(true);
  });

  it("404s when there's no ally invited yet", async () => {
    const res = await request(app).post('/api/ally/pause-sharing').set(auth('u1'));
    expect(res.status).toBe(404);
  });

  it('500s if the state read throws', async () => {
    seedAllyState('u1');
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const restore = forceDocError('users/u1/recovery_ally/state', 'get', new Error('simulated Firestore outage'));
    const res = await request(app).post('/api/ally/pause-sharing').set(auth('u1'));
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Something went wrong on our end. Please try again.' });
    expect(errorSpy).toHaveBeenCalled();
    restore();
    errorSpy.mockRestore();
  });
});

describe('POST /api/ally/resume-sharing', () => {
  it('clears sharingPaused, leaving everything else as it was', async () => {
    seedAllyState('u1', { sharingPaused: true });
    const res = await request(app).post('/api/ally/resume-sharing').set(auth('u1'));
    expect(res.status).toBe(200);
    expect(getDocRaw('users/u1/recovery_ally/state')?.sharingPaused).toBe(false);
  });

  it("404s when there's no ally invited yet", async () => {
    const res = await request(app).post('/api/ally/resume-sharing').set(auth('u1'));
    expect(res.status).toBe(404);
  });

  it('500s if the state read throws', async () => {
    seedAllyState('u1', { sharingPaused: true });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const restore = forceDocError('users/u1/recovery_ally/state', 'get', new Error('simulated Firestore outage'));
    const res = await request(app).post('/api/ally/resume-sharing').set(auth('u1'));
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Something went wrong on our end. Please try again.' });
    expect(errorSpy).toHaveBeenCalled();
    restore();
    errorSpy.mockRestore();
  });
});
