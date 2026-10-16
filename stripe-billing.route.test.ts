import { describe, it, expect, beforeEach, vi } from 'vitest';

// ---- Hoisted setup: runs before server.ts is imported ---------------------
// Same pattern as guardian-alert.route.test.ts - env vars and mocks must be
// in place before server.ts's import-time side effects run.
const h = vi.hoisted(() => {
  process.env.TEST_MODE = 'true';
  process.env.NODE_ENV = 'test';
  process.env.STRIPE_SECRET_KEY = 'sk_test_fake';
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_fake';
  process.env.STRIPE_PRICE_CORE_MONTHLY = 'price_core_m';
  process.env.STRIPE_PRICE_PERFORMANCE_MONTHLY = 'price_perf_m';
  return {
    checkoutSessionsCreate: vi.fn(async (_opts: any) => ({ url: 'https://checkout.stripe.com/fake-session' })),
    subscriptionsRetrieve: vi.fn(async (_id: string) => ({})),
    constructEvent: vi.fn((_payload: any, signature: string, _secret: string) => {
      if (signature === 'bad_sig') {
        throw new Error('No signatures found matching the expected signature for payload');
      }
      return h.nextEvent;
    }),
    nextEvent: null as any,
  };
});

vi.mock('express-rate-limit', () => ({ default: () => (_req: any, _res: any, next: any) => next() }));
vi.mock('firebase-admin/app', () => ({ initializeApp: vi.fn(), getApps: () => [{}] }));
vi.mock('firebase-admin/app-check', () => ({ getAppCheck: () => ({ verifyToken: vi.fn() }) }));
vi.mock('firebase-admin/auth', () => ({
  getAuth: () => ({
    verifyIdToken: async (token: string) => ({ uid: token, email: `${token}@test.dev` }),
  }),
}));
vi.mock('firebase-admin/firestore', async () => {
  const fake = await import('./test/fake-firestore');
  return { getFirestore: () => fake.fakeDb, FieldValue: fake.FakeFieldValue };
});
vi.mock('stripe', () => ({
  default: class FakeStripe {
    checkout = { sessions: { create: h.checkoutSessionsCreate } };
    subscriptions = { retrieve: h.subscriptionsRetrieve };
    webhooks = { constructEvent: h.constructEvent };
  },
}));

import request from 'supertest';
import { app } from './server';
import { seedDoc, getDocRaw, resetStore } from './test/fake-firestore';

const auth = (uid: string) => ({ Authorization: `Bearer ${uid}` });

beforeEach(() => {
  resetStore();
  h.checkoutSessionsCreate.mockClear();
  h.subscriptionsRetrieve.mockClear();
  h.constructEvent.mockClear();
  h.nextEvent = null;
});

// The webhook route needs the RAW body - supertest's .send(string) with an
// explicit json Content-Type lands in req.body as a Buffer via
// express.raw({type:'application/json'}), exactly like a real Stripe
// delivery. The bytes never need to be valid against the mocked
// constructEvent, which ignores them and returns whatever h.nextEvent is
// set to - this test suite mocks the Stripe SDK itself, not its HMAC
// internals, matching how every other provider SDK is mocked in this repo.
const postWebhook = (signature: string) =>
  request(app)
    .post('/api/webhooks/stripe')
    .set('Content-Type', 'application/json')
    .set('stripe-signature', signature)
    .send(JSON.stringify({ id: 'evt_irrelevant_bytes' }));

