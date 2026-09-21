// Pure logic for Blaze Break's unified, server-authoritative B2C
// multi-tier entitlement model. Mirrors billing-adapter.ts's
// adapter-boundary pattern deliberately: Stripe/Apple/Google are
// pluggable EntitlementProvider implementations, and none is wired up
// yet (no Stripe/Apple/Google SDK in this codebase's package.json, no
// live credentials configured anywhere). NullEntitlementProvider is an
// honest stand-in - it never pretends a purchase was verified. The two
// billingSources that ARE real today are 'admin' (a human granting
// access directly, e.g. beta testers/support cases) and 'organisation'
// (an org's sponsored seat, reconciled from the existing Enterprise
// billing/org-rbac system in server.ts). See
// docs/FREE_PREMIUM_ENTITLEMENTS.md for the full tier matrix and what
// wiring a real Stripe/Apple/Google integration on top of this model
// requires.
//
// This is the SECOND consumer plan model this file has held: it
// originally shipped as a plain Free/Premium binary at a single £19.99
// price point. That model is fully retired for NEW customers as of this
// revision - the widened FREE/CORE/PERFORMANCE/EXECUTIVE tier set below
// is the only thing offered going forward. Any account whose stored
// record predates this change (`plan: 'premium'`) is transparently
// coerced to `legacy_premium` by `getEffectiveEntitlement` - see
// "Legacy premium" below and docs/LEGACY_CUSTOMER_MIGRATION.md for the
// full reasoning and confirmed facts about who that actually affects.
//
// The single question every other part of the app should ask is
// `hasPaidEntitlement(record)` / `getCapability(plan, capability)` -
// nothing should read a raw payment provider flag or a client-editable
// Firestore field directly (that was the actual bug this module
// originally replaced: the UI once derived tier from
// `user_stats/core.profile.subscription`, a field the client could
// write directly via the Firestore SDK, and no server route checked
// tier at all). The record this module operates on must always be read
// from `users/{uid}/entitlements/status`, which firestore.rules makes
// `allow write: if false` - backend/Admin-SDK only.
//
// billing-adapter.ts is a SEPARATE, unrelated system for B2B/Enterprise
// organisations (plans: free/starter/business/enterprise, org seats).
// Do not confuse the two, and do not extend this file to cover org
// billing - the B2B "enterprise" plan name and the B2C "Executive" tier
// name are coincidentally close but describe entirely different
// products for entirely different customers.
//
// This module is the source of truth for USAGE-QUOTA gating (Nova
// message/voice limits, exports, etc.) - it is NOT the gate for tab/
// feature *visibility* in the sidebar, which is a separate, older system
// (`SubscriptionTier` in src/types.ts, `hasSubscriptionEntitlement` in
// src/lib/entitlement.ts). The two intentionally govern different things
// (see docs/FREE_PREMIUM_ENTITLEMENTS.md) - don't assume granting a plan
// here also unlocks something gated by the other system, or vice versa.

// ---- Plans ---------------------------------------------------------------
// New-customer tiers, in ascending order. `legacy_premium` is
// deliberately not offered to new customers (see below) - it exists
// purely as the landing spot for any account whose stored plan predates
// this tier model. There is no separate `organisation_sponsored` plan
// value: an org-sponsored seat is expressed as `billingSource:
// 'organisation'` combined with whichever real plan the org sponsors
// (today always resolved to 'performance' by the one manual-grant path
// that exists - see server.ts), keeping "which plan" and "who's paying
// for it" as two orthogonal questions, which is also how 'admin' grants
// already worked before this revision. Executive+ is explicitly NOT
// implemented per the product brief - PLAN_TIER_ORDER below is the one
// place a future tier would be inserted.
export const ENTITLEMENT_PLANS = ['free', 'core', 'performance', 'executive', 'legacy_premium'] as const;
export type EntitlementPlan = (typeof ENTITLEMENT_PLANS)[number];
export const isEntitlementPlan = (value: unknown): value is EntitlementPlan =>
  typeof value === 'string' && (ENTITLEMENT_PLANS as readonly string[]).includes(value);

// Plans a NEW customer can actually purchase/be granted going forward.
// `legacy_premium` is deliberately excluded - see the module docstring.
export const PURCHASABLE_PLANS: readonly EntitlementPlan[] = ['free', 'core', 'performance', 'executive'];

// Ascending tier order, used for upgrade/downgrade comparisons
// (`isUpgrade`/`isDowngrade` below) and for "does this capability need
// at least tier X" checks. `legacy_premium` is deliberately positioned
// alongside `performance` (see "Legacy premium" section below for the
// reasoning) rather than at the end - a legacy account upgrading to
// `executive` is a real upgrade; "downgrading" a legacy account onto
// `core` is a real downgrade, exactly matching how a real `performance`
// customer would experience the same moves.
export const PLAN_TIER_ORDER: Record<EntitlementPlan, number> = {
  free: 0,
  core: 1,
  performance: 2,
  legacy_premium: 2,
  executive: 3,
};

