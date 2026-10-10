// Nova Manager Coach - translates an already-computed Work Design Signal
// (work-design-signals.ts) into ONE practical management action. Pure
// functions only (no Firestore, no React, no AI) - same Decision
// Compression doctrine as recovery-decision-copy.ts from the unrelated
// Recovery Routing Engine effort: deterministic engines compute, static
// copy templates translate, Nova never freeform-generates text and never
// says more than the signal data actually supports. A manager should
// never see 14 improvements - at most one primary recommendation, with a
// single generic escape hatch to look at something else.
//
// Deliberately narrow for now: only meeting_pressure has a real signal
// function (work-design-signals.ts, PR1), so this module only knows how
// to recommend something for that one signal. Focus Fragmentation,
// After-Hours Pressure, Task Pressure etc. get their own template sets in
// later PRs, once their own signal functions exist - never faked ahead of
// that.

import type { SignalBand } from './work-design-signals';
import type { EmployeeBurdenLevel } from './work-design-interventions';

export interface ManagerSignalInput {
  signalKey: string;
  label: string;
  band: SignalBand | null;
  // The signal's own plain-language basis (e.g. "Averaging 28h of
  // meetings/week...") - reused verbatim as the recommendation's "why",
  // never replaced with invented specifics.
  basis: string;
}

// Structural Burden Router (Work Design Pulse PR5) - the B2B equivalent of
// the unrelated Recovery Routing Engine's Decision Compression: ONE
// primary recommendation plus ONE real alternative, never a longer list.
// Each concrete action also names its own expected Employee Burden
// (work-design-interventions.ts's EMPLOYEE_BURDEN_LEVELS) up front, before
// a manager ever starts a trial from it - so the tradeoff is visible at
// the moment of choice, not discovered afterward.
export interface ManagerRecommendation {
  signalKey: string;
  headline: string;
  why: string;
  primaryActionLabel: string;
  primaryActionBurden: EmployeeBurdenLevel;
  alternativeActionLabel: string;
  alternativeActionBurden: EmployeeBurdenLevel;
}

// Only a genuinely elevated/sustained band warrants a recommendation at
// all - a low or typical band means there's nothing to suggest changing,
// matching the signal card's own "never invented when things look fine"
// rule (describeSignalsNeedingAttention, server.ts).
type AttentionBand = 'elevated' | 'sustained';

const isAttentionBand = (band: SignalBand | null): band is AttentionBand =>
  band === 'elevated' || band === 'sustained';

const MEETING_PRESSURE_HEADLINES: Record<AttentionBand, string> = {
  elevated: 'Meeting load is heavier than typical for this team',
  sustained: 'Meeting load has been consistently heavy for this team',
};

const MEETING_PRESSURE_PRIMARY_ACTION: Record<AttentionBand, string> = {
  elevated: 'Protect a 2-hour meeting-free block this week',
  sustained: 'Protect a recurring meeting-free block each week',
};

// The real second option Decision Compression offers alongside the
// primary action - a genuinely different structural lever on the same
// signal, not a generic "explore something else" escape hatch. Blocking
// time off removes the meetings entirely for that window (lower burden on
// employees); defaulting meetings shorter asks nothing extra of anyone
// but only reduces load incrementally across every meeting rather than
// protecting a guaranteed block - a real tradeoff a manager can weigh.
const MEETING_PRESSURE_ALTERNATIVE_ACTION: Record<AttentionBand, string> = {
  elevated: 'Default new recurring meetings to 25 minutes instead of 30',
  sustained: 'Cap every recurring meeting at 25 minutes by default',
};

const MEETING_PRESSURE_PRIMARY_BURDEN: EmployeeBurdenLevel = 'removes';
const MEETING_PRESSURE_ALTERNATIVE_BURDEN: EmployeeBurdenLevel = 'neutral';

const SIGNAL_TEMPLATES: Record<string, {
  headlines: Record<AttentionBand, string>;
  primaryActions: Record<AttentionBand, string>;
  alternativeActions: Record<AttentionBand, string>;
  primaryBurden: EmployeeBurdenLevel;
  alternativeBurden: EmployeeBurdenLevel;
}> = {
  meeting_pressure: {
    headlines: MEETING_PRESSURE_HEADLINES,
    primaryActions: MEETING_PRESSURE_PRIMARY_ACTION,
    alternativeActions: MEETING_PRESSURE_ALTERNATIVE_ACTION,
    primaryBurden: MEETING_PRESSURE_PRIMARY_BURDEN,
    alternativeBurden: MEETING_PRESSURE_ALTERNATIVE_BURDEN,
  },
};

// Builds a recommendation for exactly one signal, or null when that
// signal doesn't warrant one (band too low) or isn't a signal this module
// has a template for yet.
export const buildManagerRecommendation = (input: ManagerSignalInput): ManagerRecommendation | null => {
  if (!isAttentionBand(input.band)) return null;
  const templates = SIGNAL_TEMPLATES[input.signalKey];
  if (!templates) return null;
  return {
    signalKey: input.signalKey,
    headline: templates.headlines[input.band],
    why: input.basis,
    primaryActionLabel: templates.primaryActions[input.band],
    primaryActionBurden: templates.primaryBurden,
    alternativeActionLabel: templates.alternativeActions[input.band],
    alternativeActionBurden: templates.alternativeBurden,
  };
};

// Decision Compression across the whole signal set: at most ONE primary
// recommendation, ever - the first signal (in the order the caller
// already prioritised them) that actually produces one wins; every
// signal after it is simply not shown as a second demand on the manager's
// attention this visit.
export const buildTopManagerRecommendation = (signals: ManagerSignalInput[]): ManagerRecommendation | null => {
  for (const signal of signals) {
    const recommendation = buildManagerRecommendation(signal);
    if (recommendation) return recommendation;
  }
  return null;
};
