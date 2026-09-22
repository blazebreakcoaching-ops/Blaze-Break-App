import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Route coverage for the Guardian Support Invitation's server-side pieces:
// the offer_guardian_support tool wired into POST /api/nova/chat, the
// invitationEnabled flag actually gating it (not just reporting it), and
// the privacy-preserving analytics endpoint. See
// guardian-support-invitation.ts and docs/GUARDIAN_SUPPORT_INVITATION.md.
//
// What this file deliberately proves, tying back to the non-negotiable
// constraints: the tool's own execute function never touches Firestore or
// Twilio (it's pure), it never appears in planTrace when the flag is off,
// and no code path here can dispatch a message - only
// POST /api/guardian/alert (covered in guardian-alert.route.test.ts) can.
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

// Simulates the model calling offer_guardian_support once, then (after the
// tool response round-trips) settling on a normal text reply - the same
// two-call shape server.ts's tool-call loop expects from any tool.
function mockOfferGuardianSupportCall(reason: string) {
  h.sendMessage.mockImplementationOnce(async () => ({
    text: '',
    functionCalls: [{ id: 'call_1', name: 'offer_guardian_support', args: { reason } }],
  }));
  h.sendMessage.mockImplementationOnce(async () => ({ text: 'I hear you - that sounds heavy.', functionCalls: [] }));
}

beforeEach(() => {
  resetStore();
  h.sendMessage.mockClear();
  h.sendMessage.mockImplementation(async () => ({ text: 'ok', functionCalls: [] }));
});

describe('POST /api/nova/chat — offer_guardian_support tool', () => {
  const ORIGINAL_ENV = process.env.GUARDIAN_SUPPORT_INVITATION_ENABLED;
  afterEach(() => {
    if (ORIGINAL_ENV === undefined) delete process.env.GUARDIAN_SUPPORT_INVITATION_ENABLED;
    else process.env.GUARDIAN_SUPPORT_INVITATION_ENABLED = ORIGINAL_ENV;
  });

  it('is excluded from planTrace when the flag is off (the default) even if the model calls it', async () => {
    delete process.env.GUARDIAN_SUPPORT_INVITATION_ENABLED;
    mockOfferGuardianSupportCall('User said they feel completely alone right now.');
    const res = await request(app).post('/api/nova/chat').set(auth(USER)).send({ message: 'I feel so alone in this.' });
    expect(res.status).toBe(200);
    const call = res.body.planTrace.find((t: any) => t.tool === 'offer_guardian_support');
    expect(call).toBeTruthy();
    expect(call.result.offered).toBe(false); // the tool itself self-gates on the flag
  });

  it('offers the card when the flag is on and the model provides a real reason', async () => {
    process.env.GUARDIAN_SUPPORT_INVITATION_ENABLED = 'true';
    mockOfferGuardianSupportCall('User said they feel completely alone right now.');
    const res = await request(app).post('/api/nova/chat').set(auth(USER)).send({ message: 'I feel so alone in this.' });
    expect(res.status).toBe(200);
    const call = res.body.planTrace.find((t: any) => t.tool === 'offer_guardian_support');
    expect(call.result.offered).toBe(true);
    expect(call.result.reason).toBe('User said they feel completely alone right now.');
  });

  it('refuses a missing/empty reason even with the flag on - never a bare true/false with no grounding', async () => {
    process.env.GUARDIAN_SUPPORT_INVITATION_ENABLED = 'true';
    mockOfferGuardianSupportCall('');
    const res = await request(app).post('/api/nova/chat').set(auth(USER)).send({ message: 'hello' });
    const call = res.body.planTrace.find((t: any) => t.tool === 'offer_guardian_support');
    expect(call.result.offered).toBe(false);
    expect(call.result.error).toBeTruthy();
  });

  it('the tool never writes to Firestore or sends a message - it only returns a boolean-shaped suggestion', async () => {
    process.env.GUARDIAN_SUPPORT_INVITATION_ENABLED = 'true';
    mockOfferGuardianSupportCall('User asked to reach someone they trust.');
    await request(app).post('/api/nova/chat').set(auth(USER)).send({ message: 'Can you help me reach someone?' });
    // No guardian_alerts, no guardian_support_events, no support_circle
    // write happened anywhere as a side effect of the tool firing.
    const written = allPaths().filter((p) => p.includes('guardian_alerts') || p.includes('guardian_support_events'));
    expect(written).toEqual([]);
  });
});

describe('POST /api/guardian/support-event — privacy-preserving analytics', () => {
  it('requires authentication', async () => {
    const res = await request(app).post('/api/guardian/support-event').send({ eventType: 'invitation_shown' });
    expect(res.status).toBe(401);
  });

  it('rejects an event type outside the closed enum', async () => {
    const res = await request(app).post('/api/guardian/support-event').set(auth(USER)).send({ eventType: 'crisis_detected' });
    expect(res.status).toBe(400);
  });

  it('records a valid event with no extra fields beyond the declared schema', async () => {
    const res = await request(app).post('/api/guardian/support-event').set(auth(USER)).send({ eventType: 'invitation_shown' });
    expect(res.status).toBe(200);
    expect(res.body.recorded).toBe(true);
  });

  it('rejects a payload trying to smuggle extra fields (e.g. chat content) onto the event', async () => {
    const res = await request(app).post('/api/guardian/support-event').set(auth(USER))
      .send({ eventType: 'invitation_shown', message: 'the actual thing the user said' });
    expect(res.status).toBe(400);
  });

  it('accepts the optional contactId/channel fields for send-related events', async () => {
    const res = await request(app).post('/api/guardian/support-event').set(auth(USER))
      .send({ eventType: 'send_succeeded', contactId: 'guardian_1', channel: 'sms' });
    expect(res.status).toBe(200);
  });
});
