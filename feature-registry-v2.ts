// Canonical, governed feature registry - Evolution Engine spec.
//
// Supersedes src/lib/feature-registry.ts (FEATURE_REGISTRY) as the source
// of truth. That file was a static, client-only object with a single
// `status: 'active'` field that conflated "registered" with "built" with
// "enabled" with "live" - exactly what this spec forbids. It was never
// read by anything except EvolutionEngine.tsx's own display, so nothing
// outside the admin screen depended on its shape.
//
// This file is pure/I-O-free (same pattern as desktop-deployment.ts and
// data-retention.ts) so the migration and validation logic is unit-tested
// without a Firestore emulator. server.ts owns persistence - the
// platform_feature_registry Firestore collection - and is the only real
// source of truth once seeded; this file supplies the schema, validation,
// and the one-time migration from the legacy static sources.

export const LIFECYCLE_STATES = [
  'draft',
  'shadow',
  'internal_beta',
  'private_beta',
  'public_beta',
  'live',
  'frozen',
  'deprecated',
  'removed',
] as const;
export type LifecycleState = (typeof LIFECYCLE_STATES)[number];

export const isLifecycleState = (value: unknown): value is LifecycleState =>
  typeof value === 'string' && (LIFECYCLE_STATES as readonly string[]).includes(value);

// Deliberately separate from lifecycle. Lifecycle describes maturity
// ("how far along is this"); enforcement describes whether the feature's
// behaviour is actually, verifiably gated/working end-to-end. A feature
// can be "live" (shipped, intended for real use) while its enforcement is
// "unknown" or "not_wired" - e.g. a feature flag that nothing in the
// codebase reads, so toggling it has zero real effect, regardless of
// whether the underlying feature itself still renders and works
// unconditionally.
export const ENFORCEMENT_STATES = [
  'fully_enforced',
  'partially_enforced',
  'frontend_only',
  'backend_only',
  'not_wired',
  'unknown',
] as const;
export type EnforcementState = (typeof ENFORCEMENT_STATES)[number];

export const isEnforcementState = (value: unknown): value is EnforcementState =>
  typeof value === 'string' && (ENFORCEMENT_STATES as readonly string[]).includes(value);

// The data-zone taxonomy the spec requires ("Formalise data zones").
// Reused across the registry, Protected Core (Evolution Engine PR2), and
// Connector Layer (PR3) - one vocabulary, not a separate copy per PR.
export const DATA_ZONES = [
  'private_recovery_vault',
  'operational_metadata',
  'admin_control_plane',
  'organisation_aggregates',
  'external_delivery_data',
  'billing_data',
  'public_config',
] as const;
export type DataZone = (typeof DATA_ZONES)[number];

export const isDataZone = (value: unknown): value is DataZone =>
  typeof value === 'string' && (DATA_ZONES as readonly string[]).includes(value);

export interface FeatureRegistryEntry {
  featureId: string;
  displayName: string;
  description: string;
  productOwner: string | null;
  technicalOwner: string | null;
  lifecycleState: LifecycleState;
  enforcementState: EnforcementState;
  featureFlag: string | null;
  entitlementRequirement: string | null;
  dataZones: DataZone[];
  dependencies: string[];
  downstreamConsumers: string[];
  requiredConnectors: string[];
  requiredPermissions: string[];
  minAppVersion: string | null;
  fallbackMode: string | null;
  rollbackMethod: string | null;
  createdAt: string;
  lastChangedAt: string;
  expectedFlagRetirement: string | null;
  // Honest-gap tracking: every place this migration couldn't verify a
  // real value gets a plain-language note here instead of an invented
  // one, per the spec's "do not invent values" rule.
  notes: string | null;
}

export interface FeatureRegistryValidationResult {
  valid: boolean;
  error?: string;
}

const FEATURE_ID_PATTERN = /^[a-z][a-z0-9_]{1,99}$/;
const MAX_SHORT_STRING = 200;
const MAX_LONG_STRING = 2000;
const MAX_ARRAY_ITEMS = 100;

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.length <= MAX_ARRAY_ITEMS && value.every((v) => typeof v === 'string' && v.length <= MAX_SHORT_STRING);

