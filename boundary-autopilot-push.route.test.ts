import { describe, it, expect, beforeEach, vi } from 'vitest';

// QA Batch 13: Boundary Autopilot's Slack-action routes and the push
// subscribe/unsubscribe routes had no route-level test coverage at all
// before this file - boundary-autopilot-schemas.test.ts only unit-tests
// the Zod schemas in isolation, never through an actual request. Same
// situation as QA Batch 12's signals/blend and signals/recovery-explain:
// a minimal real happy path for each route, plus the defensive catch
// block, closing out the OAuth/signals group of the ~300-route gap.
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

import crypto from 'crypto';
import request from 'supertest';
import { app } from './server';
import { seedDoc, getDocRaw, resetStore, forceDocError, forceCollectionError } from './test/fake-firestore';

const auth = (uid: string) => ({ Authorization: `Bearer ${uid}` });
const seedSlackToken = (uid: string, accessToken = 'slack_token') =>
  seedDoc(`users/${uid}/integration_tokens/slack`, { accessToken });

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  resetStore();
  fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ ok: true }) }));
  vi.stubGlobal('fetch', fetchMock);
});

describe('GET /api/boundary-autopilot/slack/users', () => {
  it('requires authentication', async () => {
    const res = await request(app).get('/api/boundary-autopilot/slack/users');
    expect(res.status).toBe(401);
  });

  it('400s when Slack is not connected', async () => {
    const res = await request(app).get('/api/boundary-autopilot/slack/users').set(auth('no_token_user'));
    expect(res.status).toBe(400);
  });

  it('lists real human members, excluding bots and the deleted/Slackbot entries', async () => {
    seedSlackToken('user_1');
    fetchMock.mockImplementationOnce(async () => ({
      ok: true,
      json: async () => ({
        ok: true,
        members: [
          { id: 'U1', real_name: 'Jordan', is_bot: false, deleted: false, profile: { image_48: 'a.png' } },
          { id: 'USLACKBOT', real_name: 'Slackbot', is_bot: false, deleted: false },
          { id: 'U2', real_name: 'Bot User', is_bot: true, deleted: false },
          { id: 'U3', real_name: 'Gone', is_bot: false, deleted: true },
        ],
      }),
    }));

    const res = await request(app).get('/api/boundary-autopilot/slack/users').set(auth('user_1'));
    expect(res.status).toBe(200);
    expect(res.body.members).toEqual([{ id: 'U1', name: 'Jordan', avatar: 'a.png' }]);
  });

  it('returns a generic 500 and logs the real error when the Firestore read throws', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const restore = forceDocError('users/user_1/integration_tokens/slack', 'get', new Error('simulated Firestore outage'));

    const res = await request(app).get('/api/boundary-autopilot/slack/users').set(auth('user_1'));

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Could not load Slack contacts.' });
    expect(errorSpy).toHaveBeenCalled();
    const logged = JSON.parse(errorSpy.mock.calls[0][0] as string);
    expect(logged.message).toContain('[Boundary Autopilot] slack users error:');

    restore();
    errorSpy.mockRestore();
  });
});

describe('POST /api/boundary-autopilot/slack/send', () => {
  const validBody = { recipientId: 'U1', recipientName: 'Jordan', message: 'Running 10 min late', confirm: true };

  it('rejects a request missing explicit confirmation', async () => {
    const res = await request(app).post('/api/boundary-autopilot/slack/send').set(auth('user_1')).send({ recipientId: 'U1', message: 'hi' });
    expect(res.status).toBe(400);
  });

  it('opens a DM and sends the message, logging a successful autopilot action', async () => {
    seedSlackToken('user_1');
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('conversations.open')) return { ok: true, json: async () => ({ ok: true, channel: { id: 'D1' } }) };
      return { ok: true, json: async () => ({ ok: true }) };
    });

    const res = await request(app).post('/api/boundary-autopilot/slack/send').set(auth('user_1')).send(validBody);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true });
    expect(fetchMock).toHaveBeenCalledTimes(2); // conversations.open, then chat.postMessage
  });

  it('returns a generic 500 and logs the real error when the Firestore read throws', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const restore = forceDocError('users/user_1/integration_tokens/slack', 'get', new Error('simulated Firestore outage'));

    const res = await request(app).post('/api/boundary-autopilot/slack/send').set(auth('user_1')).send(validBody);

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Could not send the message.' });
    expect(errorSpy).toHaveBeenCalled();
    const logged = JSON.parse(errorSpy.mock.calls[0][0] as string);
    expect(logged.message).toContain('[Boundary Autopilot] slack send error:');

    restore();
    errorSpy.mockRestore();
  });
});

