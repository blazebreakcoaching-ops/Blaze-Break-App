import { describe, it, expect, beforeEach, vi } from 'vitest';

// Regression: the owner-bootstrap allowlist used to grant Platform Owner
// to ANY ID token whose `email` matched, without checking email_verified.
// Firebase email/password sign-up lets anyone register an address they do
// not own (unverified), and gmail.com/googlemail.com are distinct strings
// to Firebase - so whichever bootstrap address was unregistered could be
// claimed by anyone and used to reach every admin, owner and Evolution
// Engine route. These tests prove an unverified match is now refused at
// every gate, and a verified match still works.
vi.hoisted(() => {
  process.env.TEST_MODE = 'true';
  process.env.NODE_ENV = 'test';
});

// Token string encodes the identity: "<email>|verified" or "<email>|unverified".
vi.mock('express-rate-limit', () => ({ default: () => (_req: any, _res: any, next: any) => next(), ipKeyGenerator: (ip: string) => ip }));
vi.mock('firebase-admin/app', () => ({ initializeApp: vi.fn(), getApps: () => [{}] }));
vi.mock('firebase-admin/app-check', () => ({ getAppCheck: () => ({ verifyToken: vi.fn() }) }));
vi.mock('firebase-admin/auth', () => ({
  getAuth: () => ({
    verifyIdToken: async (t: string) => {
      const [email, state] = t.split('|');
      return { uid: `uid_${email}`, email, email_verified: state === 'verified', auth_time: Math.floor(Date.now() / 1000) };
    },
  }),
}));
vi.mock('firebase-admin/firestore', async () => {
  const fake = await import('./test/fake-firestore');
  return { getFirestore: () => fake.fakeDb, FieldValue: fake.FakeFieldValue };
});
vi.mock('twilio', () => ({ default: () => ({ messages: { create: vi.fn() } }) }));

import request from 'supertest';
import { app } from './server';
import { resetStore } from './test/fake-firestore';
import { isVerifiedOwnerBootstrapIdentity, DEFAULT_OWNER_BOOTSTRAP_EMAILS } from './admin-roles';

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

beforeEach(() => {
  resetStore();
});

describe('isVerifiedOwnerBootstrapIdentity', () => {
  for (const email of DEFAULT_OWNER_BOOTSTRAP_EMAILS) {
    it(`refuses unverified ${email}`, () => {
      expect(isVerifiedOwnerBootstrapIdentity({ email, email_verified: false })).toBe(false);
      expect(isVerifiedOwnerBootstrapIdentity({ email })).toBe(false);
      expect(isVerifiedOwnerBootstrapIdentity({ email: email.toUpperCase(), emailVerified: false })).toBe(false);
    });
    it(`accepts verified ${email} (server token or client SDK shape)`, () => {
      expect(isVerifiedOwnerBootstrapIdentity({ email, email_verified: true })).toBe(true);
      expect(isVerifiedOwnerBootstrapIdentity({ email, emailVerified: true })).toBe(true);
    });
  }
  it('rejects truthy-but-not-true verification values and non-allowlisted verified emails', () => {
    expect(isVerifiedOwnerBootstrapIdentity({ email: DEFAULT_OWNER_BOOTSTRAP_EMAILS[0], email_verified: 'true' as any })).toBe(false);
    expect(isVerifiedOwnerBootstrapIdentity({ email: 'someone@example.com', email_verified: true })).toBe(false);
    expect(isVerifiedOwnerBootstrapIdentity(null)).toBe(false);
  });
});

describe('owner bootstrap over real HTTP routes', () => {
  // Each route sits behind a different gate: requireAdmin/requirePermission
  // (admin summary) and requireEvolutionAccess (Evolution Engine registry).
  const gatedRoutes = ['/api/admin/summary', '/api/admin/evolution/registry'];

  for (const email of DEFAULT_OWNER_BOOTSTRAP_EMAILS) {
    for (const route of gatedRoutes) {
      it(`unverified ${email} is refused on ${route}`, async () => {
        const res = await request(app).get(route).set(auth(`${email}|unverified`));
        expect(res.status).not.toBe(200);
        expect(res.status).toBeGreaterThanOrEqual(400);
      });
    }
  }

  for (const route of gatedRoutes) {
    it(`verified bootstrap owner still reaches ${route}`, async () => {
      const res = await request(app).get(route).set(auth(`${DEFAULT_OWNER_BOOTSTRAP_EMAILS[1]}|verified`));
      expect(res.status).toBe(200);
    });
  }
});
