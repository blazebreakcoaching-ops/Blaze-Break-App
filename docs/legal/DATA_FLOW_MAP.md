# Data flow map

Companion to `DATA_INVENTORY.md`. Shows where data actually moves, not
where it theoretically could. Every arrow below is backed by a real code
path cited in the inventory or `docs/VENDOR_REGISTER.md`.

## 1. Consumer (B2C) user — everyday use

```
USER (browser / PWA)
  │
  │  HTTPS, Firebase App Check token on every request
  ▼
Blaze Break client (React SPA)
  │
  ├──► Firebase Authentication ──► identity/session (Google-managed)
  │
  ├──► Firestore (direct client SDK reads, rules-gated to the user's
  │     own uid — e.g. checkins, mood_pulses, nova_memories the user
  │     owns) ──► same data read back to render the UI
  │
  └──► Blaze Break server (Cloud Run, "server.ts")
          │  verifies Firebase ID token + App Check token on every route
          │
          ├──► Firestore (server-side writes: entitlements, derived
          │     summaries, audit logs, anything requiring server-only
          │     trust)
          │
          ├──► Gemini / Vertex / Claude (Nova chat, voice, diagnose
          │     narrative, voice-journal, resentment analysis) ──►
          │     AI-generated response ──► back to user, and in some
          │     cases (voice-journal, resentment analysis, Nova memory)
          │     the exchange or a derived summary is written to Firestore
          │
          ├──► Brevo (password reset, verification, security notice,
          │     support-request-received emails) ──► email delivered to
          │     the user's own inbox
          │
          ├──► Twilio (Guardian alert SMS, opt-in ally nudges) ──►
          │     SMS delivered to a phone number the user themselves
          │     configured (their own guardian contact)
          │
          └──► Web Push service (browser-vendor-operated, e.g. Google's
                FCM relay for Chrome) ──► push notification delivered to
                the user's own subscribed browser
```

**Nothing in this flow reaches an organisation or employer** unless the
user's account happens to also hold organisation membership — see §3.

## 2. Organisation (B2B) — licence/account provisioning

```
ORGANISATION ADMIN
  │
  │  invites/provisions a licence (email address only)
  ▼
Blaze Break server
  │
  ├──► Firestore: organisations/{orgId}/members/{uid} created
  │     (role, orgId, invitedBy, timestamps — administrative record only)
  │
  └──► Brevo: invitation email sent to the employee's email address
```

This flow carries **only** the administrative facts needed to provision
access (an email address, an assigned role, licence metadata). It never
touches, and has no code path to reach, anything in §1 or §3 below.

## 3. Employee private wellbeing data — the firewall

```
EMPLOYEE (using Blaze Break, possibly via an org-sponsored licence)
  │
  │  same flow as §1 — check-ins, Nova conversations, journals,
  │  assessments, Energy Budget, recovery plans, personal reflections
  ▼
Blaze Break private environment (users/{uid}/... in Firestore)
  │
  │  🛑 NO DIRECT PATH FROM HERE TO ANY /api/org/... OR /api/admin/...
  │     ROUTE THAT SERVES AN EMPLOYER-FACING VIEW.
  │
  │  Confirmed by `docs/PRODUCT_SAFETY_PRIVACY.md` §5: every
  │  wellbeing-adjacent org route was individually checked and found to
  │  expose aggregate-only output. One platform-internal exception exists
  │  (`GET /api/admin/users/:uid`, Blaze Break's own staff, not an
  │  employer) — flagged there as worth hardening, unused by any current
  │  frontend.
  ▼
Stays entirely inside the employee's own account.
Visible to: the employee themselves, and Blaze Break's own systems
(server-side, for the purpose of running the product).
```

## 4. Approved aggregate data — organisation analytics

