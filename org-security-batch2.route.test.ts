import { describe, it, expect, beforeEach, vi } from 'vitest';
import crypto from 'crypto';

// Batch 2 organisation-security regression suite. Every test drives the
// real Express routes over HTTP against the in-memory Firestore fake.
// Covers: invitation lifecycle (cancel, replace, expiry, single use),
// shared joining codes (rotation, removed-member re-entry, SSO domains),
// offboarding authority, in-flight privilege changes, cross-company
// isolation, missing-company handling, and audit records.
vi.hoisted(() => {
  process.env.TEST_MODE = 'true';
  process.env.NODE_ENV = 'test';
});

vi.mock('express-rate-limit', () => ({ default: () => (_req: any, _res: any, next: any) => next(), ipKeyGenerator: (ip: string) => ip }));
vi.mock('firebase-admin/app', () => ({ initializeApp: vi.fn(), getApps: () => [{}] }));
vi.mock('firebase-admin/app-check', () => ({ getAppCheck: () => ({ verifyToken: vi.fn() }) }));
// Token = uid. A uid containing "@" is also the email; otherwise
// <uid>@test.dev. Uids starting "unverified" have an unverified email.
vi.mock('firebase-admin/auth', () => ({
  getAuth: () => ({
    verifyIdToken: async (t: string) => ({
      uid: t,
      email: t.includes('@') ? t : `${t}@test.dev`,
      email_verified: !t.startsWith('unverified'),
      auth_time: Math.floor(Date.now() / 1000),
    }),
    getUser: async (uid: string) => ({ uid, email: `${uid}@test.dev`, displayName: null }),
  }),
}));
vi.mock('firebase-admin/firestore', async () => {
  const fake = await import('./test/fake-firestore');
  return { getFirestore: () => fake.fakeDb, FieldValue: fake.FakeFieldValue };
});
vi.mock('twilio', () => ({ default: () => ({ messages: { create: vi.fn() } }) }));

import request from 'supertest';
import { app } from './server';
import { FakeFirestore, seedDoc, getDocRaw, resetStore, allPaths } from './test/fake-firestore';

const ORG = 'org_1';
const OTHER = 'org_2';
const CODE = 'ABCDEFGHJKLM';
const auth = (uid: string) => ({ Authorization: `Bearer ${uid}` });

function seedOrg(orgId: string, opts: { owners?: string[]; members?: Record<string, string>; joinCode?: string } = {}) {
  const owners = opts.owners ?? ['owner_1'];
  const members = opts.members ?? {};
  seedDoc(`organisations/${orgId}`, {
    name: `Org ${orgId}`,
    adminUids: owners,
    memberUids: [...owners, ...Object.keys(members)],
    joinCode: opts.joinCode ?? CODE,
  });
  for (const uid of owners) {
    seedDoc(`organisations/${orgId}/members/${uid}`, { role: 'owner', status: 'active' });
    seedDoc(`users/${uid}`, { organisationId: orgId });
  }
  for (const [uid, role] of Object.entries(members)) {
    seedDoc(`organisations/${orgId}/members/${uid}`, { role, status: 'active' });
    seedDoc(`users/${uid}`, { organisationId: orgId });
  }
}

// Seeds a personal invitation exactly as POST /invite stores it (hash only).
function seedInvite(orgId: string, email: string, opts: { expiresInMs?: number } = {}) {
  const token = `BBI.${orgId}.${crypto.randomBytes(16).toString('hex')}`.toUpperCase();
  seedDoc(`organisations/${orgId}/pending_invites/${email}`, {
    email, emailSent: true,
    tokenHash: crypto.createHash('sha256').update(token).digest('hex'),
    tokenExpiresAt: new Date(Date.now() + (opts.expiresInMs ?? 7 * 86_400_000)).toISOString(),
  });
  return token;
}

