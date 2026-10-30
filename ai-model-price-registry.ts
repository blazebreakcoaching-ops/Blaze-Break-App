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
  /** PHASE 6B.1 (Priority 4) - inclusive ISO date this rate window starts applying from. */
  effectiveFrom: string;
  /** PHASE 6B.1 (Priority 4) - exclusive ISO date this rate window stops applying (the next window's effectiveFrom), or undefined if this is the current, open-ended window. */
  effectiveUntil?: string;
}

// PHASE 6B.1 (Priority 4) - each model now maps to an ARRAY of dated rate
// windows rather than a single flat rate, so a documented promotional
// period (e.g. "through 2026-12-31") and the rate that applies after it
// can both be recorded explicitly, instead of only ever representing
// whichever rate happened to be current when this file was last edited.
// getModelPriceEntry()/estimateModelCostUsd() below pick the window whose
// [effectiveFrom, effectiveUntil) covers the requested date (default: now)
// - see their own comments. Windows for one model must be listed in
// ascending effectiveFrom order and must not overlap; there is no runtime
// check enforcing that today (a small, hand-maintained table), so keep
// that invariant by inspection when editing this file.
export const MODEL_PRICE_REGISTRY: Record<string, ModelPriceEntry[]> = {
  'gemini-3.5-flash': [
    {
      inputUsdPer1kTokens: 0.0001,
      outputUsdPer1kTokens: 0.0004,
      sourceDate: '2026-10-30',
      isEstimate: true,
      effectiveFrom: '2026-10-01',
      effectiveUntil: '2027-01-01',
      sourceNote: 'Placeholder carried forward from the previous Gemini Flash generation\'s public list price at the time this registry was written. This app has never made a real billed call to gemini-3.5-flash (no live GEMINI_API_KEY in any environment this project has run in) - verify against Google\'s current published rate card before using this figure for a real financial decision.',
    },
    // PHASE 6B.1 (Priority 4 - "rates applicable from January 2027, not
    // just October-December 2026 promotional rates"). A live web search
    // performed for this phase found NO documented source stating that
    // gemini-3.5-flash's own rate changes on/after 2027-01-01 (unlike
    // gemini-3.8-flash below, where a promotional-rate end date WAS
    // found). Rather than fabricate a different post-2027 figure with no
    // evidence behind it, this window carries the same rate forward
    // unchanged - the row exists so the Jan-2027-onward requirement is
    // structurally satisfied (a request dated 2027-01-01 or later
    // resolves to a real, present row, not a silent gap), and is flagged
    // here as carried-forward-unverified so a future refresh knows this
    // one still needs a real source, not just a date bump.
    {
      inputUsdPer1kTokens: 0.0001,
      outputUsdPer1kTokens: 0.0004,
      sourceDate: '2026-10-30',
      isEstimate: true,
      effectiveFrom: '2027-01-01',
      sourceNote: 'Carried forward UNCHANGED from the 2026-10/12 window - no documented source was found (live search, 2026-10-30) confirming whether this model\'s rate actually changes on/after 2027-01-01. Treat as unverified for the post-2027 period specifically; refresh against Google\'s rate card before trusting it for a real financial decision.',
    },
  ],
  'gemini-3.1-flash-live-preview': [
    {
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
      effectiveFrom: '2026-10-01',
      sourceNote: 'Rough placeholder only - real Gemini Live pricing is per-second-of-audio plus tokens, not reducible to a clean per-1k-token figure. Prefer the real nova_voice_minutes duration counter over this rate for voice cost. Never verified against a live bill. No Jan-2027 rate change documented either way - this single open-ended window is carried forward unverified, same caveat as gemini-3.5-flash\'s second window above.',
    },
  ],
  // Retained for the NHEI real-model evaluation runner's existing test
  // fixtures and any historical report that still names this model -
  // removing it outright would silently turn a previously-working cost
  // estimate into a null for no benefit.
  'gemini-2.0-flash': [
    {
      inputUsdPer1kTokens: 0.0001,
      outputUsdPer1kTokens: 0.0004,
      sourceDate: '2025-01-01',
      isEstimate: true,
      effectiveFrom: '2025-01-01',
      sourceNote: 'Legacy entry from the original NHEI real-model evaluation runner (Phase 3C-2B). This app no longer uses this model id for any real traffic - kept only so older reports/fixtures that reference it still resolve to a number.',
    },
  ],
  // PHASE 6B.1 (Priority 2/4) - gemini-3.8-flash is NOT the app's
  // configured model (see ai-model-registry.ts - GEMINI_TEXT_MODEL still
  // defaults to gemini-3.5-flash). It is priced here only so that IF an
  // operator ever sets GEMINI_TEXT_MODEL_OVERRIDE=gemini-3.8-flash after
  // real verification, cost estimation does not silently return null. A
  // live web search (2026-10-30) found third-party sources (not Google's
  // own canonical docs, which could not be confirmed as listing this
  // model from this environment) agreeing on the model id and a
  // promotional rate of $0.75/$3.75 per million input/output tokens
  // "valid through December 31, 2026", alongside a conflicting
  // non-promotional figure from one pricing aggregator
  // ($0.375/$1.88 per million). Both windows below are therefore
  // estimates of DISPUTED, third-party-only figures, deliberately using
  // the HIGHER (more conservative, cost-overestimating rather than
  // underestimating) of the two conflicting post-promotional numbers -
  // see this phase's report for the exact sources and why neither could
  // be elevated to "confirmed."
  'gemini-3.8-flash': [
    {
      inputUsdPer1kTokens: 0.00075,
      outputUsdPer1kTokens: 0.00375,
      sourceDate: '2026-10-30',
      isEstimate: true,
      effectiveFrom: '2026-09-01',
      effectiveUntil: '2027-01-01',
      sourceNote: 'UNVERIFIED against Google\'s own pricing page - sourced from third-party aggregators only (one proxy page states official specs/pricing are not yet published by Google at all). Multiple third-party sources describe $0.75/$3.75 per million input/output tokens as Google\'s own limited-time promotional rate, valid through 2026-12-31. Treat as a rough placeholder, not an invoice-grade figure.',
    },
    {
      inputUsdPer1kTokens: 0.00075,
      outputUsdPer1kTokens: 0.00375,
      sourceDate: '2026-10-30',
      isEstimate: true,
      effectiveFrom: '2027-01-01',
      sourceNote: 'Post-promotional rate is itself disputed: one aggregator lists $0.375/$1.88 per million tokens instead of the figure carried forward here. This row deliberately keeps the HIGHER (cost-conservative) of the two disputed figures rather than guessing which is correct - refresh against Google\'s own rate card before trusting this for any real financial decision, and before ever setting GEMINI_TEXT_MODEL_OVERRIDE to this model for real traffic.',
    },
  ],
  // PHASE 6B.1 (Priority 2) - gemini-3.6-flash is listed in
  // ai-model-registry.ts's KNOWN_GEMINI_TEXT_MODELS allowlist (so it CAN
  // be selected via GEMINI_TEXT_MODEL_OVERRIDE once verified) but
  // deliberately has NO price entry here: the live search performed for
  // this phase found no concrete per-token rate for it anywhere (only an
  // unquantified comparison noting its output price is higher than
  // gemini-3.5-flash's). Per this project's standing rule, a number this
  // phase cannot actually source is never invented - estimateModelCostUsd
  // correctly returns null for this model id until a real rate is found
  // and added here, which is the honest "unavailable" result, not a
  // fabricated one.
};

