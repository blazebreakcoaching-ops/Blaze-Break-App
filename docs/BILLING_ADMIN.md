# Enterprise central billing & administration

Part of the Blaze Break Enterprise backend foundation (depends on the role
system in `docs/ENTERPRISE_RBAC.md`).

## Say this plainly: there is no real payment provider wired up

This codebase's `package.json` has no Stripe SDK, no billing SDK of any
kind, and no code anywhere that actually charges a card or creates a
subscription. `billing-adapter.ts` defines a `BillingProvider` interface
and ships exactly one implementation: `NullBillingProvider`, which reports
back whatever seat count is already stored on the org and does nothing
else. No route in this codebase should ever be described to a customer as
"processing a real payment" — none of them do.

What this chunk *does* provide is real: a billing-state model, RBAC-gated
routes to view and change it, and — the part with actual teeth — seat-limit
enforcement on org invites, so a plan's seat count is a genuine constraint
today, not just a number that gets displayed and ignored.

## Data model

`billing` is a plain map field inline on `organisations/{orgId}`, same
precedent as `privacyThreshold` and `dataPolicy`:

| Field | Default | Meaning |
|---|---|---|
| `plan` | `free` | One of `free`, `starter`, `business`, `enterprise`. |
| `status` | `active` | One of `active`, `trialing`, `past_due`, `canceled`. |
| `seatCount` | `5` | The seat allowance this org's plan grants. |
| `billingContact` | `null` | An email address, or `null`. |
| `providerCustomerId` | `null` | Set only by a real provider integration — never accepted from a client request. |
| `providerSubscriptionId` | `null` | Same. |

`getEffectiveBillingState(stored)` is the single source of truth, same
pattern as `getEffectiveDataPolicy` — a missing or malformed field falls
back to its safe default rather than being trusted as-is.

## Routes

- `GET /api/org/:orgId/billing` — `org.billing.view` (owner, admin,
  billing_admin, and viewer, per `org-rbac.ts`).
- `POST /api/org/:orgId/billing` — `org.billing.manage` (owner, admin,
  billing_admin only — explicitly **not** connector_admin or
  security_admin, tested directly as a two-way RBAC boundary in
  `org-billing.route.test.ts`). The full state is required on every write,
  same "no partial updates" reasoning as the data policy. Any
  `providerCustomerId`/`providerSubscriptionId` sent in the request body is
  silently ignored and the existing stored value is carried over — those
  fields exist for a future real integration to reconcile its own state
  into, not for an admin to type in by hand.

## Seat-limit enforcement

`POST /api/org/:orgId/invite` (the existing invite-by-email route, which
writes to the existing `pending_invites` subcollection) now calls
`checkSeatLimit` before sending anything: active member count
(`org.memberUids.length`) plus already-pending invites plus the new invite
batch, checked against `billingProvider.getSeatAllowance(...)`. If the
batch would exceed the org's seat allowance, the whole request is rejected
with a 400 and **no emails are sent and nothing is written** — this is
enforced before the loop that calls `sendBrevoEmail`, not after.

Raising `seatCount` via the billing route immediately unblocks previously
rejected invites — verified directly in
`org-billing.route.test.ts`.

## What wiring a real provider would require

1. Choose a provider (Stripe is the obvious default for this stack, but
   this interface doesn't assume it).
2. Implement `BillingProvider` for real: `getSeatAllowance` should look up
   the actual subscription rather than echoing the stored value, and the
   provider would additionally need webhook handling to keep `status` and
   `providerSubscriptionId` in sync with what actually happened on the
   provider's side.
3. Swap `export const billingProvider: BillingProvider = new
   NullBillingProvider();` for the real implementation — nothing else in
   this codebase needs to change, since every route already goes through
   the `BillingProvider` interface, not `NullBillingProvider` directly.
4. Decide how `POST /api/org/:orgId/billing`'s plan/seatCount write
   interacts with a real subscription change (e.g. should changing the
   plan here also call the provider, or should the provider's webhook be
   the only writer of `plan`/`seatCount` once wired up?) — a real product
   decision this plan defers, not one this backend foundation makes for
   you.

## Data lifecycle

`billing` is a plain field on the existing `organisations/{orgId}`
document, not a separate collection — no entry needed in
`user-data-collections.ts`.

## Testing

- `billing-adapter.test.ts` — pure unit tests: safe defaults, validation
  bounds, `checkSeatLimit`'s at-limit/over-limit/pending-invites-count
  behavior, and `NullBillingProvider`'s honest echo-back.
- `org-billing.route.test.ts` — RBAC (member/viewer blocked from writing;
  billing_admin/admin/owner allowed; the two-way boundary showing
  billing_admin cannot manage connectors or the data policy, and vice
  versa), provider-field lockdown, seat-limit enforcement blocking and
  then unblocking an invite after a plan change, and audit-log
  correctness.
