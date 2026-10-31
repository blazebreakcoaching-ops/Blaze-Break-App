import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EventEmitter } from 'events';

// PHASE 6D (Priority 2) - "Do not assume changing the model name
// establishes compatibility." This file runs the REAL, unmodified
// handleNovaLiveConnection against a MOCKED ai.live.connect exactly the
// way nova-live-websocket.test.ts already does, but with
// GEMINI_LIVE_MODEL_OVERRIDE=gemini-3.8-live set BEFORE server.ts (and
// therefore ai-model-registry.ts) is first imported in this test worker -
// the only way to exercise the actually-configured-for-3.8-live code
// path, since GEMINI_LIVE_MODEL is resolved once at module load. Isolated
// into its own file for the same reason
// nova-chat-thinking-level-validation.route.test.ts is isolated from its
// sibling: setting this override in a shared file would silently change
// every other Nova Live test onto a different model than they assume.
//
// What this actually checks, against the research this phase performed
// (ai.google.dev itself remains unreachable from this sandbox - WebFetch
// -> ENOTFOUND, same restriction every prior phase has hit; findings
// below are corroborated via a search index reaching what present as
// cached snapshots of Google's own gemini-3.8-live migration-notes page,
// not a page this file's author rendered and read directly):
//
//   - thinking_level is reported NOT ACCEPTED by gemini-3.8-live at all
//     (session setup should omit it entirely, not merely pick a
//     supported value as gemini-3.8-flash's TEXT path already does).
//   - Proactive audio is reported PERMANENTLY ENABLED on gemini-3.8-live
//     - explicitly setting proactive_audio:false is reported to return a
//     hard error. This app's Live config has never set this field at
//     all, so the migration is not blocked by it, but a FUTURE change
//     that added `proactivity: { proactiveAudio: false }` (e.g. to
//     suppress Nova occasionally declining to respond) would silently
//     break only on this specific model - this test locks in today's
//     "never set it" state as a regression guard.
//   - Affective dialogue is reported REMOVED from the API on this model -
//     any enable_affective_dialog config should be deleted. This app's
//     Live config has never set this field either.
//   - Audio is reported as the ONLY supported response modality, with
//     output audio transcription needed for a text transcript - this
//     app's config already requests exactly that (Modality.AUDIO only,
//     outputAudioTranscription: {}), independent of this migration.
//   - Async (NON_BLOCKING) function calling is reported as the new
//     DEFAULT - this app's tool-call handling in server.ts already
//     dispatches executeNovaTool asynchronously and calls
//     sendToolResponse once every call resolves, never assuming a
//     synchronous/blocking turn, so this default change is not expected
//     to require a code change; the test below exercises that same
//     dispatch path under the overridden model id to confirm it still
//     produces a correct response rather than merely asserting it by
//     reading the code.
//
// NOT exercised here (confirmed as a real gap, not an oversight): a
// genuine bidirectional audio session against Google's real endpoint.
// `ai.live.connect` remains permanently mocked in this file, matching
// nova-voice-evaluation-runner.test.ts's own deliberate scope decision -
// see NOVA_PHASE6D_VOICE_EVALUATION_PROCEDURE.md for what a real,
// explicitly-authorised compatibility test of this model would still
// require before any such session is opened.
const h = vi.hoisted(() => {
  process.env.TEST_MODE = 'true';
  process.env.NODE_ENV = 'test';
  process.env.GEMINI_API_KEY = 'test-key-not-a-placeholder';
  process.env.GEMINI_LIVE_MODEL_OVERRIDE = 'gemini-3.8-live';
  process.env.NOVA_LIVE_MAX_SESSION_MS = '60000';
  process.env.NOVA_LIVE_IDLE_TIMEOUT_MS = '60000';
  const state = {
    lastConfig: null as any,
    lastCallbacks: null as any,
    fakeLiveSession: null as any,
    liveConnect: null as any,
  };
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
  getAuth: () => ({ verifyIdToken: async (token: string) => ({ uid: token, email: `${token}@test.dev` }) }),
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
import { GEMINI_LIVE_MODEL } from './ai-model-registry';
import { resetStore } from './test/fake-firestore';

class FakeClientSocket extends EventEmitter {
  sent: any[] = [];
  closed = false;
  send(data: string) { this.sent.push(JSON.parse(data)); }
  close() { this.closed = true; }
}

const fakeReq = (query: string) => ({ url: `/api/nova/live?${query}`, headers: { host: 'localhost' } });
const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  resetStore();
  h.lastConfig = null;
  h.lastCallbacks = null;
  h.fakeLiveSession = { sendClientContent: vi.fn(), sendRealtimeInput: vi.fn(), sendToolResponse: vi.fn(), close: vi.fn() };
  h.liveConnect.mockClear();
});

