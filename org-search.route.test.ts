import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.hoisted(() => {
  process.env.TEST_MODE = 'true';
  process.env.NODE_ENV = 'test';
});

vi.mock('express-rate-limit', () => ({ default: () => (_req: any, _res: any, next: any) => next() }));
vi.mock('firebase-admin/app', () => ({ initializeApp: vi.fn(), getApps: () => [{}] }));
vi.mock('firebase-admin/app-check', () => ({ getAppCheck: () => ({ verifyToken: vi.fn() }) }));
vi.mock('firebase-admin/auth', () => ({ getAuth: () => ({ verifyIdToken: async (t: string) => ({ uid: t, email: `${t}@test.dev` }) }) }));
vi.mock('firebase-admin/firestore', async () => {
  const fake = await import('./test/fake-firestore');
  return { getFirestore: () => fake.fakeDb, FieldValue: fake.FakeFieldValue };
});
vi.mock('twilio', () => ({ default: () => ({ messages: { create: vi.fn() } }) }));

import request from 'supertest';
import { app } from './server';
import { seedDoc, resetStore } from './test/fake-firestore';

const ORG = 'org_1';
const OTHER_ORG = 'org_2';
const auth = (uid: string) => ({ Authorization: `Bearer ${uid}` });

function seedOrg(orgId: string, opts: { adminUids?: string[]; memberUids?: string[]; memberTeams?: Record<string, string> } = {}) {
  seedDoc(`organisations/${orgId}`, {
    name: 'Test Org',
    adminUids: opts.adminUids || [],
    memberUids: opts.memberUids || [],
    memberTeams: opts.memberTeams || {},
  });
}

function seedMember(orgId: string, uid: string, role: string) {
  seedDoc(`organisations/${orgId}/members/${uid}`, { role, status: 'active', email: `${uid}@test.dev` });
}

async function registerResource(orgId: string, uid: string, body: any) {
  return request(app).post(`/api/org/${orgId}/search/resources`).set(auth(uid)).send(body);
}

beforeEach(() => resetStore());

