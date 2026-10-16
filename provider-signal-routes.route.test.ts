import { describe, it, expect, beforeEach, vi } from 'vitest';

// QA Batch 4 - QA Batch 3 (oauth-integrations.route.test.ts) proved the
// shared mechanism every OAuth-backed signal route depends on
// (getValidAccessToken's refresh branches, via Jira) and explicitly left
// the remaining provider routes as "smaller and mechanical... a future QA
// batch, not padding." This is that batch: Asana/Monday/Calendly's own
// refresh+read routes (each provider's own fetch orchestration and
// upstream-error handling - the part that's actually different per
// provider, not the token mechanism already proven), plus Calendar/Gmail's
// POST+GET routes, which don't touch OAuth at all - they just validate and
// store a client-submitted payload (computed client-side against the
// user's own browser-held Google token - see src/lib/calendar-signals.ts).
// Deliberately NOT re-tested here: getValidAccessToken's refresh/no-token/
// refresh-failure branches - proven once via Jira in Batch 3, and this
// mechanism is provider-agnostic, so repeating it three more times would
// be exactly the padding Batch 3 said not to do.

const h = vi.hoisted(() => {
  process.env.TEST_MODE = 'true';
  process.env.NODE_ENV = 'test';
  return {};
});

vi.mock('express-rate-limit', () => ({ default: () => (_req: any, _res: any, next: any) => next() }));
vi.mock('firebase-admin/app', () => ({ initializeApp: vi.fn(), getApps: () => [{}] }));
vi.mock('firebase-admin/app-check', () => ({ getAppCheck: () => ({ verifyToken: vi.fn() }) }));
vi.mock('firebase-admin/auth', () => ({
  getAuth: () => ({ verifyIdToken: async (token: string) => ({ uid: token, email: `${token}@test.dev` }) }),
}));
vi.mock('firebase-admin/firestore', async () => {
  const fake = await import('./test/fake-firestore');
  return { getFirestore: () => fake.fakeDb, FieldValue: fake.FakeFieldValue };
});
vi.mock('twilio', () => ({ default: () => ({ messages: { create: vi.fn() } }) }));

import request from 'supertest';
import { app } from './server';
import { seedDoc, getDocRaw, resetStore } from './test/fake-firestore';

const auth = (uid: string) => ({ Authorization: `Bearer ${uid}` });

// A token that is nowhere near expiring, so getValidAccessToken (already
// proven in oauth-integrations.route.test.ts) returns it as-is without
// attempting a refresh - these tests are about what each route does with
// a valid token, not the refresh mechanism itself.
const seedFreshToken = (uid: string, service: string, accessToken = 'valid_token') =>
  seedDoc(`users/${uid}/integration_tokens/${service}`, {
    accessToken,
    refreshToken: 'rt',
    expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
  });

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  resetStore();
  fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({}) }));
  vi.stubGlobal('fetch', fetchMock);
});

describe('POST /api/signals/asana/refresh', () => {
  it('404s when Asana was never connected', async () => {
    const res = await request(app).post('/api/signals/asana/refresh').set(auth('no_token_user'));
    expect(res.status).toBe(404);
  });

  it('fetches identity then open tasks, and stores the overdue count', async () => {
    seedFreshToken('asana_user', 'asana');
    fetchMock.mockImplementation(async (url: string, opts: any) => {
      expect(opts.headers.Authorization).toBe('Bearer valid_token');
      if (url.includes('/users/me')) {
        return { ok: true, json: async () => ({ data: { name: 'Jordan', workspaces: [{ gid: 'ws_1' }] } }) };
      }
      if (url.includes('/tasks')) {
        expect(url).toContain('workspace=ws_1');
        const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
        const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
        return { ok: true, json: async () => ({ data: [{ due_on: yesterday }, { due_on: tomorrow }, { due_on: null }] }) };
      }
      throw new Error(`unexpected fetch: ${url}`);
    });

    const res = await request(app).post('/api/signals/asana/refresh').set(auth('asana_user'));
    expect(res.status).toBe(200);
    expect(res.body.state).toMatchObject({ totalIncompleteTasks: 3, overdueTasks: 1 });
    expect(getDocRaw('users/asana_user/live_signals/asana')).toMatchObject({ totalIncompleteTasks: 3, overdueTasks: 1 });
  });

  it('502s when Asana identity lookup fails', async () => {
    seedFreshToken('asana_user', 'asana');
    fetchMock.mockImplementationOnce(async () => ({ ok: false, json: async () => ({ errors: [{ message: 'unauthorized' }] }) }));

    const res = await request(app).post('/api/signals/asana/refresh').set(auth('asana_user'));
    expect(res.status).toBe(502);
  });

  it('502s when the account has no accessible workspace', async () => {
    seedFreshToken('asana_user', 'asana');
    fetchMock.mockImplementationOnce(async () => ({ ok: true, json: async () => ({ data: { name: 'Jordan', workspaces: [] } }) }));

    const res = await request(app).post('/api/signals/asana/refresh').set(auth('asana_user'));
    expect(res.status).toBe(502);
  });

  it('502s when the tasks fetch itself fails', async () => {
    seedFreshToken('asana_user', 'asana');
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/users/me')) return { ok: true, json: async () => ({ data: { workspaces: [{ gid: 'ws_1' }] } }) };
      return { ok: false, json: async () => ({ errors: [{ message: 'rate limited' }] }) };
    });

    const res = await request(app).post('/api/signals/asana/refresh').set(auth('asana_user'));
    expect(res.status).toBe(502);
  });
});

