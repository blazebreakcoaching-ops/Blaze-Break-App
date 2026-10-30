// Pure cost-estimation logic for the admin Cost & Usage view. These are
// documented, editable INTERNAL estimates, not a live read of actual
// provider invoices (no provider in this codebase - Gemini, Twilio -
// currently exposes a queryable real-time cost API this app can call
// cheaply/reliably). Every rate below is a rough per-unit figure derived
// from each provider's public list pricing at the time this was written;
// see docs/COST_MONITORING.md for the sourcing and how to update them.
// Anything built on these numbers must stay visibly labelled as an
// estimate - see section 40 of the hardening brief ("make clear where
// figures are estimates").

import { estimateModelCostUsd } from './ai-model-price-registry';

export interface CostRates {
  novaTextPerMessage: number; // USD, rough average input+output tokens for a typical Nova chat turn
  novaVoicePerSession: number; // USD, rough average for a ~5 minute Live voice session
  diagnosePerCall: number; // USD, one short Gemini text completion
  smsPerSegment: number; // USD, Twilio UK SMS list price per segment (approximate)
}

// Deliberately conservative/rough - the point is order-of-magnitude
// operating visibility ("are we anywhere near budget"), not invoice-grade
// precision. Update these from real provider pricing pages periodically;
// they are not read from any live API.
export const DEFAULT_COST_RATES: CostRates = {
  novaTextPerMessage: 0.002,
  novaVoicePerSession: 0.18,
  diagnosePerCall: 0.001,
  smsPerSegment: 0.04,
};

export interface UsageTotals {
  novaTextCount: number;
  novaVoiceCount: number;
  diagnoseCount: number;
  smsSegmentCount: number;
}

// PHASE 6B (directive §2/§8) - additive, optional fields for the new,
// genuinely-measured usage signals this phase instruments at the source
// (server.ts's /api/nova/chat route and executeNovaTool). Kept separate
// from UsageTotals above rather than added to it directly, so every
// existing caller of estimateCost/UsageTotals (and its own tests) keeps
// working completely unchanged - this is a new, independent reporting
// surface, not a replacement for the count-based one.
export interface MeasuredNovaTokenUsage {
  /** Real cumulative Gemini usageMetadata.promptTokenCount, summed across the period. */
  novaTextPromptTokens: number;
  /** Real cumulative Gemini usageMetadata.candidatesTokenCount, summed across the period. */
  novaTextOutputTokens: number;
  /** PHASE 6B.1 (Priority 3) - real cumulative Gemini usageMetadata.thoughtsTokenCount (thinking/reasoning tokens), summed across the period. Billed as output tokens - see estimateNovaTextCostFromMeasuredTokens. */
  novaTextThinkingTokens: number;
  /** PHASE 6B.1 (Priority 3) - real cumulative Gemini usageMetadata.cachedContentTokenCount, summed across the period. Informational only (a subset of promptTokenCount, typically discounted) - not currently added into any cost total, since no verified cache discount rate exists in the price registry. */
  novaTextCachedTokens: number;
  /** PHASE 6B.1 (Priority 3) - real cumulative Gemini usageMetadata.toolUsePromptTokenCount, summed across the period. Expected to be 0 in this codebase's manual tool-call loop (see server.ts), captured defensively in case that ever changes. */
  novaTextToolUsePromptTokens: number;
  /** PHASE 6B.1 (Priority 3) - count of Nova chat turns where the model/mock returned NO usageMetadata at all. These turns' token counts are NOT included in novaTextPromptTokens/novaTextOutputTokens above - this counter exists so "0 extra cost" can be told apart from "cost unknown for N turns" in a report, instead of the two being silently indistinguishable. */
  novaTextUsageUnavailableCount: number;
  /** Real elapsed Nova Live voice minutes (already tracked by nova_voice_minutes). */
  novaVoiceMinutes: number;
  /** Real count of search_nova_memories tool calls. */
  memorySearchCount: number;
  /** Real count of remember_about_user calls that actually saved (consent-gated). */
  memoryWriteCount: number;
  /** Real count of agentic-action proposals (offer_guardian_support, offer_practical_assistance, propose_recovery_action, suggest_feature) that the server actually returned as offered/proposed/suggested=true. */
  agenticProposalCount: number;
  /** Real count of Brevo email sends this phase added instrumentation for. */
  emailSendCount: number;
}

