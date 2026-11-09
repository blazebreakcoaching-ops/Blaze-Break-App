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
  readiness?: 'ready' | 'unavailable';
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
  const textChatActiveModel = selection.activeProvider === 'claude' ? 'claude-sonnet-5'
    : selection.activeProvider ? 'gemini-3.5-flash' : 'unavailable';

  return [
    {
      surface: 'nova_text_chat',
      label: 'Nova Text Chat',
      activeProvider: textChatActiveProvider,
      activeModel: textChatActiveModel,
      requestedProvider: selection.requestedProvider,
      readiness: selection.activeProvider ? 'ready' : 'unavailable',
      providerOptions: [
        { provider: 'gemini', model: 'gemini-3.5-flash', configured: input.geminiConfigured, selectionEnvVar: null },
        { provider: 'vertex', model: 'gemini-3.5-flash', configured: input.vertexConfigured, selectionEnvVar: 'NOVA_CHAT_PROVIDER=vertex' },
        { provider: 'claude', model: 'claude-sonnet-5', configured: input.claudeConfigured, selectionEnvVar: 'NOVA_CHAT_PROVIDER=claude' },
      ],
      systemPromptSource: 'NOVA_SYSTEM_PROMPT + per-user context addendum + NOVA_SAFETY_INSTRUCTIONS (server.ts)',
      promptVersioning: 'none',
      evidence: 'server.ts: NOVA_SYSTEM_PROMPT/NOVA_SAFETY_INSTRUCTIONS constants; useClaudeForThisChat/useVertexForThisChat provider switch; MODEL = "claude-sonnet-5" in the Claude chat path.',
    },
    {
      surface: 'nova_live_voice',
      label: 'Nova Live Voice',
      activeProvider: 'gemini',
      activeModel: 'gemini-3.1-flash-live-preview',
      providerOptions: [
        { provider: 'gemini', model: 'gemini-3.1-flash-live-preview', configured: input.geminiConfigured, selectionEnvVar: null },
      ],
      systemPromptSource: 'NOVA_LIVE_VOICE_PERSONA + per-user context addendum (server.ts)',
      promptVersioning: 'none',
      evidence: 'server.ts: NOVA_LIVE_VOICE_PERSONA constant; model: "gemini-3.1-flash-live-preview" in the Nova Live WebSocket handler. No NOVA_CHAT_PROVIDER-style switch exists for this surface - only one provider is wired.',
    },
    {
      surface: 'nova_voice_tts',
      label: 'Nova Voice Playback (TTS)',
      activeProvider: 'gemini',
      activeModel: 'gemini-3.1-flash-tts-preview',
      providerOptions: [
        { provider: 'gemini', model: 'gemini-3.1-flash-tts-preview', configured: input.geminiConfigured, selectionEnvVar: null },
      ],
      systemPromptSource: 'No persona system prompt - a per-message style instruction wrapped around the text to speak (server.ts)',
      promptVersioning: 'none',
      evidence: 'server.ts: model: "gemini-3.1-flash-tts-preview"; "Say in a warm, natural British English accent..." wrapper text at the TTS call site.',
    },
  ];
};
