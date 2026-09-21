import { describe, it, expect, beforeEach, vi } from 'vitest';

// Route tests for GET /api/admin/cost-usage - the lightweight operating
// visibility endpoint built from the usage_counters this batch of work
// started writing. Confirms it's admin-only, aggregates correctly across
// multiple users/days via the collection-group query, and stays labelled
// as an estimate rather than implying it's live provider billing data.
const h = vi.hoisted(() => {
  process.env.TEST_MODE = 'true';
  process.env.NODE_ENV = 'test';
  return {};
});

vi.mock('express-rate-limit', () => ({ default: () => (_req: any, _res: any, next: any) => next() }));
vi.mock('firebase-admin/app', () => ({ initializeApp: vi.fn(), getApps: () => [{}] }));
vi.mock('firebase-admin/app-check', () => ({ getAppCheck: () => ({ verifyToken: vi.fn() }) }));
vi.mock('firebase-admin/auth', () => ({
  getAuth: () => ({ verifyIdToken: async (t: string) => ({ uid: t, email: `${t}@test.dev`, role: t === 'admin_user' ? 'platform_owner' : undefined }) }),
}));
vi.mock('firebase-admin/firestore', async () => {
  const fake = await import('./test/fake-firestore');
  return { getFirestore: () => fake.fakeDb, FieldValue: fake.FakeFieldValue };
});
vi.mock('twilio', () => ({ default: () => ({ messages: { create: vi.fn() } }) }));
vi.mock('@google/genai', () => ({
  GoogleGenAI: class { chats = { create: vi.fn() }; models = { generateContent: vi.fn() }; live = { connect: vi.fn() }; },
  Type: {}, Modality: {},
}));

import request from 'supertest';
import { app } from './server';
import { seedDoc, resetStore } from './test/fake-firestore';

const ADMIN = 'admin_user';
const USER = 'user_normal';
const auth = (uid: string) => ({ Authorization: `Bearer ${uid}` });

beforeEach(() => resetStore());

describe('GET /api/admin/cost-usage', () => {
  it('requires authentication', async () => {
    expect((await request(app).get('/api/admin/cost-usage')).status).toBe(401);
  });

  it('refuses a non-admin caller', async () => {
    expect((await request(app).get('/api/admin/cost-usage').set(auth(USER))).status).toBe(403);
  });

  it('reports zero usage with no data seeded, always labelled an estimate', async () => {
    const res = await request(app).get('/api/admin/cost-usage').set(auth(ADMIN));
    expect(res.status).toBe(200);
    expect(res.body.isEstimate).toBe(true);
    expect(res.body.usage).toEqual({ novaTextCount: 0, novaVoiceCount: 0, diagnoseCount: 0, smsSegmentCount: 0 });
    expect(res.body.estimatedCostUsd.totalUsd).toBe(0);
  });

  it('aggregates usage_counters across multiple users within the lookback window', async () => {
    const today = new Date().toISOString();
    seedDoc('users/u1/usage_counters/day1', { nova_text: 10, diagnose: 2, updatedAt: today });
    seedDoc('users/u2/usage_counters/day1', { nova_text: 5, nova_voice: 1, smsCount: 3, updatedAt: today });
    const res = await request(app).get('/api/admin/cost-usage').set(auth(ADMIN));
    expect(res.body.usage).toEqual({ novaTextCount: 15, novaVoiceCount: 1, diagnoseCount: 2, smsSegmentCount: 3 });
    expect(res.body.estimatedCostUsd.totalUsd).toBeGreaterThan(0);
  });

  it('excludes usage_counters docs from outside the lookback window', async () => {
    seedDoc('users/u1/usage_counters/old', { nova_text: 999, updatedAt: '2000-01-01T00:00:00.000Z' });
    const res = await request(app).get('/api/admin/cost-usage').set(auth(ADMIN));
    expect(res.body.usage.novaTextCount).toBe(0);
  });

  // byTier is the B2C pricing brief's "Nova Live usage by tier" analytics
  // ask - the one usage signal that's genuinely real without a live
  // payment provider, since it's derived from each user's actual
  // server-authoritative entitlement record.
  it('breaks Nova usage down by the actual plan each uid is entitled to', async () => {
    const today = new Date().toISOString();
    seedDoc('users/free_user/usage_counters/day1', { nova_text: 10, nova_voice: 1, updatedAt: today });
    seedDoc('users/paid_user/entitlements/status', { plan: 'performance', status: 'active' });
    seedDoc('users/paid_user/usage_counters/day1', { nova_text: 20, nova_voice: 3, updatedAt: today });
    seedDoc(`users/paid_user/usage_counters/month-${today.slice(0, 7)}`, { nova_voice_minutes: 45, updatedAt: today });

    const res = await request(app).get('/api/admin/cost-usage').set(auth(ADMIN));
    expect(res.body.byTier.free).toEqual({ novaTextCount: 10, novaVoiceCount: 1, novaVoiceMinutes: 0 });
    expect(res.body.byTier.performance).toEqual({ novaTextCount: 20, novaVoiceCount: 3, novaVoiceMinutes: 45 });
    expect(res.body.byTier.executive).toEqual({ novaTextCount: 0, novaVoiceCount: 0, novaVoiceMinutes: 0 });
  });

  // planChanges is sourced from the existing admin_audit_logs
  // grant_entitlement entries (POST /api/admin/users/:uid/entitlement) -
  // the only real "conversion"-adjacent event today, since there is no
  // live checkout. It must say so honestly rather than implying it's
  // real purchase/signup data.
  it('summarises admin-driven plan changes and is explicit about what it is not', async () => {
    await request(app).post('/api/admin/users/u1/entitlement').set(auth(ADMIN)).send({ plan: 'free', status: 'active' });
    await request(app).post('/api/admin/users/u1/entitlement').set(auth(ADMIN)).send({ plan: 'executive', status: 'active' });
    await request(app).post('/api/admin/users/u2/entitlement').set(auth(ADMIN)).send({ plan: 'free', status: 'active' });

    const res = await request(app).get('/api/admin/cost-usage').set(auth(ADMIN));
    expect(res.body.planChanges.upgrade).toBe(1);
    expect(res.body.planChanges.byPlan.executive).toBe(1);
    expect(res.body.planChanges.byPlan.free).toBe(2);
    expect(res.body.planChanges.note).toMatch(/no live checkout/i);
  });
});
