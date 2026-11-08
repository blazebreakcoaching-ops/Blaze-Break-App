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
| Quality | Playwright real-app (38) + preview (66) suites | DONE (all pass) |
| Recovery Report | "PDF" export downloaded HTML behind fake progress; AI text unescaped | DONE (real Save-as-PDF, escaped, sandboxed) |
| Recovery Report | Fake "Save Locally" (+15 pts per click, fabricated audit entries) | DONE (removed) |
| Mobile | Nova Send button covered by nav toggle on phones | DONE |
| Mobile | Native 2FA challenge | DONE (Batch 5) |
| Mobile | Capacitor | N/A — app uses Expo/React Native; not adding a second stack |
| Nova | Agentic journey off unless `NOVA_AGENTIC_JOURNEY_ENABLED=true` | DONE (verified fail-closed) |
| Design | Ember design consolidation / progressive disclosure | NOT STARTED (after gates pass) |
| Release | Merge, deploy, store submission | BLOCKED — requires your approval |

## 5. Verified gate result

`EXPECTED_RELEASE_SHA=c0182822488092898beca4e5bad43367e711c9cf npm run verify:integration:offline`
→ **OFFLINE_CHECKS_PASS__NOT_PRODUCTION_APPROVAL** (exit 0), run in a cloud
container on 2026-11-07:

| Stage | Result |
|---|---|
| Clean install, npm audit (high) | Pass — 0 high/critical, 19 moderate |
| TypeScript, ESLint, production build | Pass — 0 errors |
| Vitest (unit + route) | 396 files, 5,272 tests pass |
| Component tests | 23 files, 130 tests pass |
| Firebase emulator (rules + MFA gate) | 4 files, 52 tests pass |
| Playwright preview | 66 pass |
| Playwright real app (Auth + Firestore emulators) | 38 pass |
| Mobile (Expo): install, TypeScript, lint, Jest | Pass — 9 suites, 45 tests |
| Cloud Functions: install, build, tests | Pass — 22 tests |

Not covered by this gate (by design): production deployment, real
Firebase project, real devices/app stores, live AI providers, Stripe.

## 6. Batch 2 — Organisation security and Command Centre (2026-11-07)

Commits: `6317aac` (org security), `c4a2e58` (org screens), `61aef3f` (Command Centre).

| Area | Item | Status |
|---|---|---|
| Invitations | Cancelled / replaced / expired / used / other-person codes refused; hashes never returned | DONE (verified, regression-locked) |
| Joining code | Rotation invalidates old code; unverified emails refused | DONE (verified, regression-locked) |
| Joining code | Removed employees could rejoin with the shared code | DONE (fixed) |
| Joining code | SSO allowed domains enforced when SSO enforcement is on | DONE (fixed ahead of SSO launch) |
| Offboarding | Admin could remove an owner or security admin | DONE (fixed: owner-only) |
| Offboarding | Devices, roster, teams, consent removed in one transaction | DONE (verified) |
| Roles | Acting admin re-checked inside every membership/invite/code/settings transaction | DONE (fixed on 10 routes) |
| Roles | Ownership transfer (promote, step down) + audit | DONE (verified) |
| Audit | Removal audit recorded wrong prior state; recognition deletion unaudited | DONE (fixed) |
| Isolation | Company A owner refused on 13 company-B routes, B unchanged | DONE (verified) |
| Screens | Refusal reasons hidden behind generic errors; code rotation failed silently | DONE (fixed) |
| Command Centre | platform_admin could suspend the Platform Owner / other admins | DONE (fixed: owner-only) |
| Command Centre | Audit log searchable across full history (action / administrator) | DONE (new) |
| Command Centre | Evolution Engine audit view lost older actions | DONE (fixed) |
| Command Centre | Unknown account IDs returned 500 | DONE (404) |
| Release | Deploy the two new Firestore indexes with the release | BLOCKED — needs release approval |

Gate: `verify:integration:offline` on `61aef3f` → OFFLINE_CHECKS_PASS (vitest 5,339;
components 134; emulator 52; Playwright preview 66, real app 38; mobile and Functions pass).

## 7. Batch 3 — Evolution Engine, Intelligence Layer, Recovery Report, Nova (2026-11-07)

Commits: `f73e56c` (Nova context trust boundary), `4b20f84` (module fixes).

| Area | Item | Status |
|---|---|---|
| All modules | All 282 frontend API calls reach a real server route | DONE (verified) |
| Nova | Per-category consent gating of context; memory needs two opt-ins | DONE (verified) |
| Nova | Saved memories / onboarding answers could act as system instructions | DONE (fixed) |
| Nova | Memory tools check consent; manager tools anonymised above threshold | DONE (verified) |
| Recovery Report | Figures computed from the user's own last-7-days records | DONE (verified) |
| Recovery Report | Rate limit / outage shown and printable as "no activity" | DONE (fixed: real reason, no PDF) |
| Evolution Engine | Unfinished sections clearly labelled "Not built" | DONE (verified) |
| Evolution Engine | 17 handlers hid the server's refusal reason | DONE (fixed) |
| Intelligence Layer | Recalculation is server-side from the user's own records | DONE (verified) |
| Intelligence Layer | False "Nova automatically marks invites low priority" claim | DONE (removed) |
| Intelligence Layer | Customer access to own insights | DONE (approved; Batch 4) |

