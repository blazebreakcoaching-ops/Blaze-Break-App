import { describe, it, expect, beforeEach, vi } from 'vitest';

// Route coverage for Phase 5K's offer_practical_assistance tool, wired into
// POST /api/nova/chat exactly like offer_guardian_support (see
// guardian-support-invitation.route.test.ts, which this mirrors). Unlike
// Guardian Support this tool has no feature flag of its own - see
// nova-practical-assistance-offer.ts's header comment for why - so these
// tests prove pure argument validation only, and that the tool never
// writes anywhere or starts a real proposal as a side effect of firing.
const h = vi.hoisted(() => {
  process.env.TEST_MODE = 'true';
  process.env.NODE_ENV = 'test';
  process.env.GEMINI_API_KEY = 'test-key-not-a-placeholder';
  return {
    sendMessage: vi.fn(async () => ({ text: 'ok', functionCalls: [] })),
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
  GoogleGenAI: class {
    chats = { create: () => ({ sendMessage: h.sendMessage }) };
    models = { generateContent: vi.fn() };
    live = { connect: vi.fn() };
  },
  Type: { OBJECT: 'OBJECT', STRING: 'STRING', ARRAY: 'ARRAY', NUMBER: 'NUMBER' },
  Modality: { AUDIO: 'AUDIO', TEXT: 'TEXT' },
}));

import request from 'supertest';
import { app } from './server';
import { resetStore, allPaths } from './test/fake-firestore';

const USER = 'user_owner';
const auth = (uid: string) => ({ Authorization: `Bearer ${uid}` });

// Same two-call shape every other self-gating tool's own tests use: the
// model calls offer_practical_assistance once, then settles on a normal
// text reply after the tool response round-trips.
function mockOfferPracticalAssistanceCall(reason: string) {
  h.sendMessage.mockImplementationOnce(async () => ({
    text: '',
    functionCalls: [{ id: 'call_1', name: 'offer_practical_assistance', args: { reason } }],
  }));
  h.sendMessage.mockImplementationOnce(async () => ({ text: 'Want to walk through what\'s on your plate?', functionCalls: [] }));
}

beforeEach(() => {
  resetStore();
  h.sendMessage.mockClear();
  h.sendMessage.mockImplementation(async () => ({ text: 'ok', functionCalls: [] }));
});

describe('POST /api/nova/chat — offer_practical_assistance tool', () => {
  it('offers the card when the model provides a real, specific reason', async () => {
    mockOfferPracticalAssistanceCall('User said they are behind on three deadlines and asked for help organising them.');
    const res = await request(app).post('/api/nova/chat').set(auth(USER)).send({ message: 'I am so behind on everything.' });
    expect(res.status).toBe(200);
    const call = res.body.planTrace.find((t: any) => t.tool === 'offer_practical_assistance');
    expect(call).toBeTruthy();
    expect(call.result.offered).toBe(true);
    expect(call.result.reason).toBe('User said they are behind on three deadlines and asked for help organising them.');
  });

  it('refuses a missing/empty reason - never a bare true/false with no grounding', async () => {
    mockOfferPracticalAssistanceCall('');
    const res = await request(app).post('/api/nova/chat').set(auth(USER)).send({ message: 'hello' });
    const call = res.body.planTrace.find((t: any) => t.tool === 'offer_practical_assistance');
    expect(call.result.offered).toBe(false);
    expect(call.result.error).toBeTruthy();
  });

  it('refuses an overlong reason', async () => {
    mockOfferPracticalAssistanceCall('x'.repeat(201));
    const res = await request(app).post('/api/nova/chat').set(auth(USER)).send({ message: 'hello' });
    const call = res.body.planTrace.find((t: any) => t.tool === 'offer_practical_assistance');
    expect(call.result.offered).toBe(false);
    expect(call.result.error).toBeTruthy();
  });

  it('the tool never writes to Firestore or starts a real proposal - it only returns a boolean-shaped suggestion', async () => {
    mockOfferPracticalAssistanceCall('User asked for help organising what is on their plate.');
    await request(app).post('/api/nova/chat').set(auth(USER)).send({ message: 'Can you help me get organised?' });
    const written = allPaths().filter((p) => p.includes('calendar_protection') || p.includes('task_deferral') || p.includes('invisible_load'));
    expect(written).toEqual([]);
  });
});