export const isUpgrade = (from: EntitlementPlan, to: EntitlementPlan): boolean => PLAN_TIER_ORDER[to] > PLAN_TIER_ORDER[from];
export const isDowngrade = (from: EntitlementPlan, to: EntitlementPlan): boolean => PLAN_TIER_ORDER[to] < PLAN_TIER_ORDER[from];

export const ENTITLEMENT_STATUSES = ['active', 'trial', 'grace', 'past_due', 'cancelled', 'expired'] as const;
export type EntitlementStatus = (typeof ENTITLEMENT_STATUSES)[number];
export const isEntitlementStatus = (value: unknown): value is EntitlementStatus =>
  typeof value === 'string' && (ENTITLEMENT_STATUSES as readonly string[]).includes(value);

// 'none' is represented as `billingSource: null`, not as a string enum
// member - keeps "no billing source" a single, unambiguous falsy value
// rather than two ways to express the same thing.
export const ENTITLEMENT_BILLING_SOURCES = ['stripe', 'apple', 'google', 'organisation', 'admin'] as const;
export type EntitlementBillingSource = (typeof ENTITLEMENT_BILLING_SOURCES)[number];
export const isEntitlementBillingSource = (value: unknown): value is EntitlementBillingSource =>
  typeof value === 'string' && (ENTITLEMENT_BILLING_SOURCES as readonly string[]).includes(value);

export interface EntitlementRecord {
  plan: EntitlementPlan;
  status: EntitlementStatus;
  billingSource: EntitlementBillingSource | null;
  entitlementStart: string | null; // ISO 8601
  entitlementEnd: string | null; // ISO 8601 - null means no fixed end (e.g. an active admin grant)
  renewalDate: string | null; // ISO 8601
  // True once the customer has told the provider (or an admin, on their
  // behalf) to stop renewing - access continues normally through
  // entitlementEnd, this is only ever a forward-looking flag. Distinct
  // from status: 'cancelled', which (per LIVE_STATUSES below) means
  // access has actually already ended.
  cancelAtPeriodEnd: boolean;
  // Provider linkage, kept for reconciliation/support lookups. Never a
  // secret in itself (these are provider-side reference IDs, not
  // tokens/keys), but still not surfaced to the client beyond what
  // GET /api/entitlements/me deliberately chooses to expose - see
  // "What the client is allowed to see" below.
  providerCustomerId: string | null;
  providerSubscriptionId: string | null;
  providerProductId: string | null;
  providerPriceId: string | null;
  lastVerifiedAt: string | null; // ISO 8601 - when this record was last reconciled against its provider
}

// A brand-new account, or any account whose entitlement doc is missing or
// malformed, is Free/active - the only state that requires no external
// source of truth.
export const DEFAULT_ENTITLEMENT: EntitlementRecord = {
  plan: 'free',
  status: 'active',
  billingSource: null,
  entitlementStart: null,
  entitlementEnd: null,
  renewalDate: null,
  cancelAtPeriodEnd: false,
  providerCustomerId: null,
  providerSubscriptionId: null,
  providerProductId: null,
  providerPriceId: null,
  lastVerifiedAt: null,
};

// Coerces a raw (possibly absent, possibly malformed - e.g. hand-edited,
// from a future schema version, or written under the OLD single-Premium
// model) stored record into a fully valid one. Every field falls back
// independently, so a partially-corrupt doc still degrades to safe
// defaults rather than throwing.
//
// The one non-obvious rule here: a stored `plan: 'premium'` (the entire
// vocabulary before this revision) is coerced to `'legacy_premium'`,
// not rejected as invalid and dropped to Free. This is the actual
// migration mechanism for every pre-existing Premium account - no
// batch/one-off migration script touches stored data at all, the read
// path itself reinterprets the old value correctly forever. See
// docs/LEGACY_CUSTOMER_MIGRATION.md.
export const getEffectiveEntitlement = (stored: (Omit<Partial<EntitlementRecord>, 'plan'> & { plan?: unknown }) | null | undefined): EntitlementRecord => {
  const rawPlan = stored?.plan;
  const plan: EntitlementPlan = rawPlan === 'premium' ? 'legacy_premium' : (isEntitlementPlan(rawPlan) ? rawPlan : DEFAULT_ENTITLEMENT.plan);
  return {
    plan,
    status: isEntitlementStatus(stored?.status) ? stored!.status : DEFAULT_ENTITLEMENT.status,
    billingSource: isEntitlementBillingSource(stored?.billingSource) ? stored!.billingSource : null,
    entitlementStart: typeof stored?.entitlementStart === 'string' ? stored.entitlementStart : null,
    entitlementEnd: typeof stored?.entitlementEnd === 'string' ? stored.entitlementEnd : null,
    renewalDate: typeof stored?.renewalDate === 'string' ? stored.renewalDate : null,
    cancelAtPeriodEnd: stored?.cancelAtPeriodEnd === true,
    providerCustomerId: typeof stored?.providerCustomerId === 'string' ? stored.providerCustomerId : null,
    providerSubscriptionId: typeof stored?.providerSubscriptionId === 'string' ? stored.providerSubscriptionId : null,
    providerProductId: typeof stored?.providerProductId === 'string' ? stored.providerProductId : null,
    providerPriceId: typeof stored?.providerPriceId === 'string' ? stored.providerPriceId : null,
    lastVerifiedAt: typeof stored?.lastVerifiedAt === 'string' ? stored.lastVerifiedAt : null,
  };
};