// Validates a create/update payload for one registry entry (the shape a
// POST /api/admin/evolution/registry body must satisfy). Deliberately
// conservative - an admin editing governance metadata for a real feature
// is a meaningfully risky action (this data drives Overview health counts
// and, eventually, rollout/approval gating), so malformed input is
// rejected outright rather than coerced.
export const validateFeatureRegistryUpsert = (input: unknown): FeatureRegistryValidationResult => {
  if (!input || typeof input !== 'object') {
    return { valid: false, error: 'A feature registry entry object is required.' };
  }
  const c = input as Record<string, unknown>;

  if (typeof c.featureId !== 'string' || !FEATURE_ID_PATTERN.test(c.featureId)) {
    return { valid: false, error: '"featureId" must be a lowercase_snake_case string starting with a letter.' };
  }
  if (typeof c.displayName !== 'string' || c.displayName.trim().length === 0 || c.displayName.length > MAX_SHORT_STRING) {
    return { valid: false, error: `"displayName" is required (max ${MAX_SHORT_STRING} characters).` };
  }
  if (typeof c.description !== 'string' || c.description.length > MAX_LONG_STRING) {
    return { valid: false, error: `"description" must be a string (max ${MAX_LONG_STRING} characters).` };
  }
  if (!isLifecycleState(c.lifecycleState)) {
    return { valid: false, error: `"lifecycleState" must be one of: ${LIFECYCLE_STATES.join(', ')}.` };
  }
  if (!isEnforcementState(c.enforcementState)) {
    return { valid: false, error: `"enforcementState" must be one of: ${ENFORCEMENT_STATES.join(', ')}.` };
  }
  for (const nullableShort of ['productOwner', 'technicalOwner', 'featureFlag', 'entitlementRequirement', 'minAppVersion', 'fallbackMode', 'rollbackMethod', 'expectedFlagRetirement'] as const) {
    const v = c[nullableShort];
    if (v !== null && v !== undefined && (typeof v !== 'string' || v.length > MAX_SHORT_STRING)) {
      return { valid: false, error: `"${nullableShort}" must be a string or null.` };
    }
  }
  if (c.notes !== null && c.notes !== undefined && (typeof c.notes !== 'string' || c.notes.length > MAX_LONG_STRING)) {
    return { valid: false, error: '"notes" must be a string or null.' };
  }
  if (c.dataZones !== undefined && (!Array.isArray(c.dataZones) || !(c.dataZones as unknown[]).every(isDataZone))) {
    return { valid: false, error: `"dataZones" must be an array drawn from: ${DATA_ZONES.join(', ')}.` };
  }
  for (const arrField of ['dependencies', 'downstreamConsumers', 'requiredConnectors', 'requiredPermissions'] as const) {
    if (c[arrField] !== undefined && !isStringArray(c[arrField])) {
      return { valid: false, error: `"${arrField}" must be an array of strings.` };
    }
  }
  return { valid: true };
};

// A feature that is live-ish (shipped, user-facing) but not confirmed
// fully enforced is exactly the governance warning the spec calls out -
// "Not Enforced should become an actionable governance warning." Kept
// here as a pure predicate so the Overview dashboard (Evolution Engine
// PR5) and any future check share one definition rather than each
// re-deriving it.
export const isGovernanceWarning = (
  entry: Pick<FeatureRegistryEntry, 'lifecycleState' | 'enforcementState'>
): boolean =>
  (entry.lifecycleState === 'live' || entry.lifecycleState === 'public_beta' || entry.lifecycleState === 'private_beta') &&
  entry.enforcementState !== 'fully_enforced';

// ---- One-time migration from the legacy static sources ------------------
//
// Legacy shapes, duplicated here (not imported) because this file must
// stay dependency-free so it can be unit-tested in isolation and reused
// from server.ts without pulling in client-only modules. The real legacy
// data is passed in by the caller (src/lib/feature-registry.ts's
// FEATURE_REGISTRY and src/lib/feature-flags.ts's flag id list) - this
// function contains no hardcoded feature data of its own, so it can never
// silently drift from the actual legacy source files.
export interface LegacyFeatureDefinition {
  id: string;
  name: string;
  purpose: string;
  status: 'planned' | 'active' | 'disabled' | 'archived';
  riskLevel: 'low' | 'medium' | 'high';
  allowedConnections: string[];
  featureFlagName: string;
  data_zone?: string;
}

const LEGACY_STATUS_TO_LIFECYCLE: Record<LegacyFeatureDefinition['status'], LifecycleState> = {
  planned: 'draft',
  active: 'live',
  disabled: 'frozen',
  archived: 'deprecated',
};

// The legacy data_zone strings (feature-registry.ts) use a different,
// narrower vocabulary than this file's DATA_ZONES. Mapped where there's a
// genuine conceptual match; anything without a confident match is simply
// omitted rather than guessed at.
const LEGACY_DATA_ZONE_MAP: Record<string, DataZone> = {
  'Private Recovery Vault': 'private_recovery_vault',
  'Anonymous Team Insights': 'organisation_aggregates',
};

const nowIso = () => new Date().toISOString();

