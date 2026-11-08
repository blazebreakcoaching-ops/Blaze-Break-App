import { describe, it, expect, vi, beforeEach } from 'vitest';

// A wrong two-factor code returns 401. secureApiFetch retries any 401 once
// with a refreshed token, which submitted every wrong code TWICE - each
// counting toward the lockout, and spending a single-use recovery code.
// The two-factor calls now opt out with noAuthRetry.
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

  it('other requests still retry once on 401', async () => {
    await expect(secureApiFetch('/api/org/me')).rejects.toMatchObject({ status: 401 });
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
