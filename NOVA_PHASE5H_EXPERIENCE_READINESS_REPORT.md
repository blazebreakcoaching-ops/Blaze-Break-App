# Nova Phase 5H — User Experience Completion & Action Readiness — Delivery Report

Branch: `claude/nhei-phase-1`. Builds on Phase 5G Experience Integration.
Does not merge, deploy, enable real calendar/task writes, activate NHEI
personal modes, or touch PR #140.

## 1. Starting / ending SHAs

- **Starting SHA**: `a734312` ("Clarify the delivery report's ending-SHA
  note to avoid a self-reference" — the tip of `origin/claude/nhei-phase-1`
  at the start of this phase; confirmed identical local/remote, clean
  working tree).
- **Ending SHA**: the commit landing immediately after this report in
  `git log` on this same branch (see push confirmation).

## 2. Files changed

- `src/components/NovaTakeTheLoad.tsx` + `.test.tsx` — the two lint
  fixes (§3 below), a "Resume" affordance on history entries, and the
  outcome-feedback route's server-side state gate reflected client-side.
- `src/components/NovaTaskDeferral.tsx` + `.test.tsx` — the same
  "Resume" affordance on history entries.
- `server.ts` — the Calendar Protection outcome route hardened with
  ownership + valid-state checks (§4).
- `nova-calendar-protection-route.test.ts` — route tests for the
  hardened outcome endpoint (409/404/200/duplicate-submission).
- `nova-google-calendar-adapter.ts` — corrected a stale header comment
  (§6).
- `tests/e2e/nhei-phase5-journey.spec.ts` — three new Playwright tests,
  each run on both desktop and mobile Chromium (6 test runs total): two
  "resume after a real browser reload" journeys (Calendar Protection,
  Task Deferral), and one full decline/failed-scenario journey with
  resume (Task Deferral).
- This report.

## 3. Resolved lint issues

Both pre-existing `react-hooks/set-state-in-effect` errors in
`NovaTakeTheLoad.tsx` are fixed, without changing behaviour:

- The `initialTitle` → `title` mirror moved from a `useEffect` into the
  React-documented "adjust state during render" pattern (a
  `prevInitialTitle` comparison, updating `title` synchronously during
  render instead of in a later effect) — same result (title updates
  exactly once per new, non-empty `initialTitle`), zero behaviour
  change, verified empirically against a scratch test file before
  touching the real component.
- The calendar-action-permission fetch-on-mount moved from a
  `useCallback` called by a second effect (the exact shape the rule
  flags) to a single effect with an inline async IIFE and an `ignore`
  guard — the same real request and the same fallback on failure, now
  also safe against a late response after unmount.

Verified: `npx eslint src/components/NovaTakeTheLoad.tsx` → 0 problems
(previously 2 errors). `npx tsc --noEmit` → clean. Full Vitest suite →
**4522/4522 passed**. Full component suite → **75/75 passed**. The rule
is NOT disabled or suppressed anywhere; this is a structural fix.
(Context: the same rule reports 70 similar findings across
`src/components` as a whole — a pre-existing, codebase-wide pattern.
Fixing only the two named in this phase's directive was the correct
scope; fixing the other 68 would be an unrelated-module expansion this
directive explicitly asked not to do.)

## 4. Progress-resume behaviour

**Audited what survives each scenario:**

| Scenario | What survives | What doesn't (by design) |
|---|---|---|
| Moving between journey steps | A real, already-prepared Calendar Protection/Task Deferral proposal (server-persisted) | The journey's own step/history navigation state (in-memory, intentional) |
| Navigating away and back | Same as above, reachable via **Show my history → Resume** (new this phase) | Invisible Load items, proactive-suggestion drafts, Before Words free text (all in-memory, intentional) |
| Browser refresh | Same as above — verified with a real `page.reload()` in two new Playwright tests | All in-memory React state, including the on-screen proposal before Resume is clicked |
| Closing and reopening | Same as above (a real reload is the closest high-fidelity simulation available in this test harness) | Same as above |

**What was built:** a "Resume" button on each `history` entry in both
`NovaTakeTheLoad.tsx` and `NovaTaskDeferral.tsx`, calling the route each
screen's "current proposal" view already used
(`GET /api/nova/{calendar-protection,task-deferral}/:proposalId`) — no
new storage, no new route, reusing exactly the persistence the directive
asked to reuse. Always an explicit click, never automatic. 2 new
component tests, 2 new Playwright tests (desktop + mobile; one per
workflow) drive a proposal to `awaiting_approval`, perform a **real
browser reload**, confirm the journey and the on-screen proposal are
genuinely gone, navigate back to a blank form, then explicitly resume
the real, still-persisted proposal.

