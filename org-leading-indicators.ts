// Pure logic for the org "Leading Indicators" view - kept I/O-free and
// unit-testable, same pattern as org-risk-trend.ts.
//
// What this is, and deliberately is NOT: it turns the aggregate, k-anonymous
// climate and mood signals the org dashboard already computes into a small
// set of *leading indicators* - each one's current level, and its direction
// of travel over the last ~4 weeks. Leading indicators move BEFORE hard
// outcomes, which is the whole value: an early, structural read on working
// conditions so an org can act on workload/staffing.
//
// It is NOT a prediction. It states no future outcome, no probability, no
// absence/turnover forecast, and produces nothing at the level of an
// individual. Every note is descriptive ("worsening over the last month"),
// never predictive ("will lead to X"). This is the deliberately-defensible
// alternative to an absence-prediction model: same decision-support value,
// none of the surveillance or fabricated-authority.

import { TrendResult, TrendDirection } from './org-risk-trend';

export type IndicatorSeverity = 'low' | 'moderate' | 'elevated';

export interface LeadingIndicator {
  key: string;
  label: string;
  level: number | null; // 0-100 strain, higher = more strained
  severity: IndicatorSeverity | null;
  direction: TrendDirection;
  delta: number | null;
  note: string;
}

// Same thresholds the dashboard already uses for its colour bands, kept in
// sync so the words and the colours never disagree.
export function severityOf(level: number | null): IndicatorSeverity | null {
  if (level === null || Number.isNaN(level)) return null;
  if (level >= 60) return 'elevated';
  if (level >= 35) return 'moderate';
  return 'low';
}

// Descriptive, non-predictive phrasing for a direction of travel.
export function directionNote(trend: TrendResult | null | undefined): string {
  if (!trend || trend.direction === 'unknown' || trend.delta === null) {
    return 'Not enough history yet to show a direction.';
  }
  const pts = Math.abs(trend.delta);
  if (trend.direction === 'worsening') return `Worsening over the last ~4 weeks (+${pts} pts).`;
  if (trend.direction === 'improving') return `Improving over the last ~4 weeks (−${pts} pts).`;
  return 'Holding steady over the last ~4 weeks.';
}

export interface LeadingIndicatorInput {
  overall: number | null;
  mood: number | null;
  climate: number | null;
  overallTrend?: TrendResult | null;
  moodTrend?: TrendResult | null;
  climateTrend?: TrendResult | null;
  byDimension?: Record<string, number> | null;
}

const UNKNOWN_TREND: TrendResult = { direction: 'unknown', delta: null };

const DIMENSION_LABELS: Record<string, string> = {
  demands: 'Workload & demands',
  control: 'Control over work',
  support: 'Manager & peer support',
  relationships: 'Working relationships',
  role: 'Role clarity',
  change: 'How change is handled',
};

function indicator(key: string, label: string, level: number | null, trend: TrendResult | null | undefined): LeadingIndicator {
  const t = trend || UNKNOWN_TREND;
  return {
    key,
    label,
    level: level ?? null,
    severity: severityOf(level ?? null),
    direction: t.direction,
    delta: t.delta,
    note: directionNote(t),
  };
}

// The three primary signals. Mood is the faster, more volatile early signal;
// climate (the HSE-aligned survey) is slower and more structural; overall
// blends them. Showing all three separately is deliberate.
export function buildPrimaryIndicators(input: LeadingIndicatorInput): LeadingIndicator[] {
  return [
    indicator('overall', 'Overall working-conditions strain', input.overall, input.overallTrend),
    indicator('mood', 'Day-to-day mood (early signal)', input.mood, input.moodTrend),
    indicator('climate', 'Team climate (structural)', input.climate, input.climateTrend),
  ];
}

// Per-dimension current levels. Direction is deliberately left 'unknown':
// the dashboard does not retain per-dimension history, and inventing a
// direction we can't substantiate would be exactly the fabrication this
// whole view avoids.
export function buildDimensionIndicators(byDimension: Record<string, number> | null | undefined): LeadingIndicator[] {
  if (!byDimension) return [];
  return Object.entries(byDimension).map(([dim, level]) =>
    indicator(`dim_${dim}`, DIMENSION_LABELS[dim] || dim, level, UNKNOWN_TREND),
  );
}

// Orders indicators so the ones that most warrant a look come first: things
// getting worse, then higher current strain. Never a judgement about people -
// a triage of aggregate signals for where to point structural attention.
export function sortByAttention(indicators: LeadingIndicator[]): LeadingIndicator[] {
  const dirRank: Record<TrendDirection, number> = { worsening: 0, stable: 2, improving: 3, unknown: 2 };
  return indicators.slice().sort((a, b) => {
    const dr = dirRank[a.direction] - dirRank[b.direction];
    if (dr !== 0) return dr;
    return (b.level ?? -1) - (a.level ?? -1);
  });
}
