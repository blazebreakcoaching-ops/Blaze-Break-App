import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EventEmitter } from 'events';

// QA Batch 2 - the Nova Live WebSocket relay (handleNovaLiveConnection in
// server.ts) was previously only ever registered inline inside the
// `if (process.env.TEST_MODE !== 'true') { ... }` block that sets up a
// real app.listen()/WebSocketServer - exactly the block the whole test
// suite sets TEST_MODE=true to AVOID running. That meant this handler,
// despite being real production code (auth, App Check, quota checks,
// Gemini Live session lifecycle, audio/transcript/tool-call relay,
// idle/session timeouts, voice-minutes billing), could never execute
// during a test run at all - not "undertested," structurally untested.
// It is now a named, exported function (pure extraction, no behaviour
// change - see the comment above its definition in server.ts), callable
// directly here against a fake WebSocket client and a mocked
// ai.live.connect, the same way every other external SDK in this
// codebase is mocked in tests rather than hit for real.

const h = vi.hoisted(() => {
  process.env.TEST_MODE = 'true';
  process.env.NODE_ENV = 'test';
  process.env.GEMINI_API_KEY = 'test-key-not-a-placeholder';
  // Short enough that the timeout test doesn't slow the suite down, long
  // enough that the "successful relay" tests' real (but fast) Firestore/
  // mock work never trips it by accident.
  process.env.NOVA_LIVE_MAX_SESSION_MS = '60';
  process.env.NOVA_LIVE_IDLE_TIMEOUT_MS = '500';
  const state = {
    lastConfig: null as any,
    lastCallbacks: null as any,
    fakeLiveSession: null as any,
    liveConnect: null as any,
  };
  // Schedules onopen via a REAL setTimeout rather than calling it
  // synchronously inside this async function - `liveSession = await
  // ai.live.connect(...)` in the handler only assigns liveSession once
  // THIS promise resolves, and the real Gemini SDK guarantees onopen
  // never fires before that (the handler's own queuing logic for
  // messages that arrive first depends on that ordering - see
  // pendingClientMessages in server.ts). Resolving synchronously here
  // but firing onopen on a macrotask reproduces that ordering correctly;
  // calling onopen before returning would let it run while liveSession
  // is still null, which is not how the real SDK behaves.
  state.liveConnect = vi.fn(async (config: any) => {
    state.lastConfig = config;
    state.lastCallbacks = config.callbacks;
    setTimeout(() => config.callbacks.onopen(), 0);
    return state.fakeLiveSession;
  });
  return state;
});

vi.mock('express-rate-limit', () => ({ default: () => (_req: any, _res: any, next: any) => next() }));
vi.mock('firebase-admin/app', () => ({ initializeApp: vi.fn(), getApps: () => [{}] }));
vi.mock('firebase-admin/app-check', () => ({ getAppCheck: () => ({ verifyToken: vi.fn() }) }));
vi.mock('firebase-admin/auth', () => ({
  getAuth: () => ({
    verifyIdToken: async (token: string) => {
      if (token === 'bad-token') throw new Error('invalid token');
      return { uid: token, email: `${token}@test.dev` };
    },
  }),
}));
vi.mock('firebase-admin/firestore', async () => {
  const fake = await import('./test/fake-firestore');
  return { getFirestore: () => fake.fakeDb, FieldValue: fake.FakeFieldValue };
});
vi.mock('twilio', () => ({ default: () => ({ messages: { create: vi.fn() } }) }));
vi.mock('@google/genai', () => ({
  GoogleGenAI: class {
    chats = { create: vi.fn() };
    models = { generateContent: vi.fn() };
    live = { connect: (config: any) => h.liveConnect(config) };
  },
  Type: { OBJECT: 'OBJECT', STRING: 'STRING', ARRAY: 'ARRAY', NUMBER: 'NUMBER' },
  Modality: { AUDIO: 'AUDIO', TEXT: 'TEXT' },
}));

import { handleNovaLiveConnection } from './server';
import { seedDoc, getDocRaw, resetStore } from './test/fake-firestore';

// Minimal stand-in for `ws`'s WebSocket - the handler only ever calls
// .send/.close/.on("message"|"close"|"error") on the client socket, so
// that's all this needs to provide. `sent` captures every parsed JSON
// message pushed to the (fake) client, in order, for assertions.
class FakeClientSocket extends EventEmitter {
  sent: any[] = [];
  closed = false;
  send(data: string) {
    this.sent.push(JSON.parse(data));
  }
  close() {
    this.closed = true;
  }
}

