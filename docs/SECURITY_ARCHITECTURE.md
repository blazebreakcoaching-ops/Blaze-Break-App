# Security architecture — how Blaze Break is actually built to be safe

This is the map. It explains the real layers of defence in this codebase,
in the order a request actually passes through them, and points to the
document or source file that has the detail for each one. It does not
repeat what those documents already say well — see `docs/SECURITY_HARDENING.md`
for the specific fixes made in the production-hardening pass this document
was written alongside, `docs/FIREBASE_SECURITY.md` for Firestore/App Check
detail, and `docs/PRODUCT_SAFETY_PRIVACY.md` for the product-level privacy
and safety principles (the employer/org privacy firewall, Nova's behaviour
boundaries, clinical-language rules).

**A note on scope and honesty.** This document describes what is actually
built and enforced in code today, in a consumer app run by a small team.
It is not a SOC 2 / ISO 27001 control set, does not claim one, and nothing
here should be read as implying a completed third-party security audit or
penetration test has occurred — see `docs/OUTSTANDING_SECURITY_ITEMS.md`
for what genuinely hasn't happened yet.

## The non-negotiable constraint this whole codebase is built around

**Blaze Break does not compute, store, or act on a "risk score" for a
user's mental state — in any form.** No numeric risk value, no
low/medium/high band, no green/amber/red status, no "concern score," no
keyword-count-as-trigger, no inactivity-duration-as-evidence-of-crisis.
This is not a missing feature; it is a deliberate, permanent design
boundary. Guardian outreach (the one place this product does escalate to
a real human) is **user-authorised only** — see
`docs/GUARDIAN_SUPPORT_SPEC.md` — never model-inferred. Anywhere this
document or the code talks about detecting "suspicious" activity (§7), it
means deterministic, non-clinical signals only: request rate, failed-auth
count, cost per request. Never anything about what a message said or how
someone seemed to feel.

## 1. Who's making the request — authentication

Every real user starts as an **anonymous Firebase Auth session** the
moment they open the app (`src/lib/auth.tsx`), which is then optionally
upgraded in place to a real identity — Google OAuth or email/password —
via `linkWithCredential`, keeping the same UID and all their existing
data. There's no separate "guest data" that gets thrown away on sign-up.

Two ways to prove identity on subsequent requests:

- **Firebase ID token** (`Authorization: Bearer <token>`), verified
  server-side by `authenticateFirebaseUser` in `server.ts` via
  `getAuth().verifyIdToken(token, true)`. The `true` is `checkRevoked` —
  added in this hardening pass — so a password change or a 2FA disable
  (both call `revokeRefreshTokens`) immediately invalidates any token
  already in flight, not just future refreshes.
- **Opt-in TOTP two-factor** on top of that. This is a fully custom,
  app-level implementation (`totp-mfa.ts`) — Firebase's own native MFA
  needs a paid Identity Platform upgrade this project doesn't have.
  Secrets are AES-256-GCM encrypted at rest (`MFA_ENCRYPTION_KEY`),
  recovery codes are single-use and stored only as SHA-256 hashes, and
  the failed-attempt lockout counter lives in Firestore (via a real
  `runTransaction`, not a plain get-then-set) so it survives Cloud Run
  scaling to zero or running multiple instances.

**The part that actually closes the account off, not just gates the UI:**
completing 2FA at sign-in only ever set a client-side flag before this
hardening pass — any valid ID token could still call any protected API
regardless of whether *that session* had cleared the challenge. The fix
is a short-lived (12h), HMAC-signed, session-scoped token
(`X-MFA-Session-Token`), generated fresh at successful verification and
required by `authenticateFirebaseUser` on every request once an account's
`mfaEnabled` claim is set — checked server-side, never trusted from the
client. Deliberately **not** exempted: the enroll/disable routes
themselves, closing a related gap where a stolen-but-unverified token
could otherwise re-enroll a new authenticator (silently replacing the
real one) or turn 2FA off, without ever proving the existing code. Why
not a Firebase custom claim instead? A custom claim is account-level —
baked into every future token Firebase mints for that UID — so it would
let an attacker's own, independently-obtained fresh token inherit a
legitimate session's past verification. The session token is scoped to
the one session that actually did the verifying.

