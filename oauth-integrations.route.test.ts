import { describe, it, expect, beforeEach, vi } from 'vitest';

// QA Batch 3 - docs/QA_COVERAGE.md flagged the OAuth integration code
// (Slack/Jira/Asana/Monday/Calendar/Gmail, roughly 1400 lines of server.ts)
// as near-zero coverage, because exercising it meaningfully means mocking
// each provider's token endpoint, not just Firestore. This covers the
// core, highest-value mechanism rather than all ~18 routes in that area:
// the OAuth state signing/CSRF verification every provider shares, the
// full connect->callback->disconnect->status lifecycle worked through for
// Jira (json tokenStyle, extraAuthorizeParams) and Slack (authed_user
// token nesting, form tokenStyle, userScope), and getValidAccessToken's
// token-refresh branches via its real consumer, POST /api/signals/jira/refresh.
// Deliberately NOT covered here: Asana/Monday/Calendly/Calendar/Gmail's own
// signal-fetch routes - they share the same getValidAccessToken mechanism
// already proven via Jira, and covering all of them in one pass would be
// padding, not a new finding - a real, separate future batch if picked up.

const h = vi.hoisted(() => {
  process.env.TEST_MODE = 'true';
  process.env.NODE_ENV = 'test';
  process.env.APP_URL = 'https://app.blazebreak.example';
  process.env.OAUTH_STATE_SECRET = 'oauth_state_secret_test_value';
  process.env.SLACK_CLIENT_ID = 'slack_client_id';
  process.env.SLACK_CLIENT_SECRET = 'slack_client_secret';
  process.env.JIRA_CLIENT_ID = 'jira_client_id';
  process.env.JIRA_CLIENT_SECRET = 'jira_client_secret';
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
import { seedDoc, getDocRaw, resetStore, forceDocError, forceCollectionError } from './test/fake-firestore';

const auth = (uid: string) => ({ Authorization: `Bearer ${uid}` });

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  resetStore();
  fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({}) }));
  vi.stubGlobal('fetch', fetchMock);
});

describe('POST /api/integrations/:service/connect', () => {
  it('requires authentication', async () => {
    const res = await request(app).post('/api/integrations/jira/connect');
    expect(res.status).toBe(401);
  });

  it('rejects an unknown service', async () => {
    const res = await request(app).post('/api/integrations/not-a-real-service/connect').set(auth('user_1'));
    expect(res.status).toBe(404);
  });

  it('refuses a service with no client ID configured on the server', async () => {
    const res = await request(app).post('/api/integrations/asana/connect').set(auth('user_1'));
    expect(res.status).toBe(503);
    expect(res.body.error).toMatch(/ASANA_CLIENT_ID/);
  });

  it('builds a signed, provider-scoped authorize URL for Jira', async () => {
    const res = await request(app).post('/api/integrations/jira/connect').set(auth('user_1'));
    expect(res.status).toBe(200);
    const url = new URL(res.body.authorizeUrl);
    expect(url.origin + url.pathname).toBe('https://auth.atlassian.com/authorize');
    expect(url.searchParams.get('client_id')).toBe('jira_client_id');
    expect(url.searchParams.get('redirect_uri')).toBe('https://app.blazebreak.example/api/integrations/callback/jira');
    expect(url.searchParams.get('scope')).toBe('read:jira-work read:jira-user offline_access');
    expect(url.searchParams.get('audience')).toBe('api.atlassian.com');
    expect(url.searchParams.get('prompt')).toBe('consent');
    expect(url.searchParams.get('state')).toBeTruthy();
  });

  it('uses user_scope (not scope) for Slack, matching its bot/user-token split', async () => {
    const res = await request(app).post('/api/integrations/slack/connect').set(auth('user_1'));
    expect(res.status).toBe(200);
    const url = new URL(res.body.authorizeUrl);
    expect(url.searchParams.get('user_scope')).toContain('chat:write');
    expect(url.searchParams.get('scope')).toBeNull();
  });

  // QA Batch 10: the defensive catch block behind the happy path above.
  // This route makes no Firestore call at all (signOAuthState is a pure
  // HMAC sign) - its one real, realistic failure is getOAuthRedirectUri()
  // throwing when APP_URL isn't configured, a genuine misconfiguration
  // this route is already written to catch and convert to a safe 500
  // rather than crash the process.
  it('returns a generic 500 and logs the real error when APP_URL is not configured', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const realAppUrl = process.env.APP_URL;
    delete process.env.APP_URL;

    const res = await request(app).post('/api/integrations/jira/connect').set(auth('user_1'));

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Something went wrong on our end. Please try again.' });
    expect(errorSpy).toHaveBeenCalled();
    const logged = JSON.parse(errorSpy.mock.calls[0][0] as string);
    expect(logged.message).toContain('[Integrations] connect error:');

    process.env.APP_URL = realAppUrl;
    errorSpy.mockRestore();
  });
});

