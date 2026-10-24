# Nova Calendar Protection — Phase 5J: Pilot Safety & Approval Integrity

Delivery report for directive "PHASE 5J — CALENDAR PILOT SAFETY & APPROVAL INTEGRITY." Scope: resolve the approval-integrity, permission-scope, and release-control questions blocking any live Calendar Protection pilot. No real calendar execution, no live OAuth, no merge, no deploy, no touch to security PR #140 — all confirmed held throughout (§8 below).

## 1. Starting and ending state

- **Starting pushed SHA:** `4031ecc` (last commit of Phase 5I, "NHEI Phase 5I: Google Calendar connector factory, Modify pathway, connection UX").
- **Ending pushed SHA:** `670a9f5` (this phase's second and final commit, pushed to `claude/nhei-phase-1`).
- Two commits were made and pushed this phase:
  - `8631349` — the main Phase 5J change set (§2–§4 below).
  - `670a9f5` — a follow-up fix to a pre-existing test file whose shared test uid needed seeding for the new pilot-eligibility check (found while re-running the full suite in §6).
- Branch, working tree, and global kill switch were re-verified at the start of this phase (directive §1) exactly as reported previously: `CALENDAR_PROTECTION_EXECUTION_ENABLED` hardcoded `false` in `nova-calendar-protection-service.ts`, no uncommitted changes, no drift from Phase 5I's own delivery report.

## 2. Files changed this phase

| File | Change |
|---|---|
| `nova-calendar-pilot-eligibility.ts` | **New.** Fifth execution-authorisation layer: admin-only, fail-closed pilot-eligibility gate. |
| `nova-calendar-protection-service.ts` | Added `supersedes`/`supersededBy` fields and the supersession transaction logic; added the pilot-eligibility check to `executeCalendarProtectionProposal`; made `recordCalendarProtectionApproval`/`retryCalendarProtectionExecution` transactional and supersession-aware; corrected header comments proven inaccurate by this phase's own audit. |
| `server.ts` | Added `supersedesProposalId` to the propose route's schema and `cannot_supersede:` error handling; changed the retry route's error status to 409; added the two admin pilot-eligibility routes. |
| `src/lib/auth.tsx` | Removed the redundant `calendar.readonly` scope from `signInWithGoogleCalendar`. |
| `src/components/IntegrationsDashboard.tsx` | Corrected the "Google Workspace" / `google_calendar_actions` card copy and header comments to state the real, now fully audited scope boundary. |
| `src/components/NovaTakeTheLoad.tsx` | Wired `supersedesProposalId` into Modify; added UI states for a proposal that was superseded or whose decision/execution reports `superseded`. |
| `nova-calendar-protection-service.test.ts` | +~13 supersession tests, +6 pilot-eligibility tests; seeded the shared test uid as pilot-eligible. |
| `nova-calendar-protection-route.test.ts` | +5 supersession route tests, +7 admin pilot-eligibility route tests. |
| `nova-calendar-protection-service.emulator.test.ts` | +2 real-Firestore-emulator supersession race describe blocks; seeded pilot eligibility inside the shared `approvedProposal` helper. |
| `nova-phase5c-agentic-journey.test.ts` | Seeded pilot eligibility for its shared journey uid (found during §6's full-suite re-run, fixed in the second commit). |
| `src/lib/auth.test.ts` | Updated/added scope-assertion tests. |
| `src/components/NovaTakeTheLoad.test.tsx` | Extended the Modify test; added a "resume a superseded proposal" test. |

No file outside Calendar Protection / Google Calendar integration / the admin route layer was touched. PR #140 was not opened, read, or referenced by any tool call this phase.

## 3. §2 — Was the Modify workflow's stale-approval flaw real?

**Yes, confirmed.** Phase 5I's own Modify implementation created a new proposal with a new fingerprint but never touched the original proposal's record at all — no field, no state transition, nothing. If a user approved the original, then clicked Modify, the original proposal remained sitting in Firestore with `state: 'approved'` and a still-valid, unexpired approval. Nothing before this phase checked whether a *newer* proposal existed for the same original before honouring that approval at retry or (if the kill switch were ever lifted) execute time. The flaw was real and matched the directive's suspicion exactly: an approval could out-live the proposal the user believed they were approving.

**Remediation implemented:**
- Two new fields, `supersedes: string | null` / `supersededBy: string | null`, added to `NovaCalendarProtectionProposal`.
- `prepareCalendarProtectionProposal` takes an optional `{ supersedesProposalId }` and, when present, runs a single `db.runTransaction` that reads and validates the original (must exist, must not already be superseded, must not be in `NON_SUPERSEDABLE_STATES` — `confirmed`/`executing`/`undoing`/`undone`/`ambiguous`, i.e. states where the real world has already been or might be being touched) and writes both the original's `supersededBy` and the new proposal in the same atomic transaction. Firestore's own optimistic-concurrency conflict detection — not any new locking this phase invented — is what makes concurrent races resolve safely.
- `recordCalendarProtectionApproval`, `executeCalendarProtectionProposal`, and `retryCalendarProtectionExecution` were each made to check `supersededBy` (independently of, and before any `state`-based check) and refuse with an honest `'superseded'`/`cannot_supersede:` outcome rather than silently succeeding or silently failing.
- `state` itself is never rewritten by supersession — a superseded proposal's own history (`approved`, `declined`, `failed`, whatever it legitimately reached) stays truthful; only the new `supersededBy` link says it was replaced. Audit records (`calendar_protection_audit`) are unaffected and continue to record each proposal's own real transitions, so the original/replacement relationship is reconstructible from `supersedes`/`supersededBy` without rewriting any historical row.
- Client-side navigation was never, and is still never, treated as revocation anywhere in this codebase — the only way a proposal becomes superseded is the server-side transaction above, triggered by an explicit Modify submission that itself requires its own full approval cycle (present → approve → fingerprint match) before it can do anything.

**Concurrency results:** two new Firestore-**emulator** (real Admin SDK, real transaction semantics, not the in-memory fake) describe blocks were added:
- Concurrent supersede vs. execute on the same approved proposal: the connector is **never** invoked more than once, and the two possible real-timing outcomes (execute wins and confirms; supersede wins and execute correctly reports `superseded`) are mutually exclusive, proven against the actual emulator rather than assumed.
- Concurrent double-supersede of the same original: exactly one of two simultaneous Modify submissions commits; the other is refused with a `cannot_supersede:` error; the original's `supersededBy` points at exactly the one that won, never silently overwritten by the second.

Existing idempotency (same `idempotencyKey` → same proposal) and reconciliation (ambiguous-outcome search-and-resolve) behaviour were not touched and remain covered by their own pre-existing tests, re-run green this phase.

## 4. §3 — Google Workspace OAuth scope audit

**Finding:** `calendar.events` (requested by the client-side `signInWithGoogleCalendar` Firebase popup flow) already includes read access to calendar data — Google does not have a narrower "read events" scope above `calendar.readonly` itself, and every real consumer in this codebase (`calendar-signals.ts`, `gmail-signals.ts`) only ever reads `calendars/primary/events`. The separately-requested `calendar.readonly` scope was therefore genuinely redundant and has been **removed**.

**`calendar.events` itself could not be removed**, and this phase's audit surfaced why that matters more than Phase 5I's own report understood: `src/lib/boundary-autopilot.ts`'s `declineCalendarEvent` function is a real, already-shipped, live Google Calendar **write** (a PATCH that flips the signed-in user's own attendee RSVP to "declined"), reachable today through `App.tsx`'s mounted `<BoundaryAutopilot>` feature, using exactly this client-held scope. Phase 5I's own delivery report, and this service file's own header comment, both stated flatly that "nothing uses this write scope" / "no code anywhere has ever made a write call with it." **Both statements were factually wrong**, and both have been corrected in this phase (this file's own header, and `IntegrationsDashboard.tsx`'s "Google Workspace" card description, which previously told users the connection was "view-only").

**Separate `google_calendar_actions` permission pathway:** confirmed untouched and still independent — it is a separate OAuth connection (server-side token, `calendar.events openid email` scope only, Phase 5I's own addition) used exclusively by Nova's Calendar Protection feature, with its own independent grant/revoke lifecycle. Narrowing or correcting the client-side "Google Workspace" connection's scope request has no effect on it.

**No silent expansion or revocation:** existing users who already granted the (now-removed-from-the-request) `calendar.readonly` scope keep whatever scopes their existing token already has — removing a scope from the *request* going forward does not retroactively revoke anything already granted, and nothing in this codebase re-validates a token's scope string against the current request shape. New sign-ins and re-consents going forward request one fewer, genuinely redundant scope. No user-visible disruption; no re-consent prompt forced.

**Separate-release/consent decision flagged honestly:** the actual scope now requested (`calendar.events` + `gmail.readonly`) is read-plus-write-capable on calendar events, not read-only, and genuinely needs to be, because of Boundary Autopilot's live decline feature. Whether that write capability's existence should be disclosed more prominently in the "Google Workspace" card's own copy (beyond the correction already made here) is left as a founder decision (§10).

## 5. §4 — Pilot restriction mechanism

A fifth, independent layer — `nova-calendar-pilot-eligibility.ts` — was added ahead of the existing per-proposal approval check, giving the full execution-authorisation chain this precedence contract:

1. **`CALENDAR_PROTECTION_EXECUTION_ENABLED`** — the global kill switch. Hardcoded `false`. Unconditional; nothing below can override it.
2. **Transaction-support check** — infrastructure capability (`db.runTransaction` must exist), checked before pilot eligibility so a db that cannot do transactions reliably fails closed on the *right* reason rather than a misleading `pilot_not_eligible`.
3. **Pilot eligibility** (this phase's new layer) — `users/{uid}/platform_pilot_access/calendar_protection`, written **only** by a new admin-only route, never by the user's own account. Fails closed on a missing document, a non-`true` `eligible` field, or any read error.
4. **Provider connection readiness** — the Google Calendar connector factory (Phase 5I).
5. **`allowCalendarActions`** — the user's own app-level consent (Phase 5D), still fully independent and self-service.
6. **The specific proposal's own approval** — fingerprint + TTL + (new, this phase) supersession check.

Two new admin routes (`POST`/`GET /api/admin/users/:uid/calendar-protection-pilot-eligibility`), gated by the existing `requireAdmin` helper, are the only writer and reader of this flag. Both are covered by new route tests: non-admin refused 403 (without touching stored state), unauthenticated refused, malformed body refused 400 (without writing), grant/revoke round-trips correctly and is readable back, each grant/revoke is logged via the existing `logAdminAction` audit mechanism, and — the specific safety property this layer exists to prove — **granting pilot eligibility to an account does not, by itself, authorise any real execution**: a fully approved proposal for a newly-"eligible" account still reports `execution_disabled` through the real route, because the kill switch (layer 1) still wins.

One real defect was found and fixed while writing this layer's own tests: `getCalendarProtectionPilotEligibility`'s "not eligible" return path unconditionally zeroed out `revokedAt`, so a just-revoked grant's own revocation timestamp could never be read back even though it was correctly written to Firestore. Fixed to surface the real `revokedAt` when a document exists but is explicitly not eligible, while still returning `null` (never a stale value) when no document exists at all.

No other feature-flag mechanism was reused or extended for this purpose — `feature-flags.ts` (client-side/localStorage) and the Evolution Engine's generic flag registry were both considered and rejected, since neither can enforce "server-authoritative, never client-settable, fails closed on missing config" the way a dedicated Firestore document under an admin-only write path can.

## 6. §5 — Error handling, privacy, and isolation re-audit

- **OAuth token refresh/revocation:** unaffected by the scope change — narrowing a scope *request* does not change how an already-issued token is refreshed or revoked; `google_calendar_actions`' own refresh/revoke logic (Phase 5I) was not touched.
- **Account identity / calendar selection, approval expiry, retry/idempotency, ambiguous outcomes, undo rules:** none of this phase's code touches `presentCalendarProtectionForApproval` or `undoCalendarProtectionProposal`. Confirmed proposals are structurally excluded from supersession (`confirmed` is in `NON_SUPERSEDABLE_STATES`), so undo's own invariants are unaffected by design, not by omission. Re-run green in the full suite (§7).
- **Account isolation / export / erasure:** the new `platform_pilot_access` document is a subcollection of `users/{uid}`, so it is already covered automatically by the existing GDPR export (`listCollections()`) and account-deletion (`recursiveDelete(userRef)`) routes — no entry needed in `user-data-collections.ts` (that file is only for top-level collections keyed by a `userId` field, which this is not). Verified by reading both routes directly rather than assuming.
- **Log/export sanitisation:** the new fields (`eligible`, `grantedAt`, `grantedBy`, `revokedAt`) and the new admin-audit-log action names were checked against `export-credential-sanitiser.ts`'s secret-field naming pattern — none match, nothing is dropped or needs to be.
- **PR #140:** never opened, read, or referenced by any tool call this phase.

No remediation beyond the `revokedAt` fix above (§5) was needed — this was a re-audit that found the architecture already sound against the new additions, not a section requiring new code.

## 7. Verification results

| Suite | Result |
|---|---|
| `npm run lint` (`tsc --noEmit`) | clean, 0 errors |
| `npx vitest run` (full suite) | **326 files / 4584 tests passed** (after fixing the one pre-existing journey test that needed pilot-eligibility seeding — see §1) |
| `npm run test:components` | **9 files / 77 tests passed** |
| `npm run test:emulator` (real Firestore emulator, started for this run) | **2 files / 21 tests passed**, including both new supersession-race describe blocks |
| Playwright `desktop-chromium` + `mobile-chromium` (`tests/e2e/nhei-phase5-journey.spec.ts`) | **38/38 passed** (19 scenarios × 2 viewports) |

**The first full-suite run surfaced a real gap, not a false pass:** 3 tests in `nova-phase5c-agentic-journey.test.ts` failed with `pilot_not_eligible` after the pilot-eligibility check was added to `executeCalendarProtectionProposal` — that file's shared test uid had never been seeded as pilot-eligible, since it predates this phase's §4 work. Fixed by seeding it in `beforeEach`, the same pattern already used in the two calendar-protection test files. Re-run confirmed all 4584 tests green. This is reported honestly as a finding the test suite itself caught, not hidden.

Playwright's spec exercises the shared Nova journey mock (Phase 5E), not a Calendar-Protection-specific flow with Modify/supersession/pilot-eligibility — Calendar Protection has no dedicated Playwright spec of its own (see §10's last checklist item). It is still valuable regression evidence: it proves nothing in this phase's changes broke the shared `NovaTakeTheLoad`/`NovaAgenticJourney` component tree or its existing Calendar Protection review/approve/decline states in a real browser, at both viewports.

**Production execution route unreachability re-confirmed:** `nova-calendar-protection-route.test.ts`'s existing spy-based regression tests (Phase 5I, directive §9) — asserting `buildGoogleCalendarConnector`/`createRealGoogleCalendarHttpTransport` are never called on `/execute` or `/undo` — were re-run and remain green, unaffected by this phase's changes; no new call site to the real connector factory was added anywhere.

## 8. Safety boundaries — reconfirmed intact

- `CALENDAR_PROTECTION_EXECUTION_ENABLED` — unchanged, still hardcoded `false`.
- No real Google Calendar write performed by this phase. No live OAuth authentication performed.
- No merge to main, no deployment.
- No change to, or interaction with, security PR #140.
- No pilot-eligibility grant was made to any real account by this phase — the admin route exists and is tested, but nothing in this codebase calls it outside tests.
- Supersession and pilot-eligibility are both additive, fail-closed layers — no existing idempotency, reconciliation, or kill-switch check was weakened, relaxed, or bypassed anywhere this phase touched.

## 9. Outstanding Google Cloud configuration (unchanged from Phase 5I)

Nothing in this phase required or performed any Google Cloud Console action. The items Phase 5I's own report listed remain exactly as outstanding as before:
- Real OAuth Client ID/Secret for `google_calendar_actions`, not yet created.
- Google consent-screen verification for the `calendar.events` scope, not yet started.
- Redirect URI registration, pending a known production `APP_URL`.

## 10. Remaining prerequisites for a restricted real-world pilot

- [ ] Google Cloud OAuth client created, consent screen verified for `calendar.events`.
- [ ] `GOOGLE_CALENDAR_ACTIONS_CLIENT_ID`/`SECRET` set in the real deployment environment.
- [ ] Redirect URI registered against the real `APP_URL`.
- [ ] A small number of named pilot accounts explicitly chosen, then granted via the new admin route (never a blanket rollout — the route takes one uid at a time, by design).
- [ ] `CALENDAR_PROTECTION_EXECUTION_ENABLED` flipped to `true` — this phase deliberately does not make or prepare that decision; it remains a single hardcoded constant a founder must change and redeploy.
- [ ] One live, supervised end-to-end test (propose → approve → execute → verify the real event → undo → verify removal) before any pilot user is exposed.
- [ ] A dedicated Playwright spec for the Calendar Protection flow, if browser-level pilot confidence beyond the component/route/emulator layers already in place is wanted before go-live (not built this phase — flagged as a gap, not hidden).

## 11. Explicit founder decisions needed

1. **Who gets a real connection first, and how many** — this phase builds the *mechanism* to restrict a pilot to named accounts; it does not choose those accounts.
2. **Whether Boundary Autopilot's write capability through the "Google Workspace" connection should be disclosed more prominently**, now that this phase has corrected the record that it exists and is live (§4). The UI copy has been corrected to state the fact; whether that is sufficient disclosure, or whether a more explicit consent moment is wanted for that specific write action, is a product decision this phase does not make.
3. **Google's consent-screen verification timeline** for `calendar.events` on `google_calendar_actions` — unchanged from Phase 5I's own assessment, still the longest single lead-time item outside this codebase's control.
4. **Whether a dedicated Playwright spec for Calendar Protection is wanted before a real pilot**, given today's coverage comes from the component/route/emulator layers rather than a full real-browser run of this specific feature (§10's last item).

---

Per the directive: stopping here. No merge, no deployment, no real external writes, no live OAuth operations, and no interaction with PR #140 were performed at any point in this phase.