const auditActions = (orgId: string) => allPaths()
  .filter((p) => p.startsWith(`organisations/${orgId}/audit_logs/`))
  .map((p) => getDocRaw(p)!);

// Runs `mutate` immediately before the NEXT transaction starts - i.e. after
// the route's own pre-transaction permission check has already passed.
// Simulates a concurrent demotion/removal racing an in-flight request.
function changeStateBeforeNextTransaction(mutate: () => void) {
  const original = FakeFirestore.prototype.runTransaction;
  FakeFirestore.prototype.runTransaction = function (this: any, fn: any) {
    FakeFirestore.prototype.runTransaction = original;
    mutate();
    return original.call(this, fn);
  } as any;
  return () => { FakeFirestore.prototype.runTransaction = original; };
}

beforeEach(() => resetStore());

describe('personal invitations: revoked, replaced, expired and used codes', () => {
  it('a cancelled invitation code can never be used', async () => {
    seedOrg(ORG);
    const token = seedInvite(ORG, 'invitee@test.dev');
    const cancel = await request(app).post(`/api/org/${ORG}/invites/invitee@test.dev/cancel`).set(auth('owner_1'));
    expect(cancel.status).toBe(200);
    const join = await request(app).post('/api/org/join').set(auth('invitee')).send({ joinCode: token });
    expect(join.status).toBe(403);
    expect(getDocRaw(`organisations/${ORG}`)?.memberUids).not.toContain('invitee');
    expect(auditActions(ORG).map((a) => a.action)).toContain('cancel_invitation');
  });

  it('a replaced (re-sent) invitation invalidates the old code', async () => {
    seedOrg(ORG);
    const oldToken = seedInvite(ORG, 'invitee@test.dev');
    seedInvite(ORG, 'invitee@test.dev'); // re-send overwrites the stored hash
    const join = await request(app).post('/api/org/join').set(auth('invitee')).send({ joinCode: oldToken });
    expect(join.status).toBe(403);
  });

  it('an expired invitation code is refused', async () => {
    seedOrg(ORG);
    const token = seedInvite(ORG, 'invitee@test.dev', { expiresInMs: -1000 });
    const join = await request(app).post('/api/org/join').set(auth('invitee')).send({ joinCode: token });
    expect(join.status).toBe(410);
  });

  it('an invitation code is single-use: after joining and leaving it cannot be reused', async () => {
    seedOrg(ORG);
    const token = seedInvite(ORG, 'invitee@test.dev');
    expect((await request(app).post('/api/org/join').set(auth('invitee')).send({ joinCode: token })).status).toBe(200);
    expect(getDocRaw(`organisations/${ORG}/pending_invites/invitee@test.dev`)).toBeUndefined();
    expect((await request(app).post('/api/org/leave').set(auth('invitee'))).status).toBe(200);
    const reuse = await request(app).post('/api/org/join').set(auth('invitee')).send({ joinCode: token });
    expect(reuse.status).toBe(403);
  });

  it('a code issued to one person cannot be used by a different account', async () => {
    seedOrg(ORG);
    const token = seedInvite(ORG, 'invitee@test.dev');
    const join = await request(app).post('/api/org/join').set(auth('someone_else')).send({ joinCode: token });
    expect(join.status).toBe(403);
    expect(getDocRaw(`organisations/${ORG}/pending_invites/invitee@test.dev`)).toBeDefined();
  });

  it('the invitation list never exposes token hashes', async () => {
    seedOrg(ORG);
    seedInvite(ORG, 'invitee@test.dev');
    const res = await request(app).get(`/api/org/${ORG}/invites`).set(auth('owner_1'));
    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).not.toMatch(/tokenHash|[a-f0-9]{64}/);
  });
});