// Statuses under which paid access should stay live. 'trial' and
// 'grace' both mean access continues while billing resolves itself.
// 'past_due' is deliberately EXCLUDED - a product decision to fail closed
// on unpaid renewals rather than Stripe's own default of keeping access
// through a payment retry window. Revisit if that proves too aggressive
// once real renewal-failure data exists.
const LIVE_STATUSES: readonly EntitlementStatus[] = ['active', 'trial', 'grace'];

// Replaces the old binary hasPremiumEntitlement(record) - "is this
// account on ANY paid tier right now" (as opposed to which one). Most
// callers want getCapability(effectivePlan(record), ...) instead of
// this directly; it's kept for the handful of call sites that only
// need a yes/no ("does this account see the paid-only settings tab at
// all") rather than a specific capability check.
export const hasPaidEntitlement = (record: EntitlementRecord, now: Date = new Date()): boolean => {
  if (record.plan === 'free') return false;
  if (!LIVE_STATUSES.includes(record.status)) return false;
  if (record.entitlementEnd && new Date(record.entitlementEnd).getTime() < now.getTime()) return false;
  return true;
};

export const effectivePlan = (record: EntitlementRecord, now: Date = new Date()): EntitlementPlan =>
  hasPaidEntitlement(record, now) ? record.plan : 'free';

// --- Capability model -------------------------------------------------
// Every gated feature is a capability with an independent per-plan
// configuration, instead of `if (plan === 'performance')` scattered
// through routes/components. The intended call shape everywhere else in
// the app is `canUser(plan, capabilityId)` / `getCapability(plan, id)`,
// never a raw plan-string comparison.
//
// Not every field is meaningful for every capability - "where
// appropriate" per the product brief:
//   - `limit: null` means no numeric cap for this plan (the capability
//     may still be entirely gated off by `enabled: false`).
//   - `resetPeriod` only matters when `limit` isn't null - which
//     counter document (daily vs. monthly) enforcement reads against.
//   - `unit` distinguishes a plain event count (messages, sessions,
//     exports - the default) from a duration accumulator (Nova Live
//     minutes) - see nova_voice_minutes below for why that's a SEPARATE
//     capability from nova_voice, not a field on the same one.
//   - `retentionDays` is specific to history-shaped capabilities; null
//     means no rolling cutoff (full history retained).
//   - `mode` is a free-text tier-depth label (e.g. 'basic' | 'standard'
//     | 'advanced') for capabilities that differ in DEPTH rather than
//     in a countable quantity - never surfaced to the model or the
//     client as a numeric "score," just a UI/behaviour hint.
//   - `priority` is an AI-routing hint (see docs/AI_COST_CONTROL.md for
//     what "priority routing" does and doesn't mean today - see the
//     honesty note below).
//   - `fairUse: true` marks a limit that should be described to the
//     user in calm, human language ("you're using Nova unusually
//     heavily this month") rather than as a hard, cold quota number -
//     see docs/FREE_PREMIUM_ENTITLEMENTS.md's UI-copy guidance.
//   - `fallback` is a human-readable description of what happens once
//     the limit is hit (e.g. 'push/email' for SMS), for UI copy - not
//     itself enforced by this file.
//
// HONESTY NOTE on which of these are actually enforced server-side
// today: a capability entry existing here means "the tier matrix and
// the pricing page can correctly describe this feature's depth per
// plan." It does NOT by itself mean a route somewhere checks it. The
// capabilities with real, tested server enforcement are: nova_text,
// nova_voice, nova_voice_minutes, diagnose, exports, nova_manager_coach,
// resentment_analysis, executive_report, sms_nudges - each has a real
// route/counter behind it (see server.ts, docs/FREE_PREMIUM_ENTITLEMENTS.md).
// The remainder (core_tools, daily_checkin, energy_budget, recovery_plans,
// nova_memory, history, pattern_recognition, predictive_insights,
// ally_nudges, weekly_intelligence, monthly_executive_report,
// advanced_personalisation, priority_ai, premium_content, early_access,
// coaching_benefits) are declared here with accurate per-tier
// configuration so the pricing page and tier matrix are data-driven and
// consistent, but do NOT yet have a corresponding feature/route that
// reads them to gate access - building real enforcement for each would
// mean touching a dozen unrelated features' write paths in this same
// pass, which risks shipping shallow, undertested gates across the
// product. This is flagged explicitly, not left as a silent gap - see
// the final report and docs/FREE_PREMIUM_ENTITLEMENTS.md.

