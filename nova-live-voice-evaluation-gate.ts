// PHASE 6D (Priority 4) - "Prepare a genuine voice-evaluation procedure
// ... Do not create live paid audio sessions without explicit approval."
//
// This file is the one piece of real, committed infrastructure this
// phase adds for a FUTURE controlled, isolated Gemini Live provider
// test - the explicit two-gate pattern nova-chat-live-model-evaluation-
// runner.ts already establishes for TEXT, mirrored here for VOICE. It
// contains no SDK call of any kind: it only decides whether a future
// caller is ALLOWED to attempt one. See
// NOVA_PHASE6D_VOICE_EVALUATION_PROCEDURE.md for the full procedure this
// gate is one piece of (synthetic audio inputs, expected interruption/
// turn-taking assertions, how to measure serving model and cost, how to
// verify no tool call can reach a real external communication) - that
// document is the actual deliverable; this file exists so a future,
// explicitly-authorised phase has a real gate to check rather than
// having to invent one under time pressure.
//
// nova-voice-evaluation-runner.test.ts's own header comment states this
// codebase has "no live-credential mode at all" for voice, as a
// deliberate Phase 6B scope decision - that remains true: this file is
// never imported by that test file, by server.ts, or by any other
// production or test path. It exists, and is exported, purely so a
// future phase can import it when (and only when) building the real
// harness the procedure document describes.

export function liveVoiceEvalExplicitlyEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.NOVA_LIVE_VOICE_EVAL === '1';
}

export function hasLiveVoiceEvalCredentials(env: NodeJS.ProcessEnv = process.env): boolean {
  const key = env.GEMINI_API_KEY;
  return typeof key === 'string' && key.length > 0 && key !== 'MY_GEMINI_API_KEY';
}

// Deliberately much smaller than NOVA_LIVE_MAX_SESSION_MS (the real
// 15-minute production ceiling for a genuine coaching conversation) -
// this is a scripted, synthetic-audio compatibility check, not a
// conversation, and has no reason to run anywhere near that long.
export const MAX_LIVE_VOICE_EVAL_SESSION_MS = 90_000;

// Conservative total USD ceiling for one evaluation run, mirroring the
// text runner's own default (NovaChatLiveEvalConfig.maxTotalUsd = 0.05)
// at roughly double it, since a Live session bills audio seconds AND
// tokens together rather than a single bounded text turn.
export const MAX_LIVE_VOICE_EVAL_BUDGET_USD = 0.10;

export interface LiveVoiceEvalGateAllowed {
  allowed: true;
}
export interface LiveVoiceEvalGateBlocked {
  allowed: false;
  reason: 'not_explicitly_enabled' | 'no_credentials';
  note: string;
}
export type LiveVoiceEvalGateResult = LiveVoiceEvalGateAllowed | LiveVoiceEvalGateBlocked;

export function isLiveVoiceEvalGateBlocked(result: LiveVoiceEvalGateResult): result is LiveVoiceEvalGateBlocked {
  return result.allowed === false;
}

/**
 * The single check a future real-provider voice-evaluation harness must
 * call before ever invoking `ai.live.connect` for evaluation purposes.
 * Both conditions are independent and both are required - exactly the
 * same two-gate shape as `nova-chat-live-model-evaluation-runner.ts`'s
 * own `liveChatEvalExplicitlyEnabled`/`hasLiveChatEvalCredentials` pair,
 * so an operator who already understands that gate for text evaluation
 * recognises this one immediately.
 */
export function checkLiveVoiceEvalGate(env: NodeJS.ProcessEnv = process.env): LiveVoiceEvalGateResult {
  if (!liveVoiceEvalExplicitlyEnabled(env)) {
    return {
      allowed: false,
      reason: 'not_explicitly_enabled',
      note: 'NOVA_LIVE_VOICE_EVAL is not set to "1". A controlled live-Gemini-Live-model voice evaluation must never run without an explicit execution flag, independent of whether credentials happen to be configured.',
    };
  }
  if (!hasLiveVoiceEvalCredentials(env)) {
    return {
      allowed: false,
      reason: 'no_credentials',
      note: 'GEMINI_API_KEY is not set (or is the placeholder value). No real Gemini Live session may be opened - no simulated/mocked result may ever be substituted for a real one and reported as if this gate had passed.',
    };
  }
  return { allowed: true };
}