## 2. Is this even our app — App Check

Every state-changing/data-reading API route (155 of 157 total — the 2
exceptions are the OAuth callback redirect and the SPA static-file
fallback, both legitimately unauthenticatable) is gated behind
`verifyAppCheck`, backed by reCAPTCHA Enterprise. This is what stops a
scripted client (not a real browser running this app) from ever reaching
the API at all, before auth is even checked. Gated by `NODE_ENV` —
enforced in production, skipped in local dev (see
`docs/FIREBASE_SECURITY.md`).

## 3. What this identity is allowed to do — authorization

Two separate, deliberately non-overlapping role systems:

- **Platform admin roles** (`platform_owner`, `platform_admin`,
  `support_admin`, `content_admin`, `coach_admin`, `b2b_admin`,
  `viewer_admin`) — internal Blaze Break staff, checked by
  `requireAdmin`/`requirePlatformOwner`/`requireRole` in `server.ts`,
  each mapped to a fixed permission set by `getPermissionsForRole`. A
  last-remaining-platform-owner can never be downgraded or removed
  (`assertNotLastPlatformOwner`).
- **Organisation roles** (`owner`, `admin`, `security_admin`,
  `billing_admin`, `connector_admin`, `manager`, `member`, `viewer`) —
  Enterprise customers' own org structure, defined in `org-rbac.ts` and
  enforced per-route via `requireOrgPermission`/`requireOrgAdmin`. See
  `docs/ENTERPRISE_RBAC.md` for the full permission matrix.

Both role vocabularies are now Zod-enum-validated at every route that
sets one (see `docs/SECURITY_HARDENING.md` §"Input validation") — an
invalid/typo'd role value is rejected outright rather than silently
stored with `getPermissionsForRole`'s empty default permission set.

## 4. What data this identity can touch directly — Firestore rules

`firestore.rules` is the last line of defence for direct client SDK
access — everything server.ts's Admin SDK does bypasses these rules
entirely (Admin SDK access is trusted by design; the Express-layer auth
above is what constrains it instead). Deny-by-default: a path no rule
explicitly allows is denied. Every owner-scoped subcollection validates
field shape (`hasOnly`/`hasAll`, type/range/enum checks), not just
ownership — see `docs/FIREBASE_SECURITY.md` for the full model and what
was tightened in this pass (`anxiety_reset_events` closed to server-write-
only, `weekly_habit_cycles` given a rule at all — it had none, silently
non-functional in production — `checkins` given real field validation).

## 5. What this account is entitled to do — tier capabilities

`entitlements.ts` + `checkAndReserveCapability` in `server.ts` is the
single, server-authoritative source of truth for tier access (Free/Core/
Performance/Executive, plus the non-purchasable `legacy_premium` for
accounts that predate this tier set) and daily/monthly usage quotas per
capability (Nova text/voice/voice-minutes, diagnose, exports, resentment
analysis, executive report, manager coach, SMS nudges). The record lives
at `users/{uid}/entitlements/status`, which Firestore rules make
`allow write: if false` — only the Admin SDK ever writes it. This
replaced an earlier real bug where tier was read from a client-writable
Firestore field. See `docs/FREE_PREMIUM_ENTITLEMENTS.md`.

## 6. Rate limiting and abuse control

Every AI-model-backed route (17 `express-rate-limit` instances total)
has both a burst-protection rate limiter (IP- or UID-keyed) and, where a
real per-call cost exists, an entitlement daily quota on top — the
limiter stops a tight retry loop within a day's quota, the quota is the
actual cost ceiling. Every limiter now logs its rejections
(`logRateLimitExceeded`, added in this pass — previously silent) with
IP, UID (when known), method, and path — a deterministic signal, never
anything about message content. See `docs/SECURITY_HARDENING.md`.

