import { describe, it, expect, beforeEach, vi } from 'vitest';

// Route tests for the Recognition Wall (POST/GET /api/org/:orgId/recognition,
// POST .../recognition/:recognitionId/react) - previously zero coverage of
// any kind. Any org member can post or react; isAnonymous controls whether
// the author's real name or "Anonymous" is stored.
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
import { seedDoc, resetStore, forceDocError } from './test/fake-firestore';

const ORG = 'org_1';
const auth = (uid: string) => ({ Authorization: `Bearer ${uid}` });

function seedOrg(memberUids: string[]) {
  seedDoc(`organisations/${ORG}`, { name: 'Test Org', adminUids: [], memberUids });
}

beforeEach(() => resetStore());

describe('POST /api/org/:orgId/recognition', () => {
  it('requires the poster to be a member of the organisation', async () => {
    seedOrg(['a1']);
    const res = await request(app).post(`/api/org/${ORG}/recognition`).set(auth('stranger')).send({ message: 'Great work!' });
    expect(res.status).toBe(403);
  });

  it('rejects an empty or over-length message', async () => {
    seedOrg(['a1']);
    const empty = await request(app).post(`/api/org/${ORG}/recognition`).set(auth('a1')).send({ message: '   ' });
    expect(empty.status).toBe(400);
    const tooLong = await request(app).post(`/api/org/${ORG}/recognition`).set(auth('a1')).send({ message: 'x'.repeat(301) });
    expect(tooLong.status).toBe(400);
  });

  it('stores the real display name when not posted anonymously', async () => {
    seedOrg(['a1']);
    seedDoc('users/a1', { displayName: 'Ada' });
    const res = await request(app).post(`/api/org/${ORG}/recognition`).set(auth('a1')).send({ message: 'Great work!', isAnonymous: false });
    expect(res.status).toBe(200);
    const list = await request(app).get(`/api/org/${ORG}/recognition`).set(auth('a1'));
    expect(list.body.items[0].from).toBe('Ada');
  });

  it('stores "Anonymous" when posted anonymously, regardless of the real display name', async () => {
    seedOrg(['a1']);
    seedDoc('users/a1', { displayName: 'Ada' });
    const res = await request(app).post(`/api/org/${ORG}/recognition`).set(auth('a1')).send({ message: 'Great work!', isAnonymous: true });
    expect(res.status).toBe(200);
    const list = await request(app).get(`/api/org/${ORG}/recognition`).set(auth('a1'));
    expect(list.body.items[0].from).toBe('Anonymous');
  });

  // The defensive catch block behind the happy paths above.
  it('returns a generic 500 and logs the real error when the org read throws', async () => {
    seedOrg(['a1']);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const restore = forceDocError(`organisations/${ORG}`, 'get', new Error('simulated Firestore outage'));
    const res = await request(app).post(`/api/org/${ORG}/recognition`).set(auth('a1')).send({ message: 'Great work!' });
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Something went wrong on our end. Please try again.' });
    expect(errorSpy).toHaveBeenCalled();
    restore();
    errorSpy.mockRestore();
  });
});

describe('GET /api/org/:orgId/recognition', () => {
  it('requires membership', async () => {
    seedOrg(['a1']);
    const res = await request(app).get(`/api/org/${ORG}/recognition`).set(auth('stranger'));
    expect(res.status).toBe(403);
  });

  it('reports reactionCount and whether the caller has reacted', async () => {
    seedOrg(['a1', 'a2']);
    const post = await request(app).post(`/api/org/${ORG}/recognition`).set(auth('a1')).send({ message: 'Nice job!' });
    await request(app).post(`/api/org/${ORG}/recognition/${post.body.id}/react`).set(auth('a2'));

    const asReactor = await request(app).get(`/api/org/${ORG}/recognition`).set(auth('a2'));
    expect(asReactor.body.items[0].reactionCount).toBe(1);
    expect(asReactor.body.items[0].reacted).toBe(true);

    const asOther = await request(app).get(`/api/org/${ORG}/recognition`).set(auth('a1'));
    expect(asOther.body.items[0].reacted).toBe(false);
  });

  // The defensive catch block behind the happy path above.
  it('returns a generic 500 and logs the real error when the org read throws', async () => {
    seedOrg(['a1']);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const restore = forceDocError(`organisations/${ORG}`, 'get', new Error('simulated Firestore outage'));
    const res = await request(app).get(`/api/org/${ORG}/recognition`).set(auth('a1'));
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Something went wrong on our end. Please try again.' });
    expect(errorSpy).toHaveBeenCalled();
    restore();
    errorSpy.mockRestore();
  });
});

