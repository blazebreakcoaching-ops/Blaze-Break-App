import { describe, it, expect, beforeEach, vi } from 'vitest';

// Regression test for a real P0 audit finding: AllyNudgeScheduler is a
// live, cron-driven, unattended system that sends real SMS/WhatsApp to a
// user-chosen contact on a recurring schedule with zero per-send user
// action - functionally the project's own "Tier 3" capability
// (docs/GUARDIAN_SUPPORT_SPEC.md), which that spec declares "permanently
// out of scope... excluded" pending ten named governance workstreams and a
// documented, tested kill-switch, none of which existed. This test proves
// the new NUDGE_SCHEDULER_ENABLED kill switch actually blocks the route in
// its default (unset) state - matching what happens in every real
// deployment until someone explicitly opts in.
vi.hoisted(() => {
  process.env.TEST_MODE = 'true';
  process.env.NODE_ENV = 'test';
  delete process.env.NUDGE_SCHEDULER_ENABLED;
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
import { resetStore } from './test/fake-firestore';

const USER = 'user_owner';
const auth = (uid: string) => ({ Authorization: `Bearer ${uid}` });

beforeEach(() => resetStore());

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

describe('POST /api/nudge-schedules - blocked by default (kill switch off)', () => {
  it('refuses to create a schedule when NUDGE_SCHEDULER_ENABLED is unset, matching every real deployment until someone explicitly opts in', async () => {
    const res = await request(app).post('/api/nudge-schedules').set(auth(USER)).send(validSchedule);
    expect(res.status).toBe(403);
  });

  it('still requires authentication regardless of the kill switch state', async () => {
    const res = await request(app).post('/api/nudge-schedules').send(validSchedule);
    expect(res.status).toBe(401);
  });
});
