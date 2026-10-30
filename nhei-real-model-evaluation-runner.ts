// NHEI PHASE 3C-2B SECTION 4 (HARNESS) / CHECKPOINT 2 SECTION 8 (REAL
// EXECUTION PATH COMPLETED) - REAL-MODEL EVALUATION RUNNER
//
// This file is the prepared harness section 4 asked for: "prepare and,
// where safe and authorised, execute an isolated extraction evaluation
// using the existing Gemini integration." It was NOT executed in this
// environment, in either phase - before writing this file, the
// environment was checked for GEMINI_API_KEY, GOOGLE_API_KEY,
// GENAI-prefixed, and VERTEX-prefixed environment variables, for a .env
// file (only .env.example, a template with no real values, exists), for
// a secrets directory, and for a reachable GCP metadata server (none
// reachable from this sandbox) - no usable credential exists anywhere in
// this session, confirmed again this checkpoint. Per instruction's own
// fallback, hasGeminiCredentials()/runRealModelEvaluation() still report
// the run as BLOCKED rather than attempting a call that would fail, and -
// the explicit instruction this guards against - NEVER substitute a
// simulated score for a real-model result.
//
// Checkpoint 1 left the real-execution path (below) deliberately
// unimplemented, naming two architectural gaps rather than faking
// completeness. Checkpoint 2 section 8 closes both:
//   A. extractEvidenceFromConversation (nhei-extraction-service.ts) now
//      also returns validCandidates/abstainedCandidates/invalidCandidates -
//      the pre-conversion NheiExtractionCandidate shape
//      evaluateExtractionRun actually scores against - not just the
//      converted NheiEvidenceRecord values it always returned.
//   B. createGeminiExtractionCallerWithUsage (nhei-extraction-service.ts)
//      wraps the real Gemini client and surfaces real token usage via a
//      caller-supplied sink, without changing NheiModelCaller's plain
//      string-returning signature anywhere else in this codebase.
// The real-execution code below is therefore now implemented and
// correct, but still UNEXERCISED in this environment - no credentials
// exist here to run it against, so hasGeminiCredentials() still returns
// false and the function still returns a BLOCKED report before reaching
// any of this code, exactly as before. "Implemented" and "verified
// against a real model" remain two different claims; only the first is
// true of this checkpoint's work.
//
// Isolation guarantees this file's real-execution path (still
// unexercised in this environment, but now actually implemented, not a
// stub):
//   * Synthetic conversations only - reads exclusively from
//     nhei-extraction-evaluation-dataset.ts, never from any live
//     conversation, Firestore collection, or user data source.
//   * No Firestore persistence anywhere in this file - it has no
//     `db` parameter at all and imports no persistence-service file.
//   * No live Nova route is touched or modified - this file is a
//     standalone script module, not a server.ts route.
//   * No production-facing feature is activated by running this file -
//     it only returns a report object to its caller.
//   * Uses ONLY an already-configured GEMINI_API_KEY already present in
//     the environment - this file never creates, requests, or
//     provisions a credential, and never has a hardcoded fallback key.
//   * Never logs, returns, or otherwise discloses the API key itself -
//     hasGeminiCredentials() only ever returns a boolean.

import { GoogleGenAI } from '@google/genai';
import {
  evaluateExtractionRun,
  summarizeEvaluationRuns,
  assessInterpretationStability,
  type NheiEvaluationDatasetSummary,
  type NheiInterpretationStabilityResult,
  type NheiEvaluationMetrics,
} from './nhei-extraction-evaluation';
import { NHEI_EVALUATION_DATASET } from './nhei-extraction-evaluation-dataset';
import {
  extractEvidenceFromConversation,
  createGeminiExtractionCallerWithUsage,
  type NheiGeminiCallTokenUsage,
} from './nhei-extraction-service';
import { type NheiExtractionCandidate } from './nhei-extraction-types';
import { estimateModelCostUsd } from './ai-model-price-registry';