describe('shared joining code', () => {
  it('rotating the code invalidates the old one immediately and is audited', async () => {
    seedOrg(ORG);
    const rotate = await request(app).post(`/api/org/${ORG}/regenerate-join-code`).set(auth('owner_1'));
    expect(rotate.status).toBe(200);
    expect(rotate.body.joinCode).not.toBe(CODE);
    const join = await request(app).post('/api/org/join').set(auth('newcomer')).send({ joinCode: CODE });
    expect(join.status).toBe(404);
    expect(auditActions(ORG).map((a) => a.action)).toContain('rotate_join_code');
    expect(JSON.stringify(auditActions(ORG))).not.toContain(rotate.body.joinCode);
  });

  it('an unverified email cannot join with the shared code', async () => {
    seedOrg(ORG);
    const join = await request(app).post('/api/org/join').set(auth('unverified_x')).send({ joinCode: CODE });
    expect(join.status).toBe(403);
  });

  it('a removed employee cannot rejoin with the shared code', async () => {
    seedOrg(ORG, { members: { leaver: 'member' } });
    expect((await request(app).post(`/api/org/${ORG}/members/leaver/remove`).set(auth('owner_1'))).status).toBe(200);
    const rejoin = await request(app).post('/api/org/join').set(auth('leaver')).send({ joinCode: CODE });
    expect(rejoin.status).toBe(403);
    expect(rejoin.body.error).toMatch(/new personal invitation/i);
    expect(getDocRaw(`organisations/${ORG}`)?.memberUids).not.toContain('leaver');
  });

  it('a new personal invitation readmits a removed employee and clears the block', async () => {
    seedOrg(ORG, { members: { leaver: 'member' } });
    await request(app).post(`/api/org/${ORG}/members/leaver/remove`).set(auth('owner_1'));
    const token = seedInvite(ORG, 'leaver@test.dev');
    const rejoin = await request(app).post('/api/org/join').set(auth('leaver')).send({ joinCode: token });
    expect(rejoin.status).toBe(200);
    expect(getDocRaw(`organisations/${ORG}/removed_members/leaver`)).toBeUndefined();
    const join = auditActions(ORG).find((a) => a.action === 'join_organisation');
    expect(join?.after).toMatchObject({ method: 'email_invite', readmittedAfterRemoval: true });
  });

  it('someone who LEFT voluntarily may rejoin with the shared code', async () => {
    seedOrg(ORG, { members: { mover: 'member' } });
    expect((await request(app).post('/api/org/leave').set(auth('mover'))).status).toBe(200);
    const rejoin = await request(app).post('/api/org/join').set(auth('mover')).send({ joinCode: CODE });
    expect(rejoin.status).toBe(200);
  });

  it('with SSO enforced, only approved email domains may join', async () => {
    seedOrg(ORG);
    seedDoc(`organisations/${ORG}/sso_config/config`, { enforceSso: true, allowedDomains: ['acme.com'] });
    const outsider = await request(app).post('/api/org/join').set(auth('person@gmail.com')).send({ joinCode: CODE });
    expect(outsider.status).toBe(403);
    const staff = await request(app).post('/api/org/join').set(auth('staff@acme.com')).send({ joinCode: CODE });
    expect(staff.status).toBe(200);
  });

  it('SSO domains are not applied while enforcement is off', async () => {
    seedOrg(ORG);
    seedDoc(`organisations/${ORG}/sso_config/config`, { enforceSso: false, allowedDomains: ['acme.com'] });
    const join = await request(app).post('/api/org/join').set(auth('person@gmail.com')).send({ joinCode: CODE });
    expect(join.status).toBe(200);
  });
});