describe('POST /api/org/:orgId/search/resources — RBAC (reuses connector_admin permission)', () => {
  it('a viewer or billing_admin cannot register a resource', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1', 'viewer_1', 'billing_1'] });
    seedMember(ORG, 'owner_1', 'owner');
    seedMember(ORG, 'viewer_1', 'viewer');
    seedMember(ORG, 'billing_1', 'billing_admin');
    expect((await registerResource(ORG, 'viewer_1', { title: 'Doc', contentType: 'document', chunkText: 'text' })).status).toBe(403);
    expect((await registerResource(ORG, 'billing_1', { title: 'Doc', contentType: 'document', chunkText: 'text' })).status).toBe(403);
  });

  it('connector_admin, admin, and owner can register a resource', async () => {
    seedOrg(ORG, { adminUids: ['owner_1', 'admin_1'], memberUids: ['owner_1', 'admin_1', 'conn_1'] });
    seedMember(ORG, 'owner_1', 'owner');
    seedMember(ORG, 'admin_1', 'admin');
    seedMember(ORG, 'conn_1', 'connector_admin');
    expect((await registerResource(ORG, 'owner_1', { title: 'Doc', contentType: 'document', chunkText: 'text' })).status).toBe(200);
    expect((await registerResource(ORG, 'admin_1', { title: 'Doc', contentType: 'document', chunkText: 'text' })).status).toBe(200);
    expect((await registerResource(ORG, 'conn_1', { title: 'Doc', contentType: 'document', chunkText: 'text' })).status).toBe(200);
  });

  it('rejects an invalid resource (missing chunkText)', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1'] });
    seedMember(ORG, 'owner_1', 'owner');
    const res = await registerResource(ORG, 'owner_1', { title: 'Doc', contentType: 'document' });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/org/:orgId/search — the security boundary', () => {
  it('a viewer never sees an owner-only resource, while an owner does', async () => {
    // security_admin does not hold org.search.query at all in the RBAC
    // table shipped in chunk 1 (org-rbac.ts) - only owner, admin, member,
    // and viewer can search. This tests the same role-restriction
    // mechanism (aclRoles) using a role that can actually search.
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1', 'viewer_1'] });
    seedMember(ORG, 'owner_1', 'owner');
    seedMember(ORG, 'viewer_1', 'viewer');
    await registerResource(ORG, 'owner_1', {
      title: 'Executive Board Report', contentType: 'document', chunkText: 'Sensitive board-level details.',
      aclRoles: ['owner'],
    });

    const viewerRes = await request(app).post(`/api/org/${ORG}/search`).set(auth('viewer_1')).send({ query: 'board' });
    expect(viewerRes.status).toBe(200);
    expect(viewerRes.body.results.length).toBe(0);

    const ownerRes = await request(app).post(`/api/org/${ORG}/search`).set(auth('owner_1')).send({ query: 'board' });
    expect(ownerRes.body.results.length).toBe(1);
  });

  it('a Team A member never sees a Team B-only resource', async () => {
    seedOrg(ORG, {
      adminUids: ['owner_1'],
      memberUids: ['owner_1', 'team_a_member', 'team_b_member'],
      memberTeams: { team_a_member: 'Team A', team_b_member: 'Team B' },
    });
    seedMember(ORG, 'owner_1', 'owner');
    seedMember(ORG, 'team_a_member', 'member');
    seedMember(ORG, 'team_b_member', 'member');
    await registerResource(ORG, 'owner_1', {
      title: 'Team B Roadmap', contentType: 'document', chunkText: 'Team B specific planning notes.',
      aclTeams: ['Team B'],
    });

    const teamARes = await request(app).post(`/api/org/${ORG}/search`).set(auth('team_a_member')).send({ query: 'roadmap' });
    expect(teamARes.body.results.length).toBe(0);

    const teamBRes = await request(app).post(`/api/org/${ORG}/search`).set(auth('team_b_member')).send({ query: 'roadmap' });
    expect(teamBRes.body.results.length).toBe(1);
  });

  it('an unrestricted resource is visible to every member including a viewer', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1', 'viewer_1'] });
    seedMember(ORG, 'owner_1', 'owner');
    seedMember(ORG, 'viewer_1', 'viewer');
    await registerResource(ORG, 'owner_1', { title: 'Public Handbook', contentType: 'document', chunkText: 'General onboarding info.' });

    const res = await request(app).post(`/api/org/${ORG}/search`).set(auth('viewer_1')).send({ query: 'handbook' });
    expect(res.body.results.length).toBe(1);
  });

  it("org B's resources never leak into org A's search results, even with crafted query params", async () => {
    seedOrg(ORG, { adminUids: ['owner_a'], memberUids: ['owner_a'] });
    seedMember(ORG, 'owner_a', 'owner');
    seedOrg(OTHER_ORG, { adminUids: ['owner_b'], memberUids: ['owner_b'] });
    seedMember(OTHER_ORG, 'owner_b', 'owner');

    await registerResource(OTHER_ORG, 'owner_b', { title: 'Org B Confidential Plan', contentType: 'document', chunkText: 'Org B only content.' });
    await registerResource(ORG, 'owner_a', { title: 'Org A Public Doc', contentType: 'document', chunkText: 'Org A content.' });

    // owner_a has no role in org B, so a crafted search directly against org B's own endpoint is forbidden...
    const crossOrgAttempt = await request(app).post(`/api/org/${OTHER_ORG}/search`).set(auth('owner_a')).send({ query: 'confidential' });
    expect(crossOrgAttempt.status).toBe(403);

    // ...and searching within org A's own scope never surfaces org B's resource, even with an empty/matching query.
    const orgASearch = await request(app).post(`/api/org/${ORG}/search`).set(auth('owner_a')).send({ query: '' });
    expect(orgASearch.body.results.map((r: any) => r.title)).toEqual(['Org A Public Doc']);
  });

  it('a stranger with no role in the org cannot search at all', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1'] });
    seedMember(ORG, 'owner_1', 'owner');
    const res = await request(app).post(`/api/org/${ORG}/search`).set(auth('stranger')).send({ query: 'anything' });
    expect(res.status).toBe(403);
  });
});

