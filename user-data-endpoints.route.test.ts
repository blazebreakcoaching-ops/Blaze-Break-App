import { describe, it, expect, beforeEach, vi } from 'vitest';

// Same harness as guardian-alert.route.test.ts (see the comments there for
// why env + mocks live in vi.hoisted / vi.mock). This file exercises the
// GDPR export and account-deletion endpoints against the in-memory store.
const h = vi.hoisted(() => {
  process.env.TEST_MODE = 'true';
  process.env.NODE_ENV = 'test';
  return {
    deleteUser: vi.fn(async () => {}),
  };
});

vi.mock('express-rate-limit', () => ({ default: () => (_req: any, _res: any, next: any) => next() }));
vi.mock('firebase-admin/app', () => ({ initializeApp: vi.fn(), getApps: () => [{}] }));
vi.mock('firebase-admin/app-check', () => ({ getAppCheck: () => ({ verifyToken: vi.fn() }) }));
vi.mock('firebase-admin/auth', () => ({
  getAuth: () => ({
    verifyIdToken: async (token: string) => ({ uid: token, email: `${token}@test.dev` }),
    deleteUser: h.deleteUser,
  }),
}));
vi.mock('firebase-admin/firestore', async () => {
  const fake = await import('./test/fake-firestore');
  return { getFirestore: () => fake.fakeDb, FieldValue: fake.FakeFieldValue };
});
vi.mock('twilio', () => ({ default: () => ({ messages: { create: vi.fn() } }) }));

import request from 'supertest';
import { app } from './server';
import { seedDoc, getDocRaw, resetStore } from './test/fake-firestore';

const USER = 'user_owner';
const OTHER = 'user_other';
const auth = (uid: string) => ({ Authorization: `Bearer ${uid}` });

beforeEach(() => {
  resetStore();
  h.deleteUser.mockClear();
});

// Seeds a user with: a root profile doc, two nested subcollections, and
// entries in both stray top-level collections (one erasable, one not), plus
// an unrelated OTHER user's data that must never be touched.
function seedFullUser() {
  seedDoc(`users/${USER}`, { organisationId: 'org_1', displayName: 'Jordan' });
  seedDoc(`users/${USER}/mood_pulses/mp1`, { moodLabel: 'calm', createdAt: '2026-01-01T00:00:00Z' });
  seedDoc(`users/${USER}/mood_pulses/mp2`, { moodLabel: 'tired', createdAt: '2026-01-02T00:00:00Z' });
  seedDoc(`users/${USER}/guardian_alerts/ga1`, { contactId: 'g', state: 'provider_accepted', createdAt: '2026-01-01T00:00:00Z' });
  // Stray top-level collections keyed by userId:
  seedDoc(`anxiety_reset_events/are1`, { userId: USER, kind: 'panic', createdAt: '2026-01-01T00:00:00Z' });
  seedDoc(`audit_logs/al1`, { userId: USER, action: 'consent_granted', createdAt: '2026-01-01T00:00:00Z' });
  // Another user's data, in the same collections:
  seedDoc(`users/${OTHER}`, { displayName: 'Someone Else' });
  seedDoc(`users/${OTHER}/mood_pulses/mpx`, { moodLabel: 'calm' });
  seedDoc(`anxiety_reset_events/areX`, { userId: OTHER, kind: 'panic' });
  seedDoc(`audit_logs/alX`, { userId: OTHER, action: 'login' });
  // The org the user belongs to:
  seedDoc(`organisations/org_1`, { memberUids: [USER, OTHER], adminUids: [USER], memberTeams: { [USER]: 'team_a' } });
}

describe('GET /api/user/export — portability (GDPR Art. 15/20)', () => {
  it('exports the root profile, every subcollection, and stray collections scoped to the caller', async () => {
    seedFullUser();
    const res = await request(app).get('/api/user/export').set(auth(USER));

    expect(res.status).toBe(200);
    expect(res.body.uid).toBe(USER);
    expect(res.body.profile).toMatchObject({ displayName: 'Jordan' });

    // Nested subcollections present.
    expect(res.body.collections.mood_pulses).toHaveLength(2);
    expect(res.body.collections.guardian_alerts).toHaveLength(1);

    // Stray top-level collections present AND scoped to this user only.
    expect(res.body.collections.anxiety_reset_events).toHaveLength(1);
    expect(res.body.collections.anxiety_reset_events[0].userId).toBe(USER);
    expect(res.body.collections.audit_logs).toHaveLength(1);
    expect(res.body.collections.audit_logs[0].userId).toBe(USER);
  });

  it('requires authentication', async () => {
    const res = await request(app).get('/api/user/export');
    expect(res.status).toBe(401);
  });
});

describe('POST /api/user/delete-account — erasure (GDPR Art. 17)', () => {
  it('erases the user document, every subcollection, and erasable stray collections', async () => {
    seedFullUser();
    const res = await request(app).post('/api/user/delete-account').set(auth(USER));

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    // User root + all nested subcollections gone.
    expect(getDocRaw(`users/${USER}`)).toBeUndefined();
    expect(getDocRaw(`users/${USER}/mood_pulses/mp1`)).toBeUndefined();
    expect(getDocRaw(`users/${USER}/guardian_alerts/ga1`)).toBeUndefined();

    // anxiety_reset_events (eraseOnDeletion: true) for this user is gone.
    expect(getDocRaw('anxiety_reset_events/are1')).toBeUndefined();
  });

  it('deliberately KEEPS audit_logs — a compliance trail must outlive the account', async () => {
    seedFullUser();
    await request(app).post('/api/user/delete-account').set(auth(USER));
    // The caller's own audit log survives on purpose (it records that the
    // deletion happened).
    expect(getDocRaw('audit_logs/al1')).toBeDefined();
    expect(getDocRaw('audit_logs/al1')?.userId).toBe(USER);
  });

  it("never touches another user's data", async () => {
    seedFullUser();
    await request(app).post('/api/user/delete-account').set(auth(USER));
    expect(getDocRaw(`users/${OTHER}`)).toBeDefined();
    expect(getDocRaw(`users/${OTHER}/mood_pulses/mpx`)).toBeDefined();
    expect(getDocRaw('anxiety_reset_events/areX')).toBeDefined();
    expect(getDocRaw('audit_logs/alX')).toBeDefined();
  });

  it('removes the user from their organisation membership', async () => {
    seedFullUser();
    await request(app).post('/api/user/delete-account').set(auth(USER));
    const org = getDocRaw('organisations/org_1');
    expect(org?.memberUids).toEqual([OTHER]);   // USER removed
    expect(org?.adminUids).toEqual([]);         // USER removed
  });

  it('deletes the Firebase Auth account and reports it', async () => {
    seedFullUser();
    const res = await request(app).post('/api/user/delete-account').set(auth(USER));
    expect(h.deleteUser).toHaveBeenCalledWith(USER);
    expect(res.body.authDeleted).toBe(true);
  });

  it('still reports data erased even if the auth-account deletion fails', async () => {
    seedFullUser();
    h.deleteUser.mockImplementationOnce(async () => { throw new Error('auth backend down'); });
    const res = await request(app).post('/api/user/delete-account').set(auth(USER));
    expect(res.status).toBe(200);
    expect(res.body.authDeleted).toBe(false);
    // The personal data is still gone - that's the part that matters for erasure.
    expect(getDocRaw(`users/${USER}`)).toBeUndefined();
  });

  it('requires authentication', async () => {
    const res = await request(app).post('/api/user/delete-account');
    expect(res.status).toBe(401);
  });
});
