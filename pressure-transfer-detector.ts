// Pressure Transfer Detector (Work Design Pulse PR6) - catches pressure
// that merely moved somewhere else instead of actually disappearing, using
// the same real meeting-load sub-metrics server.ts already computes
// (computeMeetingLoadSnapshotForCohort's avgMeetingHoursPerWeek,
// avgBackToBackMeetingsPerWeek, pctWithEveningMeetings,
// pctWithWeekendMeetings). Pure logic only (no Firestore, no React).
//
// Deliberately cautious: this never claims the intervention CAUSED the
// shift elsewhere - two snapshots a few weeks apart prove nothing about
// causation, only correlation worth a human's attention. Every finding's
// text says "observed alongside" / "worth checking", never "caused by" or
// "resulted in". This is the same "no data != zero" / honest-derivation
// discipline as every other real signal in this codebase: a finding is
// only ever returned when the real numbers actually show the pattern, and
// the exact real numbers are quoted back, never a vaguer summary of them.

export interface MeetingLoadMetrics {
  avgMeetingHoursPerWeek: number;
  avgBackToBackMeetingsPerWeek: number;
  pctWithEveningMeetings: number;
  pctWithWeekendMeetings: number;
}

export interface PressureTransferFinding {
  // Which sub-metric moved in the opposite direction from the primary one.
  movedTo: 'evening_meetings' | 'weekend_meetings' | 'back_to_back_meetings';
  message: string;
}

// How much avgMeetingHoursPerWeek must drop before we even consider this
// a real improvement worth checking the rest of - a 2% wobble either way
// is noise, not a genuine reduction.
const MEANINGFUL_IMPROVEMENT_FRACTION = 0.1;
// How many percentage points a share-of-team metric must rise before it
// counts as a real shift rather than week-to-week noise.
const MEANINGFUL_SHARE_INCREASE_POINTS = 10;
// How much avgBackToBackMeetingsPerWeek must rise, in absolute terms, to
// count as a real shift.
const MEANINGFUL_BACK_TO_BACK_INCREASE = 1;

const round1 = (n: number): number => Math.round(n * 10) / 10;

// Returns the single most relevant transfer finding, or null when the
// primary metric didn't meaningfully improve, or it did improve and
// nothing else meaningfully worsened - the honest "pressure actually just
// went down" case, which is not a finding, it's the point of the change.
export const detectPressureTransfer = (
  before: MeetingLoadMetrics,
  after: MeetingLoadMetrics,
): PressureTransferFinding | null => {
  const hoursImproved = before.avgMeetingHoursPerWeek > 0 &&
    (before.avgMeetingHoursPerWeek - after.avgMeetingHoursPerWeek) / before.avgMeetingHoursPerWeek >= MEANINGFUL_IMPROVEMENT_FRACTION;
  if (!hoursImproved) return null;

  const eveningIncrease = after.pctWithEveningMeetings - before.pctWithEveningMeetings;
  if (eveningIncrease >= MEANINGFUL_SHARE_INCREASE_POINTS) {
    return {
      movedTo: 'evening_meetings',
      message: `Average meeting hours dropped from ${round1(before.avgMeetingHoursPerWeek)}h to ${round1(after.avgMeetingHoursPerWeek)}h/week, but the share of the team with evening meetings rose from ${before.pctWithEveningMeetings}% to ${after.pctWithEveningMeetings}% over the same period. This doesn't confirm cause and effect - worth checking whether some pressure moved into evenings rather than disappearing.`,
    };
  }

  const weekendIncrease = after.pctWithWeekendMeetings - before.pctWithWeekendMeetings;
  if (weekendIncrease >= MEANINGFUL_SHARE_INCREASE_POINTS) {
    return {
      movedTo: 'weekend_meetings',
      message: `Average meeting hours dropped from ${round1(before.avgMeetingHoursPerWeek)}h to ${round1(after.avgMeetingHoursPerWeek)}h/week, but the share of the team with weekend meetings rose from ${before.pctWithWeekendMeetings}% to ${after.pctWithWeekendMeetings}% over the same period. This doesn't confirm cause and effect - worth checking whether some pressure moved into weekends rather than disappearing.`,
    };
  }

  const backToBackIncrease = after.avgBackToBackMeetingsPerWeek - before.avgBackToBackMeetingsPerWeek;
  if (backToBackIncrease >= MEANINGFUL_BACK_TO_BACK_INCREASE) {
    return {
      movedTo: 'back_to_back_meetings',
      message: `Average meeting hours dropped from ${round1(before.avgMeetingHoursPerWeek)}h to ${round1(after.avgMeetingHoursPerWeek)}h/week, but back-to-back meetings rose from ${round1(before.avgBackToBackMeetingsPerWeek)} to ${round1(after.avgBackToBackMeetingsPerWeek)} per week over the same period. This doesn't confirm cause and effect - worth checking whether the remaining meetings simply got packed tighter rather than the load actually easing.`,
    };
  }

  return null;
};
