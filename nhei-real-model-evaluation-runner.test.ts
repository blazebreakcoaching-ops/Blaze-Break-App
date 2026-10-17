// NHEI PHASE 3C-2B SECTION 4 (HARNESS) / CHECKPOINT 2 SECTION 8 (REAL
// EXECUTION PATH) - REAL-MODEL EVALUATION RUNNER TESTS
//
// The first two describe blocks below exercise the BLOCKED path only -
// that remains the only HONEST path against this actual environment's
// real process.env (confirmed: no GEMINI_API_KEY or equivalent
// credential exists anywhere in this session). Those tests never call a
// real model and never will.
//
// The third describe block ("real execution path, with a mocked Gemini
// client") is different and is named to say so explicitly: it
// temporarily sets a FAKE, non-placeholder GEMINI_API_KEY and mocks
// @google/genai entirely (vi.mock, hoisted - the same pattern
// nova-chat-safety.route.test.ts already uses for this exact module) so
// that no real network call is ever possible, while still exercising the
// real-execution CODE this checkpoint implemented - proving gaps A and B
// are actually wired correctly, without claiming this is evidence of
// real-model accuracy. The env var is restored in afterEach so no other
// test file ever observes a fake credential.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockGenerateContent = vi.fn();
vi.mock('@google/genai', () => ({
  GoogleGenAI: class {
    models = { generateContent: mockGenerateContent };
  },
  // nhei-extraction-schema.ts (imported transitively via
  // nhei-extraction-service.ts) references Type.OBJECT/.STRING/etc at
  // module load time to build NHEI_EXTRACTION_RESPONSE_SCHEMA - needed
  // here even though this test never touches that schema directly.
  Type: { OBJECT: 'OBJECT', STRING: 'STRING', ARRAY: 'ARRAY', NUMBER: 'NUMBER', BOOLEAN: 'BOOLEAN', INTEGER: 'INTEGER' },
}));

import { hasGeminiCredentials, runRealModelEvaluation } from './nhei-real-model-evaluation-runner';

describe('hasGeminiCredentials', () => {
  it('is false when GEMINI_API_KEY is unset', () => {
    expect(hasGeminiCredentials({})).toBe(false);
  });

  it('is false for the known placeholder value', () => {
    expect(hasGeminiCredentials({ GEMINI_API_KEY: 'MY_GEMINI_API_KEY' })).toBe(false);
  });

  it('is false for an empty string', () => {
    expect(hasGeminiCredentials({ GEMINI_API_KEY: '' })).toBe(false);
  });

  it('is true for any other non-empty value', () => {
    expect(hasGeminiCredentials({ GEMINI_API_KEY: 'some-real-looking-key' })).toBe(true);
  });

  it('reflects this actual environment as having no usable credential', () => {
    // No mock env passed - reads the real process.env, confirming the
    // same finding this phase's delivery report states in prose.
    expect(hasGeminiCredentials()).toBe(false);
  });
});

describe('runRealModelEvaluation - reports blocked rather than substituting a simulated score', () => {
  it('returns a blocked report with no_credentials, since this environment has none', async () => {
    const report = await runRealModelEvaluation({ modelId: 'gemini-2.0-flash' });
    expect(report.status).toBe('blocked');
    expect(report.blockedReason).toBe('no_credentials');
    expect(report.metrics).toBeUndefined();
    expect(report.totalTokenUsage).toBeUndefined();
  });

  it('never returns a "completed" status with zero/empty data standing in for a real result', async () => {
    const report = await runRealModelEvaluation({ modelId: 'gemini-2.0-flash' });
    expect(report.status).not.toBe('completed');
  });

  it('the blocked report never includes an actual credential VALUE, even though its note names the env var for explanation', async () => {
    // Naming the env var ("GEMINI_API_KEY") to explain what was checked
    // is not a leak - what must never appear is an actual key VALUE.
    // hasGeminiCredentials() itself never returns or logs the value (see
    // its own signature - it returns only a boolean), and the blocked
    // report's note is a fixed string that never interpolates anything
    // read from the environment - confirmed directly against this
    // actual (credential-less) environment's real report.
    const report = await runRealModelEvaluation({ modelId: 'gemini-2.0-flash' });
    const serialized = JSON.stringify(report);
    // A real Gemini key would never match this shape by coincidence;
    // this just confirms the note is the fixed explanatory string, not
    // something built by interpolating an environment value into it.
    expect(serialized).not.toMatch(/AIza[0-9A-Za-z_-]{10,}/); // common Google API key prefix pattern
  });
});

