// PHASE 6A - the one shared runner for the Nova chat intelligence
// evaluation framework. Both offline mode
// (nova-chat-scenario-runner.offline.test.ts, mocked Gemini, real route)
// and controlled live-model mode
// (nova-chat-live-model-evaluation-runner.ts, real Gemini, real route)
// drive every scenario through THIS function - neither mode re-implements
// scenario execution, so a bug fixed here is fixed for both, and a new
// scenario in nova-chat-scenario-library.ts needs no runner change
// (directive §5: "extensible without rewriting its runner").
//
// This file never imports `@google/genai`, never calls fetch/http itself,
// and knows nothing about mocking. It only knows how to drive a
// `NovaChatInvoker` - the actual HTTP call (via supertest against the
// real exported `app`) is supplied by the caller, which is exactly what
// keeps this module honest about never being "a second Nova service": it
// has no model-calling or routing logic of its own at all.

import { evaluateHardInvariants } from './nova-chat-evaluation-criteria';
import type {
  NovaScenarioDefinition,
  NovaScenarioEvaluationResult,
  NovaScenarioTurnResult,
} from './nova-chat-scenario-types';

export interface NovaChatInvokerResult {
  status: number;
  body: any;
  /**
   * The systemInstruction the route actually sent to the model this
   * call, if the caller is able to observe it (offline mode's mocked
   * `@google/genai` client captures this directly). Live mode leaves
   * this undefined - it calls the real, unmocked SDK, so there is
   * nothing to intercept without changing the very call being verified.
   * `safety_floor_present` degrades to a documented "not inspectable in
   * this mode" pass rather than a false failure when this is absent.
   */
  systemInstructionSentToModel?: string | null;
}

export type NovaChatInvoker = (args: { uid: string; message: string; history: unknown[] }) => Promise<NovaChatInvokerResult>;

function memoryConsentFromScenario(scenario: NovaScenarioDefinition): boolean {
  const perms = scenario.permissionsDoc as { allowNovaMemory?: boolean; allowNovaUseSavedMemories?: boolean } | undefined;
  return Boolean(perms?.allowNovaMemory && perms?.allowNovaUseSavedMemories);
}

export async function runScenario(
  scenario: NovaScenarioDefinition,
  invoker: NovaChatInvoker,
  uid: string,
): Promise<NovaScenarioEvaluationResult> {
  const history: unknown[] = [];
  const turnResults: NovaScenarioTurnResult[] = [];
  const memoryConsentGranted = memoryConsentFromScenario(scenario);

  for (let i = 0; i < scenario.turns.length; i++) {
    const turn = scenario.turns[i];
    let result: NovaChatInvokerResult;
    let error: string | null = null;
    try {
      result = await invoker({ uid, message: turn.userMessage, history: [...history] });
    } catch (e: any) {
      result = { status: 0, body: null };
      error = e?.message ?? String(e);
    }

    const responseText: string | null = result.status === 200 && result.body ? (result.body.text ?? null) : null;
    const planTrace = (result.status === 200 && Array.isArray(result.body?.planTrace)) ? result.body.planTrace : [];
    if (result.status !== 200 && error === null) {
      error = typeof result.body?.error === 'string' ? result.body.error : `Non-200 status: ${result.status}`;
    }

    const turnResultBase: Omit<NovaScenarioTurnResult, 'hardInvariants'> = {
      turnIndex: i,
      userMessage: turn.userMessage,
      httpStatus: result.status,
      responseText,
      planTrace,
      error,
    };

    const hardInvariants = evaluateHardInvariants(turnResultBase, {
      systemInstructionSentToModel: result.systemInstructionSentToModel ?? null,
      memoryConsentGranted,
      additionalInvariants: turn.additionalHardInvariants ?? [],
    });

    turnResults.push({ ...turnResultBase, hardInvariants });

    history.push({ role: 'user', parts: [{ text: turn.userMessage }] });
    history.push({ role: 'model', parts: [{ text: responseText ?? '' }] });
  }

  const allHardInvariantsPassed = turnResults.every((t) => t.hardInvariants.every((h) => h.passed));

  return {
    scenarioId: scenario.id,
    category: scenario.category,
    title: scenario.title,
    turnResults,
    allHardInvariantsPassed,
    qualitativeReview: {
      focusPerTurn: scenario.turns.map((t) => t.qualitativeFocus),
      // Deliberately never auto-filled with a pass/fail verdict - see
      // nova-chat-evaluation-criteria.ts's header comment and directive
      // §6: "Model-based scoring, if used, must be identified as
      // automated judgment and never presented as independent
      // safeguarding approval." This framework does not even attempt
      // model-based scoring; the field exists so a FUTURE addition that
      // does cannot accidentally omit the label.
      automatedJudgment: null,
      reviewStatus: 'unreviewed',
      suggestedFollowUp: allHardInvariantsPassed
        ? 'No hard-invariant failures. Qualitative review (tone, understanding, appropriateness) still required before any conclusion about conversational quality.'
        : 'Hard-invariant failure(s) present - see turnResults[].hardInvariants. Investigate before any further use of this scenario/response pair as evidence.',
    },
  };
}

export async function runScenarios(
  scenarios: NovaScenarioDefinition[],
  invoker: NovaChatInvoker,
  uidForScenario: (scenario: NovaScenarioDefinition, index: number) => string,
): Promise<NovaScenarioEvaluationResult[]> {
  const results: NovaScenarioEvaluationResult[] = [];
  for (let i = 0; i < scenarios.length; i++) {
    results.push(await runScenario(scenarios[i], invoker, uidForScenario(scenarios[i], i)));
  }
  return results;
}
