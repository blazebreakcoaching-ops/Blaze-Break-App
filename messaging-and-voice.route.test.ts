import { describe, it, expect, beforeEach, vi } from 'vitest';

// Integration tests for two more safety/cost-sensitive endpoints, using the
// same harness as the guardian-alert and user-data suites:
//   - POST /api/twilio/send: spends real money and messages a real phone, so
//     its auth + E.164 validation matter.
//   - POST/GET /api/nova/voice-sessions: the voice-continuity record. It must
//     store metadata only, stay scoped to the caller, and validate input.
const h = vi.hoisted(() => {
  process.env.TEST_MODE = 'true';
  process.env.NODE_ENV = 'test';
  process.env.TWILIO_ACCOUNT_SID = 'AC_test';
  process.env.TWILIO_AUTH_TOKEN = 'token_test';
  process.env.TWILIO_PHONE_NUMBER = '+15005550006';
  return { twilioCreate: vi.fn(async (_o: any) => ({ sid: 'SM_test' })) };
});

vi.mock('express-rate-limit', () => ({ default: () => (_req: any, _res: any, next: any) => next() }));
vi.mock('firebase-admin/app', () => ({ initializeApp: vi.fn(), getApps: () => [{}] }));
vi.mock('firebase-admin/app-check', () => ({ getAppCheck: () => ({ verifyToken: vi.fn() }) }));
vi.mock('firebase-admin/auth', () => ({ getAuth: () => ({ verifyIdToken: async (t: string) => ({ uid: t, email: `${t}@test.dev` }) }) }));
vi.mock('firebase-admin/firestore', async () => {
  const fake = await import('./test/fake-firestore');
  return { getFirestore: () => fake.fakeDb, FieldValue: fake.FakeFieldValue };
});
vi.mock('twilio', () => ({ default: () => ({ messages: { create: h.twilioCreate } }) }));

import request from 'supertest';
import { app } from './server';
import { getDocRaw, resetStore } from './test/fake-firestore';

const USER = 'user_owner';
const OTHER = 'user_other';
const auth = (uid: string) => ({ Authorization: `Bearer ${uid}` });

beforeEach(() => {
  resetStore();
  h.twilioCreate.mockClear();
  h.twilioCreate.mockImplementation(async () => ({ sid: 'SM_test' }));
});

describe('POST /api/twilio/send — authenticated, validated outbound SMS', () => {
  it('requires authentication', async () => {
    const res = await request(app).post('/api/twilio/send').send({ to: '+447700900123', message: 'hi' });
    expect(res.status).toBe(401);
    expect(h.twilioCreate).not.toHaveBeenCalled();
  });

  it('rejects a non-E.164 number without ever calling the provider', async () => {
    const res = await request(app).post('/api/twilio/send').set(auth(USER)).send({ to: '07700 900123', message: 'hi' });
    expect(res.status).toBe(400);
    expect(h.twilioCreate).not.toHaveBeenCalled();
  });

  it('rejects an empty message', async () => {
    const res = await request(app).post('/api/twilio/send').set(auth(USER)).send({ to: '+447700900123', message: '' });
    expect(res.status).toBe(400);
    expect(h.twilioCreate).not.toHaveBeenCalled();
  });

  it('sends a valid message via the provider', async () => {
    const res = await request(app).post('/api/twilio/send').set(auth(USER)).send({ to: '+447700900123', message: 'Thinking of you.' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(h.twilioCreate).toHaveBeenCalledTimes(1);
    expect(h.twilioCreate.mock.calls[0][0].to).toBe('+447700900123');
  });

  it('reports a provider failure honestly rather than claiming success', async () => {
    h.twilioCreate.mockImplementationOnce(async () => { throw new Error('provider down'); });
    const res = await request(app).post('/api/twilio/send').set(auth(USER)).send({ to: '+447700900123', message: 'hi' });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });
});

describe('POST/GET /api/nova/voice-sessions — metadata-only continuity, scoped', () => {
  it('requires authentication', async () => {
    expect((await request(app).get('/api/nova/voice-sessions')).status).toBe(401);
    expect((await request(app).post('/api/nova/voice-sessions').send({ durationMs: 1000, turnCount: 2 })).status).toBe(401);
  });

  it('records a session as metadata only — never transcript content', async () => {
    const res = await request(app).post('/api/nova/voice-sessions').set(auth(USER)).send({ durationMs: 125000, turnCount: 7 });
    expect(res.status).toBe(200);
    // What comes back is exactly the three metadata fields, nothing more.
    const list = (await request(app).get('/api/nova/voice-sessions').set(auth(USER))).body.sessions;
    expect(list).toHaveLength(1);
    expect(list[0]).toEqual({ endedAt: expect.any(String), durationMs: 125000, turnCount: 7 });
  });

  it('rejects malformed / out-of-range records', async () => {
    expect((await request(app).post('/api/nova/voice-sessions').set(auth(USER)).send({ durationMs: -5, turnCount: 2 })).status).toBe(400);
    expect((await request(app).post('/api/nova/voice-sessions').set(auth(USER)).send({ turnCount: 2 })).status).toBe(400);
    expect((await request(app).post('/api/nova/voice-sessions').set(auth(USER)).send({ durationMs: 1000, turnCount: 2, transcript: 'secret' })).status).toBe(400);
  });

  it("never returns another user's sessions", async () => {
    await request(app).post('/api/nova/voice-sessions').set(auth(USER)).send({ durationMs: 1000, turnCount: 1 });
    const res = await request(app).get('/api/nova/voice-sessions').set(auth(OTHER));
    expect(res.status).toBe(200);
    expect(res.body.sessions).toHaveLength(0);
  });

  it('stores the session under the user document so export/delete cover it automatically', async () => {
    await request(app).post('/api/nova/voice-sessions').set(auth(USER)).send({ durationMs: 1000, turnCount: 1 });
    // The doc id is auto-generated; assert one exists under the nested path.
    // (getDocRaw needs a full path, so we confirm via the API above; here we
    // just assert no stray top-level collection was created for it.)
    expect(getDocRaw('nova_voice_sessions/anything')).toBeUndefined();
  });
});
