# Phase 5L — Unified Recovery Intelligence & Safe Integration

## 1. Starting and final pushed commit SHAs

- **Starting commit (Phase 5K's pushed end state):** `b956384` — "Phase 5K: Nova Unified Intelligence & Experience"
- **Final commit (this phase):** created and pushed below, on branch `claude/nhei-phase-1`.

## 2. Existing features reused (no new recovery engines built)

Per the mission statement ("do not rebuild existing recovery engines"), every
capability this phase connects to Nova's conversation was **already built**
in earlier phases:

- **`suggest_feature`** (`nova-tools.ts`) — the existing, closed-enum
  coordinator tool that already covered Boundary Architect (`communicate`),
  Anxiety Reset (`anxiety_reset`), Reset Studio (`reset`), Energy Delta
  (`recover`), and Recovery Fuel (`fuel`) as navigation-style offer cards.
  §3/§4/§5 of the directive are satisfied by this tool as-is — no new
  `offer_*` tools were added, because that would have violated §6's own
  "prevent duplicate offers from competing tools" and the mission's "do not
  introduce an additional overarching AI engine unless demonstrably
  necessary."
- **Boundary Architect** (`CommunicationGrid` under the `communicate` tab),
  **Anxiety Reset** (`AnxietyResetMode`), **Reset Studio** (`ResetStudio`),
  the **Energy Delta** tool set (`EnergyBudgetMatrix`, `MicroRecovery`,
  `OneLessThing`, `WorkloadRealityCheck`, etc.), and **Recovery Fuel**
  (`RecoveryFuelEngine`) — all opened unchanged by `suggest_feature`'s
  existing `tab`/`featureId` navigation.
- **`offer_practical_assistance`** and the Invisible Load/Calendar
  Protection/Task Deferral pathway — Phase 5K's coordinator, unchanged.
- **`guardianSupportInvitationEnabled`** pattern — the fail-closed,
  read-fresh-from-`process.env`-every-call release-gate shape that this
  phase's new flag (`novaAgenticJourneyEnabled`) directly mirrors.

## 3. New Nova conversational integrations this phase

- **`NOVA_AGENTIC_JOURNEY_ENABLED`** — a new fail-closed release flag
  (`nova-tools.ts`), enforced at both boundaries named in §2:
  - **Server:** `executeOfferPracticalAssistance` now returns `{ offered:
    false }` immediately when the flag is off, regardless of what the model
    requests — this closes the real gap found in §1 (Phase 5K's
    unconditional production mount of `NovaAgenticJourney` had no release
    flag at all).
  - **Client:** a new `GET /api/nova/journey-config` endpoint (auth-only)
    and `useNovaAgenticJourneyEnabled` hook (defaults to `false` until the
    fetch resolves) gate which component `App.tsx`'s `nova` tab mounts —
    `NovaAgenticJourney` only when the flag is on, otherwise the
    previously-approved bare `NovaChat`.
- **`ReturnToNovaLink`** (`src/components/ReturnToNovaLink.tsx`) — a small
  shared "Return to Nova chat" affordance, now present on the `communicate`,
  `anxiety_reset`, and `reset` tabs, making the "return to the conversation
  afterward" requirement in §3/§4 explicit and visible rather than relying
  on the sidebar alone.
- **Mutual-exclusion offer-card rendering** (`NovaChat.tsx`, `OmniNova.tsx`)
  — fixes a real §6 defect: the Guardian Support, Practical Assistance, and
  generic `suggest_feature` cards previously had independent render
  conditions and could stack. They now render in a fixed priority order
  (Guardian safety offer > Practical Assistance > generic suggestion), never
  more than one at once.
- **Per-featureId dismissal tracking** (`dismissedFeatureIdsRef`, both
  components) — fixes the other named §6 defect: once a user explicitly
  closes a `suggest_feature` offer for a specific feature (via Start, Open
  Tool, or Ignore), that exact `featureId` is never re-offered automatically
  for the rest of the session — satisfying Journey D's "respects the
  decision without repeating the same offer unnecessarily."
- **Voice parity** — a new `describe.each` block in
  `nova-live-websocket.test.ts` covering `suggest_feature` relay over the
  Live WebSocket harness for all five feature IDs (`communicate`,
  `anxiety_reset`, `reset`, `recover`, `fuel`), alongside the existing
  flag-gated `offer_practical_assistance` voice tests (now updated to set
  `NOVA_AGENTIC_JOURNEY_ENABLED=true` explicitly, plus a new test proving
  the tool is excluded from voice relay when the flag is off).

## 4. Release-boundary and privacy findings

- **Found and corrected (§1/§2):** Phase 5K mounted `NovaAgenticJourney` in
  production for every user unconditionally, with no release flag — a
  genuine release-process gap (not a safety gap; the underlying execution
  kill switches such as `CALENDAR_PROTECTION_EXECUTION_ENABLED` remained
  correctly off throughout). Closed with `NOVA_AGENTIC_JOURNEY_ENABLED`,
  off by default, matching the directive's explicit instruction not to
  treat a passing automated test as production-release authorisation.
- **Confirmed, no code change needed (§2):** the "URL bypass" vector (a
  user navigating directly to `dev-nhei-phase5-preview.html` in production)
  was already closed by the existing Vite/Express build architecture — a
  real `vite build` confirms the dev-preview entry is never copied into
  `dist/`, and production `server.ts` serves exclusively from
  `express.static(.../dist)`.
- **Confirmed unchanged (§7):** Before Words' temporary context
  (`beforeWordsContext`) remains quarantined into the ordinary, lower-trust
  `message` channel sent to the model — never the privileged
  `systemInstruction` channel. Before Words itself remains zero-persistence
  (no fetch/Firestore calls in either relevant file). No unapproved NHEI
  personal mode is activated or reachable; this phase added no new NHEI
  code paths. Existing Guardian and Recovery Ally external-contact
  boundaries are unchanged — no file touched by this phase overlaps them.
- **No expansion of data collection:** every new client/server addition
  this phase (the journey-config endpoint, the two dismissal refs, the
  nav-target test wiring) stores nothing new and collects nothing new.

## 5. Text/voice parity results

- Text: `suggest_feature` offers for all five feature IDs, dedup-after-
  dismissal, and mutual exclusion against Guardian/Practical-Assistance
  offers — all verified via real browser tests (Playwright) and the
  existing route-level flag tests.
- Voice: `suggest_feature` relay verified for all five feature IDs via the
  Live WebSocket test harness; `offer_practical_assistance`'s release gate
  verified identically on both the text route and the voice relay path
  (flag off → `{ offered: false }`/no message; flag on → normal behaviour).

## 6. User journey demonstrations (desktop + mobile)

All four journeys now have dedicated Playwright coverage in
`tests/e2e/nhei-phase5-journey.spec.ts`, run against both the
`desktop-chromium` and `mobile-chromium` projects:

- **Journey A** (workload pressure → Boundary Architect offer → Open Tool →
  navigation fires with `featureId: 'communicate'` → conversation history
  preserved underneath).
- **Journey B** (immediate grounding request → Anxiety Reset offer → Open
  Tool → navigation fires with `featureId: 'anxiety_reset'`).
- **Journey C** (Invisible Load/Task Deferral pathway) — covered by
  re-running the existing Phase 5K/5F Playwright tests unchanged; no
  regression.
- **Journey D** (decline → same `featureId` does not reappear on the very
  next turn with an identical offer).
- **Additional coverage beyond the four named journeys:** a mutual-exclusion
  test proving a Guardian offer and a generic `suggest_feature` offer never
  render stacked on the same turn.

A dedicated component test (`ReturnToNovaLink.test.tsx`) verifies the new
shared "Return to Nova chat" affordance renders accessibly and calls
`onNavigate('nova')`.

## 7. Test results

- **Full Vitest regression suite:** 4622 tests passed, 329 files — 0
  failures.
- **Component test suite** (`vitest.components.config.ts`): 90 tests
  passed, 11 files — 0 failures.
- **TypeScript** (`tsc --noEmit`): clean, no output.
- **Changed-file ESLint:** 9 pre-existing errors across `src/App.tsx` (8)
  and `src/components/OmniNova.tsx` (1), all confirmed present and
  unchanged (same rule, same code shape, shifted only by line-number offset
  from this phase's added imports) on the Phase 5K baseline commit
  `b956384` before this phase's edits — **no new lint errors introduced**.
  All other changed/new files are lint-clean.
- **Playwright** (`tests/e2e/nhei-phase5-journey.spec.ts`): 48/48 passed
  (desktop + mobile), including the 4 new Journey A/B/D/mutual-exclusion
  tests.
- **Playwright** (`tests/e2e/calendar-protection.spec.ts`): 18/18 passed
  (desktop + mobile) — Journey C regression, unaffected.
- **Firestore rules** (`node test-rules.cjs`): "All rule tests passed
  successfully."
- **Firestore emulator integration tests** (`npm run test:emulator`): 21
  tests passed, 2 files.
- **Pre-existing failures:** none found anywhere in this verification pass.

## 8. Remaining disconnected capabilities

- There is still no Playwright harness against the real, authenticated
  `App.tsx` SPA — all browser-level coverage (including this phase's new
  Journey A/B/D tests) runs against the dev-only preview harness
  (`dev-nhei-phase5-preview.html`), which is not reachable by real users and
  not part of the production build. The real `ReturnToNovaLink` round-trip
  through `App.tsx`'s actual tab system (`safeSetActiveTab`) is therefore
  verified only at the unit/component level (`ReturnToNovaLink.test.tsx`)
  and by code inspection of how `App.tsx` wires it in, not by an end-to-end
  browser test of the real app.
- `suggest_feature`'s `plan`, `diagnose`, `reflect`, and `ally` feature IDs
  remain unconnected to any conversational offer card in this phase (out of
  scope — the directive named only Boundary Architect, Anxiety Reset/Reset
  Studio, Energy Delta, and Recovery Fuel).

## 9. Genuine release blockers

- `NOVA_AGENTIC_JOURNEY_ENABLED` is off by default, and nothing in this
  phase turns it on — consistent with the directive's "no unreviewed...
  activation." Turning it on for real users is a separate, explicit release
  decision outside this phase's scope.
- The missing real-`App.tsx` Playwright harness (see §8) means the full,
  real-user round trip through the unified journey has not been verified
  in an actual browser session — only the dev-preview equivalent has.

## 10. Recommended next high-value batch

1. Build a minimal Playwright harness against the real authenticated
   `App.tsx` SPA (even a single smoke journey) to close the gap named in
   §8/§9 — this has now been identified across three consecutive phases.
2. Decide and document the actual review/activation criteria for
   `NOVA_AGENTIC_JOURNEY_ENABLED` before any production rollout.
3. Consider extending `suggest_feature` coverage to `plan`/`diagnose`/
   `reflect`/`ally` once there is a concrete conversational trigger for
   each, following the same pattern established this phase.

---

**Restrictions honoured:** no merge or deployment; no unreviewed NHEI
activation (none added); no real calendar/task writes (unchanged, still
behind disabled execution kill switches); no unattended external messages;
no expansion of data collection; no changes to security PR #140 (not
touched by any file in this phase's diff).
