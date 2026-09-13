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