describe('GET /api/integrations/callback/:service - CSRF state verification', () => {
  const getSignedState = async (uid: string, service: string) => {
    const res = await request(app).post(`/api/integrations/${service}/connect`).set(auth(uid));
    return new URL(res.body.authorizeUrl).searchParams.get('state')!;
  };

  it('rejects an unknown service before even looking at the state', async () => {
    const res = await request(app).get('/api/integrations/callback/not-a-real-service?code=abc&state=whatever');
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain('status=error&reason=unknown_service');
  });

  it('rejects a callback with no code', async () => {
    const state = await getSignedState('user_1', 'jira');
    const res = await request(app).get(`/api/integrations/callback/jira?state=${encodeURIComponent(state)}`);
    expect(res.headers.location).toContain('reason=missing_code');
  });

  it('rejects a tampered state signature without revealing why (internal_error, not csrf_detected)', async () => {
    const state = await getSignedState('user_1', 'jira');
    const tampered = state.slice(0, -2) + 'xx';
    const res = await request(app).get(`/api/integrations/callback/jira?code=abc123&state=${encodeURIComponent(tampered)}`);
    expect(res.headers.location).toContain('reason=internal_error');
  });

  it('rejects a state that was signed for a different service', async () => {
    const slackState = await getSignedState('user_1', 'slack');
    const res = await request(app).get(`/api/integrations/callback/jira?code=abc123&state=${encodeURIComponent(slackState)}`);
    expect(res.headers.location).toContain('reason=internal_error');
  });

  it('rejects an expired state', async () => {
    const realNow = Date.now;
    Date.now = () => realNow() - 11 * 60 * 1000; // sign as if 11 minutes in the past (10-minute expiry)
    const state = await getSignedState('user_1', 'jira');
    Date.now = realNow;

    const res = await request(app).get(`/api/integrations/callback/jira?code=abc123&state=${encodeURIComponent(state)}`);
    expect(res.headers.location).toContain('reason=internal_error');
  });
});

