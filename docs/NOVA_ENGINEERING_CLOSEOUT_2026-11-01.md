# Nova engineering closeout — 2026-11-01

## Scope and release gate

This is an **engineering closeout**, not a go-live approval. Work is confined to GitHub branches and the existing Blaze Break/Nova architecture. Do not enable NHEI, unattended Guardian outreach, calendar writes, or real model-evaluation flags through this procedure.

- Repository: `blazebreakcoaching-ops/Blaze-Break-App`.
- Production baseline when audited: `main` at `42c441fdd24ba2b4e2f704cab6cfe2199771a288`.
- Framework branch: `claude/nhei-phase-1`. This branch was 85 commits ahead of `main` before the one-character corrective commit below.
- Security hotfix: PR #140, `security/credential-export-hotfix`, **still open** and not deployed.
- Unrelated, older open team-welfare PR #16 must not be silently included in this release.

## Findings from existing GitHub Actions records (read-only audit)

The last CI run on the framework branch before the correction was workflow run
`41333574135`, which failed at the TypeScript step:

```text
nova-chat-scenario-runner.ts(57,98): error TS1005: '>' expected.
```

Checkout, Node setup, npm installation and `npm audit --audit-level=high` had succeeded. ESLint, production build and tests did **not** run in that failed job. The type declaration was corrected in commit `3f1c28f19fed20e0f2c460e72d78f452c849453d`:

```ts
export type NovaScenarioOnAfterTurn = (turnIndex: number, turn: NovaScenarioTurn) => Promise<void>;
```

The corrective commit was labelled `[skip ci]` and was confirmed present in GitHub. **No post-fix successful type-check, test or build is claimed.**

The prior security PR #140 CI run `40027559451` failed at the npm audit gate (three high-severity findings); TypeScript, build and tests were skipped. The scoped dependency delta already integrated on the framework branch through PR #145 was applied to PR #140's branch:

- `ce5857d65a0484bb998ca845258e8ae54f193f83` — root package-manifest updates.
- `ee1ffff0a30cf3e8375db7bd8bb7b727e85b06c3` — matching lockfile entry updates (41 entry changes).
- The code sanitiser (`export-credential-sanitiser.ts`) and its tests are byte-for-byte identical on the security and framework branches, but that equivalence does **not** replace fresh validation of the security PR.
- The amended security branch still has no fresh passing CI evidence.

## How to verify without consuming GitHub Actions credits

All commands below are **local**, from a clean checkout, in Node.js 22. They are NOT commands to run through GitHub Actions. Do not print, commit or export real API credentials. Never enable live Gemini-evaluation flags for the engineering checks.

Run first against the framework branch:

```bash
git checkout claude/nhei-phase-1
npm ci --legacy-peer-deps
npm audit --audit-level=high
npm run lint
npx eslint . --config eslint.cleanup.config.js
npm run build
npm test
npm run test:components
```

Record the command, exit code, relevant errors and HEAD SHA for every check. Do not claim passing results on the basis of historical runs on an older SHA. Investigate any failure before attempting a release.

Repeat the clean-install, audit, type-check, ESLint, build and full-test sequence on `security/credential-export-hotfix`. Its branch intentionally does not include newer NHEI-specific component suites; tests missing from this older branch are not evidence of a failure.

After these pass, test supported browser paths in an **isolated local/emulator environment** using existing scripts `npm run test:e2e` and `npm run test:e2e:realapp` (the latter starts Firebase emulators and needs a working Java runtime and Playwright browsers). `npm run test:emulator` separately exercises Firebase rules. None may be substituted by offline mocked tests alone. Real-provider Gemini testing is **not** part of this engineering gate and needs separate credentials, preapproved spend, and independent safeguarding review.

## Deployment and GitHub Actions constraint

The tracked `.github/workflows/ci.yml` runs on every branch push and PR; `.github/workflows/deploy.yml` triggers on every push to `main` and deploys the Cloud Run service plus Firestore rules/indexes. `.github/workflows/codeql.yml` also responds to changes involving `main`. These are existing automation triggers and may consume quota even if a developer never explicitly clicks “Run workflow.”

While automated runner usage is not authorised, commits on this preparation branch should carry `[skip ci]`. Do not merge to `main` while the CI/deployment constraint remains unresolved. Do not disable security controls merely to make a release appear green.

## Go/no-go checklist

- [ ] **Framework**: clean install, audit, TypeScript, ESLint, production build, Vitest, component, emulator and browser suites pass on the same current commit.
- [ ] **Security PR #140**: clean install, audit, TypeScript, ESLint, build, relevant export/OAuth regression tests and overall suite pass on its amended head.
- [ ] Confirm no exposed OAuth/bearer/MFA credentials appear in actual export response or logs on isolated synthetic fixtures.
- [ ] Human code review confirms PR #140 remains scoped to credential sanitisation, OAuth logging and dependency remediation.
- [ ] Independent integration review reconciles the 85+ framework commits separately from security PR #140.
- [ ] A controlled deployment window and GitHub Actions quota/trigger decision are explicitly approved.
- [ ] Only approved, independently reviewed user-facing Nova capabilities are allowed into the release; NHEI advanced modes and real external actions remain disabled.
- [ ] Real-Gemini response quality, clinical/safeguarding review, consent and retention decisions remain separate, open pilot blockers.

**Current decision: NO-GO for production merge.** Fixes are committed and static source checks completed, but no fresh post-fix test run, no real-model validation, and no controlled deployment approval exists.