const fakeReq = (query: string) => ({ url: `/api/nova/live?${query}`, headers: { host: 'localhost' } });

const todayKey = () => new Date().toISOString().slice(0, 10);
const monthKey = () => `month-${todayKey().slice(0, 7)}`;

// Lets a test wait out a real macrotask boundary (e.g. the mock's
// setTimeout(onopen, 0) above) without hardcoding a timing assumption
// beyond "scheduled after this will have run by the time this resolves" -
// same-delay real timers fire in registration order in Node, so a flush
// registered after the thing it's waiting on always runs second.
const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  resetStore();
  h.lastConfig = null;
  h.lastCallbacks = null;
  // A fresh object every test, not just cleared mocks on a shared one -
  // a real Gemini Live session from a PRIOR test's still-pending real
  // timer (if a test forgets to close its session) would otherwise keep
  // calling into a shared mock and pollute a later test's call counts.
  h.fakeLiveSession = {
    sendClientContent: vi.fn(),
    sendRealtimeInput: vi.fn(),
    sendToolResponse: vi.fn(),
    close: vi.fn(),
  };
  h.liveConnect.mockClear();
});

describe('handleNovaLiveConnection - auth and configuration gates', () => {
  it('rejects a connection with no token at all', async () => {
    const ws = new FakeClientSocket();
    await handleNovaLiveConnection(ws, fakeReq(''));
    expect(ws.sent).toEqual([{ error: 'Missing authentication token.' }]);
    expect(ws.closed).toBe(true);
    expect(h.liveConnect).not.toHaveBeenCalled();
  });

  it('rejects an invalid/expired token', async () => {
    const ws = new FakeClientSocket();
    await handleNovaLiveConnection(ws, fakeReq('token=bad-token'));
    expect(ws.sent).toEqual([{ error: 'Invalid or expired session. Please refresh and try again.' }]);
    expect(ws.closed).toBe(true);
    expect(h.liveConnect).not.toHaveBeenCalled();
  });

  it('rejects when Gemini is not configured on this server', async () => {
    const original = process.env.GEMINI_API_KEY;
    process.env.GEMINI_API_KEY = 'MY_GEMINI_API_KEY'; // the shipped placeholder value
    const ws = new FakeClientSocket();
    await handleNovaLiveConnection(ws, fakeReq('token=user_1'));
    process.env.GEMINI_API_KEY = original;
    expect(ws.sent).toEqual([{ error: "Live voice isn't configured on this server yet." }]);
    expect(ws.closed).toBe(true);
    expect(h.liveConnect).not.toHaveBeenCalled();
  });
});

describe('handleNovaLiveConnection - quota gates', () => {
  it('rejects a Free account that already used today\'s one voice session', async () => {
    seedDoc(`users/quota_user/usage_counters/${todayKey()}`, { nova_voice: 1 });
    const ws = new FakeClientSocket();
    await handleNovaLiveConnection(ws, fakeReq('token=quota_user'));
    expect(ws.sent).toEqual([{ error: "You've used today's free Nova voice session. Upgrade for many more, or continue with Nova by text." }]);
    expect(ws.closed).toBe(true);
    expect(h.liveConnect).not.toHaveBeenCalled();
  });

  it('rejects when this month\'s voice minutes are exhausted, even with sessions still available', async () => {
    seedDoc(`users/minutes_user/usage_counters/${monthKey()}`, { nova_voice_minutes: 10 }); // Free's monthly cap
    const ws = new FakeClientSocket();
    await handleNovaLiveConnection(ws, fakeReq('token=minutes_user'));
    expect(ws.sent).toEqual([{
      error: "You've used this month's Nova voice minutes. They reset next month - continue with Nova by text for now, or upgrade for a higher monthly allowance.",
    }]);
    expect(ws.closed).toBe(true);
    expect(h.liveConnect).not.toHaveBeenCalled();
  });

  it('gates BLAME Reset voice mode on blame_voice, not the general nova_voice throttle, for a Free account', async () => {
    const ws = new FakeClientSocket();
    await handleNovaLiveConnection(ws, fakeReq('token=blame_user&context=blame'));
    expect(ws.sent).toEqual([{ error: 'Voice mode for BLAME Reset is a paid feature. Continue by typing, or upgrade for voice.' }]);
    expect(ws.closed).toBe(true);
    expect(h.liveConnect).not.toHaveBeenCalled();
  });
});

