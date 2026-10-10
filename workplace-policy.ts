// Policy-to-Practice Gap (Work Design Pulse PR7) - compares a policy an
// organisation has explicitly declared (e.g. "no evening meetings")
// against the observed AGGREGATE pattern server.ts already computes
// (computeMeetingLoadSnapshotForCohort) - never a per-employee violation
// check. Pure logic only (no Firestore, no React), same split as
// work-design-interventions.ts/work-design-debt.ts: server.ts owns
// reading/writing organisations/{orgId}/workplace_policies; this file only
// defines what a valid declared policy looks like and how to compare it
// honestly to a real aggregate snapshot.
//
// Deliberately narrow for now: only the three policy types below map onto
// a real, already-computed sub-metric. A policy type with no real metric
// behind it would have nothing honest to compare against, so it isn't
// offered - same "never faked ahead of a real signal" discipline as
// nova-manager-coach.ts.

export const WORKPLACE_POLICY_TYPES = ['no_evening_meetings', 'no_weekend_meetings', 'max_meeting_hours_per_week'] as const;
export type WorkplacePolicyType = (typeof WORKPLACE_POLICY_TYPES)[number];

export const isWorkplacePolicyType = (value: unknown): value is WorkplacePolicyType =>
  typeof value === 'string' && (WORKPLACE_POLICY_TYPES as readonly string[]).includes(value);

const MAX_LABEL = 200;

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

export interface CreateWorkplacePolicyInput {
  type: WorkplacePolicyType;
  label: string;
  // Only required for 'max_meeting_hours_per_week' - the declared cap in
  // hours/week. Ignored for the two boolean-style policy types.
  thresholdHours?: number;
}

export const validateCreateWorkplacePolicyInput = (input: unknown): ValidationResult => {
  if (!input || typeof input !== 'object') {
    return { valid: false, error: 'A workplace policy object is required.' };
  }
  const c = input as Record<string, unknown>;
  if (!isWorkplacePolicyType(c.type)) {
    return { valid: false, error: `"type" must be one of: ${WORKPLACE_POLICY_TYPES.join(', ')}.` };
  }
  if (typeof c.label !== 'string' || c.label.trim().length === 0 || c.label.length > MAX_LABEL) {
    return { valid: false, error: `"label" is required (max ${MAX_LABEL} characters).` };
  }
  if (c.type === 'max_meeting_hours_per_week') {
    if (typeof c.thresholdHours !== 'number' || !Number.isFinite(c.thresholdHours) || c.thresholdHours <= 0 || c.thresholdHours > 168) {
      return { valid: false, error: '"thresholdHours" is required for max_meeting_hours_per_week (between 0 and 168).' };
    }
  }
  return { valid: true };
};

export interface ObservedMeetingPattern {
  avgMeetingHoursPerWeek: number;
  pctWithEveningMeetings: number;
  pctWithWeekendMeetings: number;
}

export interface PolicyGapFinding {
  message: string;
}

// A small, deliberate tolerance on the two share-of-team metrics - a
// single person's one-off evening meeting isn't a policy gap, a
// consistently nonzero share of the team is.
const SHARE_TOLERANCE_POINTS = 5;

// Returns a gap finding when the real observed aggregate doesn't match the
// declared policy, or null when it does (or the cohort wasn't big enough
// to compute an aggregate at all, in which case there's nothing honest to
// compare - never treated as "policy followed").
export const checkPolicyAgainstObservedPattern = (
  policy: { type: WorkplacePolicyType; label: string; thresholdHours?: number },
  observed: ObservedMeetingPattern,
): PolicyGapFinding | null => {
  if (policy.type === 'no_evening_meetings' && observed.pctWithEveningMeetings > SHARE_TOLERANCE_POINTS) {
    return { message: `Declared policy "${policy.label}" - but ${observed.pctWithEveningMeetings}% of the consenting cohort had an evening meeting this period.` };
  }
  if (policy.type === 'no_weekend_meetings' && observed.pctWithWeekendMeetings > SHARE_TOLERANCE_POINTS) {
    return { message: `Declared policy "${policy.label}" - but ${observed.pctWithWeekendMeetings}% of the consenting cohort had a weekend meeting this period.` };
  }
  if (policy.type === 'max_meeting_hours_per_week' && typeof policy.thresholdHours === 'number' && observed.avgMeetingHoursPerWeek > policy.thresholdHours) {
    return { message: `Declared policy "${policy.label}" (max ${policy.thresholdHours}h/week) - but the average was ${observed.avgMeetingHoursPerWeek}h/week this period.` };
  }
  return null;
};
