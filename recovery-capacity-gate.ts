// Recovery Capacity Gate - the deterministic answer to "how much effort is
// reasonable to ask of this person right now?", consumed by
// recovery-routing-engine.ts before it ever compares intervention
// candidates. Pure functions only (no Firestore, no React, no AI).
//
// The governing rule (spec section on the Capacity Gate): this may use only
// legitimate, explicit information - a current self-report, a real capacity
// check-in, a real delta state, or an outcome the user just reported from an
// intervention that actually ran. It must never infer bandwidth from
// navigation behaviour, typing speed, device signals or other passive
// surveillance, and missing data must never be silently treated as low
// capacity - the honest answer when nothing legitimate is available is
// "ask one lightweight question", not a guess.

import type { DeltaStateKey } from './energy-delta-engine';

export type BandwidthBand = 'low_bandwidth' | 'some_bandwidth' | 'reflective_bandwidth';

export const BANDWIDTH_BAND_ORDER: BandwidthBand[] = ['low_bandwidth', 'some_bandwidth', 'reflective_bandwidth'];

export const BANDWIDTH_BAND_LABELS: Record<BandwidthBand, string> = {
  low_bandwidth: 'Almost nothing',
  some_bandwidth: 'A short guided step',
  reflective_bandwidth: 'Room to think this through',
};

const BANDWIDTH_RANK: Record<BandwidthBand, number> = {
  low_bandwidth: 0,
  some_bandwidth: 1,
  reflective_bandwidth: 2,
};

// The one lightweight question the spec gives verbatim ("What have you got
// room for right now?") - answers map 1:1 onto the three bands, so a direct
// self-report never needs interpreting, only recording.
export const BANDWIDTH_SELF_REPORT_OPTIONS: { value: BandwidthBand; label: string }[] = [
  { value: 'low_bandwidth', label: 'Almost nothing' },
  { value: 'some_bandwidth', label: 'A quick reset' },
  { value: 'reflective_bandwidth', label: 'I can think this through' },
];

// Delta states (energy-delta-engine.ts) that represent demand already
// outrunning reported capacity - used here only to catch the case where a
// capacity check-in is stale but current load clearly is not, never to
// invent a number beyond what that engine already computed.
const SEVERELY_STRAINED_DELTA_STATES: DeltaStateKey[] = ['capacity_strained', 'over_capacity', 'significant_gap'];
const MILDLY_STRAINED_DELTA_STATES: DeltaStateKey[] = ['near_limit', ...SEVERELY_STRAINED_DELTA_STATES];

export type CapacityGateSource =
  | 'explicit_self_report'
  | 'capacity_check_in'
  | 'recent_intervention_signal'
  | 'insufficient_data';

export interface CapacityGateInput {
  // Highest priority: the user directly answered "what have you got room
  // for right now?" this session. Always wins when present.
  explicitBandwidthReport?: BandwidthBand | null;
  // A real capacity check-in's 0-100 score (energy-delta-engine.ts's
  // computeCapacityScore), if one exists for today.
  capacityScore?: number | null;
  // The current Energy Delta state, if computed - lets a stale check-in be
  // overridden by demand that has clearly moved since.
  deltaState?: DeltaStateKey | null;
  // The outcome the user just reported from a reset/intervention that ran
  // moments ago in this same session - real, current session behaviour, not
  // an inference from how they are using the app.
  recentResetOutcome?: 'calmer' | 'about_the_same' | 'not_really' | null;
  // The user has just abandoned an intervention mid-way - a real, explicit
  // signal from this session, not a guess.
  recentInterventionAbandoned?: boolean;
}

export interface CapacityGateResult {
  // null only when nothing legitimate was available to judge from - callers
  // must ask one question, never assume low_bandwidth by default.
  band: BandwidthBand | null;
  sufficientData: boolean;
  source: CapacityGateSource;
}

export const determineBandwidth = (input: CapacityGateInput): CapacityGateResult => {
  if (input.explicitBandwidthReport) {
    return { band: input.explicitBandwidthReport, sufficientData: true, source: 'explicit_self_report' };
  }

  if (input.recentInterventionAbandoned) {
    return { band: 'low_bandwidth', sufficientData: true, source: 'recent_intervention_signal' };
  }

  if (typeof input.capacityScore === 'number') {
    const severelyStrained = !!input.deltaState && SEVERELY_STRAINED_DELTA_STATES.includes(input.deltaState);
    const mildlyStrained = !!input.deltaState && MILDLY_STRAINED_DELTA_STATES.includes(input.deltaState);

    if (severelyStrained || input.capacityScore <= 40) {
      return { band: 'low_bandwidth', sufficientData: true, source: 'capacity_check_in' };
    }
    if (mildlyStrained || input.capacityScore <= 65) {
      return { band: 'some_bandwidth', sufficientData: true, source: 'capacity_check_in' };
    }
    return { band: 'reflective_bandwidth', sufficientData: true, source: 'capacity_check_in' };
  }

  if (input.recentResetOutcome === 'not_really') {
    return { band: 'low_bandwidth', sufficientData: true, source: 'recent_intervention_signal' };
  }

  return { band: null, sufficientData: false, source: 'insufficient_data' };
};

// Whether a candidate requiring `effort` fits inside the gate's current
// ceiling. A null band (insufficient data) never silently passes anything -
// callers should ask the one lightweight question before reaching here, but
// this still fails closed if they don't.
export const isEffortWithinBandwidth = (effort: BandwidthBand, band: BandwidthBand | null): boolean => {
  if (band === null) return false;
  return BANDWIDTH_RANK[effort] <= BANDWIDTH_RANK[band];
};