Gate: `verify:integration:offline` on `4b20f84` → OFFLINE_CHECKS_PASS (vitest 5,341;
components 138; emulator 52; Playwright preview 66, real app 38; mobile and Functions pass).

## 8. Batch 4 — Customer Intelligence Layer (approved 2026-11-07)

Commit: `80da89e`. Built by completing the existing customer Recovery
Intelligence Hub; the legacy staff screen stays staff-only.

| Item | Status |
|---|---|
| Trend explanations were fixed reassuring text ("stable", "working") regardless of data; Nova read them | DONE (fixed: generated from real result) |
| GET /api/recovery/insights — own data only, enforced server-side; honest unavailable states | DONE |
| POST /api/recovery/insights/explain — Nova uses only consented, available insights | DONE |
| Company reporting never reads personal derived summaries | DONE (regression-locked) |
| "Your insights" panel: plain English, simple bars, advanced tools collapsed | DONE (light/dark, desktop/mobile reviewed) |
| Mobile two-factor sign-in (Expo) | NOT STARTED (next) |
| Nova / NHEI integration readiness | NOT STARTED |
| Ember customer-first redesign | NOT STARTED |

Gate: `verify:integration:offline` on `80da89e` → OFFLINE_CHECKS_PASS (vitest 5,362;
components 144; emulator 52; Playwright preview 66, real app 38; mobile and Functions pass).

## 9. Batch 5 — Mobile two-factor, Nova/NHEI readiness, design foundation (2026-11-08)

Commits: `d61b8a2` (mobile 2FA), `92c177d` (Nova/NHEI), `c71635d` (design tokens).

| Area | Item | Status |
|---|---|---|
| Mobile | Native two-factor challenge (code / recovery code / cancel) | DONE |
| Mobile | Token in memory only, bound to one account; switch / mid-check switch / expiry re-challenge | DONE (tested) |
| Web + mobile | Wrong 2FA codes were submitted twice (auto-retry on 401) | DONE (fixed) |
| Nova | Diagnostic fallback was a fixed conclusion with a medical-sounding claim | DONE (fixed) |
| Nova / NHEI | Agentic, calendar execution and NHEI modes off by default; no personal NHEI processing wired; no AI-generated scores | DONE (verified, regression-locked) |
| Super Nova | No code exists in this repository | N/A — needs a specification |
| Design | 587 duplicated hard-coded colour pairs -> 4 semantic utilities, pixel-identical | DONE |
| Design | Novice -> Mastering -> Expert progression | BLOCKED — changes navigation; needs owner approval (design lock) |
| Mobile | Two-factor tested on a physical device / EAS build | BLOCKED — needs device and build credentials |

Gate: `verify:integration:offline` on `c71635d` → OFFLINE_CHECKS_PASS (vitest 5,379;
components 144; emulator 52; Playwright preview 66, real app 38; mobile Jest 65; Functions pass).

## 10. Batch 6 — Customer-first experience (2026-11-08)

Commits: `d205a4f` (placeholder debts no longer shown as data), `c1e1c69` (Nova guide insights step),
`fc932d2` (Novice / Mastering / Expert, saved preference route, simpler navigation, journey E2E),
`3ba58cd` (mobile Tools slot shows the open tool).

| Area | Item | Status |
|---|---|---|
| Experience | Novice / Mastering / Expert display levels, customer-chosen, saved per account, never an access gate | DONE |
| Navigation | Quick find always visible; purpose-built 5-item mobile bar; fits at 320px | DONE |
| Journey | Sign up → onboarding → check-in → insights → Nova → plan → progress, real backend E2E | DONE (passes) |
| Honesty | Placeholder recovery debts shown as "highest debt", in Nova's read and as badge progress | DONE (fixed) |
| Super Nova | Nothing exists in any branch, file, issue or PR | N/A — needs a specification |

Gate on `3ba58cd` → OFFLINE_CHECKS_PASS (vitest 5,389; components 151; emulator 52; Playwright preview 66,
real app 39; mobile Jest 65; Functions 22).

## 11. Owner PRs #157 and #158 reconciled (2026-11-08)

Merged (stacked) in `ac85610`; reconciliation `01675ce`, `b71bc2f`, `c465845`, `aa0024f`.
PRs #157 / #158 remain open drafts; their branches are unchanged.

| Item | Status |
|---|---|
| Qualitative `low_energy_checkins` kept separate; no scores derived | KEPT (tested web, native, rules) |
| New Firestore rules tested on the emulator (10 tests, in the gate), incl. 2FA gate | DONE — **not deployed** |
| Double-tap double save; no save confirmation; unannounced errors | DONE (fixed) |
| Web and native stored welcome preferences in different places | DONE — one canonical record, legacy fallback, no migration |
| Web "Use Name" switch disagreed with the greeting | DONE (fixed, opt-in) |
| Native TypeScript and lint failures from #158 | DONE (fixed) |
| Voice journal invented progress stages | DONE (honest, announced) |
| Physical-device VoiceOver / TalkBack | BLOCKED — plan in docs/DEVICE_ACCESSIBILITY_TEST_PLAN.md |
| Languages beyond English | OPEN by design — needs reviewed translations |
| Per-account low-energy mode / pacing / reduced-motion override | OPEN — needs owner decision |

Gate on `aa0024f` → OFFLINE_CHECKS_PASS (vitest 5,411; components 156; emulator 62; Playwright preview 66,
real app 39; mobile Jest 69; Functions 22).
