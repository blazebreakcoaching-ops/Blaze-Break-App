import { describe, it, expect, beforeEach, vi } from 'vitest';

// Route tests for GET /api/org/:orgId/manager-coach - Nova Manager Coach.
// The point of these: the k-anonymity gate (identical to every other
// aggregate org endpoint), that real signals - not fabricated ones -
// reach the model, that the daily quota is enforced, and that a failing
// model call degrades to a clean error rather than a crash.
const h = vi.hoisted(() => {
  process.env.TEST_MODE = 'true';
  process.env.NODE_ENV = 'test';
  process.env.GEMINI_API_KEY = 'test-key-not-a-placeholder';
  return {
    generateContent: vi.fn(async (_req: any) => ({ text: JSON.stringify({ suggestions: ['Check in with the team about workload this week.'] }) })),
  };
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
vi.mock('@google/genai', () => ({
  GoogleGenAI: class { models = { generateContent: h.generateContent }; live = { connect: vi.fn() }; },
  Type: { OBJECT: 'OBJECT', STRING: 'STRING', ARRAY: 'ARRAY', NUMBER: 'NUMBER' },
  Modality: { AUDIO: 'AUDIO', TEXT: 'TEXT' },
}));

import request from 'supertest';
import { app } from './server';
import { seedDoc, resetStore } from './test/fake-firestore';

const ORG = 'org_1';
const ADMIN = 'admin_uid';
const auth = (uid: string) => ({ Authorization: `Bearer ${uid}` });

function seedOrg(threshold: number, consentingCount: number) {
  const memberUids = [ADMIN, ...Array.from({ length: consentingCount }, (_, i) => `m_${i}`)];
  seedDoc(`organisations/${ORG}`, { adminUids: [ADMIN], memberUids, privacyThreshold: threshold });
  for (let i = 0; i < consentingCount; i++) {
    seedDoc(`users/m_${i}`, { shareAnonymizedDataWithOrg: true });
  }
}

beforeEach(() => {
  resetStore();
  h.generateContent.mockClear();
  h.generateContent.mockImplementation(async () => ({ text: JSON.stringify({ suggestions: ['Check in with the team about workload this week.'] }) }));
});

describe('GET /api/org/:orgId/manager-coach — access control', () => {
  it('requires authentication', async () => {
    seedOrg(3, 3);
    expect((await request(app).get(`/api/org/${ORG}/manager-coach`)).status).toBe(401);
  });

  it('forbids a non-admin of the org', async () => {
    seedOrg(3, 3);
    const res = await request(app).get(`/api/org/${ORG}/manager-coach`).set(auth('random_person'));
    expect(res.status).toBe(403);
  });
});

describe('GET /api/org/:orgId/manager-coach — k-anonymity gate', () => {
  it('locks and never calls the model below the consenting-member threshold', async () => {
    seedOrg(5, 2);
    const res = await request(app).get(`/api/org/${ORG}/manager-coach`).set(auth(ADMIN));
    expect(res.status).toBe(200);
    expect(res.body.locked).toBe(true);
    expect(res.body.suggestions).toEqual([]);
    expect(h.generateContent).not.toHaveBeenCalled();
  });

  it('unlocks once enough members consent, and returns the real model suggestions', async () => {
    seedOrg(3, 3);
    const res = await request(app).get(`/api/org/${ORG}/manager-coach`).set(auth(ADMIN));
    expect(res.status).toBe(200);
    expect(res.body.locked).toBe(false);
    expect(res.body.suggestions).toEqual(['Check in with the team about workload this week.']);
  });

  it('feeds only real, aggregate signals to the model — never a named individual', async () => {
    seedOrg(3, 3);
    await request(app).get(`/api/org/${ORG}/manager-coach`).set(auth(ADMIN));
    const callArg = h.generateContent.mock.calls[0][0];
    expect(callArg.contents).toContain('Engagement this week');
    expect(callArg.contents).not.toMatch(/m_0|m_1|m_2/); // no member uid ever reaches the prompt
  });
});

// This surface previously had no safety floor at all, unlike every
// conversational surface. It never sees an individual's own words - only
// pre-aggregated team numbers - so there's no message to read distress out
// of and the crisis-line pointer the other one-shot generators' safety
// floor gives doesn't apply here. What this floor guards against instead:
// presenting an aggregate as a clinical judgement, or nudging a manager to
// act on a specific unnamed person from a team average.
describe('GET /api/org/:orgId/manager-coach — safety floor', () => {
  it('always includes the safety floor in the prompt sent to the model', async () => {
    seedOrg(3, 3);
    await request(app).get(`/api/org/${ORG}/manager-coach`).set(auth(ADMIN));
    const callArg = h.generateContent.mock.calls[0][0];
    expect(callArg.contents).toContain('Do not make medical or clinical claims');
    expect(callArg.contents).toContain('real HR, EAP, or safeguarding process');
  });

  it('forbids treating an aggregate number as grounds to single out an individual', async () => {
    seedOrg(3, 3);
    await request(app).get(`/api/org/${ORG}/manager-coach`).set(auth(ADMIN));
    const callArg = h.generateContent.mock.calls[0][0];
    expect(callArg.contents).toContain('Never suggest the manager try to identify, single out, or personally intervene');
  });
});

describe('GET /api/org/:orgId/manager-coach — quota and failure handling', () => {
  it('enforces the daily quota once exhausted', async () => {
    seedOrg(3, 3);
    for (let i = 0; i < 3; i++) {
      const res = await request(app).get(`/api/org/${ORG}/manager-coach`).set(auth(ADMIN));
      expect(res.status).toBe(200);
    }
    const res = await request(app).get(`/api/org/${ORG}/manager-coach`).set(auth(ADMIN));
    expect(res.status).toBe(429);
    expect(res.body.code).toBe('capability_limit_reached');
  });

  it('reports a clean error, not a crash, when the model call throws', async () => {
    seedOrg(3, 3);
    h.generateContent.mockImplementationOnce(async () => { throw new Error('upstream down'); });
    const res = await request(app).get(`/api/org/${ORG}/manager-coach`).set(auth(ADMIN));
    expect(res.status).toBe(500);
    expect(res.body.error).toBeTruthy();
  });
});

// Negative coverage: this is one-shot manager coaching built entirely from
// k-anonymised aggregate signals, never an individual's content - there's
// no single user's style preference that could even apply to an aggregate,
// and no question is asked to anyone in it. A deliberate exclusion from
// both the questioning-cadence and style-tone modules (see the AUDIT
// comment above getNovaStyleToneAddendum in server.ts), not an oversight.
describe('GET /api/org/:orgId/manager-coach — style is never applied here', () => {
  it("does not apply even the requesting admin's own chosen style", async () => {
    seedOrg(3, 3);
    seedDoc(`users/${ADMIN}/user_stats/core`, { profile: { questioningStyle: 'board_member' } });
    const res = await request(app).get(`/api/org/${ORG}/manager-coach`).set(auth(ADMIN));
    expect(res.status).toBe(200);
    const promptText = h.generateContent.mock.calls[0][0].contents as string;
    expect(promptText).not.toContain('NOVA QUESTIONING STYLE');
    expect(promptText).not.toContain('NOVA STYLE');
    expect(promptText).not.toContain('TONE: BOARD MEMBER');
    expect(promptText).not.toContain('STYLE: BOARD MEMBER');
  });
});