describe('offboarding authority and audit accuracy', () => {
  it('an admin cannot remove an owner, even when another owner exists', async () => {
    seedOrg(ORG, { owners: ['owner_1', 'owner_2'], members: { admin_1: 'admin' } });
    const res = await request(app).post(`/api/org/${ORG}/members/owner_2/remove`).set(auth('admin_1'));
    expect(res.status).toBe(403);
    expect(getDocRaw(`organisations/${ORG}`)?.memberUids).toContain('owner_2');
  });

  it('an admin cannot remove a security administrator; an owner can', async () => {
    seedOrg(ORG, { members: { admin_1: 'admin', sec_1: 'security_admin' } });
    expect((await request(app).post(`/api/org/${ORG}/members/sec_1/remove`).set(auth('admin_1'))).status).toBe(403);
    expect((await request(app).post(`/api/org/${ORG}/members/sec_1/remove`).set(auth('owner_1'))).status).toBe(200);
  });

  it('removal revokes devices, roster, teams and consent, and audits the TRUE prior state', async () => {
    seedOrg(ORG, { members: { staff_1: 'member' } });
    seedDoc(`organisations/${ORG}/members/staff_1`, { role: 'member', status: 'suspended' });
    seedDoc('users/staff_1', { organisationId: ORG, shareAnonymizedDataWithOrg: true });
    seedDoc(`organisations/${ORG}/devices/d1`, { ownerUid: 'staff_1', status: 'active' });
    const res = await request(app).post(`/api/org/${ORG}/members/staff_1/remove`).set(auth('owner_1'));
    expect(res.status).toBe(200);
    expect(getDocRaw(`organisations/${ORG}/devices/d1`)).toBeUndefined();
    expect(getDocRaw('users/staff_1')?.organisationId).toBeUndefined();
    expect(getDocRaw('users/staff_1')?.shareAnonymizedDataWithOrg).toBe(false);
    const audit = auditActions(ORG).find((a) => a.action === 'remove_member');
    expect(audit?.before).toEqual({ role: 'member', status: 'suspended', devices: 1 });
    expect(audit?.after).toMatchObject({ accessRemoved: true, devicesRevoked: 1 });
    // A removed employee loses access to company routes at once.
    seedDoc(`organisations/${ORG}/members/staff_1`, { role: 'admin', status: 'active' }); // stale leftover
    const after = await request(app).get(`/api/org/${ORG}/members`).set(auth('staff_1'));
    expect(after.status).toBe(403);
  });

  it('ownership transfer: promote a new owner, then the old owner steps down; both audited', async () => {
    seedOrg(ORG, { members: { successor: 'admin' } });
    expect((await request(app).post(`/api/org/${ORG}/members/successor/role`).set(auth('owner_1')).send({ role: 'owner' })).status).toBe(200);
    expect((await request(app).post(`/api/org/${ORG}/members/owner_1/role`).set(auth('successor')).send({ role: 'member' })).status).toBe(200);
    expect(getDocRaw(`organisations/${ORG}/members/successor`)?.role).toBe('owner');
    expect(getDocRaw(`organisations/${ORG}/members/owner_1`)?.role).toBe('member');
    const changes = auditActions(ORG).filter((a) => a.action === 'change_member_role');
    expect(changes.map((c) => [c.targetResourceId, c.before.role, c.after.role])).toEqual(expect.arrayContaining([
      ['successor', 'admin', 'owner'], ['owner_1', 'owner', 'member'],
    ]));
    // The demoted former owner immediately loses admin access.
    expect((await request(app).post(`/api/org/${ORG}/regenerate-join-code`).set(auth('owner_1'))).status).toBe(403);
  });

  it('an admin cannot promote anyone (including themselves) to owner', async () => {
    seedOrg(ORG, { members: { admin_1: 'admin', staff: 'member' } });
    expect((await request(app).post(`/api/org/${ORG}/members/admin_1/role`).set(auth('admin_1')).send({ role: 'owner' })).status).toBe(403);
    expect((await request(app).post(`/api/org/${ORG}/members/staff/role`).set(auth('admin_1')).send({ role: 'owner' })).status).toBe(403);
  });
});

