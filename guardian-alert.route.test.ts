import { describe, it, expect, beforeEach, vi } from 'vitest';

// ---- Hoisted setup: runs before server.ts is imported --------------------
// server.ts has import-time side effects (Firebase init, and a listen() call
// guarded by TEST_MODE). These env vars and mocks must be in place before
// that module is evaluated, so they live in vi.hoisted / vi.mock, which
// vitest lifts above the imports below.
const h = vi.hoisted(() => {
  process.env.TEST_MODE = 'true';        // skip app.listen() / websocket setup
  process.env.NODE_ENV = 'test';         // skip App Check (production-only)
  process.env.TWILIO_ACCOUNT_SID = 'AC_test';
  process.env.TWILIO_AUTH_TOKEN = 'token_test';
  process.env.TWILIO_PHONE_NUMBER = '+15005550006';
  return {
    twilioCreate: vi.fn(async (_opts: any) => ({ sid: 'SM_fake_123' })),
  };
});

// Rate limiters are shared per-app-instance and keyed by IP, so across a
// whole test file they'd trip after a few requests. They are framework
// infrastructure, not the handler logic under test (the daily cap and
// per-contact cooldown are enforced in-handler via Firestore queries, which
// ARE tested), so every express-rate-limit middleware is a pass-through here.
vi.mock('express-rate-limit', () => ({ default: () => (_req: any, _res: any, next: any) => next() }));

vi.mock('firebase-admin/app', () => ({ initializeApp: vi.fn(), getApps: () => [{}] }));
vi.mock('firebase-admin/app-check', () => ({ getAppCheck: () => ({ verifyToken: vi.fn() }) }));
vi.mock('firebase-admin/auth', () => ({
  // The verified token's uid IS the bearer string, so a test authenticates
  // simply by sending `Authorization: Bearer <uid>`.
  getAuth: () => ({
    verifyIdToken: async (token: string) => ({ uid: token, email: `${token}@test.dev` }),
    deleteUser: vi.fn(async () => {}),
  }),
}));
vi.mock('firebase-admin/firestore', async () => {
  const fake = await import('./test/fake-firestore');
  return { getFirestore: () => fake.fakeDb, FieldValue: fake.FakeFieldValue };
});
vi.mock('twilio', () => ({ default: () => ({ messages: { create: h.twilioCreate } }) }));

import request from 'supertest';
import { app } from './server';
import { seedDoc, getDocRaw, resetStore } from './test/fake-firestore';

const USER = 'user_owner';
const OTHER = 'user_intruder';

// A valid guardian belonging to USER, with an E.164 phone the server will
// look up for itself. The client never sends this number.
const GUARDIAN = {
  id: 'guardian_1',
  name: 'Sam Guardian',
  isGuardian: true,
  role: 'primary_guardian',
  contactMethod: '+447700900123',
  notificationPreference: 'sms',
};

function seedUserWithGuardian(uid: string, guardian: any = GUARDIAN, fullName = 'Jordan Rivera') {
  seedDoc(`users/${uid}/user_stats/core`, {
    supportCircle: [guardian],
    profile: { fullName },
  });
}

const auth = (uid: string) => ({ Authorization: `Bearer ${uid}` });

beforeEach(() => {
  resetStore();
  h.twilioCreate.mockClear();
  h.twilioCreate.mockImplementation(async () => ({ sid: 'SM_fake_123' }));
});

