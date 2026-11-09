import { describe, it, expect, vi, beforeEach } from 'vitest';

// Regression: only safe GET/HEAD requests may retry a token-expiry 401.
// Mutation attempts, MFA-required replies and permission 403s must never
// replay, even when a caller forgets to set noAuthRetry.
vi.mock('./firebase', () => ({
  auth: { currentUser: { uid: 'u1', getIdToken: async () => 'id-token' } },
  getAppCheckToken: async () => 'app-check',
}));
vi.mock('./mfa-session', () => ({ getMfaSessionToken: () => null, expireMfaSession: vi.fn() }));

(globalThis as any).window = { location: { origin: 'https://app.example.test' } };
import { secureApiFetch } from './secure-api';

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset().mockResolvedValue(new Response(JSON.stringify({ error: "That code didn't match." }), { status: 401 }));
  (globalThis as any).fetch = fetchMock;
});

describe('secureApiFetch retry behaviour for two-factor codes', () => {
  it('with noAuthRetry, a wrong code is sent exactly once', async () => {
    await expect(secureApiFetch('/api/auth/mfa/totp/verify-at-signin', { method: 'POST', data: { code: '000000' }, noAuthRetry: true }))
      .rejects.toMatchObject({ status: 401 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('GET retries a 401 once with a fresh token', async () => {
    await expect(secureApiFetch('/api/org/me')).rejects.toMatchObject({ status: 401 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('POST mutations never auto-retry a 401, even without noAuthRetry', async () => {
    await expect(secureApiFetch('/api/recovery/routing-outcome', { method: 'POST', data: { decisionId: 'one', action: 'completed' } }))
      .rejects.toMatchObject({ status: 401 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not retry 403 for GET or POST', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 }));
    await expect(secureApiFetch('/api/org/me')).rejects.toMatchObject({ status: 403 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await expect(secureApiFetch('/api/recovery/routing-outcome', { method: 'POST' })).rejects.toMatchObject({ status: 403 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not retry a GET when the response requires a fresh MFA challenge', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ error: 'Verify MFA', code: 'MFA_SESSION_REQUIRED' }), { status: 401 }));
    await expect(secureApiFetch('/api/org/me')).rejects.toMatchObject({ status: 401 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not retry successful POST requests or network exceptions', async () => {
    fetchMock.mockResolvedValueOnce(new Response('{}', { status: 200 }));
    await secureApiFetch('/api/recovery/routing-outcome', { method: 'POST', data: { action: 'completed' } });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    fetchMock.mockRejectedValueOnce(new Error('offline'));
    await expect(secureApiFetch('/api/org/me')).rejects.toMatchObject({ status: 0 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('the sign-in verification and disable calls use noAuthRetry', async () => {
    const fs = await import('fs');
    const auth = fs.readFileSync('src/lib/auth.tsx', 'utf8');
    const settings = fs.readFileSync('src/components/SecuritySettingsView.tsx', 'utf8');
    expect(auth).toMatch(/verify-at-signin', \{\s*method: 'POST',\s*noAuthRetry: true/);
    expect(settings).toMatch(/mfa\/totp\/disable', \{\s*noAuthRetry: true/);
  });
});
