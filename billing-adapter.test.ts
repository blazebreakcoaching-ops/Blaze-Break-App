import { describe, it, expect } from 'vitest';
import {
  BILLING_PLANS,
  BILLING_STATUSES,
  DEFAULT_BILLING_STATE,
  getEffectiveBillingState,
  validateBillingUpdate,
  checkSeatLimit,
  NullBillingProvider,
} from './billing-adapter';

describe('DEFAULT_BILLING_STATE', () => {
  it('a new org starts on the free plan, active, with no provider linkage', () => {
    expect(DEFAULT_BILLING_STATE.plan).toBe('free');
    expect(DEFAULT_BILLING_STATE.status).toBe('active');
    expect(DEFAULT_BILLING_STATE.providerCustomerId).toBeNull();
    expect(DEFAULT_BILLING_STATE.providerSubscriptionId).toBeNull();
  });
});

describe('getEffectiveBillingState', () => {
  it('an org that never touched billing gets exactly the default', () => {
    expect(getEffectiveBillingState(null)).toEqual(DEFAULT_BILLING_STATE);
    expect(getEffectiveBillingState(undefined)).toEqual(DEFAULT_BILLING_STATE);
    expect(getEffectiveBillingState({})).toEqual(DEFAULT_BILLING_STATE);
  });

  it('an invalid plan or status falls back to the default rather than being trusted', () => {
    expect(getEffectiveBillingState({ plan: 'ultra' } as any).plan).toBe('free');
    expect(getEffectiveBillingState({ status: 'imaginary' } as any).status).toBe('active');
  });

  it('a valid stored plan/status/seatCount is honestly reflected', () => {
    const state = getEffectiveBillingState({ plan: 'business', status: 'trialing', seatCount: 25 });
    expect(state.plan).toBe('business');
    expect(state.status).toBe('trialing');
    expect(state.seatCount).toBe(25);
  });

  it('an out-of-range or non-integer seatCount falls back to the default', () => {
    expect(getEffectiveBillingState({ seatCount: 0 } as any).seatCount).toBe(DEFAULT_BILLING_STATE.seatCount);
    expect(getEffectiveBillingState({ seatCount: 1.5 } as any).seatCount).toBe(DEFAULT_BILLING_STATE.seatCount);
    expect(getEffectiveBillingState({ seatCount: 999999 } as any).seatCount).toBe(DEFAULT_BILLING_STATE.seatCount);
  });

  it('an empty or non-string billingContact is normalized to null', () => {
    expect(getEffectiveBillingState({ billingContact: '' } as any).billingContact).toBeNull();
    expect(getEffectiveBillingState({ billingContact: 42 } as any).billingContact).toBeNull();
  });
});

describe('validateBillingUpdate', () => {
  const valid = { plan: 'business', status: 'active', seatCount: 20, billingContact: 'finance@org.com' };

  it('accepts a fully valid update', () => {
    expect(validateBillingUpdate(valid)).toEqual({ valid: true });
  });

  it('accepts a null billingContact', () => {
    expect(validateBillingUpdate({ ...valid, billingContact: null }).valid).toBe(true);
  });

  it('rejects null, undefined, and non-object input', () => {
    expect(validateBillingUpdate(null).valid).toBe(false);
    expect(validateBillingUpdate(undefined).valid).toBe(false);
    expect(validateBillingUpdate('nope').valid).toBe(false);
  });

  it('rejects an unknown plan or status', () => {
    expect(validateBillingUpdate({ ...valid, plan: 'ultra' }).valid).toBe(false);
    expect(validateBillingUpdate({ ...valid, status: 'imaginary' }).valid).toBe(false);
  });

  it('rejects a non-integer or out-of-range seatCount', () => {
    expect(validateBillingUpdate({ ...valid, seatCount: 0 }).valid).toBe(false);
    expect(validateBillingUpdate({ ...valid, seatCount: 1.5 }).valid).toBe(false);
    expect(validateBillingUpdate({ ...valid, seatCount: 999999 }).valid).toBe(false);
  });

  it('rejects a malformed billingContact', () => {
    expect(validateBillingUpdate({ ...valid, billingContact: 'not-an-email' }).valid).toBe(false);
  });

  it('every known plan and status is individually accepted', () => {
    for (const plan of BILLING_PLANS) {
      expect(validateBillingUpdate({ ...valid, plan }).valid).toBe(true);
    }
    for (const status of BILLING_STATUSES) {
      expect(validateBillingUpdate({ ...valid, status }).valid).toBe(true);
    }
  });
});

describe('checkSeatLimit', () => {
  it('allows an invite that stays within the seat allowance', () => {
    const result = checkSeatLimit(3, 1, 2, 10);
    expect(result.allowed).toBe(true);
    expect(result.seatsInUse).toBe(4);
  });

  it('allows an invite that lands exactly at the seat allowance', () => {
    expect(checkSeatLimit(3, 0, 2, 5).allowed).toBe(true);
  });

  it('rejects an invite that would exceed the seat allowance', () => {
    const result = checkSeatLimit(4, 1, 2, 5);
    expect(result.allowed).toBe(false);
    expect(result.error).toMatch(/5 seats/);
  });

  it('counts pending invites toward the limit, not just active members', () => {
    const result = checkSeatLimit(0, 5, 1, 5);
    expect(result.allowed).toBe(false);
  });

  it('rejects when already over the limit even before the new invite', () => {
    const result = checkSeatLimit(10, 0, 0, 5);
    expect(result.allowed).toBe(false);
  });
});

describe('NullBillingProvider', () => {
  it('reports the org\'s own stored seatCount, inventing nothing', () => {
    const provider = new NullBillingProvider();
    expect(provider.getSeatAllowance({ ...DEFAULT_BILLING_STATE, seatCount: 42 })).toBe(42);
  });

  it('identifies itself honestly as the null provider', () => {
    expect(new NullBillingProvider().name).toBe('null');
  });
});