The SSO metadata-URL "test configuration" reachability check
(`POST /api/org/:orgId/sso/test`) resolves the target hostname and
refuses to fetch if the resolved IP is private/loopback/link-local/
cloud-metadata (`isBlockedIpAddress` in `sso-config.ts`), closing a blind
SSRF path an org admin could otherwise use to probe internal
infrastructure.

## 7. Deterministic abuse signals, not inferred mental state

Per the non-negotiable constraint above, "suspicious activity" detection
in this codebase is built entirely on things that are actually
measurable and non-clinical:

- Failed authentication/TOTP attempts and lockout state (`[MFA] Failed
  verification attempt...`, `verifyMfaAttempt` in `server.ts`).
- Rate-limit rejections (§6).
- Per-capability daily usage against quota (§5).
- Cost-per-request tracking (`cost-usage.route.test.ts`,
  `docs/AI_COST_CONTROL.md`).

None of these ever read message content, sentiment, or engagement
patterns as evidence of a person's state. Guardian's own escalation
trigger is covered separately and explicitly in
`docs/GUARDIAN_SUPPORT_SPEC.md` — do not touch that trigger model without
re-reading this constraint first.

## 8. Encryption at rest

Two AES-256-GCM-encrypted secrets, both app-level (not delegated to a
KMS), both deriving their key via SHA-256 from an operator-supplied env
var so a hand-generated exact-length key isn't required:

- TOTP secrets (`totp-mfa.ts`, key: `MFA_ENCRYPTION_KEY`).
- Inline Enterprise SSO client secrets (`sso-config.ts`, key:
  `SSO_CONFIG_ENCRYPTION_KEY`) — an org can instead use `secretRef` to
  point at a secret stored elsewhere, in which case this backend never
  sees the plaintext at all.

## 9. Data subject rights — export and erasure

`GET /api/user/export` and `POST /api/user/delete-account` walk every
subcollection under `users/{uid}` (via `listCollections`/
`recursiveDelete`) plus a hand-maintained registry of top-level
collections keyed by a `userId` *field* rather than nested under the
user doc (`user-data-collections.ts`) — those are invisible to the
subcollection walk otherwise. A guardrail test statically scans
`server.ts` for both query-based (`.where('userId', ...)`) and
write-based (`.add()`/`.set()` with a `userId` field) collection usage
and fails if either finds one not classified in that registry — this is
what caught `feedback_submissions` (write-only, never queried by
`userId`) as a real, previously-missed gap in this pass. See
`docs/DATA_POLICY.md` and `docs/DATA_RETENTION.md`.

## 10. Where to go from here

| Question | Document |
|---|---|
| Exact Firestore/App Check rule detail | `docs/FIREBASE_SECURITY.md` |
| What was fixed in this hardening pass, and why | `docs/SECURITY_HARDENING.md` |
| What happens if something goes wrong | `docs/INCIDENT_RESPONSE.md` |
| How long data is kept, and the retention options still needing a decision | `docs/DATA_RETENTION.md` |
| Backup/recovery posture | `docs/BACKUP_AND_RECOVERY.md` |
| Third-party processors this app sends data to | `docs/VENDOR_REGISTER.md` |
| What automated tests actually cover, security-wise | `docs/SECURITY_TESTING.md` |
| Real, still-open items (not yet done) | `docs/OUTSTANDING_SECURITY_ITEMS.md` |
| Manual console/IAM actions a human must still perform | `docs/MANUAL_SECURITY_ACTIONS.md` |
| Org roles/permission matrix | `docs/ENTERPRISE_RBAC.md` |
| Product-level privacy/safety principles | `docs/PRODUCT_SAFETY_PRIVACY.md` |
| Guardian's user-authorised-only escalation model | `docs/GUARDIAN_SUPPORT_SPEC.md` |
| Deploy checklist, IAM roles, secrets | `docs/DEPLOY.md` |
