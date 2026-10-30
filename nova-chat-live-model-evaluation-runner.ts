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
}

export type NovaChatLiveEvalOutcome =
  | { status: 'blocked'; reason: 'not_explicitly_enabled' | 'no_credentials'; note: string }
  | { status: 'completed'; report: NovaEvaluationRunReport; stoppedEarly: boolean };

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
  const maxScenarios = Math.max(0, config.maxScenarios ?? 3);
  const scenarios = allowlisted.slice(0, maxScenarios);

  const results: NovaEvaluationRunReport['scenarioResults'] = [];
  let stoppedEarly = false;
  let stopReason = '';

  for (const scenario of scenarios) {
    try {
      const result = await runScenario(scenario, invoker, uidForScenario(scenario.id));
      results.push(result);
      // "Stops on ... unexpected errors": a 5xx on any turn this run
      // never deliberately targets (none of the allowlisted scenarios
      // are designed to trigger one) is treated as unexpected, not as a
      // normal scenario outcome to just record and move past.
      const unexpectedServerError = result.turnResults.some((t) => t.httpStatus >= 500);
      if (unexpectedServerError) {
        stoppedEarly = true;
        stopReason = `Unexpected server error encountered during scenario ${scenario.id} - stopping rather than continuing to spend real model calls against a possibly-broken run.`;
        break;
      }
    } catch (e: any) {
      stoppedEarly = true;
      stopReason = `Unexpected exception running scenario ${scenario.id}: ${e?.message ?? String(e)} - stopping rather than continuing.`;
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
    usage: null,
    estimatedCostUsd: null,
    note:
      `Controlled live-model run against ${results.length}/${scenarios.length} allowlisted scenario(s) (cap: ${maxScenarios}), ` +
      `model "${config.modelId}", via the real, unmodified /api/nova/chat route with a genuinely unmocked Gemini client. ` +
      `No real external action, email, SMS, calendar write, or Guardian outreach is reachable from this path regardless of ` +
      `model output - every agentic tool in this app's NOVA_TOOLS is propose/offer/search-only at the server-tool-execution ` +
      `layer (see executeOfferGuardianSupport/executeOfferPracticalAssistance/executeProposeRecoveryAction in server.ts), ` +
      `independent of this evaluation. Token-level cost accounting is not available via this route's response shape - see ` +
      `this file's own header comment. ${stoppedEarly ? `STOPPED EARLY: ${stopReason}` : 'Completed without early stop.'}`,
  });

  return { status: 'completed', report, stoppedEarly };
}
