// Work Design Signals - the deterministic core behind the B2B "Work
// Design Intelligence" rebuild (see the master spec this implements).
// Pure functions only (no Firestore, no React, no AI) - every band and
// confidence label shown to a manager/HR/executive traces back to a
// function here, never a model guess and never raw individual data.
//
// The governing product question is deliberately NOT "which employees
// are struggling?" - it's "where is work becoming unnecessarily hard?".
// Nothing in this file accepts or returns anything at individual-employee
// granularity; every input is already a cohort-level aggregate that has
// passed a k-anonymity threshold upstream (see the Anonymous Aggregation
// Engine, a later PR in this effort) before it ever reaches here.
//
// "No data != zero" is the other hard rule this module exists to
// enforce structurally, not just in prose: a signal's band is only ever
// computed from DataSufficiency.status === 'available' data. Every other
// status (insufficient_data/not_connected/stale/demo) short-circuits to a
// null band with an honest explanation, so a caller can never accidentally
// render "0% meeting pressure" when the real answer is "we don't know".

export type SignalBand = 'low' | 'typical' | 'elevated' | 'sustained';

export const SIGNAL_BAND_ORDER: SignalBand[] = ['low', 'typical', 'elevated', 'sustained'];

export const SIGNAL_BAND_LABELS: Record<SignalBand, string> = {
  low: 'Low',
  typical: 'Typical',
  elevated: 'Elevated',
  sustained: 'Sustained',
};

export type WorkDesignConfidence = 'strong' | 'moderate' | 'limited' | 'insufficient';

export const CONFIDENCE_ORDER: WorkDesignConfidence[] = ['insufficient', 'limited', 'moderate', 'strong'];

export const CONFIDENCE_LABELS: Record<WorkDesignConfidence, string> = {
  strong: 'Strong',
  moderate: 'Moderate',
  limited: 'Limited',
  insufficient: 'Insufficient',
};

// Every status except 'available' means "we genuinely don't know" for a
// distinct, real reason - never collapsed into a single generic "no data"
// bucket, since the right thing to tell a manager differs (reconnect vs
// wait vs this is only a demo).
export type DataSufficiencyStatus = 'available' | 'insufficient_data' | 'not_connected' | 'stale' | 'demo';

export interface DataSufficiency {
  status: DataSufficiencyStatus;
  // Plain-language explanation - always present, since every non-available
  // status must say why rather than silently rendering nothing.
  message: string;
}

export const dataUnavailable = (status: Exclude<DataSufficiencyStatus, 'available'>, message: string): DataSufficiency =>
  ({ status, message });

export const dataAvailable = (): DataSufficiency => ({ status: 'available', message: '' });

export interface SignalResult {
  band: SignalBand | null;
  sufficiency: DataSufficiency;
  // Short, plain-language basis for the band - "why it says what it says",
  // shown via the shared signal card's "Evidence" field. Empty when band
  // is null, since there is nothing to explain yet.
  basis: string;
}

// ---------- Meeting Pressure ----------
//
// Sourced from computeMeetingLoadSnapshotForCohort (server.ts) - each
// consenting, calendar-connected member's own live_signals/calendar doc,
// averaged across the cohort. Thresholds below are a documented first-pass
// heuristic (not a validated clinical or scientific cutoff): a 40-hour
// work week with roughly a third in meetings is "typical" knowledge-work
// load; sustained multi-day-equivalent meeting weeks are where uninterrupted
// work becomes structurally difficult to find at all. These are explicitly
// revisitable once real organisation outcome data exists (see the
// Work Design Action Board's "What We Know Works Here" evidence loop).
export interface MeetingPressureInput {
  avgMeetingHoursPerWeek: number;
  avgBackToBackMeetingsPerWeek: number;
  pctWithEveningMeetings: number;
  pctWithWeekendMeetings: number;
}

const MEETING_HOURS_LOW_MAX = 10;
const MEETING_HOURS_TYPICAL_MAX = 18;
const MEETING_HOURS_ELEVATED_MAX = 25;
// Back-to-back meetings and evening/weekend meeting prevalence can each
// push a band up by one step - they never override hours outright, since
// hours is the primary, most directly interpretable figure. bumpBand's own
// clamp means this can never push an already-sustained load any further.
const BACK_TO_BACK_NUDGE_THRESHOLD = 8;
const AFTER_HOURS_PREVALENCE_NUDGE_THRESHOLD = 40;