describe('GET /api/integrations/callback/:service - token exchange', () => {
  const getSignedState = async (uid: string, service: string) => {
    const res = await request(app).post(`/api/integrations/${service}/connect`).set(auth(uid));
    return new URL(res.body.authorizeUrl).searchParams.get('state')!;
  };

  it('exchanges the code for Jira (json tokenStyle) and stores tokens + a redacted status doc', async () => {
    const state = await getSignedState('jira_user', 'jira');
    fetchMock.mockImplementationOnce(async (_url: string, opts: any) => {
      expect(opts.headers['Content-Type']).toBe('application/json');
      const sent = JSON.parse(opts.body);
      expect(sent).toMatchObject({ grant_type: 'authorization_code', client_id: 'jira_client_id', client_secret: 'jira_client_secret', code: 'the-real-code' });
      return { ok: true, json: async () => ({ access_token: 'jira_at', refresh_token: 'jira_rt', expires_in: 3600 }) };
    });

    const res = await request(app).get(`/api/integrations/callback/jira?code=the-real-code&state=${encodeURIComponent(state)}`);
    expect(res.headers.location).toBe('https://app.blazebreak.example/?integration=jira&status=connected');

    const tokenDoc = getDocRaw('users/jira_user/integration_tokens/jira');
    expect(tokenDoc).toMatchObject({ accessToken: 'jira_at', refreshToken: 'jira_rt' });
    expect(tokenDoc?.expiresAt).toBeTruthy();

    const statusDoc = getDocRaw('users/jira_user/integrations/jira');
    expect(statusDoc).toMatchObject({ service: 'jira', connected: true });
    // Never leaks the raw token into the client-readable status doc.
    expect(statusDoc?.accessToken).toBeUndefined();
  });

  it('exchanges the code for Slack (form tokenStyle) and extracts the nested authed_user token', async () => {
    const state = await getSignedState('slack_user', 'slack');
    fetchMock.mockImplementationOnce(async (_url: string, opts: any) => {
      expect(opts.headers['Content-Type']).toBe('application/x-www-form-urlencoded');
      const sent = new URLSearchParams(opts.body);
      expect(sent.get('grant_type')).toBe('authorization_code');
      expect(sent.get('client_id')).toBe('slack_client_id');
      return { ok: true, json: async () => ({ ok: true, authed_user: { access_token: 'slack_at', refresh_token: 'slack_rt', expires_in: 43200 } }) };
    });

    const res = await request(app).get(`/api/integrations/callback/slack?code=the-real-code&state=${encodeURIComponent(state)}`);
    expect(res.headers.location).toBe('https://app.blazebreak.example/?integration=slack&status=connected');

    const tokenDoc = getDocRaw('users/slack_user/integration_tokens/slack');
    expect(tokenDoc).toMatchObject({ accessToken: 'slack_at', refreshToken: 'slack_rt' });
  });

  it('fails cleanly when the token endpoint rejects the exchange', async () => {
    const state = await getSignedState('jira_user', 'jira');
    fetchMock.mockImplementationOnce(async () => ({ ok: false, json: async () => ({ error: 'invalid_grant' }) }));

    const res = await request(app).get(`/api/integrations/callback/jira?code=bad-code&state=${encodeURIComponent(state)}`);
    expect(res.headers.location).toContain('reason=token_exchange_failed');
    expect(getDocRaw('users/jira_user/integration_tokens/jira')).toBeUndefined();
  });

  it('fails cleanly when the provider response has no access token', async () => {
    const state = await getSignedState('jira_user', 'jira');
    fetchMock.mockImplementationOnce(async () => ({ ok: true, json: async () => ({ token_type: 'bearer' }) }));

    const res = await request(app).get(`/api/integrations/callback/jira?code=weird-response&state=${encodeURIComponent(state)}`);
    expect(res.headers.location).toContain('reason=no_access_token');
  });

  // SECURITY HOTFIX (independent review, see
  // SECURITY_HOTFIX_INDEPENDENT_REVIEW_REPORT.md): the failure-path
  // logger.error calls used to log the provider's response body verbatim
  // ({ responseBody: tokenBody }) - a response shaped like a failure can
  // still carry a real access_token/client_secret alongside the error.
  it('never logs a real token that arrives alongside a failure-shaped token response', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const state = await getSignedState('jira_user', 'jira');
    fetchMock.mockImplementationOnce(async () => ({
      ok: false,
      json: async () => ({ error: 'invalid_grant', access_token: 'LEAKED_TOKEN_MUST_NOT_BE_LOGGED', client_secret: 'LEAKED_SECRET_MUST_NOT_BE_LOGGED' }),
    }));

    const res = await request(app).get(`/api/integrations/callback/jira?code=bad-code&state=${encodeURIComponent(state)}`);
    expect(res.headers.location).toContain('reason=token_exchange_failed');

    const loggedText = JSON.stringify(errorSpy.mock.calls);
    expect(loggedText).not.toContain('LEAKED_TOKEN_MUST_NOT_BE_LOGGED');
    expect(loggedText).not.toContain('LEAKED_SECRET_MUST_NOT_BE_LOGGED');
    errorSpy.mockRestore();
  });

  it('logs only the bounded OAuth diagnostic shape on failure - the real error reason plus field NAMES, never field values, for anything else', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const state = await getSignedState('jira_user', 'jira');
    fetchMock.mockImplementationOnce(async () => ({
      ok: false,
      json: async () => ({ error: 'invalid_grant', error_description: 'The provided authorization grant is invalid.', access_token: 'LEAKED_TOKEN_MUST_NOT_BE_LOGGED', client_secret: 'LEAKED_SECRET_MUST_NOT_BE_LOGGED' }),
    }));

    await request(app).get(`/api/integrations/callback/jira?code=bad-code&state=${encodeURIComponent(state)}`);

    // logger.error writes one JSON-stringified line per call, not
    // separate (message, fields) console.error args - see logger.ts.
    const loggedLine = errorSpy.mock.calls.map(([line]) => String(line)).find((line) => line.includes('token exchange failed'));
    expect(loggedLine).toBeDefined();
    const logged = JSON.parse(loggedLine!);
    expect(logged).toMatchObject({ error: 'invalid_grant', errorDescription: 'The provided authorization grant is invalid.' });
    expect(logged.otherFieldNames.sort()).toEqual(['access_token', 'client_secret']);
    errorSpy.mockRestore();
  });
});

