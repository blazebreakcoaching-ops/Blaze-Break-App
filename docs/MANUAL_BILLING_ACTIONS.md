# Manual billing actions — what a human does today, with no live payment provider

There is no live Stripe/Apple/Google integration (see
`docs/FREE_PREMIUM_ENTITLEMENTS.md`, `docs/STRIPE_PRODUCTS.md`,
`docs/MOBILE_SUBSCRIPTIONS.md`). Until one exists, every subscription
change — granting, upgrading, downgrading, cancelling, comping — is a
manual admin action. This is the checklist form of that: what a
platform admin actually does, and what each action does and does not do
to a real customer's access.

All actions below use `POST /api/admin/users/:uid/entitlement`,
`requireAdmin`-gated (see `server.ts`). There is no admin UI for this yet
— it's called directly (e.g. via an authenticated request from the Admin
Dashboard's existing tooling, or `curl` with a valid admin session token
during support triage). `billingSource` is always forced to `'admin'`
server-side regardless of what's sent — this cannot be used to fabricate
a fake Stripe/Apple/Google record.

## Granting a new subscription (beta tester, support comp, manual sale)

```
POST /api/admin/users/:uid/entitlement
{ "plan": "core" | "performance" | "executive", "status": "active", "durationDays": <optional> }
```

- `plan` must be one of the three purchasable paid tiers. `free` is also
  accepted (see "Downgrading to Free" below). `legacy_premium` is
  **rejected** — it is never an admin-assignable value, only a read-path
  outcome for pre-existing accounts (see
  `docs/LEGACY_CUSTOMER_MIGRATION.md`).
- Omit `durationDays` for no fixed end (the grant simply continues until
  an admin changes it again). Set it (1–3650) for a time-boxed comp, e.g.
  a 30-day trial extension — `entitlementEnd` is computed from `now +
  durationDays` at grant time.
- The response/audit log now records whether this was an upgrade,
  downgrade, or lateral move relative to the account's previous effective
  plan, for support-history clarity.

## Upgrading or downgrading an existing subscription

Same route, same shape — there is no separate "upgrade" endpoint. Send
the new `plan`; the existing record is merged (Firestore `set` with
`merge: true`), so an existing platform-admin `role` field on the same
document is preserved, not clobbered.

**Do not silently move a legacy customer onto Core pricing, and do not
silently reduce anyone's access** — per the product brief's explicit
instruction. If a legacy (`legacy_premium`) customer is being moved to a
new plan, confirm with the customer/support ticket first; this route
doesn't distinguish "customer asked for this" from "admin decided this,"
so that judgment call stays human.

## Cancelling (access continues to period end)

There is no dedicated cancel action yet — set `cancelAtPeriodEnd: true`
directly via the same merge semantics once that's exposed through this
route (not yet wired as an accepted input field; today, cancelling a
manual admin grant in practice means setting `entitlementEnd` to the
intended access-end date via a fresh grant call with the appropriate
`durationDays`, or setting `status: 'cancelled'` directly for an
immediate stop — see below).

## Immediate access removal (fraud, chargebacks, policy violation)

```
POST /api/admin/users/:uid/entitlement
{ "plan": "free", "status": "active" }
```

Setting `plan: "free"` ends paid access immediately — `effectivePlan()`
will return `'free'` on the very next request. This is the correct action
for an immediate stop (as opposed to "let it run out at period end,"
which isn't yet a distinct exposed action — see above).

## Downgrading to Free

Same as immediate access removal above — there's no different mechanic
for "customer chose to downgrade" vs. "admin is removing access"; both
are `plan: "free"`. If there's a support-facing reason to distinguish
them later (e.g. different customer-facing copy on next login), that's a
product decision for a future pass, not something this route currently
tracks.

## Checking what an account currently has

`GET /api/entitlements/me` (as the account itself, or via impersonation
tooling if one exists) returns the effective plan, status,
`cancelAtPeriodEnd`, and full capability/usage breakdown. There is no
separate admin "look up any user's entitlement" read route today —
support triage reads the same `users/{uid}/entitlements/status` Firestore
document directly via the Firebase Console or `gcloud`/Admin SDK tooling,
consistent with how every other per-user record is inspected for support
in this codebase today.

## What this document does not cover

Real payment-provider actions (issuing a Stripe refund, cancelling an
Apple/Google subscription from that store's own dashboard) happen in that
provider's own console once a provider is live — this document only
covers the Blaze Break-side entitlement record, which today is entirely
manual regardless of provider. See `docs/STRIPE_PRODUCTS.md` and
`docs/MOBILE_SUBSCRIPTIONS.md` for what changes once a real provider
exists (at that point, most of the actions above become automatic via
webhook, and this manual route becomes the fallback/support-override path
rather than the only path).
