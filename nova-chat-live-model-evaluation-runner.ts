// PHASE 6A - CONTROLLED LIVE-MODEL MODE entry point (directive §4). This
// is the one place in the Nova chat intelligence evaluation framework
// that is allowed to produce a real Gemini response, and even here it
// only runs when BOTH of two independent conditions hold:
//   1. liveChatEvalExplicitlyEnabled() - NOVA_LIVE_CHAT_EVAL=1 is set.
//   2. hasLiveChatEvalCredentials() - a real, non-placeholder
//      GEMINI_API_KEY is configured.
// Neither condition is ever assumed or defaulted on - both are checked
// directly against process.env every call, mirroring the exact
// `hasGeminiCredentials()` pattern already established in
// nhei-real-model-evaluation-runner.ts (Phase 3C-2B), including its
// header comment's own promise never to substitute a simulated/mocked
// result for a real one. This file is NEVER imported by
// nova-chat-scenario-runner.offline.test.ts or any file that runs under
// the default `npm test`/CI - it is only exercised via
// nova-chat-live-model-evaluation.live-eval.test.ts, run by hand with
// `npm run test:nova-live-eval` (vitest.live-eval.config.ts), which is
// excluded from vitest.config.ts exactly the way *.emulator.test.ts
// already is.
//
// This runner drives real requests through the REAL, unmodified
// `/api/nova/chat` route (via the caller-supplied NovaChatInvoker, which
// the live-eval test file builds with `@google/genai` genuinely
// unmocked) - never a second, parallel model-calling implementation.
// Every scenario it can select from is drawn from
// nova-chat-scenario-library.ts and filtered to `allowedForLiveModelEval`
// only (directive §4: "executes only a bounded, allowlisted synthetic
// test suite").
//
// Known, disclosed limitation on cost/token accounting: the real
// `/api/nova/chat` route's own JSON response does not echo Gemini's
// usageMetadata back to the caller (see server.ts's `res.json({ text,
// privacyMetadata, planTrace })` - no usage field), and this phase
// deliberately does not widen that production response shape just to
// serve an eval-only concern. Spend is therefore bounded by a hard CALL
// COUNT ceiling (`maxScenarios`), not a token budget - `estimatedCostUsd`
// in the resulting report is consequently always `null` for this mode.
// nhei-real-model-evaluation-runner.ts achieves real token accounting by
// calling the Gemini client directly rather than through an HTTP route;
// this file trades that away deliberately, in exchange for exercising
// the REAL route's full orchestration (auth, quota, consent-gated
// context, system-prompt assembly, the tool-call loop) end to end, which
// is this phase's actual object of evaluation.

import { NOVA_CHAT_SCENARIOS } from './nova-chat-scenario-library';
import { runScenario, type NovaChatInvoker } from './nova-chat-scenario-runner';
import { buildRunReport } from './nova-chat-evaluation-report';
import { estimateModelCostUsd } from './ai-model-price-registry';
import type { NovaEvaluationRunReport } from './nova-chat-scenario-types';

export function hasLiveChatEvalCredentials(env: NodeJS.ProcessEnv = process.env): boolean {
  const key = env.GEMINI_API_KEY;
  return typeof key === 'string' && key.length > 0 && key !== 'MY_GEMINI_API_KEY';
}

export function liveChatEvalExplicitlyEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.NOVA_LIVE_CHAT_EVAL === '1';
}