describe('runRealModelEvaluation - real execution path, with a mocked Gemini client (never a real network call)', () => {
  const ORIGINAL_KEY = process.env.GEMINI_API_KEY;

  beforeEach(() => {
    process.env.GEMINI_API_KEY = 'fake-test-key-not-real-AIzaFAKE1234567890';
    mockGenerateContent.mockReset();
  });

  afterEach(() => {
    if (ORIGINAL_KEY === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = ORIGINAL_KEY;
  });

  function geminiResponse(candidates: unknown[], usage?: { promptTokenCount: number; candidatesTokenCount: number }) {
    return { text: JSON.stringify({ candidates }), usageMetadata: usage };
  }

  it('gap A + B together: produces a "completed" report with real metrics and real token usage from the (mocked) model responses', async () => {
    mockGenerateContent.mockResolvedValue(geminiResponse(
      [{ candidateId: 'a', abstain: false, sourceType: 'USER_REPORTED_EVENT', selfSystems: ['RELATIONAL_SELF'], dimensions: [], relativeOrder: 0, timeUncertainty: 'unknown', evidenceQuality: 'medium', relatedCandidateIds: [] }],
      { promptTokenCount: 100, candidatesTokenCount: 30 },
    ));

    const report = await runRealModelEvaluation({ modelId: 'gemini-2.0-flash', maxFixtures: 2 });

    expect(report.status).toBe('completed');
    expect(report.fixturesRun).toBe(2);
    expect(report.metrics).toBeDefined();
    // Real token usage, summed across both fixture calls - proves gap B
    // (usage actually reaches the report, not discarded at the caller
    // boundary the way it was before this checkpoint).
    expect(report.totalTokenUsage).toEqual({ promptTokens: 200, outputTokens: 60 });
    expect(report.estimatedCostUsd).not.toBeNull();
    expect(mockGenerateContent).toHaveBeenCalledTimes(2);
  });

  it('gap A: scores against the pre-conversion candidate shape, including an abstained candidate, not just converted evidence records', async () => {
    // One real event candidate, one abstained candidate - evaluateExtractionRun
    // needs both (abstentions have their own scoring category), which
    // only validCandidates/abstainedCandidates (gap A) can supply.
    mockGenerateContent.mockResolvedValue(geminiResponse([
      { candidateId: 'a', abstain: false, sourceType: 'USER_REPORTED_EVENT', selfSystems: [], dimensions: [], relativeOrder: 0, timeUncertainty: 'unknown', evidenceQuality: 'medium', relatedCandidateIds: [] },
      { candidateId: 'b', abstain: true, sourceType: 'USER_REPORTED_EVENT', selfSystems: [], dimensions: [], relativeOrder: 1, timeUncertainty: 'unknown', evidenceQuality: 'unknown', relatedCandidateIds: [] },
    ]));

    const report = await runRealModelEvaluation({ modelId: 'gemini-2.0-flash', maxFixtures: 1 });
    expect(report.status).toBe('completed');
    expect(report.metrics?.datasetSize).toBe(1);
  });

  it('assesses interpretation stability by repeating one fixture when repeatCount >= 2, naming which fixture in the note', async () => {
    mockGenerateContent.mockResolvedValue(geminiResponse(
      [{ candidateId: 'a', abstain: false, sourceType: 'USER_REPORTED_EVENT', selfSystems: [], dimensions: [], relativeOrder: 0, timeUncertainty: 'unknown', evidenceQuality: 'medium', relatedCandidateIds: [] }],
      { promptTokenCount: 10, candidatesTokenCount: 5 },
    ));

    const report = await runRealModelEvaluation({ modelId: 'gemini-2.0-flash', maxFixtures: 1, repeatCount: 2, repeatSubsetSize: 1 });
    expect(report.status).toBe('completed');
    expect(report.stability).toBeDefined();
    expect(report.note).toContain('repeating fixture');
  });

  it('does not assess stability when repeatCount is omitted - no stability field, and the note says so', async () => {
    mockGenerateContent.mockResolvedValue(geminiResponse([]));
    const report = await runRealModelEvaluation({ modelId: 'gemini-2.0-flash', maxFixtures: 1 });
    expect(report.status).toBe('completed');
    expect(report.stability).toBeUndefined();
    expect(report.note).toContain('not assessed');
  });

  it('never leaks the fake credential value into the report', async () => {
    mockGenerateContent.mockResolvedValue(geminiResponse([]));
    const report = await runRealModelEvaluation({ modelId: 'gemini-2.0-flash', maxFixtures: 1 });
    const serialized = JSON.stringify(report);
    expect(serialized).not.toContain(process.env.GEMINI_API_KEY);
  });
});
