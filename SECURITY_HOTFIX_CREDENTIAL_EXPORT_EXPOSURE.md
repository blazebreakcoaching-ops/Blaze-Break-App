# Security hotfix candidate: credential exposure via account data export and OAuth failure logs

**Status: NOT DEPLOYED. Awaiting independent review and an explicit human decision to ship as a hotfix.** This document is deliberately narrow — only the files below — so it can be reviewed and shipped on its own, independent of the rest of Phase 5F's unrelated work on the same branch.

## Severity and summary

`GET /api/user/export` (the GDPR "download my data" endpoint) returned several genuinely reusable credentials verbatim to the requesting user:

- `integration_tokens/{service}`: live OAuth **access and refresh tokens** for every connected provider (Slack, Jira, Asana, Calendly, Monday, and the newer Google Calendar Actions connection).
- `oauth_pkce/{service}`: a live PKCE **code_verifier**, if a connection attempt happened to be mid-flight.
- `security/mfa_totp`: the AES-256-GCM-**encrypted TOTP secret**, a pending enrollment secret, and **hashed recovery codes**.
- `recovery_ally/state`: a live bearer **`shareToken`** — the same token `where("shareToken", "==", token)` lookups in the ally-consent routes accept, i.e. a real magic-link credential, not just metadata.

None of this requires an attacker to compromise anything beyond the export file itself once downloaded: email, cloud-storage sync, a shared device, or a support ticket attachment are all realistic ways that file leaves the user's direct control after the fact. A leaked `integration_tokens` entry lets whoever has it act as that user against the third-party provider (read/write Slack messages, Jira tickets, etc., per whatever scope was granted) until the token is revoked or expires. A leaked `recovery_ally.shareToken` lets whoever has it claim a pending Recovery Ally invitation before the real invitee does.

Separately, three `logger.error` calls in the OAuth connect/callback/refresh flow (`server.ts`) logged a provider's raw token-endpoint response body verbatim whenever the exchange or refresh failed — and a response can carry a real `access_token`/`refresh_token` alongside an `error` field (this happens with some providers), so a "failure" log line was not guaranteed to be free of a live token either.

**No evidence either path was ever exploited** — this is a proactive finding from an internal audit (Phase 5F, directive §2), not a response to an incident report.

## What changed

1. **New file `export-credential-sanitiser.ts`** — a small, pure, independently-unit-tested module. Exports:
   - `sanitiseExportDoc(doc)` — removes every field whose name matches a credential-naming pattern (`accessToken`, `refreshToken`, `codeVerifier`, `shareToken`, `clientSecret`, anything containing `secret`/`credential`/`password`/`apiKey`, etc.), recursively through nested objects/arrays, plus an explicit list for the one field that doesn't match by name (`recoveryCodesHashed`). Returns the sanitised object and which field names were removed.
   - `sanitiseExportDocs(docs[])` / `sanitiseExportCollectionsMap(map)` — apply the above across an array or a whole `{ collectionId: docs[] }` map, marking a document `redactedForSecurity: true` only if something was actually removed from it.
   - Deliberately a **naming-pattern** policy, not a hand-picked list of the four collections named above — the explicit goal is to catch a field in a collection nobody has reviewed yet, not just the ones already found.

2. **`server.ts`, `GET /api/user/export`** — the collections map (both the generic per-subcollection dump and the stray top-level collections merged into it), the NHEI export bundle, and the root profile document are all passed through the sanitiser before being sent in the response. ~8 lines changed.

3. **`server.ts`, OAuth connect/callback/refresh (3 call sites)** — the `logger.error` calls that previously logged a provider's raw token response body now log `sanitiseExportDoc(body).doc` instead. ~3 lines changed.

4. **Tests** (all new, all passing): `export-credential-sanitiser.test.ts` (58 cases — the four known collections, a never-before-seen field name caught purely by the naming pattern, nested redaction, and proof that ordinary non-secret fields are completely unaffected); 3 new cases in `user-data-endpoints.route.test.ts` (a real HTTP response from the real Express app, with a sentinel secret seeded into each of the four collections, asserting the sentinel never appears anywhere in `JSON.stringify(response.body)`); 1 new case in `oauth-integrations.route.test.ts` (a sentinel token/secret injected into a simulated failed token-exchange response, asserting it never reaches the logger).

## What did NOT change

- No Firestore schema change. No existing document's stored shape changes — only what this one route echoes back.
- No change to how tokens are used, refreshed, or stored. The fix is entirely at the response-construction boundary.
- No change to any other route, any client-side code, or any UI.
- `CALENDAR_PROTECTION_EXECUTION_ENABLED` and every other feature flag are untouched.

## Review checklist for an independent reviewer

- [ ] Confirm `export-credential-sanitiser.ts`'s regex does not accidentally match a legitimate field name you'd expect to see in an export (the test file's "normal, non-secret user data is never touched" block lists the ones already checked — `title`, `createdAt`, `connectedAccountEmail`, `proposalId`, etc.).
- [ ] Confirm the four named collections' remaining (non-redacted) fields are still useful to the user (they are: connection timestamps, 2FA enabled/enrolled status, ally name/email/consent status — everything except the credential itself).
- [ ] Decide whether existing, already-downloaded exports (if any exist from before this fix) need a separate user notification — this patch cannot retroactively redact a file a user already has.
- [ ] Decide whether any already-exported token should be proactively rotated/revoked as a precaution, independent of whether exploitation is suspected.

## Suggested deployment path (not taken by this phase)

This is small enough to ship independently of the rest of Phase 5F: cherry-pick `export-credential-sanitiser.ts`, `export-credential-sanitiser.test.ts`, the `server.ts` diff (import line + the `/api/user/export` handler + the 3 logger.error call sites), and the 4 new test cases in the two existing route test files, onto whatever branch deploys to production, run the full test suite, and ship as a standalone hotfix release. **This phase does not do that — branch `claude/nhei-phase-1` is not merged or deployed, per every phase's own standing restriction.**
