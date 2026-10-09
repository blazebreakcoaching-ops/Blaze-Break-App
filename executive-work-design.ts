// Executive Work Design - the financial-range estimate half of the
// Executive Work Design report. Pure functions only (no Firestore, no
// React) - the org-wide Work Design Signal computation and the org's own
// entered cost-of-pressure figures both live in server.ts already; this
// module only decides what, if anything, an honest illustrative cost
// range looks like once those two real inputs exist.
//
// The spec's own rule: financial estimates are always shown as a RANGE
// with an explicit stated assumption, never a single precise-looking
// number - the opposite of the old ExecutiveBoardReport.tsx, which
// labelled a user's own gamification points total "Recovery ROI".
//
// Deliberately conservative in two ways:
// 1. Never invented when things look fine - an estimate is only built
//    when the org's own Work Design Signal is elevated or sustained,
//    matching this whole system's "never fabricate urgency" rule.
// 2. Never a causal claim - the range is explicitly framed as an
//    illustrative share of the org's own already-entered real absence
//    cost (see cost-inputs route in server.ts), not a measured effect
//    this organisation's data has demonstrated.

import type { SignalBand } from './work-design-signals';

export interface CostInputs {
  annualSicknessDays: number;
  avgDailyCostPerEmployee: number;
  headcount: number;
}

export interface FinancialRangeEstimate {
  lowEstimate: number;
  highEstimate: number;
  currency: 'GBP';
  assumptionNote: string;
}

// The illustrative share of entered absence cost commonly attributed, in
// general workplace research, to work-design/workload pressure factors -
// a stated assumption, not a measurement of this organisation's own data.
const ATTRIBUTION_LOW = 0.05;
const ATTRIBUTION_HIGH = 0.15;

const ESTIMATE_ELIGIBLE_BANDS = new Set<SignalBand>(['elevated', 'sustained']);

export const buildFinancialRangeEstimate = (
  costInputs: CostInputs | null,
  signalLabel: string,
  band: SignalBand | null,
): FinancialRangeEstimate | null => {
  if (!costInputs || !band || !ESTIMATE_ELIGIBLE_BANDS.has(band)) return null;
  const baseAnnualCost = costInputs.annualSicknessDays * costInputs.avgDailyCostPerEmployee;
  if (!(baseAnnualCost > 0)) return null;
  const lowEstimate = Math.round(baseAnnualCost * ATTRIBUTION_LOW);
  const highEstimate = Math.round(baseAnnualCost * ATTRIBUTION_HIGH);
  return {
    lowEstimate,
    highEstimate,
    currency: 'GBP',
    assumptionNote: `Illustrative only: assumes ${Math.round(ATTRIBUTION_LOW * 100)}-${Math.round(ATTRIBUTION_HIGH * 100)}% of your organisation's entered annual absence cost (£${baseAnnualCost.toLocaleString()}) is commonly attributed to work-design pressure factors in general workplace research - not a measured effect of your organisation's own data. Shown because your ${signalLabel} signal is currently ${band}.`,
  };
};
