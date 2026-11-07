import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.hoisted(() => {
  process.env.TEST_MODE = 'true';
  process.env.NODE_ENV = 'test';
});

vi.mock('express-rate-limit', () => ({ default: () => (_req: any, _res: any, next: any) => next() }));
vi.mock('firebase-admin/app', () => ({ initializeApp: vi.fn(), getApps: () => [{}] }));
vi.mock('firebase-admin/app-check', () => ({ getAppCheck: () => ({ verifyToken: vi.fn() }) }));
vi.mock('firebase-admin/auth', () => ({ getAuth: () => ({ verifyIdToken: async (t: string) => ({ uid: t, email: `${t}@test.dev`, email_verified: !t.startsWith('unverified_') }) }) }));
vi.mock('firebase-admin/firestore', async () => {
  const fake = await import('./test/fake-firestore');
  return { getFirestore: () => fake.fakeDb, FieldValue: fake.FakeFieldValue };
});
vi.mock('twilio', () => ({ default: () => ({ messages: { create: vi.fn() } }) }));

import crypto from 'crypto';
import request from 'supertest';
import { app } from './server';
import { seedDoc, getDocRaw, resetStore, forceDocError, forceTransactionError } from './test/fake-firestore';

const ORG = 'org_1';
const auth = (uid: string) => ({ Authorization: `Bearer ${uid}` });

function seedOrg(orgId: string, opts: { adminUids?: string[]; memberUids?: string[]; billing?: any; joinCode?: string } = {}) {
  seedDoc(`organisations/${orgId}`, {
    name: 'Test Org',
    adminUids: opts.adminUids || [],
    memberUids: opts.memberUids || [],
    joinCode: opts.joinCode || 'ABC123',
    ...(opts.billing ? { billing: opts.billing } : {}),
  });
}

function seedMember(orgId: string, uid: string, role: string) {
  seedDoc(`organisations/${orgId}/members/${uid}`, { role, status: 'active', email: `${uid}@test.dev` });
}

beforeEach(() => resetStore());

describe('GET /api/org/:orgId/billing — default state', () => {
  it('a fresh org reports the free-plan default', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1'] });
    seedMember(ORG, 'owner_1', 'owner');
    const res = await request(app).get(`/api/org/${ORG}/billing`).set(auth('owner_1'));
    expect(res.status).toBe(200);
    expect(res.body.billing.plan).toBe('free');
    expect(res.body.billing.seatCount).toBe(5);
    expect(res.body.provider).toBe('null');
  });

  it('a viewer can read billing state', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1', 'viewer_1'] });
    seedMember(ORG, 'owner_1', 'owner');
    seedMember(ORG, 'viewer_1', 'viewer');
    const res = await request(app).get(`/api/org/${ORG}/billing`).set(auth('viewer_1'));
    expect(res.status).toBe(200);
  });

  it('a stranger with no role cannot read billing state', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1'] });
    seedMember(ORG, 'owner_1', 'owner');
    const res = await request(app).get(`/api/org/${ORG}/billing`).set(auth('stranger'));
    expect(res.status).toBe(403);
  });
});