export function hasGeminiCredentials(env: NodeJS.ProcessEnv = process.env): boolean {
  const key = env.GEMINI_API_KEY;
  // Matches server.ts's own existing placeholder-detection convention
  // (search "MY_GEMINI_API_KEY" in server.ts) - a placeholder value left
  // in an env file by a template is not a real credential.
  return typeof key === 'string' && key.length > 0 && key !== 'MY_GEMINI_API_KEY';
}

export interface NheiRealModelRunConfig {
  // Required, never defaulted silently - "document the model
  // identifier" means the caller states it explicitly, every time.
  modelId: string;
  // Bounds cost for a real run - omit to run the full dataset, which a
  // real authorised run should only do deliberately.
  maxFixtures?: number;
  // When >= 2, a SUBSET (the first `repeatSubsetSize` fixtures, default
  // 3) is run this many times each to assess interpretation stability -
  // "repeat a subset of scenarios to assess consistency."
  repeatCount?: number;
  repeatSubsetSize?: number;
}

export interface NheiRealModelTokenUsage {
  promptTokens: number;
  outputTokens: number;
}

// PHASE 6B (directive §2): this used to be a local, one-model hardcoded
// table ('gemini-2.0-flash' only) that silently returned null for every
// real run against this app's ACTUAL model (GEMINI_TEXT_MODEL =
// "gemini-3.5-flash", per ai-model-registry.ts) - a staleness bug this
// consolidation fixes. See ai-model-price-registry.ts's own header
// comment for why every price here is a clearly-labelled estimate, not
// an authoritative billing figure.
function estimateCostUsd(modelId: string, usage: NheiRealModelTokenUsage): number | null {
  return estimateModelCostUsd(modelId, usage.promptTokens, usage.outputTokens);
}

export interface NheiRealModelRunReport {
  status: 'blocked' | 'completed';
  blockedReason?: 'no_credentials';
  modelId?: string;
  fixturesRun?: number;
  totalTokenUsage?: NheiRealModelTokenUsage;
  estimatedCostUsd?: number | null;
  metrics?: NheiEvaluationDatasetSummary;
  stability?: NheiInterpretationStabilityResult;
  note: string;
}

