import { describe, it, expect, beforeEach, vi } from 'vitest';

// Route tests for Team Challenges (POST/GET /api/org/:orgId/challenges,
// POST .../challenges/:challengeId/join, POST .../leave) - previously zero
// coverage of any kind.
process.env.TEST_MODE = 'true';
process.env.NODE_ENV = 'test';

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
import { seedDoc, getDocRaw, resetStore, forceDocError } from './test/fake-firestore';

const ORG = 'org_1';
const OWNER = 'owner_1';
const auth = (uid: string) => ({ Authorization: `Bearer ${uid}` });

function seedOrg(adminUids: string[], memberUids: string[]) {
  seedDoc(`organisations/${ORG}`, { name: 'Test Org', adminUids, memberUids });
}

beforeEach(() => resetStore());

describe('POST /api/org/:orgId/challenges', () => {
  it('requires org admin', async () => {
    seedOrg([OWNER], [OWNER, 'member_1']);
    const res = await request(app).post(`/api/org/${ORG}/challenges`).set(auth('member_1')).send({ title: 'No meetings Friday' });
    expect(res.status).toBe(403);
  });

  it('rejects an empty or over-length title', async () => {
    seedOrg([OWNER], [OWNER]);
    const empty = await request(app).post(`/api/org/${ORG}/challenges`).set(auth(OWNER)).send({ title: '  ' });
    expect(empty.status).toBe(400);
    const tooLong = await request(app).post(`/api/org/${ORG}/challenges`).set(auth(OWNER)).send({ title: 'x'.repeat(101) });
    expect(tooLong.status).toBe(400);
  });

  it('rejects an over-length description', async () => {
    seedOrg([OWNER], [OWNER]);
    const res = await request(app).post(`/api/org/${ORG}/challenges`).set(auth(OWNER)).send({ title: 'x', description: 'y'.repeat(301) });
    expect(res.status).toBe(400);
  });

  it('creates a challenge, active by default with no participants', async () => {
    seedOrg([OWNER], [OWNER]);
    const res = await request(app).post(`/api/org/${ORG}/challenges`).set(auth(OWNER)).send({ title: 'No meetings Friday', description: 'Try it for a week.' });
    expect(res.status).toBe(200);
    const stored = getDocRaw(`organisations/${ORG}/challenges/${res.body.id}`);
    expect(stored?.active).toBe(true);
    expect(stored?.participantUids).toEqual([]);
  });

  // The defensive catch block behind the happy paths above.
  it('returns a generic 500 and logs the real error when the org read throws', async () => {
    seedOrg([OWNER], [OWNER]);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const restore = forceDocError(`organisations/${ORG}`, 'get', new Error('simulated Firestore outage'));
    const res = await request(app).post(`/api/org/${ORG}/challenges`).set(auth(OWNER)).send({ title: 'x' });
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Something went wrong on our end. Please try again.' });
    expect(errorSpy).toHaveBeenCalled();
    restore();
    errorSpy.mockRestore();
  });
});

describe('GET /api/org/:orgId/challenges', () => {
  it('requires membership', async () => {
    seedOrg([OWNER], [OWNER]);
    const res = await request(app).get(`/api/org/${ORG}/challenges`).set(auth('stranger'));
    expect(res.status).toBe(403);
  });

  it('reports a real participation rate and whether the caller has joined', async () => {
    seedOrg([OWNER], [OWNER, 'a1', 'a2', 'a3']);
    const create = await request(app).post(`/api/org/${ORG}/challenges`).set(auth(OWNER)).send({ title: 'No meetings Friday' });
    await request(app).post(`/api/org/${ORG}/challenges/${create.body.id}/join`).set(auth('a1'));

    const res = await request(app).get(`/api/org/${ORG}/challenges`).set(auth('a1'));
    expect(res.status).toBe(200);
    expect(res.body.challenges[0].participantCount).toBe(1);
    expect(res.body.challenges[0].participationRate).toBe(25); // 1 of 4 members
    expect(res.body.challenges[0].joined).toBe(true);

    const asOther = await request(app).get(`/api/org/${ORG}/challenges`).set(auth('a2'));
    expect(asOther.body.challenges[0].joined).toBe(false);
  });

  // The defensive catch block behind the happy path above.
  it('returns a generic 500 and logs the real error when the org read throws', async () => {
    seedOrg([OWNER], [OWNER]);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const restore = forceDocError(`organisations/${ORG}`, 'get', new Error('simulated Firestore outage'));
    const res = await request(app).get(`/api/org/${ORG}/challenges`).set(auth(OWNER));
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Something went wrong on our end. Please try again.' });
    expect(errorSpy).toHaveBeenCalled();
    restore();
    errorSpy.mockRestore();
  });
});

