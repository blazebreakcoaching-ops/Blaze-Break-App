import { describe, it, expect, beforeEach, vi } from 'vitest';

// Route tests for Command Centre PR10's three new read-only admin
// endpoints - System Health, the feature-flags list, and the
// cross-org device roster behind Release Centre. Each previously had
// zero coverage (System Health and the feature-flags GET didn't exist
// at all; the device roster only existed per-org, never platform-wide).
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
import { seedDoc, resetStore } from './test/fake-firestore';

const OWNER = 'owner_1';
const NOT_ADMIN = 'random_person';
const auth = (uid: string) => ({ Authorization: `Bearer ${uid}` });

beforeEach(() => resetStore());

describe('GET /api/admin/system-health', () => {
  it('requires admin', async () => {
    const res = await request(app).get('/api/admin/system-health').set(auth(NOT_ADMIN));
    expect(res.status).toBe(500);
  });

  it('reports dependency configuration, kill switches, and static rate limits', async () => {
    const res = await request(app).get('/api/admin/system-health').set(auth(OWNER));
    expect(res.status).toBe(200);
    expect(typeof res.body.dependencies.twilio.configured).toBe('boolean');
    expect(typeof res.body.dependencies.vertex.configured).toBe('boolean');
    expect(Array.isArray(res.body.killSwitches)).toBe(true);
    expect(res.body.killSwitches.find((k: any) => k.id === 'retention_sweep')).toBeTruthy();
    expect(Array.isArray(res.body.rateLimits)).toBe(true);
    expect(res.body.rateLimits.find((r: any) => r.name === 'smsLimiter').max).toBe(10);
  });
});

describe('GET /api/admin/feature-flags', () => {
  it('requires admin', async () => {
    const res = await request(app).get('/api/admin/feature-flags').set(auth(NOT_ADMIN));
    expect(res.status).toBe(500);
  });

  it('lists every flag with its enabled state', async () => {
    seedDoc('public_feature_flags/sso_enforcement', { enabled: true, updatedAt: '2026-01-01T00:00:00.000Z' });
    seedDoc('public_feature_flags/some_other_flag', { enabled: false, updatedAt: '2026-01-02T00:00:00.000Z' });
    const res = await request(app).get('/api/admin/feature-flags').set(auth(OWNER));
    expect(res.status).toBe(200);
    expect(res.body.flags).toHaveLength(2);
    const sso = res.body.flags.find((f: any) => f.id === 'sso_enforcement');
    expect(sso.enabled).toBe(true);
  });

  it('an empty collection returns an empty list, not an error', async () => {
    const res = await request(app).get('/api/admin/feature-flags').set(auth(OWNER));
    expect(res.status).toBe(200);
    expect(res.body.flags).toEqual([]);
  });
});

describe('GET /api/admin/release-centre/devices', () => {
  it('requires admin', async () => {
    const res = await request(app).get('/api/admin/release-centre/devices').set(auth(NOT_ADMIN));
    expect(res.status).toBe(500);
  });

  it('aggregates devices across every organisation with the owning orgId attached', async () => {
    seedDoc('organisations/org_a/devices/device_1', { ownerUid: 'member_a', channel: 'stable', appVersion: '1.0.0', status: 'active', deviceName: 'Alice Laptop' });
    seedDoc('organisations/org_b/devices/device_2', { ownerUid: 'member_b', channel: 'beta', appVersion: '1.1.0', status: 'revoked', deviceName: null });

    const res = await request(app).get('/api/admin/release-centre/devices').set(auth(OWNER));
    expect(res.status).toBe(200);
    expect(res.body.devices).toHaveLength(2);
    const deviceA = res.body.devices.find((d: any) => d.id === 'device_1');
    expect(deviceA.orgId).toBe('org_a');
    expect(deviceA.channel).toBe('stable');
    const deviceB = res.body.devices.find((d: any) => d.id === 'device_2');
    expect(deviceB.orgId).toBe('org_b');
    expect(deviceB.status).toBe('revoked');
  });

  it('returns an empty list when no org has any registered devices', async () => {
    const res = await request(app).get('/api/admin/release-centre/devices').set(auth(OWNER));
    expect(res.status).toBe(200);
    expect(res.body.devices).toEqual([]);
  });
});