describe('POST /api/org/:orgId/billing — RBAC boundary', () => {
  const validUpdate = { plan: 'business', status: 'active', seatCount: 50, billingContact: 'finance@org.com' };

  it('a member or viewer cannot change billing', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1', 'member_1', 'viewer_1'] });
    seedMember(ORG, 'owner_1', 'owner');
    seedMember(ORG, 'member_1', 'member');
    seedMember(ORG, 'viewer_1', 'viewer');
    expect((await request(app).post(`/api/org/${ORG}/billing`).set(auth('member_1')).send(validUpdate)).status).toBe(403);
    expect((await request(app).post(`/api/org/${ORG}/billing`).set(auth('viewer_1')).send(validUpdate)).status).toBe(403);
  });

  it('connector_admin and security_admin cannot touch billing - it is not their domain', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1', 'conn_1', 'sec_1'] });
    seedMember(ORG, 'owner_1', 'owner');
    seedMember(ORG, 'conn_1', 'connector_admin');
    seedMember(ORG, 'sec_1', 'security_admin');
    expect((await request(app).post(`/api/org/${ORG}/billing`).set(auth('conn_1')).send(validUpdate)).status).toBe(403);
    expect((await request(app).post(`/api/org/${ORG}/billing`).set(auth('sec_1')).send(validUpdate)).status).toBe(403);
  });

  it('billing_admin cannot manage connectors or security - RBAC is a two-way boundary', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1', 'billing_1'] });
    seedMember(ORG, 'owner_1', 'owner');
    seedMember(ORG, 'billing_1', 'billing_admin');
    const connectorRes = await request(app).post(`/api/org/${ORG}/connectors`).set(auth('billing_1')).send({ type: 'slack', displayName: 'Slack' });
    expect(connectorRes.status).toBe(403);
    const dataPolicyRes = await request(app).post(`/api/org/${ORG}/data-policy`).set(auth('billing_1')).send({ allowModelTraining: true, allowProductAnalytics: false, allowContentRetentionForDebugging: false, retentionPeriodDays: 30 });
    expect(dataPolicyRes.status).toBe(403);
  });

  it('billing_admin, admin, and owner can each change billing', async () => {
    seedOrg(ORG, { adminUids: ['owner_1', 'admin_1'], memberUids: ['owner_1', 'admin_1', 'billing_1'] });
    seedMember(ORG, 'owner_1', 'owner');
    seedMember(ORG, 'admin_1', 'admin');
    seedMember(ORG, 'billing_1', 'billing_admin');
    expect((await request(app).post(`/api/org/${ORG}/billing`).set(auth('owner_1')).send(validUpdate)).status).toBe(200);
    expect((await request(app).post(`/api/org/${ORG}/billing`).set(auth('admin_1')).send(validUpdate)).status).toBe(200);
    expect((await request(app).post(`/api/org/${ORG}/billing`).set(auth('billing_1')).send(validUpdate)).status).toBe(200);
  });
});

describe('POST /api/org/:orgId/billing — validation and provider-field lockdown', () => {
  it('rejects an unknown plan or out-of-range seatCount', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1'] });
    seedMember(ORG, 'owner_1', 'owner');
    expect((await request(app).post(`/api/org/${ORG}/billing`).set(auth('owner_1')).send({ plan: 'ultra', status: 'active', seatCount: 10 })).status).toBe(400);
    expect((await request(app).post(`/api/org/${ORG}/billing`).set(auth('owner_1')).send({ plan: 'business', status: 'active', seatCount: 0 })).status).toBe(400);
  });

  it('ignores any providerCustomerId/providerSubscriptionId sent in the request body - only a real provider integration can set those', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1'] });
    seedMember(ORG, 'owner_1', 'owner');
    const res = await request(app).post(`/api/org/${ORG}/billing`).set(auth('owner_1')).send({
      plan: 'business', status: 'active', seatCount: 10,
      providerCustomerId: 'cus_fake123', providerSubscriptionId: 'sub_fake456',
    });
    expect(res.status).toBe(200);
    expect(res.body.billing.providerCustomerId).toBeNull();
    expect(res.body.billing.providerSubscriptionId).toBeNull();
  });
});

