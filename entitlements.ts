// Pure logic for Blaze Break's unified, server-authoritative Free/Premium
// entitlement model. Mirrors billing-adapter.ts's adapter-boundary pattern
// deliberately: Stripe/Apple/Google are pluggable EntitlementProvider
// implementations, and none is wired up yet (no Stripe/Apple/Google SDK in
// this codebase's package.json, no live credentials configured anywhere).
// NullEntitlementProvider is an honest stand-in, same precedent as
// billing-adapter.ts's NullBillingProvider - it never pretends a purchase
// was verified. The two billingSources that ARE real today are 'admin' (a
// human granting access directly, e.g. beta testers/support cases) and
// 'organisation' (an org's sponsored-Premium seat, reconciled from the
// existing Enterprise billing/org-rbac system in server.ts). See
// docs/FREE_PREMIUM_ENTITLEMENTS.md for what wiring a real Stripe/Apple/
// Google integration on top of this model requires.
//
// The single question every other part of the app should ask is
// `hasPremiumEntitlement(record)` - nothing should read a raw payment
// provider flag or a client-editable Firestore field directly (that was
// the actual bug this module replaces: the UI previously derived tier from
// `user_stats/core.profile.subscription`, a field the client could write
// directly via the Firestore SDK, and no server route checked tier at
// all). The record this module operates on must always be read from
// `users/{uid}/entitlements/status`, which firestore.rules makes
// `allow write: if false` - backend/Admin-SDK only.

export const ENTITLEMENT_PLANS = ['free', 'premium'] as const;
export type EntitlementPlan = (typeof ENTITLEMENT_PLANS)[number];
export const isEntitlementPlan = (value: unknown): value is EntitlementPlan =>
  typeof value === 'string' && (ENTITLEMENT_PLANS as readonly string[]).includes(value);

export const ENTITLEMENT_STATUSES = ['active', 'trial', 'grace', 'past_due', 'cancelled', 'expired'] as const;
export type EntitlementStatus = (typeof ENTITLEMENT_STATUSES)[number];
export const isEntitlementStatus = (value: unknown): value is EntitlementStatus =>
  typeof value === 'string' && (ENTITLEMENT_STATUSES as readonly string[]).includes(value);

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
  lastVerifiedAt: string | null; // ISO 8601 - when this record was last reconciled against its provider
}

// A brand-new account, or any account whose entitlement doc is missing or
// malformed, is Free/active - the only state that requires no external
// source of truth. This is also what every account effectively has today,
// since no payment provider has ever been wired up in this codebase.
export const DEFAULT_ENTITLEMENT: EntitlementRecord = {
  plan: 'free',
  status: 'active',
  billingSource: null,
  entitlementStart: null,
  entitlementEnd: null,
  renewalDate: null,
  lastVerifiedAt: null,
};

// Coerces a raw (possibly absent, possibly malformed - e.g. hand-edited or
// from a future schema version) stored record into a fully valid one.
// Every field falls back independently, so a partially-corrupt doc still
// degrades to safe defaults rather than throwing.
export const getEffectiveEntitlement = (stored: Partial<EntitlementRecord> | null | undefined): EntitlementRecord => ({
  plan: isEntitlementPlan(stored?.plan) ? stored!.plan : DEFAULT_ENTITLEMENT.plan,
  status: isEntitlementStatus(stored?.status) ? stored!.status : DEFAULT_ENTITLEMENT.status,
  billingSource: isEntitlementBillingSource(stored?.billingSource) ? stored!.billingSource : null,
  entitlementStart: typeof stored?.entitlementStart === 'string' ? stored.entitlementStart : null,
  entitlementEnd: typeof stored?.entitlementEnd === 'string' ? stored.entitlementEnd : null,
  renewalDate: typeof stored?.renewalDate === 'string' ? stored.renewalDate : null,
  lastVerifiedAt: typeof stored?.lastVerifiedAt === 'string' ? stored.lastVerifiedAt : null,
});

// Statuses under which Premium access should stay live. 'trial' and
// 'grace' both mean access continues while billing resolves itself.
// 'past_due' is deliberately EXCLUDED - a product decision to fail closed
// on unpaid renewals rather than Stripe's own default of keeping access
// through a payment retry window. Revisit if that proves too aggressive
// once real renewal-failure data exists.
const LIVE_STATUSES: readonly EntitlementStatus[] = ['active', 'trial', 'grace'];

