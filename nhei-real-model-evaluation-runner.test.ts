// NHEI PHASE 3C-2B SECTION 4 - REAL-MODEL EVALUATION RUNNER TESTS
//
// Only the BLOCKED path is exercised - that is the only honest path
// available in this environment (confirmed: no GEMINI_API_KEY or
// equivalent credential exists anywhere in this session). This test
// file never calls a real model and never will, since the "completed"
// path throws unconditionally (see the runner's own comment on why).

import { describe, it, expect } from 'vitest';
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
