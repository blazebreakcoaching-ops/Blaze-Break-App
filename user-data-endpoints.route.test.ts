import { describe, it, expect, beforeEach, vi } from 'vitest';

// Same harness as guardian-alert.route.test.ts (see the comments there for
// why env + mocks live in vi.hoisted / vi.mock). This file exercises the
// GDPR export and account-deletion endpoints against the in-memory store.
const h = vi.hoisted(() => {
  process.env.TEST_MODE = 'true';
  process.env.NODE_ENV = 'test';
  return {
    deleteUser: vi.fn(async () => {}),
  };
});

vi.mock('express-rate-limit', () => ({ default: () => (_req: any, _res: any, next: any) => next() }));
vi.mock('firebase-admin/app', () => ({ initializeApp: vi.fn(), getApps: () => [{}] }));
vi.mock('firebase-admin/app-check', () => ({ getAppCheck: () => ({ verifyToken: vi.fn() }) }));
vi.mock('firebase-admin/auth', () => ({
  getAuth: () => ({
    verifyIdToken: async (token: string) => ({ uid: token, email: `${token}@test.dev` }),
    deleteUser: h.deleteUser,
  }),
}));
vi.mock('firebase-admin/firestore', async () => {
  const fake = await import('./test/fake-firestore');
  return { getFirestore: () => fake.fakeDb, FieldValue: fake.FakeFieldValue };
});
vi.mock('twilio', () => ({ default: () => ({ messages: { create: vi.fn() } }) }));

import request from 'supertest';
import { app } from './server';
import { seedDoc, getDocRaw, resetStore, forceDocError, forceCollectionError } from './test/fake-firestore';

const USER = 'user_owner';
const OTHER = 'user_other';
const auth = (uid: string) => ({ Authorization: `Bearer ${uid}` });

beforeEach(() => {
  resetStore();
  h.deleteUser.mockClear();
});

// Seeds a user with: a root profile doc, two nested subcollections, and
// entries in both stray top-level collections (one erasable, one not), plus
// an unrelated OTHER user's data that must never be touched.
function seedFullUser() {
  seedDoc(`users/${USER}`, { organisationId: 'org_1', displayName: 'Jordan' });
  seedDoc(`users/${USER}/mood_pulses/mp1`, { moodLabel: 'calm', createdAt: '2026-01-01T00:00:00Z' });
  seedDoc(`users/${USER}/mood_pulses/mp2`, { moodLabel: 'tired', createdAt: '2026-01-02T00:00:00Z' });
  seedDoc(`users/${USER}/guardian_alerts/ga1`, { contactId: 'g', state: 'provider_accepted', createdAt: '2026-01-01T00:00:00Z' });
  // Stray top-level collections keyed by userId:
  seedDoc(`anxiety_reset_events/are1`, { userId: USER, kind: 'panic', createdAt: '2026-01-01T00:00:00Z' });
  seedDoc(`audit_logs/al1`, { userId: USER, action: 'consent_granted', createdAt: '2026-01-01T00:00:00Z' });
  seedDoc(`feedback_submissions/fb1`, { userId: USER, category: 'bug', message: 'Something broke', createdAt: '2026-01-01T00:00:00Z' });
  // admin_audit_logs is keyed by targetUid/actorUid, not userId - one doc
  // where USER was acted upon, one where USER was the admin who acted.
  seedDoc(`admin_audit_logs/aal1`, { actorUid: 'some_admin', actorEmail: 'admin@test.dev', targetUid: USER, targetEmail: 'owner@test.dev', action: 'suspend_user' });
  seedDoc(`admin_audit_logs/aal2`, { actorUid: USER, actorEmail: 'owner@test.dev', targetUid: 'some_other_target', targetEmail: 'x@test.dev', action: 'grant_entitlement' });
  // Another user's data, in the same collections:
  seedDoc(`users/${OTHER}`, { displayName: 'Someone Else' });
  seedDoc(`users/${OTHER}/mood_pulses/mpx`, { moodLabel: 'calm' });
  seedDoc(`anxiety_reset_events/areX`, { userId: OTHER, kind: 'panic' });
  seedDoc(`audit_logs/alX`, { userId: OTHER, action: 'login' });
  seedDoc(`feedback_submissions/fbX`, { userId: OTHER, category: 'general', message: 'Someone else entirely' });
  seedDoc(`admin_audit_logs/aalX`, { actorUid: 'some_admin', actorEmail: 'admin@test.dev', targetUid: OTHER, targetEmail: 'other@test.dev', action: 'suspend_user' });
  // The org the user belongs to:
  seedDoc(`organisations/org_1`, { memberUids: [USER, OTHER], adminUids: [USER], memberTeams: { [USER]: 'team_a' } });
}