describe('POST /api/org/:orgId/challenges/:challengeId/join', () => {
  it('requires membership', async () => {
    seedOrg([OWNER], [OWNER]);
    const create = await request(app).post(`/api/org/${ORG}/challenges`).set(auth(OWNER)).send({ title: 'x' });
    const res = await request(app).post(`/api/org/${ORG}/challenges/${create.body.id}/join`).set(auth('stranger'));
    expect(res.status).toBe(403);
  });

  it('adds the caller to participantUids', async () => {
    seedOrg([OWNER], [OWNER, 'a1']);
    const create = await request(app).post(`/api/org/${ORG}/challenges`).set(auth(OWNER)).send({ title: 'x' });
    const res = await request(app).post(`/api/org/${ORG}/challenges/${create.body.id}/join`).set(auth('a1'));
    expect(res.status).toBe(200);
    expect(getDocRaw(`organisations/${ORG}/challenges/${create.body.id}`)?.participantUids).toContain('a1');
  });

  // The defensive catch block behind the happy path above.
  it('returns a generic 500 and logs the real error when the org read throws', async () => {
    seedOrg([OWNER], [OWNER]);
    const create = await request(app).post(`/api/org/${ORG}/challenges`).set(auth(OWNER)).send({ title: 'x' });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const restore = forceDocError(`organisations/${ORG}`, 'get', new Error('simulated Firestore outage'));
    const res = await request(app).post(`/api/org/${ORG}/challenges/${create.body.id}/join`).set(auth(OWNER));
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Something went wrong on our end. Please try again.' });
    expect(errorSpy).toHaveBeenCalled();
    restore();
    errorSpy.mockRestore();
  });
});