export const hasPremiumEntitlement = (record: EntitlementRecord, now: Date = new Date()): boolean => {
  if (record.plan !== 'premium') return false;
  if (!LIVE_STATUSES.includes(record.status)) return false;
  if (record.entitlementEnd && new Date(record.entitlementEnd).getTime() < now.getTime()) return false;
  return true;
};

export const effectivePlan = (record: EntitlementRecord, now: Date = new Date()): EntitlementPlan =>
  hasPremiumEntitlement(record, now) ? 'premium' : 'free';

// --- Capability model -------------------------------------------------
// Every expensive or fair-use-relevant feature is a capability with an
// independent Free/Premium configuration, instead of `if premium` checks
// scattered through routes/components. `dailyLimit: null` means no
// per-day cap (still subject to abuse-detection/rate-limiting elsewhere,
// just not a quota). These are INTERNAL operating defaults, deliberately
// conservative-but-generous (nothing has ever been enforced before this),
// centrally configurable, and NOT necessarily surfaced verbatim in the
// product UI - see docs/FREE_PREMIUM_ENTITLEMENTS.md.

export type CapabilityId =
  | 'nova_text'
  | 'nova_voice'
  | 'diagnose'
  | 'exports';

export interface CapabilityLimit {
  enabled: boolean;
  dailyLimit: number | null;
}

export interface CapabilityConfig {
  free: CapabilityLimit;
  premium: CapabilityLimit;
}

export const CAPABILITIES: Record<CapabilityId, CapabilityConfig> = {
  // Nova text chat messages/day. Free gets a real, usable amount (enough
  // for a genuine daily check-in conversation); Premium is generous
  // fair-use, not a hard ceiling anyone should realistically hit.
  nova_text: {
    free: { enabled: true, dailyLimit: 40 },
    premium: { enabled: true, dailyLimit: 400 },
  },
  // Nova Live voice sessions/day - the most expensive single capability
  // (per-minute Gemini Live pricing), so Free is deliberately the most
  // tightly controlled here, matching the product's own stated intent
  // ("deliberately controlled access to expensive services, particularly
  // AI voice"). Session *length* is capped separately (see
  // NOVA_LIVE_VOICE config), this is session *count*.
  nova_voice: {
    free: { enabled: true, dailyLimit: 1 },
    premium: { enabled: true, dailyLimit: 20 },
  },
  diagnose: {
    free: { enabled: true, dailyLimit: 5 },
    premium: { enabled: true, dailyLimit: 50 },
  },
  exports: {
    free: { enabled: true, dailyLimit: 1 },
    premium: { enabled: true, dailyLimit: 20 },
  },
};

export const getCapability = (plan: EntitlementPlan, capability: CapabilityId): CapabilityLimit =>
  CAPABILITIES[capability][plan];

export interface QuotaCheckResult {
  allowed: boolean;
  limit: number | null;
  used: number;
}

// Pure decision of whether one more use of `capability` is allowed today,
// given how many the account has already used. The actual "used today"
// count is read from a per-day aggregate counter doc by the caller
// (server.ts) - kept out of this file so it stays I/O-free and testable.
export const checkDailyQuota = (plan: EntitlementPlan, capability: CapabilityId, usedToday: number): QuotaCheckResult => {
  const cap = getCapability(plan, capability);
  if (!cap.enabled) return { allowed: false, limit: 0, used: usedToday };
  if (cap.dailyLimit === null) return { allowed: true, limit: null, used: usedToday };
  return { allowed: usedToday < cap.dailyLimit, limit: cap.dailyLimit, used: usedToday };
};

// --- Adapter boundary ---------------------------------------------------
// A real integration (Stripe/Apple/Google) would implement
// EntitlementProvider by verifying a purchase/subscription against that
// provider's API and returning the resulting record; nothing else in this
// codebase should assume a specific provider until one is actually wired
// up. Today only the null provider exists.
export interface EntitlementProvider {
  readonly name: string;
}

export class NullEntitlementProvider implements EntitlementProvider {
  readonly name = 'null';
}

export const entitlementProvider: EntitlementProvider = new NullEntitlementProvider();

// --- Admin-grant validation ---------------------------------------------
// The one real, working way to grant Premium today, pending a live payment
// provider: a platform admin sets it directly (beta testers, support
// cases, manual comps). Deliberately narrow - only plan/status/durationDays
// are settable by hand; billingSource is always forced to 'admin' by the
// caller (server.ts), never accepted from the request body, so an admin
// grant can never be mistaken for a real Stripe/Apple/Google record.
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
  if (!isEntitlementPlan(input.plan)) {
    return { valid: false, error: `"plan" must be one of: ${ENTITLEMENT_PLANS.join(', ')}.` };
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