export interface NovaChatLiveEvalConfig {
  /** Documented explicitly, every run - see ai-model-registry.ts for the real value in use (GEMINI_TEXT_MODEL). */
  modelId: string;
  /** Hard ceiling on how many allowlisted scenarios this run executes. Default 3 - deliberately small; raise explicitly for a larger authorised run. */
  maxScenarios?: number;
  /**
   * PHASE 6B (directive §3) - conservative total USD spend ceiling for
   * this entire run, checked BEFORE every call (reservation, using a
   * deliberately pessimistic pre-call estimate) and again AFTER every
   * call (true-up, using the real usage server.ts now returns). The run
   * stops - never merely warns - the moment either check would exceed
   * this. Default $0.05: small enough that an accidental authorised run
   * cannot become a real financial surprise.
   */
  maxTotalUsd?: number;
  /**
   * PHASE 6B (directive §3) - a deliberately pessimistic PRE-CALL input-
   * token estimate ceiling, in this harness's full control (it builds
   * the request), used only for budget reservation math below - this is
   * NOT a claim that Gemini's real tokenizer will match this number.
   * Default 4000.
   */
  maxEstimatedInputTokensPerCall?: number;
  /**
   * PHASE 6B (directive §3) - "Maximum model response length." The one
   * genuinely provider-enforced control this harness has: passed through
   * as the real request's `maxOutputTokens` field (ChatRequestSchema),
   * which server.ts applies directly to the real Gemini
   * generationConfig. Default 512.
   */
  maxOutputTokensPerCall?: number;
  /** PHASE 6B (directive §3) - per-call wall-clock timeout in ms. Default 20000. */
  requestTimeoutMs?: number;
  /** PHASE 6B (directive §3) - "No unbounded retries." Default 0 (no retries at all) - raise only deliberately. */
  maxRetriesPerCall?: number;
  /**
   * PHASE 6B.1 (Priority 5) - "an appropriately bounded, documented
   * thinking-level configuration." Passed through to the real request's
   * `thinkingLevel` field (ChatRequestSchema), which server.ts forwards
   * to the real Gemini `generationConfig.thinkingConfig.thinkingLevel` -
   * one of the @google/genai SDK's own four documented values
   * (MINIMAL/LOW/MEDIUM/HIGH; see ai-model-registry.ts's sibling comment
   * for how this was grounded in the SDK's installed type definitions).
   * Omitted by default (the model's own default thinking behaviour
   * applies) - this harness never silently requests a higher reasoning
   * depth than the caller asked for.
   *
   * Why this matters for a BOUNDED evaluation run specifically: this
   * phase's audit found that `maxOutputTokens` caps a thinking-capable
   * Gemini model's thinking tokens AND visible output tokens TOGETHER,
   * not separately (confirmed by the installed SDK's
   * GenerateContentResponseUsageMetadata.totalTokenCount doc comment,
   * which defines totalTokenCount as prompt + candidates + tool-use +
   * THOUGHTS tokens all sharing one budget). A high thinking level
   * combined with this harness's deliberately small default
   * maxOutputTokensPerCall (512) can therefore make the model spend its
   * entire token budget "thinking" and return an empty or truncated
   * visible response - see truncatedByTokenCapCount on the outcome type
   * below, which exists specifically to catch and correctly label that
   * case as a TEST-HARNESS configuration limitation, never as evidence
   * the model gave a bad or unintelligent answer.
   */
  thinkingLevel?: 'MINIMAL' | 'LOW' | 'MEDIUM' | 'HIGH';
}

export type NovaChatLiveEvalOutcome =
  | { status: 'blocked'; reason: 'not_explicitly_enabled' | 'no_credentials' | 'invalid_configuration' | 'unpriced_model' | 'unsafe_retries'; note: string }
  | {
      status: 'completed';
      report: NovaEvaluationRunReport;
      stoppedEarly: boolean;
      /**
       * PHASE 6B.1 (Priority 5) - count of real calls this run detected as
       * truncated/empty because the model hit the configured token cap
       * (finishReason MAX_TOKENS) rather than finishing naturally. ALWAYS
       * a test-harness configuration signal, never evidence of a
       * conversational-quality failure - see this file's own note string
       * below and NovaChatLiveEvalConfig.thinkingLevel's comment for why
       * this can happen even on a perfectly good model.
       */
      truncatedByTokenCapCount: number;
    };

// A deliberately pessimistic, documented ESTIMATE of the system-
// prompt/context overhead every real /api/nova/chat call carries
// (NOVA_SYSTEM_PROMPT + NOVA_SAFETY_INSTRUCTIONS + any consent-gated
// context addendum) - this harness has no way to read the real prompt's
// exact size from outside server.ts without duplicating it, and
// duplicating it would risk silently drifting out of sync with the real
// one. Deliberately overestimated so the budget reservation below errs
// toward stopping too early, never too late.
const ESTIMATED_SYSTEM_PROMPT_OVERHEAD_TOKENS = 3000;

