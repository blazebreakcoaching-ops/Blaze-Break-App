import { describe, it, expect } from 'vitest';
import { estimateModelCostUsd, getModelPriceEntry } from './ai-model-price-registry';

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

  it('gemini-3.6-flash has no price entry at all - no documented rate was found, so cost estimation honestly returns null rather than a guess', () => {
    expect(getModelPriceEntry('gemini-3.6-flash')).toBeNull();
    expect(estimateModelCostUsd('gemini-3.6-flash', 1000, 1000)).toBeNull();
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