describe('handleNovaLiveConnection - successful session', () => {
  it('opens the upstream session and sends ready:true once connected', async () => {
    const ws = new FakeClientSocket();
    await handleNovaLiveConnection(ws, fakeReq('token=live_user'));
    await flush();
    expect(h.liveConnect).toHaveBeenCalledTimes(1);
    expect(ws.sent).toEqual(expect.arrayContaining([{ ready: true }]));
    expect(ws.closed).toBe(false);
    ws.emit('close');
  });

  it('queues a client message that arrives before the upstream session opens, then drains it in order once ready', async () => {
    let resolveConnect!: (session: unknown) => void;
    h.liveConnect.mockImplementationOnce((config: any) => {
      h.lastConfig = config;
      h.lastCallbacks = config.callbacks;
      return new Promise((resolve) => { resolveConnect = resolve; });
    });

    const ws = new FakeClientSocket();
    const connectionPromise = handleNovaLiveConnection(ws, fakeReq('token=queue_user'));
    await flush();

    // The upstream session hasn't opened yet - this must be queued, not
    // dropped or acted on immediately (there is no liveSession to act on).
    ws.emit('message', Buffer.from(JSON.stringify({ audio: 'chunk-1' })));
    expect(h.fakeLiveSession.sendRealtimeInput).not.toHaveBeenCalled();

    resolveConnect(h.fakeLiveSession);
    setTimeout(() => h.lastCallbacks.onopen(), 0);
    await connectionPromise;
    await flush();

    expect(h.fakeLiveSession.sendRealtimeInput).toHaveBeenCalledWith({ audio: { data: 'chunk-1', mimeType: 'audio/pcm;rate=16000' } });
    expect(ws.sent).toEqual(expect.arrayContaining([{ ready: true }]));
    ws.emit('close');
  });

  it('relays an outbound audio chunk to the upstream Gemini Live session', async () => {
    const ws = new FakeClientSocket();
    await handleNovaLiveConnection(ws, fakeReq('token=audio_user'));
    await flush();
    ws.emit('message', Buffer.from(JSON.stringify({ audio: 'abc123' })));
    expect(h.fakeLiveSession.sendRealtimeInput).toHaveBeenCalledWith({ audio: { data: 'abc123', mimeType: 'audio/pcm;rate=16000' } });
    ws.emit('close');
  });

  it('relays an initialPrompt as non-turn-complete client content', async () => {
    const ws = new FakeClientSocket();
    await handleNovaLiveConnection(ws, fakeReq('token=prompt_user'));
    await flush();
    const turns = [{ role: 'user', parts: [{ text: 'hi' }] }];
    ws.emit('message', Buffer.from(JSON.stringify({ initialPrompt: turns })));
    expect(h.fakeLiveSession.sendClientContent).toHaveBeenCalledWith({ turns, turnComplete: false });
    ws.emit('close');
  });

  it('relays inbound transcript fragments, audio, and turnComplete from Gemini to the client', async () => {
    const ws = new FakeClientSocket();
    await handleNovaLiveConnection(ws, fakeReq('token=relay_user'));
    await flush();
    ws.sent.length = 0; // drop the initial {ready:true}

    h.lastCallbacks.onmessage({ serverContent: { interrupted: true } });
    h.lastCallbacks.onmessage({ serverContent: { inputTranscription: { text: 'user said this' } } });
    h.lastCallbacks.onmessage({ serverContent: { outputTranscription: { text: 'nova said that' } } });
    h.lastCallbacks.onmessage({ data: 'base64-audio-data' });
    h.lastCallbacks.onmessage({ serverContent: { turnComplete: true } });

    expect(ws.sent).toEqual([
      { interrupted: true },
      { userTranscript: 'user said this' },
      { novaTranscript: 'nova said that' },
      { audio: 'base64-audio-data' },
      { turnComplete: true },
    ]);
    ws.emit('close');
  });

  it('dispatches a remember_about_user tool call and relays the response back upstream', async () => {
    seedDoc('users/mem_user/nova_permissions/current', { allowNovaMemory: true, allowNovaUseSavedMemories: true });
    const ws = new FakeClientSocket();
    await handleNovaLiveConnection(ws, fakeReq('token=mem_user'));
    await flush();

    h.lastCallbacks.onmessage({
      toolCall: { functionCalls: [{ id: 'call_1', name: 'remember_about_user', args: { type: 'preference', content: 'likes short check-ins', confidence: 'medium' } }] },
    });
    await flush();

    expect(h.fakeLiveSession.sendToolResponse).toHaveBeenCalledTimes(1);
    const { functionResponses } = h.fakeLiveSession.sendToolResponse.mock.calls[0][0];
    expect(functionResponses).toEqual([{ id: 'call_1', name: 'remember_about_user', response: { saved: true } }]);
    ws.emit('close');
  });

  // Phase 5K (directive §3) - offer_practical_assistance is dispatched
  // through the exact same executeNovaTool as text chat, and its relay to
  // the client (practicalAssistanceOffer) mirrors offer_guardian_support's
  // own existing relay pattern - this proves voice gets the same
  // coordinator capability text chat's planTrace already exposes.
  it('dispatches an offer_practical_assistance tool call and relays practicalAssistanceOffer to the client', async () => {
    const ws = new FakeClientSocket();
    await handleNovaLiveConnection(ws, fakeReq('token=plate_user'));
    await flush();

    h.lastCallbacks.onmessage({
      toolCall: { functionCalls: [{ id: 'call_1', name: 'offer_practical_assistance', args: { reason: 'User said they are behind on three deadlines this week.' } }] },
    });
    await flush();

    expect(h.fakeLiveSession.sendToolResponse).toHaveBeenCalledTimes(1);
    const { functionResponses } = h.fakeLiveSession.sendToolResponse.mock.calls[0][0];
    expect(functionResponses).toEqual([{ id: 'call_1', name: 'offer_practical_assistance', response: { offered: true, reason: 'User said they are behind on three deadlines this week.' } }]);

    const offerMessage = ws.sent.find((m) => m.practicalAssistanceOffer);
    expect(offerMessage.practicalAssistanceOffer).toEqual({ reason: 'User said they are behind on three deadlines this week.' });
    ws.emit('close');
  });

  it('never relays practicalAssistanceOffer when the tool refuses a missing reason', async () => {
    const ws = new FakeClientSocket();
    await handleNovaLiveConnection(ws, fakeReq('token=plate_user_2'));
    await flush();

    h.lastCallbacks.onmessage({
      toolCall: { functionCalls: [{ id: 'call_1', name: 'offer_practical_assistance', args: { reason: '' } }] },
    });
    await flush();

    expect(ws.sent.find((m) => m.practicalAssistanceOffer)).toBeUndefined();
    ws.emit('close');
  });

  it('caps remember_about_user at 5 saves per call, independent of the Firestore-backed memory permission', async () => {
    seedDoc('users/cap_user/nova_permissions/current', { allowNovaMemory: true, allowNovaUseSavedMemories: true });
    const ws = new FakeClientSocket();
    await handleNovaLiveConnection(ws, fakeReq('token=cap_user'));
    await flush();

    for (let i = 0; i < 6; i++) {
      h.lastCallbacks.onmessage({
        toolCall: { functionCalls: [{ id: `call_${i}`, name: 'remember_about_user', args: { type: 'preference', content: `memory ${i}`, confidence: 'medium' } }] },
      });
      await flush();
    }

    const sixthCallResponse = h.fakeLiveSession.sendToolResponse.mock.calls[5][0].functionResponses[0].response;
    expect(sixthCallResponse.saved).toBe(false);
    expect(sixthCallResponse.error).toMatch(/Already saved 5 memories/);
    ws.emit('close');
  });

  it('ends the session once it reaches its max duration, closes the socket, and bills the real elapsed minutes', async () => {
    const ws = new FakeClientSocket();
    await handleNovaLiveConnection(ws, fakeReq('token=timeout_user'));
    await flush();
    ws.sent.length = 0;

    await new Promise((r) => setTimeout(r, 150)); // past NOVA_LIVE_MAX_SESSION_MS (60ms)

    expect(ws.sent).toEqual(expect.arrayContaining([{ error: 'This voice session has reached its time limit.' }]));
    expect(ws.closed).toBe(true);
    expect(h.fakeLiveSession.close).toHaveBeenCalledTimes(1);

    const usage = getDocRaw(`users/timeout_user/usage_counters/${monthKey()}`);
    expect(usage?.nova_voice_minutes).toBeGreaterThanOrEqual(1);
  });

  it('ends the session cleanly when the client socket closes, without double-ending', async () => {
    const ws = new FakeClientSocket();
    await handleNovaLiveConnection(ws, fakeReq('token=close_user'));
    await flush();

    ws.emit('close');
    ws.emit('close'); // a second close must be a no-op, not a second cleanup/send

    expect(h.fakeLiveSession.close).toHaveBeenCalledTimes(1);
    expect(ws.closed).toBe(true);
  });
});
