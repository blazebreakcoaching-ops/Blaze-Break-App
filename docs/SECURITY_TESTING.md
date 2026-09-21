# Security testing — what the automated suite actually covers

A confirmed gap before this document existed: 59 test files (`npm run
test`, vitest) existed with no single place summarizing what they prove
from a security standpoint. This is that summary — organized by security
concern, not file-by-file, and it does not repeat what each test already
says in its own comments. Read the file itself for exact assertions;
read this for "is X actually tested, and where."

**Two different kinds of "Firestore" test in this codebase — don't
confuse them:**

- `test/fake-firestore.ts` is an in-memory stand-in for the Admin SDK,
  used by every `*.route.test.ts` file. It does **not** enforce
  `firestore.rules` — it exists to test route/handler logic (auth
  scoping, business rules, RBAC) against a controllable store, not
  security-rule enforcement.
- `test-rules.cjs` is the only thing that actually exercises
  `firestore.rules` against a real rules engine
  (`@firebase/rules-unit-testing` + the Firestore emulator). It requires
  a running emulator and is **not** part of `npm run test` or CI — see
  `docs/FIREBASE_SECURITY.md`. If a change touches `firestore.rules`
  directly, `test-rules.cjs` — not the vitest suite — is what actually
  proves it, and it must be run manually against an emulator.

## Authentication and account security

`account-security.route.test.ts` is the largest single concentration of
security-relevant tests in this codebase — email verification,
password-reset (including the no-enumeration guarantee: byte-for-byte
identical responses for a real vs. non-existent email, and the timing-
side-channel fix verified by not awaiting the send before responding),
and the full TOTP 2FA lifecycle: enroll/confirm, verify-at-signin,
disable, lockout after 5 wrong attempts, single-use recovery codes, and
— added in this hardening pass — the session-scoped MFA gate itself
(`X-MFA-Session-Token` required/rejected correctly, enroll/disable
routes correctly blocked without a valid session token, a tampered token
rejected the same as a missing one).

`totp-mfa.test.ts` is the pure-logic layer underneath that: TOTP
generation/verification against known vectors, lockout-threshold math,
recovery-code hash determinism, and AES-256-GCM encrypt/decrypt
round-trips — kept I/O-free and fast, separate from the route-level
tests above.

`admin-users.route.test.ts` (new in this pass) covers the 3 platform-
admin-role routes' Zod-enum role validation, the last-platform-owner
guard on both downgrade and deletion, and non-owner rejection.

## Authorization / access control

- `org-rbac.test.ts` / `org-rbac.route.test.ts` — the Enterprise org
  permission matrix (`docs/ENTERPRISE_RBAC.md`): every role/permission
  combination, forbidden-role rejection at the route level.
- `entitlements.test.ts` / `entitlements.route.test.ts` — the
  server-authoritative Free/Premium model: safe defaults, quota
  enforcement once exhausted, admin-only grant routes.
- `org-data-policy.test.ts` / `.route.test.ts` — the no-model-training
  default and who can change it (owner/admin/security_admin only).
- `org-connectors.test.ts`, `org-search.test.ts` / their route
  counterparts, `org-billing.route.test.ts`, `desktop-deployment.test.ts`
  / `.route.test.ts` — each Enterprise feature's own permission
  boundary.
- `sso-config.test.ts` / `sso-config.route.test.ts` — SSO config
  validation (including, new in this pass, the `isBlockedIpAddress` SSRF
  guard: loopback/RFC1918/link-local/cloud-metadata/CGNAT IPv4 and IPv6
  equivalents, and the route-level test that the metadata-URL
  reachability check never fetches a blocked address and folds a blocked
  result into the same generic response as any other failure).
- `admin-orgs.route.test.ts` (new in this pass) — `orgId` format
  validation on org creation.

## Data protection / privacy

- `user-data-collections.test.ts` — the GDPR export/erasure registry
  guardrail: every declared collection's export/erasure classification,
  and (hardened in this pass) two independent static scanners of
  `server.ts` — one for `.where('userId', ...)` query usage, one new one
  for write-only `.add()`/`.set()` usage with a `userId` field — that
  fail the build if either finds a top-level personal-data collection
  not classified in `user-data-collections.ts`. This is what caught
  `feedback_submissions` as a real gap in this pass.
- `user-data-endpoints.route.test.ts` — the actual export/delete routes
  end-to-end: correct scoping to the caller only, `audit_logs`
  deliberately surviving deletion, another user's data never touched.