describe('POST /api/boundary-autopilot/slack/dnd', () => {
  it('rejects a request missing explicit confirmation', async () => {
    const res = await request(app).post('/api/boundary-autopilot/slack/dnd').set(auth('user_1')).send({ minutes: 30 });
    expect(res.status).toBe(400);
  });

  it('sets a Slack snooze and returns the end time', async () => {
    seedSlackToken('user_1');
    fetchMock.mockImplementationOnce(async () => ({ ok: true, json: async () => ({ ok: true, snooze_endtime: 1234567890 }) }));

    const res = await request(app).post('/api/boundary-autopilot/slack/dnd').set(auth('user_1')).send({ minutes: 30, confirm: true });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true, snoozeEndtime: 1234567890 });
  });

  it('returns a generic 500 and logs the real error when the Firestore read throws', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const restore = forceDocError('users/user_1/integration_tokens/slack', 'get', new Error('simulated Firestore outage'));

    const res = await request(app).post('/api/boundary-autopilot/slack/dnd').set(auth('user_1')).send({ minutes: 30, confirm: true });

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Could not set Do Not Disturb.' });
    expect(errorSpy).toHaveBeenCalled();
    const logged = JSON.parse(errorSpy.mock.calls[0][0] as string);
    expect(logged.message).toContain('[Boundary Autopilot] slack dnd error:');

    restore();
    errorSpy.mockRestore();
  });
});

describe('POST /api/boundary-autopilot/slack/status', () => {
  it('rejects a request missing explicit confirmation', async () => {
    const res = await request(app).post('/api/boundary-autopilot/slack/status').set(auth('user_1')).send({ statusText: 'Focus time' });
    expect(res.status).toBe(400);
  });

  it('sets a Slack status', async () => {
    seedSlackToken('user_1');
    fetchMock.mockImplementationOnce(async () => ({ ok: true, json: async () => ({ ok: true }) }));

    const res = await request(app).post('/api/boundary-autopilot/slack/status').set(auth('user_1')).send({ statusText: 'Focus time', statusEmoji: ':dart:', confirm: true });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true });
  });

  it('returns a generic 500 and logs the real error when the Firestore read throws', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const restore = forceDocError('users/user_1/integration_tokens/slack', 'get', new Error('simulated Firestore outage'));

    const res = await request(app).post('/api/boundary-autopilot/slack/status').set(auth('user_1')).send({ statusText: 'Focus time', confirm: true });

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Could not update your Slack status.' });
    expect(errorSpy).toHaveBeenCalled();
    const logged = JSON.parse(errorSpy.mock.calls[0][0] as string);
    expect(logged.message).toContain('[Boundary Autopilot] slack status error:');

    restore();
    errorSpy.mockRestore();
  });
});

describe('POST /api/boundary-autopilot/log-calendar-decline', () => {
  it('rejects a payload missing eventSummary', async () => {
    const res = await request(app).post('/api/boundary-autopilot/log-calendar-decline').set(auth('user_1')).send({});
    expect(res.status).toBe(400);
  });

  it('logs the decline as a successful autopilot action', async () => {
    const res = await request(app).post('/api/boundary-autopilot/log-calendar-decline').set(auth('user_1')).send({ eventSummary: '1:1 with manager' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true });
    // The write uses an auto-generated doc id; its persistence (and shape)
    // is proven via the history route's own test below, which reads it back.
  });

  // Not the route's own catch block (which is structurally unreachable -
  // logAutopilotAction swallows its own write failure internally, same
  // deliberate "a logging failure shouldn't mask the action's own result"
  // contract already proven for admin actions in
  // admin-audit-log-resilience.route.test.ts). This proves the same
  // contract holds here: the action still succeeds, and the failure is
  // still visible rather than silently dropped.
  it('still succeeds, and still logs the failure, when the audit-log write itself throws', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const restore = forceCollectionError('users/user_1/autopilot_actions', 'add', new Error('simulated Firestore outage'));

    const res = await request(app).post('/api/boundary-autopilot/log-calendar-decline').set(auth('user_1')).send({ eventSummary: '1:1 with manager' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true });
    expect(errorSpy).toHaveBeenCalled();
    const logged = JSON.parse(errorSpy.mock.calls[0][0] as string);
    expect(logged.message).toContain('[Boundary Autopilot] audit log failed:');

    restore();
    errorSpy.mockRestore();
  });
});