describe('POST /api/integrations/:service/disconnect and GET /api/integrations/status', () => {
  it('disconnect deletes the token doc and flips the status doc to disconnected', async () => {
    seedDoc('users/user_1/integration_tokens/jira', { accessToken: 'at', refreshToken: 'rt' });
    seedDoc('users/user_1/integrations/jira', { service: 'jira', connected: true });

    const res = await request(app).post('/api/integrations/jira/disconnect').set(auth('user_1'));
    expect(res.status).toBe(200);
    expect(getDocRaw('users/user_1/integration_tokens/jira')).toBeUndefined();
    expect(getDocRaw('users/user_1/integrations/jira')).toMatchObject({ connected: false });
  });

  it('status reports every known provider, defaulting unconnected ones to connected:false', async () => {
    seedDoc('users/user_1/integrations/jira', { service: 'jira', connected: true, connectedAt: '2026-01-01T00:00:00.000Z' });

    const res = await request(app).get('/api/integrations/status').set(auth('user_1'));
    expect(res.status).toBe(200);
    expect(res.body.integrations.jira).toMatchObject({ connected: true });
    expect(res.body.integrations.slack).toEqual({ connected: false });
    expect(res.body.integrations.asana).toEqual({ connected: false });
  });

  // QA Batch 10: the defensive catch block behind each happy path above.
  it('disconnect returns a generic 500 and logs the real error when the Firestore delete throws', async () => {
    seedDoc('users/user_1/integration_tokens/jira', { accessToken: 'at', refreshToken: 'rt' });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const restore = forceDocError('users/user_1/integration_tokens/jira', 'delete', new Error('simulated Firestore outage'));

    const res = await request(app).post('/api/integrations/jira/disconnect').set(auth('user_1'));

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Something went wrong on our end. Please try again.' });
    expect(errorSpy).toHaveBeenCalled();

    restore();
    errorSpy.mockRestore();
  });

  it('status returns a generic 500 and logs the real error when the Firestore read throws', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const restore = forceCollectionError('users/user_1/integrations', 'get', new Error('simulated Firestore outage'));

    const res = await request(app).get('/api/integrations/status').set(auth('user_1'));

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Something went wrong on our end. Please try again.' });
    expect(errorSpy).toHaveBeenCalled();
    const logged = JSON.parse(errorSpy.mock.calls[0][0] as string);
    expect(logged.message).toContain('[Integrations] status error:');

    restore();
    errorSpy.mockRestore();
  });
});

