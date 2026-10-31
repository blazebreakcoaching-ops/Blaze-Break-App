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

// PHASE 6B.1 (Priority 2) / PHASE 6B.1 FINAL CORRECTIONS - explicit,
// configurable model selection.
//
// Phase 6B.1's own first pass could not confirm Google's deprecation of
// gemini-3.5-flash and found contradicting search results. This
// correction pass re-ran the research with the four official URLs the
// directive supplied (ai.google.dev/gemini-api/docs/models/gemini-3.5-flash,
// .../gemini-3.6-flash, .../gemini-3.8-flash, .../pricing). Those exact
// pages could NOT be fetched directly in this environment - WebFetch to
// ai.google.dev fails with ENOTFOUND here (the host is outside this
// sandbox's allowed network domains) - so nothing below is a direct
// primary-source read. It is corroborated instead by several independent
// web-search queries whose results repeatedly surfaced and quoted what
// are presented as the SAME official page titles/URLs
// (ai.google.dev/gemini-api/docs/deprecations,
// .../docs/models/gemini-3.5-flash, .../docs/pricing,
// docs.cloud.google.com/.../gemini-3-8-flash) via a search index this
// environment can still reach, together with multiple independent
// third-party sources agreeing on the same figures. That is meaningfully
// stronger evidence than the single, inconclusive search this project
// ran last phase, but it is still not a page this file's author rendered
// and read directly - see NOVA_PHASE6B1_FINAL_CORRECTIONS_REPORT.md for
// the exact queries, results, and that caveat stated again in full.
//
// On that basis:
//   - gemini-3.5-flash: reported DEPRECATED (Google's 2026-10-08 release
//     notes), with API requests automatically rerouted to
//     gemini-3.6-flash.
//   - gemini-3.6-flash: reported as the direct, currently-supported
//     replacement (lower output pricing, reduced token usage).
//   - gemini-3.8-flash: reported as a newer, officially-supported stable
//     text model - Google's own "what's new" / model-card pages, per
//     search-index snippets citing them.
// See GEMINI_MODEL_STATUS below for how this is now recorded in code.
//
// Per the directive's own explicit instruction ("Do not switch the
// production default model without testing and authorisation"), this
// correction does NOT flip GEMINI_TEXT_MODEL's default despite the
// stronger evidence above - the default stays gemini-3.5-flash until a
// real migration is deliberately authorised and regression-tested. Every
// model here remains configurable by environment variable, constrained to
// a small allowlist of model ids this file explicitly knows about. An
// override naming a model outside the allowlist is ignored (falls back to
// the documented default) rather than silently sent to the provider, so a
// typo or an unverified id can never reach a real API call.
export type GeminiTextModelStatus = 'deprecated' | 'supported_replacement' | 'supported_evaluation_candidate';

export interface GeminiTextModelStatusEntry {
  status: GeminiTextModelStatus;
  /** One-line human summary of the status, for admin/report surfaces. */
  note: string;
  /**
   * Thinking levels this model is reported to accept via
   * generationConfig.thinkingConfig.thinkingLevel. `null` means "no
   * per-model restriction is recorded" (every SDK-level ThinkingLevel
   * value is allowed) - NOT the same as an empty array, which would mean
   * "no thinking levels are valid for this model."
   */
  supportedThinkingLevels: readonly ('MINIMAL' | 'LOW' | 'MEDIUM' | 'HIGH')[] | null;
}

// PHASE 6B.1 FINAL CORRECTIONS (Priority 2/3) - "Distinguish
// historical/deprecated identifiers from supported evaluation
// candidates" + "validate the selected thinking level against the chosen
// model." One row per model this registry knows about at all (including
// ones with no price entry and ones not in KNOWN_GEMINI_TEXT_MODELS), so
// a caller can always ask "what do we know about this id" even for a
// legacy/historical model nothing selects anymore.
export const GEMINI_MODEL_STATUS: Record<string, GeminiTextModelStatusEntry> = {
  'gemini-3.5-flash': {
    status: 'deprecated',
    note: 'Reported deprecated by Google (2026-10-08 release notes); requests reported auto-routed to gemini-3.6-flash. Still this app\'s configured production default pending authorised migration testing - see this file\'s header comment.',
    supportedThinkingLevels: null,
  },
  'gemini-3.6-flash': {
    status: 'supported_replacement',
    note: 'Reported as gemini-3.5-flash\'s direct, currently-supported replacement.',
    supportedThinkingLevels: null,
  },
  'gemini-3.8-flash': {
    status: 'supported_evaluation_candidate',
    note: 'Reported as a newer, officially-supported stable text model - not this app\'s configured default. MINIMAL thinking level is reported UNSUPPORTED for this model specifically (returns a provider validation error) - only LOW/MEDIUM(default)/HIGH are accepted.',
    supportedThinkingLevels: ['LOW', 'MEDIUM', 'HIGH'],
  },
  // Legacy/historical - no real traffic, kept only so an old
  // report/fixture referencing it still resolves to a known status.
  'gemini-2.0-flash': {
    status: 'deprecated',
    note: 'Legacy model from Phase 3C-2B; superseded well before gemini-3.5-flash. Historical only.',
    supportedThinkingLevels: null,
  },
};

/**
 * Returns the thinking levels a model is known to accept, or `null` if
 * this registry has no per-model restriction on record (meaning: don't
 * reject on this basis - every SDK-level value is allowed as far as this
 * file knows).
 */