describe('Nova Live / gemini-3.8-live migration compatibility (Phase 6D Priority 2)', () => {
  it('sanity check: this file really is running with gemini-3.8-live configured', () => {
    expect(GEMINI_LIVE_MODEL).toBe('gemini-3.8-live');
  });

  it('the real session-setup config sent to ai.live.connect names gemini-3.8-live and contains none of the fields the migration notes report as unsupported or breaking on it', async () => {
    const ws = new FakeClientSocket();
    await handleNovaLiveConnection(ws, fakeReq('token=migration_test_config'));
    await flush();

    expect(h.liveConnect).toHaveBeenCalledTimes(1);
    expect(h.lastConfig.model).toBe('gemini-3.8-live');

    // thinking_level: reported NOT ACCEPTED by this model at all - the
    // Live path has never set this, and must keep not setting it.
    expect(h.lastConfig.config.thinkingConfig).toBeUndefined();

    // Proactive audio: reported PERMANENTLY ENABLED, with
    // proactive_audio:false reported to return a hard error. This app
    // has never set this field - confirming it stays unset is the
    // actual regression guard ("do not assume changing the model name
    // establishes compatibility" cuts both ways: a config addition that
    // would be harmless on the old model can break only on this one).
    expect(h.lastConfig.config.proactivity).toBeUndefined();

    // Affective dialogue: reported REMOVED from the API entirely -
    // never configured here either.
    expect(h.lastConfig.config.enableAffectiveDialog).toBeUndefined();

    ws.emit('close');
  });

  it('audio remains the only requested response modality, with output transcription still enabled for a text transcript - matching this model\'s audio-only response-modality requirement', async () => {
    const ws = new FakeClientSocket();
    await handleNovaLiveConnection(ws, fakeReq('token=migration_test_modality'));
    await flush();

    expect(h.lastConfig.config.responseModalities).toEqual(['AUDIO']);
    expect(h.lastConfig.config.outputAudioTranscription).toBeDefined();
    expect(h.lastConfig.config.inputAudioTranscription).toBeDefined();

    ws.emit('close');
  });

  it('asynchronous tool-call dispatch (the new default execution mode on this model) still resolves correctly and relays a real tool response', async () => {
    const ws = new FakeClientSocket();
    await handleNovaLiveConnection(ws, fakeReq('token=migration_test_async_tool'));
    await flush();
    ws.sent.length = 0;

    h.lastCallbacks.onmessage({
      toolCall: { functionCalls: [{ id: 'call_1', name: 'offer_guardian_support', args: { reason: 'async dispatch check' } }] },
    });
    await flush();

    const toolResponse = h.fakeLiveSession.sendToolResponse.mock.calls[0]?.[0]?.functionResponses?.[0];
    expect(toolResponse?.id).toBe('call_1');
    expect(toolResponse?.name).toBe('offer_guardian_support');
    expect(toolResponse?.response).toBeDefined();

    ws.emit('close');
  });

  it('interruption relay (barge-in) still works under this model - a model-agnostic, protocol-level relay unaffected by the migration', async () => {
    const ws = new FakeClientSocket();
    await handleNovaLiveConnection(ws, fakeReq('token=migration_test_interrupt'));
    await flush();
    ws.sent.length = 0;

    h.lastCallbacks.onmessage({ serverContent: { interrupted: true } });

    expect(ws.sent.some((m) => m.interrupted === true)).toBe(true);
    ws.emit('close');
  });
});