```
EMPLOYEE (consenting, i.e. has not opted out of org analytics —
see docs/DATA_POLICY.md for the org-level policy surface, and
docs/ENTERPRISE_RBAC.md for member-level participation)
  │
  │  raw signals (check-in counts, energy scores, connected-integration
  │  activity — never raw text) feed a server-side aggregation step
  ▼
Server-computed aggregate (organisations/{orgId}/derived/*)
  │
  │  🛑 GATE: k-anonymity minimum-cohort threshold (floor of 3, default
  │     configurable to 5 — org.privacyThreshold). A cohort below
  │     threshold is suppressed, not shown, not even as "too small to
  │     display" if that itself would leak information in combination
  │     with other releases (see the differencing-attack fix in
  │     docs/PRODUCT_SAFETY_PRIVACY.md §5 — team-and-complement must
  │     BOTH clear the threshold).
  ▼
ORGANISATION ADMIN / MANAGER / HR VIEWER
  (role-gated per docs/ENTERPRISE_RBAC.md — sees only aggregate
  participation/trend figures, never a named individual's content)
```

## 5. Enterprise OAuth integrations (Slack/Jira/Asana/Calendly/Monday.com)

```
INDIVIDUAL EMPLOYEE (per-user opt-in connect, not org-initiated)
  │
  │  OAuth token exchange, HMAC-signed state param
  ▼
Blaze Break server
  │
  ├──► Provider API (read-only workload/activity signal pull)
  │
  ├──► Firestore: users/{uid}/integration_tokens (per-user, not
  │     org-keyed — the connecting individual controls revocation)
  │
  └──► feeds into §4's aggregation step ONLY, gated by the same
        k-anonymity threshold before any org-facing figure is shown
```

## 6. Account deletion

```
USER clicks "Delete My Account"
  │
  ▼
POST /api/user/delete-account
  │
  ├──► users/{uid} document + every subcollection beneath it
  │     (recursiveDelete) — erased
  │
  ├──► STRAY_USER_COLLECTIONS with eraseOnDeletion: true
  │     (anxiety_reset_events, feedback_submissions) — erased
  │
  ├──► audit_logs — KEPT (eraseOnDeletion: false, compliance trail
  │     exception — see docs/DATA_RETENTION.md)
  │
  ├──► organisations/{orgId}/members/{uid} — membership removed
  │     (the organisation's own aggregate history is NOT retroactively
  │     recomputed to remove this person's past contribution — LEGAL
  │     REVIEW REQUIRED / OWNER INPUT REQUIRED: decide and document
  │     whether this is acceptable or needs a stated exception)
  │
  └──► Data already sent to a third party before deletion (a Gemini
        prompt already processed, an email already delivered by Brevo,
        an SMS already delivered by Twilio) is OUTSIDE Blaze Break's
        technical control from that point on — see docs/DATA_POLICY.md.
        This must be stated plainly in the Privacy Notice, not implied
        away.
```

## 7. Data export

```
USER clicks "Download My Data"
  │
  ▼
GET /api/user/export
  │
  ├──► users/{uid} document + every subcollection (listCollections)
  │
  ├──► STRAY_USER_COLLECTIONS with exportOnRequest: true (all three:
  │     anxiety_reset_events, feedback_submissions, audit_logs)
  │
  └──► returned to the authenticated user only — LEGAL REVIEW REQUIRED /
        engineering confirmation still needed on the exact transport
        (streamed JSON response vs. a downloadable file with an expiry)
        before this can be described precisely in the Privacy Notice —
        see PASS 8/9 implementation work.
```

## What this map deliberately does not show

- Sub-processors of Blaze Break's own vendors (e.g. what cloud Brevo or
  Twilio themselves run on) — out of scope, each vendor's own published
  sub-processor list covers that; referenced in `SUBPROCESSOR_REGISTER.md`.
- Any payment flow — none exists (`docs/STRIPE_PRODUCTS.md`,
  `docs/MOBILE_SUBSCRIPTIONS.md`).
- Any analytics/tracking flow — none exists
  (`docs/VENDOR_REGISTER.md` confirms no such SDK is present).
