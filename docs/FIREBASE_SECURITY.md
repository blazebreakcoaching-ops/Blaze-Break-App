# Firebase security — Auth, App Check, Firestore rules, Storage

The Firebase-specific detail behind `docs/SECURITY_ARCHITECTURE.md`'s
overview. This project uses Firestore (Enterprise edition — see
`docs/DEPLOY.md` §4 for the operational quirks that come with that),
Firebase Auth, and Firebase App Check. **Firebase Storage is not used
anywhere in this codebase** — no `getStorage`/`uploadBytes` call exists
in `src/` or `server.ts` — so there is no `storage.rules` file and none
is needed; if a future feature adds file uploads, it needs its own rules
file and its own review, not an assumption that this document already
covers it.

## Authentication

- Every visitor is signed in anonymously on first load
  (`signInAnonymously`, `src/lib/auth.tsx`), then optionally upgraded in
  place to Google OAuth or email/password via `linkWithCredential` —
  same UID throughout, so no data is orphaned by "signing up."
  `auth/credential-already-in-use`/`auth/email-already-in-use` are
  handled by falling back to signing into the real pre-existing account
  instead (the anonymous session's data is abandoned in that specific
  case — correct, since the collision proves it was never really that
  person's identity to keep).
- Firebase Admin SDK is initialized via **Application Default
  Credentials only** — confirmed repo-wide, no service-account JSON file
  anywhere. On Cloud Run this is the attached runtime service account;
  see `docs/DEPLOY.md` §3 for its required IAM roles.
- `authenticateFirebaseUser` (`server.ts`) verifies every ID token with
  `checkRevoked: true`, and additionally checks the session-scoped MFA
  gate described in `docs/SECURITY_ARCHITECTURE.md` §1 for accounts with
  2FA enabled.
- Password reset and email verification links are generated server-side
  via the Admin SDK (`generatePasswordResetLink`/
  `generateEmailVerificationLink`) and sent through this app's own Brevo
  integration — never Firebase's default mailer, and never pointing at a
  Firebase-hosted action page (an in-app `AuthActionPage.tsx` handles the
  continue URL instead). This requires
  `roles/iam.serviceAccountTokenCreator` self-bound on the runtime
  service account (see `docs/DEPLOY.md` §3) — without it, the feature
  fails loudly (a distinct logged line), not silently.
- No account-enumeration via the password-reset-request endpoint: the
  response body is byte-for-byte identical whether the email has an
  account or not, and (fixed in this hardening pass) the response no
  longer waits on the actual link-generation/email-send before replying,
  closing a timing side-channel that previously leaked the same signal
  via response latency.

## App Check

`verifyAppCheck` (`server.ts`) gates 155 of 157 total API routes —
the two exceptions are the OAuth callback redirect (which by definition
runs before any client-side App Check token can be attached) and the SPA
static-file fallback (serves `index.html`; no data access). Backed by
reCAPTCHA Enterprise (`VITE_RECAPTCHA_ENTERPRISE_SITE_KEY`). Enforcement
is gated on `process.env.NODE_ENV === "production"` — deliberately
**not** on any header-based bypass string, since a fixed bypass string
would be visible in the shipped client bundle to anyone who opens
devtools, and would work in real production too. Local dev and CI both
run with `NODE_ENV` unset/`test`, so App Check is skipped there by
design, not by accident.

## Firestore security rules

`firestore.rules` is genuinely deny-by-default: Firestore denies any
path no rule explicitly allows. The file's own top-level
`match /{document=**} { allow read, write: if false; }` block is
**inert** — Firestore evaluates rules with OR semantics, so a blanket
`if false` can never override a more specific `allow` rule below it. It
exists only as a documented statement of intent (see the comment right
above it in the file); the real deny-by-default guarantee is Firestore's
own unmatched-path behaviour, not this block.

Two structural regions:

1. **`match /users/{uid}/...`** — every subcollection under a user's own
   document (mood pulses, check-ins, goals, energy budgets, nova
   memories, etc.). The consistent pattern per subcollection:
   `allow read: if isOwner(uid)`, then `create`/`update` gated by
   `isOwner(uid)` **and** `hasOnly([...])`/`hasAll([...])` field
   allowlisting plus type/range/enum checks on every field — not just an
   ownership check. `checkCreatedAtUnchanged()` prevents backdating a
   record through a later update. A handful of subcollections are
   server-write-only (`allow write: if false`) where the Admin SDK is the
   only legitimate writer — `entitlements/status`, `usage_counters`,
   `security/mfa_totp`, `derived/*` summaries.
2. **Top-level collections** (`public_feature_flags`, `audit_logs`,
   `anxiety_reset_events`, `admin_users`, `admin_audit_logs`,
   `app_config`) — each gets its own `match` block at the top of the
   file. Notably, **`organisations` has no rule at all** — every org
   document and its subcollections (members, connectors, devices, etc.)
   are accessed exclusively through the Admin SDK in `server.ts`, with
   Enterprise RBAC (`org-rbac.ts`) enforced entirely in application code,
   not in these rules. `feedback_submissions` is the same shape: written
   only via the Admin SDK, read back only via the admin dashboard route
   — no client rule needed or present.

**A structural blind spot worth knowing if you add a new top-level
collection:** a collection queried by a `userId` field (rather than
nested under `users/{uid}`) is invisible to the GDPR export/erasure
endpoints' `listCollections()`/`recursiveDelete()` walk unless it's
explicitly registered in `user-data-collections.ts`. That file's own
guardrail test statically scans `server.ts` for both query-based
(`.where('userId', ...)`) and write-based (`.add()`/`.set()` with a
`userId` field) usage and fails the build if either finds an
unclassified collection — see `docs/SECURITY_ARCHITECTURE.md` §9 and
`docs/SECURITY_TESTING.md`.

### What changed in the hardening pass

- `anxiety_reset_events` was client-writable (`create`/`update`/`delete`)
  with **zero field validation** — any shape/type from a signed-in owner
  was accepted. The only real writer is the App-Check-and-Zod-validated
  `POST /api/anxiety-reset`, and no client code touches this collection
  directly, so it's now server-write-only (`allow write: if false`),
  matching `audit_logs`'s pattern, rather than validation being bolted
  onto an unused write path.
- `weekly_habit_cycles` had **no rule at all** — a real production bug,
  since Firestore's deny-by-default silently failed every read/write
  `WeeklyGoalTracker.tsx` made. Now has a schema-validated rule matching
  the standard per-subcollection pattern.
- `checkins` allowed `create, update: if isOwner(uid)` with no field
  validation, unlike every sibling subcollection. Now validates the four
  0-10 sliders, optional note, and fixed `source` value against exactly
  what `ConnectedDailyCheckIn.tsx` writes.

### Testing rules changes

`test-rules.cjs` runs `assertFails`/`assertSucceeds` scenarios against
the real rules engine via `@firebase/rules-unit-testing` and the Firebase
emulator suite — it requires a running emulator
(`firebase emulators:start` or equivalent) and is **not** part of the
automated `npm run test` (vitest) suite or CI; it's a manual verification
tool. All three rule changes above have matching test cases added to it.
Everything else touching Firestore data shape/access in the automated
suite goes through `test/fake-firestore.ts`, an in-memory stand-in that
does not enforce `firestore.rules` at all — see `docs/SECURITY_TESTING.md`
for the distinction between what the automated suite proves and what
only `test-rules.cjs` (manually, against a real emulator) proves.

## Storage

Not used. No `storage.rules` file exists, and none is needed today.
