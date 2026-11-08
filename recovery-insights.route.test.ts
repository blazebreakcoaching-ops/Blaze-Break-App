import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'fs';

// Customer Intelligence Layer: GET /api/recovery/insights and
// POST /api/recovery/insights/explain. Proves backend-enforced ownership,
// consent-gated Nova use, honest unavailable states, and that company
// reporting never reads personal derived summaries.
const h = vi.hoisted(() => {
  process.env.TEST_MODE = 'true';
  process.env.NODE_ENV = 'test';
  process.env.GEMINI_API_KEY = 'test-key-not-a-placeholder';
  return { generateContent: vi.fn(async (_req: any) => ({ text: 'Your energy has dipped. Try one protected break a day this week.' })) };
});

vi.mock('express-rate-limit', () => ({ default: () => (_req: any, _res: any, next: any) => next(), ipKeyGenerator: (ip: string) => ip }));
vi.mock('firebase-admin/app', () => ({ initializeApp: vi.fn(), getApps: () => [{}] }));
vi.mock('firebase-admin/app-check', () => ({ getAppCheck: () => ({ verifyToken: vi.fn() }) }));
vi.mock('firebase-admin/auth', () => ({ getAuth: () => ({ verifyIdToken: async (t: string) => ({ uid: t, email: `${t}@test.dev` }) }) }));
vi.mock('firebase-admin/firestore', async () => {
  const fake = await import('./test/fake-firestore');
  return { getFirestore: () => fake.fakeDb, FieldValue: fake.FakeFieldValue };
});
vi.mock('twilio', () => ({ default: () => ({ messages: { create: vi.fn() } }) }));
vi.mock('@google/genai', () => ({
  GoogleGenAI: class {
    chats = { create: () => ({ sendMessage: vi.fn() }) };
    models = { generateContent: h.generateContent };
    live = { connect: vi.fn() };
  },
  Type: { OBJECT: 'OBJECT', STRING: 'STRING', ARRAY: 'ARRAY', NUMBER: 'NUMBER', BOOLEAN: 'BOOLEAN' },
  Modality: { AUDIO: 'AUDIO', TEXT: 'TEXT' },
}));

import request from 'supertest';
import { app } from './server';
import { seedDoc, resetStore, getDocRaw } from './test/fake-firestore';

const auth = (uid: string) => ({ Authorization: `Bearer ${uid}` });
const recent = () => new Date(Date.now() - 3600_000).toISOString();
const summary = (type: string, over: Record<string, unknown> = {}) => ({
  type, status: 'available', value: 40, direction: 'falling', confidenceLevel: 'medium', sourceCount: 8,
  calculatedAt: recent(), explanation: 'Things are stable and your recovery actions are working.', ...over,
});
const allowAll = { allowRecoveryDebt: true, allowEnergyTrend: true, allowMoodTrend: true };

beforeEach(() => {
  resetStore();
  h.generateContent.mockClear();
});

describe('GET /api/recovery/insights - ownership and honesty', () => {
  it('requires sign-in', async () => {
    expect((await request(app).get('/api/recovery/insights')).status).toBe(401);
  });

  it('returns only the caller\'s own insights; a uid in the query is ignored', async () => {
    seedDoc('users/alice/derived/energy_trend', summary('energy_trend', { value: 81, direction: 'rising' }));
    seedDoc('users/bob/derived/energy_trend', summary('energy_trend', { value: 12 }));
    const res = await request(app).get('/api/recovery/insights?uid=alice&userId=alice').set(auth('bob'));
    expect(res.status).toBe(200);
    const energy = res.body.insights.find((i: any) => i.type === 'energy_trend');
    expect(energy.value).toBe(12);
    expect(JSON.stringify(res.body)).not.toContain('81');
  });

  it('never repeats the stored reassuring text: a falling trend is described as falling', async () => {
    seedDoc('users/u1/derived/mood_trend', summary('mood_trend'));
    const res = await request(app).get('/api/recovery/insights').set(auth('u1'));
    const mood = res.body.insights.find((i: any) => i.type === 'mood_trend');
    expect(mood.explanation).toMatch(/going down/);
    expect(mood.explanation).not.toMatch(/stable|working/i);
    expect(mood.tone).toBe('worse');
  });

  it('shows "not calculated", "not enough data" and "stale" honestly, with no numbers', async () => {
    seedDoc('users/u1/derived/mood_trend', summary('mood_trend', { status: 'not_enough_data', value: 55 }));
    seedDoc('users/u1/derived/recovery_debt', summary('recovery_debt', { calculatedAt: '2025-01-01T00:00:00.000Z' }));
    const res = await request(app).get('/api/recovery/insights').set(auth('u1'));
    const byType = Object.fromEntries(res.body.insights.map((i: any) => [i.type, i]));
    expect(byType.energy_trend).toMatchObject({ state: 'not_calculated', value: null });
    expect(byType.mood_trend).toMatchObject({ state: 'not_enough_data', value: null });
    expect(byType.recovery_debt).toMatchObject({ state: 'stale', value: null });
    expect(res.body.insights.map((i: any) => i.type)).not.toContain('recovery_velocity');
  });

  it('reports which insights Nova may use, mirroring the permission switches', async () => {
    seedDoc('users/u1/nova_permissions/current', { allowEnergyTrend: true, allowMoodTrend: false });
    const res = await request(app).get('/api/recovery/insights').set(auth('u1'));
    expect(res.body.novaMayUse).toEqual({ recovery_debt: false, energy_trend: true, mood_trend: false });
  });
});

