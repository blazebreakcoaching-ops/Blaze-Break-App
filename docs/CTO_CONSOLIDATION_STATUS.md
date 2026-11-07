# Blaze Break — CTO Consolidation Status

Working branch: `claude/funny-wright-0p84gv` (built on top of PR #155's head).
Nothing here has been merged to `main` or deployed. GitHub Actions are
manual-only (`workflow_dispatch`) and every commit carries `[skip ci]`.

## 1. Single source of truth

**PR #155 (`cto/customer-first-experience-20261106`) is the consolidated
line.** It is 718 commits ahead of `main` and already contains every
`cto/*` release branch and `claude/nhei-phase-1` as ancestors.

`claude/funny-wright-0p84gv` = PR #155 head + `main`'s one missing commit
(Actions pause) + the fixes listed in section 3. Recommended path: merge
this branch into PR #155 (or retarget #155 to it), then review #155.

### Branches/PRs NOT inside #155 — decision for each

| Branch / PR | Content | Status in #155 | Decision |
|---|---|---|---|
| `main` ddf4513 | Pause CI/CodeQL/deploy triggers | Missing | **Merged in** (kept #155's stricter manual deploy workflow) |
| PR #140 `security/credential-export-hotfix` | Export sanitiser, OAuth log redaction | Present (`export-credential-sanitiser.ts`, `extractOAuthFailureDiagnostics`) | Superseded — close after #155 merges |
| `claude/mfa-firestore-enforcement-20261104` | MFA in Firestore rules | Present, newer version (`mfaSessionSatisfied`, emulator test) | Superseded |
| `fix/supernova-live-auth-parity-20261101` | Voice WS revocation + MFA | Present (`verifyIdToken(idToken, true)` + MFA proof) | Superseded |
| `fix/supernova-chat-trust-boundary-20261101` / `-nova-security-consolidated-` | Untrusted client context | Present (`NOVA_CLIENT_CONTEXT_BOUNDARY`) | Superseded |
| `fix/supernova-dependency-high-advisories-20261101`, `security/npm-audit-remediation-20261106` | npm audit fixes | #155 lockfile: 0 high/critical (19 moderate) | Superseded |
| `security/wif-keyless-deploy-20261105` | Keyless WIF deploy | Present (`workload_identity_provider`, `.gcloudignore`) | Superseded |
| `ci/run-all-checks-even-when-audit-fails-20261106` | CI-only tweak | Not present | Not needed while Actions are paused; revisit when CI is re-enabled |
| `cto/test-infrastructure-20261103`, `cto/launch-preflight-guards-20261104`, `cto/staging-release-safety-20261106` | Tooling/test commits | Patch-equivalent commits already in #155 | Superseded |
| PR #16 `claude/team-welfare-dashboards` (Sept) | Manager/HR dashboards | Re-implemented (team-dashboard, hr-dashboard, team-escalation) | Abandoned — close |
| Dependabot PRs #5, #8–#15, #103, #104, #137, #141, #156 | Version bumps based on old `main` (up to 443 commits behind) | Not rebased onto #155; mergeability against #155 not tested | Close; re-run Dependabot after #155 lands. Major bumps (TS 7, Vitest 5, ESLint 10, motion 13) need a deliberate upgrade |

83 other remote branches are fully merged into `main` (work-design-*,
recovery-routing-*, evolution-engine-*, command-centre-*, lane-*) and can
be deleted when convenient.

## 2. Verified state of PR #155 as received (before any fix)

PR #155's head did **not** build or test cleanly, contrary to its reports:

- 144 of 394 test files could not load (syntax error in the shared
  Firestore test fake); TypeScript failed (two syntax errors from web-editor
  commits on 2026-11-07, then 34 type errors once those were fixed).
- 78 unit/route tests failed once files could load.
- Browser (Playwright) suites: 16 preview + 21–24 real-app failures.

## 3. Fixes on this branch (see commit history for detail)

- **Security — owner bootstrap:** the two founder emails granted Platform
  Owner without `email_verified`; anyone could register the unused one.
  Fixed server + client; regression test proven to fail on old code.
- **Production bug:** saving company cost inputs and promoting a "What
  Works Here" principle threw on every real request (argument passed to
  `tx.set` instead of the audit wrapper). Fixed; fake Firestore now
  validates set-options like the real SDK.
- **Fake Firestore:** transactional queries ignored `where` filters.
- Build repairs, typing fixes, dead code; manage-teams 404 for missing org.
- 78 stale tests reconciled with #155's deliberate hardening (each checked
  against server code, never loosened to pass).

## 4. Master checklist

Legend: DONE / IN PROGRESS / BLOCKED / NOT STARTED

| Area | Item | Status |
|---|---|---|
| Reconcile | Branch/PR inventory and decisions (this file) | DONE |
| Reconcile | Close superseded PRs (#140, #16, Dependabot) | BLOCKED — needs your approval |
| Security | Owner-bootstrap privilege escalation | DONE |
| Security | Credential export / OAuth log redaction | DONE (verified present) |
| Security | MFA in Firestore rules + voice WS parity | DONE (verified present + emulator stage passes) |
| Security | Dependency audit (high/critical) | DONE (0 high) |
| Security | Production data check: admins missing from `memberUids` | BLOCKED — needs read-only production access |
| Quality | TypeScript / ESLint / unit+route tests | DONE (0 / 0 errors / 5,265 passing) |
| Quality | Firebase emulator stage | DONE (passes) |
| Quality | Mobile (Expo) TS, lint, Jest; Functions build + tests | DONE (pass) |
| Quality | Playwright real-app + preview suites | IN PROGRESS |
| Recovery Report | "PDF" export downloads HTML behind fake progress | NOT STARTED (next) |
| Recovery Report | "Sync" awards points without saving anything | NOT STARTED (next) |
| Mobile | Native 2FA challenge (2FA accounts are currently blocked on mobile) | NOT STARTED |
| Mobile | Capacitor | N/A — app uses Expo/React Native; not adding a second stack |
| Nova | Agentic journey off unless `NOVA_AGENTIC_JOURNEY_ENABLED=true` | DONE (verified fail-closed) |
| Design | Ember design consolidation / progressive disclosure | NOT STARTED (after gates pass) |
| Release | Merge, deploy, store submission | BLOCKED — requires your approval |
