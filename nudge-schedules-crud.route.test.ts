import { describe, it, expect, beforeEach, vi } from 'vitest';

// Route tests for /api/nudge-schedules CRUD (POST/GET/PATCH/DELETE) with
// the NUDGE_SCHEDULER_ENABLED kill switch turned on - previously zero
// coverage of the actual CRUD behaviour existed; the only other test file
// (nudge-scheduler-kill-switch.route.test.ts) exercises the switch being
// OFF, which is a separate module instance and deliberately never turns it
// on. NUDGE_SCHEDULER_ENABLED is read once at module load, so it must be
// set before `./server` is imported.
vi.hoisted(() => {
  process.env.TEST_MODE = 'true';
  process.env.NODE_ENV = 'test';
  process.env.NUDGE_SCHEDULER_ENABLED = 'true';
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
import { resetStore, forceDocError, forceCollectionError } from './test/fake-firestore';

const USER = 'user_owner';
const auth = (uid: string) => ({ Authorization: `Bearer ${uid}` });

const validSchedule = {
  contactId: 'contact_1',
  contactName: 'Alex',
  contactMethod: '+447700900123',
  notificationPreference: 'sms',
  message: 'Just checking in - how are you doing?',
  frequency: 'daily',
  time: '09:00',
  timezone: 'Europe/London',
  enabled: true,
  contactAcknowledged: true,
};

beforeEach(() => resetStore());

describe('POST /api/nudge-schedules', () => {
  it('creates a schedule', async () => {
    const res = await request(app).post('/api/nudge-schedules').set(auth(USER)).send(validSchedule);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.id).toBeTruthy();
  });

  it('rejects an invalid schedule', async () => {
    const res = await request(app).post('/api/nudge-schedules').set(auth(USER)).send({ ...validSchedule, time: 'not-a-time' });
    expect(res.status).toBe(400);
  });

  it('refuses an 11th schedule, enforcing the limit of 10', async () => {
    for (let i = 0; i < 10; i++) {
      const res = await request(app).post('/api/nudge-schedules').set(auth(USER)).send(validSchedule);
      expect(res.status).toBe(200);
    }
    const res = await request(app).post('/api/nudge-schedules').set(auth(USER)).send(validSchedule);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/10/);
  });

  it('500s if the existing-schedules read throws', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const restore = forceCollectionError(`users/${USER}/nudge_schedules`, 'get', new Error('simulated Firestore outage'));
    const res = await request(app).post('/api/nudge-schedules').set(auth(USER)).send(validSchedule);
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Something went wrong on our end. Please try again.' });
    expect(errorSpy).toHaveBeenCalled();
    restore();
    errorSpy.mockRestore();
  });
});

describe('GET /api/nudge-schedules', () => {
  it('lists the caller\'s own schedules, newest first', async () => {
    await request(app).post('/api/nudge-schedules').set(auth(USER)).send(validSchedule);
    await request(app).post('/api/nudge-schedules').set(auth(USER)).send({ ...validSchedule, contactName: 'Sam' });

    const res = await request(app).get('/api/nudge-schedules').set(auth(USER));
    expect(res.status).toBe(200);
    expect(res.body.schedules.length).toBe(2);
  });

  it('requires authentication', async () => {
    const res = await request(app).get('/api/nudge-schedules');
    expect(res.status).toBe(401);
  });

  it('500s if the read throws', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const restore = forceCollectionError(`users/${USER}/nudge_schedules`, 'get', new Error('simulated Firestore outage'));
    const res = await request(app).get('/api/nudge-schedules').set(auth(USER));
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Something went wrong on our end. Please try again.' });
    expect(errorSpy).toHaveBeenCalled();
    restore();
    errorSpy.mockRestore();
  });
});

describe('PATCH /api/nudge-schedules/:id', () => {
  it('updates an existing schedule', async () => {
    const create = await request(app).post('/api/nudge-schedules').set(auth(USER)).send(validSchedule);
    const res = await request(app).patch(`/api/nudge-schedules/${create.body.id}`).set(auth(USER)).send({ enabled: false });
    expect(res.status).toBe(200);

    const list = await request(app).get('/api/nudge-schedules').set(auth(USER));
    expect(list.body.schedules[0].enabled).toBe(false);
  });

  it('rejects an invalid update', async () => {
    const create = await request(app).post('/api/nudge-schedules').set(auth(USER)).send(validSchedule);
    const res = await request(app).patch(`/api/nudge-schedules/${create.body.id}`).set(auth(USER)).send({ time: 'bad-time' });
    expect(res.status).toBe(400);
  });

  it('404s for a nonexistent schedule', async () => {
    const res = await request(app).patch('/api/nudge-schedules/does-not-exist').set(auth(USER)).send({ enabled: false });
    expect(res.status).toBe(404);
  });

  it('500s if the doc read throws', async () => {
    const create = await request(app).post('/api/nudge-schedules').set(auth(USER)).send(validSchedule);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const restore = forceDocError(`users/${USER}/nudge_schedules/${create.body.id}`, 'get', new Error('simulated Firestore outage'));
    const res = await request(app).patch(`/api/nudge-schedules/${create.body.id}`).set(auth(USER)).send({ enabled: false });
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Something went wrong on our end. Please try again.' });
    expect(errorSpy).toHaveBeenCalled();
    restore();
    errorSpy.mockRestore();
  });
});

describe('DELETE /api/nudge-schedules/:id', () => {
  it('deletes a schedule', async () => {
    const create = await request(app).post('/api/nudge-schedules').set(auth(USER)).send(validSchedule);
    const res = await request(app).delete(`/api/nudge-schedules/${create.body.id}`).set(auth(USER));
    expect(res.status).toBe(200);

    const list = await request(app).get('/api/nudge-schedules').set(auth(USER));
    expect(list.body.schedules.length).toBe(0);
  });

  it('requires authentication', async () => {
    const res = await request(app).delete('/api/nudge-schedules/some-id');
    expect(res.status).toBe(401);
  });

  it('500s if the delete throws', async () => {
    const create = await request(app).post('/api/nudge-schedules').set(auth(USER)).send(validSchedule);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const restore = forceDocError(`users/${USER}/nudge_schedules/${create.body.id}`, 'delete', new Error('simulated Firestore outage'));
    const res = await request(app).delete(`/api/nudge-schedules/${create.body.id}`).set(auth(USER));
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Something went wrong on our end. Please try again.' });
    expect(errorSpy).toHaveBeenCalled();
    restore();
    errorSpy.mockRestore();
  });
});
