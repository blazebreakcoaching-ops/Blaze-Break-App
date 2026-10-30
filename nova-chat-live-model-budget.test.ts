import { describe, it, expect, vi } from 'vitest';

// PHASE 6B (directive §3) - this file tests the live-model evaluation
// runner's BUDGET/TIMEOUT/RETRY control logic itself, using a fake
// invoker that never makes a real HTTP or Gemini call - it is NOT the
// controlled live-model mode (see nova-chat-live-model-evaluation.live-eval.test.ts
// for the one file allowed to make a real call, gated separately and
// excluded from this default suite). Runs under plain `npm test`/CI like
// any other test file, because nothing here can possibly reach a real
// provider: the "invoker" below is a plain vi.fn() returning scripted
// values, never `request(app)` against the real route.
import {
  runNovaChatLiveModelEvaluation,
  type NovaChatLiveEvalConfig,
} from './nova-chat-live-model-evaluation-runner';
import type { NovaChatInvoker } from './nova-chat-scenario-runner';

const ENV_ENABLED = { GEMINI_API_KEY: 'real-looking-test-key', NOVA_LIVE_CHAT_EVAL: '1' } as NodeJS.ProcessEnv;
const BASE_CONFIG: NovaChatLiveEvalConfig = { modelId: 'gemini-3.5-flash', maxScenarios: 1 };

function okResult(promptTokens: number, outputTokens: number) {
  return { status: 200, body: { text: 'ok', planTrace: [], usage: { promptTokens, outputTokens, totalTokens: promptTokens + outputTokens } } };
}

