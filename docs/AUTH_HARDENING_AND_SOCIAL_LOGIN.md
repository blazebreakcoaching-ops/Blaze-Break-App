# Sign-in hardening & social auth expansion

Technical record of the auth-hardening pass that added real password
strength requirements, an optional generated password, Microsoft and
Facebook sign-in, an optional post-signup 2FA step, and a sign-in abuse
blocking function. For the manual Console steps this work needs, see
`docs/MANUAL_SECURITY_ACTIONS.md`. For the deploy command, see
`docs/DEPLOY.md` §9.

## 1. Password strength (`src/lib/password-strength.ts`)

Real requirement enforced client-side: 10+ characters, at least 2 of
(uppercase, lowercase, number, symbol) — replacing the previous
`password.length < 8` check. Enforced **only at signup**; sign-in never
re-validates an existing password against this policy, since that would
lock out a legitimate user whose password predates it.

**The real enforcement point is Firebase's own Password Policy**
(Authentication → Settings → Password Policy in Console), since Firebase
— not this app's server — is what actually creates the account. This
app's client-side check is for immediate feedback only; if the Console
policy is weaker than what the UI implies, that's a real gap. See
`docs/MANUAL_SECURITY_ACTIONS.md` for the recommended Console settings
and the note that current status wasn't verifiable from this session.

Firebase's Password Policy settings do not include a breach/known-weak
password-list check. Building one is separate infrastructure (a
maintained list or a third-party API, e.g. Have I Been Pwned's k-anonymity
range API) — not built here, flagged as future work.

## 2. Generated password

`generateStrongPassword()` (same file) - Web Crypto API
(`crypto.getRandomValues`) only, never `Math.random()`. Guarantees the
strength requirement *by construction* (one character drawn from every
required category, then the rest filled and Fisher-Yates shuffled) rather
than generating randomly and hoping it passes. Entirely client-side;
never sent anywhere before the user has seen and accepted it, and never
stored or logged (not even in error paths).

## 3. Microsoft & Facebook sign-in (`src/lib/auth.tsx`)

Each provider is its own named, standalone function
(`signInWithGoogle`, `signInWithGoogleCalendar`, `signInWithMicrosoft`,
`signInWithFacebook`) — never a single function parameterised by
provider name — each replicating the pre-existing Google `signIn()`'s
exact three-step pattern:

1. If the current session is anonymous, `linkWithPopup` (keeps the
   person's existing UID/data).
2. Otherwise `signInWithPopup` directly.
3. On an `auth/credential-already-in-use` collision, extract the
   credential and `signInWithCredential` into the real, pre-existing
   account instead — deliberately abandoning the anonymous session's
   data, since the collision proves it was never really theirs.

**Refactor for testability:** these four functions were pulled out of
the `AuthProvider` component closure into standalone, exported functions
taking the `Auth` instance as a parameter — this codebase's existing
pattern only unit-tests extracted pure/standalone logic (never React
components; there is no `@testing-library/react` or component-testing
setup here), and there were previously zero tests for any of these
functions, including Google's pre-existing one. `AuthProvider`'s
context-exposed closures are now thin wrappers supplying the live `auth`
singleton and the Google-specific `accessToken` side effect (deliberately
**not** applied to Microsoft/Facebook — that state is consumed elsewhere,
`CalendarDefenseView.tsx`/`gmail-signals.ts`, specifically as a Google
Calendar/Gmail API token). See `src/lib/auth.test.ts` for coverage of the
anonymous-link, collision-fallback, and clean sign-in paths for all three
providers plus the calendar-scope variant.

Microsoft uses Firebase's generic `OAuthProvider('microsoft.com')` (no
dedicated class exists); Facebook uses the native `FacebookAuthProvider`.
Both need Console configuration — see `docs/MANUAL_SECURITY_ACTIONS.md`.

**Apple Sign-In:** if this app is ever submitted to the Apple App Store
alongside other third-party sign-in options, Apple requires "Sign in
with Apple" also be offered (App Store Review Guideline 4.8). No native
app exists today, so this isn't a blocker — flagged so it isn't a
surprise at App Store submission time.

## 4. Optional 2FA at signup (`src/components/LandingPage.tsx`)

After a successful signup — email/password, or any social provider
where Firebase reports `isNewUser` true (`getAdditionalUserInfo`,
which also reports `true` for the anonymous-session-upgrade case) — the
auth modal offers a skippable "Secure your account" step, reusing
`SecuritySettingsView.tsx` (the exact component and
`/api/auth/mfa/totp/enroll/*` endpoints Settings' Security tab already
uses) rather than a second enrollment flow. Never shown on a returning
sign-in. Skipping is a pure client-side navigation with zero server
calls, so it trivially cannot affect enabling 2FA later from Settings.
Lazy-loaded (it pulls in the `qrcode` library) so the landing page's
eager bundle — loaded by every anonymous visitor — doesn't grow for a
step only a fraction of visitors ever reach.