export type CapabilityId =
  // Real, server-enforced today (5 pre-existing + 4 extended in the
  // earlier production-hardening pass):
  | 'nova_text'
  | 'nova_voice'
  | 'diagnose'
  | 'exports'
  | 'nova_manager_coach'
  | 'resentment_analysis'
  | 'executive_report'
  // Real, server-enforced, NEW in this revision (genuinely new tracking
  // infrastructure - see docs/FREE_PREMIUM_ENTITLEMENTS.md):
  | 'nova_voice_minutes'
  | 'sms_nudges'
  // Declared/tier-differentiated, not yet independently enforced - see
  // the honesty note above:
  | 'core_tools'
  | 'daily_checkin'
  | 'energy_budget'
  | 'recovery_plans'
  | 'nova_memory'
  | 'history'
  | 'pattern_recognition'
  | 'predictive_insights'
  | 'ally_nudges'
  | 'weekly_intelligence'
  | 'monthly_executive_report'
  | 'advanced_personalisation'
  | 'priority_ai'
  | 'premium_content'
  | 'early_access'
  | 'coaching_benefits';

export interface CapabilityLimit {
  enabled: boolean;
  limit: number | null;
  resetPeriod?: 'daily' | 'monthly';
  unit?: 'count' | 'minutes';
  retentionDays?: number | null;
  mode?: string;
  priority?: 'standard' | 'high' | 'highest';
  fairUse?: boolean;
  fallback?: string;
}

// One entry per plan - every real (non-legacy) tier plus legacy_premium,
// which is configured explicitly per capability rather than derived, so
// each one is a conscious "what does a grandfathered account get"
// decision (documented inline where it isn't a straightforward mapping
// to the nearest real tier) instead of an implicit fallback.
export type CapabilityConfig = Record<EntitlementPlan, CapabilityLimit>;

