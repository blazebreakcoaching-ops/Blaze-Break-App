# Security hardening pass — what changed and why

This documents the specific fixes made during the production-security
hardening pass this file was written alongside (branch `claude/zen-brown-
ccp9tb`). It's a changelog with reasoning, not a general architecture
doc — see `docs/SECURITY_ARCHITECTURE.md` for the overview these fixes
sit inside. Each entry names the real file(s) changed and the actual
risk closed; nothing here is aspirational or planned-but-not-done (see
`docs/OUTSTANDING_SECURITY_ITEMS.md` for that list instead).

Audited but found **already correct, no change made**: App Check
coverage (155/157 routes, 2 legitimately exempt), CORS exact-origin
allowlisting, the k-anonymity/cohort-size gates on every org-aggregate
route, Guardian's user-authorised-only escalation trigger (untouched —
see the constraint in `docs/SECURITY_ARCHITECTURE.md`), Helmet's CSP/
HSTS configuration, and the entitlements model's server-authoritative
design. These are noted so it's clear they were checked, not skipped.

## Critical

**Server-side MFA session enforcement.** Completing 2FA at sign-in only
ever set a client-side flag — any valid Firebase ID token, whether or
not that session had cleared its 2FA challenge, could call any protected
API. Fixed with a session-scoped, HMAC-signed token
(`X-MFA-Session-Token`, 12h TTL, derived from `MFA_ENCRYPTION_KEY`) that
`authenticateFirebaseUser` now requires once an account's `mfaEnabled`
claim is set, exempting only `mfa/status` and `verify-at-signin`
themselves. Deliberately not exempting enroll/disable closes a related
gap: a stolen-but-unverified token could otherwise silently re-enroll a
new authenticator or disable 2FA without ever proving the existing code.
Files: `server.ts`, `src/lib/mfa-session.ts` (new), `src/lib/auth.tsx`,
`src/lib/secure-api.ts`, `src/components/SecuritySettingsView.tsx`.

## High

**Session revocation on password change / 2FA disable.**
`authenticateFirebaseUser` now calls `verifyIdToken(token, true)`
(`checkRevoked`), and disabling 2FA now calls `revokeRefreshTokens` —
together these mean a password change or 2FA disable immediately
invalidates tokens already in flight, not just future refreshes. Since
disabling 2FA revokes the caller's own session too, `SecuritySettingsView.tsx`
now explicitly signs the user out with an explanation afterward, rather
than leaving the app running on a session about to start failing every
request. File: `server.ts`, `src/components/SecuritySettingsView.tsx`.