describe('POST /api/org/:orgId/recognition/:recognitionId/react', () => {
  it('requires membership', async () => {
    seedOrg(['a1']);
    const post = await request(app).post(`/api/org/${ORG}/recognition`).set(auth('a1')).send({ message: 'Nice job!' });
    const res = await request(app).post(`/api/org/${ORG}/recognition/${post.body.id}/react`).set(auth('stranger'));
    expect(res.status).toBe(403);
  });

  it('404s for a nonexistent post', async () => {
    seedOrg(['a1']);
    const res = await request(app).post(`/api/org/${ORG}/recognition/does-not-exist/react`).set(auth('a1'));
    expect(res.status).toBe(404);
  });

  it('toggles the reaction on and back off for the same user', async () => {
    seedOrg(['a1', 'a2']);
    const post = await request(app).post(`/api/org/${ORG}/recognition`).set(auth('a1')).send({ message: 'Nice job!' });

    const on = await request(app).post(`/api/org/${ORG}/recognition/${post.body.id}/react`).set(auth('a2'));
    expect(on.body).toEqual({ success: true, reacted: true });

    const off = await request(app).post(`/api/org/${ORG}/recognition/${post.body.id}/react`).set(auth('a2'));
    expect(off.body).toEqual({ success: true, reacted: false });
  });

  // The defensive catch block behind the happy paths above.
  it('returns a generic 500 and logs the real error when the org read throws', async () => {
    seedOrg(['a1']);
    const post = await request(app).post(`/api/org/${ORG}/recognition`).set(auth('a1')).send({ message: 'Nice job!' });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const restore = forceDocError(`organisations/${ORG}`, 'get', new Error('simulated Firestore outage'));
    const res = await request(app).post(`/api/org/${ORG}/recognition/${post.body.id}/react`).set(auth('a1'));
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Something went wrong on our end. Please try again.' });
    expect(errorSpy).toHaveBeenCalled();
    restore();
    errorSpy.mockRestore();
  });
});

describe('POST /api/org/:orgId/recognition/:recognitionId/delete', () => {
  function seedOrgWithAdmin(adminUids: string[], memberUids: string[]) {
    seedDoc(`organisations/${ORG}`, { name: 'Test Org', adminUids, memberUids });
  }

  it('an admin can delete a recognition post', async () => {
    seedOrgWithAdmin(['owner_1'], ['owner_1', 'a1']);
    const post = await request(app).post(`/api/org/${ORG}/recognition`).set(auth('a1')).send({ message: 'Nice job!' });

    const res = await request(app).post(`/api/org/${ORG}/recognition/${post.body.id}/delete`).set(auth('owner_1'));
    expect(res.status).toBe(200);

    const list = await request(app).get(`/api/org/${ORG}/recognition`).set(auth('owner_1'));
    expect(list.body.items.find((i: any) => i.id === post.body.id)).toBeUndefined();
  });

  it('refuses a non-admin member', async () => {
    seedOrgWithAdmin(['owner_1'], ['owner_1', 'a1']);
    const post = await request(app).post(`/api/org/${ORG}/recognition`).set(auth('a1')).send({ message: 'Nice job!' });

    const res = await request(app).post(`/api/org/${ORG}/recognition/${post.body.id}/delete`).set(auth('a1'));
    expect(res.status).toBe(403);
  });

  it('500s if the org read throws', async () => {
    seedOrgWithAdmin(['owner_1'], ['owner_1', 'a1']);
    const post = await request(app).post(`/api/org/${ORG}/recognition`).set(auth('a1')).send({ message: 'Nice job!' });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const restore = forceDocError(`organisations/${ORG}`, 'get', new Error('simulated Firestore outage'));
    const res = await request(app).post(`/api/org/${ORG}/recognition/${post.body.id}/delete`).set(auth('owner_1'));
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Something went wrong on our end. Please try again.' });
    expect(errorSpy).toHaveBeenCalled();
    restore();
    errorSpy.mockRestore();
  });
});
