// PHASE 6B (directive §2) - a single, configurable source of truth for
// model pricing, so cost estimates across this codebase (the real-model
// NHEI evaluation runner, the Nova chat live-model evaluation runner, the
// admin Cost & Usage view, and the commercial tier cost report) all read
// the same numbers instead of each hardcoding its own, independently
// drifting table. Before this file existed,
// nhei-real-model-evaluation-runner.ts had its own local
// APPROXIMATE_USD_PER_1K_TOKENS table listing only 'gemini-2.0-flash' -
// a model this app no longer uses (see ai-model-registry.ts's
// GEMINI_TEXT_MODEL = "gemini-3.5-flash"), so that runner's own cost
// estimate silently returned null for every real run it could ever
// actually make. Consolidating here fixes that staleness bug once,
// rather than in every place that estimates cost.
//
// Every price below is a documented ESTIMATE, not a live read of
// Google's actual billing API (no such API is integrated anywhere in
// this codebase). `isEstimate` is always true today; the field exists so
// a future real-pricing-API integration has somewhere to flip it to
// false without changing every caller's shape. `sourceDate` records when
// each row was last checked against a public pricing page - treat a row
// with an old `sourceDate` as needing a refresh before being trusted for
// a real financial decision, not as still-current by default.

export interface ModelPriceEntry {
  /** USD per 1,000 input/prompt tokens. */
  inputUsdPer1kTokens: number;
  /** USD per 1,000 output/candidate tokens. */
  outputUsdPer1kTokens: number;
  /** ISO date this row was last checked against a public pricing source. */
  sourceDate: string;
  /** Always true today - no live provider billing API is integrated. See header comment. */
  isEstimate: true;
  /** Where the figure came from, or why it's a placeholder. */
  sourceNote: string;
}

// Configurable: these are plain exported constants, not a hidden/compiled
// default - an operator updating real pricing edits this object directly
// (or the app could load it from app_config/model_pricing at startup in
// a future phase; no such Firestore-backed override exists yet, and this
// phase does not add one, to keep this a pure, side-effect-free module
// other code can import from both server and evaluation contexts without
// a Firestore dependency).
export const MODEL_PRICE_REGISTRY: Record<string, ModelPriceEntry> = {
  'gemini-3.5-flash': {
    inputUsdPer1kTokens: 0.0001,
    outputUsdPer1kTokens: 0.0004,
    sourceDate: '2026-10-30',
    isEstimate: true,
    sourceNote: 'Placeholder carried forward from the previous Gemini Flash generation\'s public list price at the time this registry was written. This app has never made a real billed call to gemini-3.5-flash (no live GEMINI_API_KEY in any environment this project has run in) - verify against Google\'s current published rate card before using this figure for a real financial decision.',
  },
  'gemini-3.1-flash-live-preview': {
    // Live/voice models are typically priced per-second of audio plus a
    // token component, not purely per-token - this per-1k-token figure
    // is a rough, order-of-magnitude placeholder only, explicitly weaker
    // than the text estimate above. Real Nova voice cost in this app is
    // tracked far more reliably by actual elapsed minutes
    // (nova_voice_minutes, a real measured duration) than by this token
    // rate - see docs/COST_MONITORING.md and this phase's commercial
    // report for why minutes, not tokens, are the trustworthy signal for
    // voice.
    inputUsdPer1kTokens: 0.0005,
    outputUsdPer1kTokens: 0.002,
    sourceDate: '2026-10-30',
    isEstimate: true,
    sourceNote: 'Rough placeholder only - real Gemini Live pricing is per-second-of-audio plus tokens, not reducible to a clean per-1k-token figure. Prefer the real nova_voice_minutes duration counter over this rate for voice cost. Never verified against a live bill.',
  },
  // Retained for the NHEI real-model evaluation runner's existing test
  // fixtures and any historical report that still names this model -
  // removing it outright would silently turn a previously-working cost
  // estimate into a null for no benefit.
  'gemini-2.0-flash': {
    inputUsdPer1kTokens: 0.0001,
    outputUsdPer1kTokens: 0.0004,
    sourceDate: '2025-01-01',
    isEstimate: true,
    sourceNote: 'Legacy entry from the original NHEI real-model evaluation runner (Phase 3C-2B). This app no longer uses this model id for any real traffic - kept only so older reports/fixtures that reference it still resolve to a number.',
  },
};

/**
 * Returns a cost estimate in USD, or `null` if the model id isn't in the
 * registry - callers must treat `null` as "unavailable", never silently
 * substitute a different model's rate or report 0.
 */
export function estimateModelCostUsd(
  modelId: string,
  promptTokens: number,
  outputTokens: number,
): number | null {
  const entry = MODEL_PRICE_REGISTRY[modelId];
  if (!entry) return null;
  return (promptTokens / 1000) * entry.inputUsdPer1kTokens + (outputTokens / 1000) * entry.outputUsdPer1kTokens;
}

export function getModelPriceEntry(modelId: string): ModelPriceEntry | null {
  return MODEL_PRICE_REGISTRY[modelId] ?? null;
}
