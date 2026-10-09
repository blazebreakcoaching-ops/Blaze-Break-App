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

export interface ManagerSignalInput {
  signalKey: string;
  label: string;
  band: SignalBand | null;
  // The signal's own plain-language basis (e.g. "Averaging 28h of
  // meetings/week...") - reused verbatim as the recommendation's "why",
  // never replaced with invented specifics.
  basis: string;
}

export interface ManagerRecommendation {
  signalKey: string;
  headline: string;
  why: string;
  primaryActionLabel: string;
  secondaryActionLabel: string;
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

// The one non-route escape hatch every recommendation offers - matching
// recovery-decision-copy.ts's own "Browse everything" pattern. There is
// no second concrete alternative to offer yet (meeting_pressure is the
// only signal), so this stays generic rather than inventing a plausible-
// looking second option.
const SECONDARY_ACTION_LABEL = 'Explore a different change';

const SIGNAL_TEMPLATES: Record<string, { headlines: Record<AttentionBand, string>; primaryActions: Record<AttentionBand, string> }> = {
  meeting_pressure: { headlines: MEETING_PRESSURE_HEADLINES, primaryActions: MEETING_PRESSURE_PRIMARY_ACTION },
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
    secondaryActionLabel: SECONDARY_ACTION_LABEL,
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
