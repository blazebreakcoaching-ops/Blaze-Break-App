import { describe, it, expect, beforeEach, vi } from 'vitest';

// QA Batch 5 - the last explicitly-flagged remaining item from
// QA_COVERAGE.md's OAuth/signals area: POST /api/signals/slack/tick.
// Deliberately left out of Batches 3-4 as "a meaningfully different,
// stateful, rate-limited multi-call shape" - unlike every other signal
// route (one fetch, one write), this one advances a persisted scan
// cursor across repeated calls (Slack rate-limits conversations.history
// to 1 req/min for non-Marketplace apps - see the comment above the
// route in server.ts), so a real test has to drive it through several
// ticks to prove the cursor/rollover logic, not just one request/response.

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

const seedSlackToken = (uid: string, accessToken = 'slack_token') =>
  seedDoc(`users/${uid}/integration_tokens/slack`, { accessToken, refreshToken: 'rt' });

let fetchMock: ReturnType<typeof vi.fn>;

// Builds a Slack message at a specific UTC hour/day-of-week, `n` days ago
// from today, so after-hours/weekend classification is deterministic
// regardless of when the test suite actually runs.
const slackMsg = (user: string, isoWithUtcHourAndDow: Date) => ({
  user,
  ts: (isoWithUtcHourAndDow.getTime() / 1000).toString(),
});

// A Monday 10:00 UTC and a Monday 20:00 UTC timestamp, both within the
// last 7 days, used as fixed "business hours" vs "after hours" messages
// that don't depend on the real current date.
const mondayAt = (hourUtc: number) => {
  const d = new Date();
  d.setUTCHours(hourUtc, 0, 0, 0);
  // Walk back to the most recent Monday (or today if already Monday).
  const day = d.getUTCDay();
  const diff = day === 0 ? 6 : day - 1;
  d.setUTCDate(d.getUTCDate() - diff);
  return d;
};
const saturdayAt = (hourUtc: number) => {
  const d = mondayAt(hourUtc);
  d.setUTCDate(d.getUTCDate() + 5);
  return d;
};

const mockSlack = (impl: (method: string, url: URL) => any) => {
  fetchMock.mockImplementation(async (urlStr: string) => {
    const url = new URL(urlStr);
    const method = url.pathname.replace('/api/', '');
    return { json: async () => impl(method, url) };
  });
};

