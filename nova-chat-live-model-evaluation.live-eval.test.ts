// PHASE 6A - the ONLY file in this repository that may make a real
// Gemini call for Nova chat evaluation purposes, and only when BOTH
// NOVA_LIVE_CHAT_EVAL=1 and a real GEMINI_API_KEY are present - see
// nova-chat-live-model-evaluation-runner.ts's header comment for the
// full safety argument. This file is never part of `npm test`/CI: it is
// excluded from vitest.config.ts by its own `*.live-eval.test.ts`
// filename (mirroring the existing `*.emulator.test.ts` exclusion
// pattern) and is only run by hand via `npm run test:nova-live-eval`,
// which points at the dedicated vitest.live-eval.config.ts.
//
// `@google/genai` is deliberately NOT mocked here - that is the entire
// point of this file. firebase-admin/*, express-rate-limit, and twilio
// ARE mocked, exactly as in every other *.route.test.ts in this
// codebase, because they are authentication/infrastructure concerns
// unrelated to the one thing this file exists to exercise for real: the
// actual Gemini model's behaviour through the actual, unmodified
// `/api/nova/chat` route.
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.hoisted(() => {
  process.env.TEST_MODE = 'true';
  process.env.NODE_ENV = 'test';
});

// Infrastructure mocks only (auth/App Check/rate-limit/SMS) - deliberately
// NOT mocking `@google/genai`, which is the entire point of this file.
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
import { resetStore, seedDoc } from './test/fake-firestore';
import { GEMINI_TEXT_MODEL } from './ai-model-registry';
import {
  runNovaChatLiveModelEvaluation,
  hasLiveChatEvalCredentials,
  liveChatEvalExplicitlyEnabled,
} from './nova-chat-live-model-evaluation-runner';
import { writeReportArtifacts } from './nova-chat-evaluation-report';
import { NOVA_CHAT_SCENARIOS } from './nova-chat-scenario-library';
import type { NovaChatInvoker } from './nova-chat-scenario-runner';

const auth = (uid: string) => ({ Authorization: `Bearer ${uid}` });

const invoker: NovaChatInvoker = async ({ uid, message, history, maxOutputTokens }) => {
  const res = await request(app).post('/api/nova/chat').set(auth(uid)).send({
    message,
    history,
    // PHASE 6B (directive §3) - threads the live-model runner's
    // maxOutputTokensPerCall budget control through to the real request
    // field server.ts applies directly to the real Gemini
    // generationConfig. Omitted entirely when the runner doesn't ask for
    // one, matching ChatRequestSchema's optional field.
    ...(maxOutputTokens ? { maxOutputTokens } : {}),
  });
  return { status: res.status, body: res.body }; // no systemInstructionSentToModel capture possible here - see runner header comment
};

describe('Nova chat intelligence evaluation - CONTROLLED LIVE-MODEL mode', () => {
  beforeEach(() => {
    resetStore();
    for (const scenario of NOVA_CHAT_SCENARIOS) {
      if (scenario.permissionsDoc) seedDoc(`users/eval_live_${scenario.id}/nova_permissions/current`, scenario.permissionsDoc);
      if (scenario.seededMemories) {
        for (const mem of scenario.seededMemories) seedDoc(`users/eval_live_${scenario.id}/nova_memories/${mem.id}`, mem);
      }
    }
  });

  it('reports the real gating decision honestly, and never runs a real call without both gates open', async () => {
    const explicitlyEnabled = liveChatEvalExplicitlyEnabled();
    const hasCreds = hasLiveChatEvalCredentials();

    const outcome = await runNovaChatLiveModelEvaluation(
      { modelId: GEMINI_TEXT_MODEL, maxScenarios: Number(process.env.NOVA_LIVE_CHAT_EVAL_MAX_SCENARIOS) || 3 },
      invoker,
      (scenarioId) => `eval_live_${scenarioId}`,
    );

    if (!explicitlyEnabled) {
      expect(outcome.status).toBe('blocked');
      if (outcome.status === 'blocked') expect(outcome.reason).toBe('not_explicitly_enabled');
    } else if (!hasCreds) {
      expect(outcome.status).toBe('blocked');
      if (outcome.status === 'blocked') expect(outcome.reason).toBe('no_credentials');
    } else {
      expect(outcome.status).toBe('completed');
    }

    if (outcome.status === 'blocked') {
      writeReportArtifacts(
        {
          mode: 'live_gemini',
          modelId: null,
          promptConfigRevision: 'n/a - blocked before any model call',
          featureFlagState: {},
          generatedAt: new Date().toISOString(),
          scenarioResults: [],
          usage: null,
          estimatedCostUsd: null,
          unresolvedRisks: ['Live-model evaluation NOT RUN this invocation - see note for the exact reason.'],
          note: outcome.note,
        },
        'live-run-latest',
      );
      console.log(`Nova chat live-model evaluation NOT RUN: ${outcome.reason} - ${outcome.note}`);
    } else {
      const { jsonPath, mdPath } = writeReportArtifacts(outcome.report, 'live-run-latest');
      for (const r of outcome.report.scenarioResults) {
        for (const t of r.turnResults) {
          for (const inv of t.hardInvariants) {
            expect(inv.passed, `${r.scenarioId} turn ${t.turnIndex} failed hard invariant [${inv.id}] against a REAL Gemini response: ${inv.detail}`).toBe(true);
          }
        }
      }
      console.log(`Nova chat LIVE evaluation report written to ${jsonPath} and ${mdPath} (stoppedEarly=${outcome.stoppedEarly})`);
    }
  });
});