describe('seat-limit enforcement on invites', () => {
  it('an invite that fits within the seat allowance succeeds', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1'], billing: { plan: 'starter', status: 'active', seatCount: 5 } });
    seedMember(ORG, 'owner_1', 'owner');
    const res = await request(app).post(`/api/org/${ORG}/invite`).set(auth('owner_1')).send({ emails: ['a@example.com', 'b@example.com'] });
    expect(res.status).toBe(200);
  });

  it('an invite that would exceed the seat allowance is rejected before sending', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1', 'm2', 'm3', 'm4'], billing: { plan: 'free', status: 'active', seatCount: 5 } });
    seedMember(ORG, 'owner_1', 'owner');
    const res = await request(app).post(`/api/org/${ORG}/invite`).set(auth('owner_1')).send({ emails: ['a@example.com', 'b@example.com'] });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/seats/);

    const invitesRes = await request(app).get(`/api/org/${ORG}/invites`).set(auth('owner_1'));
    expect(invitesRes.body.invites.length).toBe(0);
  });

  it('pending invites count toward the seat limit, not just active members', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1'], billing: { plan: 'free', status: 'active', seatCount: 3 } });
    seedMember(ORG, 'owner_1', 'owner');
    await request(app).post(`/api/org/${ORG}/invite`).set(auth('owner_1')).send({ emails: ['a@example.com', 'b@example.com'] });

    const res = await request(app).post(`/api/org/${ORG}/invite`).set(auth('owner_1')).send({ emails: ['c@example.com'] });
    expect(res.status).toBe(400);
  });

  it('raising seatCount via the billing route allows a previously-blocked invite to succeed', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1', 'm2', 'm3'], billing: { plan: 'free', status: 'active', seatCount: 3 } });
    seedMember(ORG, 'owner_1', 'owner');

    const blocked = await request(app).post(`/api/org/${ORG}/invite`).set(auth('owner_1')).send({ emails: ['a@example.com'] });
    expect(blocked.status).toBe(400);

    await request(app).post(`/api/org/${ORG}/billing`).set(auth('owner_1')).send({ plan: 'business', status: 'active', seatCount: 10 });

    const allowed = await request(app).post(`/api/org/${ORG}/invite`).set(auth('owner_1')).send({ emails: ['a@example.com'] });
    expect(allowed.status).toBe(200);
  });
});