describe('GET /api/user/export — portability (GDPR Art. 15/20)', () => {
  it('exports the root profile, every subcollection, and stray collections scoped to the caller', async () => {
    seedFullUser();
    const res = await request(app).get('/api/user/export').set(auth(USER));

    expect(res.status).toBe(200);
    expect(res.body.uid).toBe(USER);
    expect(res.body.profile).toMatchObject({ displayName: 'Jordan' });

    // Nested subcollections present.
    expect(res.body.collections.mood_pulses).toHaveLength(2);
    expect(res.body.collections.guardian_alerts).toHaveLength(1);

    // Stray top-level collections present AND scoped to this user only.
    expect(res.body.collections.anxiety_reset_events).toHaveLength(1);
    expect(res.body.collections.anxiety_reset_events[0].userId).toBe(USER);
    expect(res.body.collections.audit_logs).toHaveLength(1);
    expect(res.body.collections.audit_logs[0].userId).toBe(USER);
    expect(res.body.collections.feedback_submissions).toHaveLength(1);
    expect(res.body.collections.feedback_submissions[0].userId).toBe(USER);

    // admin_audit_logs: both the doc where USER was the target AND the doc
    // where USER was the acting admin are included - matching on either
    // field, not just one - while the OTHER user's doc is excluded.
    expect(res.body.collections.admin_audit_logs).toHaveLength(2);
    const aalIds = res.body.collections.admin_audit_logs.map((d: any) => d.id).sort();
    expect(aalIds).toEqual(['aal1', 'aal2']);
  });

  it('requires authentication', async () => {
    const res = await request(app).get('/api/user/export');
    expect(res.status).toBe(401);
  });

  it('500s if the root profile read throws', async () => {
    seedFullUser();
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const restore = forceDocError(`users/${USER}`, 'get', new Error('simulated Firestore outage'));
    const res = await request(app).get('/api/user/export').set(auth(USER));
    expect(res.status).toBe(500);
    expect(errorSpy).toHaveBeenCalled();
    restore();
    errorSpy.mockRestore();
  });

  // SECURITY HOTFIX (independent review, see
  // SECURITY_HOTFIX_INDEPENDENT_REVIEW_REPORT.md): this generic export
  // route's own listCollections() dump copied integration_tokens,
  // security, recovery_ally, and push_subscriptions into the response
  // VERBATIM - nothing here ever excluded them. A deliberately injected
  // sentinel value, distinctive enough that its presence anywhere in the
  // raw response body is unambiguous, proves the fix at the one boundary
  // that actually matters: the real HTTP response this route sends.
  describe('credential-bearing collections are sanitised, never exported verbatim', () => {
    const SENTINEL = 'SENTINEL_SECRET_MUST_NEVER_LEAK_9f3a7c';

    function seedSecrets() {
      seedDoc(`users/${USER}/integration_tokens/slack`, { accessToken: SENTINEL, refreshToken: SENTINEL, expiresAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' });
      seedDoc(`users/${USER}/security/mfa_totp`, {
        secretEncrypted: SENTINEL, pendingSecretEncrypted: SENTINEL,
        recoveryCodesHashed: [{ hash: SENTINEL, usedAt: null }],
        enabled: true, enrolledAt: '2026-01-01T00:00:00Z', failedAttempts: 0, lockedUntil: null, updatedAt: '2026-01-01T00:00:00Z',
      });
      seedDoc(`users/${USER}/recovery_ally/state`, {
        isInvited: true, allyName: 'Jordan', allyEmail: 'jordan@example.com', shareToken: SENTINEL,
        invitedAt: '2026-01-01T00:00:00Z', consentStatus: 'pending', inviteExpiresAt: '2026-01-08T00:00:00Z',
      });
      seedDoc(`users/${USER}/push_subscriptions/sub1`, {
        endpoint: 'https://fcm.googleapis.com/fcm/send/abc123', expirationTime: null,
        keys: { p256dh: 'PUBLIC_KEY_NOT_SECRET', auth: SENTINEL }, subscribedAt: '2026-01-01T00:00:00Z',
      });
    }

    it('never returns the sentinel secret anywhere in the response body', async () => {
      seedFullUser();
      seedSecrets();
      const res = await request(app).get('/api/user/export').set(auth(USER));
      expect(res.status).toBe(200);
      expect(JSON.stringify(res.body)).not.toContain(SENTINEL);
    });

    it('still includes safe, non-secret metadata for each of those collections', async () => {
      seedFullUser();
      seedSecrets();
      const res = await request(app).get('/api/user/export').set(auth(USER));

      expect(res.body.collections.integration_tokens[0]).toMatchObject({ id: 'slack', expiresAt: '2026-01-01T00:00:00Z', redactedForSecurity: true });
      expect(res.body.collections.integration_tokens[0].accessToken).toBeUndefined();

      expect(res.body.collections.security[0]).toMatchObject({ id: 'mfa_totp', enabled: true, failedAttempts: 0, redactedForSecurity: true });
      expect(res.body.collections.security[0].secretEncrypted).toBeUndefined();
      expect(res.body.collections.security[0].recoveryCodesHashed).toBeUndefined();

      expect(res.body.collections.recovery_ally[0]).toMatchObject({ id: 'state', allyName: 'Jordan', consentStatus: 'pending', redactedForSecurity: true });
      expect(res.body.collections.recovery_ally[0].shareToken).toBeUndefined();

      expect(res.body.collections.push_subscriptions[0]).toMatchObject({ id: 'sub1', endpoint: 'https://fcm.googleapis.com/fcm/send/abc123', redactedForSecurity: true });
      expect(res.body.collections.push_subscriptions[0].keys).toBeUndefined();
    });

    it('a collection with nothing secret in it is completely unaffected (no redactedForSecurity marker)', async () => {
      seedFullUser();
      seedSecrets();
      const res = await request(app).get('/api/user/export').set(auth(USER));
      expect(res.body.collections.mood_pulses[0].redactedForSecurity).toBeUndefined();
    });

    it('deny-by-default: an unanticipated, non-secret-shaped field on a known secret-bearing collection is still redacted', async () => {
      seedFullUser();
      seedDoc(`users/${USER}/integration_tokens/slack`, {
        accessToken: SENTINEL, expiresAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
        somethingNobodyAnticipated: 'unexpected but not itself a secret',
      });
      const res = await request(app).get('/api/user/export').set(auth(USER));
      const tok = res.body.collections.integration_tokens[0];
      expect(tok.somethingNobodyAnticipated).toBeUndefined();
      expect(tok.redactedForSecurity).toBe(true);
      expect(tok.expiresAt).toBe('2026-01-01T00:00:00Z');
    });

    it('account isolation: never returns another user\'s secrets from any secret-bearing collection', async () => {
      seedFullUser();
      seedSecrets();
      seedDoc(`users/${OTHER}/integration_tokens/slack`, { accessToken: SENTINEL, refreshToken: SENTINEL, expiresAt: '2099-01-01T00:00:00Z', updatedAt: '2099-01-01T00:00:00Z' });
      seedDoc(`users/${OTHER}/recovery_ally/state`, { isInvited: true, allyName: 'Other Ally', allyEmail: 'other-ally@example.com', shareToken: SENTINEL, invitedAt: '2099-01-01T00:00:00Z', consentStatus: 'pending', inviteExpiresAt: '2099-01-08T00:00:00Z' });
      const res = await request(app).get('/api/user/export').set(auth(USER));
      expect(res.status).toBe(200);
      expect(getDocRaw(`users/${OTHER}/integration_tokens/slack`)).toBeDefined();
      expect(JSON.stringify(res.body)).not.toContain('other-ally@example.com');
    });
  });
});

describe('POST /api/user/delete-account — erasure (GDPR Art. 17)', () => {
  it('erases the user document, every subcollection, and erasable stray collections', async () => {
    seedFullUser();
    const res = await request(app).post('/api/user/delete-account').set(auth(USER));

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    // User root + all nested subcollections gone.
    expect(getDocRaw(`users/${USER}`)).toBeUndefined();
    expect(getDocRaw(`users/${USER}/mood_pulses/mp1`)).toBeUndefined();
    expect(getDocRaw(`users/${USER}/guardian_alerts/ga1`)).toBeUndefined();

    // anxiety_reset_events and feedback_submissions (eraseOnDeletion: true)
    // for this user are gone.
    expect(getDocRaw('anxiety_reset_events/are1')).toBeUndefined();
    expect(getDocRaw('feedback_submissions/fb1')).toBeUndefined();
  });

  it('deliberately KEEPS audit_logs — a compliance trail must outlive the account', async () => {
    seedFullUser();
    await request(app).post('/api/user/delete-account').set(auth(USER));
    // The caller's own audit log survives on purpose (it records that the
    // deletion happened).
    expect(getDocRaw('audit_logs/al1')).toBeDefined();
    expect(getDocRaw('audit_logs/al1')?.userId).toBe(USER);
  });

  it('deliberately KEEPS admin_audit_logs on both fields — same compliance-trail reasoning as audit_logs', async () => {
    seedFullUser();
    await request(app).post('/api/user/delete-account').set(auth(USER));
    // Neither the doc where USER was the target nor the one where USER was
    // the acting admin is erased.
    expect(getDocRaw('admin_audit_logs/aal1')).toBeDefined();
    expect(getDocRaw('admin_audit_logs/aal2')).toBeDefined();
  });

  it("never touches another user's data", async () => {
    seedFullUser();
    await request(app).post('/api/user/delete-account').set(auth(USER));
    expect(getDocRaw(`users/${OTHER}`)).toBeDefined();
    expect(getDocRaw(`users/${OTHER}/mood_pulses/mpx`)).toBeDefined();
    expect(getDocRaw('anxiety_reset_events/areX')).toBeDefined();
    expect(getDocRaw('audit_logs/alX')).toBeDefined();
    expect(getDocRaw('feedback_submissions/fbX')).toBeDefined();
    expect(getDocRaw('admin_audit_logs/aalX')).toBeDefined();
  });

  it('removes the user from their organisation membership', async () => {
    seedFullUser();
    await request(app).post('/api/user/delete-account').set(auth(USER));
    const org = getDocRaw('organisations/org_1');
    expect(org?.memberUids).toEqual([OTHER]);   // USER removed
    expect(org?.adminUids).toEqual([]);         // USER removed
  });

  it('deletes the Firebase Auth account and reports it', async () => {
    seedFullUser();
    const res = await request(app).post('/api/user/delete-account').set(auth(USER));
    expect(h.deleteUser).toHaveBeenCalledWith(USER);
    expect(res.body.authDeleted).toBe(true);
  });

  it('still reports data erased even if the auth-account deletion fails', async () => {
    seedFullUser();
    h.deleteUser.mockImplementationOnce(async () => { throw new Error('auth backend down'); });
    const res = await request(app).post('/api/user/delete-account').set(auth(USER));
    expect(res.status).toBe(200);
    expect(res.body.authDeleted).toBe(false);
    // The personal data is still gone - that's the part that matters for erasure.
    expect(getDocRaw(`users/${USER}`)).toBeUndefined();
  });

  it('requires authentication', async () => {
    const res = await request(app).post('/api/user/delete-account');
    expect(res.status).toBe(401);
  });

  it('500s if erasing a stray collection throws', async () => {
    seedFullUser();
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const restore = forceCollectionError('anxiety_reset_events', 'get', new Error('simulated Firestore outage'));
    const res = await request(app).post('/api/user/delete-account').set(auth(USER));
    expect(res.status).toBe(500);
    expect(errorSpy).toHaveBeenCalled();
    restore();
    errorSpy.mockRestore();
  });
});