describe('privilege changes that race an in-flight request', () => {
  const cases: [string, string, string, Record<string, unknown> | undefined][] = [
    ['remove a member', 'post', `/api/org/${ORG}/members/staff/remove`, undefined],
    ['rotate the joining code', 'post', `/api/org/${ORG}/regenerate-join-code`, undefined],
    ['invite people', 'post', `/api/org/${ORG}/invite`, { emails: ['new@test.dev'] }],
    ['cancel an invitation', 'post', `/api/org/${ORG}/invites/pending@test.dev/cancel`, undefined],
    ['change company settings', 'post', `/api/org/${ORG}/settings`, { name: 'Renamed' }],
    ['grant admin', 'post', `/api/org/${ORG}/members/staff/make-admin`, undefined],
    ['change a role', 'post', `/api/org/${ORG}/members/staff/role`, { role: 'viewer' }],
    ['suspend a member', 'post', `/api/org/${ORG}/members/staff/suspend`, undefined],
  ];
  for (const [label, , path, body] of cases) {
    it(`an admin suspended mid-request cannot ${label}`, async () => {
      seedOrg(ORG, { members: { admin_1: 'admin', staff: 'member' } });
      seedInvite(ORG, 'pending@test.dev');
      const before = JSON.stringify(allPaths().sort().map((p) => [p, getDocRaw(p)]));
      changeStateBeforeNextTransaction(() =>
        seedDoc(`organisations/${ORG}/members/admin_1`, { role: 'admin', status: 'suspended' }));
      const res = await request(app).post(path).set(auth('admin_1')).send(body ?? {});
      expect(res.status).toBe(403);
      const after = JSON.stringify(allPaths().sort()
        .filter((p) => p !== `organisations/${ORG}/members/admin_1`)
        .map((p) => [p, getDocRaw(p)]));
      const expected = JSON.stringify(JSON.parse(before)
        .filter(([p]: [string]) => p !== `organisations/${ORG}/members/admin_1`));
      expect(after).toBe(expected);
    });
  }

  it('reactivation is refused if the acting admin was removed mid-request', async () => {
    seedOrg(ORG, { members: { admin_1: 'admin' } });
    seedDoc(`organisations/${ORG}/members/staff`, { role: 'member', status: 'suspended' });
    seedDoc(`organisations/${ORG}`, { name: 'x', adminUids: ['owner_1'], memberUids: ['owner_1', 'admin_1', 'staff'], joinCode: CODE });
    changeStateBeforeNextTransaction(() =>
      seedDoc(`organisations/${ORG}`, { name: 'x', adminUids: ['owner_1'], memberUids: ['owner_1', 'staff'], joinCode: CODE }));
    const res = await request(app).post(`/api/org/${ORG}/members/staff/reactivate`).set(auth('admin_1'));
    expect(res.status).toBe(403);
    expect(getDocRaw(`organisations/${ORG}/members/staff`)?.status).toBe('suspended');
  });
});

