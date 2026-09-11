// Pure logic + an explicit adapter boundary for Enterprise central billing.
// Kept I/O-free and unit-tested, same pattern as the rest of this Enterprise
// backend. server.ts owns reading/writing the `billing` map inline on
// organisations/{orgId} (same precedent as the existing `privacyThreshold`
// and `dataPolicy` fields) and calling the seat-limit check before sending
// new invites.
//
// There is no Stripe (or any) billing SDK in this codebase's package.json
// today, and no real payment provider is wired up. `NullBillingProvider` is
// an honest stand-in: it never pretends a charge happened, a subscription
// was created, or a seat count came from anywhere but the org's own stored
// value. See docs/BILLING_ADMIN.md for what wiring a real provider (Stripe
// or otherwise) would require.

export const BILLING_PLANS = ['free', 'starter', 'business', 'enterprise'] as const;
export type BillingPlan = (typeof BILLING_PLANS)[number];
export const isBillingPlan = (value: unknown): value is BillingPlan =>
  typeof value === 'string' && (BILLING_PLANS as readonly string[]).includes(value);

export const BILLING_STATUSES = ['active', 'trialing', 'past_due', 'canceled'] as const;
export type BillingStatus = (typeof BILLING_STATUSES)[number];
export const isBillingStatus = (value: unknown): value is BillingStatus =>
  typeof value === 'string' && (BILLING_STATUSES as readonly string[]).includes(value);

export interface OrgBillingState {
  plan: BillingPlan;
  status: BillingStatus;
  seatCount: number;
  billingContact: string | null;
  providerCustomerId: string | null;
  providerSubscriptionId: string | null;
}

// A new org with no billing set up at all is on the free plan, active
// status (nothing to be past-due on), a modest default seat allowance, and
// no provider linkage of any kind - because there is no provider yet.
export const DEFAULT_BILLING_STATE: OrgBillingState = {
  plan: 'free',
  status: 'active',
  seatCount: 5,
  billingContact: null,
  providerCustomerId: null,
  providerSubscriptionId: null,
};

const MIN_SEAT_COUNT = 1;
const MAX_SEAT_COUNT = 100000;

export const getEffectiveBillingState = (stored: Partial<OrgBillingState> | null | undefined): OrgBillingState => ({
  plan: isBillingPlan(stored?.plan) ? stored!.plan : DEFAULT_BILLING_STATE.plan,
  status: isBillingStatus(stored?.status) ? stored!.status : DEFAULT_BILLING_STATE.status,
  seatCount:
    typeof stored?.seatCount === 'number' &&
    Number.isInteger(stored.seatCount) &&
    stored.seatCount >= MIN_SEAT_COUNT &&
    stored.seatCount <= MAX_SEAT_COUNT
      ? stored.seatCount
      : DEFAULT_BILLING_STATE.seatCount,
  billingContact: typeof stored?.billingContact === 'string' && stored.billingContact.trim().length > 0 ? stored.billingContact : null,
  providerCustomerId: typeof stored?.providerCustomerId === 'string' ? stored.providerCustomerId : null,
  providerSubscriptionId: typeof stored?.providerSubscriptionId === 'string' ? stored.providerSubscriptionId : null,
});

export interface BillingValidationResult {
  valid: boolean;
  error?: string;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Validates a proposed full billing-state write. Provider identifiers
// (`providerCustomerId`/`providerSubscriptionId`) are intentionally NOT
// settable through this validation - they only ever get set by a real
// provider integration reconciling its own state, never entered by hand
// through this admin route. Today, with only the null provider, they stay
// null.
export const validateBillingUpdate = (input: unknown): BillingValidationResult => {
  if (!input || typeof input !== 'object') {
    return { valid: false, error: 'A billing object is required.' };
  }
  const candidate = input as Record<string, unknown>;
  if (!isBillingPlan(candidate.plan)) {
    return { valid: false, error: `"plan" must be one of: ${BILLING_PLANS.join(', ')}.` };
  }
  if (!isBillingStatus(candidate.status)) {
    return { valid: false, error: `"status" must be one of: ${BILLING_STATUSES.join(', ')}.` };
  }
  if (
    typeof candidate.seatCount !== 'number' ||
    !Number.isInteger(candidate.seatCount) ||
    candidate.seatCount < MIN_SEAT_COUNT ||
    candidate.seatCount > MAX_SEAT_COUNT
  ) {
    return { valid: false, error: `"seatCount" must be a whole number between ${MIN_SEAT_COUNT} and ${MAX_SEAT_COUNT}.` };
  }
  if (candidate.billingContact !== null && candidate.billingContact !== undefined) {
    if (typeof candidate.billingContact !== 'string' || !EMAIL_PATTERN.test(candidate.billingContact)) {
      return { valid: false, error: '"billingContact" must be a valid email address, or null.' };
    }
  }
  return { valid: true };
};

export interface SeatLimitCheckResult {
  allowed: boolean;
  error?: string;
  seatsInUse: number;
  seatAllowance: number;
}

// The actual enforcement point: given how many active members and pending
// invites an org already has, whether adding `newInviteCount` more would
// exceed its seat allowance. Called before /api/org/:orgId/invite actually
// sends anything, so a plan's seat limit is a real constraint, not a
// number that's only ever displayed.
export const checkSeatLimit = (
  activeMemberCount: number,
  pendingInviteCount: number,
  newInviteCount: number,
  seatAllowance: number
): SeatLimitCheckResult => {
  const seatsInUse = activeMemberCount + pendingInviteCount;
  const seatsAfter = seatsInUse + newInviteCount;
  if (seatsAfter > seatAllowance) {
    return {
      allowed: false,
      error: `This organisation's plan allows ${seatAllowance} seat${seatAllowance === 1 ? '' : 's'}; ${seatsInUse} ${seatsInUse === 1 ? 'is' : 'are'} already in use and this invite would need ${seatsAfter}.`,
      seatsInUse,
      seatAllowance,
    };
  }
  return { allowed: true, seatsInUse, seatAllowance };
};

// The adapter boundary itself. A real integration (Stripe or otherwise)
// would implement BillingProvider by calling out to that provider's API;
// nothing else in this codebase should assume Stripe specifically, or any
// other provider, until one is actually chosen and wired up.
export interface BillingProvider {
  readonly name: string;
  // The seat allowance actually in force for this org, as reported by the
  // provider. The null provider has no external source of truth, so it
  // simply echoes back what's stored on the org itself.
  getSeatAllowance(state: OrgBillingState): number;
}

export class NullBillingProvider implements BillingProvider {
  readonly name = 'null';
  getSeatAllowance(state: OrgBillingState): number {
    return state.seatCount;
  }
}

export const billingProvider: BillingProvider = new NullBillingProvider();
