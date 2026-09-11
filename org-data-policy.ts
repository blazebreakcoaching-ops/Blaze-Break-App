// Pure logic for an organisation's Enterprise data-use policy - kept I/O-free
// and unit-tested, same pattern as org-rbac.ts. server.ts is responsible for
// reading/writing the actual organisations/{orgId}.dataPolicy field; this
// file only defines what the policy looks like, its safe default, and how
// to validate a proposed change to it.
//
// The default for every organisation, with no action required from anyone,
// is that customer content is never used for model training. This is the
// single source of truth every future feature that touches AI/provider
// calls should consult before treating an org's data as available for
// anything beyond serving that org's own product functionality. See
// docs/DATA_POLICY.md for what that guarantee actually covers in code
// today versus what depends on the AI providers' own terms.

export interface OrgDataPolicy {
  allowModelTraining: boolean;
  allowProductAnalytics: boolean;
  allowContentRetentionForDebugging: boolean;
  retentionPeriodDays: number;
}

// The safe default - every field defaults to the most privacy-protective
// setting. An org that never touches this at all gets exactly this policy.
export const DEFAULT_DATA_POLICY: OrgDataPolicy = {
  allowModelTraining: false,
  allowProductAnalytics: false,
  allowContentRetentionForDebugging: false,
  retentionPeriodDays: 30,
};

export const MIN_RETENTION_DAYS = 1;
export const MAX_RETENTION_DAYS = 3650; // 10 years - a generous ceiling, not an endorsement of holding data that long.

// Merges a possibly-partial stored policy (an org doc that predates a field
// being added, or was never touched at all) with the safe default - so a
// missing field is never silently treated as "allowed" just because it
// isn't present. This is the ONLY function anything in this codebase should
// call to find out what an org's actual data policy is.
export const getEffectiveDataPolicy = (stored: Partial<OrgDataPolicy> | null | undefined): OrgDataPolicy => ({
  allowModelTraining: stored?.allowModelTraining === true,
  allowProductAnalytics: stored?.allowProductAnalytics === true,
  allowContentRetentionForDebugging: stored?.allowContentRetentionForDebugging === true,
  retentionPeriodDays:
    typeof stored?.retentionPeriodDays === 'number' &&
    Number.isFinite(stored.retentionPeriodDays) &&
    stored.retentionPeriodDays >= MIN_RETENTION_DAYS &&
    stored.retentionPeriodDays <= MAX_RETENTION_DAYS
      ? Math.round(stored.retentionPeriodDays)
      : DEFAULT_DATA_POLICY.retentionPeriodDays,
});

export interface DataPolicyValidationResult {
  valid: boolean;
  error?: string;
}

// Pure validation for a proposed policy write. Every field is required and
// strictly typed - a partial update isn't accepted here, since "allow
// training but leave retention unspecified" is exactly the kind of
// ambiguity this policy exists to eliminate. The server route reads the
// current effective policy, merges in the caller's intended change, and
// validates the resulting whole object.
export const validateDataPolicyUpdate = (input: unknown): DataPolicyValidationResult => {
  if (!input || typeof input !== 'object') {
    return { valid: false, error: 'A data policy object is required.' };
  }
  const candidate = input as Record<string, unknown>;
  for (const key of ['allowModelTraining', 'allowProductAnalytics', 'allowContentRetentionForDebugging'] as const) {
    if (typeof candidate[key] !== 'boolean') {
      return { valid: false, error: `"${key}" must be true or false.` };
    }
  }
  const retention = candidate.retentionPeriodDays;
  if (
    typeof retention !== 'number' ||
    !Number.isFinite(retention) ||
    !Number.isInteger(retention) ||
    retention < MIN_RETENTION_DAYS ||
    retention > MAX_RETENTION_DAYS
  ) {
    return { valid: false, error: `"retentionPeriodDays" must be a whole number between ${MIN_RETENTION_DAYS} and ${MAX_RETENTION_DAYS}.` };
  }
  return { valid: true };
};
