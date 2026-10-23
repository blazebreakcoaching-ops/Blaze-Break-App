# Independent review: credential-export security hotfix

**Status: NOT MERGED. NOT DEPLOYED.** This review strengthens the hotfix prepared on `claude/nhei-phase-1` and extends it to `main`, where the independent review found the underlying vulnerability still fully present and unpatched. No merge, deployment, or destructive action has been taken.

## 1. Confirmed vulnerabilities

**Confirmed, not hypothetical** (verified by reading the actual route and schema code, and reproduced with sentinel-value regression tests against the real Express app):

- **`GET /api/user/export`'s generic `listCollections()` dump** copied every direct subcollection under `users/{uid}` into the export response verbatim. On `claude/nhei-phase-1` this was already scoped down to the three originally-named collections (see the Phase 5F hotfix doc); on `main` it is still completely unguarded.
- **Four collections hold genuine reusable credentials**: `integration_tokens` (raw OAuth access/refresh tokens), `oauth_pkce` (a live PKCE code_verifier — only exists on `claude/nhei-phase-1`, not yet on `main`), `security` (the AES-256-GCM-encrypted TOTP secret, a pending enrollment secret, hashed recovery codes), `recovery_ally` (a live bearer `shareToken`).
- **A fifth, previously unreported collection: `users/{uid}/push_subscriptions/{id}`**. Its `keys.auth` field is a genuine, reusable Web Push authentication secret (RFC 8291) that matched none of the naming patterns the original Phase 5F audit checked for. This is a real finding from this review, not a restatement of the original one.
- **Root profile document** (`users/{uid}` itself) was exported with no sanitisation on either branch's original code.
- **OAuth connect/callback/refresh failure logging**: three `logger.error` call sites logged a provider's raw token-endpoint response body verbatim (`{ responseBody: tokenBody }` / `{ responseBody: body }`). A response shaped like a failure can still carry a real access/refresh token alongside the error field — this is a real behaviour of some providers' token endpoints, not a theoretical concern.

**Reviewed and confirmed NOT a vulnerability** (so these are explicitly ruled out rather than left unaddressed):
- TOTP enrollment's `otpauthUri`/`secretForManualEntry` response — a one-time disclosure of a *new* secret to the person who owns it, during enrollment, never persisted raw and never part of any export path.
- Stripe `customerId`/`providerCustomerId` — a non-secret identifier, not a reusable credential.
- `fetchAccountIdentity`/`revoke` (Google Calendar connector, `claude/nhei-phase-1` only) — both wrap their own fetch calls in an internal try/catch that never re-throws or constructs an error containing the access token, so no path from them reaches a logger call with token material.
- Password reset / email verification — delegated entirely to Firebase Auth's own `generatePasswordResetLink`; no custom reset token is stored in Firestore by this app.
- `errorFields()` (`logger.ts`) only ever reads `.message`/`.stack` off a caught error — audited every OAuth-adjacent catch block for a thrown `Error` whose `.message` could embed a token; none do.

## 2. Findings in the initial patch (Phase 5F, directive §2)

The original patch (`export-credential-sanitiser.ts` v1, `claude/nhei-phase-1` only) was a sound design — a naming-pattern denylist plus an explicit list for non-conforming field names — but had three gaps:

1. **`push_subscriptions.keys.auth` was missed entirely.** "auth" alone is too generic a word to safely denylist globally (it would wrongly redact fields like `isAuthenticated`), so the naming-pattern layer structurally could not catch it without over-reaching.
2. **The hash check was anchored (`^hash$`, exact match only)**, inconsistent with every other pattern in the file (all "contains"/"ends with" matches). No real field in the current codebase was missed by this specifically, but a hypothetical future `otpHash`/`verificationHash` would have been.
3. **OAuth failure logging redacted a collected payload after the fact** (`sanitiseExportDoc(tokenBody).doc`) rather than collecting only a bounded, known-safe set of fields up front — safer in practice than the original raw log, but still only as complete as the redaction patterns are, for every current and future provider's response shape.

None of these were being exploited; they are structural gaps found by re-deriving the threat model from scratch rather than trusting the original list of "four known collections."

## 3. Additional remediation completed

- **`push_subscriptions` added as a fifth known secret-bearing collection.**
- **Sanitisation strengthened from pure negative naming-pattern matching to an explicit, deny-by-default safe-field allowlist** for all five known secret-bearing collections (`KNOWN_SECRET_COLLECTION_SAFE_FIELDS` in `export-credential-sanitiser.ts`). A field that matches no naming pattern at all is now still dropped on these five collections, because it isn't on the allowlist — not because something recognised it as dangerous. Every other collection (the NHEI export, the root profile doc, any not-yet-classified stray collection) keeps the generic naming-pattern/explicit-list layers as before, now with the hash check broadened to `hash$` (unanchored suffix match, consistent with `token$`).
- **OAuth failure logging replaced entirely**: `extractOAuthFailureDiagnostics()` collects only `error`, `error_description`, `error_uri` (RFC 6749 §5.2) and Slack's own `ok` flag; every other field in the provider's response is reduced to its NAME only (`otherFieldNames`), never its value. This is strictly safer than redacting a collected payload, and was applied to all three log sites on both branches.
- **Ported the entire fix to `main`**, where the vulnerability was found to be fully live and unpatched (see §5 and §9).

