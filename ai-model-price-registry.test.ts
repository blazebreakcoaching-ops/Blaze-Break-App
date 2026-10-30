import { describe, it, expect } from 'vitest';
import { estimateModelCostUsd, getModelPriceEntry, estimatePotentialCacheDiscountUsd } from './ai-model-price-registry';

// PHASE 6B.1 (Priority 4) - regression coverage for the dated-rate-window
// mechanism added this phase. Existing callers (cost-estimates.ts,
// nhei-real-model-evaluation-runner.ts, nova-chat-live-model-evaluation-runner.ts)
// never pass an explicit asOfIsoDate - these tests exist specifically to
// prove the "pick the window covering a given date" logic itself, which
// those callers rely on implicitly via the "now" default.

describe('ai-model-price-registry - dated rate windows (Priority 4)', () => {
  it('unknown model id returns null, never a fabricated rate', () => {
    expect(getModelPriceEntry('not-a-real-model')).toBeNull();
    expect(estimateModelCostUsd('not-a-real-model', 1000, 1000)).toBeNull();
  });

  // PHASE 6C (Priority 3/4) - gemini-3.8-live (the evaluation-candidate
  // Live/voice model) now resolves to a priced entry, so a future
  // GEMINI_LIVE_MODEL_OVERRIDE=gemini-3.8-live run does not silently cost-
  // estimate to null the way an unknown model id would.
  it('gemini-3.8-live resolves to a priced entry, not null, matching gemini-3.1-flash-live-preview\'s own rough placeholder figure', () => {
    const live38 = getModelPriceEntry('gemini-3.8-live', '2026-11-15');
    const live31 = getModelPriceEntry('gemini-3.1-flash-live-preview', '2026-11-15');
    expect(live38).not.toBeNull();
    expect(live38?.inputUsdPer1kTokens).toBe(live31?.inputUsdPer1kTokens);
    expect(live38?.outputUsdPer1kTokens).toBe(live31?.outputUsdPer1kTokens);
    expect(estimateModelCostUsd('gemini-3.8-live', 1000, 1000, '2026-11-15')).not.toBeNull();
  });

  // PHASE 6B.1 FINAL CORRECTIONS (Priority 2/4) - "Add the verified Gemini
  // 3.6 Flash standard prices... Include the published January 2027 price
  // changes." A fresh search this pass found concrete, multiply-
  // corroborated figures (see ai-model-price-registry.ts's own comment on
  // this entry), so gemini-3.6-flash is no longer deliberately unpriced -
  // this test now proves the OPPOSITE of what it proved last phase.
  it('gemini-3.6-flash standard rate (through 2026-12-31) matches the documented $0.75/$3.75/million figure, and the Jan-2027 rate doubles to $1.50/$7.50/million', () => {
    const standard = getModelPriceEntry('gemini-3.6-flash', '2026-11-15');
    expect(standard?.inputUsdPer1kTokens).toBeCloseTo(0.00075, 10);
    expect(standard?.outputUsdPer1kTokens).toBeCloseTo(0.00375, 10);
    expect(standard?.cachedInputUsdPer1kTokens).toBeCloseTo(0.000075, 10);

    const postJan2027 = getModelPriceEntry('gemini-3.6-flash', '2027-01-01');
    expect(postJan2027?.inputUsdPer1kTokens).toBeCloseTo(0.0015, 10);
    expect(postJan2027?.outputUsdPer1kTokens).toBeCloseTo(0.0075, 10);
    expect(postJan2027?.cachedInputUsdPer1kTokens).toBeCloseTo(0.00015, 10);

    expect(estimateModelCostUsd('gemini-3.6-flash', 1000, 1000, '2026-11-15')).not.toBeNull();
  });

  it('gemini-3.8-flash\'s post-2027 rate now matches gemini-3.6-flash\'s doubled figure, not the earlier flat-carry-forward placeholder', () => {
    const entry = getModelPriceEntry('gemini-3.8-flash', '2027-03-01');
    expect(entry?.inputUsdPer1kTokens).toBeCloseTo(0.0015, 10);
    expect(entry?.outputUsdPer1kTokens).toBeCloseTo(0.0075, 10);
  });

  it('estimatePotentialCacheDiscountUsd returns null when no cached rate is on record (e.g. gemini-3.5-flash), never a fabricated discount', () => {
    expect(estimatePotentialCacheDiscountUsd('gemini-3.5-flash', 1000)).toBeNull();
    expect(estimatePotentialCacheDiscountUsd('not-a-real-model', 1000)).toBeNull();
  });

  it('estimatePotentialCacheDiscountUsd computes the input-vs-cached-input rate difference for a model with a documented cached rate, and never subtracts it from estimateModelCostUsd itself', () => {
    const cachedTokens = 10_000;
    const discount = estimatePotentialCacheDiscountUsd('gemini-3.6-flash', cachedTokens, '2026-11-15');
    // (0.00075 - 0.000075) per 1k * 10 (10,000/1000) = 0.067500...
    expect(discount).toBeCloseTo((0.00075 - 0.000075) * (cachedTokens / 1000), 10);

    // The conservative headline estimate must NOT have this discount
    // already applied - pricing the same prompt tokens with and without
    // cached tokens present (same total) gives the same conservative cost.
    const fullPrice = estimateModelCostUsd('gemini-3.6-flash', 50_000, 1000, '2026-11-15');
    expect(fullPrice).not.toBeNull();
    expect(fullPrice).toBeCloseTo((50_000 / 1000) * 0.00075 + (1000 / 1000) * 0.00375, 10);
  });

  it('gemini-3.5-flash resolves the 2026-10/12 window for a date within it', () => {
    const entry = getModelPriceEntry('gemini-3.5-flash', '2026-11-15');
    expect(entry).not.toBeNull();
    expect(entry?.effectiveFrom).toBe('2026-10-01');
    expect(entry?.effectiveUntil).toBe('2027-01-01');
  });

  it('gemini-3.5-flash resolves the open-ended Jan-2027 window for a date on/after 2027-01-01, not the earlier window', () => {
    const entry = getModelPriceEntry('gemini-3.5-flash', '2027-01-01');
    expect(entry).not.toBeNull();
    expect(entry?.effectiveFrom).toBe('2027-01-01');
    expect(entry?.effectiveUntil).toBeUndefined();

    const laterEntry = getModelPriceEntry('gemini-3.5-flash', '2027-06-01');
    expect(laterEntry?.effectiveFrom).toBe('2027-01-01');
  });

  it('estimateModelCostUsd defaults asOfIsoDate to today when omitted, matching existing callers\' behaviour', () => {
    const today = new Date().toISOString().slice(0, 10);
    const explicit = estimateModelCostUsd('gemini-3.5-flash', 1000, 1000, today);
    const defaulted = estimateModelCostUsd('gemini-3.5-flash', 1000, 1000);
    expect(defaulted).toBe(explicit);
  });

  it('gemini-3.8-flash has a priced, dated promotional window through 2026-12-31 and a separate post-promotional window from 2027-01-01', () => {
    const promo = getModelPriceEntry('gemini-3.8-flash', '2026-12-15');
    expect(promo?.effectiveFrom).toBe('2026-09-01');
    expect(promo?.effectiveUntil).toBe('2027-01-01');
    expect(promo?.isEstimate).toBe(true);

    const postPromo = getModelPriceEntry('gemini-3.8-flash', '2027-02-01');
    expect(postPromo?.effectiveFrom).toBe('2027-01-01');
    expect(postPromo).not.toBe(promo);
  });

  it('gemini-2.0-flash (legacy) still resolves for a historical date, unaffected by the new window mechanism', () => {
    const entry = getModelPriceEntry('gemini-2.0-flash', '2025-06-01');
    expect(entry).not.toBeNull();
    expect(estimateModelCostUsd('gemini-2.0-flash', 1000, 1000)).not.toBeNull();
  });
});