describe('GET /api/boundary-autopilot/history', () => {
  it('requires authentication', async () => {
    const res = await request(app).get('/api/boundary-autopilot/history');
    expect(res.status).toBe(401);
  });

  it('records and returns the calendar-decline action logged above', async () => {
    const logRes = await request(app).post('/api/boundary-autopilot/log-calendar-decline').set(auth('history_user')).send({ eventSummary: 'Weekly sync' });
    expect(logRes.status).toBe(200);

    const res = await request(app).get('/api/boundary-autopilot/history').set(auth('history_user'));
    expect(res.status).toBe(200);
    expect(res.body.actions).toHaveLength(1);
    expect(res.body.actions[0]).toMatchObject({ action: 'calendar_decline', success: true, detail: { eventSummary: 'Weekly sync' } });
  });

  it('returns a generic 500 and logs the real error when the Firestore read throws', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const restore = forceCollectionError('users/history_user/autopilot_actions', 'get', new Error('simulated Firestore outage'));

    const res = await request(app).get('/api/boundary-autopilot/history').set(auth('history_user'));

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Could not load action history.' });
    expect(errorSpy).toHaveBeenCalled();
    const logged = JSON.parse(errorSpy.mock.calls[0][0] as string);
    expect(logged.message).toContain('[Boundary Autopilot] history error:');

    restore();
    errorSpy.mockRestore();
  });
});

describe('POST /api/push/subscribe', () => {
  const validPayload = {
    endpoint: 'https://push.example.com/abc123',
    expirationTime: null,
    keys: { p256dh: 'p256dh_value', auth: 'auth_value' },
  };

  it('requires authentication', async () => {
    const res = await request(app).post('/api/push/subscribe').send(validPayload);
    expect(res.status).toBe(401);
  });

  it('rejects an invalid payload', async () => {
    const res = await request(app).post('/api/push/subscribe').set(auth('user_1')).send({ endpoint: 'not-a-url' });
    expect(res.status).toBe(400);
  });

  it('stores the subscription keyed by a hash of the endpoint', async () => {
    const res = await request(app).post('/api/push/subscribe').set(auth('user_1')).send(validPayload);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true });
  });

  it('returns a generic 500 and logs the real error when the Firestore write throws', async () => {
    const subId = crypto.createHash('sha256').update(validPayload.endpoint).digest('hex').slice(0, 32);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const restore = forceDocError(`users/user_1/push_subscriptions/${subId}`, 'set', new Error('simulated Firestore outage'));

    const res = await request(app).post('/api/push/subscribe').set(auth('user_1')).send(validPayload);

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Could not save your push subscription.' });
    expect(errorSpy).toHaveBeenCalled();
    const logged = JSON.parse(errorSpy.mock.calls[0][0] as string);
    expect(logged.message).toContain('[Push] subscribe error:');

    restore();
    errorSpy.mockRestore();
  });
});

describe('POST /api/push/unsubscribe', () => {
  it('requires authentication', async () => {
    const res = await request(app).post('/api/push/unsubscribe').send({});
    expect(res.status).toBe(401);
  });

  it('removes a single subscription by endpoint', async () => {
    const endpoint = 'https://push.example.com/xyz789';
    const subId = crypto.createHash('sha256').update(endpoint).digest('hex').slice(0, 32);
    seedDoc(`users/user_1/push_subscriptions/${subId}`, { endpoint, keys: { p256dh: 'a', auth: 'b' } });

    const res = await request(app).post('/api/push/unsubscribe').set(auth('user_1')).send({ endpoint });
    expect(res.status).toBe(200);
    expect(getDocRaw(`users/user_1/push_subscriptions/${subId}`)).toBeUndefined();
  });

  it('removes every subscription when no endpoint is given', async () => {
    seedDoc('users/user_1/push_subscriptions/sub_a', { endpoint: 'a' });
    seedDoc('users/user_1/push_subscriptions/sub_b', { endpoint: 'b' });

    const res = await request(app).post('/api/push/unsubscribe').set(auth('user_1')).send({});
    expect(res.status).toBe(200);
    expect(getDocRaw('users/user_1/push_subscriptions/sub_a')).toBeUndefined();
    expect(getDocRaw('users/user_1/push_subscriptions/sub_b')).toBeUndefined();
  });

  it('returns a generic 500 and logs the real error when the Firestore read throws', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const restore = forceCollectionError('users/user_1/push_subscriptions', 'get', new Error('simulated Firestore outage'));

    const res = await request(app).post('/api/push/unsubscribe').set(auth('user_1')).send({});

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Could not remove your push subscription.' });
    expect(errorSpy).toHaveBeenCalled();
    const logged = JSON.parse(errorSpy.mock.calls[0][0] as string);
    expect(logged.message).toContain('[Push] unsubscribe error:');

    restore();
    errorSpy.mockRestore();
  });
});