describe('POST /api/billing/checkout-session', () => {
  it('requires authentication', async () => {
    const res = await request(app).post('/api/billing/checkout-session').send({});
    expect(res.status).toBe(401);
  });

  it('rejects a priceId that is not in the server-side allowlist', async () => {
    const res = await request(app).post('/api/billing/checkout-session').set(auth('user_1')).send({
      priceId: 'price_not_on_the_list', successUrl: 'https://app.test/ok', cancelUrl: 'https://app.test/cancel',
    });
    expect(res.status).toBe(400);
    expect(h.checkoutSessionsCreate).not.toHaveBeenCalled();
  });

  it('requires successUrl and cancelUrl', async () => {
    const res = await request(app).post('/api/billing/checkout-session').set(auth('user_1')).send({ priceId: 'price_core_m' });
    expect(res.status).toBe(400);
  });

  it('creates a Stripe Checkout Session with client_reference_id set to the Firebase uid', async () => {
    const res = await request(app).post('/api/billing/checkout-session').set(auth('user_1')).send({
      priceId: 'price_core_m', successUrl: 'https://app.test/ok', cancelUrl: 'https://app.test/cancel',
    });
    expect(res.status).toBe(200);
    expect(res.body.url).toBe('https://checkout.stripe.com/fake-session');
    expect(h.checkoutSessionsCreate).toHaveBeenCalledWith(expect.objectContaining({
      mode: 'subscription',
      client_reference_id: 'user_1',
      line_items: [{ price: 'price_core_m', quantity: 1 }],
      success_url: 'https://app.test/ok',
      cancel_url: 'https://app.test/cancel',
    }));
  });
});

