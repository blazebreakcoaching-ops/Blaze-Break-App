// Rollout Plans (Evolution Engine PR10) - a real, server-persisted
// COORDINATION record for staging a feature out to more of the
// audience, not a live traffic-splitting engine. That distinction is
// deliberate, not a cut corner: feature-flags.ts/feature-flag-ids.ts
// (the only real "flag" concept in this codebase) stores a flat boolean
// per flag in the viewing BROWSER's own localStorage - there is no
// per-user or server-side flag evaluation anywhere today (confirmed
// during Evolution Engine PR6's investigation into the Effective
// Configuration simulator). A genuine staged-percentage rollout needs a
// real per-user bucketing mechanism to enforce "this 25% of users see
// the new behaviour" - building that is a separate, much larger change
// to the flag system itself, not something this PR can honestly claim
// to deliver by adding a percentage field to a form.
//
// What a Rollout Plan IS: a declared target percentage, stop
// conditions, and rationale that a human can record, review, and update
// as a real coordination artefact (e.g. "we manually enabled
// enable_overload_shield for N beta accounts, targeting 25%, and will
// pause if X") - genuinely useful for governance/audit even without
// automatic enforcement, and honestly labelled as exactly that
// everywhere it's shown.

export const ROLLOUT_PLAN_STATUSES = ['planned', 'active', 'paused', 'completed', 'rolled_back'] as const;
export type RolloutPlanStatus = (typeof ROLLOUT_PLAN_STATUSES)[number];
export const isRolloutPlanStatus = (value: unknown): value is RolloutPlanStatus =>
  typeof value === 'string' && (ROLLOUT_PLAN_STATUSES as readonly string[]).includes(value);

export interface RolloutPlanStatusEvent {
  status: RolloutPlanStatus;
  at: string;
  by: string;
  note: string | null;
}

export interface RolloutPlan {
  rolloutId: string;
  targetFeatureId: string;
  targetPercentage: number;
  stopConditions: string;
  rationale: string;
  status: RolloutPlanStatus;
  statusHistory: RolloutPlanStatusEvent[];
  createdBy: string;
  createdByEmail: string | null;
  createdAt: string;
  updatedAt: string;
}

const ALLOWED_TRANSITIONS: Record<RolloutPlanStatus, readonly RolloutPlanStatus[]> = {
  planned: ['active', 'rolled_back'],
  active: ['paused', 'completed', 'rolled_back'],
  paused: ['active', 'rolled_back'],
  completed: [],
  rolled_back: [],
};

export const canTransitionRolloutStatus = (from: RolloutPlanStatus, to: RolloutPlanStatus): boolean =>
  ALLOWED_TRANSITIONS[from].includes(to);

export interface RolloutPlanValidationResult {
  valid: boolean;
  error?: string;
}

const MAX_STOP_CONDITIONS = 2000;
const MAX_RATIONALE = 2000;
const MAX_TARGET_FEATURE_ID = 200;

export const validateRolloutPlanCreate = (input: unknown): RolloutPlanValidationResult => {
  if (!input || typeof input !== 'object') {
    return { valid: false, error: 'A rollout plan object is required.' };
  }
  const c = input as Record<string, unknown>;
  if (typeof c.targetFeatureId !== 'string' || c.targetFeatureId.length === 0 || c.targetFeatureId.length > MAX_TARGET_FEATURE_ID) {
    return { valid: false, error: `"targetFeatureId" is required (max ${MAX_TARGET_FEATURE_ID} characters).` };
  }
  if (typeof c.targetPercentage !== 'number' || !Number.isFinite(c.targetPercentage) || c.targetPercentage < 0 || c.targetPercentage > 100) {
    return { valid: false, error: '"targetPercentage" must be a number between 0 and 100.' };
  }
  if (typeof c.stopConditions !== 'string' || c.stopConditions.trim().length === 0 || c.stopConditions.length > MAX_STOP_CONDITIONS) {
    return { valid: false, error: `"stopConditions" is required (max ${MAX_STOP_CONDITIONS} characters).` };
  }
  if (typeof c.rationale !== 'string' || c.rationale.trim().length === 0 || c.rationale.length > MAX_RATIONALE) {
    return { valid: false, error: `"rationale" is required (max ${MAX_RATIONALE} characters).` };
  }
  return { valid: true };
};