describe('POST /api/recovery/insights/explain - consent-gated Nova', () => {
  it('without consent, Nova is never called', async () => {
    seedDoc('users/u1/derived/energy_trend', summary('energy_trend'));
    const res = await request(app).post('/api/recovery/insights/explain').set(auth('u1')).send({});
    expect(res.body).toMatchObject({ explanation: null, reason: 'no_consent' });
    expect(h.generateContent).not.toHaveBeenCalled();
  });

  it('with consent but no usable data, Nova is never called', async () => {
    seedDoc('users/u1/nova_permissions/current', allowAll);
    seedDoc('users/u1/derived/energy_trend', summary('energy_trend', { status: 'not_enough_data' }));
    const res = await request(app).post('/api/recovery/insights/explain').set(auth('u1')).send({});
    expect(res.body).toMatchObject({ explanation: null, reason: 'not_enough_data' });
    expect(h.generateContent).not.toHaveBeenCalled();
  });

  it('Nova receives ONLY consented, available insights - and no stored free text', async () => {
    seedDoc('users/u1/nova_permissions/current', { allowEnergyTrend: true, allowMoodTrend: false, allowRecoveryDebt: true });
    seedDoc('users/u1/derived/energy_trend', summary('energy_trend'));
    seedDoc('users/u1/derived/mood_trend', summary('mood_trend', { value: 77 }));
    seedDoc('users/u1/derived/recovery_debt', summary('recovery_debt', { status: 'not_enough_data' }));
    const res = await request(app).post('/api/recovery/insights/explain').set(auth('u1')).send({});
    expect(res.status).toBe(200);
    expect(res.body.used).toEqual(['energy_trend']);
    const prompt: string = h.generateContent.mock.calls[0][0].contents;
    expect(prompt).toContain('Energy:');
    expect(prompt).not.toMatch(/Mood:|Pressure load:|77/);
    expect(prompt).not.toContain('recovery actions are working');
    expect(prompt).toMatch(/do not invent/i);
  });

  it('is honest when Nova is not configured', async () => {
    const saved = process.env.GEMINI_API_KEY;
    process.env.GEMINI_API_KEY = 'MY_GEMINI_API_KEY';
    seedDoc('users/u1/nova_permissions/current', allowAll);
    seedDoc('users/u1/derived/energy_trend', summary('energy_trend'));
    const res = await request(app).post('/api/recovery/insights/explain').set(auth('u1')).send({});
    process.env.GEMINI_API_KEY = saved;
    expect(res.status).toBe(503);
    expect(res.body.error).toMatch(/still accurate/);
  });

  it('rejects a request body (no client-supplied data or uid can steer Nova)', async () => {
    const res = await request(app).post('/api/recovery/insights/explain').set(auth('u1')).send({ uid: 'alice' });
    expect(res.status).toBe(400);
  });
});

describe('recalculation writes generated, accurate explanations', () => {
  it('a falling energy pattern is stored as falling, not as "stable"', async () => {
    seedDoc('users/u1/nova_permissions/current', allowAll);
    const day = 86_400_000;
    [9, 8, 8, 4, 3, 2].forEach((energy, i) => {
      seedDoc(`users/u1/checkins/c${i}`, { energyLevel: energy, stressLoad: 5, createdAt: new Date(Date.now() - (10 - i) * day).toISOString() });
    });
    const res = await request(app).post('/api/recovery/recalculate').set(auth('u1')).send({});
    expect(res.status).toBe(200);
    const stored = getDocRaw('users/u1/derived/energy_trend')!;
    expect(stored.direction).toBe('falling');
    expect(stored.explanation).toMatch(/going down/);
    expect(stored.explanation).not.toMatch(/stable|consistent progress/i);
  });
});

describe('company reporting never reads personal derived summaries', () => {
  it('no /api/org route handler references users/{uid}/derived', () => {
    const source = fs.readFileSync('server.ts', 'utf8');
    const routeStarts = [...source.matchAll(/\napp\.(get|post|patch|put|delete)\(\s*"([^"]+)"/g)];
    routeStarts.forEach((m, i) => {
      if (!m[2].startsWith('/api/org')) return;
      const body = source.slice(m.index!, routeStarts[i + 1]?.index ?? source.length);
      expect(body, m[2]).not.toMatch(/collection\(["']derived["']\)/);
    });
  });
});

describe('Nova explains insights in the customer\'s chosen language', () => {
  it('uses the stored language preference; a body cannot set it', async () => {
    seedDoc('users/u1/nova_permissions/current', allowAll);
    seedDoc('users/u1/preferences/ui', { localePreference: 'fr' });
    seedDoc('users/u1/derived/energy_trend', summary('energy_trend'));
    const res = await request(app).post('/api/recovery/insights/explain').set(auth('u1')).send({});
    expect(res.status).toBe(200);
    const prompt: string = h.generateContent.mock.calls[0][0].contents;
    expect(prompt).toContain('Reply in French (Français)');
    expect(prompt).toMatch(/do not invent/i);
    expect((await request(app).post('/api/recovery/insights/explain').set(auth('u1')).send({ language: 'ar' })).status).toBe(400);
  });

  it('English (or no preference) adds no language instruction', async () => {
    seedDoc('users/u2/nova_permissions/current', allowAll);
    seedDoc('users/u2/derived/energy_trend', summary('energy_trend'));
    await request(app).post('/api/recovery/insights/explain').set(auth('u2')).send({});
    expect(h.generateContent.mock.calls[0][0].contents).not.toContain('Reply in');
  });
});
