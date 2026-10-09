// Protected Core - Evolution Engine PR2.
//
// Converts the old "Core Protected List" (EvolutionEngine.tsx, removed in
// PR1) - six bare strings in JSX with no enforcement mechanism behind them
// at all - into real governance. Each invariant here names the actual
// rule, cites where it is genuinely enforced today (file:line evidence,
// never aspirational), says whether that enforcement is machine-tested,
// and what approval changing it requires. Pure/I-O-free, same pattern as
// feature-registry-v2.ts - server.ts persists these to
// platform_protected_core; this file defines the schema and the real,
// evidence-backed seed data.
//
// A Protected Core entry is deliberately NOT the same thing as a
// FeatureRegistryEntry. A feature can be deprecated, rebuilt, or removed;
// a Protected Core invariant describes a boundary that must survive any
// of that happening to the features that currently implement it - e.g.
// "organisation staff cannot read a member's private recovery content"
// must remain true even if every feature touching it is rewritten.

export const APPROVAL_TIERS = ['owner_only', 'platform_admin_review', 'technical_review', 'none'] as const;
export type ApprovalTier = (typeof APPROVAL_TIERS)[number];

export const isApprovalTier = (value: unknown): value is ApprovalTier =>
  typeof value === 'string' && (APPROVAL_TIERS as readonly string[]).includes(value);

export const TEST_STATUSES = ['machine_tested', 'manual_only', 'untested'] as const;
export type TestStatus = (typeof TEST_STATUSES)[number];

export const isTestStatus = (value: unknown): value is TestStatus =>
  typeof value === 'string' && (TEST_STATUSES as readonly string[]).includes(value);

export interface ProtectedCoreInvariant {
  invariantId: string;
  title: string;
  // The actual rule, stated as a plain-language assertion that is either
  // true or false about the running system right now - not a goal, not a
  // description of a feature.
  rule: string;
  scope: string;
  owner: string | null;
  requiredApproval: ApprovalTier;
  testStatus: TestStatus;
  // Real file:line (or test-file) citation(s) for where this is actually
  // enforced/verified today. Never a description of intended enforcement.
  evidence: string;
  allowedChangeProcess: string;
  lastReviewedAt: string | null;
  notes: string | null;
}

const MAX_SHORT = 200;
const MAX_LONG = 2000;

export interface ProtectedCoreValidationResult {
  valid: boolean;
  error?: string;
}

export const validateProtectedCoreUpsert = (input: unknown): ProtectedCoreValidationResult => {
  if (!input || typeof input !== 'object') {
    return { valid: false, error: 'A Protected Core invariant object is required.' };
  }
  const c = input as Record<string, unknown>;
  if (typeof c.invariantId !== 'string' || !/^[a-z][a-z0-9_]{1,99}$/.test(c.invariantId)) {
    return { valid: false, error: '"invariantId" must be a lowercase_snake_case string starting with a letter.' };
  }
  if (typeof c.title !== 'string' || c.title.trim().length === 0 || c.title.length > MAX_SHORT) {
    return { valid: false, error: `"title" is required (max ${MAX_SHORT} characters).` };
  }
  if (typeof c.rule !== 'string' || c.rule.trim().length === 0 || c.rule.length > MAX_LONG) {
    return { valid: false, error: `"rule" is required (max ${MAX_LONG} characters).` };
  }
  if (typeof c.scope !== 'string' || c.scope.length > MAX_SHORT) {
    return { valid: false, error: `"scope" must be a string (max ${MAX_SHORT} characters).` };
  }
  if (!isApprovalTier(c.requiredApproval)) {
    return { valid: false, error: `"requiredApproval" must be one of: ${APPROVAL_TIERS.join(', ')}.` };
  }
  if (!isTestStatus(c.testStatus)) {
    return { valid: false, error: `"testStatus" must be one of: ${TEST_STATUSES.join(', ')}.` };
  }
  if (typeof c.evidence !== 'string' || c.evidence.trim().length === 0 || c.evidence.length > MAX_LONG) {
    return { valid: false, error: `"evidence" is required (max ${MAX_LONG} characters) - cite the real enforcing code or test, never leave this describing an aspiration.` };
  }
  if (typeof c.allowedChangeProcess !== 'string' || c.allowedChangeProcess.length > MAX_LONG) {
    return { valid: false, error: `"allowedChangeProcess" must be a string.` };
  }
  for (const nullableShort of ['owner', 'lastReviewedAt'] as const) {
    const v = c[nullableShort];
    if (v !== null && v !== undefined && (typeof v !== 'string' || v.length > MAX_SHORT)) {
      return { valid: false, error: `"${nullableShort}" must be a string or null.` };
    }
  }
  if (c.notes !== null && c.notes !== undefined && (typeof c.notes !== 'string' || c.notes.length > MAX_LONG)) {
    return { valid: false, error: '"notes" must be a string or null.' };
  }
  return { valid: true };
};