## 5. Sign-in abuse blocking function (`functions/`)

**A correction to how this was originally framed, worth recording
precisely:** Firebase's `beforeSignIn` blocking function does not and
cannot "track failed sign-in attempts." It only ever fires on an attempt
Firebase has *already* determined is credentially valid — a wrong
password is rejected entirely inside Google's own Identity Platform
servers before any Cloud Function, blocking or otherwise, is invoked.
Building the literal "count failures, escalating lockout" design was not
possible as originally specified; attempting it via a client-
self-reported "my sign-in just failed" endpoint would introduce a worse
abuse vector than the one being closed (an attacker could lock out any
victim by lying to that endpoint, without ever touching real Firebase
Auth).

**What's built instead**, using signals blocking functions genuinely
have access to (`functions/src/`):

- **`beforeSignIn`** (`signin-velocity.ts` + `index.ts`, tested): tracks
  how many *distinct accounts* have successfully signed in from one IP
  address within a 10-minute rolling window (Firestore-backed —
  `signin_ip_velocity/{ip}/events/{eventId}` — since Cloud Functions
  instances are stateless/ephemeral, same reasoning as `totp-mfa.ts`'s
  existing lockout). A credential-stuffing bot trying many stolen
  email/password pairs from one IP eventually succeeds on several of
  them, so unusual cross-account velocity from one IP is a real,
  available signature of that attack — without needing to observe the
  failures. Logs (never blocks) at ≥4 distinct accounts/IP/window;
  actually rejects only at ≥12, set well above the warn threshold
  specifically so shared IPs (offices, VPNs, carrier-grade NAT) are
  never punished for ordinary, unrelated use.
- **`beforeCreate`** (`disposable-email.ts`, tested): rejects account
  creation from a small, known set of disposable/throwaway email
  domains. Deliberately not a full disposable-email-detection API
  integration (real, separate infrastructure) — just the handful of
  domains most commonly used for signup abuse.

`functions/` is a fully separate npm project/toolchain (own
`package.json`, `tsconfig.json`, `vitest.config.ts`) deployed via
`firebase deploy --only functions`, excluded from the root project's
`tsconfig.json` and `vitest.config.ts` since `firebase-functions`/
`firebase-admin` aren't installed at the repo root. See `docs/DEPLOY.md`
§9 for the deploy commands and gotchas (including a known npm/arborist
bug encountered installing `functions/`'s dependencies, worked around
with `--legacy-peer-deps`).

`signin_ip_velocity` is fully locked in `firestore.rules` (never read or
written by any client, or even by `server.ts` — only by this Cloud
Function's own Admin SDK), matching that file's "every collection gets a
documented rule" convention. It is deliberately **not** in
`user-data-collections.ts`'s GDPR export/erasure registry: it's a
transient, self-cleaning (best-effort, ~10-minute retention) security
log, never queried by `userId` in `server.ts`, and not reachable through
any client-facing account-data path.

## 6. Social-login safety checks

- **Email verification:** a social login's email is pre-verified by the
  provider. `LandingPage.tsx` only ever calls
  `POST /api/auth/verify-email/send` after an email/password signup, so
  social sign-ins were never triggering a redundant "please verify"
  email in practice. The route itself now also checks the decoded
  token's `email_verified` claim and skips sending regardless of caller,
  so this stays true even if a future code path (e.g. a generic "resend
  verification" button) calls it for an already-verified account.
- **Cross-provider linking from Settings** (an email/password user later
  adding Google/Microsoft/Facebook to the *same* account — the other
  direction from the anonymous-session-linking work above): confirmed
  this does not exist anywhere in the codebase today. Not built here —
  it needs its own UI (a "connected accounts" list), linking *and*
  unlinking, and a real safety check against removing a user's last
  remaining sign-in method. That's a genuine separate feature, flagged
  as related-but-separate future work rather than scope-crept in here.
- **App Check on Authentication requests:** App Check is already
  initialized app-wide (`src/lib/firebase.ts`), and Firebase Auth
  automatically attaches App Check tokens once it's initialized in the
  same app instance — no further client code is needed. The only
  remaining step is a Console-only toggle (Firebase Console → App Check
  → APIs → Authentication → Enforce), whose current on/off state this
  session couldn't verify without Console access.

## Verification

Every commit in this pass was verified with the same bar as the rest of
this project: `npx tsc --noEmit`, `npx eslint . --config
eslint.cleanup.config.js --ignore-pattern app/`, the full `npm run test`
suite, and a real production build (`npm run build`) — plus, for
`functions/`, its own separate `npx tsc --noEmit` / `npx vitest run` /
`npm run build` inside that directory.