- `org-risk-trend.test.ts` / `.route.test.ts` — the k-anonymity/cohort-
  size gates on aggregate org dashboards, and the differencing-attack
  protection (repeated reads across overlapping cohorts can't
  reconstruct an individual's data).
- `crisis-region.test.ts` — region-specific crisis-resource correctness
  (a safety-adjacent, not privacy, concern, grouped here since it's
  small and standalone).

## Input validation / abuse control

- `resentment-analysis.route.test.ts`, `executive-report.route.test.ts`,
  `nova-manager-coach.route.test.ts` (new/extended in this pass) — each
  AI-backed route's daily-quota enforcement, that a failing model call
  degrades to a clean error rather than a crash, and (executive-report)
  that the quota check runs even when there's not enough data to call
  the model at all — confirming the gate isn't accidentally
  model-call-dependent.
- `gad7.test.ts` / `.route.test.ts` — GAD-7 answer validation and
  scoring correctness.
- `sms-guardrails.test.ts` — per-user SMS cost caps and kill switches.
- `cost-estimates.test.ts` / `cost-usage.route.test.ts` — usage metering
  correctness, admin-only visibility.
- `boundary-autopilot-schemas.test.ts`, `desktop-deployment.test.ts` —
  Zod schema validation for their respective features' inputs.
- `messaging-and-voice.route.test.ts`, `nova-chat-safety.route.test.ts`,
  `nova-memory-context.route.test.ts` — Nova-specific input handling and
  the safety-instruction-always-present guarantee (see next section).

## Safety-critical (non-negotiable constraint territory)

These tests exist specifically to hold the line described in
`docs/SECURITY_ARCHITECTURE.md`'s non-negotiable constraint — no risk
scoring, no inferred mental-state signal, Guardian escalation
user-authorised only:

- `nova-chat-safety.route.test.ts` — proves the crisis-safety system
  instruction is never silently dropped from a Nova chat call (the real
  bug this test was written to prevent recurring).
- `guardian-alert.test.ts` / `.route.test.ts` — Guardian's
  user-authorised-only trigger model, abuse-prevention limits, real
  (not fabricated) contact validation.
- `nudge-scheduler-kill-switch.route.test.ts` — the default-off kill
  switch on automated outreach nudges.
- `nova-tools.test.ts`, `nova-claude-tools.test.ts` — the tool-calling
  layer's allowlisted feature set and memory-write validation (opt-in
  gating, length limits, the `'verified'` confidence level deliberately
  excluded from model-writable values).
- `nova-brain.test.ts`, `rumination-furnace.test.ts`,
  `voice-continuity.test.ts`, `dashboard-greeting.test.ts` — Nova
  behavioural correctness in specific feature areas; not security tests
  per se, listed here because they touch the same safety-sensitive
  conversational surface.

## Infrastructure

- `server-boot.test.ts` — the module actually loads without a top-level
  throw (a real boot-crash this test was added after), a protected route
  correctly rejects an unauthenticated call, and (new in this pass) the
  Permissions-Policy header is present with the expected restrictive
  directives on every response.
- `notification-router.test.ts`, `positive-reinforcement.test.ts` /
  `.route.test.ts`, `workplace-governance.route.test.ts`,
  `one-less-thing.route.test.ts`, `org-leading-indicators.test.ts`,
  `archetype-scoring.test.ts`, `billing-adapter.test.ts`,
  `weekly-goal-tracker.test.ts` — feature-correctness suites; included
  in the total test count but not primarily security-relevant.
- `brevo-templates.test.ts`, `src/lib/feedback-format.test.ts`,
  `src/lib/paletteMatch.test.ts` — pure-logic/UI-adjacent tests, same note
  as above.

## What automated testing does NOT cover

Stated plainly rather than left implicit:

- **`firestore.rules` enforcement itself** — only `test-rules.cjs`
  (manual, emulator-based) proves this; see the note at the top of this
  document.
- **Real third-party integration behaviour** — every external API
  (Gemini, Claude, Vertex, Twilio, Brevo, Slack/Jira/Asana/Calendly/
  Monday OAuth) is mocked in tests. A provider-side outage, API change,
  or credential issue is not something this suite catches — see
  `docs/DEPLOY.md` §7 ("sandbox-untestable paths") for what needs a real
  deploy to verify.
- **Penetration testing / adversarial security review** — this suite
  proves the intended behaviour holds under the scenarios someone
  thought to write; it is not a substitute for an actual pentest. See
  `docs/OUTSTANDING_SECURITY_ITEMS.md`.
- **Load/DoS resilience** — rate limiters are unit-verifiable in
  isolation (see the smoke-test approach noted in
  `docs/SECURITY_HARDENING.md` for the rate-limit logging change, since
  every route test mocks `express-rate-limit` as pass-through
  infrastructure) but there is no load-testing suite proving behaviour
  under real sustained traffic.
- **Browser/client-side security** (CSP violations in practice, XSS in
  rendered Nova output, etc.) — covered by code review and the CSP
  configuration itself (`docs/FIREBASE_SECURITY.md`/helmet config in
  `server.ts`), not by an automated browser-security test suite.
