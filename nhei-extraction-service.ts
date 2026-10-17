// NHEI PHASE 3C-1 - CONVERSATION-TO-EVIDENCE EXTRACTION SERVICE
//
// Orchestrates: build the prompt (nhei-extraction-schema.ts), call a
// model (dependency-injected - see NheiModelCaller below), strictly
// validate the result (nhei-extraction-types.ts), convert surviving
// candidates into real NheiEvidenceRecord values. Nothing here persists
// anything - this file never imports nhei-persistence-service.ts's write
// functions. Nothing here is called from server.ts or any live route in
// Phase 3C-1.
//
// Why the model caller is dependency-injected, the same way
// nhei-persistence-service.ts injects `db`: this phase's own instruction
// is "use synthetic conversation fixtures only" and "do not make
// successful tests depend only on an LLM asserting that its own response
// was correct" - the only way to get reproducible, deterministic tests
// is to never let a real network call into the test suite. Every test in
// this phase supplies a fixed, synthetic NheiModelCaller. A real
// implementation (createGeminiExtractionCaller below) exists so this
// pipeline is genuinely "compatible with the existing Nova provider
// architecture," as instructed - but it is never invoked by anything in
// this phase, including its own tests.

import { buildExtractionPrompt, NHEI_EXTRACTION_RESPONSE_SCHEMA, type NheiExtractionPromptInput } from './nhei-extraction-schema';
import {
  validateExtractionBatch,
  toNheiEvidenceRecord,
  type NheiExtractionValidationResult,
  type NheiExtractionCandidate,
  type NheiExtractionCandidateValidationResult,
} from './nhei-extraction-types';
import { type NheiEvidenceRecord } from './nhei-types';

// The narrow surface this file needs from a model client - deliberately
// not importing @google/genai's GoogleGenAI type here, so this file
// never has a hard dependency on the real SDK and a fixture caller in a
// test never has to construct anything SDK-shaped.
export type NheiModelCaller = (prompt: string) => Promise<string>;

export interface NheiExtractionOutcome {
  batchId: string;
  records: NheiEvidenceRecord[];
  abstainedCount: number;
  invalidCandidateCount: number;
  rejectedForBatchLimit: number;
  recordConversionErrors: string[];
  // Phase 3C-2B Checkpoint 2 section 8, gap A: nhei-extraction-evaluation.ts's
  // evaluateExtractionRun scores against the pre-conversion
  // NheiExtractionCandidate shape (it needs `abstain`, `relativeOrder`,
  // etc. - fields a converted NheiEvidenceRecord does not carry), not the
  // `records` field above. Checkpoint 1 left this as an open gap because
  // nothing exposed the validated candidates themselves; these three
  // fields close it. validCandidates/abstainedCandidates are both
  // schema-valid (the distinction is only whether the model abstained);
  // invalidCandidates are the ones validateExtractionBatch rejected -
  // "access to validated AND rejected extraction candidates," per
  // instruction, not just the successfully converted subset.
  validCandidates: NheiExtractionCandidate[];
  abstainedCandidates: NheiExtractionCandidate[];
  invalidCandidates: NheiExtractionCandidateValidationResult[];
}

function parseModelJson(raw: string): { ok: true; candidates: unknown[] } | { ok: false; error: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, error: 'model output was not valid JSON' };
  }
  if (typeof parsed !== 'object' || parsed === null || !Array.isArray((parsed as Record<string, unknown>).candidates)) {
    return { ok: false, error: 'model output did not match the required {candidates: [...]} shape' };
  }
  return { ok: true, candidates: (parsed as Record<string, unknown>).candidates as unknown[] };
}

