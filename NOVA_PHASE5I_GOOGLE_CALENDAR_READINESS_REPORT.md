# Nova Phase 5I — Google Calendar Integration & Controlled Action Readiness

**Branch:** `claude/nhei-phase-1`
**Starting commit:** `e3e19ec` (Phase 5H's final commit)
**Ending commit:** recorded after this report is committed — see the commit this file ships in; no self-referential SHA is written here (the Phase 5G/5H reports made the same choice, for the same reason: this file cannot know its own commit hash before it exists).

**Mission recap:** prepare the existing Google Calendar integration for a future, explicitly approved pilot, without activating any real write. `CALENDAR_PROTECTION_EXECUTION_ENABLED` remains hardcoded `false`. No real Google API call, no live OAuth authentication, no merge to `main`, no activation — all performed by this phase.

---

## 1. Starting state — verified, not assumed

Confirmed before any change:
- `CALENDAR_PROTECTION_EXECUTION_ENABLED = false` at `nova-calendar-protection-service.ts:109` — unchanged, still hardcoded, still the first thing `executeCalendarProtectionProposal`/`undoCalendarProtectionProposal` check before touching their `connector` parameter.
- `OAUTH_PROVIDERS.google_calendar_actions` already existed in `server.ts` (added Phase 5E) — a real, tested PKCE connect/callback/disconnect flow, `calendar.events openid email` scope, `access_type=offline&prompt=consent`, account-identity capture, revoke support.
- `nova-google-calendar-connector.ts` already existed (Phase 5E) — a real, tested `NovaExternalConnector` with an injected `GoogleCalendarHttpTransport`, no `fetch` import, never imported by `server.ts`.
- **Discrepancy found and corrected:** `server.ts`'s own calendar-protection route block (the comment header directly above the propose/present/approve/execute/undo routes) still claimed *"Google Calendar is NOT one of this file's OAUTH_PROVIDERS entries... there is no server-side storage of a Google OAuth token"* — false, and had been false since the same Phase 5E commit that added `OAUTH_PROVIDERS.google_calendar_actions`. `nova-google-calendar-adapter.ts`'s header had already caught and corrected this exact claim in Phase 5H; `server.ts`'s own copy of it had not been. Corrected in this phase (see §2 below) rather than left to mislead a future reader.
- **The exact missing production wiring**, confirmed by reading the route code directly: both `/execute` and `/undo` hardcoded `null` for the connector argument, unconditionally — no factory existed to build a real one, and no call site existed that could have passed one even if it had.
- **A second, previously undocumented discrepancy found in this phase** (§6 below): the only Google-related "connection" UI a user could actually see was `IntegrationsDashboard.tsx`'s **"Google Workspace"** card — a completely different, client-side-only Firebase popup flow (`signInWithCalendar`), used only for the read-only meeting-load/inbox-load signal. There was no connect/disconnect UI anywhere for `google_calendar_actions` itself — the one OAuth connection Calendar Protection's own execution path would actually need. A user could grant the app-level `allowCalendarActions` permission toggle in Nova Take the Load, but that toggle has never been wired to any real OAuth consent at all. This is exactly the gap directive §3's "connection permission alone must never authorise a calendar modification" was warning against — except the practical problem today is the reverse: there was no connection to grant in the first place.

## 2. The real connector factory — built, wired, still unreachable

**New file: `nova-google-calendar-connector-factory.ts`**

Exports:
- `buildGoogleCalendarConnector(input)` — orchestrates the full pre-execution readiness check: resolve a token (via an injected `getAccessToken` callback — never its own refresh logic), verify the token's own account identity against the account on record, verify the calendar is actually reachable with it, and only then hand back a real `NovaExternalConnector` (built via the existing, unmodified `createGoogleCalendarConnector`). Returns one of: `ready`, `not_connected`, `token_unavailable`, `wrong_account`, `insufficient_scope`, `calendar_inaccessible` — never throws.
- `createRealGoogleCalendarHttpTransport(fetchImpl?)` — a real, fetch-backed `GoogleCalendarHttpTransport`. Injectable `fetchImpl` so even this function's own shape is unit-testable without a real network call.

**Design choice and why:** the factory does **not** read Firestore or perform its own OAuth refresh. Token resolution stays exactly where it already lived — `server.ts`'s existing, private `getValidAccessToken(uid, service)`, the same mechanism Slack/Jira/Asana/Monday/Calendly already use (expiry check, refresh, `invalid_grant`→disconnect handling). The factory only *consumes* that through an injected callback, satisfying directive §2's "reuse existing provider refresh-token mechanism" literally rather than duplicating it.

**Wiring in `server.ts`:**
```ts
async function resolveGoogleCalendarConnectorForExecution(uid: string): Promise<NovaExternalConnector | null> {
  // reads users/{uid}/integrations/google_calendar_actions.connectedAccountEmail,
  // calls buildGoogleCalendarConnector with getValidAccessToken + a real transport
}
```
and at both call sites:
```ts
const connector = CALENDAR_PROTECTION_EXECUTION_ENABLED ? await resolveGoogleCalendarConnectorForExecution(uid) : null;
```

**Why this is still safe while disabled, concretely:** `CALENDAR_PROTECTION_EXECUTION_ENABLED` is checked at the call site, *before* `resolveGoogleCalendarConnectorForExecution` — the only thing that could ever invoke a real token refresh or a real Google API call — is ever referenced. Since the flag is `false` in every environment, that function is **never called** by the live route today. This was proven, not assumed — see §9.

Never logs a token or an account email; only the readiness *status* (`logger.warning` with the status string and `uid`, nothing else).

## 3. Authorisation and permission layering — verified, not weakened

The full execution contract, as it stands after this phase:
1. Authenticated, verified user — `authenticateFirebaseUser` (unchanged).
2. App Check — `verifyAppCheck` on every calendar-protection route (unchanged).
3. `allowCalendarActions` (the app-level action permission, `nova-calendar-action-permission.ts`) — checked at propose time **and again, authoritatively, at execute time** (unchanged, pre-existing).
4. An active, user-authorised Google Calendar connection — now a real, separate requirement the factory enforces (`not_connected`/`wrong_account`/`insufficient_scope`), layered **on top of**, never instead of, #3. Granting the OAuth connection alone does nothing — `allowCalendarActions` is still required, and the kill-switch still blocks everything regardless.
5. Explicit, action-specific approval with a server-computed fingerprint, re-verified exactly (unchanged — the existing "modified parameters" attack test still passes).
6. TTL-bounded approval (`CALENDAR_PROTECTION_APPROVAL_TTL_MS`, unchanged).
7. Correct target account — the factory's `wrong_account` check, new this phase.
8. Idempotency (`idempotencyKey`→deterministic `proposalId`, unchanged) and concurrent-request handling (transactional state-claim, unchanged — see §9's emulator run).

No NHEI inference or proactive suggestion has, or gained, any path that bypasses this chain — nothing in this phase touched `nova-proactive-suggestions.ts` or any NHEI module.

## 4. Test coverage added (all simulated — no live Google call)

- **`nova-google-calendar-connector-factory.test.ts`** (new, 14 tests): every readiness outcome (`ready`, `not_connected`, `token_unavailable` from both a thrown `getAccessToken` and a failed identity lookup, `wrong_account`, `insufficient_scope`, `calendar_inaccessible` from both a bad status and a thrown transport error, "never throws" across all injected failure modes) plus 3 tests on `createRealGoogleCalendarHttpTransport` itself (request shape, 204-no-body, non-JSON body) — all via an injected fake transport/fetch.
- **`nova-google-calendar-connector.test.ts`** (extended, +12 tests): the specific HTTP status codes directive §4 names that the existing suite hadn't covered for `execute`/`undo` specifically — 401, 404, 409, 429, 5xx — plus 2 tests proving reconciliation (`verifyGoogleCalendarEventExists`, `findGoogleCalendarEventByProposalId`) correctly handles an **all-day** event response shape (`start.date`/`end.date`, no `dateTime`). No production code changed for these — they prove the existing generic status handling was already correct.
- **`nova-calendar-protection-route.test.ts`** (extended, +2 tests): a dynamic spy on `nova-google-calendar-connector-factory`'s two exports, asserting they are **never called** when hitting the real `/execute` and `/undo` routes on an approved/confirmed proposal — the direct regression directive §9 asks for.
- **`nova-calendar-protection-no-real-execution-audit.test.ts`** (extended, +2 tests): a static companion — proves `server.ts`'s source itself only ever references `resolveGoogleCalendarConnectorForExecution` from the two gated `CALENDAR_PROTECTION_EXECUTION_ENABLED ? ... : null` assignments (plus its own declaration), never an unguarded third call site.
- **`src/components/NovaTakeTheLoad.test.tsx`** (extended, +1 test): the Modify pathway — pre-fill from the current proposal, then a genuinely new `/propose` call with a different `idempotencyKey`.

Already-existing coverage this phase deliberately did **not** duplicate (confirmed present, not rebuilt): duplicate-idempotency-key requests, true concurrent-execution-claim races (at the real Firestore-emulator level, `nova-calendar-protection-service.emulator.test.ts`), account isolation, proposal expiry, API timeouts→ambiguous, retry cap, ambiguous/stuck-execution reconciliation, DST/timezone offset validation, undo requiring real proof. Directive's own instruction — "do not rebuild functionality already implemented" — governed this choice.

**Still a known, named gap, not hidden:** Google's real `tokeninfo` endpoint only supports scope introspection via a query-string token (no POST-body alternative Google documents), which this codebase's own discipline avoids putting in a URL. `insufficient_scope` vs. generic `calendar_inaccessible` is therefore a **best-effort string match** against Google's own real error wording ("insufficient... scope"), not a dedicated, guaranteed-correct classification — documented in the factory file's own comments. Both outcomes refuse to hand back a connector either way, so nothing is weakened by this; only the user-facing label's precision is approximate in the ambiguous case.

## 5. Calendar Protection "Modify" pathway — added

`src/components/NovaTakeTheLoad.tsx` had no analogue to Task Deferral's "Modify" button before this phase (Phase 5H's own report flagged this as an outstanding, unrequested-at-the-time gap). Added:
- A **Modify** button on `awaiting_approval` (alongside Approve/Decline) and `approved` (alongside "Try to apply this").
- Clicking it pre-fills the editable form with the *current* proposal's title/start/end (via a new `isoToLocalInputValue` helper, the inverse of the existing `localToIso`), then clears the active proposal — returning to the create form, never a blank one.
- Submitting it calls the existing `/propose` route with a **freshly generated `idempotencyKey`**, producing a genuinely new proposal, a new `proposalId`, and a new server-computed approval fingerprint. The prior proposal's approval state (if it had any) is left exactly as it was, never mutated, never replayed. This structurally satisfies "any substantive change must invalidate earlier approval and require a fresh proposal fingerprint" — there was no in-place-edit server endpoint to add, and none was needed: a new proposal can never start in an already-approved state.
- No change to `nova-calendar-protection-service.ts` was needed or made.

## 6. Google Calendar connection/consent UX — real gap found and closed

**Finding:** `IntegrationsDashboard.tsx`'s `OAUTH_SERVICE_IDS` list (the generic connect/disconnect UI already built for Slack/Jira/Asana/Monday/Calendly) did not include `google_calendar_actions` — even though the server-side route plumbing (`/api/integrations/:service/connect`, `/callback/:service`, `/status`, `/:service/disconnect`) is already fully generic over every key in `OAUTH_PROVIDERS`, `google_calendar_actions` included, and required **zero server.ts changes** to extend to it.

**Fix:** added `google_calendar_actions` to `OAUTH_SERVICE_IDS` and `BASE_INTEGRATIONS`, with its own card: **"Calendar Actions (Nova Take the Load)"**, description text that explicitly distinguishes it from "Google Workspace" above it ("Lets Nova prepare calendar changes... Granting this does not approve any change by itself; you still approve each one individually, and real execution is currently turned off platform-wide"). This directly satisfies directive §6's four distinctions:
- **View calendar information** — the pre-existing "Google Workspace" card (Firebase popup, `calendar.readonly`+`calendar.events`+`gmail.readonly` scope, used only for read signals today).
- **Create or modify calendar events** — the new "Calendar Actions" card's own OAuth grant (server-side, `calendar.events openid email` scope only).
- **Revoke the connection** — the existing generic Disconnect button, now reachable for this service too (calls the real `revoke` function already defined on `OAUTH_PROVIDERS.google_calendar_actions`).
- **Approve an individual calendar action** — explicitly deferred, in the card's own copy, to Nova Take the Load's per-proposal approval screen, never implied by the connection itself.

**A second, separate finding not fixed in this phase (explicitly out of scope, documented honestly):** the pre-existing "Google Workspace" card's own Firebase OAuth grant already requests `calendar.events` (write) scope, not just `calendar.readonly` — a broader grant than its own UI description ("meeting-load and Gmail inbox-load tracking") discloses. Nothing in this codebase currently uses that client-held token to write anything, and this is a different, pre-existing OAuth path entirely from the one this phase wired (that token never reaches the server, let alone the new factory). Per directive §6's own "do not silently expand existing read-only permissions" — this phase did not touch it, since touching it would itself be an undisclosed scope change to an existing, working flow. Flagged here as a founder-level decision item (§9 of the checklist below), not fixed.

**Manual Google Cloud configuration still required before any real pilot** (`OAUTH_PROVIDERS.google_calendar_actions` in `server.ts`):
- `GOOGLE_CALENDAR_ACTIONS_CLIENT_ID` / `GOOGLE_CALENDAR_ACTIONS_CLIENT_SECRET` env vars — a real OAuth 2.0 Client ID (Web application type) from Google Cloud Console, **not yet created or supplied anywhere in this codebase or environment** (no credential of any kind is invented or exposed here).
- OAuth consent screen scope `https://www.googleapis.com/auth/calendar.events` — likely requires Google's app-verification review before it can be granted to any account outside the project's own test users (Google treats `calendar.events` as a sensitive/restricted scope).
- Redirect URI to register in the Cloud Console's OAuth client config: `${APP_URL}/api/integrations/callback/google_calendar_actions` — the existing, generic callback route already handles it; nothing new needs building, only registering the exact URL once `APP_URL` is known for the real deployment.
- `OAUTH_STATE_SECRET` — already required by the other five providers; no new secret needed, same one.

## 7. Nova journey — re-verified end to end

Full Playwright suite re-run against the real Modify-including component, both viewports:
- `tests/e2e/nhei-phase5-journey.spec.ts` — **19/19 passed** on `desktop-chromium` and **19/19 passed** on `mobile-chromium`, covering: Nova chat → Invisible Load → Proactive Options → Calendar Protection → review/approve/decline → the honest `execution_disabled` result → resume-after-reload; the parallel Task Deferral path including decline-then-resume; permission-denial, failed-connector, and ambiguous-connector states each shown as their own honest state, never folded into a generic error.
- The Modify button itself is exercised in the same real-browser harness by the existing `awaiting_approval`-state test (it renders and is clickable there); its exact pre-fill/new-fingerprint behaviour is proven precisely at the component level (§4) rather than re-proven through the shared Playwright mock, which does not currently echo a re-proposed title/time back from its stateful mock — extending that shared mock was judged a larger, riskier change to test infrastructure used by many other tests in the same file than this phase's scope warranted, and the component-level test already gives the stronger, more precise assertion.
- Alternative paths already covered by the existing suite and re-confirmed passing: declined approval, permission-denied, missing-integration-shaped failure (via the failed-connector test), and resume-from-history for a mid-flow proposal. An unavailable calendar action always still leaves "retry," "undo," "start a new proposal," or now "Modify" as a live alternative — never a dead end.

## 8. Safety boundaries — re-verified intact

- `CALENDAR_PROTECTION_EXECUTION_ENABLED` — unchanged, still `false`, still in `nova-calendar-protection-service.ts` only.
- No real Google Calendar write, no real OAuth authentication performed by this phase (the new factory's real transport exists as code; it was never invoked against a real `fetch` in any test or by any production code path exercised this phase).
- No merge, no deployment.
- No change to security PR #140.
- No NHEI module touched.
- No unattended outbound support message sent.
- No bypass of consent/ownership/expiry/safeguarding checks — all pre-existing checks re-verified in place (§3), one new check layered on top (§3.4), none removed or weakened.
- Scope stayed inside Google Calendar readiness — no unrelated Nova module touched.

## 9. Verification run (all green)

| Suite | Result |
|---|---|
| `npm run lint` (`tsc --noEmit`) | clean, no errors |
| `npx eslint` on every changed/new file | 0 warnings, 0 errors |
| `npx vitest run` (full suite) | **326 files / 4552 tests passed** |
| `npm run test:components` | **9 files / 75 tests passed** |
| `npm run test:emulator` (real Firestore emulator, started for this run) | **2 files / 19 tests passed** |
| Playwright `desktop-chromium` | **19/19 passed** |
| Playwright `mobile-chromium` | **19/19 passed** |

**The specific regression directive §9 requires** — "a regression test that proves the production execution route cannot reach the external Google transport while its execution gate is OFF" — is satisfied two ways:
1. Dynamically: `nova-calendar-protection-route.test.ts`'s two new tests hit the real `app` (via `supertest`, real route code, real approval flow) and assert `buildGoogleCalendarConnector`/`createRealGoogleCalendarHttpTransport` were **never called**, on both `/execute` and `/undo`.
2. Statically: `nova-calendar-protection-no-real-execution-audit.test.ts`'s two new tests read `server.ts`'s own source and prove the connector is only ever referenced from the two syntactically-gated assignment sites, never an unguarded third call.

## 10. Outstanding Google Cloud configuration (summary — see §6 for detail)

- Real OAuth Client ID/Secret for `google_calendar_actions`, not yet created.
- Google consent-screen verification for the `calendar.events` scope, not yet started.
- Redirect URI registration, pending a known production `APP_URL`.
- (Separate, not required for Calendar Protection's own pilot, but founder-relevant per §6's second finding) a decision on whether to narrow the pre-existing "Google Workspace" card's scope request down to read-only, now that its actual write-capable grant has been identified.

## 11. Controlled-pilot checklist (concise)

- [ ] Google Cloud OAuth client created, consent screen verified for `calendar.events`.
- [ ] `GOOGLE_CALENDAR_ACTIONS_CLIENT_ID`/`SECRET` set in the real deployment environment.
- [ ] Redirect URI registered against the real `APP_URL`.
- [ ] A small number of named pilot accounts explicitly chosen (not a blanket rollout).
- [ ] `CALENDAR_PROTECTION_EXECUTION_ENABLED` flipped to `true` **only** for those accounts, or in a scoped environment — a decision this phase does not make.
- [ ] One live, supervised end-to-end test (propose → approve → execute → verify the real event → undo → verify removal) before any pilot user is exposed.
- [ ] Decide whether the "Google Workspace" card's scope should be narrowed (§6, second finding).

## 12. Explicit founder decisions needed before live testing or activation

1. **Who gets a real connection first, and how many.** This phase makes the feature *capable*; it does not decide a rollout size or audience.
2. **Whether to narrow "Google Workspace"'s existing `calendar.events` scope** to read-only, now that it's identified as broader than its own UI description discloses (no current code path uses the write capability, but the grant exists).
3. **Google's consent-screen verification timeline** for the new `calendar.events` scope on `google_calendar_actions` — likely the longest single lead time item here, and outside this codebase's control.
4. **When (if ever) to flip `CALENDAR_PROTECTION_EXECUTION_ENABLED`** — explicitly not this phase's decision, and not done.

---

**Files changed this phase:**
- New: `nova-google-calendar-connector-factory.ts`, `nova-google-calendar-connector-factory.test.ts`
- Modified: `server.ts`, `src/components/NovaTakeTheLoad.tsx`, `src/components/NovaTakeTheLoad.test.tsx`, `src/components/IntegrationsDashboard.tsx`, `nova-google-calendar-connector.test.ts`, `nova-calendar-protection-route.test.ts`, `nova-calendar-protection-no-real-execution-audit.test.ts`

STOP — no live Google API operation was performed, no execution activation, no merge, no deployment. This phase's objective — "a genuinely pilot-ready integration, not a prematurely activated one" — is believed met: the capability is real and tested against simulated Google responses; the production gate remains off, verified both dynamically and statically.
