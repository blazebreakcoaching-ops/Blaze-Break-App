import { describe, it, expect, beforeEach, vi } from 'vitest';

// Route tests for the real, manually-created/updated incident log
// (platform_incidents) behind the Command Centre's Incidents tab.
// There is no automated detection anywhere in this codebase - the one
// thing these routes need to prove is that an admin's manual log entry
// is genuinely persisted, audit-logged, and carries a real status/
// severity workflow with a timestamped timeline, not that anything was
// auto-detected.
process.env.TEST_MODE = 'true';
process.env.NODE_ENV = 'test';

vi.mock('express-rate-limit', () => ({ default: () => (_req: any, _res: any, next: any) => next() }));
vi.mock('firebase-admin/app', () => ({ initializeApp: vi.fn(), getApps: () => [{}] }));
vi.mock('firebase-admin/app-check', () => ({ getAppCheck: () => ({ verifyToken: vi.fn() }) }));
vi.mock('firebase-admin/auth', () => ({
  getAuth: () => ({
    verifyIdToken: async (t: string) => ({ uid: t, email: `${t}@test.dev`, role: t === 'owner_1' ? 'platform_owner' : undefined }),
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

const OWNER = 'owner_1';
const NOT_ADMIN = 'random_person';
const auth = (uid: string) => ({ Authorization: `Bearer ${uid}` });

beforeEach(() => resetStore());

describe('POST /api/admin/incidents', () => {
  it('requires admin', async () => {
    const res = await request(app).post('/api/admin/incidents').set(auth(NOT_ADMIN)).send({ title: 'Something broke', description: 'Details', severity: 'high' });
    expect(res.status).toBe(500);
  });

  it('rejects a missing title/description or an invalid severity', async () => {
    expect((await request(app).post('/api/admin/incidents').set(auth(OWNER)).send({ description: 'Details', severity: 'high' })).status).toBe(400);
    expect((await request(app).post('/api/admin/incidents').set(auth(OWNER)).send({ title: 'X', severity: 'high' })).status).toBe(400);
    expect((await request(app).post('/api/admin/incidents').set(auth(OWNER)).send({ title: 'X', description: 'Y', severity: 'catastrophic' })).status).toBe(400);
  });

  it('creates a real incident with an initial timeline entry and logs the admin action', async () => {
    const res = await request(app).post('/api/admin/incidents').set(auth(OWNER)).send({
      title: 'Twilio SMS delivery delayed', description: 'Guardian alerts arriving 10+ minutes late', severity: 'high', relatedArea: 'sms',
    });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('open');
    expect(res.body.createdByEmail).toBe('owner_1@test.dev');
    expect(res.body.timeline).toHaveLength(1);
    expect(res.body.timeline[0].status).toBe('open');

    const logs = await request(app).get('/api/admin/audit-logs').set(auth(OWNER));
    expect(logs.body.logs.find((l: any) => l.action === 'create_incident')).toBeTruthy();
  });
});

describe('GET /api/admin/incidents', () => {
  it('requires admin', async () => {
    const res = await request(app).get('/api/admin/incidents').set(auth(NOT_ADMIN));
    expect(res.status).toBe(500);
  });

  it('lists created incidents newest first', async () => {
    await request(app).post('/api/admin/incidents').set(auth(OWNER)).send({ title: 'First', description: 'D1', severity: 'low' });
    await request(app).post('/api/admin/incidents').set(auth(OWNER)).send({ title: 'Second', description: 'D2', severity: 'critical' });
    const res = await request(app).get('/api/admin/incidents').set(auth(OWNER));
    expect(res.status).toBe(200);
    expect(res.body.incidents).toHaveLength(2);
    expect(res.body.incidents[0].title).toBe('Second');
  });
});

describe('POST /api/admin/incidents/:id/update', () => {
  it('requires admin', async () => {
    const created = await request(app).post('/api/admin/incidents').set(auth(OWNER)).send({ title: 'Test incident', description: 'Y', severity: 'low' });
    const res = await request(app).post(`/api/admin/incidents/${created.body.id}/update`).set(auth(NOT_ADMIN)).send({ note: 'Looking into it' });
    expect(res.status).toBe(500);
  });

  it('404s for a nonexistent incident', async () => {
    const res = await request(app).post('/api/admin/incidents/does_not_exist/update').set(auth(OWNER)).send({ note: 'Looking into it' });
    expect(res.status).toBe(404);
  });

  it('rejects an update with no note', async () => {
    const created = await request(app).post('/api/admin/incidents').set(auth(OWNER)).send({ title: 'Test incident', description: 'Y', severity: 'low' });
    const res = await request(app).post(`/api/admin/incidents/${created.body.id}/update`).set(auth(OWNER)).send({ status: 'investigating' });
    expect(res.status).toBe(400);
  });

  it('appends a timeline entry, changes status/severity, and sets resolvedAt only when resolved', async () => {
    const created = await request(app).post('/api/admin/incidents').set(auth(OWNER)).send({ title: 'Test incident', description: 'Y', severity: 'low' });
    const id = created.body.id;

    const step1 = await request(app).post(`/api/admin/incidents/${id}/update`).set(auth(OWNER)).send({ status: 'investigating', note: 'Looking into it' });
    expect(step1.status).toBe(200);

    let list = await request(app).get('/api/admin/incidents').set(auth(OWNER));
    let inc = list.body.incidents.find((i: any) => i.id === id);
    expect(inc.status).toBe('investigating');
    expect(inc.resolvedAt).toBeNull();
    expect(inc.timeline).toHaveLength(2);

    const step2 = await request(app).post(`/api/admin/incidents/${id}/update`).set(auth(OWNER)).send({ status: 'resolved', severity: 'medium', note: 'Fixed and confirmed' });
    expect(step2.status).toBe(200);

    list = await request(app).get('/api/admin/incidents').set(auth(OWNER));
    inc = list.body.incidents.find((i: any) => i.id === id);
    expect(inc.status).toBe('resolved');
    expect(inc.severity).toBe('medium');
    expect(inc.resolvedAt).not.toBeNull();
    expect(inc.timeline).toHaveLength(3);

    const logs = await request(app).get('/api/admin/audit-logs').set(auth(OWNER));
    const updates = logs.body.logs.filter((l: any) => l.action === 'update_incident');
    expect(updates.length).toBe(2);
  });

  it('a status change back off resolved clears resolvedAt', async () => {
    const created = await request(app).post('/api/admin/incidents').set(auth(OWNER)).send({ title: 'Test incident', description: 'Y', severity: 'low' });
    const id = created.body.id;
    await request(app).post(`/api/admin/incidents/${id}/update`).set(auth(OWNER)).send({ status: 'resolved', note: 'Fixed' });
    await request(app).post(`/api/admin/incidents/${id}/update`).set(auth(OWNER)).send({ status: 'investigating', note: 'Recurred' });

    const list = await request(app).get('/api/admin/incidents').set(auth(OWNER));
    const inc = list.body.incidents.find((i: any) => i.id === id);
    expect(inc.status).toBe('investigating');
    expect(inc.resolvedAt).toBeNull();
  });
});