describe('GET /api/signals/asana', () => {
  it('returns null state when nothing has been fetched yet', async () => {
    const res = await request(app).get('/api/signals/asana').set(auth('fresh_user'));
    expect(res.status).toBe(200);
    expect(res.body.state).toBeNull();
  });

  it('returns the stored signal', async () => {
    seedDoc('users/asana_user/live_signals/asana', { totalIncompleteTasks: 5, overdueTasks: 2 });
    const res = await request(app).get('/api/signals/asana').set(auth('asana_user'));
    expect(res.body.state).toMatchObject({ totalIncompleteTasks: 5, overdueTasks: 2 });
  });
});

describe('POST /api/signals/monday/refresh', () => {
  it('404s when Monday.com was never connected', async () => {
    const res = await request(app).post('/api/signals/monday/refresh').set(auth('no_token_user'));
    expect(res.status).toBe(404);
  });

  it('counts active items and overdue-by-date-column items across boards', async () => {
    seedFreshToken('monday_user', 'monday');
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
    fetchMock.mockImplementationOnce(async (url: string, opts: any) => {
      expect(url).toBe('https://api.monday.com/v2');
      expect(opts.headers.Authorization).toBe('Bearer valid_token');
      return {
        ok: true,
        json: async () => ({
          data: {
            boards: [
              { id: 'b1', name: 'Board 1', items_page: { items: [
                { id: 'i1', column_values: [{ text: yesterday }] },
                { id: 'i2', column_values: [{ text: tomorrow }] },
                { id: 'i3', column_values: [{ text: '' }] },
              ] } },
            ],
          },
        }),
      };
    });

    const res = await request(app).post('/api/signals/monday/refresh').set(auth('monday_user'));
    expect(res.status).toBe(200);
    expect(res.body.state).toMatchObject({ boardsScanned: 1, totalActiveItems: 3, overdueItems: 1 });
  });

  it('502s when the GraphQL call returns errors', async () => {
    seedFreshToken('monday_user', 'monday');
    fetchMock.mockImplementationOnce(async () => ({ ok: true, json: async () => ({ errors: [{ message: 'bad query' }] }) }));

    const res = await request(app).post('/api/signals/monday/refresh').set(auth('monday_user'));
    expect(res.status).toBe(502);
  });
});

describe('GET /api/signals/monday', () => {
  it('returns the stored signal', async () => {
    seedDoc('users/monday_user/live_signals/monday', { boardsScanned: 2, totalActiveItems: 10, overdueItems: 1 });
    const res = await request(app).get('/api/signals/monday').set(auth('monday_user'));
    expect(res.body.state).toMatchObject({ boardsScanned: 2 });
  });
});