// Conservative, well-known-to-be-rough chars-per-token heuristic (not a
// real tokenizer) - used ONLY for the pre-call budget reservation, never
// presented as a real token count. Real counts come from the server's
// own usageMetadata capture, read after each call.
function estimateInputTokensConservatively(message: string, historyLength: number): number {
  const messageTokens = Math.ceil(message.length / 3); // deliberately generous (real tokenizers are usually ~4 chars/token)
  const historyOverhead = historyLength * 40; // rough per-turn overhead for prior turns included in the request
  return ESTIMATED_SYSTEM_PROMPT_OVERHEAD_TOKENS + messageTokens + historyOverhead;
}

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} exceeded its ${ms}ms timeout`)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer!);
  }
}

export async function runNovaChatLiveModelEvaluation(
  config: NovaChatLiveEvalConfig,
  invoker: NovaChatInvoker,
  uidForScenario: (scenarioId: string) => string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<NovaChatLiveEvalOutcome> {
  if (!liveChatEvalExplicitlyEnabled(env)) {
    return {
      status: 'blocked',
      reason: 'not_explicitly_enabled',
      note: 'NOVA_LIVE_CHAT_EVAL is not set to "1". Per directive §4, controlled live-model mode must never run without an explicit execution flag, independent of whether credentials happen to be configured.',
    };
  }
  if (!hasLiveChatEvalCredentials(env)) {
    return {
      status: 'blocked',
      reason: 'no_credentials',
      note: 'GEMINI_API_KEY is not set (or is the placeholder value). No model call was made - per directive §4, no simulated/mocked result is ever substituted for a real one. Live-model evaluation is NOT RUN.',
    };
  }

  const allowlisted = NOVA_CHAT_SCENARIOS.filter((s) => s.allowedForLiveModelEval);
  const maxScenarios = config.maxScenarios ?? 3;
  const maxTotalUsd = config.maxTotalUsd ?? 0.05;
  const maxEstimatedInputTokensPerCall = config.maxEstimatedInputTokensPerCall ?? 4000;
  const maxOutputTokensPerCall = config.maxOutputTokensPerCall ?? 512;
  const requestTimeoutMs = config.requestTimeoutMs ?? 20000;
  const maxRetriesPerCall = config.maxRetriesPerCall ?? 0;
  const thinkingLevel = config.thinkingLevel;

  // An invalid budget must never become an unbounded/no-op budget via
  // Infinity, NaN, zero, or a negative token ceiling. In particular,
  // maxScenarios=0 must not produce a misleading "completed" run.
  const validInt = (n: number) => Number.isSafeInteger(n) && n > 0;
  if (!validInt(maxScenarios) || maxScenarios > allowlisted.length ||
      !Number.isFinite(maxTotalUsd) || maxTotalUsd <= 0 ||
      !validInt(maxEstimatedInputTokensPerCall) ||
      !validInt(maxOutputTokensPerCall) || !validInt(requestTimeoutMs)) {
    return {
      status: 'blocked',
      reason: 'invalid_configuration',
      note: 'Live evaluation NOT RUN: scenario count, token limits, timeout and total USD budget must all be finite positive values; scenario count must not exceed the approved allowlist.',
    };
  }
  // The invoker has no AbortSignal. A timed-out promise can still be
  // billed by the provider after Promise.race rejects; retrying it would
  // create overlapping, potentially billable calls. Fail closed until
  // cancellation/settlement support is explicitly implemented.
  if (maxRetriesPerCall !== 0) {
    return {
      status: 'blocked',
      reason: 'unsafe_retries',
      note: 'Live evaluation NOT RUN: retries are disabled because an HTTP timeout/rejection does not prove the previous Gemini request was cancelled or unbilled. Set maxRetriesPerCall=0.',
    };
  }
  const priceCheck = estimateModelCostUsd(config.modelId, maxEstimatedInputTokensPerCall, maxOutputTokensPerCall);
  if (priceCheck === null || !Number.isFinite(priceCheck) || priceCheck <= 0) {
    return {
      status: 'blocked',
      reason: 'unpriced_model',
      note: 'Live evaluation NOT RUN: the chosen model has no usable positive current price estimate. Budget enforcement cannot safely proceed without a priced model.',
    };
  }
  const scenarios = allowlisted.slice(0, maxScenarios);

  const results: NovaEvaluationRunReport['scenarioResults'] = [];
  let stoppedEarly = false;
  let stopReason = '';
  let spentUsd = 0;
  let totalPromptTokens = 0;
  let totalOutputTokens = 0;
  let callCount = 0;
  // PHASE 6B.1 (Priority 5) - see NovaChatLiveEvalOutcome's own comment.
  let truncatedByTokenCapCount = 0;

  // PHASE 6B (directive §3) - wraps the caller-supplied invoker with:
  // (1) a hard per-call request timeout, (2) a bounded retry count (0 by
  // default - "no unbounded retries"), (3) a PRE-CALL conservative
  // budget reservation that refuses to even attempt the call if the
  // already-spent total plus this call's worst-case estimate (its
  // pessimistic input-token estimate AND the full maxOutputTokensPerCall
  // ceiling, priced via the real model-price registry) would exceed
  // maxTotalUsd, and (4) a POST-CALL true-up against the REAL usage
  // server.ts now returns, which can also trip the same stop condition
  // even when the pre-call estimate underestimated reality.
  const budgetedInvoker: NovaChatInvoker = async (args) => {
    const estimatedInputTokens = estimateInputTokensConservatively(args.message, args.history.length);
    if (estimatedInputTokens > maxEstimatedInputTokensPerCall) {
      throw new Error('Live-model evaluation input estimate exceeded the configured per-call ceiling; no provider request was sent.');
    }
    // Reserve against the ENTIRE configured input-token allowance,
    // not the message's lower estimate. This remains an estimate, not
    // a provider-enforced exact billing cap.
    const worstCaseCostUsd = estimateModelCostUsd(config.modelId, maxEstimatedInputTokensPerCall, maxOutputTokensPerCall)!;
    if (spentUsd + worstCaseCostUsd > maxTotalUsd) {
      throw new Error(
        `Live-model evaluation budget reservation refused this call: already spent $${spentUsd.toFixed(5)}, ` +
        `this call's worst-case estimate is $${worstCaseCostUsd.toFixed(5)}, ceiling is $${maxTotalUsd}. Stopping before making the call.`,
      );
    }

    // Exactly one attempt per turn. No retry is safe here while the
    // underlying provider request cannot be cancelled on timeout.
    callCount++;
    const result = await withTimeout(
      invoker({ ...args, maxOutputTokens: maxOutputTokensPerCall, ...(thinkingLevel ? { thinkingLevel } : {}) }),
      requestTimeoutMs,
      'Live-model evaluation call',
    );
    const usage = result.body?.usage as
      | { promptTokens?: number; outputTokens?: number; thinkingTokens?: number; finishReason?: string | null }
      | undefined;
    // A successful HTTP response without valid measured usage is NOT a
    // free call. Never silently treat it as $0 and send another request.
    if (!usage || !Number.isFinite(usage.promptTokens) || !Number.isFinite(usage.outputTokens) ||
        !Number.isFinite(usage.thinkingTokens ?? 0) ||
        usage.promptTokens! < 0 || usage.outputTokens! < 0 || (usage.thinkingTokens ?? 0) < 0) {
      throw new Error('Live-model evaluation received no valid token-usage metadata; actual spend is unknown. Stopping without further calls.');
    }
    const billableOutputTokens = usage.outputTokens! + (usage.thinkingTokens ?? 0);
    totalPromptTokens += usage.promptTokens!;
    totalOutputTokens += billableOutputTokens;
    const realCostUsd = estimateModelCostUsd(config.modelId, usage.promptTokens!, billableOutputTokens);
    if (realCostUsd === null || !Number.isFinite(realCostUsd)) {
      throw new Error('Live-model evaluation could not price measured token usage; stopping without further calls.');
    }
    spentUsd += realCostUsd;
    const responseText = result.body?.text;
    if (usage.finishReason === 'MAX_TOKENS' && (!responseText || responseText.trim().length === 0)) {
      truncatedByTokenCapCount++;
    }
    if (spentUsd > maxTotalUsd) {
      throw new Error(`Live-model evaluation budget EXCEEDED after a real call: spent $${spentUsd.toFixed(5)} against a $${maxTotalUsd} ceiling. Stopping without retry.`);
    }
    return result;
  };

  for (const scenario of scenarios) {
    try {
      const result = await runScenario(scenario, budgetedInvoker, uidForScenario(scenario.id), undefined, { stopOnServerOrTransportError: true });
      results.push(result);
      // "Stops on ... unexpected errors": a 5xx, OR an invoker-level
      // failure (httpStatus 0 - runScenario's own turn loop degrades any
      // thrown invoker exception, including this file's own budget-
      // reservation refusal, post-call budget-exceeded stop, request
      // timeout, and exhausted-retries failure, into a {status:0,
      // error} turn result rather than letting it propagate as an
      // exception - see nova-chat-scenario-runner.ts) on any turn this
      // run never deliberately targets is treated as unexpected, not as
      // a normal scenario outcome to just record and move past.
      const unexpectedServerError = result.turnResults.some((t) => t.httpStatus >= 500 || t.httpStatus === 0);
      if (unexpectedServerError) {
        stoppedEarly = true;
        const failedTurn = result.turnResults.find((t) => t.httpStatus >= 500 || t.httpStatus === 0);
        stopReason = `Unexpected failure during scenario ${scenario.id}: ${failedTurn?.error ?? `HTTP ${failedTurn?.httpStatus}`} - stopping rather than continuing to spend real model calls against a possibly-broken or over-budget run.`;
        break;
      }
    } catch (e: any) {
      stoppedEarly = true;
      stopReason = `Stopped during scenario ${scenario.id}: ${e?.message ?? String(e)}`;
      break;
    }
  }

  const report = buildRunReport('live_gemini', results, {
    modelId: config.modelId,
    featureFlagState: {
      NOVA_TOOLS_ENABLED: env.NOVA_TOOLS_ENABLED !== 'false',
      NOVA_AGENTIC_JOURNEY_ENABLED: env.NOVA_AGENTIC_JOURNEY_ENABLED === 'true',
      GUARDIAN_SUPPORT_INVITATION_ENABLED: env.GUARDIAN_SUPPORT_INVITATION_ENABLED === 'true',
    },
    usage: { promptTokens: totalPromptTokens, outputTokens: totalOutputTokens },
    estimatedCostUsd: estimateModelCostUsd(config.modelId, totalPromptTokens, totalOutputTokens),
    note:
      `Controlled live-model run against ${results.length}/${scenarios.length} allowlisted scenario(s) (cap: ${maxScenarios}), ` +
      `model "${config.modelId}", via the real, unmodified /api/nova/chat route with a genuinely unmocked Gemini client. ` +
      `${callCount} real API call(s) made. Real token usage this run: ${totalPromptTokens} prompt / ${totalOutputTokens} output ` +
      `(from server.ts's own usageMetadata capture - see that route's own comment). Budget ceiling: $${maxTotalUsd}, spent (estimate from real tokens): $${spentUsd.toFixed(5)}. ` +
      `Per-call controls: maxOutputTokens=${maxOutputTokensPerCall} (provider-enforced), estimatedInputCeiling=${maxEstimatedInputTokensPerCall} (not provider-enforced), thinkingLevel=${thinkingLevel ?? '(model default)'}, requestTimeoutMs=${requestTimeoutMs}, retries disabled. Timed-out calls may still incur charges; USD ceilings are conservative estimates, not verified provider billing limits. ` +
      `No real external action, email, SMS, calendar write, or Guardian outreach is reachable from this path regardless of ` +
      `model output - every agentic tool in this app's NOVA_TOOLS is propose/offer/search-only at the server-tool-execution ` +
      `layer (see executeOfferGuardianSupport/executeOfferPracticalAssistance/executeProposeRecoveryAction in server.ts), ` +
      `independent of this evaluation. ${truncatedByTokenCapCount > 0
        ? `TEST-HARNESS LIMITATION (not a quality finding): ${truncatedByTokenCapCount} call(s) were truncated/empty because the model hit the configured token cap (finishReason=MAX_TOKENS) - raise maxOutputTokensPerCall and/or lower thinkingLevel before drawing any conversational-quality conclusion from the affected scenario(s). `
        : ''
      }${stoppedEarly ? `STOPPED EARLY: ${stopReason}` : 'Completed without early stop.'}`,
  });

  return { status: 'completed', report, stoppedEarly, truncatedByTokenCapCount };
}