export function getSupportedThinkingLevels(modelId: string): readonly ('MINIMAL' | 'LOW' | 'MEDIUM' | 'HIGH')[] | null {
  return GEMINI_MODEL_STATUS[modelId]?.supportedThinkingLevels ?? null;
}
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
//
// PHASE 6C (Priority 3) - added "gemini-3.8-live" as a selectable
// evaluation candidate ahead of Google's reported eventual retirement of
// gemini-3.1-flash-live-preview. As with gemini-3.8-flash above,
// ai.google.dev could not be fetched directly from this sandbox
// (WebFetch -> ENOTFOUND, same restriction documented throughout this
// file and ai-model-price-registry.ts) - this is corroborated via a
// search index reaching cached snapshots of what are presented as the
// same official page titles/URLs, not a page this file's author
// rendered and read directly. On that basis:
//   - This phase's OWN directive asserted gemini-3.1-flash-live-preview
//     is scheduled for shutdown on 2026-11-17 with gemini-3.8-live as its
//     replacement. That specific claim could NOT be corroborated: the
//     cached deprecations-page snapshot found for
//     gemini-3.1-flash-live-preview shows "No shutdown date announced"
//     (Google's own stated policy is that a shutdown-eligible date is
//     the EARLIEST possible retirement, with real notice given
//     separately), and the only source naming gemini-3.8-live as its
//     specific replacement was one uncorroborated third-party tracker.
//     Do not treat 2026-11-17 as a confirmed date anywhere in this
//     codebase or its reports.
//   - gemini-3.8-live itself DOES appear to be a real, documented,
//     GA model (ai.google.dev/gemini-api/docs/models/gemini-3.8-live;
//     Google Cloud's Gemini Enterprise Agent Platform docs list it with
//     a 2026-09-24 release date) - this part is corroborated across
//     multiple independent-looking official page titles, unlike the
//     deprecation-date claim above.
//   - Reported compatibility notes for a gemini-3.1-flash-live-preview
//     -> gemini-3.8-live migration: "mostly means changing the model
//     string" per the model page's own migration note; audio I/O is
//     reported as 16-bit PCM in at 16kHz / out at 24kHz, matching this
//     app's existing CAPTURE_SAMPLE_RATE/PLAYBACK_SAMPLE_RATE constants
//     (useNovaLiveVoice.ts) exactly, so no client-side audio pipeline
//     change is implied; a BidiGenerateContentContextUpdate message
//     (mid-session system-instruction/tool replacement) is reported as a
//     new 3.8-live-specific capability this app does not use and does
//     not need to.
//
// PHASE 6D (Priority 2) - a second, more thorough research pass (still
// via search-index corroboration only - ai.google.dev remains
// unreachable from this sandbox) reached what present as cached
// snapshots of the actual official migration-notes text and resolved
// the affective-dialogue discrepancy noted above, plus surfaced two
// further migration differences this app's Live config was checked
// against directly (see nova-live-gemini-3-8-live-migration.test.ts,
// which asserts the real config object sent to ai.live.connect under
// this override contains none of the following):
//   - thinking_level is reported NOT ACCEPTED by gemini-3.8-live AT ALL
//     (not merely restricted to a subset, as gemini-3.8-flash's TEXT
//     path is) - must be omitted from session setup entirely. This
//     app's Live path has never set it, so this is a non-issue today,
//     but it rules out ever reusing the text path's
//     getSupportedThinkingLevels restriction-list pattern for the Live
//     path if someone later wants to add Live thinking-level support.
//   - Affective dialogue is reported REMOVED from the API outright on
//     this model ("Remove any enable_affective_dialog configurations
//     from your code.") - resolving the earlier-noted discrepancy. This
//     app's Live config has never set this field either.
//   - Proactive audio is reported PERMANENTLY ENABLED on gemini-3.8-live
//     - explicitly setting proactive_audio:false is reported to return a
//     hard ERROR (not merely ignored). This app's Live config has never
//     set this field, so the migration is not blocked by it today - but
//     this is the one finding in this list that could silently BREAK a
//     future, unrelated change (e.g. someone adding proactivity config
//     to make Nova less likely to go quiet) if that change assumed the
//     old model's behaviour still applied once this override is active.
//   - Async (NON_BLOCKING) function calling is reported as the new
//     DEFAULT execution mode - this app's tool-call dispatch in
//     server.ts already awaits executeNovaTool and calls
//     sendToolResponse once resolved, never assuming a synchronous/
//     blocking turn, so no code change was needed; confirmed by running
//     the same dispatch path under this override in the test file above.
// None of this has been exercised against a real Gemini Live connection
// in this environment (no live-credential mode exists for voice at all -
// see nova-voice-evaluation-runner.test.ts's header comment, and
// NOVA_PHASE6D_VOICE_EVALUATION_PROCEDURE.md for what a real,
// explicitly-authorised test of this model would still require).
// Selectable via GEMINI_LIVE_MODEL_OVERRIDE for a future authorised real
// compatibility test; NOT the default.
const KNOWN_GEMINI_LIVE_MODELS = ["gemini-3.1-flash-live-preview", "gemini-3.8-live"] as const;

// Nova Live real-time voice (the WebSocket relay under /api/nova/live).
// Default UNCHANGED from Phase 6B pending real compatibility testing and
// explicit approval (Phase 6C directive §3) - see the allowlist comment
// above for what is and isn't confirmed about gemini-3.8-live. Override
// with GEMINI_LIVE_MODEL_OVERRIDE (must be one of KNOWN_GEMINI_LIVE_MODELS).
export const GEMINI_LIVE_MODEL = resolveConfiguredGeminiModel("GEMINI_LIVE_MODEL_OVERRIDE", KNOWN_GEMINI_LIVE_MODELS, "gemini-3.1-flash-live-preview");

// Nova chat's Claude provider alternate (NOVA_CHAT_PROVIDER=claude).
export const CLAUDE_CHAT_MODEL = "claude-sonnet-5";