describe('atomic company joins and invitation reservations', () => {
  it('blocks an uninvited code redemption when all seats are reserved', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1'], billing: { plan: 'free', status: 'active', seatCount: 2 } });
    seedMember(ORG, 'owner_1', 'owner');
    seedDoc(`organisations/${ORG}/pending_invites/reserved@test.dev`, { email: 'reserved@test.dev' });
    seedDoc('users/outsider', {});
    const res = await request(app).post('/api/org/join').set(auth('outsider')).send({ joinCode: 'ABC123' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/seats/);
    expect(getDocRaw('users/outsider')?.organisationId).toBeUndefined();
    expect(getDocRaw(`organisations/${ORG}`)?.memberUids).toEqual(['owner_1']);
  });

  it('allows a verified invitee to convert their reserved seat, removing the invite atomically', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1'], billing: { plan: 'free', status: 'active', seatCount: 2 } });
    seedMember(ORG, 'owner_1', 'owner');
    seedDoc(`organisations/${ORG}/pending_invites/invited@test.dev`, { email: 'invited@test.dev' });
    seedDoc('users/invited', {});
    const res = await request(app).post('/api/org/join').set(auth('invited')).send({ joinCode: 'ABC123' });
    expect(res.status).toBe(200);
    expect(getDocRaw(`organisations/${ORG}/pending_invites/invited@test.dev`)).toBeUndefined();
    expect(getDocRaw(`organisations/${ORG}`)?.memberUids).toContain('invited');
    expect(getDocRaw(`organisations/${ORG}/members/invited`)?.role).toBe('member');
  });

  it('never gives an unverified identity somebody else’s reserved invite seat', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1'], billing: { plan: 'free', status: 'active', seatCount: 2 } });
    seedDoc(`organisations/${ORG}/pending_invites/unverified_claim@test.dev`, { email: 'unverified_claim@test.dev' });
    seedDoc('users/unverified_claim', {});
    const res = await request(app).post('/api/org/join').set(auth('unverified_claim')).send({ joinCode: 'ABC123' });
    expect(res.status).toBe(400);
    expect(getDocRaw(`organisations/${ORG}/pending_invites/unverified_claim@test.dev`)).toBeDefined();
  });

  it('two parallel join requests cannot exceed the same one remaining seat', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1'], billing: { plan: 'free', status: 'active', seatCount: 2 } });
    seedDoc('users/joiner_a', {});
    seedDoc('users/joiner_b', {});
    const results = await Promise.all(['joiner_a', 'joiner_b'].map(uid =>
      request(app).post('/api/org/join').set(auth(uid)).send({ joinCode: 'ABC123' })
    ));
    expect(results.map(r => r.status).sort()).toEqual([200, 400]);
    expect(getDocRaw(`organisations/${ORG}`)?.memberUids).toHaveLength(2);
  });

  it('an expired personal invitation no longer consumes an available joining seat', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1'], billing: { plan: 'free', status: 'active', seatCount: 2 } });
    seedDoc(`organisations/${ORG}/pending_invites/expired@test.dev`, {
      email: 'expired@test.dev', tokenHash: 'a'.repeat(64),
      tokenExpiresAt: new Date(Date.now() - 60_000).toISOString(),
    });
    seedDoc('users/new_joiner', {});
    const res = await request(app).post('/api/org/join').set(auth('new_joiner')).send({ joinCode: 'ABC123' });
    expect(res.status).toBe(200);
    expect(getDocRaw(`organisations/${ORG}/members/new_joiner`)?.role).toBe('member');
    expect(getDocRaw(`organisations/${ORG}/pending_invites/expired@test.dev`)).toBeUndefined();
  });

  it('an expired invitation does not block another new invite when one seat remains', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1'], billing: { plan: 'free', status: 'active', seatCount: 2 } });
    seedMember(ORG, 'owner_1', 'owner');
    seedDoc(`organisations/${ORG}/pending_invites/expired@test.dev`, {
      email: 'expired@test.dev', tokenHash: 'b'.repeat(64),
      tokenExpiresAt: new Date(Date.now() - 60_000).toISOString(),
    });
    const res = await request(app).post(`/api/org/${ORG}/invite`).set(auth('owner_1'))
      .send({ emails: ['fresh@test.dev'] });
    expect(res.status).toBe(200);
    expect(getDocRaw(`organisations/${ORG}/pending_invites/fresh@test.dev`)).toBeDefined();
    expect(getDocRaw(`organisations/${ORG}/pending_invites/expired@test.dev`)).toBeUndefined();
  });

  it('simultaneous invitations reserve seats only once and reject the over-capacity request', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1'], billing: { plan: 'free', status: 'active', seatCount: 2 } });
    seedMember(ORG, 'owner_1', 'owner');
    const results = await Promise.all(['a@test.dev', 'b@test.dev'].map(email =>
      request(app).post(`/api/org/${ORG}/invite`).set(auth('owner_1')).send({ emails: [email] })
    ));
    expect(results.map(r => r.status).sort()).toEqual([200, 400]);
    const rows = ['a@test.dev', 'b@test.dev'].filter(email => !!getDocRaw(`organisations/${ORG}/pending_invites/${email}`));
    expect(rows).toHaveLength(1);
  });

  it('resending an existing pending invite does not consume another seat', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1'], billing: { plan: 'free', status: 'active', seatCount: 2 } });
    seedMember(ORG, 'owner_1', 'owner');
    seedDoc(`organisations/${ORG}/pending_invites/a@test.dev`, { email: 'a@test.dev' });
    const res = await request(app).post(`/api/org/${ORG}/invite`).set(auth('owner_1')).send({ emails: ['a@test.dev'] });
    expect(res.status).toBe(200);
  });
});

describe('invitation identifier validation', () => {
  it('rejects an email containing a Firestore path separator', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1'] });
    seedMember(ORG, 'owner_1', 'owner');
    const res = await request(app).post(`/api/org/${ORG}/invite`).set(auth('owner_1'))
      .send({ emails: ['a/b@example.test'] });
    expect(res.status).toBe(400);
  });

  it('rejects a malformed cancellation address rather than deriving a nested path', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1'] });
    seedMember(ORG, 'owner_1', 'owner');
    const res = await request(app).post(`/api/org/${ORG}/invites/a%2Fb@example.test/cancel`)
      .set(auth('owner_1'));
    expect(res.status).toBe(400);
  });
});

