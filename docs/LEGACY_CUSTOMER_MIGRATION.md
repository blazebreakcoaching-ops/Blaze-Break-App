# Legacy Premium — what it is, who it affects, what's confirmed vs. unverifiable

This document exists because the B2C multi-tier subscription revision
retired the original, single-price Free/Premium model. It answers, in one
place: what happens to an account that predates the new tier set, what's
been verified by code/tests, and what genuinely cannot be verified from
inside this codebase.

See `docs/FREE_PREMIUM_ENTITLEMENTS.md` for the full tier/capability
matrix `legacy_premium` participates in.

## The mechanism (confirmed, tested)

`entitlements.ts` originally shipped with exactly two plan values:
`'free'` and `'premium'`. Every account's `users/{uid}/entitlements/status`
document that was ever written under that model stored `plan: 'premium'`
literally, as a string, in Firestore.

The new tier model does **not** run a migration script against stored
data. Instead, `getEffectiveEntitlement()` — the one function every route
calls to interpret a stored record — coerces `plan: 'premium'` to
`'legacy_premium'` on every single read, forever:

```ts
const plan: EntitlementPlan = rawPlan === 'premium'
  ? 'legacy_premium'
  : (isEntitlementPlan(rawPlan) ? rawPlan : DEFAULT_ENTITLEMENT.plan);
```

Consequences of this design, all verified by `entitlements.test.ts` and
`entitlements.route.test.ts`:

- **No batch job ever runs, and none is needed.** A stored document is
  never rewritten by this migration; the interpretation lives entirely in
  code. This also means there is no migration to fail, roll back, or
  re-run.
- **A legacy account is never silently moved onto Core or Performance
  pricing**, and never silently loses access to a capability it already
  had — see the per-capability table in `docs/FREE_PREMIUM_ENTITLEMENTS.md`
  for the exact figures, each individually checked against the
  pre-revision committed values (not assumed) during implementation.
- **`legacy_premium` cannot be newly assigned.** `PURCHASABLE_PLANS`
  excludes it, and `validateAdminGrant()` explicitly rejects it as an
  input — confirmed by
  `entitlements.route.test.ts`'s `'rejects "legacy_premium" ..."` test. It
  is reachable *only* by the read-path coercion above. An admin who wants
  to comp a *new* account Premium-equivalent access grants `performance`.
- **`legacy_premium` sits at the same tier rank as `performance`** in
  `PLAN_TIER_ORDER`, so `isUpgrade`/`isDowngrade` comparisons (used in the
  admin grant route's audit logging) treat moving a legacy account onto
  `executive` as a real upgrade and onto `core` as a real downgrade — the
  same experience a real Performance customer would have making the same
  moves.

## What a legacy account can do, going forward

A legacy account is never required to move onto a new tier. It keeps
Premium-equivalent access indefinitely under its current billing
arrangement (see "What's unverifiable" below for the one caveat on that).
If it voluntarily upgrades to Executive, or downgrades to Core, the
`legacy_premium` plan value is simply replaced by the new one via the
normal admin-grant path (or, once a real payment provider is wired up,
via that provider's own plan-change flow) — at that point it is no longer
`legacy_premium`, it is the plan it moved to, and it never reverts.
There is no way to move an account back onto `legacy_premium` deliberately
— once left, a plan value of `'premium'` is never written again by any
code path in this system.

## What this pass could verify

- The coercion logic itself, via unit tests covering: a `plan: 'premium'`
  record reads back as `legacy_premium`; an expired legacy record still
  correctly falls back to Free via `hasPaidEntitlement`'s existing
  `entitlementEnd` check (unaffected by the plan-name change); a legacy
  record with no other fields still degrades safely to defaults for
  everything except `plan`.
- Every real, server-enforced capability's legacy-tier figure, cross-
  checked one-by-one against the actual pre-revision committed
  `entitlements.ts` (via `git show`, not memory or assumption) — this
  caught and fixed one genuine regression before it shipped (`exports`
  was briefly set to `enabled: false` for Free, a different but adjacent
  bug also relevant to this document's "never reduce access" principle —
  see the final report).

## What this pass could NOT verify (stated honestly, not guessed)

**How many real, non-admin-grant `legacy_premium` accounts exist in
production, and whether any carry a real `billingSource`
(`'stripe'`/`'apple'`/`'google'`) rather than `'admin'`.** This sandbox
has no live Firestore access — nothing in this codebase can query
production data. This matters because:

- If real `billingSource: 'stripe'`/`'apple'`/`'google'` legacy records
  exist, whoever builds the actual Stripe/Apple/Google webhook
  integration (see `docs/STRIPE_PRODUCTS.md` /
  `docs/MOBILE_SUBSCRIPTIONS.md` — neither exists yet) will need to
  confirm that provider's own product/price IDs for the old single
  Premium price still resolve sensibly against `legacy_premium`, or
  decide how a legacy customer's *renewal* event should be interpreted
  once that webhook goes live. This document does not answer that
  question — it flags that the answer needs live account data this
  pass never had.
- If every existing `legacy_premium` record turns out to have
  `billingSource: 'admin'` (i.e., every "Premium" grant to date was a
  manual comp, not a real payment), the concern above is moot — but that
  can only be confirmed with a real Firestore query against production,
  which is exactly the "do not guess payment-provider behaviour"
  instruction this pass was given.

**Recommended before any real payment integration is built:** run a
one-off, read-only `gcloud`/Firestore-console query for
`entitlements/status` documents where `plan == 'premium'`, grouped by
`billingSource`, to answer this factually before it becomes load-bearing
for a webhook design.

## Cancellation / reactivation

Unchanged mechanism from before this revision: `cancelAtPeriodEnd: true`
means the account told the provider (or an admin, on their behalf) to
stop renewing — access continues normally through `entitlementEnd`. A
legacy account cancelling behaves identically to a real Performance
customer cancelling; there is nothing legacy-specific about this flow. If
a cancelled legacy account is later reactivated by an admin, it is
reactivated onto a real plan (typically `performance`), not back onto
`legacy_premium` — see above.
