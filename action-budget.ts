// Organisational Action Budget (Work Design Pulse PR11) - caps how many
// structural changes an organisation has actively running on its
// employees at once. Even changes that individually look good can pile
// up into more simultaneous disruption than anyone intended - this is a
// deliberate, admin-set ceiling on that, same pure/I-O-free split as
// org-data-policy.ts: server.ts owns reading/writing the org's own
// actionBudget field and counting its real active interventions; this
// file only defines the safe default, validation, and the one real
// question - "is there room to start another one right now?"

export const DEFAULT_MAX_CONCURRENT_ACTIVE_INTERVENTIONS = 3;
export const MIN_MAX_CONCURRENT_ACTIVE_INTERVENTIONS = 1;
export const MAX_MAX_CONCURRENT_ACTIVE_INTERVENTIONS = 20;

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

// Mirrors getEffectiveDataPolicy's own discipline: a missing or invalid
// stored value is never silently treated as "no limit" - it falls back
// to the safe default instead.
export const getEffectiveActionBudget = (stored: unknown): number => {
  if (
    typeof stored === 'number' &&
    Number.isFinite(stored) &&
    Number.isInteger(stored) &&
    stored >= MIN_MAX_CONCURRENT_ACTIVE_INTERVENTIONS &&
    stored <= MAX_MAX_CONCURRENT_ACTIVE_INTERVENTIONS
  ) {
    return stored;
  }
  return DEFAULT_MAX_CONCURRENT_ACTIVE_INTERVENTIONS;
};

export const validateActionBudgetUpdate = (input: unknown): ValidationResult => {
  if (
    typeof input !== 'number' ||
    !Number.isFinite(input) ||
    !Number.isInteger(input) ||
    input < MIN_MAX_CONCURRENT_ACTIVE_INTERVENTIONS ||
    input > MAX_MAX_CONCURRENT_ACTIVE_INTERVENTIONS
  ) {
    return { valid: false, error: `maxConcurrentActiveInterventions must be a whole number between ${MIN_MAX_CONCURRENT_ACTIVE_INTERVENTIONS} and ${MAX_MAX_CONCURRENT_ACTIVE_INTERVENTIONS}.` };
  }
  return { valid: true };
};

export interface ActionBudgetCheck {
  allowed: boolean;
  reason?: string;
}

export const canStartNewIntervention = (currentActiveCount: number, maxConcurrent: number): ActionBudgetCheck => {
  if (currentActiveCount >= maxConcurrent) {
    return {
      allowed: false,
      reason: `Your organisation already has ${currentActiveCount} active change${currentActiveCount === 1 ? '' : 's'} running, at its own set limit of ${maxConcurrent}. Finish or stop one before starting another - this is here so employees are never asked to absorb more simultaneous change than the organisation itself decided was reasonable.`,
    };
  }
  return { allowed: true };
};