export const CAPABILITIES: Record<CapabilityId, CapabilityConfig> = {
  // Nova text chat messages/day. Unchanged from the pre-existing
  // Free/Premium figures for free/legacy_premium; Core/Performance/
  // Executive are new, generous, ascending fair-use ceilings - framed
  // to the user as "you're using Nova unusually heavily," never a raw
  // token count (fairUse: true).
  nova_text: {
    free: { enabled: true, limit: 40, resetPeriod: 'daily', fairUse: true },
    core: { enabled: true, limit: 300, resetPeriod: 'daily', fairUse: true },
    performance: { enabled: true, limit: 600, resetPeriod: 'daily', fairUse: true, priority: 'high' },
    executive: { enabled: true, limit: 1000, resetPeriod: 'daily', fairUse: true, priority: 'highest' },
    legacy_premium: { enabled: true, limit: 400, resetPeriod: 'daily', fairUse: true },
  },
  // Nova Live voice SESSION COUNT/day - unchanged mechanism from before
  // this revision (still daily, still a session count, still capped per-
  // session at NOVA_LIVE_MAX_SESSION_MS regardless of plan). This is
  // deliberately a SEPARATE capability from nova_voice_minutes below,
  // not a field on the same one - see that entry for why.
  nova_voice: {
    free: { enabled: true, limit: 1, resetPeriod: 'daily' },
    core: { enabled: true, limit: 4, resetPeriod: 'daily' },
    performance: { enabled: true, limit: 10, resetPeriod: 'daily' },
    executive: { enabled: true, limit: 20, resetPeriod: 'daily' },
    legacy_premium: { enabled: true, limit: 20, resetPeriod: 'daily' },
  },
  // Nova Live voice CUMULATIVE MINUTES/month - genuinely new tracking
  // (see docs/AI_COST_CONTROL.md: before this revision there was no
  // concept of monthly minutes used at all, only daily session count).
  // legacy_premium gets `limit: null` (uncapped) here specifically
  // because the OLD Premium tier never had any monthly-minute concept
  // to be bound by - giving it a numeric cap now, even a generous one,
  // would be a real reduction in what a grandfathered account could
  // always do (start up to 20 sessions/day, each up to 15 minutes, with
  // no monthly rollup). The daily session-count cap above and the
  // per-session hard ceiling both still apply unchanged, so this isn't
  // "unlimited voice" - it's "unlimited only in the one dimension that
  // was never limited before."
  nova_voice_minutes: {
    free: { enabled: true, limit: 10, resetPeriod: 'monthly', unit: 'minutes' },
    core: { enabled: true, limit: 60, resetPeriod: 'monthly', unit: 'minutes' },
    performance: { enabled: true, limit: 240, resetPeriod: 'monthly', unit: 'minutes' },
    executive: { enabled: true, limit: 600, resetPeriod: 'monthly', unit: 'minutes' },
    legacy_premium: { enabled: true, limit: null, resetPeriod: 'monthly', unit: 'minutes' },
  },
  diagnose: {
    free: { enabled: true, limit: 5, resetPeriod: 'daily' },
    core: { enabled: true, limit: 30, resetPeriod: 'daily' },
    performance: { enabled: true, limit: 50, resetPeriod: 'daily' },
    executive: { enabled: true, limit: 80, resetPeriod: 'daily' },
    legacy_premium: { enabled: true, limit: 50, resetPeriod: 'daily' },
  },
  // GDPR Art. 15/20 (access/portability) data export - the daily limit
  // here is abuse protection against scripted repeated full-account pulls
  // (see the comment on GET /api/user/export in server.ts), NEVER a
  // restriction on the underlying data-access right itself. `enabled:
  // false` would mean "Free accounts cannot exercise their legal
  // portability right without paying" - exactly the kind of paywall the
  // product brief explicitly forbids ("never paywall... basic protection
  // of user data"). Free therefore stays enabled with the same 1/day
  // ceiling it always had; every paid tier just gets a higher ceiling.
  exports: {
    free: { enabled: true, limit: 1, resetPeriod: 'daily' },
    core: { enabled: true, limit: 3, resetPeriod: 'daily' },
    performance: { enabled: true, limit: 20, resetPeriod: 'daily' },
    executive: { enabled: true, limit: 20, resetPeriod: 'daily' },
    legacy_premium: { enabled: true, limit: 20, resetPeriod: 'daily' },
  },
  // Org-manager feature - unaffected by the new B2C tiers (it's gated by
  // org role, not personal plan, elsewhere in server.ts); kept at its
  // existing Free/Premium figures for every plan so nothing regresses
  // for an org manager on any personal tier.
  nova_manager_coach: {
    free: { enabled: true, limit: 3, resetPeriod: 'daily' },
    core: { enabled: true, limit: 3, resetPeriod: 'daily' },
    performance: { enabled: true, limit: 30, resetPeriod: 'daily' },
    executive: { enabled: true, limit: 30, resetPeriod: 'daily' },
    legacy_premium: { enabled: true, limit: 30, resetPeriod: 'daily' },
  },
  resentment_analysis: {
    free: { enabled: true, limit: 5, resetPeriod: 'daily' },
    core: { enabled: true, limit: 30, resetPeriod: 'daily' },
    performance: { enabled: true, limit: 50, resetPeriod: 'daily' },
    executive: { enabled: true, limit: 50, resetPeriod: 'daily' },
    legacy_premium: { enabled: true, limit: 50, resetPeriod: 'daily' },
  },
  // Also stands in for the "weekly personalised intelligence report"
  // (Performance) / "monthly Executive intelligence report" (Executive)
  // tier features from the product brief - implemented as increased
  // ACCESS FREQUENCY to this existing, real, already-secured report
  // (GET /api/signals/executive-report), not as new scheduled/auto-
  // delivered report infrastructure. Building an actual cron-scheduled,
  // auto-generated-and-delivered weekly/monthly report is real,
  // separate future work (see weekly_intelligence/monthly_executive_report
  // below, which declare the DEPTH difference without inventing that
  // delivery mechanism) - flagged explicitly in the final report.
  executive_report: {
    free: { enabled: true, limit: 5, resetPeriod: 'daily' },
    core: { enabled: true, limit: 30, resetPeriod: 'daily' },
    performance: { enabled: true, limit: 50, resetPeriod: 'daily' },
    executive: { enabled: true, limit: 80, resetPeriod: 'daily' },
    legacy_premium: { enabled: true, limit: 50, resetPeriod: 'daily' },
  },
  // The new tier-allowance layer, additional to (not replacing)
  // sms-guardrails.ts's existing abuse/cooldown aggregate cap
  // (150/month, 20/day across ally_nudge+manual_send). Whichever ceiling
  // is hit first blocks. Guardian Support SMS is a different category
  // entirely (never subject to either cap) - see
  // docs/FREE_PREMIUM_ENTITLEMENTS.md and sms-guardrails.ts.
  sms_nudges: {
    free: { enabled: false, limit: 0, resetPeriod: 'monthly', fallback: 'push/in-app/email' },
    core: { enabled: false, limit: 0, resetPeriod: 'monthly', fallback: 'push/in-app/email' },
    performance: { enabled: true, limit: 10, resetPeriod: 'monthly', fallback: 'push/in-app/email' },
    executive: { enabled: true, limit: 30, resetPeriod: 'monthly', fallback: 'push/in-app/email' },
    // No SMS tier concept existed before this revision at all - legacy
    // accounts get Performance's allowance (the nearest tier
    // legacy_premium sits alongside in PLAN_TIER_ORDER) as a reasonable,
    // generous default rather than zero, since introducing an allowance
    // that didn't exist before can't itself be "reducing" anything.
    legacy_premium: { enabled: true, limit: 10, resetPeriod: 'monthly', fallback: 'push/in-app/email' },
  },

  // ---- Declared tier-depth config below (see the HONESTY NOTE above:
  // not yet independently server-enforced) ----

  core_tools: {
    free: { enabled: true, limit: null, mode: 'selected' },
    core: { enabled: true, limit: null, mode: 'full' },
    performance: { enabled: true, limit: null, mode: 'full' },
    executive: { enabled: true, limit: null, mode: 'full' },
    legacy_premium: { enabled: true, limit: null, mode: 'full' },
  },
  daily_checkin: {
    free: { enabled: true, limit: null, mode: 'full' },
    core: { enabled: true, limit: null, mode: 'full' },
    performance: { enabled: true, limit: null, mode: 'full' },
    executive: { enabled: true, limit: null, mode: 'full' },
    legacy_premium: { enabled: true, limit: null, mode: 'full' },
  },
  energy_budget: {
    free: { enabled: true, limit: null, mode: 'basic' },
    core: { enabled: true, limit: null, mode: 'full' },
    performance: { enabled: true, limit: null, mode: 'advanced' },
    executive: { enabled: true, limit: null, mode: 'advanced' },
    legacy_premium: { enabled: true, limit: null, mode: 'advanced' },
  },
  // "1 basic recovery plan" (Free) vs. "full recovery plans" (Core+) -
  // limit is a plan COUNT here, not a daily/monthly quota, so
  // resetPeriod is intentionally omitted.
  recovery_plans: {
    free: { enabled: true, limit: 1 },
    core: { enabled: true, limit: null },
    performance: { enabled: true, limit: null },
    executive: { enabled: true, limit: null },
    legacy_premium: { enabled: true, limit: null },
  },
  nova_memory: {
    free: { enabled: true, limit: null, mode: 'basic' },
    core: { enabled: true, limit: null, mode: 'standard' },
    performance: { enabled: true, limit: null, mode: 'deep' },
    executive: { enabled: true, limit: null, mode: 'deepest' },
    legacy_premium: { enabled: true, limit: null, mode: 'standard' },
  },
  // retentionDays: null = full/unbounded history retained.
  history: {
    free: { enabled: true, limit: null, retentionDays: 14 },
    core: { enabled: true, limit: null, retentionDays: 90 },
    performance: { enabled: true, limit: null, retentionDays: null },
    executive: { enabled: true, limit: null, retentionDays: null },
    legacy_premium: { enabled: true, limit: null, retentionDays: null },
  },
  pattern_recognition: {
    free: { enabled: true, limit: null, mode: 'basic' },
    core: { enabled: true, limit: null, mode: 'standard' },
    performance: { enabled: true, limit: null, mode: 'advanced' },
    executive: { enabled: true, limit: null, mode: 'advanced' },
    legacy_premium: { enabled: true, limit: null, mode: 'standard' },
  },
  predictive_insights: {
    free: { enabled: false, limit: null },
    core: { enabled: false, limit: null },
    performance: { enabled: true, limit: null },
    executive: { enabled: true, limit: null },
    legacy_premium: { enabled: true, limit: null },
  },
  ally_nudges: {
    free: { enabled: true, limit: null, mode: 'basic' },
    core: { enabled: true, limit: null, mode: 'full' },
    performance: { enabled: true, limit: null, mode: 'proactive' },
    executive: { enabled: true, limit: null, mode: 'proactive' },
    legacy_premium: { enabled: true, limit: null, mode: 'full' },
  },
  weekly_intelligence: {
    free: { enabled: false, limit: null },
    core: { enabled: false, limit: null },
    performance: { enabled: true, limit: null },
    executive: { enabled: true, limit: null },
    legacy_premium: { enabled: true, limit: null },
  },
  monthly_executive_report: {
    free: { enabled: false, limit: null },
    core: { enabled: false, limit: null },
    performance: { enabled: false, limit: null },
    executive: { enabled: true, limit: null },
    legacy_premium: { enabled: false, limit: null },
  },
  advanced_personalisation: {
    free: { enabled: false, limit: null },
    core: { enabled: true, limit: null, mode: 'standard' },
    performance: { enabled: true, limit: null, mode: 'advanced' },
    executive: { enabled: true, limit: null, mode: 'deepest' },
    legacy_premium: { enabled: true, limit: null, mode: 'advanced' },
  },
  // See docs/AI_COST_CONTROL.md's own honesty note: there is no actual
  // request-routing/queueing infrastructure differentiating "priority"
  // requests today - every request goes through the same path. This
  // field is declared so the pricing page can describe the intended
  // future behaviour accurately-labelled as a target, not implemented
  // as real infrastructure in this pass.
  priority_ai: {
    free: { enabled: false, limit: null, priority: 'standard' },
    core: { enabled: false, limit: null, priority: 'standard' },
    performance: { enabled: true, limit: null, priority: 'high' },
    executive: { enabled: true, limit: null, priority: 'highest' },
    legacy_premium: { enabled: false, limit: null, priority: 'standard' },
  },
  premium_content: {
    free: { enabled: true, limit: null, mode: 'preview' },
    core: { enabled: true, limit: null, mode: 'full' },
    performance: { enabled: true, limit: null, mode: 'full' },
    executive: { enabled: true, limit: null, mode: 'full' },
    legacy_premium: { enabled: true, limit: null, mode: 'full' },
  },
  early_access: {
    free: { enabled: false, limit: null },
    core: { enabled: false, limit: null },
    performance: { enabled: false, limit: null },
    executive: { enabled: true, limit: null },
    legacy_premium: { enabled: false, limit: null },
  },
  // Discount/priority-booking benefit for the SEPARATE, human 1:1/
  // Executive Coaching commercial product - never automatic inclusion
  // of actual coaching itself inside the subscription (per the product
  // brief's explicit instruction). Not implemented as a real discount-
  // code mechanism in this pass (there is no coaching-booking system in
  // this codebase to apply one to) - declared here as a factual tier
  // benefit for pricing-page copy only.
  coaching_benefits: {
    free: { enabled: false, limit: null },
    core: { enabled: false, limit: null },
    performance: { enabled: false, limit: null },
    executive: { enabled: true, limit: null, mode: 'priority_and_discount' },
    legacy_premium: { enabled: false, limit: null },
  },
};