describe('individual expiring company invitations', () => {
  const personalCode = `BBI.${ORG}.${'A'.repeat(32)}`;
  const tokenHash = crypto.createHash('sha256').update(personalCode.toUpperCase()).digest('hex');

  const seedInvite = (email: string, expiry = new Date(Date.now() + 86_400_000).toISOString()) => {
    seedDoc(`organisations/${ORG}/pending_invites/${email}`, {
      email, emailSent: true, tokenHash, tokenExpiresAt: expiry,
    });
  };

  it('stores only a hash, not the invitation code, and never reveals it in the invite list', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1'] });
    seedMember(ORG, 'owner_1', 'owner');
    const sent = await request(app).post(`/api/org/${ORG}/invite`).set(auth('owner_1'))
      .send({ emails: ['fresh@test.dev'] });
    expect(sent.status).toBe(200);
    const saved = getDocRaw(`organisations/${ORG}/pending_invites/fresh@test.dev`);
    expect(saved?.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(new Date(saved!.tokenExpiresAt).getTime()).toBeGreaterThan(Date.now());
    expect(saved).not.toHaveProperty('token');
    const listed = await request(app).get(`/api/org/${ORG}/invites`).set(auth('owner_1'));
    expect(listed.status).toBe(200);
    expect(listed.body.invites[0].individualCode).toBe(true);
    expect(listed.body.invites[0]).not.toHaveProperty('tokenHash');
    expect(JSON.stringify(listed.body)).not.toContain(saved!.tokenHash);
  });

  it('redeems an individual invite only for its verified email, then deletes the credential', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1'], billing: { plan: 'free', status: 'active', seatCount: 2 } });
    seedInvite('invited@test.dev');
    seedDoc('users/invited', {});
    const result = await request(app).post('/api/org/join').set(auth('invited'))
      .send({ joinCode: personalCode });
    expect(result.status).toBe(200);
    expect(getDocRaw(`organisations/${ORG}/pending_invites/invited@test.dev`)).toBeUndefined();
    expect(getDocRaw(`organisations/${ORG}/members/invited`)?.invitedBy).toBe('email_invite');
    const replay = await request(app).post('/api/org/join').set(auth('different_person'))
      .send({ joinCode: personalCode });
    expect(replay.status).not.toBe(200);
  });

  it('rejects a code entered by a different email, or an unverified recipient', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1'] });
    seedInvite('invited@test.dev');
    seedDoc('users/outsider', {});
    seedDoc('users/unverified_invited', {});
    const otherEmail = await request(app).post('/api/org/join').set(auth('outsider'))
      .send({ joinCode: personalCode });
    expect(otherEmail.status).toBe(403);
    // The unverified user's address must match an invitation but still
    // fail the Firebase token's email_verified gate.
    seedInvite('unverified_invited@test.dev');
    const unverified = await request(app).post('/api/org/join').set(auth('unverified_invited'))
      .send({ joinCode: personalCode });
    expect(unverified.status).toBe(403);
  });

  it('a cancelled invitation cannot be redeemed using its personal code', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1'] });
    seedMember(ORG, 'owner_1', 'owner');
    seedInvite('invited@test.dev');
    seedDoc('users/invited', {});
    const cancelled = await request(app).post(`/api/org/${ORG}/invites/invited@test.dev/cancel`).set(auth('owner_1'));
    expect(cancelled.status).toBe(200);
    expect(cancelled.body.invitationTokenRevoked).toBe(true);
    const useRevoked = await request(app).post('/api/org/join').set(auth('invited'))
      .send({ joinCode: personalCode });
    expect(useRevoked.status).toBe(403);
  });

  it('expires an invitation based on its stored expiry timestamp', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1'] });
    seedInvite('invited@test.dev', new Date(Date.now() - 60_000).toISOString());
    seedDoc('users/invited', {});
    const expired = await request(app).post('/api/org/join').set(auth('invited'))
      .send({ joinCode: personalCode });
    expect(expired.status).toBe(410);
  });

  it('resending replaces the old personal code rather than keeping it redeemable', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1'] });
    seedMember(ORG, 'owner_1', 'owner');
    seedInvite('invited@test.dev');
    seedDoc('users/invited', {});
    const resent = await request(app).post(`/api/org/${ORG}/invite`).set(auth('owner_1'))
      .send({ emails: ['invited@test.dev'] });
    expect(resent.status).toBe(200);
    expect(getDocRaw(`organisations/${ORG}/pending_invites/invited@test.dev`)?.tokenHash).not.toBe(tokenHash);
    const oldCode = await request(app).post('/api/org/join').set(auth('invited'))
      .send({ joinCode: personalCode });
    expect(oldCode.status).toBe(403);
  });
});