describe('POST /api/guardian/alert — authorization & scoping', () => {
  it('sends to a real guardian and looks the number up server-side (never from the request body)', async () => {
    seedUserWithGuardian(USER);
    const res = await request(app)
      .post('/api/guardian/alert')
      .set(auth(USER))
      // Note the bogus phone in the body: it must be ignored entirely.
      .send({ contactId: 'guardian_1', idempotencyKey: 'idem_key_0001', to: '+19999999999', phone: '+19999999999' });

    expect(res.status).toBe(200);
    expect(res.body.state).toBe('provider_accepted');
    expect(h.twilioCreate).toHaveBeenCalledTimes(1);
    const sentTo = h.twilioCreate.mock.calls[0][0].to;
    expect(sentTo).toBe('+447700900123');       // the guardian's real number
    expect(sentTo).not.toBe('+19999999999');    // NOT the client-supplied one
    // Message states who is asking and that it's a Blaze Break request.
    expect(h.twilioCreate.mock.calls[0][0].body).toContain('Jordan');
    expect(h.twilioCreate.mock.calls[0][0].body).toContain('Blaze Break');
  });

  it("refuses to message another user's guardian — a caller can only reach their own contacts", async () => {
    seedUserWithGuardian(USER);           // USER owns guardian_1
    // OTHER has no guardians of their own.
    seedDoc(`users/${OTHER}/user_stats/core`, { supportCircle: [], profile: { fullName: 'Intruder' } });

    const res = await request(app)
      .post('/api/guardian/alert')
      .set(auth(OTHER))
      .send({ contactId: 'guardian_1', idempotencyKey: 'idem_key_0002' });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('not_a_guardian');
    expect(h.twilioCreate).not.toHaveBeenCalled();
  });

  it('refuses a contact that exists but is not marked as a guardian', async () => {
    seedUserWithGuardian(USER, { id: 'contact_x', name: 'Not A Guardian', isGuardian: false, contactMethod: '+447700900123' });
    const res = await request(app)
      .post('/api/guardian/alert')
      .set(auth(USER))
      .send({ contactId: 'contact_x', idempotencyKey: 'idem_key_0003' });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('not_a_guardian');
    expect(h.twilioCreate).not.toHaveBeenCalled();
  });

  it('rejects a guardian whose stored number is not valid E.164', async () => {
    seedUserWithGuardian(USER, { ...GUARDIAN, contactMethod: '07700 900123' });
    const res = await request(app)
      .post('/api/guardian/alert')
      .set(auth(USER))
      .send({ contactId: 'guardian_1', idempotencyKey: 'idem_key_0004' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_number');
    expect(h.twilioCreate).not.toHaveBeenCalled();
  });

  it('requires authentication', async () => {
    seedUserWithGuardian(USER);
    const res = await request(app)
      .post('/api/guardian/alert')
      .send({ contactId: 'guardian_1', idempotencyKey: 'idem_key_0005' });
    expect(res.status).toBe(401);
  });

  it('validates the request body (contactId and a sufficiently long idempotencyKey)', async () => {
    seedUserWithGuardian(USER);
    const noContact = await request(app).post('/api/guardian/alert').set(auth(USER)).send({ idempotencyKey: 'idem_key_0006' });
    expect(noContact.status).toBe(400);
    const shortKey = await request(app).post('/api/guardian/alert').set(auth(USER)).send({ contactId: 'guardian_1', idempotencyKey: 'x' });
    expect(shortKey.status).toBe(400);
  });
});

describe('POST /api/guardian/alert — idempotency, cooldown, daily cap', () => {
  it('is idempotent: the same key never sends twice', async () => {
    seedUserWithGuardian(USER);
    const body = { contactId: 'guardian_1', idempotencyKey: 'idem_same_key_01' };
    const first = await request(app).post('/api/guardian/alert').set(auth(USER)).send(body);
    const second = await request(app).post('/api/guardian/alert').set(auth(USER)).send(body);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(h.twilioCreate).toHaveBeenCalledTimes(1); // not twice
  });

  it('enforces the per-contact cooldown, and lets an explicit override through', async () => {
    seedUserWithGuardian(USER);
    // A prior alert to this contact one minute ago (inside the 10-min window).
    seedDoc(`users/${USER}/guardian_alerts/prior_alert`, {
      contactId: 'guardian_1',
      contactName: 'Sam Guardian',
      state: 'provider_accepted',
      createdAt: new Date(Date.now() - 60 * 1000).toISOString(),
    });

    const blocked = await request(app)
      .post('/api/guardian/alert').set(auth(USER))
      .send({ contactId: 'guardian_1', idempotencyKey: 'idem_cooldown_01' });
    expect(blocked.status).toBe(429);
    expect(blocked.body.error).toBe('cooldown');
    expect(blocked.body.canOverride).toBe(true);
    expect(h.twilioCreate).not.toHaveBeenCalled();

    const overridden = await request(app)
      .post('/api/guardian/alert').set(auth(USER))
      .send({ contactId: 'guardian_1', idempotencyKey: 'idem_cooldown_02', cooldownOverride: true });
    expect(overridden.status).toBe(200);
    expect(h.twilioCreate).toHaveBeenCalledTimes(1);
  });

  it('rejects a concurrent second request for the same contact instead of sending twice', async () => {
    seedUserWithGuardian(USER);
    // Two near-simultaneous requests with different idempotencyKeys (as a
    // real double-tap or client retry would generate) - only one may reach
    // Twilio; the second must be rejected, not silently send a duplicate.
    const [first, second] = await Promise.all([
      request(app).post('/api/guardian/alert').set(auth(USER))
        .send({ contactId: 'guardian_1', idempotencyKey: 'idem_race_first_01' }),
      request(app).post('/api/guardian/alert').set(auth(USER))
        .send({ contactId: 'guardian_1', idempotencyKey: 'idem_race_second_01' }),
    ]);
    const statuses = [first.status, second.status].sort();
    expect(statuses).toEqual([200, 429]);
    const rejected = first.status === 429 ? first : second;
    expect(rejected.body.error).toBe('cooldown');
    expect(h.twilioCreate).toHaveBeenCalledTimes(1); // not twice
  });

  it('enforces the daily cap', async () => {
    seedUserWithGuardian(USER);
    // 15 alerts already today (the cap). Use a contact id that won't trip the
    // per-contact cooldown so we isolate the daily-cap path.
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    for (let i = 0; i < 15; i++) {
      seedDoc(`users/${USER}/guardian_alerts/hist_${i}`, {
        contactId: `someone_else_${i}`,
        state: 'provider_accepted',
        createdAt: twoHoursAgo,
      });
    }
    const res = await request(app)
      .post('/api/guardian/alert').set(auth(USER))
      .send({ contactId: 'guardian_1', idempotencyKey: 'idem_daily_cap_01' });

    expect(res.status).toBe(429);
    expect(res.body.error).toBe('daily_limit');
    expect(h.twilioCreate).not.toHaveBeenCalled();
  });
});

describe('POST /api/guardian/alert — provider failure handling', () => {
  it('records state=failed and returns 502 when the provider rejects', async () => {
    seedUserWithGuardian(USER);
    h.twilioCreate.mockImplementationOnce(async () => { throw new Error('provider down'); });

    const res = await request(app)
      .post('/api/guardian/alert').set(auth(USER))
      .send({ contactId: 'guardian_1', idempotencyKey: 'idem_fail_key_01' });

    expect(res.status).toBe(502);
    expect(res.body.state).toBe('failed');
    // The alert is persisted as failed in history, not silently dropped.
    const stored = getDocRaw(`users/${USER}/guardian_alerts/idem_fail_key_01`);
    expect(stored?.state).toBe('failed');
  });

  it('persists the alert as queued before the send, so a crash is visible in history', async () => {
    seedUserWithGuardian(USER);
    await request(app).post('/api/guardian/alert').set(auth(USER))
      .send({ contactId: 'guardian_1', idempotencyKey: 'idem_queued_key_01' });
    // After a successful send the final state is provider_accepted, but the
    // history document exists (it was written before the provider call).
    const stored = getDocRaw(`users/${USER}/guardian_alerts/idem_queued_key_01`);
    expect(stored).toBeDefined();
    expect(stored?.state).toBe('provider_accepted');
    expect(stored?.contactId).toBe('guardian_1');
  });
});

describe('GET /api/guardian/alerts — history is metadata only', () => {
  it('returns the user’s own alerts, newest first, with no message content', async () => {
    seedDoc(`users/${USER}/guardian_alerts/a1`, { contactId: 'guardian_1', contactName: 'Sam Guardian', state: 'provider_accepted', createdAt: '2026-01-01T10:00:00.000Z', message: 'SHOULD NOT BE RETURNED' });
    seedDoc(`users/${USER}/guardian_alerts/a2`, { contactId: 'guardian_1', contactName: 'Sam Guardian', state: 'failed', createdAt: '2026-01-02T10:00:00.000Z' });

    const res = await request(app).get('/api/guardian/alerts').set(auth(USER));
    expect(res.status).toBe(200);
    expect(res.body.alerts).toHaveLength(2);
    expect(res.body.alerts[0].id).toBe('a2'); // newest first
    // No conversation/message content is exposed - only alert metadata.
    for (const a of res.body.alerts) {
      expect(a).not.toHaveProperty('message');
      expect(Object.keys(a).sort()).toEqual(['contactName', 'createdAt', 'id', 'state', 'userMessage']);
    }
  });

  it("does not return another user's alerts", async () => {
    seedDoc(`users/${USER}/guardian_alerts/a1`, { contactId: 'g', contactName: 'S', state: 'provider_accepted', createdAt: '2026-01-01T10:00:00.000Z' });
    const res = await request(app).get('/api/guardian/alerts').set(auth(OTHER));
    expect(res.status).toBe(200);
    expect(res.body.alerts).toHaveLength(0);
  });
});