describe('POST /api/org/:orgId/search — filters', () => {
  it('filters results by contentType', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1'] });
    seedMember(ORG, 'owner_1', 'owner');
    await registerResource(ORG, 'owner_1', { title: 'Doc One', contentType: 'document', chunkText: 'shared keyword content' });
    await registerResource(ORG, 'owner_1', { title: 'Ticket One', contentType: 'ticket', chunkText: 'shared keyword content' });

    const res = await request(app).post(`/api/org/${ORG}/search`).set(auth('owner_1')).send({ query: 'shared', filters: { contentType: 'ticket' } });
    expect(res.body.results.map((r: any) => r.title)).toEqual(['Ticket One']);
  });

  it('filters results by sourceConnectorId', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1'] });
    seedMember(ORG, 'owner_1', 'owner');
    await registerResource(ORG, 'owner_1', { title: 'Slack Doc', contentType: 'document', chunkText: 'shared keyword content', sourceConnectorId: 'slack_1' });
    await registerResource(ORG, 'owner_1', { title: 'Jira Doc', contentType: 'document', chunkText: 'shared keyword content', sourceConnectorId: 'jira_1' });

    const res = await request(app).post(`/api/org/${ORG}/search`).set(auth('owner_1')).send({ query: 'shared', filters: { sourceConnectorId: 'jira_1' } });
    expect(res.body.results.map((r: any) => r.title)).toEqual(['Jira Doc']);
  });
});

describe('search resource lifecycle', () => {
  it('a removed resource no longer appears in search results', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1'] });
    seedMember(ORG, 'owner_1', 'owner');
    const created = await registerResource(ORG, 'owner_1', { title: 'Temp Doc', contentType: 'document', chunkText: 'temporary content here' });
    const id = created.body.resource.id;

    const beforeRemove = await request(app).post(`/api/org/${ORG}/search`).set(auth('owner_1')).send({ query: 'temporary' });
    expect(beforeRemove.body.results.length).toBe(1);

    const removeRes = await request(app).post(`/api/org/${ORG}/search/resources/${id}/remove`).set(auth('owner_1'));
    expect(removeRes.status).toBe(200);

    const afterRemove = await request(app).post(`/api/org/${ORG}/search`).set(auth('owner_1')).send({ query: 'temporary' });
    expect(afterRemove.body.results.length).toBe(0);
  });

  it('removing a nonexistent resource returns 404', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1'] });
    seedMember(ORG, 'owner_1', 'owner');
    const res = await request(app).post(`/api/org/${ORG}/search/resources/does_not_exist/remove`).set(auth('owner_1'));
    expect(res.status).toBe(404);
  });
});

describe('audit logging never includes raw chunkText', () => {
  it('the register_search_resource audit entry carries only title/contentType, never the chunk content', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1'] });
    seedMember(ORG, 'owner_1', 'owner');
    await registerResource(ORG, 'owner_1', {
      title: 'Doc', contentType: 'document', chunkText: 'THIS-IS-SENSITIVE-CONTENT-MARKER',
    });

    const res = await request(app).get(`/api/org/${ORG}/audit-logs`).set(auth('owner_1'));
    const entry = res.body.logs.find((l: any) => l.action === 'register_search_resource');
    expect(entry).toBeTruthy();
    expect(JSON.stringify(entry)).not.toContain('THIS-IS-SENSITIVE-CONTENT-MARKER');
  });
});