// The one function this file exposes. `batchId` namespaces the resulting
// evidence ids (and must be caller-supplied, not derived from anything
// in the model's output, so a model can never influence id collisions).
export async function extractEvidenceFromConversation(
  caller: NheiModelCaller,
  input: NheiExtractionPromptInput,
  batchId: string,
): Promise<NheiExtractionOutcome> {
  const prompt = buildExtractionPrompt(input);
  const raw = await caller(prompt);

  const parsed = parseModelJson(raw);
  if (parsed.ok === false) {
    return {
      batchId, records: [], abstainedCount: 0, invalidCandidateCount: 0, rejectedForBatchLimit: 0,
      recordConversionErrors: [parsed.error], validCandidates: [], abstainedCandidates: [], invalidCandidates: [],
    };
  }

  const validation: NheiExtractionValidationResult = validateExtractionBatch(parsed.candidates);

  const records: NheiEvidenceRecord[] = [];
  const recordConversionErrors: string[] = [];
  for (const candidate of validation.valid) {
    const converted = toNheiEvidenceRecord(candidate, batchId);
    if (converted.ok === true) records.push(converted.record);
    else recordConversionErrors.push(...converted.errors);
  }

  return {
    batchId,
    records,
    abstainedCount: validation.abstained.length,
    invalidCandidateCount: validation.invalid.length,
    rejectedForBatchLimit: validation.rejectedForBatchLimit,
    recordConversionErrors,
    validCandidates: validation.valid,
    abstainedCandidates: validation.abstained,
    invalidCandidates: validation.invalid,
  };
}

// ---- Real provider caller - never invoked by this phase's own code or tests ----
//
// Exists only so this pipeline is "compatible with the existing Nova
// provider architecture," as instructed. Takes an already-constructed
// GoogleGenAI client and model name as plain parameters (never imports
// or constructs a live client itself), matching the DI shape every other
// function in this file uses. Wiring this into any real request path is
// explicitly Phase 3C-2+ work.
export interface NheiGeminiClientLike {
  models: {
    generateContent: (args: {
      model: string;
      contents: string;
      config: { responseMimeType: string; responseSchema: unknown };
    }) => Promise<{
      text?: string;
      // Phase 3C-2B Checkpoint 2 section 8, gap B: the real @google/genai
      // response carries usageMetadata - optional here because a fixture
      // caller in a test has no reason to construct it, and the plain
      // createGeminiExtractionCaller below still ignores it entirely
      // (unchanged from Phase 3C-1, since nothing there ever needed it).
      usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
    }>;
  };
}

export function createGeminiExtractionCaller(client: NheiGeminiClientLike, model: string): NheiModelCaller {
  return async (prompt: string): Promise<string> => {
    const response = await client.models.generateContent({
      model,
      contents: prompt,
      config: { responseMimeType: 'application/json', responseSchema: NHEI_EXTRACTION_RESPONSE_SCHEMA },
    });
    if (!response.text) throw new Error('Empty response from extraction model.');
    return response.text;
  };
}

export interface NheiGeminiCallTokenUsage {
  promptTokens: number;
  outputTokens: number;
}

// Phase 3C-2B Checkpoint 2 section 8, gap B fix. createGeminiExtractionCaller
// above deliberately keeps NheiModelCaller's plain `Promise<string>`
// signature unchanged - extractEvidenceFromConversation, every existing
// test, and every other caller in this codebase depends on that exact
// shape, and widening it to also return usage would be a breaking change
// for no benefit to any of them. This function returns something that
// STILL satisfies NheiModelCaller (so it drops straight into
// extractEvidenceFromConversation with no other change), but also
// appends one NheiGeminiCallTokenUsage entry to the caller-supplied
// `usageSink` array per call - an output parameter, not a return-type
// change, specifically so a cost-tracking caller (the real-model
// evaluation runner) can read usage after the fact without altering the
// interface everything else relies on. Missing/malformed usage fields
// are recorded as 0, never thrown - a model response with no usage
// metadata should degrade the cost estimate, not break extraction.
export function createGeminiExtractionCallerWithUsage(
  client: NheiGeminiClientLike,
  model: string,
  usageSink: NheiGeminiCallTokenUsage[],
): NheiModelCaller {
  return async (prompt: string): Promise<string> => {
    const response = await client.models.generateContent({
      model,
      contents: prompt,
      config: { responseMimeType: 'application/json', responseSchema: NHEI_EXTRACTION_RESPONSE_SCHEMA },
    });
    if (!response.text) throw new Error('Empty response from extraction model.');
    usageSink.push({
      promptTokens: typeof response.usageMetadata?.promptTokenCount === 'number' ? response.usageMetadata.promptTokenCount : 0,
      outputTokens: typeof response.usageMetadata?.candidatesTokenCount === 'number' ? response.usageMetadata.candidatesTokenCount : 0,
    });
    return response.text;
  };
}
