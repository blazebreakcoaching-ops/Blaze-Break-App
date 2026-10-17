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
    return { batchId, records: [], abstainedCount: 0, invalidCandidateCount: 0, rejectedForBatchLimit: 0, recordConversionErrors: [parsed.error] };
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
    }) => Promise<{ text?: string }>;
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