**What correctly does NOT persist, confirmed by this audit, and why:**
Before Words free-text input, Invisible Load items, and
`NovaProactiveSuggestions` drafts all remain in-memory-only
(`useState`/lifted React state, never written to Firestore). This is
correct, not a gap — the directive is explicit that "sensitive Before
Words conversation content or new NHEI evidence" must never be silently
persisted, and Invisible Load items carry the same "temporary, not
saved" framing its own header already documents. No change was made
here; the audit confirms the existing design is already correct.

## 5. Outcome and action-state verification

Re-verified the full state vocabulary (suggestion / draft proposal /
approved proposal / simulation / real-world action / user-confirmed
outcome) is distinct and accurately worded on both screens:

- `prepared`/`awaiting_approval` → "...nothing has happened yet" (both
  workflows, identical wording).
- `approved` → "Approved - not yet applied" (both workflows).
- Task Deferral `confirmed` → "Simulation completed. The proposed
  change was saved to a practice task list only - no real Asana,
  Monday, or Jira task was modified."
- Calendar Protection `confirmed` → "This was actually applied to your
  calendar." — and Calendar Protection's own `execute` route still
  **always** returns `execution_disabled` (re-confirmed by this phase's
  route tests), so this state is truthfully unreachable in the current
  deployment; the UI's own `execution_disabled` explanation ("Real
  execution is turned off platform-wide right now - this was approved,
  but nothing was actually sent to your calendar") is the one users will
  actually see.