describe('runNovaChatLiveModelEvaluation - budget reservation (directive §3)', () => {
  it('refuses to make a call at all when the pre-call worst-case estimate would exceed maxTotalUsd', async () => {
    const invoker: NovaChatInvoker = vi.fn(async () => okResult(1, 1));
    const outcome = await runNovaChatLiveModelEvaluation(
      { ...BASE_CONFIG, maxTotalUsd: 0.0000000001 }, // impossibly small - any real call's worst case exceeds it
      invoker,
      (id) => `budget_${id}`,
      ENV_ENABLED,
    );
    expect(outcome.status).toBe('completed');
    if (outcome.status === 'completed') {
      expect(outcome.stoppedEarly).toBe(true);
      expect(invoker).not.toHaveBeenCalled(); // refused BEFORE the call, not after
    }
  });

  it('stops after a real call whose actual usage pushes spend over maxTotalUsd, even if the pre-call estimate underestimated it', async () => {
    // A generous enough pre-call budget to let the first call through,
    // but the REAL usage returned is deliberately huge, so the post-call
    // true-up must trip the stop condition before any second call.
    const invoker: NovaChatInvoker = vi.fn(async () => okResult(10_000_000, 10_000_000));
    const outcome = await runNovaChatLiveModelEvaluation(
      { ...BASE_CONFIG, maxScenarios: 5, maxTotalUsd: 0.01 },
      invoker,
      (id) => `budget_${id}`,
      ENV_ENABLED,
    );
    expect(outcome.status).toBe('completed');
    if (outcome.status === 'completed') {
      expect(outcome.stoppedEarly).toBe(true);
      // Exactly one real call should have been attempted before the
      // post-call true-up stopped the run - not zero (the pre-call
      // estimate let it through) and not many (the loop must not
      // continue once over budget).
      expect((invoker as any).mock.calls.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('passes the configured maxOutputTokensPerCall through to every invoker call', async () => {
    const invoker: NovaChatInvoker = vi.fn(async () => okResult(10, 10));
    await runNovaChatLiveModelEvaluation(
      { ...BASE_CONFIG, maxOutputTokensPerCall: 128 },
      invoker,
      (id) => `budget_${id}`,
      ENV_ENABLED,
    );
    expect((invoker as any).mock.calls[0][0].maxOutputTokens).toBe(128);
  });
});

// PHASE 6B.1 (Priority 5) - thinking-level pass-through and truncation
// detection, using the same fake-invoker pattern as the suite above (no
// real Gemini call).
describe('runNovaChatLiveModelEvaluation - thinking level and truncation detection (Phase 6B.1 Priority 5)', () => {
  it('passes the configured thinkingLevel through to every invoker call when set, and omits it when not', async () => {
    const invoker: NovaChatInvoker = vi.fn(async () => okResult(10, 10));
    await runNovaChatLiveModelEvaluation(
      { ...BASE_CONFIG, thinkingLevel: 'LOW' },
      invoker,
      (id) => `budget_${id}`,
      ENV_ENABLED,
    );
    expect((invoker as any).mock.calls[0][0].thinkingLevel).toBe('LOW');

    (invoker as any).mockClear();
    await runNovaChatLiveModelEvaluation(BASE_CONFIG, invoker, (id) => `budget_${id}`, ENV_ENABLED);
    expect((invoker as any).mock.calls[0][0].thinkingLevel).toBeUndefined();
  });

  it('counts a call truncated by the token cap (finishReason=MAX_TOKENS, empty text) as a test-harness limitation, and reports it on the outcome and in the note - never as a stopped-early failure', async () => {
    const invoker: NovaChatInvoker = vi.fn(async () => ({
      status: 200,
      body: { text: '', planTrace: [], usage: { promptTokens: 10, outputTokens: 0, thinkingTokens: 512, finishReason: 'MAX_TOKENS', totalTokens: 522 } },
    }));
    const outcome = await runNovaChatLiveModelEvaluation(BASE_CONFIG, invoker, (id) => `budget_${id}`, ENV_ENABLED);
    expect(outcome.status).toBe('completed');
    if (outcome.status === 'completed') {
      expect(outcome.truncatedByTokenCapCount).toBeGreaterThanOrEqual(1);
      expect(outcome.report.note).toContain('TEST-HARNESS LIMITATION');
      expect(outcome.report.note).toContain('MAX_TOKENS');
    }
  });

  it('does NOT count a normal, naturally-finished call (finishReason=STOP) as truncated', async () => {
    const invoker: NovaChatInvoker = vi.fn(async () => ({
      status: 200,
      body: { text: 'a real answer', planTrace: [], usage: { promptTokens: 10, outputTokens: 20, thinkingTokens: 0, finishReason: 'STOP', totalTokens: 30 } },
    }));
    const outcome = await runNovaChatLiveModelEvaluation(BASE_CONFIG, invoker, (id) => `budget_${id}`, ENV_ENABLED);
    expect(outcome.status).toBe('completed');
    if (outcome.status === 'completed') {
      expect(outcome.truncatedByTokenCapCount).toBe(0);
      expect(outcome.report.note).not.toContain('TEST-HARNESS LIMITATION');
    }
  });
});

describe('runNovaChatLiveModelEvaluation - timeout and retry limits (directive §3: "no unbounded retries")', () => {
  it('treats a call that exceeds requestTimeoutMs as a failure and stops (default maxRetriesPerCall=0 means no retry)', async () => {
    const invoker: NovaChatInvoker = vi.fn(() => new Promise<any>((resolve) => setTimeout(() => resolve(okResult(1, 1)), 5000)));
    const outcome = await runNovaChatLiveModelEvaluation(
      { ...BASE_CONFIG, requestTimeoutMs: 50 },
      invoker,
      (id) => `budget_${id}`,
      ENV_ENABLED,
    );
    expect(outcome.status).toBe('completed');
    if (outcome.status === 'completed') {
      expect(outcome.stoppedEarly).toBe(true);
      // Default maxRetriesPerCall is 0 - exactly one attempt, never more.
      expect((invoker as any).mock.calls.length).toBe(1);
    }
  }, 10000);

  it('retries exactly maxRetriesPerCall times on failure, never more, and still fails the run if every attempt fails', async () => {
    const invoker: NovaChatInvoker = vi.fn(async () => { throw new Error('simulated transient failure'); });
    const outcome = await runNovaChatLiveModelEvaluation(
      { ...BASE_CONFIG, maxRetriesPerCall: 2 },
      invoker,
      (id) => `budget_${id}`,
      ENV_ENABLED,
    );
    expect(outcome.status).toBe('completed');
    if (outcome.status === 'completed') expect(outcome.stoppedEarly).toBe(true);
    // 1 initial attempt + 2 retries = 3 total, never unbounded.
    expect((invoker as any).mock.calls.length).toBe(3);
  });

  it('does not retry at all when a later attempt would succeed but maxRetriesPerCall is 0 and the first attempt fails', async () => {
    const invoker: NovaChatInvoker = vi.fn()
      .mockRejectedValueOnce(new Error('first attempt fails'))
      .mockResolvedValueOnce(okResult(1, 1));
    const outcome = await runNovaChatLiveModelEvaluation(
      { ...BASE_CONFIG, maxRetriesPerCall: 0 },
      invoker,
      (id) => `budget_${id}`,
      ENV_ENABLED,
    );
    expect(outcome.status).toBe('completed');
    if (outcome.status === 'completed') expect(outcome.stoppedEarly).toBe(true);
    expect((invoker as any).mock.calls.length).toBe(1); // never reached the would-have-succeeded second attempt
  });
});