export interface MeasuredCostField {
  /** The real, measured quantity this field is built from (a token count, a minute count, a call count) - never invented. */
  measuredQuantity: number;
  /** USD estimate from the configurable model-price registry, or null if the model/rate is unknown - see ai-model-price-registry.ts. Never fabricated when unavailable. */
  estimatedCostUsd: number | null;
  /** Always true for every field this function returns - there is no live provider billing API integrated anywhere in this codebase. */
  isEstimate: true;
}

// A token-grounded cost estimate for the one pathway this phase actually
// instruments with real Gemini usageMetadata (Nova text chat). Kept
// entirely separate from estimateCost() above, which remains the
// existing, UNCHANGED, flat-per-event estimator every prior phase's
// admin view and tests already depend on - this is additive, not a
// replacement. Reads from ai-model-price-registry.ts, the same
// dependency-free, Firestore-free module nhei-real-model-evaluation-runner.ts
// also consolidated onto this phase - one price table, not a second one.
//
// PHASE 6B.1 (Priority 3) - `thinkingTokens` (Gemini's
// usageMetadata.thoughtsTokenCount, summed across the period) is folded
// into the BILLABLE output-token count before pricing, since Gemini bills
// thinking tokens as output tokens (confirmed by the installed
// @google/genai SDK's own GenerateContentResponseUsageMetadata type:
// totalTokenCount is documented there as the sum of prompt, candidates,
// tool-use, AND thoughts token counts). Omitting this parameter defaults
// it to 0, so every call site from before this phase prices exactly as it
// did previously.
export function estimateNovaTextCostFromMeasuredTokens(
  modelId: string,
  promptTokens: number,
  outputTokens: number,
  thinkingTokens: number = 0,
): MeasuredCostField {
  const billableOutputTokens = outputTokens + thinkingTokens;
  return {
    measuredQuantity: promptTokens + billableOutputTokens,
    estimatedCostUsd: estimateModelCostUsd(modelId, promptTokens, billableOutputTokens),
    isEstimate: true,
  };
}

export interface EstimatedCostBreakdown {
  novaTextUsd: number;
  novaVoiceUsd: number;
  diagnoseUsd: number;
  smsUsd: number;
  totalUsd: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export const estimateCost = (totals: UsageTotals, rates: CostRates = DEFAULT_COST_RATES): EstimatedCostBreakdown => {
  const novaTextUsd = totals.novaTextCount * rates.novaTextPerMessage;
  const novaVoiceUsd = totals.novaVoiceCount * rates.novaVoicePerSession;
  const diagnoseUsd = totals.diagnoseCount * rates.diagnosePerCall;
  const smsUsd = totals.smsSegmentCount * rates.smsPerSegment;
  return {
    novaTextUsd: round2(novaTextUsd),
    novaVoiceUsd: round2(novaVoiceUsd),
    diagnoseUsd: round2(diagnoseUsd),
    smsUsd: round2(smsUsd),
    totalUsd: round2(novaTextUsd + novaVoiceUsd + diagnoseUsd + smsUsd),
  };
};

// Given a period's total estimated spend and a configured monthly budget,
// which alert threshold (if any) has been crossed. Thresholds are
// evaluated highest-first so a budget already at 100%+ is reported as
// 'protection', not 'informational'.
export type BudgetAlertLevel = 'ok' | 'informational' | 'warning' | 'urgent' | 'protection';

export const evaluateBudgetAlert = (spendUsd: number, monthlyBudgetUsd: number): BudgetAlertLevel => {
  if (monthlyBudgetUsd <= 0) return 'ok';
  const ratio = spendUsd / monthlyBudgetUsd;
  if (ratio >= 1) return 'protection';
  if (ratio >= 0.9) return 'urgent';
  if (ratio >= 0.75) return 'warning';
  if (ratio >= 0.5) return 'informational';
  return 'ok';
};
