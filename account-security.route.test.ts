import { describe, it, expect, beforeEach, vi } from 'vitest';

// ---- Hoisted setup: runs before server.ts is imported --------------------
// Same pattern as guardian-alert.route.test.ts — server.ts has import-time
// side effects (Firebase init, app.listen() guarded by TEST_MODE), so env
// vars and mocks must be in place before that module is evaluated.
const h = vi.hoisted(() => {
  process.env.TEST_MODE = 'true';
  process.env.NODE_ENV = 'test';
  process.env.BREVO_API_KEY = 'brevo_test_key';
  process.env.APP_URL = 'https://app.blazebreak.example';
  return {
    generateEmailVerificationLink: vi.fn(async (email: string) => `https://app.blazebreak.example/auth/action?mode=verifyEmail&oobCode=fake-code-for-${email}`),
  };
});

// Rate limiters are framework infrastructure, not the handler logic under
// test — same rationale as guardian-alert.route.test.ts.
vi.mock('express-rate-limit', () => ({ default: () => (_req: any, _res: any, next: any) => next() }));

vi.mock('firebase-admin/app', () => ({ initializeApp: vi.fn(), getApps: () => [{}] }));
vi.mock('firebase-admin/app-check', () => ({ getAppCheck: () => ({ verifyToken: vi.fn() }) }));
vi.mock('firebase-admin/auth', () => ({
  getAuth: () => ({
    verifyIdToken: async (token: string) => ({ uid: token, email: `${token}@test.dev` }),
    generateEmailVerificationLink: h.generateEmailVerificationLink,
  }),
}));
vi.mock('firebase-admin/firestore', async () => {
  const fake = await import('./test/fake-firestore');
  return { getFirestore: () => fake.fakeDb, FieldValue: fake.FakeFieldValue };
});

import request from 'supertest';
import { app } from './server';
import { resetStore } from './test/fake-firestore';

const auth = (uid: string) => ({ Authorization: `Bearer ${uid}` });

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  resetStore();
  h.generateEmailVerificationLink.mockClear();
  h.generateEmailVerificationLink.mockImplementation(
    async (email: string) => `https://app.blazebreak.example/auth/action?mode=verifyEmail&oobCode=fake-code-for-${email}`
  );
  fetchMock = vi.fn(async () => ({ ok: true, text: async () => '' }));
  vi.stubGlobal('fetch', fetchMock);
});

describe('POST /api/auth/verify-email/send', () => {
  it('generates a verification link and emails it via Brevo, embedding the exact link', async () => {
    const res = await request(app).post('/api/auth/verify-email/send').set(auth('person_1'));

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true });
    expect(h.generateEmailVerificationLink).toHaveBeenCalledWith(
      'person_1@test.dev',
      expect.objectContaining({ url: 'https://app.blazebreak.example/auth/action', handleCodeInApp: true })
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, options] = fetchMock.mock.calls[0];
    const body = JSON.parse(options.body);
    expect(body.to).toEqual([{ email: 'person_1@test.dev' }]);
    expect(body.htmlContent).toContain('fake-code-for-person_1@test.dev');
    expect(body.textContent).toBeTruthy();
  });

  it('still returns success (soft-fail) if link generation fails — e.g. a missing IAM permission on the server', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    h.generateEmailVerificationLink.mockRejectedValueOnce(
      new Error('The caller does not have permission; ensure the service account has the Service Account Token Creator role (signBlob).')
    );

    const res = await request(app).post('/api/auth/verify-email/send').set(auth('person_2'));

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true });
    expect(fetchMock).not.toHaveBeenCalled();
    // The failure must be logged with an actionable hint, not swallowed silently.
    const logged = consoleErrorSpy.mock.calls.map((call) => call.join(' ')).join('\n');
    expect(logged).toMatch(/serviceAccountTokenCreator/);
    consoleErrorSpy.mockRestore();
  });

  it('rejects with 401 when there is no auth token at all', async () => {
    const res = await request(app).post('/api/auth/verify-email/send');
    expect(res.status).toBe(401);
  });
});