function windowCoveringDate(windows: ModelPriceEntry[], asOfIsoDate: string): ModelPriceEntry | null {
  // Windows are listed in ascending effectiveFrom order (see this file's
  // header comment); the LAST window whose effectiveFrom is <= the
  // requested date, and whose effectiveUntil (if any) is > the requested
  // date, is the one in effect.
  let match: ModelPriceEntry | null = null;
  for (const w of windows) {
    if (w.effectiveFrom <= asOfIsoDate && (!w.effectiveUntil || asOfIsoDate < w.effectiveUntil)) {
      match = w;
    }
  }
  return match;
}

/**
 * Returns a cost estimate in USD, or `null` if the model id isn't in the
 * registry, or has no rate window covering `asOfIsoDate` - callers must
 * treat `null` as "unavailable", never silently substitute a different
 * model's rate or report 0.
 *
 * @param asOfIsoDate PHASE 6B.1 (Priority 4) - which dated rate window to
 * use, as an ISO date string (default: today). Existing callers that omit
 * this continue to resolve against "now", exactly as before this phase.
 */
export function estimateModelCostUsd(
  modelId: string,
  promptTokens: number,
  outputTokens: number,
  asOfIsoDate: string = new Date().toISOString().slice(0, 10),
): number | null {
  const entry = getModelPriceEntry(modelId, asOfIsoDate);
  if (!entry) return null;
  return (promptTokens / 1000) * entry.inputUsdPer1kTokens + (outputTokens / 1000) * entry.outputUsdPer1kTokens;
}

/**
 * Returns the single rate entry in effect for `modelId` as of
 * `asOfIsoDate` (default: today), or `null` if the model is unknown or has
 * no window covering that date.
 */
export function getModelPriceEntry(modelId: string, asOfIsoDate: string = new Date().toISOString().slice(0, 10)): ModelPriceEntry | null {
  const windows = MODEL_PRICE_REGISTRY[modelId];
  if (!windows) return null;
  return windowCoveringDate(windows, asOfIsoDate);
}
