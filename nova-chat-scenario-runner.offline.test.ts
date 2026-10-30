// PHASE 6A - OFFLINE mode of the Nova chat intelligence evaluation
// framework (directive §4). Runs under the default `npm test`/CI, exactly
// like every other *.route.test.ts file - no paid API is ever invoked
// here. `@google/genai` is mocked at the module level (the same pattern
// nova-chat-safety.route.test.ts already established), so every request
// in this file travels through the REAL, unmodified `/api/nova/chat`
// route in server.ts (auth, App Check, quota, consent-gated context
// build, system-prompt assembly, the bounded tool-call loop,
// executeNovaTool) against a scripted, deterministic model response. This
// proves the APPLICATION's orchestration and deterministic safety
// controls are correct for a given model output - it proves nothing
// about what a real Gemini model would actually say. See
// nova-chat-live-model-evaluation-runner.ts for the separate, gated mode
// that asks that second question.
import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';

const h = vi.hoisted(() => {
  process.env.TEST_MODE = 'true';
  process.env.NODE_ENV = 'test';
  process.env.GEMINI_API_KEY = 'test-key-not-a-placeholder';
  return {
    lastConfig: null as any,
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
    chats = {
      create: (config: any) => {
        h.lastConfig = config;
        return { sendMessage: h.sendMessage };
      },
    };
    models = { generateContent: vi.fn() };
    live = { connect: vi.fn() };
  },
  Type: { OBJECT: 'OBJECT', STRING: 'STRING', ARRAY: 'ARRAY', NUMBER: 'NUMBER' },
  Modality: { AUDIO: 'AUDIO', TEXT: 'TEXT' },
}));

import request from 'supertest';
import { app } from './server';
import { resetStore, seedDoc } from './test/fake-firestore';
import { NOVA_CHAT_SCENARIOS } from './nova-chat-scenario-library';
import { runScenario, type NovaChatInvoker } from './nova-chat-scenario-runner';
import { buildRunReport, writeReportArtifacts } from './nova-chat-evaluation-report';
import type { NovaScenarioEvaluationResult } from './nova-chat-scenario-types';

const auth = (uid: string) => ({ Authorization: `Bearer ${uid}` });

type ScriptedResponse = { text: string; functionCalls?: { name: string; args: Record<string, unknown> }[] };

function queueTurnResponses(primary: ScriptedResponse, followUp?: ScriptedResponse) {
  h.sendMessage.mockImplementationOnce(async () => ({ text: primary.text, functionCalls: primary.functionCalls ?? [] }));
  if (primary.functionCalls && primary.functionCalls.length > 0) {
    // The real route's tool-call loop always makes one more sendMessage
    // call once results are sent back, regardless of whether the
    // scenario defines a scripted follow-up - default to an empty,
    // no-further-tool-calls close so an under-specified scenario doesn't
    // leave the mock queue desynchronised for the next turn.
    h.sendMessage.mockImplementationOnce(async () => ({ text: followUp?.text ?? primary.text, functionCalls: followUp?.functionCalls ?? [] }));
  }
}

const makeInvoker = (): NovaChatInvoker => async ({ uid, message, history }) => {
  const res = await request(app).post('/api/nova/chat').set(auth(uid)).send({ message, history });
  return { status: res.status, body: res.body, systemInstructionSentToModel: h.lastConfig?.config?.systemInstruction ?? null };
};

describe('Nova chat intelligence evaluation - OFFLINE mode (mocked model, real route)', () => {
  beforeEach(() => {
    resetStore();
    h.lastConfig = null;
    h.sendMessage.mockReset();
  });

  const results: NovaScenarioEvaluationResult[] = [];

  for (const scenario of NOVA_CHAT_SCENARIOS) {
    it(`${scenario.id}: ${scenario.title}`, async () => {
      const uid = `eval_${scenario.id}`;
      if (scenario.permissionsDoc) await seedDoc(`users/${uid}/nova_permissions/current`, scenario.permissionsDoc);
      if (scenario.seededMemories) {
        for (const mem of scenario.seededMemories) {
          await seedDoc(`users/${uid}/nova_memories/${mem.id}`, mem);
        }
      }

      // Queue every turn's scripted response(s) up front - the invoker
      // itself is mode-agnostic (nova-chat-scenario-runner.ts) and never
      // touches the mock, so the mock queue must already hold exactly as
      // many entries as this scenario's turns will consume, in order.
      for (const turn of scenario.turns) {
        queueTurnResponses(turn.offlineModelResponse, turn.offlineModelFollowUp);
      }

      const result = await runScenario(scenario, makeInvoker(), uid);
      results.push(result);

      for (const turnResult of result.turnResults) {
        for (const invariant of turnResult.hardInvariants) {
          expect(invariant.passed, `${scenario.id} turn ${turnResult.turnIndex} failed hard invariant [${invariant.id}]: ${invariant.detail}`).toBe(true);
        }
      }
    });
  }

  afterAll(() => {
    const report = buildRunReport('offline', results, {
      modelId: null,
      featureFlagState: {
        NOVA_TOOLS_ENABLED: process.env.NOVA_TOOLS_ENABLED !== 'false',
        NOVA_AGENTIC_JOURNEY_ENABLED: process.env.NOVA_AGENTIC_JOURNEY_ENABLED === 'true',
        GUARDIAN_SUPPORT_INVITATION_ENABLED: process.env.GUARDIAN_SUPPORT_INVITATION_ENABLED === 'true',
      },
      note: 'Offline run against the real /api/nova/chat route with @google/genai mocked. Evidence of correct application orchestration and deterministic safety-control behaviour only - not evidence of real Gemini conversational quality.',
    });
    const { jsonPath, mdPath } = writeReportArtifacts(report, 'offline-run-latest');
    console.log(`Nova chat offline evaluation report written to ${jsonPath} and ${mdPath}`);
  });
});
