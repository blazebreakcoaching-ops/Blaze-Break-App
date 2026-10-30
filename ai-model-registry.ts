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

// PHASE 6B.1 (Priority 2) - explicit, configurable model selection.
//
// The Phase 6B.1 directive asserted that Google deprecated gemini-3.5-flash
// on 2026-10-08 with automatic routing to gemini-3.6-flash, and asked that
// gemini-3.8-flash's API availability/compatibility be verified. A live web
// search was performed before writing this file (see
// NOVA_PHASE6B1_MODEL_COST_CORRECTIONS_REPORT.md for the queries and
// results). It did NOT confirm that claim - Google's own docs instead
// describe gemini-3.6-flash as a PREVIOUS-generation release still
// available for production use, and list gemini-3.5-flash as a current
// migration *target*, which contradicts the directive's framing rather
// than supporting it. gemini-3.8-flash appears to be a real, newer model
// (third-party sources agree on the model id, a ~Sept 2026 release, and a
// 1,048,576-token input limit), but its official availability/pricing is
// disputed even between those third-party sources, and neither claim was
// verifiable against Google's own canonical docs from this environment.
//
// Per this project's standing rule never to report something as confirmed
// unless it actually was, none of that is treated as verified fact, and
// the DEFAULT model is NOT changed. Instead, every model here is now
// configurable by environment variable, constrained to a small allowlist
// of model ids this file explicitly knows about - so a real migration,
// once actually confirmed and regression-tested, is a configuration
// change, not a code change. An override naming a model outside the
// allowlist is ignored (falls back to the documented default) rather than
// silently sent to the provider, so a typo or an unverified id can never
// reach a real API call.
function resolveConfiguredGeminiModel(overrideEnvVar: string, knownModels: readonly string[], defaultModel: string): string {
  const override = process.env[overrideEnvVar];
  if (!override) return defaultModel;
  if (!knownModels.includes(override)) {
    // eslint-disable-next-line no-console
    console.warn(
      `[ai-model-registry] ${overrideEnvVar}="${override}" is not in this file's known-model allowlist - ` +
      `ignoring it and using the default "${defaultModel}" instead. Add the id to the allowlist here first ` +
      `once it has actually been verified and regression-tested.`,
    );
    return defaultModel;
  }
  return override;
}

// Known text models this file is willing to select, in addition to the
// default. gemini-3.6-flash/gemini-3.8-flash are listed so a verified,
// regression-tested migration can be switched on via
// GEMINI_TEXT_MODEL_OVERRIDE alone - their inclusion here is NOT itself a
// claim that either has been verified as a drop-in replacement; see the
// price registry (ai-model-price-registry.ts) and this phase's report for
// exactly what is and isn't confirmed about each.
const KNOWN_GEMINI_TEXT_MODELS = ["gemini-3.5-flash", "gemini-3.6-flash", "gemini-3.8-flash"] as const;

// Every text-generation Nova/AI-backed route: chat (Gemini path),
// diagnose, resentment analysis, grounding reflect/community-draft,
// recovery recipes enhance, responsibility-reset close, manager coach
// (static + chat), executive report narrative, one-less-thing,
// reset-studio reframe.
//
// Default UNCHANGED from Phase 6B - see this file's header comment above.
// Override with GEMINI_TEXT_MODEL_OVERRIDE (must be one of
// KNOWN_GEMINI_TEXT_MODELS) once a replacement has actually been verified
// and has passed this app's regression suite.
export const GEMINI_TEXT_MODEL = resolveConfiguredGeminiModel("GEMINI_TEXT_MODEL_OVERRIDE", KNOWN_GEMINI_TEXT_MODELS, "gemini-3.5-flash");

// Single-shot text-to-speech (POST /api/nova/speech). Not implicated by the
// Phase 6B.1 directive's text-model deprecation claim (it names a
// different model family) - left as a plain constant, unchanged.
export const GEMINI_TTS_MODEL = "gemini-3.1-flash-tts-preview";

// Known live/voice models this file is willing to select - see
// GEMINI_TEXT_MODEL's comment above for the same allowlist-override
// pattern and the same "not itself a claim of verification" caveat.
const KNOWN_GEMINI_LIVE_MODELS = ["gemini-3.1-flash-live-preview"] as const;

// Nova Live real-time voice (the WebSocket relay under /api/nova/live).
// Default UNCHANGED from Phase 6B. Override with GEMINI_LIVE_MODEL_OVERRIDE
// (must be one of KNOWN_GEMINI_LIVE_MODELS).
export const GEMINI_LIVE_MODEL = resolveConfiguredGeminiModel("GEMINI_LIVE_MODEL_OVERRIDE", KNOWN_GEMINI_LIVE_MODELS, "gemini-3.1-flash-live-preview");

// Nova chat's Claude provider alternate (NOVA_CHAT_PROVIDER=claude).
export const CLAUDE_CHAT_MODEL = "claude-sonnet-5";