beforeEach(() => {
  resetStore();
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

describe('POST /api/signals/slack/tick - connection gate', () => {
  it('404s when Slack was never connected', async () => {
    const res = await request(app).post('/api/signals/slack/tick').set(auth('no_token_user'));
    expect(res.status).toBe(404);
  });

  it('404s when the token doc exists but has no accessToken', async () => {
    seedDoc('users/empty_token_user/integration_tokens/slack', { refreshToken: 'rt' });
    const res = await request(app).post('/api/signals/slack/tick').set(auth('empty_token_user'));
    expect(res.status).toBe(404);
  });
});

describe('POST /api/signals/slack/tick - rate limiting', () => {
  it('refuses to tick again within 60s, without calling Slack at all', async () => {
    seedSlackToken('rl_user');
    seedDoc('users/rl_user/live_signals/slack', {
      conversationIds: ['c1'],
      scanIndex: 0,
      selfUserId: 'U1',
      lastTickAt: new Date().toISOString(),
      inProgressTotal: 0, inProgressAfterHours: 0, inProgressWeekend: 0,
    });

    const res = await request(app).post('/api/signals/slack/tick').set(auth('rl_user'));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ticked: false, reason: 'rate_limited' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('POST /api/signals/slack/tick - first-ever tick', () => {
  it('establishes identity and conversation list, then scans the first conversation in the same call', async () => {
    seedSlackToken('first_user');
    const msgTime = mondayAt(10); // business hours, within the fake "now" window
    mockSlack((method, url) => {
      if (method === 'auth.test') return { ok: true, user_id: 'U_SELF' };
      if (method === 'conversations.list') return { ok: true, channels: [{ id: 'c1' }, { id: 'c2' }] };
      if (method === 'conversations.history') {
        expect(url.searchParams.get('channel')).toBe('c1'); // scanIndex 0 -> first conversation
        return { ok: true, messages: [slackMsg('U_SELF', msgTime), slackMsg('OTHER_USER', msgTime)] };
      }
      throw new Error(`unexpected method ${method}`);
    });

    const res = await request(app).post('/api/signals/slack/tick').set(auth('first_user'));
    expect(res.status).toBe(200);
    expect(res.body.ticked).toBe(true);
    expect(res.body.state.scanProgress).toBe('1/2'); // advanced past conversation 0
    expect(res.body.state.inProgress.totalMessages).toBe(1); // only the self-user message counted

    const stored = getDocRaw('users/first_user/live_signals/slack');
    expect(stored).toMatchObject({ selfUserId: 'U_SELF', conversationIds: ['c1', 'c2'], scanIndex: 1 });
  });

  it('never exposes selfUserId or the raw conversation list to the client', async () => {
    seedSlackToken('redact_user');
    mockSlack((method) => {
      if (method === 'auth.test') return { ok: true, user_id: 'U_SECRET' };
      if (method === 'conversations.list') return { ok: true, channels: [{ id: 'c_private_1' }] };
      return { ok: true, messages: [] };
    });

    const res = await request(app).post('/api/signals/slack/tick').set(auth('redact_user'));
    const body = JSON.stringify(res.body);
    expect(body).not.toContain('U_SECRET');
    expect(body).not.toContain('c_private_1');
  });

  it('returns a "nothing to scan" note when the account has no conversations at all', async () => {
    seedSlackToken('empty_conv_user');
    mockSlack((method) => {
      if (method === 'auth.test') return { ok: true, user_id: 'U_SELF' };
      if (method === 'conversations.list') return { ok: true, channels: [] };
      throw new Error('should not reach conversations.history with an empty list');
    });

    const res = await request(app).post('/api/signals/slack/tick').set(auth('empty_conv_user'));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ticked: true, note: 'No conversations to scan yet.' });
  });

  it('502s when Slack identity verification fails', async () => {
    seedSlackToken('bad_auth_user');
    mockSlack(() => ({ ok: false, error: 'invalid_auth' }));

    const res = await request(app).post('/api/signals/slack/tick').set(auth('bad_auth_user'));
    expect(res.status).toBe(502);
    expect(res.body.error).toMatch(/identity/);
  });

  it('502s when listing conversations fails', async () => {
    seedSlackToken('bad_list_user');
    mockSlack((method) => {
      if (method === 'auth.test') return { ok: true, user_id: 'U_SELF' };
      return { ok: false, error: 'missing_scope' };
    });

    const res = await request(app).post('/api/signals/slack/tick').set(auth('bad_list_user'));
    expect(res.status).toBe(502);
    expect(res.body.error).toMatch(/list Slack conversations/);
  });
});

describe('POST /api/signals/slack/tick - subsequent ticks mid-cycle', () => {
  it('reuses the known selfUserId (no auth.test call) and advances to the next conversation', async () => {
    seedSlackToken('mid_user');
    seedDoc('users/mid_user/live_signals/slack', {
      conversationIds: ['c1', 'c2', 'c3'],
      scanIndex: 1,
      selfUserId: 'U_SELF',
      lastTickAt: new Date(Date.now() - 120000).toISOString(), // 2 minutes ago - past the rate limit
      inProgressTotal: 5, inProgressAfterHours: 1, inProgressWeekend: 0,
    });

    const calledMethods: string[] = [];
    mockSlack((method, url) => {
      calledMethods.push(method);
      expect(url.searchParams.get('channel')).toBe('c2'); // scanIndex 1 -> second conversation
      return { ok: true, messages: [] };
    });

    const res = await request(app).post('/api/signals/slack/tick').set(auth('mid_user'));
    expect(res.status).toBe(200);
    expect(calledMethods).toEqual(['conversations.history']); // never auth.test or conversations.list
    expect(res.body.state.scanProgress).toBe('2/3');
    // In-progress counts carried forward unchanged (no messages this tick).
    expect(res.body.state.inProgress.totalMessages).toBe(5);
  });

  it('skips a conversation whose history call fails, without aborting or losing progress', async () => {
    seedSlackToken('skip_user');
    seedDoc('users/skip_user/live_signals/slack', {
      conversationIds: ['c1', 'c2'],
      scanIndex: 0,
      selfUserId: 'U_SELF',
      lastTickAt: new Date(Date.now() - 120000).toISOString(),
      inProgressTotal: 0, inProgressAfterHours: 0, inProgressWeekend: 0,
    });
    mockSlack(() => ({ ok: false, error: 'missing_scope' }));

    const res = await request(app).post('/api/signals/slack/tick').set(auth('skip_user'));
    expect(res.status).toBe(200);
    expect(res.body.ticked).toBe(true);
    expect(res.body.state.scanProgress).toBe('1/2'); // still advanced past the failed conversation
  });

  it('classifies after-hours and weekend messages correctly, in UTC', async () => {
    seedSlackToken('classify_user');
    seedDoc('users/classify_user/live_signals/slack', {
      conversationIds: ['c1'],
      scanIndex: 0,
      selfUserId: 'U_SELF',
      lastTickAt: new Date(Date.now() - 120000).toISOString(),
      inProgressTotal: 0, inProgressAfterHours: 0, inProgressWeekend: 0,
    });
    mockSlack((method) => {
      if (method === 'conversations.history') {
        return {
          ok: true,
          messages: [
            slackMsg('U_SELF', mondayAt(10)),    // business hours, weekday
            slackMsg('U_SELF', mondayAt(20)),    // after hours, weekday
            slackMsg('U_SELF', saturdayAt(12)),  // weekend, and after-hours is irrelevant here (still daytime)
          ],
        };
      }
      throw new Error('unexpected call');
    });

    const res = await request(app).post('/api/signals/slack/tick').set(auth('classify_user'));
    expect(res.body.state.inProgress).toMatchObject({ totalMessages: 3, afterHoursMessages: 1, weekendMessages: 1 });
  });
});

describe('POST /api/signals/slack/tick - full cycle completion', () => {
  it('rolls in-progress counts into lastCompleted and starts a new cycle without re-verifying identity', async () => {
    seedSlackToken('cycle_user');
    seedDoc('users/cycle_user/live_signals/slack', {
      conversationIds: ['c1', 'c2'],
      scanIndex: 2, // past the end - this cycle is done
      selfUserId: 'U_SELF',
      lastTickAt: new Date(Date.now() - 120000).toISOString(),
      inProgressTotal: 42, inProgressAfterHours: 10, inProgressWeekend: 5,
      lastCompleted: null,
    });

    const calledMethods: string[] = [];
    mockSlack((method) => {
      calledMethods.push(method);
      if (method === 'conversations.list') return { ok: true, channels: [{ id: 'c1' }] };
      if (method === 'conversations.history') return { ok: true, messages: [] };
      throw new Error(`should not call ${method} - selfUserId was already known`);
    });

    const res = await request(app).post('/api/signals/slack/tick').set(auth('cycle_user'));
    expect(res.status).toBe(200);
    expect(calledMethods).not.toContain('auth.test');
    expect(res.body.state.lastCompleted).toMatchObject({ totalMessages7d: 42, afterHoursMessages7d: 10, weekendMessages7d: 5 });
    expect(res.body.state.inProgress).toMatchObject({ totalMessages: 0 }); // the new cycle's counter, reset
  });
});

describe('GET /api/signals/slack', () => {
  it('returns null state when nothing has ticked yet', async () => {
    const res = await request(app).get('/api/signals/slack').set(auth('fresh_user'));
    expect(res.status).toBe(200);
    expect(res.body.state).toBeNull();
  });

  it('returns the redacted state', async () => {
    seedDoc('users/read_user/live_signals/slack', {
      conversationIds: ['c1', 'c2'], scanIndex: 1, selfUserId: 'U_SECRET',
      inProgressTotal: 3, inProgressAfterHours: 1, inProgressWeekend: 0,
      lastCompleted: null, updatedAt: '2026-01-01T00:00:00.000Z',
    });

    const res = await request(app).get('/api/signals/slack').set(auth('read_user'));
    expect(res.body.state).toMatchObject({ scanProgress: '1/2', inProgress: { totalMessages: 3 } });
    expect(JSON.stringify(res.body)).not.toContain('U_SECRET');
  });
});
