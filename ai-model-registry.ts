// Single source of truth for every hardcoded Gemini/Claude model version
// string used in server.ts.
//
// Before this file existed, "gemini-3.5-flash" was duplicated as a raw
// string literal across 13 separate route handlers, with nothing
// stopping them from drifting - bumping the model version meant finding
// every occurrence by hand (easy to miss one), and there was no way to
// tell, from a diff, whether a change updated "the model" or just one of
// its 13 copies. ai-model-registry.test.ts's guardrail fails the build if
// a route literal reappears outside this file.
//
// One named constant per logical capability, not one constant shared by
// coincidence - two capabilities that happen to use the same model
// string today get their own name here, so a future change that needs
// to move just one of them off this model doesn't have to touch the
// other's call sites at all.

// Every text-generation Nova/AI-backed route: chat (Gemini path),
// diagnose, resentment analysis, grounding reflect/community-draft,
// recovery recipes enhance, responsibility-reset close, manager coach
// (static + chat), executive report narrative, one-less-thing,
// reset-studio reframe.
export const GEMINI_TEXT_MODEL = "gemini-3.5-flash";

// Single-shot text-to-speech (POST /api/nova/speech).
export const GEMINI_TTS_MODEL = "gemini-3.1-flash-tts-preview";

// Nova Live real-time voice (the WebSocket relay under /api/nova/live).
export const GEMINI_LIVE_MODEL = "gemini-3.1-flash-live-preview";

// Nova chat's Claude provider alternate (NOVA_CHAT_PROVIDER=claude).
export const CLAUDE_CHAT_MODEL = "claude-sonnet-5";