export const getCapability = (plan: EntitlementPlan, capability: CapabilityId): CapabilityLimit =>
  CAPABILITIES[capability][plan];

// The architecture-principle entry point the product brief asks for:
// `canUser(plan, capability)` rather than `if (plan === 'performance')`
// scattered through the app. A capability that's `enabled` with
// `limit: null` is a plain yes; one with a numeric limit still reads as
// "allowed in principle" here (the actual remaining-quota check is
// checkQuota below, which needs a real usage count only the caller -
// server.ts - has).
export const canUser = (plan: EntitlementPlan, capability: CapabilityId): boolean => getCapability(plan, capability).enabled;

export interface QuotaCheckResult {
  allowed: boolean;
  limit: number | null;
  used: number;
  resetPeriod?: 'daily' | 'monthly';
}

// Pure decision of whether one more use of `capability` is allowed this
// period, given how many the account has already used in that period.
// Period-agnostic on purpose - the caller (server.ts) is responsible for
// reading the correct counter document (daily- or monthly-keyed) based
// on `getCapability(...).resetPeriod`; this function only does the
// comparison. Replaces the old checkDailyQuota with the identical
// signature/behaviour for daily capabilities (kept as an alias below for
// any lingering reference), generalised to also serve monthly ones.
export const checkQuota = (plan: EntitlementPlan, capability: CapabilityId, usedThisPeriod: number): QuotaCheckResult => {
  const cap = getCapability(plan, capability);
  if (!cap.enabled) return { allowed: false, limit: 0, used: usedThisPeriod, resetPeriod: cap.resetPeriod };
  if (cap.limit === null) return { allowed: true, limit: null, used: usedThisPeriod, resetPeriod: cap.resetPeriod };
  return { allowed: usedThisPeriod < cap.limit, limit: cap.limit, used: usedThisPeriod, resetPeriod: cap.resetPeriod };
};