// The one entry point. Returns a BLOCKED report immediately, with no
// network call of any kind, whenever hasGeminiCredentials() is false -
// which is the only path this file's own tests exercise, since that is
// the only honest path available in this environment.
export async function runRealModelEvaluation(config: NheiRealModelRunConfig): Promise<NheiRealModelRunReport> {
  if (!hasGeminiCredentials()) {
    return {
      status: 'blocked',
      blockedReason: 'no_credentials',
      note:
        'GEMINI_API_KEY is not set (or is the placeholder value) in this environment - checked directly before ' +
        'this run. Per instruction, no simulated score is substituted for a real-model result: this run did not ' +
        'execute any model call, and real-model extraction accuracy remains UNVERIFIED. See the Phase 3C-2B ' +
        'delivery report section 3 for what IS verified (the harness mechanics against hand-constructed fixtures).',
    };
  }

  // ---- Real execution path: NOW IMPLEMENTED (Phase 3C-2B Checkpoint 2
  // section 8) - still UNEXERCISED in this environment, since
  // hasGeminiCredentials() is false here and this function returned
  // above. Written to be correct for a future authorised run, not
  // verified against a real model by this phase. The two gaps
  // Checkpoint 1 left open are both closed:
  //   A. extractEvidenceFromConversation now also returns
  //      validCandidates/abstainedCandidates/invalidCandidates - the
  //      pre-conversion NheiExtractionCandidate shape
  //      evaluateExtractionRun actually scores against - alongside the
  //      converted `records` it always returned.
  //   B. createGeminiExtractionCallerWithUsage wraps the real Gemini
  //      client exactly like createGeminiExtractionCaller, but also
  //      pushes each call's real token usage into a caller-supplied
  //      sink, without changing NheiModelCaller's plain-string return
  //      type anywhere else in this codebase.
  const client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY ?? '' });
  const usageSink: NheiGeminiCallTokenUsage[] = [];
  const caller = createGeminiExtractionCallerWithUsage(client, config.modelId, usageSink);

  const fixtures = typeof config.maxFixtures === 'number'
    ? NHEI_EVALUATION_DATASET.slice(0, Math.max(0, config.maxFixtures))
    : NHEI_EVALUATION_DATASET;

  const runMetrics: NheiEvaluationMetrics[] = [];
  for (const fixture of fixtures) {
    const outcome = await extractEvidenceFromConversation(caller, { turns: fixture.turns }, `real_eval_${fixture.id}`);
    // Scored against the pre-conversion candidates (gap A), combining
    // non-abstained and abstained (both schema-valid) and restoring the
    // model's own narrative order - evaluateExtractionRun's content-aware
    // matching does not require this order, but reporting candidates in
    // a stable, deterministic order keeps this run's output reproducible
    // across repeated calls with the same model response.
    const modelCandidates: NheiExtractionCandidate[] = [...outcome.validCandidates, ...outcome.abstainedCandidates]
      .sort((a, b) => a.relativeOrder - b.relativeOrder);
    runMetrics.push(evaluateExtractionRun({ fixture, modelCandidates }));
  }

  // Interpretation stability (section 8: "repeat a subset of scenarios
  // to assess consistency"). assessInterpretationStability compares
  // candidate arrays from REPEATED RUNS OF THE SAME CONVERSATION,
  // position by position - it has no notion of combining results across
  // several different fixtures into one assessment. Design choice, made
  // explicit rather than left ambiguous: this run repeats only the
  // FIRST fixture in the configured subset (named in the report's
  // `note`), `repeatCount` times. `repeatSubsetSize` still bounds which
  // fixtures were eligible to be chosen, matching the instruction's
  // "repeat a subset" framing, even though only one of that subset is
  // actually used for the stability metric itself.
  let stability: NheiInterpretationStabilityResult | undefined;
  let stabilityFixtureId: string | undefined;
  const repeatCount = config.repeatCount ?? 0;
  if (repeatCount >= 2) {
    const subsetSize = Math.max(1, config.repeatSubsetSize ?? 3);
    const subset = NHEI_EVALUATION_DATASET.slice(0, subsetSize);
    const repeatedFixture = subset[0];
    if (repeatedFixture) {
      stabilityFixtureId = repeatedFixture.id;
      const runs: NheiExtractionCandidate[][] = [];
      for (let i = 0; i < repeatCount; i++) {
        const outcome = await extractEvidenceFromConversation(caller, { turns: repeatedFixture.turns }, `real_eval_stability_${repeatedFixture.id}_${i}`);
        runs.push([...outcome.validCandidates, ...outcome.abstainedCandidates].sort((a, b) => a.relativeOrder - b.relativeOrder));
      }
      stability = assessInterpretationStability(runs);
    }
  }

  const totalTokenUsage: NheiRealModelTokenUsage = usageSink.reduce(
    (acc, u) => ({ promptTokens: acc.promptTokens + u.promptTokens, outputTokens: acc.outputTokens + u.outputTokens }),
    { promptTokens: 0, outputTokens: 0 },
  );

  return {
    status: 'completed',
    modelId: config.modelId,
    fixturesRun: fixtures.length,
    totalTokenUsage,
    estimatedCostUsd: estimateCostUsd(config.modelId, totalTokenUsage),
    metrics: summarizeEvaluationRuns(runMetrics),
    stability,
    note:
      `Real-model run against ${fixtures.length} synthetic fixture(s) from nhei-extraction-evaluation-dataset.ts, ` +
      `model "${config.modelId}". ${stability
        ? `Interpretation stability assessed by repeating fixture "${stabilityFixtureId}" ${repeatCount} times.`
        : 'Interpretation stability not assessed this run (repeatCount < 2 or no fixtures available).'} ` +
      'No Firestore persistence, no production route, no user data - synthetic conversations only.',
  };
}