describe('getValidAccessToken (via POST /api/signals/jira/refresh)', () => {
  const seedJiraToken = (uid: string, data: Record<string, unknown>) => seedDoc(`users/${uid}/integration_tokens/jira`, data);

  const mockJiraDataCalls = () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('accessible-resources')) {
        return { ok: true, json: async () => ([{ id: 'cloud_1', name: 'Test Site' }]) };
      }
      if (url.includes('/search/jql')) {
        return { ok: true, json: async () => ({ issues: [] }) };
      }
      return { ok: true, json: async () => ({}) };
    });
  };

  it('returns 404 when Jira was never connected', async () => {
    const res = await request(app).post('/api/signals/jira/refresh').set(auth('no_token_user'));
    expect(res.status).toBe(404);
  });

  it('uses the stored access token as-is when it is not expiring soon, without calling the refresh endpoint', async () => {
    seedJiraToken('fresh_user', { accessToken: 'still_good', refreshToken: 'rt', expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString() });
    mockJiraDataCalls();

    const res = await request(app).post('/api/signals/jira/refresh').set(auth('fresh_user'));
    expect(res.status).toBe(200);
    // Every fetch call should be a data call (Authorization: Bearer still_good), never a refresh POST to auth.atlassian.com.
    for (const [url, opts] of fetchMock.mock.calls) {
      expect(url).not.toContain('auth.atlassian.com');
      expect(opts.headers.Authorization).toBe('Bearer still_good');
    }
  });

  it('refreshes an expiring token, persists the new one, and uses it for the data calls', async () => {
    seedJiraToken('expiring_user', { accessToken: 'old_at', refreshToken: 'old_rt', expiresAt: new Date(Date.now() + 1000).toISOString() });

    fetchMock.mockImplementation(async (url: string, opts: any) => {
      if (url === 'https://auth.atlassian.com/oauth/token') {
        const sent = JSON.parse(opts.body);
        expect(sent).toMatchObject({ grant_type: 'refresh_token', refresh_token: 'old_rt', client_id: 'jira_client_id' });
        return { ok: true, json: async () => ({ access_token: 'new_at', refresh_token: 'new_rt', expires_in: 3600 }) };
      }
      if (url.includes('accessible-resources')) {
        expect(opts.headers.Authorization).toBe('Bearer new_at');
        return { ok: true, json: async () => ([{ id: 'cloud_1', name: 'Test Site' }]) };
      }
      return { ok: true, json: async () => ({ issues: [] }) };
    });

    const res = await request(app).post('/api/signals/jira/refresh').set(auth('expiring_user'));
    expect(res.status).toBe(200);

    const tokenDoc = getDocRaw('users/expiring_user/integration_tokens/jira');
    expect(tokenDoc).toMatchObject({ accessToken: 'new_at', refreshToken: 'new_rt' });
  });

  it('falls back to the (expired) stored token when there is no refresh token to use', async () => {
    seedJiraToken('no_refresh_user', { accessToken: 'old_at', expiresAt: new Date(Date.now() + 1000).toISOString() });
    mockJiraDataCalls();

    const res = await request(app).post('/api/signals/jira/refresh').set(auth('no_refresh_user'));
    expect(res.status).toBe(200);
    for (const [url, opts] of fetchMock.mock.calls) {
      expect(url).not.toBe('https://auth.atlassian.com/oauth/token');
      if (url.includes('accessible-resources')) expect(opts.headers.Authorization).toBe('Bearer old_at');
    }
    // Never refreshed, so the stored doc is untouched.
    expect(getDocRaw('users/no_refresh_user/integration_tokens/jira')).toMatchObject({ accessToken: 'old_at' });
  });

  it('falls back to the old token when the refresh call itself fails, without throwing', async () => {
    seedJiraToken('refresh_fails_user', { accessToken: 'old_at', refreshToken: 'old_rt', expiresAt: new Date(Date.now() + 1000).toISOString() });

    fetchMock.mockImplementation(async (url: string, opts: any) => {
      if (url === 'https://auth.atlassian.com/oauth/token') {
        return { ok: false, json: async () => ({ error: 'invalid_grant' }) };
      }
      if (url.includes('accessible-resources')) {
        expect(opts.headers.Authorization).toBe('Bearer old_at');
        return { ok: true, json: async () => ([{ id: 'cloud_1', name: 'Test Site' }]) };
      }
      return { ok: true, json: async () => ({ issues: [] }) };
    });

    const res = await request(app).post('/api/signals/jira/refresh').set(auth('refresh_fails_user'));
    expect(res.status).toBe(200);
    expect(getDocRaw('users/refresh_fails_user/integration_tokens/jira')).toMatchObject({ accessToken: 'old_at' });
  });

  // SECURITY HOTFIX (independent review): same adversarial sentinel as
  // the /callback route's own test, exercised through the token-REFRESH
  // path instead - a separate code path with its own call to the same
  // diagnostic-extraction logic.
  it('never logs a real token that arrives alongside a failure-shaped token-refresh response', async () => {
    seedJiraToken('refresh_leak_user', { accessToken: 'old_at', refreshToken: 'old_rt', expiresAt: new Date(Date.now() + 1000).toISOString() });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    fetchMock.mockImplementation(async (url: string, opts: any) => {
      if (url === 'https://auth.atlassian.com/oauth/token') {
        return { ok: false, json: async () => ({ error: 'invalid_scope', access_token: 'LEAKED_REFRESH_TOKEN_MUST_NOT_BE_LOGGED', refresh_token: 'LEAKED_NEW_REFRESH_TOKEN_MUST_NOT_BE_LOGGED' }) };
      }
      if (url.includes('accessible-resources')) {
        expect(opts.headers.Authorization).toBe('Bearer old_at');
        return { ok: true, json: async () => ([{ id: 'cloud_1', name: 'Test Site' }]) };
      }
      return { ok: true, json: async () => ({ issues: [] }) };
    });

    const res = await request(app).post('/api/signals/jira/refresh').set(auth('refresh_leak_user'));
    expect(res.status).toBe(200);

    const loggedText = JSON.stringify(errorSpy.mock.calls);
    expect(loggedText).not.toContain('LEAKED_REFRESH_TOKEN_MUST_NOT_BE_LOGGED');
    expect(loggedText).not.toContain('LEAKED_NEW_REFRESH_TOKEN_MUST_NOT_BE_LOGGED');
    errorSpy.mockRestore();
  });

  // QA Batch 10: the defensive catch block behind the happy paths above -
  // getValidAccessToken's own tokenRef.get() isn't wrapped in its inner
  // try/catch (only the refresh network call is), so it propagates to the
  // route's own catch exactly like a totally-unexpected failure would.
  it('returns a generic 500 and logs the real error when the Firestore read throws', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const restore = forceDocError('users/owner_1/integration_tokens/jira', 'get', new Error('simulated Firestore outage'));

    const res = await request(app).post('/api/signals/jira/refresh').set(auth('owner_1'));

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Could not refresh Jira data.' });
    expect(errorSpy).toHaveBeenCalled();
    const logged = JSON.parse(errorSpy.mock.calls[0][0] as string);
    expect(logged.message).toContain('[Signals] jira refresh error:');

    restore();
    errorSpy.mockRestore();
  });
});

describe('GET /api/signals/jira — defensive catch block', () => {
  it('returns a generic 500 and logs the real error when the Firestore read throws', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const restore = forceDocError('users/owner_1/live_signals/jira', 'get', new Error('simulated Firestore outage'));

    const res = await request(app).get('/api/signals/jira').set(auth('owner_1'));

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Something went wrong on our end. Please try again.' });
    expect(errorSpy).toHaveBeenCalled();
    const logged = JSON.parse(errorSpy.mock.calls[0][0] as string);
    expect(logged.message).toContain('Unhandled error on GET /api/signals/jira');

    restore();
    errorSpy.mockRestore();
  });
});