## 4. Exact files and commits

**`claude/nhei-phase-1`** (pushed):
- `84aba40` — `export-credential-sanitiser.ts`/`.test.ts` strengthened (allowlist, broadened hash pattern, `extractOAuthFailureDiagnostics`); `server.ts` OAuth log sites rewired; `user-data-endpoints.route.test.ts` and `oauth-integrations.route.test.ts` extended with adversarial tests (push_subscriptions sentinel, deny-by-default property test, account isolation, bounded-diagnostics-shape tests for both token-exchange and token-refresh failure paths).
- `d428eda` — fixes a real `tsc` error (`OAuthFailureDiagnostics` needs its own index signature to satisfy `LogFields`), caught by re-running the full typecheck after the above.

**`security/credential-export-hotfix`** (local branch off `origin/main`, commit `894e53c`, **not pushed** — see §9):
- New `export-credential-sanitiser.ts` / `export-credential-sanitiser.test.ts` (same strengthened content, verified against `main`'s actual field shapes for every collection).
- `server.ts`: `/api/user/export` now sanitises the collections map and root profile; the three OAuth failure-logging call sites use `extractOAuthFailureDiagnostics`.
- `user-data-endpoints.route.test.ts` and `oauth-integrations.route.test.ts` extended with the equivalent adversarial tests, adapted to `main`'s actual (simpler, no-NHEI) response shape.
- `oauth_pkce` is included in the allowlist for forward-compatibility but is currently unused on `main` (no code path writes to it there — PKCE/Google Calendar Actions never shipped to `main`).

No NHEI, Calendar Actions, or Agentic Nova changes are included in either diff — confirmed by `git diff --stat` on both: only the sanitiser module, its tests, the three `server.ts` touch points, and the two existing route-test files.

## 5. Regression results

| Suite | `claude/nhei-phase-1` | `security/credential-export-hotfix` (main) |
|---|---|---|
| Full `vitest run` | **4441 / 4441 passed** (318 files) | **3362 / 3362 passed** (240 files) |
| `tsc --noEmit` | Clean | Clean |
| `eslint` (changed files) | 0 errors (pre-existing warnings only, none on lines this review touched) | not run separately — same lint config, same clean sanitiser/test files |
| New adversarial tests added this review | 27 (sanitiser unit) + 5 (export route) + 3 (OAuth route) | 6 (export route) + 2 (OAuth route) |

All new tests are real sentinel-value tests against the real Express app (via `supertest`) or the real exported functions — not mocks of the thing being tested. No test was skipped or marked pending.

## 6. Compatibility risks

- **None identified for normal use.** The sanitiser only ever *removes* fields from a response the caller already couldn't reuse as credentials; it adds a `redactedForSecurity: true` marker so the export is honest about withholding something, never a silent truncation.
- **A caller that parsed `integration_tokens`/`security`/`recovery_ally`/`push_subscriptions` out of their own downloaded export file expecting the raw secret fields** would now find them absent. This is the intended behaviour change, not a regression — no legitimate use of a GDPR export depends on it containing a reusable credential.
- **`main`'s export route previously had no `redactedForSecurity` marker concept at all.** Any external tooling built against the exact shape of `main`'s current export response (none is known to exist) would see new, additional fields (`redactedForSecurity`) on affected documents, and the removal of the secret fields themselves. This is an additive + subtractive change to an API response shape, not a breaking rename.
- **No Firestore schema change on either branch.** No stored document's shape changes — only what the export route echoes back, and what the three log lines contain.

## 7. Historical exposure assessment

**No assumption of exploitation is made. No evidence of exploitation was found — because this review has no access to actually check for it**, and that distinction is kept explicit throughout:

- **Was the vulnerable export route used?** Unknown from this review. `checkAndReserveCapability(uid, 'exports')` (both branches) records a daily usage counter per user in Firestore (`users/{uid}/usage_counters`) that *could* answer this, but this review has no access to a production Firestore instance — only local source code and the local git history. An operator with production Firestore access can query that collection directly; this review cannot.
- **Were exported files stored by the application?** No, on both branches. The route builds the export in memory and sends it directly as the HTTP response body (`res.json(...)`); neither branch writes a copy to Cloud Storage, a database, or anywhere else server-side. Whatever happens to the file after the browser receives it is entirely outside this app's control, which is exactly the risk the original hotfix doc already named.
- **Do OAuth error logs contain credential material?** Structurally, yes they could have, prior to this fix, on both branches — any token-exchange or token-refresh call that failed with a provider response that also happened to include a token value would have logged it verbatim. Whether any specific historical log line actually contained one depends on real Cloud Logging history this review cannot access.
- **Can affected tokens be identified without exposing more secrets?** Yes, in principle, by an operator with Cloud Logging access: search historical `[Integrations]` error-severity entries for a `responseBody` field (the old, now-removed log shape) and cross-reference the `service`/timestamp against `integration_tokens` documents for the affected `uid` — this identifies *that* a token was logged without needing to display the token value itself. This review did not and could not perform that search.

**This review does not recommend automatic token revocation, log restriction, or user notification.** Those are judgement calls that depend on facts (actual log retention window, whether `main` is actually what's deployed, whether this export route has ever actually been called in production) that only an operator with production access can establish. If, after checking, an operator confirms a specific token was logged in a retrievable log entry, revoking that one provider connection (forcing reconnection) is a low-cost, low-risk precaution independent of whether exploitation is suspected — but that is a decision for a human with the relevant access, not this review.

## 8. Independent review limitations

- **No access to production systems.** No Cloud Logging, no production Firestore, no deployment configuration beyond what's inferable from `git remote show origin`'s `HEAD branch: main`. Every claim about "what's deployed" is inferred from branch topology, not confirmed against an actual running service.
- **No access to real OAuth provider sandboxes.** All OAuth tests use mocked `fetch` responses shaped to match each provider's documented response format; no test exercises a genuinely live Slack/Jira/Asana/Calendly/Monday/Google endpoint.
- **Firestore is a local in-memory fake** (`test/fake-firestore.ts`) for every test in this review, not a real Firestore emulator. Rules enforcement, transaction semantics under real contention, and real network latency are not exercised by these tests.
- **This review covers the credential-export and OAuth-logging surface only**, per the task's own scope restriction. It makes no claim about any other part of either codebase.
- **The allowlist-based fix is only as complete as the five collections it was built from.** A sixth secret-bearing collection, not yet discovered, would fall back to the generic naming-pattern layer on both branches — real but weaker protection than an explicit allowlist, and the honest limitation of any finite audit.

## 9. Production deployment prerequisites

**Central finding of this review**: `main` (the repository's configured default/`HEAD` branch, confirmed via `git remote show origin`) contains the **complete, unpatched version of this vulnerability today** — not a historical state, not something fixed and then regressed, but code that has never received any part of the Phase 5F fix, because `claude/nhei-phase-1` (where that fix lives) has never been merged (confirmed via `git merge-base --is-ancestor claude/nhei-phase-1 origin/main`, which returns false). If `main` is what Cloud Run deploys from, this vulnerability is live in production right now, independent of anything on `claude/nhei-phase-1`.

Before any deployment of either fix:
1. **Confirm what `main` actually deploys to.** This review infers production relevance from `main` being the repo's default branch; it has not confirmed Cloud Run's build trigger configuration.
2. **An independent reviewer should re-read `export-credential-sanitiser.ts`'s allowlist against both branches' actual current field shapes** (this review did so manually, documented in §3/§4, but a second reader should not take that on faith).
3. **A decision on the §7 historical-exposure questions** (log search, possible precautionary token revocation) should happen before or alongside deployment, not be silently skipped because this review couldn't do it.
4. **The `security/credential-export-hotfix` branch is NOT pushed to `origin`** — it exists only in this session's local worktree. Pushing it (so it can be opened as a PR against `main`) requires the explicit go-ahead the standing instructions for this session require before pushing a new branch. This review stops here rather than doing so unilaterally.
5. **Merging the `claude/nhei-phase-1` commits containing this fix is a separate decision** from shipping the `main`-targeted hotfix — the two branches have diverged by hundreds of unrelated commits (NHEI, Agentic Nova, Calendar Protection, none of it reviewed or authorised for production here), so the right path is very likely the isolated `main`-targeted branch, not a merge of the feature branch itself.

## 10. Ship/no-ship recommendation

**No-ship, pending the four prerequisites in §9 — but with an explicit urgency note the standing "stop before merge or deployment" instruction does not on its own convey**: the vulnerability this review re-confirms is not hypothetically live somewhere — it is the current, unpatched state of the branch this repository treats as its default. The security remediation itself (§3) is complete, independently reviewable, and backed by a fully green regression suite on both branches (§5); nothing about the fix's correctness is a reason to hold it. The only reasons to hold are procedural: confirming `main`'s deployment relevance, and getting the explicit authorisation this session's standing instructions require before pushing a new branch or opening a PR against `main`. Once a human confirms those two things, this hotfix is ready to ship as-is.
