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
const auth = (uid: string) => ({ Authorization: `Bearer ${uid}` });

function seedOrg(orgId: string, opts: { adminUids?: string[]; memberUids?: string[]; memberTeams?: Record<string, string>; teamManagers?: Record<string, string[]>; privacyThreshold?: number } = {}) {
  seedDoc(`organisations/${orgId}`, {
    name: 'Test Org',
    adminUids: opts.adminUids || [],
    memberUids: opts.memberUids || [],
    memberTeams: opts.memberTeams || {},
    teamManagers: opts.teamManagers || {},
    privacyThreshold: opts.privacyThreshold ?? 3,
  });
}

beforeEach(() => resetStore());

describe('POST /api/org/:orgId/team-dashboard/:team/acknowledge', () => {
  it('the manager of a team can log an acknowledgment', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1', 'mgr_a'], teamManagers: { mgr_a: ['Team A'] } });
    const res = await request(app).post(`/api/org/${ORG}/team-dashboard/Team A/acknowledge`).set(auth('mgr_a')).send({ note: 'Held a 1:1.' });
    expect(res.status).toBe(200);
    expect(res.body.ack.team).toBe('Team A');
    expect(res.body.ack.acknowledgedBy).toBe('mgr_a');
    expect(res.body.ack.note).toBe('Held a 1:1.');
  });

  it('an acknowledgment with no note is accepted - note is optional', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1', 'mgr_a'], teamManagers: { mgr_a: ['Team A'] } });
    const res = await request(app).post(`/api/org/${ORG}/team-dashboard/Team A/acknowledge`).set(auth('mgr_a')).send({});
    expect(res.status).toBe(200);
    expect(res.body.ack.note).toBeNull();
  });

  it('a manager of Team A cannot acknowledge on behalf of Team B', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1', 'mgr_a'], teamManagers: { mgr_a: ['Team A'] } });
    const res = await request(app).post(`/api/org/${ORG}/team-dashboard/Team B/acknowledge`).set(auth('mgr_a')).send({});
    expect(res.status).toBe(403);
  });

  it('an org admin can acknowledge on any team even without managing it', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1'] });
    const res = await request(app).post(`/api/org/${ORG}/team-dashboard/Team A/acknowledge`).set(auth('owner_1')).send({});
    expect(res.status).toBe(200);
  });

  it('a plain member with no manager designation cannot acknowledge', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1', 'member_1'] });
    const res = await request(app).post(`/api/org/${ORG}/team-dashboard/Team A/acknowledge`).set(auth('member_1')).send({});
    expect(res.status).toBe(403);
  });

  it('rejects an overlong note', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1', 'mgr_a'], teamManagers: { mgr_a: ['Team A'] } });
    const res = await request(app).post(`/api/org/${ORG}/team-dashboard/Team A/acknowledge`).set(auth('mgr_a')).send({ note: 'x'.repeat(501) });
    expect(res.status).toBe(400);
  });

  it('the audit log entry never contains the note text, only whether one was provided', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1', 'mgr_a'], teamManagers: { mgr_a: ['Team A'] } });
    await request(app).post(`/api/org/${ORG}/team-dashboard/Team A/acknowledge`).set(auth('mgr_a')).send({ note: 'THIS-IS-SENSITIVE-TEXT' });

    const res = await request(app).get(`/api/org/${ORG}/audit-logs`).set(auth('owner_1'));
    const entry = res.body.logs.find((l: any) => l.action === 'acknowledge_team_signal');
    expect(entry).toBeTruthy();
    expect(entry.after.notePresent).toBe(true);
    expect(JSON.stringify(entry)).not.toContain('THIS-IS-SENSITIVE-TEXT');
  });

  it('requires authentication', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1'] });
    const res = await request(app).post(`/api/org/${ORG}/team-dashboard/Team A/acknowledge`).send({});
    expect(res.status).toBe(401);
  });
});