const bumpBand = (band: SignalBand): SignalBand => {
  const idx = SIGNAL_BAND_ORDER.indexOf(band);
  return SIGNAL_BAND_ORDER[Math.min(idx + 1, SIGNAL_BAND_ORDER.length - 1)];
};

export const computeMeetingPressureBand = (input: MeetingPressureInput): { band: SignalBand; basis: string } => {
  let band: SignalBand =
    input.avgMeetingHoursPerWeek <= MEETING_HOURS_LOW_MAX ? 'low'
      : input.avgMeetingHoursPerWeek <= MEETING_HOURS_TYPICAL_MAX ? 'typical'
      : input.avgMeetingHoursPerWeek <= MEETING_HOURS_ELEVATED_MAX ? 'elevated'
      : 'sustained';

  const nudged = input.avgBackToBackMeetingsPerWeek >= BACK_TO_BACK_NUDGE_THRESHOLD
    || input.pctWithEveningMeetings >= AFTER_HOURS_PREVALENCE_NUDGE_THRESHOLD
    || input.pctWithWeekendMeetings >= AFTER_HOURS_PREVALENCE_NUDGE_THRESHOLD;
  if (nudged) band = bumpBand(band);

  const basis = `Averaging ${input.avgMeetingHoursPerWeek}h of meetings/week across the contributing cohort`
    + (input.avgBackToBackMeetingsPerWeek > 0 ? `, ${input.avgBackToBackMeetingsPerWeek} back-to-back/week` : '')
    + (input.pctWithEveningMeetings > 0 ? `, ${input.pctWithEveningMeetings}% with evening meetings` : '')
    + (input.pctWithWeekendMeetings > 0 ? `, ${input.pctWithWeekendMeetings}% with weekend meetings` : '')
    + '.';

  return { band, basis };
};

// Wraps computeMeetingPressureBand with the "no data != zero" gate - the
// one entry point server.ts/components should actually call, so the gate
// can never accidentally be skipped by a caller that only has the band
// function in view.
//
// staleCount/threshold are optional so existing minimal callers (and
// existing tests) keep working unchanged; when both are supplied, an
// unavailable result distinguishes "nobody has connected a calendar at
// all" (not_connected) from "enough people HAVE connected, but their
// data is too old to use" (stale) - the type already declared this
// distinction (DataSufficiencyStatus) but nothing ever produced it,
// which meant a manager reconnecting a calendar and a manager who'd
// never been asked to saw the exact same message.
export const evaluateMeetingPressure = (
  snapshot: { available: boolean; cohortSize: number; staleCount?: number; threshold?: number } & Partial<MeetingPressureInput>,
): SignalResult => {
  if (!snapshot.available
    || typeof snapshot.avgMeetingHoursPerWeek !== 'number'
    || typeof snapshot.avgBackToBackMeetingsPerWeek !== 'number'
    || typeof snapshot.pctWithEveningMeetings !== 'number'
    || typeof snapshot.pctWithWeekendMeetings !== 'number'
  ) {
    const staleCount = snapshot.staleCount ?? 0;
    if (snapshot.cohortSize === 0 && staleCount === 0) {
      return {
        band: null,
        sufficiency: dataUnavailable('not_connected', 'No consenting members have connected a calendar yet.'),
        basis: '',
      };
    }
    if (staleCount > 0 && snapshot.threshold != null && snapshot.cohortSize + staleCount >= snapshot.threshold && snapshot.cohortSize < snapshot.threshold) {
      return {
        band: null,
        sufficiency: dataUnavailable('stale', `${staleCount} member${staleCount === 1 ? '' : 's'} connected a calendar before, but ${staleCount === 1 ? "hasn't" : "haven't"} synced in over 2 weeks - treated as missing, not shown as an old snapshot.`),
        basis: '',
      };
    }
    return {
      band: null,
      sufficiency: dataUnavailable('insufficient_data', 'Not enough consenting members have connected their calendar yet for this to be shown safely.'),
      basis: '',
    };
  }
  const { band, basis } = computeMeetingPressureBand({
    avgMeetingHoursPerWeek: snapshot.avgMeetingHoursPerWeek,
    avgBackToBackMeetingsPerWeek: snapshot.avgBackToBackMeetingsPerWeek,
    pctWithEveningMeetings: snapshot.pctWithEveningMeetings,
    pctWithWeekendMeetings: snapshot.pctWithWeekendMeetings,
  });
  return { band, sufficiency: dataAvailable(), basis };
};