describe('POST /api/signals/calendly/refresh', () => {
  it('404s when Calendly was never connected', async () => {
    const res = await request(app).post('/api/signals/calendly/refresh').set(auth('no_token_user'));
    expect(res.status).toBe(404);
  });

  it('fetches identity then upcoming events, and detects back-to-back bookings', async () => {
    seedFreshToken('calendly_user', 'calendly');
    const now = Date.now();
    fetchMock.mockImplementation(async (url: string, opts: any) => {
      expect(opts.headers.Authorization).toBe('Bearer valid_token');
      if (url.includes('/users/me')) {
        return { ok: true, json: async () => ({ resource: { uri: 'https://api.calendly.com/users/u1' } }) };
      }
      if (url.includes('/scheduled_events')) {
        expect(url).toContain('user=https%3A%2F%2Fapi.calendly.com%2Fusers%2Fu1');
        return {
          ok: true,
          json: async () => ({
            collection: [
              { start_time: new Date(now + 3600000).toISOString(), end_time: new Date(now + 7200000).toISOString() },
              // Starts exactly when the first ends - back-to-back.
              { start_time: new Date(now + 7200000).toISOString(), end_time: new Date(now + 10800000).toISOString() },
            ],
          }),
        };
      }
      throw new Error(`unexpected fetch: ${url}`);
    });

    const res = await request(app).post('/api/signals/calendly/refresh').set(auth('calendly_user'));
    expect(res.status).toBe(200);
    expect(res.body.state).toMatchObject({ upcomingBookings7d: 2, bookedHours7d: 2, backToBackCount: 1 });
  });

  it('502s when Calendly identity lookup fails', async () => {
    seedFreshToken('calendly_user', 'calendly');
    fetchMock.mockImplementationOnce(async () => ({ ok: false, json: async () => ({ message: 'invalid token' }) }));

    const res = await request(app).post('/api/signals/calendly/refresh').set(auth('calendly_user'));
    expect(res.status).toBe(502);
  });

  it('502s when the events fetch fails', async () => {
    seedFreshToken('calendly_user', 'calendly');
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/users/me')) return { ok: true, json: async () => ({ resource: { uri: 'https://api.calendly.com/users/u1' } }) };
      return { ok: false, json: async () => ({ message: 'server error' }) };
    });

    const res = await request(app).post('/api/signals/calendly/refresh').set(auth('calendly_user'));
    expect(res.status).toBe(502);
  });
});

describe('GET /api/signals/calendly', () => {
  it('returns the stored signal', async () => {
    seedDoc('users/calendly_user/live_signals/calendly', { upcomingBookings7d: 4 });
    const res = await request(app).get('/api/signals/calendly').set(auth('calendly_user'));
    expect(res.body.state).toMatchObject({ upcomingBookings7d: 4 });
  });
});

describe('POST/GET /api/signals/calendar (client-computed, no OAuth)', () => {
  const validPayload = {
    totalMeetingHours: 12.5,
    meetingCount: 8,
    backToBackCount: 2,
    eveningMeetingCount: 1,
    weekendMeetingCount: 0,
    windowDays: 7,
  };

  it('stores a valid client-submitted payload', async () => {
    const res = await request(app).post('/api/signals/calendar').set(auth('cal_user')).send(validPayload);
    expect(res.status).toBe(200);
    expect(getDocRaw('users/cal_user/live_signals/calendar')).toMatchObject(validPayload);
    // Never touches an OAuth token for this route - no fetch call at all.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects a payload with a missing field', async () => {
    const { windowDays, ...incomplete } = validPayload;
    const res = await request(app).post('/api/signals/calendar').set(auth('cal_user')).send(incomplete);
    expect(res.status).toBe(400);
  });

  it('rejects a payload with an unexpected extra field (strict schema)', async () => {
    const res = await request(app).post('/api/signals/calendar').set(auth('cal_user')).send({ ...validPayload, extra: 'nope' });
    expect(res.status).toBe(400);
  });

  it('reads back what was stored', async () => {
    seedDoc('users/cal_user/live_signals/calendar', validPayload);
    const res = await request(app).get('/api/signals/calendar').set(auth('cal_user'));
    expect(res.body.state).toMatchObject(validPayload);
  });

  it('returns null state when nothing has been submitted yet', async () => {
    const res = await request(app).get('/api/signals/calendar').set(auth('fresh_user'));
    expect(res.body.state).toBeNull();
  });
});

describe('POST/GET /api/signals/gmail (client-computed, no OAuth)', () => {
  it('stores a valid payload', async () => {
    const res = await request(app).post('/api/signals/gmail').set(auth('gmail_user')).send({ unreadCount: 12, totalInboxCount: 340 });
    expect(res.status).toBe(200);
    expect(getDocRaw('users/gmail_user/live_signals/gmail')).toMatchObject({ unreadCount: 12, totalInboxCount: 340 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects a non-numeric field', async () => {
    const res = await request(app).post('/api/signals/gmail').set(auth('gmail_user')).send({ unreadCount: '12', totalInboxCount: 340 });
    expect(res.status).toBe(400);
  });

  it('reads back what was stored', async () => {
    seedDoc('users/gmail_user/live_signals/gmail', { unreadCount: 3, totalInboxCount: 50 });
    const res = await request(app).get('/api/signals/gmail').set(auth('gmail_user'));
    expect(res.body.state).toMatchObject({ unreadCount: 3, totalInboxCount: 50 });
  });
});
