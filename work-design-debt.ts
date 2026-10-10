// Work Design Debt Ledger (Work Design Pulse PR4) - a structural problem an
// organisation has identified but not yet actually fixed, tracked
// separately from work_design_interventions (a single change someone
// tried). Pure logic only (no Firestore, no React) - server.ts owns
// reading/writing organisations/{orgId}/work_design_debt; this file only
// defines what a valid record looks like and enforces the two rules the
// spec calls out by name:
//
// - Mandatory owner: a debt item cannot move past "identified" without a
//   real person (an actual org member uid) responsible for it. Nobody owns
//   it by default - that silence is itself the signal something is stuck.
// - No coaching-tolerance resolution: a debt item can never be marked
//   resolved just because employees were coached to tolerate it. The only
//   way to resolve one is to point at a linked work_design_intervention
//   whose own recorded outcome was "useful" or "partly_useful" - i.e. the
//   organisation actually changed something, and it measurably helped.
// server.ts is responsible for checking that the linked intervention
// really exists and really has that outcome before calling
// canResolve/validateStatusTransition with the right inputs - this module
// just defines the rule, not the lookup.

export const WORK_DESIGN_DEBT_STATUSES = [
  'identified', 'owned', 'in_progress', 'monitoring', 'resolved', 'deferred',
] as const;
export type WorkDesignDebtStatus = (typeof WORK_DESIGN_DEBT_STATUSES)[number];

export const isWorkDesignDebtStatus = (value: unknown): value is WorkDesignDebtStatus =>
  typeof value === 'string' && (WORK_DESIGN_DEBT_STATUSES as readonly string[]).includes(value);

const MAX_SHORT = 300;
const MAX_LONG = 1000;

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

export interface CreateWorkDesignDebtInput {
  team: string;
  signalKey: string;
  description: string;
}

export const validateCreateWorkDesignDebtInput = (input: unknown): ValidationResult => {
  if (!input || typeof input !== 'object') {
    return { valid: false, error: 'A work design debt object is required.' };
  }
  const c = input as Record<string, unknown>;
  if (typeof c.team !== 'string' || c.team.trim().length === 0 || c.team.length > MAX_SHORT) {
    return { valid: false, error: `"team" is required (max ${MAX_SHORT} characters).` };
  }
  if (typeof c.signalKey !== 'string' || c.signalKey.trim().length === 0 || c.signalKey.length > MAX_SHORT) {
    return { valid: false, error: `"signalKey" is required (max ${MAX_SHORT} characters).` };
  }
  if (typeof c.description !== 'string' || c.description.trim().length === 0 || c.description.length > MAX_LONG) {
    return { valid: false, error: `"description" is required (max ${MAX_LONG} characters).` };
  }
  return { valid: true };
};

export interface AssignOwnerInput {
  ownerUid: string;
}

export const validateAssignOwnerInput = (input: unknown): ValidationResult => {
  if (!input || typeof input !== 'object') {
    return { valid: false, error: 'An owner object is required.' };
  }
  const c = input as Record<string, unknown>;
  if (typeof c.ownerUid !== 'string' || c.ownerUid.trim().length === 0) {
    return { valid: false, error: '"ownerUid" is required.' };
  }
  return { valid: true };
};

export interface StatusTransitionInput {
  status: WorkDesignDebtStatus;
  linkedInterventionId?: string | null;
}

export interface ExistingWorkDesignDebt {
  status: WorkDesignDebtStatus;
  ownerUid: string | null;
  team?: string;
  signalKey?: string;
}

// Whether a linked intervention's own recorded outcome is strong enough to
// resolve a debt item against - "useful" or "partly_useful" only. Anything
// else (no outcome yet, no clear difference, created another problem,
// stopped early) means the structural problem has not actually been fixed.
export const outcomeCanResolveDebt = (outcomeRating: string | null | undefined): boolean =>
  outcomeRating === 'useful' || outcomeRating === 'partly_useful';

export const validateStatusTransition = (
  existing: ExistingWorkDesignDebt,
  input: unknown,
  linkedInterventionOutcomeRating: string | null | undefined,
  // The linked intervention's own team/signalKey, when the caller looked
  // it up - optional so every existing caller/test that only cares about
  // the outcome-rating rule above is unaffected. When given, enforces
  // that the change being pointed at as "the fix" is actually the one
  // relevant to THIS debt item, not an unrelated successful intervention
  // for a different team or signal, which would satisfy the no-coaching-
  // tolerance rule in letter but not intent.
  linkedIntervention?: { team: string; signalKey: string } | null,
): ValidationResult => {
  if (!input || typeof input !== 'object') {
    return { valid: false, error: 'A status transition object is required.' };
  }
  const c = input as Record<string, unknown>;
  if (!isWorkDesignDebtStatus(c.status)) {
    return { valid: false, error: `"status" must be one of: ${WORK_DESIGN_DEBT_STATUSES.join(', ')}.` };
  }
  if (c.status !== 'identified' && !existing.ownerUid) {
    return { valid: false, error: 'This item needs a real owner before it can move past "identified".' };
  }
  if (c.status === 'resolved') {
    if (typeof c.linkedInterventionId !== 'string' || c.linkedInterventionId.trim().length === 0) {
      return { valid: false, error: 'A debt item can only be resolved by linking to a work-design intervention that actually changed something - coaching employees to tolerate it is never a resolution.' };
    }
    if (!outcomeCanResolveDebt(linkedInterventionOutcomeRating)) {
      return { valid: false, error: 'The linked intervention must have a recorded outcome of "useful" or "partly_useful" before this debt item can be marked resolved.' };
    }
    if (linkedIntervention && (linkedIntervention.team !== existing.team || linkedIntervention.signalKey !== existing.signalKey)) {
      return { valid: false, error: "The linked intervention must be for this debt item's own team and signal - resolving against an unrelated change is not a real fix." };
    }
  }
  return { valid: true };
};