// Builds one entry from a legacy FEATURE_REGISTRY definition.
// `wiredFlagIds` is the real, grep-verified set of flag ids that are
// actually read somewhere outside the registry/EvolutionEngine display -
// the one thing about enforcement this migration can assert with
// confidence. Everything else about whether the underlying feature is
// genuinely live and working is explicitly left as 'unknown' with a note,
// rather than inferring it from the legacy status field (which itself
// predates - and is exactly the kind of state/enforcement conflation -
// this schema exists to fix).
export const migrateLegacyFeatureEntry = (
  legacy: LegacyFeatureDefinition,
  wiredFlagIds: ReadonlySet<string>
): FeatureRegistryEntry => {
  const isWired = wiredFlagIds.has(legacy.featureFlagName);
  const dataZone = legacy.data_zone ? LEGACY_DATA_ZONE_MAP[legacy.data_zone] : undefined;
  return {
    featureId: legacy.id,
    displayName: legacy.name,
    description: legacy.purpose,
    productOwner: null,
    technicalOwner: null,
    lifecycleState: LEGACY_STATUS_TO_LIFECYCLE[legacy.status],
    enforcementState: isWired ? 'fully_enforced' : 'unknown',
    featureFlag: legacy.featureFlagName || null,
    entitlementRequirement: null,
    dataZones: dataZone ? [dataZone] : [],
    dependencies: legacy.allowedConnections || [],
    downstreamConsumers: [],
    requiredConnectors: [],
    requiredPermissions: [],
    minAppVersion: null,
    fallbackMode: null,
    rollbackMethod: null,
    createdAt: nowIso(),
    lastChangedAt: nowIso(),
    expectedFlagRetirement: null,
    notes: isWired
      ? `Migrated from the legacy feature-registry.ts entry. Flag "${legacy.featureFlagName}" is confirmed read outside the registry display, so enforcement reflects a real, verified gate.`
      : `Migrated from the legacy feature-registry.ts entry. Flag "${legacy.featureFlagName}" is not read anywhere outside the registry/Evolution Engine display - this means the FLAG is dead, not necessarily that the feature itself is non-functional (many features render unconditionally regardless of this flag). Enforcement is "unknown" rather than invented; a feature-by-feature verification pass is tracked separately.`,
  };
};

// Builds one entry for a flag that exists in feature-flags.ts but has no
// corresponding legacy FEATURE_REGISTRY entry at all - an "orphan flag."
// There is no description to carry forward (none ever existed), so this
// is deliberately the most conservative category available: 'draft'
// lifecycle (nothing confirms this ever shipped as a real feature) and
// 'unknown' or 'not_wired' enforcement depending on whether the flag is
// actually read anywhere.
export const migrateOrphanFlagEntry = (flagId: string, wiredFlagIds: ReadonlySet<string>): FeatureRegistryEntry => {
  const isWired = wiredFlagIds.has(flagId);
  return {
    featureId: flagId.replace(/^enable_/, ''),
    displayName: flagId
      .replace(/^enable_/, '')
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase()),
    description: 'No description or registry entry existed prior to this migration - this flag was found in feature-flags.ts with no further context.',
    productOwner: null,
    technicalOwner: null,
    lifecycleState: 'draft',
    enforcementState: isWired ? 'fully_enforced' : 'not_wired',
    featureFlag: flagId,
    entitlementRequirement: null,
    dataZones: [],
    dependencies: [],
    downstreamConsumers: [],
    requiredConnectors: [],
    requiredPermissions: [],
    minAppVersion: null,
    fallbackMode: null,
    rollbackMethod: null,
    createdAt: nowIso(),
    lastChangedAt: nowIso(),
    expectedFlagRetirement: null,
    notes: isWired
      ? `Orphan flag (no legacy registry entry) but confirmed read outside the registry display - genuinely wired, just never documented.`
      : `Orphan flag debt candidate: no legacy registry entry, and not read anywhere outside the registry display. Likely dead; flagged here rather than silently dropped so Flag Debt (a later Evolution Engine PR) can surface and retire it properly.`,
  };
};

// Full migration entry point. `legacyRegistry` and `allFlagIds` are the
// real exported values from feature-registry.ts/feature-flags.ts, passed
// in by the caller so this stays dependency-free; `wiredFlagIds` is a
// grep-verified allowlist the caller maintains (see server.ts's seed
// route for the current real list and its citation comment).
export const buildInitialRegistry = (
  legacyRegistry: Record<string, LegacyFeatureDefinition>,
  allFlagIds: readonly string[],
  wiredFlagIds: readonly string[]
): FeatureRegistryEntry[] => {
  const wired = new Set(wiredFlagIds);
  const entries = Object.values(legacyRegistry).map((legacy) => migrateLegacyFeatureEntry(legacy, wired));
  const coveredFlags = new Set(Object.values(legacyRegistry).map((f) => f.featureFlagName));
  const orphanEntries = allFlagIds
    .filter((flagId) => !coveredFlags.has(flagId))
    .map((flagId) => migrateOrphanFlagEntry(flagId, wired));
  return [...entries, ...orphanEntries];
};