- User-confirmed outcome → "Thanks - noted." (both workflows), never
  inferring wellbeing from the approval/simulation/state transition
  alone (unchanged from Phase 5G's own discipline, re-verified).

**Calendar Protection outcome endpoint hardening** (the directive's
specific ask): `POST /api/nova/calendar-protection/:proposalId/outcome`
now enforces, server-side, not just client-side:

- **Input validation** (pre-existing, unchanged): the `outcome` enum via
  zod schema → 400 on an invalid value.
- **Ownership**: the referenced proposal must be a real document under
  `users/{uid}/calendar_protection_proposals` for THIS authenticated
  uid → 404 for a nonexistent id, and 404 (not account isolation
  by accident, but an explicit existence check) for another user's real
  proposal id.
- **Valid state**: feedback is refused with 409 unless that proposal's
  own state is `confirmed` — the UI already gated on this, but nothing
  previously stopped a direct API call from recording feedback for
  "this helped" against a proposal that was never actually applied.
  Feedback can no longer be offered, or accepted, "as though a real
  action occurred when no action occurred."
- **Duplicate submission**: unchanged, already correct — one document
  per (workflow, itemId); a resubmission (e.g. the user changes their
  mind) replaces the prior answer rather than erroring or accumulating.

6 new/rewritten route tests cover all four properties, including
writing a `confirmed` state directly into the fake Firestore (since
real execution staying disabled means the real route can never produce
that state on its own today — documented in the test itself, not
hidden).

## 6. Desktop/mobile test results

- **Full Playwright suite** (`tests/e2e/nhei-phase5-journey.spec.ts`,
  desktop + mobile Chromium): **38 passed**, 0 failed (32 pre-existing
  test runs + 6 new test runs from this phase's 3 new test cases, each
  run on both viewports).
- **Full default Vitest suite**: **4522/4522 passed**.
- **Full component Vitest suite**: **75/75 passed**.
- **TypeScript** (`tsc --noEmit`): clean.
- **Changed-file ESLint**: 0 errors across all 8 changed files (44
  pre-existing warnings remain in `server.ts`, all unrelated to this
  phase's diff lines — confirmed via `git diff` that none of this
  phase's additions introduced a new finding).

## 7. Firestore emulator results

Started a real Firestore emulator (`npx --yes firebase-tools@latest
emulators:start --only firestore`) and ran `npm run test:emulator`:

```
Test Files  2 passed (2)
     Tests  19 passed (19)
```

No emulator-layer code changed this phase (the outcome-route hardening
reads/writes through the existing Firestore collections with no schema
change), so this is a clean re-confirmation, not new coverage — included
per the directive's explicit "where applicable."

## 8. External Google Calendar readiness checklist

A real, material finding from this audit: **`nova-google-calendar-adapter.ts`'s
own header comment was stale and wrong** — it claimed no server-side
OAuth token storage exists for Google Calendar. That claim was already
false the moment it was written: `OAUTH_PROVIDERS.google_calendar_actions`
in `server.ts` (added in the same Phase 5E commit) is a real, tested
PKCE connect/callback/disconnect flow. The comment has been corrected
in place (see file changes above) so a future reviewer isn't misled.
Corrected checklist, by tier:

**1. Implemented and verified (real, tested code):**
- `google_calendar_actions` OAuth connect/callback/disconnect: PKCE,
  `calendar.events` scope, `access_type=offline`+`prompt=consent` for a
  durable refresh token, account-identity capture, revoke-on-disconnect
  — all covered by `oauth-integrations.route.test.ts`.
- Pure Google Calendar Events API request builders
  (`nova-google-calendar-adapter.ts`) and a real, testable connector
  (request/response/error-handling, reconciliation-by-search support)
  against an injected transport (`nova-google-calendar-connector.ts`).
- Credential export/sanitisation coverage for this provider
  (`export-credential-sanitiser.test.ts`, `user-data-endpoints.route.test.ts`).
- The entire Calendar Protection proposal/approval/outcome-feedback UI
  and server pipeline (Phases 5D–5H) — fully real and tested end to end,
  only waiting on the one missing wiring step below.

**2. Implemented but not externally verified:**
- `nova-google-calendar-connector.ts` has never been exercised against
  the real googleapis.com — every test uses an injected fake transport
  or a local mock HTTP server, by design (no `fetch` import anywhere in
  either file, confirmed by their own no-real-call audit tests).
- The `calendar.events` + `openid email` scope combination and the
  offline-refresh-token mechanism have never been exercised against a
  real Google OAuth consent screen.

**3. Configuration required:**
- Real Google Cloud project + OAuth 2.0 client credentials
  (`GOOGLE_CALENDAR_ACTIONS_CLIENT_ID`/`_SECRET`) — not confirmed to
  exist in any environment.
- Google's OAuth consent screen configured for the `calendar.events`
  scope, including Google's own app-verification review for this
  sensitive scope (the same requirement already flagged elsewhere in
  this codebase for other sensitive-scope providers).
- Redirect-URI allowlisting in Google Cloud Console per environment
  (dev/staging/prod).

**4. Security or operational review required:**
- The actual wiring: `executeCalendarProtectionProposal`'s call site in
  `server.ts` hardcodes `null` for the connector argument,
  unconditionally — confirmed by grep, nothing anywhere ever reads the
  stored `google_calendar_actions` token and passes it to a connector.
  This is the literal line that would turn "nothing is ever sent" into
  "something real is sent," and should get its own focused review when
  that decision is made.
- Token-refresh-on-expiry behaviour for this specific provider, through
  the generic OAuth refresh mechanism other providers already use, has
  not been specifically re-verified as part of this audit.
- Real-world error-handling (Google API rate limits, 429/5xx) is only
  tested against synthetic responses, never Google's actual failure
  modes.

**5. Explicit approval required:**
- Flipping `CALENDAR_PROTECTION_EXECUTION_ENABLED` from `false` to
  `true` in `nova-calendar-protection-service.ts`.
- Actually wiring a real connector into the execute route (tier 4 work,
  gated on this approval).
- Deciding how `calendar.events` write-scope consent is surfaced to
  users as distinct from any existing read-only calendar consent flow.
- Confirming Google's app-verification review has been completed before
  enabling for real users.

Neither `CALENDAR_PROTECTION_EXECUTION_ENABLED` nor the execute route's
`null` connector argument was touched this phase.

## 9. Outstanding blockers

- The Google Calendar wiring/activation chain above (tiers 3–5) — a
  product/security decision, not an engineering gap in what exists.
- The pre-existing, codebase-wide `react-hooks/set-state-in-effect`
  findings outside `NovaTakeTheLoad.tsx` (70 instances across
  `src/components`) — real, but explicitly out of this phase's scope.
- Calendar Protection has no "Modify" action analogous to Task
  Deferral's (only approve/decline/undo/start-new) — not requested by
  this phase's directive (§5 named Task Deferral specifically), noted
  for a future usability batch if desired.
- PR #140 was not touched, read, or referenced by any change in this
  phase.

## Recommended next capability

Given the actual state above, the single highest-value next step is
**not more UI polish** — the proposal/approval/outcome-feedback pipeline
is now thoroughly real, tested, and resumable on both workflows. It is
the **Google Calendar wiring decision** (tier 4/5 above): the OAuth
connect flow, the pure request builders, and the real connector logic
are ALL already built and tested — the only engineering work left is a
small, reviewable wiring change (passing a real connector instance into
`executeCalendarProtectionProposal`) gated behind an explicit go/no-go
decision on `CALENDAR_PROTECTION_EXECUTION_ENABLED`. That one decision
unlocks real value from four phases of otherwise-complete work, more
than any further UI-layer change would.