describe('POST /api/org/:orgId/challenges/:challengeId/leave', () => {
  it('removes the caller from participantUids', async () => {
    seedOrg([OWNER], [OWNER]);
    const create = await request(app).post(`/api/org/${ORG}/challenges`).set(auth(OWNER)).send({ title: 'x' });
    await request(app).post(`/api/org/${ORG}/challenges/${create.body.id}/join`).set(auth(OWNER));
    expect(getDocRaw(`organisations/${ORG}/challenges/${create.body.id}`)?.participantUids).toContain(OWNER);

    const res = await request(app).post(`/api/org/${ORG}/challenges/${create.body.id}/leave`).set(auth(OWNER));
    expect(res.status).toBe(200);
    expect(getDocRaw(`organisations/${ORG}/challenges/${create.body.id}`)?.participantUids).not.toContain(OWNER);
  });

  // This route has no membership pre-check of its own - it updates the
  // challenge doc directly, so a nonexistent challenge is what actually
  // exercises its defensive catch block (the fake Firestore throws on an
  // update to a missing doc, same as the real Admin SDK would for an
  // invalid document path).
  it('returns a generic 500 and logs the real error for a nonexistent challenge', async () => {
    seedOrg([OWNER], [OWNER]);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await request(app).post(`/api/org/${ORG}/challenges/does-not-exist/leave`).set(auth(OWNER));
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Something went wrong on our end. Please try again.' });
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});

describe('POST /api/org/:orgId/challenges/:challengeId/toggle-active', () => {
  it('an admin can toggle a challenge active/inactive', async () => {
    seedOrg([OWNER], [OWNER]);
    const create = await request(app).post(`/api/org/${ORG}/challenges`).set(auth(OWNER)).send({ title: 'x' });

    const off = await request(app).post(`/api/org/${ORG}/challenges/${create.body.id}/toggle-active`).set(auth(OWNER));
    expect(off.status).toBe(200);
    expect(off.body.active).toBe(false);

    const on = await request(app).post(`/api/org/${ORG}/challenges/${create.body.id}/toggle-active`).set(auth(OWNER));
    expect(on.body.active).toBe(true);
  });

  it('refuses a non-admin', async () => {
    seedOrg([OWNER], [OWNER, 'member_1']);
    const create = await request(app).post(`/api/org/${ORG}/challenges`).set(auth(OWNER)).send({ title: 'x' });
    const res = await request(app).post(`/api/org/${ORG}/challenges/${create.body.id}/toggle-active`).set(auth('member_1'));
    expect(res.status).toBe(403);
  });

  it('404s for a nonexistent challenge', async () => {
    seedOrg([OWNER], [OWNER]);
    const res = await request(app).post(`/api/org/${ORG}/challenges/does-not-exist/toggle-active`).set(auth(OWNER));
    expect(res.status).toBe(404);
  });

  it('500s if the org read throws', async () => {
    seedOrg([OWNER], [OWNER]);
    const create = await request(app).post(`/api/org/${ORG}/challenges`).set(auth(OWNER)).send({ title: 'x' });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const restore = forceDocError(`organisations/${ORG}`, 'get', new Error('simulated Firestore outage'));
    const res = await request(app).post(`/api/org/${ORG}/challenges/${create.body.id}/toggle-active`).set(auth(OWNER));
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Something went wrong on our end. Please try again.' });
    expect(errorSpy).toHaveBeenCalled();
    restore();
    errorSpy.mockRestore();
  });
});

describe('POST /api/org/:orgId/challenges/:challengeId/edit', () => {
  it('an admin can edit title and description', async () => {
    seedOrg([OWNER], [OWNER]);
    const create = await request(app).post(`/api/org/${ORG}/challenges`).set(auth(OWNER)).send({ title: 'x' });
    const res = await request(app).post(`/api/org/${ORG}/challenges/${create.body.id}/edit`).set(auth(OWNER))
      .send({ title: 'Updated title', description: 'Updated description' });
    expect(res.status).toBe(200);
    expect(getDocRaw(`organisations/${ORG}/challenges/${create.body.id}`)?.title).toBe('Updated title');
  });

  it('rejects an empty or over-length title', async () => {
    seedOrg([OWNER], [OWNER]);
    const create = await request(app).post(`/api/org/${ORG}/challenges`).set(auth(OWNER)).send({ title: 'x' });
    const empty = await request(app).post(`/api/org/${ORG}/challenges/${create.body.id}/edit`).set(auth(OWNER)).send({ title: '  ' });
    expect(empty.status).toBe(400);
  });

  it('refuses a non-admin', async () => {
    seedOrg([OWNER], [OWNER, 'member_1']);
    const create = await request(app).post(`/api/org/${ORG}/challenges`).set(auth(OWNER)).send({ title: 'x' });
    const res = await request(app).post(`/api/org/${ORG}/challenges/${create.body.id}/edit`).set(auth('member_1')).send({ title: 'y' });
    expect(res.status).toBe(403);
  });

  it('404s for a nonexistent challenge', async () => {
    seedOrg([OWNER], [OWNER]);
    const res = await request(app).post(`/api/org/${ORG}/challenges/does-not-exist/edit`).set(auth(OWNER)).send({ title: 'y' });
    expect(res.status).toBe(404);
  });

  it('500s if the org read throws', async () => {
    seedOrg([OWNER], [OWNER]);
    const create = await request(app).post(`/api/org/${ORG}/challenges`).set(auth(OWNER)).send({ title: 'x' });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const restore = forceDocError(`organisations/${ORG}`, 'get', new Error('simulated Firestore outage'));
    const res = await request(app).post(`/api/org/${ORG}/challenges/${create.body.id}/edit`).set(auth(OWNER)).send({ title: 'y' });
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Something went wrong on our end. Please try again.' });
    expect(errorSpy).toHaveBeenCalled();
    restore();
    errorSpy.mockRestore();
  });
});
