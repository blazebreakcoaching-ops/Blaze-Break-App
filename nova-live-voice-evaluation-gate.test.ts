import { describe, it, expect } from 'vitest';
import {
  checkLiveVoiceEvalGate,
  liveVoiceEvalExplicitlyEnabled,
  hasLiveVoiceEvalCredentials,
  isLiveVoiceEvalGateBlocked,
  MAX_LIVE_VOICE_EVAL_SESSION_MS,
  MAX_LIVE_VOICE_EVAL_BUDGET_USD,
} from './nova-live-voice-evaluation-gate';

// PHASE 6D (Priority 4) - regression coverage for the real-provider
// voice-evaluation gate added this phase. Every case here constructs its
// own isolated env object rather than mutating process.env, so this file
// can never accidentally leave NOVA_LIVE_VOICE_EVAL=1 set for a later
// test in the same worker.

describe('nova-live-voice-evaluation-gate (Phase 6D Priority 4)', () => {
  it('blocked, reason not_explicitly_enabled, when the flag is unset even with real-looking credentials present', () => {
    const env = { GEMINI_API_KEY: 'a-real-looking-key' } as NodeJS.ProcessEnv;
    expect(liveVoiceEvalExplicitlyEnabled(env)).toBe(false);
    expect(hasLiveVoiceEvalCredentials(env)).toBe(true);
    const result = checkLiveVoiceEvalGate(env);
    expect(isLiveVoiceEvalGateBlocked(result)).toBe(true);
    if (isLiveVoiceEvalGateBlocked(result)) expect(result.reason).toBe('not_explicitly_enabled');
  });

  it('blocked, reason no_credentials, when the flag is set but no real key is configured', () => {
    const env = { NOVA_LIVE_VOICE_EVAL: '1' } as NodeJS.ProcessEnv;
    expect(hasLiveVoiceEvalCredentials(env)).toBe(false);
    const result = checkLiveVoiceEvalGate(env);
    expect(isLiveVoiceEvalGateBlocked(result)).toBe(true);
    if (isLiveVoiceEvalGateBlocked(result)) expect(result.reason).toBe('no_credentials');
  });

  it('blocked, reason no_credentials, when the flag is set but the key is still the placeholder value', () => {
    const env = { NOVA_LIVE_VOICE_EVAL: '1', GEMINI_API_KEY: 'MY_GEMINI_API_KEY' } as NodeJS.ProcessEnv;
    const result = checkLiveVoiceEvalGate(env);
    expect(isLiveVoiceEvalGateBlocked(result)).toBe(true);
    if (isLiveVoiceEvalGateBlocked(result)) expect(result.reason).toBe('no_credentials');
  });

  it('allowed only when both the explicit flag AND a real credential are present together', () => {
    const env = { NOVA_LIVE_VOICE_EVAL: '1', GEMINI_API_KEY: 'a-real-looking-key' } as NodeJS.ProcessEnv;
    expect(checkLiveVoiceEvalGate(env)).toEqual({ allowed: true });
  });

  it('this environment (as this test run actually found it) is correctly blocked right now', () => {
    // Deliberately reads real process.env (no override) - proves this
    // phase did not, and could not, slip past its own gate.
    const result = checkLiveVoiceEvalGate();
    expect(result.allowed).toBe(false);
  });

  it('the evaluation budget/duration ceilings are sane: positive, and the duration ceiling is well under the real production per-session cap', () => {
    expect(MAX_LIVE_VOICE_EVAL_BUDGET_USD).toBeGreaterThan(0);
    expect(MAX_LIVE_VOICE_EVAL_SESSION_MS).toBeGreaterThan(0);
    // NOVA_LIVE_MAX_SESSION_MS's production default is 15 minutes
    // (900_000ms) - this scripted evaluation must stay far below a real
    // conversation's own ceiling.
    expect(MAX_LIVE_VOICE_EVAL_SESSION_MS).toBeLessThan(900_000);
  });
});