// The real, evidence-backed seed set. Deliberately not exhaustive against
// every candidate area the spec lists (App Navigation, Nova Identity
// Rules, Context Brain Governance, etc.) - each of those gets added once
// it has the same kind of real, cited, ideally machine-tested enforcement
// behind it, in a later PR, rather than padding this list with entries
// whose "evidence" would just be an aspiration. These six are the ones
// with genuine, independently-verified enforcement today.
export const buildSeedInvariants = (nowIso: string): ProtectedCoreInvariant[] => [
  {
    invariantId: 'organisation_privacy_isolation',
    title: 'Organisation Privacy Isolation',
    rule: 'Organisation staff (managers, org admins) cannot read another member\'s private individual recovery content - only basic account/role fields (uid, email, displayName, isAdmin, team) ever reach an org-facing route.',
    scope: 'Organisation / B2B surfaces',
    owner: null,
    requiredApproval: 'owner_only',
    testStatus: 'machine_tested',
    evidence: 'firestore.rules: match /users/{uid} { allow read: if isOwner(uid); } - no org-staff carve-out exists in the rule itself. server.ts GET /api/org/:orgId/members returns only {uid,email,displayName,isAdmin,team,managesTeams} per member - verified by protected-core-invariants.test.ts.',
    allowedChangeProcess: 'Any change to what an org-facing route returns about a member requires Platform Owner review and an update to the machine test asserting the returned field shape.',
    lastReviewedAt: nowIso,
    notes: null,
  },
  {
    invariantId: 'guardian_alert_explicit_trigger_only',
    title: 'Guardian Alert Requires an Explicit User Action',
    rule: 'Nova (or any automated process) cannot independently decide to send a Guardian Alert. The only code path that ever sends a guardian_alert-category message is POST /api/guardian/alert, requiring authentication, with the uid taken only from the verified token and triggerSource hardcoded to "manual_button".',
    scope: 'Guardian Protocol / external messaging',
    owner: null,
    requiredApproval: 'owner_only',
    testStatus: 'machine_tested',
    evidence: "server.ts:1071 (POST /api/guardian/alert, authenticateFirebaseUser) is the sole call site passing the 'guardian_alert' category to sendTwilioMessage (server.ts:1176); uid sourced from requireAuth(req).uid only (server.ts:1075). Verified as a single-call-site structural check by protected-core-invariants.test.ts.",
    allowedChangeProcess: "Adding any second call site that sends a 'guardian_alert'-category message requires Platform Owner review and an explicit, documented exception to this invariant - not a silent addition.",
    lastReviewedAt: nowIso,
    notes: null,
  },
  {
    invariantId: 'admin_role_grant_requires_platform_owner',
    title: 'Only a Platform Owner Can Grant or Change an Admin Role',
    rule: 'No platform-staff role below Platform Owner can create a new admin account, change an existing admin\'s role, or remove the last remaining Platform Owner.',
    scope: 'Admin Role Hierarchy',
    owner: null,
    requiredApproval: 'owner_only',
    testStatus: 'machine_tested',
    evidence: 'server.ts: requirePlatformOwner (around line 3607) gates POST /api/admin/admin-users and POST /api/admin/admin-users/:uid/role; assertNotLastPlatformOwner (around line 3616) blocks demoting/removing the last owner. Covered by admin-users.route.test.ts.',
    allowedChangeProcess: 'Any change to who may grant admin roles requires Platform Owner approval and must keep or strengthen the existing admin-users.route.test.ts coverage.',
    lastReviewedAt: nowIso,
    notes: null,
  },
  {
    invariantId: 'admin_audit_log_write_integrity',
    title: 'Admin Audit Log Is Server-Append-Only',
    rule: 'No client, and no API route, can write directly to the admin audit log - every entry is created exclusively by the server-side logAdminAction() helper.',
    scope: 'Audit Integrity',
    owner: null,
    requiredApproval: 'owner_only',
    testStatus: 'machine_tested',
    evidence: 'firestore.rules: match /admin_audit_logs/{logId} { allow write: if false; }. server.ts has exactly one write call site: db.collection("admin_audit_logs").add(entry) inside logAdminAction(). Verified structurally by protected-core-invariants.test.ts.',
    allowedChangeProcess: 'Any new direct write path to admin_audit_logs requires Platform Owner review - the audit trail\'s value depends on it being genuinely append-only and server-controlled.',
    lastReviewedAt: nowIso,
    notes: null,
  },
  {
    invariantId: 'entitlement_independent_of_feature_flags',
    title: "A Paid Entitlement Cannot Be Removed by an Unrelated Feature Flag Change",
    rule: "entitlements.ts's effective-plan computation has zero dependency on feature-flags.ts, feature-registry.ts, or feature-registry-v2.ts - toggling any feature flag can never change what plan a user is effectively on.",
    scope: 'Billing / Entitlement Rules',
    owner: null,
    requiredApproval: 'owner_only',
    testStatus: 'machine_tested',
    evidence: 'entitlements.ts has zero import statements (confirmed by direct inspection) - it is a fully self-contained module. Verified structurally by protected-core-invariants.test.ts (asserts no import of any feature-flag/registry module).',
    allowedChangeProcess: 'Introducing any dependency from entitlements.ts on feature-flag/registry state requires Platform Owner review - this is exactly the coupling this invariant exists to prevent.',
    lastReviewedAt: nowIso,
    notes: null,
  },
  {
    invariantId: 'private_data_default_deny',
    title: 'Firestore Default-Denies Every Unlisted Collection',
    rule: 'Any Firestore path not explicitly granted a rule is fully denied to every client, for both read and write - the backstop behind every other privacy rule in this file.',
    scope: 'Privacy Boundaries (platform-wide)',
    owner: null,
    requiredApproval: 'owner_only',
    testStatus: 'machine_tested',
    evidence: 'firestore.rules: match /{document=**} { allow read, write: if false; } declared before any specific collection rule. Verified to still be present, and still first, by protected-core-invariants.test.ts.',
    allowedChangeProcess: 'This wildcard default-deny block must never be removed or weakened. Any PR touching firestore.rules\' top section requires Platform Owner review.',
    lastReviewedAt: nowIso,
    notes: null,
  },
  {
    invariantId: 'organisation_aggregate_cohort_threshold',
    title: 'Organisation Aggregate Routes Require Anonymous Aggregation Engine Approval',
    rule: 'An organisation-facing aggregate route must withhold its numeric output and return a locked/insufficient-cohort response whenever the contributing cohort is below the organisation\'s configured privacy threshold - checked via the shared Anonymous Aggregation Engine (anonymous-aggregation-engine.ts), not an ad hoc inline comparison a future edit could accidentally loosen or skip.',
    scope: 'Organisation / B2B surfaces (Work Design Intelligence)',
    owner: null,
    requiredApproval: 'owner_only',
    testStatus: 'machine_tested',
    evidence: 'anonymous-aggregation-engine.ts exports checkCohortSufficiency/buildLockedAggregateResponse; server.ts\'s GET /api/org/:orgId/dashboard (around the "const sufficiency = checkCohortSufficiency(...)" call) is migrated to call it rather than its own inline threshold comparison. Verified both structurally (server.ts calls the shared function at that route) and behaviourally (a cohort below threshold receives {locked:true}, never a numeric figure) by protected-core-invariants.test.ts.',
    allowedChangeProcess: 'Any new organisation aggregate route must call checkCohortSufficiency (or a function built on top of it) rather than re-implementing its own threshold comparison; removing or bypassing that call on an existing route requires Platform Owner review. Migrating every remaining pre-existing aggregate route to the shared function is tracked as follow-up work, not yet complete.',
    lastReviewedAt: nowIso,
    notes: 'The companion filter-based re-identification guard (checkFilteredCohort, same module) has no live call site yet - no org-facing view currently applies multiple narrowing filters to an aggregate - so it is deliberately not covered by this invariant until it is genuinely wired into one.',
  },
];