// --- Nova Live voice minutes -----------------------------------------
// Pure helpers for the new monthly-minutes accumulator. Rounds UP to the
// nearest whole minute (a 10-second call still "costs" 1 minute) -
// consistent with how this app already errs toward protecting cost
// elsewhere (e.g. the existing SMS segment estimator), and simpler than
// fractional-minute billing for no real benefit at this scale.
export const minutesUsedForSession = (sessionDurationMs: number): number => {
  if (sessionDurationMs <= 0) return 0;
  return Math.ceil(sessionDurationMs / 60000);
};

// --- Pricing -----------------------------------------------------------
// The one place the actual price figures live - the pricing page,
// checkout copy, and any future Stripe price-ID mapping all read from
// here rather than hardcoding numbers in components. These are the
// agreed LAUNCH prices for NEW customers only (see the module docstring
// on legacy_premium) - changing a price here does not affect any
// existing customer's already-stored entitlement record, which carries
// no price of its own (Stripe/Apple/Google are each the actual source
// of truth for what a real customer is being charged, once wired up).
export interface PlanPricing {
  monthlyGbp: number;
  annualGbp: number | null; // null for Free (no billing cadence at all)
}

export const PLAN_PRICING: Record<Exclude<EntitlementPlan, 'legacy_premium'>, PlanPricing> = {
  free: { monthlyGbp: 0, annualGbp: null },
  core: { monthlyGbp: 34.99, annualGbp: 349 },
  performance: { monthlyGbp: 49.99, annualGbp: 499 },
  executive: { monthlyGbp: 69.99, annualGbp: 699 },
};