describe('isolation between companies', () => {
  const crossRoutes: [string, string, Record<string, unknown> | undefined][] = [
    ['get', `/api/org/${OTHER}/members`, undefined],
    ['get', `/api/org/${OTHER}/invites`, undefined],
    ['get', `/api/org/${OTHER}/audit-logs`, undefined],
    ['get', `/api/org/${OTHER}/members/roles`, undefined],
    ['post', `/api/org/${OTHER}/invite`, { emails: ['x@test.dev'] }],
    ['post', `/api/org/${OTHER}/invites/pending@test.dev/cancel`, undefined],
    ['post', `/api/org/${OTHER}/members/b_staff/remove`, undefined],
    ['post', `/api/org/${OTHER}/members/b_staff/role`, { role: 'admin' }],
    ['post', `/api/org/${OTHER}/members/b_staff/suspend`, undefined],
    ['post', `/api/org/${OTHER}/members/b_staff/make-admin`, undefined],
    ['post', `/api/org/${OTHER}/regenerate-join-code`, undefined],
    ['post', `/api/org/${OTHER}/settings`, { name: 'Hijacked' }],
    ['post', `/api/org/${OTHER}/recognition/post_1/delete`, undefined],
  ];
  for (const [method, path, body] of crossRoutes) {
    it(`the owner of company A is refused on ${method.toUpperCase()} ${path.replace(`/api/org/${OTHER}`, '<company B>')}`, async () => {
      seedOrg(ORG);
      seedOrg(OTHER, { owners: ['b_owner'], members: { b_staff: 'member' }, joinCode: 'ZZZZZZZZZZZZ' });
      seedInvite(OTHER, 'pending@test.dev');
      seedDoc(`organisations/${OTHER}/recognition_wall/post_1`, { message: 'thanks' });
      const before = JSON.stringify(allPaths().filter((p) => p.startsWith(`organisations/${OTHER}`)).sort().map((p) => [p, getDocRaw(p)]));
      const call = (request(app) as any)[method](path).set(auth('owner_1'));
      const res = body ? await call.send(body) : await call;
      expect(res.status).toBe(403);
      const after = JSON.stringify(allPaths().filter((p) => p.startsWith(`organisations/${OTHER}`)).sort().map((p) => [p, getDocRaw(p)]));
      expect(after).toBe(before);
    });
  }

  it('a stale roster entry in company B does not let a company-A account act there', async () => {
    seedOrg(ORG);
    seedOrg(OTHER, { owners: ['b_owner'] });
    // owner_1 left behind on B's roster with an owner record, but their
    // profile now belongs to company A.
    seedDoc(`organisations/${OTHER}`, { name: 'B', adminUids: ['b_owner', 'owner_1'], memberUids: ['b_owner', 'owner_1'], joinCode: 'ZZZZZZZZZZZZ' });
    seedDoc(`organisations/${OTHER}/members/owner_1`, { role: 'owner', status: 'active' });
    const res = await request(app).post(`/api/org/${OTHER}/regenerate-join-code`).set(auth('owner_1'));
    expect(res.status).toBe(403);
  });
});

describe('missing companies and moderation audit', () => {
  for (const path of ['/invite', '/regenerate-join-code', '/members/x/remove', '/settings']) {
    it(`POST ${path} on a company that does not exist returns 404, not a server error`, async () => {
      const res = await request(app).post(`/api/org/no_such_org${path}`).set(auth('owner_1')).send({ emails: ['a@test.dev'], name: 'N' });
      expect(res.status).toBe(404);
    });
  }

  it('deleting a recognition post is audited without copying its text', async () => {
    seedOrg(ORG);
    seedDoc(`organisations/${ORG}/recognition_wall/post_1`, { message: 'private praise text' });
    const res = await request(app).post(`/api/org/${ORG}/recognition/post_1/delete`).set(auth('owner_1'));
    expect(res.status).toBe(200);
    expect(getDocRaw(`organisations/${ORG}/recognition_wall/post_1`)).toBeUndefined();
    const audit = auditActions(ORG).find((a) => a.action === 'delete_recognition_post');
    expect(audit).toMatchObject({ actorUid: 'owner_1', targetResourceId: 'post_1' });
    expect(JSON.stringify(audit)).not.toContain('private praise text');
  });

  it('deleting a post that does not exist returns 404 and writes no audit entry', async () => {
    seedOrg(ORG);
    const res = await request(app).post(`/api/org/${ORG}/recognition/ghost/delete`).set(auth('owner_1'));
    expect(res.status).toBe(404);
    expect(auditActions(ORG).find((a) => a.action === 'delete_recognition_post')).toBeUndefined();
  });

  it('a plain member cannot delete recognition posts', async () => {
    seedOrg(ORG, { members: { staff: 'member' } });
    seedDoc(`organisations/${ORG}/recognition_wall/post_1`, { message: 'x' });
    const res = await request(app).post(`/api/org/${ORG}/recognition/post_1/delete`).set(auth('staff'));
    expect(res.status).toBe(403);
    expect(getDocRaw(`organisations/${ORG}/recognition_wall/post_1`)).toBeDefined();
  });
});
