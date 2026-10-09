// Work Design Action Board / Intervention Register - the closed loop the
// master spec calls "a core missing closed loop": a structural change a
// manager actually tries, tracked from suggestion through to a measured
// (or honestly inconclusive) outcome. Pure logic only (no Firestore, no
// React) - server.ts owns reading/writing
// organisations/{orgId}/work_design_interventions; this file only defines
// what a valid intervention record looks like, same split as
// team-escalation.ts.
//
// Deliberately a factual record, not a verified experiment: there is no
// way to confirm a manager genuinely made the change, and no automatic
// causation claim is ever computed here - "observed after" language,
// never "caused by" (that distinction belongs to whatever later
// summarises the outcome, this module just stores what was reported).

export const INTERVENTION_STATUSES = [
  'suggested', 'under_review', 'approved', 'trialling', 'active',
  'review_due', 'completed', 'stopped', 'no_benefit', 'changed',
] as const;
export type InterventionStatus = (typeof INTERVENTION_STATUSES)[number];

export const isInterventionStatus = (value: unknown): value is InterventionStatus =>
  typeof value === 'string' && (INTERVENTION_STATUSES as readonly string[]).includes(value);

// The spec's own "What happened?" options - a manager's honest, qualitative
// read of a trial, never a precise measured metric (that's a separate,
// optional quantitative comparison a later PR may add on top of this).
export const OUTCOME_RATINGS = [
  'useful', 'partly_useful', 'no_clear_difference', 'created_another_problem', 'stopped_early',
] as const;
export type OutcomeRating = (typeof OUTCOME_RATINGS)[number];

export const isOutcomeRating = (value: unknown): value is OutcomeRating =>
  typeof value === 'string' && (OUTCOME_RATINGS as readonly string[]).includes(value);

const MAX_SHORT = 300;
const MAX_LONG = 1000;
// Matches the Nova Manager Coach card's own "Trial for 3 Weeks" framing -
// the default review window when a manager starts a trial directly from a
// recommendation, overridable per intervention.
export const DEFAULT_REVIEW_WINDOW_DAYS = 21;

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

export interface CreateInterventionInput {
  team: string;
  signalKey: string;
  proposedChange: string;
  why: string;
  reviewInDays?: number;
}

export const validateCreateInterventionInput = (input: unknown): ValidationResult => {
  if (!input || typeof input !== 'object') {
    return { valid: false, error: 'An intervention object is required.' };
  }
  const c = input as Record<string, unknown>;
  if (typeof c.team !== 'string' || c.team.trim().length === 0 || c.team.length > MAX_SHORT) {
    return { valid: false, error: `"team" is required (max ${MAX_SHORT} characters).` };
  }
  if (typeof c.signalKey !== 'string' || c.signalKey.trim().length === 0 || c.signalKey.length > MAX_SHORT) {
    return { valid: false, error: `"signalKey" is required (max ${MAX_SHORT} characters).` };
  }
  if (typeof c.proposedChange !== 'string' || c.proposedChange.trim().length === 0 || c.proposedChange.length > MAX_SHORT) {
    return { valid: false, error: `"proposedChange" is required (max ${MAX_SHORT} characters).` };
  }
  if (typeof c.why !== 'string' || c.why.length > MAX_LONG) {
    return { valid: false, error: `"why" must be a string (max ${MAX_LONG} characters).` };
  }
  if (c.reviewInDays !== undefined) {
    if (typeof c.reviewInDays !== 'number' || !Number.isFinite(c.reviewInDays) || c.reviewInDays < 1 || c.reviewInDays > 365) {
      return { valid: false, error: '"reviewInDays" must be a number between 1 and 365.' };
    }
  }
  return { valid: true };
};

export const validateStatusUpdateInput = (input: unknown): ValidationResult => {
  if (!input || typeof input !== 'object') {
    return { valid: false, error: 'A status update object is required.' };
  }
  const c = input as Record<string, unknown>;
  if (!isInterventionStatus(c.status)) {
    return { valid: false, error: `"status" must be one of: ${INTERVENTION_STATUSES.join(', ')}.` };
  }
  return { valid: true };
};

export interface RecordOutcomeInput {
  outcomeRating: OutcomeRating;
  actualOutcome?: string | null;
  outcomeNotes?: string | null;
}

export const validateRecordOutcomeInput = (input: unknown): ValidationResult => {
  if (!input || typeof input !== 'object') {
    return { valid: false, error: 'An outcome object is required.' };
  }
  const c = input as Record<string, unknown>;
  if (!isOutcomeRating(c.outcomeRating)) {
    return { valid: false, error: `"outcomeRating" must be one of: ${OUTCOME_RATINGS.join(', ')}.` };
  }
  for (const field of ['actualOutcome', 'outcomeNotes'] as const) {
    const v = c[field];
    if (v !== undefined && v !== null && (typeof v !== 'string' || v.length > MAX_LONG)) {
      return { valid: false, error: `"${field}" must be a string (max ${MAX_LONG} characters) if provided.` };
    }
  }
  return { valid: true };
};
