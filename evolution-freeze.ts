// Freeze Evolution (Evolution Engine, post-PR11) - a real, platform-wide
// kill-switch over every mutating Evolution Engine route, stored in
// app_config/evolution_freeze. Deliberately narrow in scope: it blocks
// WRITES (registry/Protected Core edits, change-proposal actions, cost
// budget changes, rollout-plan actions), never reads - an admin should
// always be able to see the current state of a frozen system, just not
// change it. The freeze toggle itself is exempt from its own check (see
// server.ts), or freezing would be permanent.
//
// This is deliberately a SEPARATE, smaller piece of work from granular
// evolution_* permissions (admin-roles.ts's own comment already flags
// that as real future work) - narrowing WHO can act and gating WHETHER
// anyone can act right now are two different questions, and conflating
// them risked neither being done carefully.

export interface EvolutionFreezeState {
  frozen: boolean;
  reason: string | null;
  frozenBy: string | null;
  frozenAt: string | null;
}

export const DEFAULT_EVOLUTION_FREEZE_STATE: EvolutionFreezeState = {
  frozen: false,
  reason: null,
  frozenBy: null,
  frozenAt: null,
};

// Pure interpretation of a possibly-missing/malformed stored doc - a
// missing doc (nothing has ever frozen the Evolution Engine) or a
// malformed `frozen` field both read as "not frozen", never as a throw.
export const isEvolutionFrozen = (doc: Partial<EvolutionFreezeState> | null | undefined): boolean =>
  doc?.frozen === true;

export interface FreezeToggleValidationResult {
  valid: boolean;
  error?: string;
}

const MAX_REASON = 2000;

export const validateFreezeToggleInput = (input: unknown): FreezeToggleValidationResult => {
  if (!input || typeof input !== 'object') {
    return { valid: false, error: 'A freeze toggle object is required.' };
  }
  const c = input as Record<string, unknown>;
  if (typeof c.frozen !== 'boolean') {
    return { valid: false, error: '"frozen" must be a boolean.' };
  }
  if (c.reason !== undefined && c.reason !== null && (typeof c.reason !== 'string' || c.reason.length > MAX_REASON)) {
    return { valid: false, error: `"reason" must be a string or null (max ${MAX_REASON} characters).` };
  }
  return { valid: true };
};