**Unmetered AI endpoints.** Three routes performed a real Gemini
generation per request with no rate limiter and no entitlement quota at
all: `POST /api/nova/resentment-analysis`, `GET /api/signals/executive-
report`, and (rate limiter only — it already had a quota)
`GET /api/org/:orgId/manager-coach`. Added matching rate limiters and two
new capability entries (`resentment_analysis`, `executive_report`,
mirroring `diagnose`'s Free/Premium limits). Files: `server.ts`,
`entitlements.ts`.

## Medium

**Timing side-channel on password-reset-request.** The response body was
already identical for a real vs. non-existent email, but the request
awaited link generation and the Brevo send before responding — a real
account took a measurably longer round trip than an instant
`auth/user-not-found`, leaking the same enumeration signal via latency
instead of content. Fixed by firing the send without awaiting it before
responding. File: `server.ts`.

**`feedback_submissions` missing from GDPR export/erasure.** Written with
a `userId` field but only ever read back by `orderBy("createdAt")` (the
admin dashboard), never queried by `.where('userId', ...)` — invisible to
the existing registry guardrail, which only scanned for `userId`
queries. Added to `STRAY_USER_COLLECTIONS`; the guardrail test itself was
hardened with a second scanner that also catches write-only `userId`-
keyed collections, so the same class of gap can't recur silently. Files:
`user-data-collections.ts`, `user-data-collections.test.ts`.

**`anxiety_reset_events` had no field validation.** The Firestore rule
allowed a signed-in client to create/update/delete directly via the SDK
with zero schema validation — any field, including a fabricated
`safetyLevel`, could be written. No client code anywhere actually does
this (the only real writer is the App-Check-and-Zod-validated
`POST /api/anxiety-reset`); closed by locking the collection to
server-write-only rather than bolting validation onto an unused write
path. File: `firestore.rules`.

**`weekly_habit_cycles` had no Firestore rule at all.** A real production
bug, not just a security gap: Firestore denies by default on any path no
rule matches, so every read/write `WeeklyGoalTracker.tsx` made was
silently failing — the "7-Day Recovery Cycle" feature looked fully built
but never actually worked for a real user. Added a schema-validated rule
matching the codebase's existing per-subcollection pattern. File:
`firestore.rules`.

**`checkins` had no field validation.** Same shape as the
`anxiety_reset_events` finding above, but for a still-actively-writable
collection: `allow create, update: if isOwner(uid)` accepted any
shape/type. Added `hasOnly`/`hasAll`/type/range validation matching
exactly what `ConnectedDailyCheckIn.tsx` writes. File: `firestore.rules`.

**Two AI-backed routes had a quota but no rate limiter, or neither.**
`GET /api/signals/executive-report` had neither; `GET /api/org/:orgId/
manager-coach` had a quota but no burst-protection limiter, unlike every
other AI-backed route. Added matching limiters (covered above, under
Unmetered AI endpoints). File: `server.ts`.

**Blind SSRF in the SSO metadata-URL reachability check.**
`POST /api/org/:orgId/sso/test` fetched `config.metadataUrl` with only
its `https://` scheme validated at save time — an org admin (org-scoped
`org.sso.manage`, not platform-level) could point it at an internal
service or a cloud metadata endpoint (`169.254.169.254`) and read the
reachable/unreachable response as a probe. Fixed with `isBlockedIpAddress`
(pure, tested — loopback/RFC1918/link-local/CGNAT/IPv6 equivalents):
`server.ts` resolves the hostname via `dns.lookup` and refuses to fetch
if any resolved address is blocked, folded into the same generic `false`
result as any other failure so the check itself can't become a
distinguishing oracle. Files: `sso-config.ts`, `server.ts`.

**Unvalidated `role` field on 3 admin routes.** `POST /api/admin/admin-
users`, `POST /api/admin/admin-users/:uid/role`, and `POST /api/admin/
users/:uid/role` all took `role` straight from the request body — an
invalid value would still set `admin: true` and create/update an
`admin_users` doc, just with `getPermissionsForRole`'s empty default
permission set. Added two Zod enums (the narrower admin-panel role set,
and the full app-level `AuthRole` union) and route-level validation.
File: `server.ts`. Also: these three routes plus `DELETE /api/admin/
admin-users/:uid` had zero test coverage before this pass — see
`docs/SECURITY_TESTING.md`.

## Logging

**Failed TOTP/recovery-code attempts were never logged.** Added inside
the (now-transactional — see below) `verifyMfaAttempt`: attempt count
and lockout state only, never the code guessed or any inference about
the person. File: `server.ts`.

**Rate-limit 429 rejections were never logged, on any of the 17
limiters.** `express-rate-limit` doesn't log a rejection on its own, and
none of this file's limiters defined a custom `handler`. Added
`logRateLimitExceeded(name)`, wired into every limiter — logs limiter
name, IP, UID (when known), method, path; sends the identical response
the built-in handling already produced. File: `server.ts`.

## Other

**Permissions-Policy header was entirely missing.** Helmet, as
configured/versioned here, doesn't ship a `permissionsPolicy` middleware.
Added directly: `microphone=(self)` and `clipboard-write=(self)` for the
features this app genuinely uses (Nova Live Voice, Daily Voice Journal,
the many copy buttons), everything else powerful explicitly denied
rather than left to each browser's default. File: `server.ts`.

**`orgId` was trusted from the client with no server-side validation.**
Used directly as a Firestore document ID in `POST /api/admin/orgs`; the
client already sanitizes it (`AdminDashboard.tsx`), but the server
trusted that entirely for a caller that bypasses the UI. Added a Zod
pattern matching the client's own sanitization. File: `server.ts`.

**`MFA_ENCRYPTION_KEY` was undocumented.** Required before any user can
enable 2FA, but missing from `.env.example`. Added, alongside a
pre-existing `SSO_CONFIG_ENCRYPTION_KEY` gap in `docs/DEPLOY.md`'s
secrets checklist (also fixed). Files: `.env.example`, `docs/DEPLOY.md`.

**Inconsistent error logging in the Nova Live WebSocket relay.** Three
call sites logged a raw `Error` object instead of `.message`, unlike
every other error log in this file. Made consistent. File: `server.ts`.

**Non-atomic MFA lockout counter.** `verifyMfaAttempt`'s failed-attempt/
lockout counter used a plain `get()`-then-later-`set()` pattern — two
concurrent attempts could both read the same count before either write
landed, slipping past the lockout threshold. Converted to a real
`db.runTransaction`. Required adding `runTransaction` support to the
in-memory Firestore test double (`test/fake-firestore.ts`), which didn't
have it. File: `server.ts`, `test/fake-firestore.ts`.

## Verification

Every change above was verified with the same bar held throughout this
project: `npx tsc --noEmit`, `npx eslint . --config eslint.cleanup.config.js
--ignore-pattern app/`, the full `npm run test` suite, and a real
production build (`npm run build`) — all passing (792 tests, 59 files, at
the end of this pass) before each commit. New/updated tests accompany
every fix; see `docs/SECURITY_TESTING.md` for what the suite as a whole
covers.
