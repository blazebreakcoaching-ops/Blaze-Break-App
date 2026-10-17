// NHEI PHASE 3C-2B SECTION 4 - REAL-MODEL EVALUATION RUNNER (PREPARED, BLOCKED)
//
// This file is the prepared harness section 4 asks for: "prepare and,
// where safe and authorised, execute an isolated extraction evaluation
// using the existing Gemini integration." It was NOT executed in this
// environment - before writing this file, the environment was checked
// for GEMINI_API_KEY, GOOGLE_API_KEY, GENAI-prefixed, and VERTEX-prefixed
// environment variables, for a .env file (only .env.example, a template
// with no real values, exists), for a secrets directory, and for a
// reachable GCP metadata server (none reachable from this sandbox) - no
// usable credential exists anywhere in this session. Per instruction's
// own fallback, this file implements the harness and
// hasGeminiCredentials()/runRealModelEvaluation() report the run as
// BLOCKED rather than attempting a call that would fail, and - the
// explicit instruction this guards against - NEVER substitutes a
// simulated score for a real-model result.
//
// Isolation guarantees this file's real-execution path (unexercised in
// this environment, but written to be correct for a future authorised
// run):
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

import { type NheiEvaluationDatasetSummary, type NheiInterpretationStabilityResult } from './nhei-extraction-evaluation';

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

// Rough, clearly-labelled ESTIMATE only - not an authoritative billing
// figure. Real pricing should be checked against Google's current
// published rates at run time, not trusted to a hardcoded table that can
// go stale. This exists only so a run report has SOME cost signal
// immediately, not as a source of truth.
const APPROXIMATE_USD_PER_1K_TOKENS: Record<string, { prompt: number; output: number }> = {
  'gemini-2.0-flash': { prompt: 0.0001, output: 0.0004 },
};

function estimateCostUsd(modelId: string, usage: NheiRealModelTokenUsage): number | null {
  const rate = APPROXIMATE_USD_PER_1K_TOKENS[modelId];
  if (!rate) return null; // unknown model - report no estimate rather than a wrong one
  return (usage.promptTokens / 1000) * rate.prompt + (usage.outputTokens / 1000) * rate.output;
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

  // ---- Real execution path: INTENTIONALLY NOT IMPLEMENTED ----
  //
  // Honesty over the appearance of completeness: this path cannot be
  // exercised or verified in this environment (no credentials exist to
  // run it against), so it deliberately throws rather than returning a
  // "completed" report built from data that was never actually
  // measured. Silently returning e.g. totalTokenUsage: {promptTokens: 0,
  // outputTokens: 0} would be worse than this error - it would look like
  // a genuine zero-cost real result instead of what it actually is (no
  // result at all). Two real architectural gaps a future authorised
  // implementer must resolve before this can run for real, named
  // explicitly rather than papered over:
  //   1. extractEvidenceFromConversation (nhei-extraction-service.ts)
  //      returns validated NheiEvidenceRecord values, not the
  //      pre-conversion NheiExtractionCandidate values
  //      evaluateExtractionRun scores against - a real wiring needs a
  //      variant that also returns (or scores against) the candidates
  //      themselves, including ones that failed conversion, to measure
  //      accuracy honestly rather than only on the subset that already
  //      became valid evidence.
  //   2. createGeminiExtractionCaller's NheiModelCaller signature
  //      returns only `Promise<string>` (the response text) - token
  //      usage (response.usageMetadata in the real @google/genai
  //      response) is discarded at that boundary. A real wiring needs
  //      either a caller variant that also surfaces usage, or to call
  //      client.models.generateContent directly here instead of
  //      through createGeminiExtractionCaller.
  // A real implementation would construct a GoogleGenAI client from
  // process.env.GEMINI_API_KEY, wrap it with createGeminiExtractionCaller
  // (nhei-extraction-service.ts), run extractEvidenceFromConversation
  // per fixture from NHEI_EVALUATION_DATASET, score with
  // evaluateExtractionRun, and aggregate with summarizeEvaluationRuns /
  // assessInterpretationStability - once gaps 1 and 2 above are
  // resolved. config is intentionally unused until then.
  void config;
  throw new Error(
    'runRealModelEvaluation: the real-execution path is intentionally unimplemented - see this function\'s ' +
    'comment for the two specific architectural gaps that must be resolved first. This should never be reached ' +
    'in practice: hasGeminiCredentials() returned true, meaning a real GEMINI_API_KEY is configured, but no ' +
    'environment this phase was developed in ever had one, so this line was never exercised or verified.',
  );
}