export const PERFORMANCE_IS_MOST_POPULAR = true;

// Rounded to the nearest penny; a plan with no annual price (Free)
// returns null rather than a misleading £0 "saving."
export const annualSavingsGbp = (plan: keyof typeof PLAN_PRICING): number | null => {
  const pricing = PLAN_PRICING[plan];
  if (pricing.annualGbp === null) return null;
  return Math.round((pricing.monthlyGbp * 12 - pricing.annualGbp) * 100) / 100;
};

// --- Adapter boundary ---------------------------------------------------
// A real integration (Stripe/Apple/Google) would implement
// EntitlementProvider by verifying a purchase/subscription against that
// provider's API and returning the resulting record; nothing else in this
// codebase should assume a specific provider until one is actually wired
// up. Today only the null provider exists. See docs/STRIPE_PRODUCTS.md
// and docs/MOBILE_SUBSCRIPTIONS.md for the price-ID-to-plan mapping
// design this boundary is built to receive.
export interface EntitlementProvider {
  readonly name: string;
}

export class NullEntitlementProvider implements EntitlementProvider {
  readonly name = 'null';
}

export const entitlementProvider: EntitlementProvider = new NullEntitlementProvider();

// Maps a provider's price/product identifier to the Blaze Break plan and
// billing cadence it represents. Pure lookup logic, kept here so the
// mapping table itself (real IDs, once they exist) can live in
// environment/config rather than scattered through webhook-handling
// code - see docs/STRIPE_PRODUCTS.md for the exact config shape this is
// designed to be populated from once real Stripe/Apple/Google products
// exist.
export interface PriceMapping {
  plan: Exclude<EntitlementPlan, 'legacy_premium'>;
  cadence: 'monthly' | 'annual';
}

export const resolvePlanFromPriceId = (
  priceId: string,
  priceIdMap: Record<string, PriceMapping>
): PriceMapping | null => priceIdMap[priceId] ?? null;

// --- Admin-grant validation ---------------------------------------------
// The one real, working way to grant a paid plan today, pending a live
// payment provider: a platform admin sets it directly (beta testers,
// support cases, manual comps, org-sponsored seats). Deliberately
// narrow - only plan/status/durationDays are settable by hand;
// billingSource is always forced to 'admin' (or 'organisation' for the
// org-seat path) by the caller (server.ts), never accepted from the
// request body, so an admin grant can never be mistaken for a real
// provider record. `legacy_premium` is intentionally NOT accepted here -
// it is a read-path migration outcome, not something anyone should be
// able to grant going forward (see the module docstring); an admin who
// wants to comp someone Premium-equivalent access grants `performance`
// (the tier `legacy_premium` is aligned with in PLAN_TIER_ORDER).
export interface AdminGrantInput {
  plan?: unknown;
  status?: unknown;
  durationDays?: unknown; // optional - omitted/null means no fixed end
}

export interface AdminGrantValidationResult {
  valid: boolean;
  error?: string;
}

export const validateAdminGrant = (input: AdminGrantInput): AdminGrantValidationResult => {
  if (!isEntitlementPlan(input.plan) || input.plan === 'legacy_premium') {
    return { valid: false, error: `"plan" must be one of: ${PURCHASABLE_PLANS.join(', ')}.` };
  }
  if (!isEntitlementStatus(input.status)) {
    return { valid: false, error: `"status" must be one of: ${ENTITLEMENT_STATUSES.join(', ')}.` };
  }
  if (input.durationDays !== undefined && input.durationDays !== null) {
    if (typeof input.durationDays !== 'number' || !Number.isInteger(input.durationDays) || input.durationDays < 1 || input.durationDays > 3650) {
      return { valid: false, error: '"durationDays" must be a whole number of days between 1 and 3650, or omitted for no fixed end.' };
    }
  }
  return { valid: true };
};