describe('POST /api/webhooks/stripe', () => {
  it('rejects a request whose signature does not verify', async () => {
    const res = await postWebhook('bad_sig');
    expect(res.status).toBe(400);
  });

  it('checkout.session.completed: retrieves the subscription and writes a full entitlement patch for the referenced uid', async () => {
    h.nextEvent = {
      id: 'evt_1',
      type: 'checkout.session.completed',
      data: { object: { client_reference_id: 'user_1', subscription: 'sub_1' } },
    };
    h.subscriptionsRetrieve.mockResolvedValueOnce({
      id: 'sub_1',
      status: 'active',
      cancel_at_period_end: false,
      customer: 'cus_1',
      current_period_end: Math.floor(new Date('2026-07-01T00:00:00.000Z').getTime() / 1000),
      items: { data: [{ price: { id: 'price_core_m' } }] },
    });

    const res = await postWebhook('good_sig');
    expect(res.status).toBe(200);
    expect(h.subscriptionsRetrieve).toHaveBeenCalledWith('sub_1');

    const entitlement = getDocRaw('users/user_1/entitlements/status');
    expect(entitlement).toMatchObject({
      plan: 'core', status: 'active', billingSource: 'stripe',
      providerCustomerId: 'cus_1', providerSubscriptionId: 'sub_1', providerPriceId: 'price_core_m',
      renewalDate: '2026-07-01T00:00:00.000Z', entitlementEnd: null,
    });
  });

  it('is idempotent on the Stripe event id - a duplicate delivery never re-applies the patch', async () => {
    h.nextEvent = {
      id: 'evt_dup',
      type: 'checkout.session.completed',
      data: { object: { client_reference_id: 'user_1', subscription: 'sub_1' } },
    };
    h.subscriptionsRetrieve.mockResolvedValue({
      id: 'sub_1', status: 'active', cancel_at_period_end: false, customer: 'cus_1',
      current_period_end: null, items: { data: [{ price: { id: 'price_core_m' } }] },
    });

    const first = await postWebhook('good_sig');
    expect(first.body.duplicate).toBeUndefined();
    expect(h.subscriptionsRetrieve).toHaveBeenCalledTimes(1);

    const second = await postWebhook('good_sig');
    expect(second.status).toBe(200);
    expect(second.body.duplicate).toBe(true);
    // The retrieve call (and therefore any re-write) never happens again.
    expect(h.subscriptionsRetrieve).toHaveBeenCalledTimes(1);
  });

  it('customer.subscription.updated: uses metadata.firebaseUid when present', async () => {
    h.nextEvent = {
      id: 'evt_2',
      type: 'customer.subscription.updated',
      data: {
        object: {
          id: 'sub_2', status: 'active', cancel_at_period_end: true, customer: 'cus_2',
          current_period_end: Math.floor(new Date('2026-08-01T00:00:00.000Z').getTime() / 1000),
          metadata: { firebaseUid: 'user_2' },
          items: { data: [{ price: { id: 'price_perf_m' } }] },
        },
      },
    };

    const res = await postWebhook('good_sig');
    expect(res.status).toBe(200);
    const entitlement = getDocRaw('users/user_2/entitlements/status');
    expect(entitlement).toMatchObject({ plan: 'performance', status: 'active', cancelAtPeriodEnd: true, providerCustomerId: 'cus_2' });
  });

  it('customer.subscription.updated: falls back to looking up the uid by providerCustomerId when metadata is absent', async () => {
    seedDoc('users/user_3/entitlements/status', {
      plan: 'core', status: 'active', billingSource: 'stripe', providerCustomerId: 'cus_3',
    });
    h.nextEvent = {
      id: 'evt_3',
      type: 'customer.subscription.updated',
      data: {
        object: {
          id: 'sub_3', status: 'active', cancel_at_period_end: false, customer: 'cus_3',
          current_period_end: null, items: { data: [{ price: { id: 'price_perf_m' } }] },
        },
      },
    };

    const res = await postWebhook('good_sig');
    expect(res.status).toBe(200);
    const entitlement = getDocRaw('users/user_3/entitlements/status');
    expect(entitlement).toMatchObject({ plan: 'performance', providerSubscriptionId: 'sub_3' });
  });

  it('customer.subscription.deleted: sets status cancelled and entitlementEnd to the period end', async () => {
    h.nextEvent = {
      id: 'evt_4',
      type: 'customer.subscription.deleted',
      data: {
        object: {
          id: 'sub_4', status: 'canceled', cancel_at_period_end: true, customer: 'cus_4',
          current_period_end: Math.floor(new Date('2026-09-01T00:00:00.000Z').getTime() / 1000),
          metadata: { firebaseUid: 'user_4' },
          items: { data: [{ price: { id: 'price_core_m' } }] },
        },
      },
    };

    const res = await postWebhook('good_sig');
    expect(res.status).toBe(200);
    const entitlement = getDocRaw('users/user_4/entitlements/status');
    expect(entitlement).toMatchObject({ status: 'cancelled', renewalDate: null, entitlementEnd: '2026-09-01T00:00:00.000Z' });
  });

  it('invoice.payment_failed: flips only status to past_due via providerCustomerId lookup, leaving plan untouched', async () => {
    seedDoc('users/user_5/entitlements/status', {
      plan: 'executive', status: 'active', billingSource: 'stripe', providerCustomerId: 'cus_5',
    });
    h.nextEvent = {
      id: 'evt_5',
      type: 'invoice.payment_failed',
      data: { object: { customer: 'cus_5' } },
    };

    const res = await postWebhook('good_sig');
    expect(res.status).toBe(200);
    const entitlement = getDocRaw('users/user_5/entitlements/status');
    expect(entitlement).toMatchObject({ plan: 'executive', status: 'past_due', providerCustomerId: 'cus_5' });
  });

  it('an unrecognised price id is logged and skipped, never writing a half-formed entitlement', async () => {
    h.nextEvent = {
      id: 'evt_6',
      type: 'customer.subscription.updated',
      data: {
        object: {
          id: 'sub_6', status: 'active', cancel_at_period_end: false, customer: 'cus_6',
          current_period_end: null, metadata: { firebaseUid: 'user_6' },
          items: { data: [{ price: { id: 'price_totally_unknown' } }] },
        },
      },
    };

    const res = await postWebhook('good_sig');
    expect(res.status).toBe(200);
    expect(getDocRaw('users/user_6/entitlements/status')).toBeUndefined();
  });

  it('ignores event types outside the four this handler implements', async () => {
    h.nextEvent = { id: 'evt_7', type: 'customer.created', data: { object: {} } };
    const res = await postWebhook('good_sig');
    expect(res.status).toBe(200);
    expect(res.body.received).toBe(true);
  });
});
