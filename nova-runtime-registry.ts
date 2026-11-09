// Nova Runtime Registry (Evolution Engine PR9) - a real, read-only
// report over Nova's actual conversational surfaces: which model and
// system prompt each one runs on today, grep-verified against server.ts
// rather than invented. This is NOT a config source anything reads from
// yet - server.ts's ~15 call sites that hardcode a model string (most of
// them one-off analytical completions unrelated to Nova's own persona,
// e.g. the burnout-diagnostic blurb generator) are untouched; rewiring
// every one of them to read from a central registry is real, separate,
// higher-risk future work this PR does not attempt. What this PR
// reports on is specifically the three surfaces that compose Nova's own
// persona/system-prompt (NOVA_SYSTEM_PROMPT, NOVA_LIVE_VOICE_PERSONA,
// NOVA_SAFETY_INSTRUCTIONS) rather than every AI call in the app.
//
// The most honest finding this surfaces: there is no prompt versioning
// at all today. Each surface has exactly one hardcoded system prompt
// constant with no history, no variants, and no way to compare an old
// version against a new one - which is exactly why Shadow Mode and the
// Replay Lab (the rest of this spec's PR9 scope) are NOT built here.
// Building either safely requires a real way to capture and replay past
// conversations without touching live traffic, which does not exist in
// this codebase yet; inventing a shallow version of either would risk
// giving a false impression that prompt changes are already safely
// testable before reaching real users. The registry below is the
// genuinely buildable, honest first step - observability over what
// actually runs today - not the full spec.

import { GEMINI_TEXT_MODEL, GEMINI_LIVE_MODEL, GEMINI_TTS_MODEL, CLAUDE_CHAT_MODEL } from './ai-model-registry';

export const NOVA_RUNTIME_SURFACES = ['nova_text_chat', 'nova_live_voice', 'nova_voice_tts'] as const;
export type NovaRuntimeSurface = (typeof NOVA_RUNTIME_SURFACES)[number];

export interface NovaRuntimeProviderOption {
  provider: string;
  model: string;
  configured: boolean;
  selectionEnvVar: string | null;
}

export interface NovaRuntimeSurfaceReport {
  surface: NovaRuntimeSurface;
  label: string;
  activeProvider: string;
  activeModel: string;
  requestedProvider?: string;
  // Ready here means configured locally; live IAM/provider connectivity is not verified.
  readiness?: 'ready' | 'unavailable' | 'disabled';
  providerOptions: NovaRuntimeProviderOption[];
  systemPromptSource: string;
  promptVersioning: 'none';
  evidence: string;
}

export interface NovaRuntimeInputs {
  novaChatProviderEnv: string | undefined;
  geminiConfigured: boolean;
  vertexConfigured: boolean;
  claudeConfigured: boolean;
  novaLiveVoiceEnabled?: boolean;
}

export type NovaChatProvider = 'gemini' | 'vertex' | 'claude';
export interface NovaChatProviderSelection {
  requestedProvider: string;
  activeProvider: NovaChatProvider | null;
}
export function resolveNovaChatProvider(input: NovaRuntimeInputs): NovaChatProviderSelection {
  // Only an unset override chooses Gemini by default. Any explicit
  // misconfiguration must fail closed, not reroute user data elsewhere.
  const requestedProvider = input.novaChatProviderEnv || 'gemini';
  const configured = requestedProvider === 'gemini' ? input.geminiConfigured
    : requestedProvider === 'vertex' ? input.vertexConfigured
    : requestedProvider === 'claude' ? input.claudeConfigured
    : false;
  return {
    requestedProvider,
    activeProvider: configured ? requestedProvider as NovaChatProvider : null,
  };
}

// Share the live route's provider decision, including unavailable states.
export const buildNovaRuntimeReport = (input: NovaRuntimeInputs): NovaRuntimeSurfaceReport[] => {
  const selection = resolveNovaChatProvider(input);
  const textChatActiveProvider = selection.activeProvider ?? 'unavailable';
  const textChatActiveModel = selection.activeProvider === 'claude' ? CLAUDE_CHAT_MODEL
    : selection.activeProvider ? GEMINI_TEXT_MODEL : 'unavailable';
  const liveReadiness = input.novaLiveVoiceEnabled === false ? 'disabled'
    : input.geminiConfigured ? 'ready' : 'unavailable';
  const ttsReadiness = input.geminiConfigured ? 'ready' : 'unavailable';

  return [
    {
      surface: 'nova_text_chat',
      label: 'Nova Text Chat',
      activeProvider: textChatActiveProvider,
      activeModel: textChatActiveModel,
      requestedProvider: selection.requestedProvider,
      readiness: selection.activeProvider ? 'ready' : 'unavailable',
      providerOptions: [
        { provider: 'gemini', model: GEMINI_TEXT_MODEL, configured: input.geminiConfigured, selectionEnvVar: null },
        { provider: 'vertex', model: GEMINI_TEXT_MODEL, configured: input.vertexConfigured, selectionEnvVar: 'NOVA_CHAT_PROVIDER=vertex' },
        { provider: 'claude', model: CLAUDE_CHAT_MODEL, configured: input.claudeConfigured, selectionEnvVar: 'NOVA_CHAT_PROVIDER=claude' },
      ],
      systemPromptSource: 'NOVA_SYSTEM_PROMPT + per-user context addendum + NOVA_SAFETY_INSTRUCTIONS (server.ts)',
      promptVersioning: 'none',
      evidence: 'server.ts: NOVA_SYSTEM_PROMPT/NOVA_SAFETY_INSTRUCTIONS, shared resolveNovaChatProvider; text and Claude model identifiers use ai-model-registry.ts.',
    },
    {
      surface: 'nova_live_voice',
      label: 'Nova Live Voice',
      activeProvider: liveReadiness === 'ready' ? 'gemini' : 'unavailable',
      activeModel: liveReadiness === 'ready' ? GEMINI_LIVE_MODEL : 'unavailable',
      requestedProvider: 'gemini',
      readiness: liveReadiness,
      providerOptions: [
        { provider: 'gemini', model: GEMINI_LIVE_MODEL, configured: input.geminiConfigured, selectionEnvVar: null },
      ],
      systemPromptSource: 'NOVA_LIVE_VOICE_PERSONA + per-user context addendum (server.ts)',
      promptVersioning: 'none',
      evidence: 'server.ts: NOVA_LIVE_VOICE_PERSONA, GEMINI_LIVE_MODEL and NOVA_LIVE_VOICE_ENABLED; Live voice remains Gemini-only.',
    },
    {
      surface: 'nova_voice_tts',
      label: 'Nova Voice Playback (TTS)',
      activeProvider: ttsReadiness === 'ready' ? 'gemini' : 'unavailable',
      activeModel: ttsReadiness === 'ready' ? GEMINI_TTS_MODEL : 'unavailable',
      requestedProvider: 'gemini',
      readiness: ttsReadiness,
      providerOptions: [
        { provider: 'gemini', model: GEMINI_TTS_MODEL, configured: input.geminiConfigured, selectionEnvVar: null },
      ],
      systemPromptSource: 'No persona system prompt - a per-message style instruction wrapped around the text to speak (server.ts)',
      promptVersioning: 'none',
      evidence: 'server.ts: /api/nova/speech uses GEMINI_TTS_MODEL from ai-model-registry.ts; the Live voice kill switch does not disable TTS.',
    },
  ];
};