describe('audit logging', () => {
  it('records a real before/after diff when billing changes', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1'] });
    seedMember(ORG, 'owner_1', 'owner');
    await request(app).post(`/api/org/${ORG}/billing`).set(auth('owner_1')).send({ plan: 'business', status: 'active', seatCount: 50, billingContact: 'finance@org.com' });

    const res = await request(app).get(`/api/org/${ORG}/audit-logs`).set(auth('owner_1'));
    const entry = res.body.logs.find((l: any) => l.action === 'update_billing');
    expect(entry).toBeTruthy();
    expect(entry.before.plan).toBe('free');
    expect(entry.after.plan).toBe('business');
    expect(entry.after.seatCount).toBe(50);
  });
});

describe('POST/GET /api/org/:orgId/invite(s) — defensive catch blocks', () => {
  it('POST /invite: 500s if the org read throws', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1'] });
    seedMember(ORG, 'owner_1', 'owner');
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const restore = forceDocError(`organisations/${ORG}`, 'get', new Error('simulated Firestore outage'));
    const res = await request(app).post(`/api/org/${ORG}/invite`).set(auth('owner_1')).send({ emails: ['a@example.com'] });
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Something went wrong on our end. Please try again.' });
    expect(errorSpy).toHaveBeenCalled();
    restore();
    errorSpy.mockRestore();
  });

  it('GET /invites: 500s if the org read throws', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1'] });
    seedMember(ORG, 'owner_1', 'owner');
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const restore = forceDocError(`organisations/${ORG}`, 'get', new Error('simulated Firestore outage'));
    const res = await request(app).get(`/api/org/${ORG}/invites`).set(auth('owner_1'));
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Something went wrong on our end. Please try again.' });
    expect(errorSpy).toHaveBeenCalled();
    restore();
    errorSpy.mockRestore();
  });
});

describe('POST /api/org/:orgId/invites/:email/cancel', () => {
  it('an admin can cancel a pending invite', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1'] });
    seedMember(ORG, 'owner_1', 'owner');
    await request(app).post(`/api/org/${ORG}/invite`).set(auth('owner_1')).send({ emails: ['a@example.com'] });

    const res = await request(app).post(`/api/org/${ORG}/invites/a@example.com/cancel`).set(auth('owner_1'));
    expect(res.status).toBe(200);

    const invitesRes = await request(app).get(`/api/org/${ORG}/invites`).set(auth('owner_1'));
    expect(invitesRes.body.invites.length).toBe(0);
    expect(res.body.sharedJoinCodeStillValid).toBe(true);
    const auditRes = await request(app).get(`/api/org/${ORG}/audit-logs`).set(auth('owner_1'));
    expect(auditRes.status).toBe(200);
    expect(auditRes.body.logs.some((l: any) => l.action === 'cancel_invitation')).toBe(true);
  });

  it('returns 404 if the pending invitation has already been removed', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1'] });
    seedMember(ORG, 'owner_1', 'owner');
    const res = await request(app).post(`/api/org/${ORG}/invites/absent@example.com/cancel`).set(auth('owner_1'));
    expect(res.status).toBe(404);
  });

  it('refuses a non-admin', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1', 'member_1'] });
    seedMember(ORG, 'member_1', 'member');
    const res = await request(app).post(`/api/org/${ORG}/invites/a@example.com/cancel`).set(auth('member_1'));
    expect(res.status).toBe(403);
  });

  it('500s if the org read throws', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1'] });
    seedMember(ORG, 'owner_1', 'owner');
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const restore = forceDocError(`organisations/${ORG}`, 'get', new Error('simulated Firestore outage'));
    const res = await request(app).post(`/api/org/${ORG}/invites/a@example.com/cancel`).set(auth('owner_1'));
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Something went wrong on our end. Please try again.' });
    expect(errorSpy).toHaveBeenCalled();
    restore();
    errorSpy.mockRestore();
  });
});