// ---------- Confidence ----------
//
// Confidence is deliberately separate from the band itself - a signal can
// have a clear band and still deserve a "Limited" confidence tag if the
// contributing cohort is thin or the time window is short. Combines three
// real inputs the spec calls out by name: sample size relative to the
// configured threshold, observation window length, and connector/source
// coverage (what fraction of the relevant org population actually
// contributed data).
export interface ConfidenceInput {
  cohortSize: number;
  cohortThreshold: number;
  daysObserved: number;
  minDaysForFullConfidence: number;
  // 0-100. Fraction of the eligible population that actually contributed
  // (e.g. connected their calendar) - distinct from cohortSize passing the
  // anonymity threshold, which only says the sample is safe to show, not
  // that it's representative.
  coveragePercent: number;
}

const MIN_COVERAGE_FOR_MODERATE = 50;
const MIN_COVERAGE_FOR_STRONG = 75;

export const computeConfidence = (input: ConfidenceInput): { level: WorkDesignConfidence; explanation: string } => {
  const sampleRatio = input.cohortThreshold > 0 ? input.cohortSize / input.cohortThreshold : 0;
  const windowRatio = input.minDaysForFullConfidence > 0 ? input.daysObserved / input.minDaysForFullConfidence : 0;

  let level: WorkDesignConfidence;
  if (sampleRatio < 1) {
    // Below the anonymity threshold shouldn't reach this function at all
    // (the caller should already have returned insufficient_data), but if
    // it does, confidence can never be anything but insufficient.
    level = 'insufficient';
  } else if (sampleRatio >= 2 && windowRatio >= 1 && input.coveragePercent >= MIN_COVERAGE_FOR_STRONG) {
    level = 'strong';
  } else if (sampleRatio >= 1.5 && windowRatio >= 0.75 && input.coveragePercent >= MIN_COVERAGE_FOR_MODERATE) {
    level = 'moderate';
  } else {
    level = 'limited';
  }

  const explanation = `Based on ${input.cohortSize} contributing employees over ${input.daysObserved} days `
    + `(${input.coveragePercent}% coverage of the eligible group).`;

  return { level, explanation };
};

// A full confidence window is 28 days - the same month-over-month
// convention server.ts's risk-trend history already uses (comparing
// against the snapshot closest to 28 days back), so "how long has this
// org had real signal" and "how far back do we compare trends" mean the
// same thing everywhere, rather than two different arbitrary windows.
export const MIN_DAYS_FOR_FULL_CONFIDENCE = 28;

// ---------- Demo preview ----------
//
// Before PR11, a locked ("not enough consenting members yet") Work
// Design view showed nothing but a bare lock screen - an org evaluating
// the product, or one still ramping up opt-ins, had no way to see what
// it would actually show them. DataSufficiencyStatus already declared a
// 'demo' status for exactly this (see its own comment above), but
// nothing ever produced it. This is the one canonical demo fixture every
// WDI view's "preview with sample data" toggle renders - never a
// bespoke hand-written card per view, so a demo card can never silently
// diverge from what the real engine would actually produce.
export const DEMO_MEETING_PRESSURE_SIGNAL: SignalResult = {
  band: 'elevated',
  sufficiency: dataUnavailable('demo', 'Sample data - connect real calendars to replace this with your organisation\'s own signal.'),
  basis: 'Averaging 22h of meetings/week across the contributing cohort, 9 back-to-back/week, 40% with evening meetings.',
};

// Ready-shaped for the UI's WorkDesignSignalCard - the exact same shape
// server.ts's buildMeetingPressureSignal returns, so a frontend "preview
// with sample data" toggle renders through the identical card component
// a real signal uses, never a bespoke demo-only layout.
export const DEMO_WORK_DESIGN_SIGNALS = [{
  key: 'meeting_pressure',
  label: 'Meeting Pressure',
  band: DEMO_MEETING_PRESSURE_SIGNAL.band,
  bandLabel: DEMO_MEETING_PRESSURE_SIGNAL.band ? SIGNAL_BAND_LABELS[DEMO_MEETING_PRESSURE_SIGNAL.band] : null,
  sufficiencyStatus: DEMO_MEETING_PRESSURE_SIGNAL.sufficiency.status,
  sufficiencyMessage: DEMO_MEETING_PRESSURE_SIGNAL.sufficiency.message,
  basis: DEMO_MEETING_PRESSURE_SIGNAL.basis,
  confidence: null as WorkDesignConfidence | null,
  confidenceExplanation: null as string | null,
}];