describe('billing changes are transactionally audited', () => {
  it('does not alter billing state if its audit transaction fails', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1'] });
    seedMember(ORG, 'owner_1', 'owner');
    const restore = forceTransactionError(new Error('simulated transaction outage'));
    try {
      const res = await request(app).post(`/api/org/${ORG}/billing`)
        .set(auth('owner_1')).send({ plan: 'business', status: 'active', seatCount: 50, billingContact: null });
      expect(res.status).toBe(500);
      expect(getDocRaw(`organisations/${ORG}`)?.billing).toBeUndefined();
    } finally { restore(); }
  });

  it('preserves provider identifiers regardless of submitted values', async () => {
    seedOrg(ORG, {
      adminUids: ['owner_1'], memberUids: ['owner_1'],
      billing: {
        plan: 'starter', status: 'active', seatCount: 7,
        providerCustomerId: 'existing_customer', providerSubscriptionId: 'existing_subscription',
      },
    });
    seedMember(ORG, 'owner_1', 'owner');
    const res = await request(app).post(`/api/org/${ORG}/billing`)
      .set(auth('owner_1')).send({
        plan: 'business', status: 'active', seatCount: 8, billingContact: null,
        providerCustomerId: 'forged_customer', providerSubscriptionId: 'forged_subscription',
      });
    expect(res.status).toBe(200);
    expect(getDocRaw(`organisations/${ORG}`)?.billing?.providerCustomerId).toBe('existing_customer');
    expect(getDocRaw(`organisations/${ORG}`)?.billing?.providerSubscriptionId).toBe('existing_subscription');
  });
});


describe('new organisation membership and invitation audit evidence', () => {
  it('records staff joining without exposing the shared company code', async () => {
    seedOrg(ORG, {
      memberUids: ['owner_1'], adminUids: ['owner_1'], joinCode: 'ABC123',
    });
    seedMember(ORG, 'owner_1', 'owner');
    seedDoc('users/new_employee', {});
    const joined = await request(app).post('/api/org/join')
      .set(auth('new_employee')).send({ joinCode: 'ABC123' });
    expect(joined.status).toBe(200);
    const audit = await request(app).get(`/api/org/${ORG}/audit-logs`).set(auth('owner_1'));
    const entry = audit.body.logs.find((item: any) => item.action === 'join_organisation');
    expect(entry).toMatchObject({
      actorUid: 'new_employee', targetResourceId: 'new_employee',
      after: { role: 'member', status: 'active', method: 'join_code' },
    });
    expect(JSON.stringify(entry)).not.toContain('ABC123');
  });

  it('audits each new and resent invitation without storing invitation tokens', async () => {
    seedOrg(ORG, { memberUids: ['owner_1'], adminUids: ['owner_1'] });
    seedMember(ORG, 'owner_1', 'owner');
    const email = 'new.employee@example.com';
    const first = await request(app).post(`/api/org/${ORG}/invite`)
      .set(auth('owner_1')).send({ emails: [email] });
    expect(first.status).toBe(200);
    const second = await request(app).post(`/api/org/${ORG}/invite`)
      .set(auth('owner_1')).send({ emails: [email] });
    expect(second.status).toBe(200);
    const tokenHash = getDocRaw(`organisations/${ORG}/pending_invites/${email}`)?.tokenHash;
    const audit = await request(app).get(`/api/org/${ORG}/audit-logs`).set(auth('owner_1'));
    const actions = audit.body.logs.filter((item: any) => item.targetResourceId === email);
    expect(actions.map((item: any) => item.action)).toContain('create_invitation');
    expect(actions.map((item: any) => item.action)).toContain('resend_invitation');
    expect(JSON.stringify(actions)).not.toContain(tokenHash);
  });
});
