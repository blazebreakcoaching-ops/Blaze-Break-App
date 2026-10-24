# Phase 5K — Nova Unified Intelligence & Experience: Delivery Report

**Branch:** `claude/nhei-phase-1`
**Starting commit:** `c8eca6d` (Calendar Pilot Readiness Task 4)
**Ending commit:** see this commit's own SHA (committed immediately after this report)

## 1. Mission recap

"Bring Nova's existing conversational intelligence, recovery capabilities and practical-assistance workflows into one coherent user experience. Stop building isolated demonstrations. Focus on making the existing systems work together. Do not rebuild components, engines or services that already exist."

This phase's own audit (§1) found that Nova's backend tool-dispatch was **already unified** between text and voice before this phase started — one `NOVA_TOOLS` array, one `executeNovaTool` dispatcher, shared by `/api/nova/chat` and the Gemini Live WebSocket route. What was genuinely disconnected was the *user-facing* side: the entire practical-assistance vertical (Invisible Load → Calendar Protection / Task Deferral, plus Before Words) was fully built and tested across Phases 5D–5J but was **never mounted anywhere a real signed-in user could reach it** — only `NheiPhase5Preview.tsx`'s dev-only harness rendered it. This reframed the real task: not "connect two working systems" but "give Nova a way to *offer* that existing, already-safe workflow mid-conversation, and actually mount the result into production."

## 2. Existing capabilities reused (nothing rebuilt)

- **`NOVA_TOOLS` / `executeNovaTool`** (server.ts) — the shared dispatcher both text and voice already used.
- **The self-gating optional-card pattern** from `offer_guardian_support`/`GuardianSupportInvitation.tsx` — mirrored exactly for the new tool: pure argument validation, no I/O, never executes anything, only ever renders a dismissible card.
- **`NovaAgenticJourney.tsx`** — the existing "thin sequencer" built in Phases 5E–5H (`entry → before_words → chat → invisible_load → proactive_options → calendar_protection → task_deferral`), reused as-is and extended with a couple of new, additive capabilities (below) — no new business logic, no new server route, no new state machine.
- **`NheiBeforeWords`'s zero-persistence contract** — confirmed (again) to make zero API calls and hold no Firestore write path, so mounting the full journey (Before Words included) into production carries no NHEI-write risk.
- **`useNovaLiveVoice` / `NovaVoiceCall`** — the shared voice hook and full-screen call UI, extended with the same relay pattern it already used for `guardianSupportOffer`.
- **`CALENDAR_PROTECTION_EXECUTION_ENABLED`** and Task Deferral's equivalent kill switch — untouched, hardcoded off, the real safety backstop regardless of UI mounting.

## 3. New integrations implemented

### 3.1 The coordinator tool — `offer_practical_assistance`
- **`nova-practical-assistance-offer.ts`** (new): `validatePracticalAssistanceOffer` — pure validation of a model-supplied `reason` (non-empty, ≤200 chars). No feature flag: unlike Guardian Support (a separate, optional safety feature) or NHEI (explicitly required to stay gated), the workflow this offers is already real, already tested, and already execution-disabled at its own layer — an additional off-switch here would just hide a safe capability from the people this phase exists to reach.
- **`server.ts`**: new `offer_practical_assistance` tool declaration in `NOVA_TOOLS`, `executeOfferPracticalAssistance`, and its `executeNovaTool` switch case — directly mirroring `offer_guardian_support`'s shape.
- **`src/components/NovaPracticalAssistanceOffer.tsx`** (new): the dismissible card itself, visually and structurally matching `GuardianSupportInvitation.tsx` — a reason, one primary action ("Review what's on my plate"), and an explicit "Not right now" / X dismiss. Never starts, proposes, or changes anything; opening it only navigates into the existing Invisible Load step.

### 3.2 Wiring the coordinator into every real surface
- **`NovaChat.tsx`**: new `onRequestPracticalAssistance?: () => void` prop; `activePracticalAssistanceOffer` state + `practicalAssistanceOfferShownRef` (shown once per session unless the user raises it again, matching the Guardian Support rule); detects `offer_practical_assistance` in `data.planTrace`; renders the card.
- **`OmniNova.tsx`** (the floating widget) had its own, entirely separate chat loop that **never read `data.planTrace` at all** — so `suggest_feature`, `offer_guardian_support`, and now `offer_practical_assistance` were firing server-side for this surface's users with zero visible effect. Fixed: added `onNavigate` prop, planTrace parsing, and rendering for all three card types (feature-suggestion card, `GuardianSupportInvitation`, `NovaPracticalAssistanceOffer`).
- **`App.tsx`**: the `activeTab === "nova"` block's bare `<NovaChat>` is now `<NovaAgenticJourney initialStep="chat">` with the exact same props forwarded — identical first paint, but now the user can continue from chat into the real practical-assistance workflow instead of hitting a dead end. The floating `<OmniNova>` mount (shown only in the unauthenticated/demo preview flow — a pre-existing, unrelated scope limit) now gets `onNavigate={safeSetActiveTab}`.
- **`NovaAgenticJourney.tsx`**: added `initialStep` (so a host can open straight into chat, as App.tsx now does, while the unmodified dev-preview default stays `entry`); full `NovaChat` prop passthrough (tone/style controls, saved-profile sync, award points, suggest_feature navigation, voice auto-open) so swapping the bare `<NovaChat>` for this sequencer changes nothing about what Nova chat itself can do; `onRequestPracticalAssistance={() => goTo('invisible_load')}` wired permanently into its own `<NovaChat>`; a "Return to Nova chat" link added to every practical-assistance step (`invisible_load`, `proactive_options`, `calendar_protection`, `task_deferral`).

## 4. Text/voice coordination results

Voice (the Gemini Live WebSocket route) already shared the backend tool dispatcher before this phase. What voice users were missing was the **relay to the client** for the new tool — added mirroring the existing `guardianSupportOffer` relay:
- `server.ts`'s Live `onmessage` handler now relays `practicalAssistanceOffer: { reason }` over the socket when `offer_practical_assistance` fires with `offered: true`.
- `useNovaLiveVoice.ts`: new `practicalAssistanceOffer` state + `dismissPracticalAssistanceOffer`, same "shown once per call" rule as the guardian offer.
- `NovaVoiceCall.tsx`: new `onRequestPracticalAssistance?: () => void` prop; renders the same `NovaPracticalAssistanceOffer` card; accepting it ends the call and hands off to the host's destination.
- Both of the app's real chat/voice surfaces now have full parity: `NovaChat` (text) + its own inline voice call, and `OmniNova` (text) + its own voice call, each offering `suggest_feature`, `offer_guardian_support`, and `offer_practical_assistance` identically regardless of whether the user spoke or typed.

**Minor remaining asymmetry (not a bug):** `OmniNova`'s guardian-support card doesn't personalise with the user's stored full name the way `NovaChat`/`NovaVoiceCall` do (a one-line `readStoredFullName()` lookup) — cosmetic only, `GuardianSupportInvitation` already falls back gracefully to "a Blaze Break user."

## 5. User journey improvements

Open Nova → speak or type → Nova recognises overload/organisation language → offers the practical-assistance card (optional, never forced) → user chooses to open it → Invisible Load/Calendar Protection/Task Deferral opens with real progress preserved → "Return to Nova chat" returns to the conversation without losing anything. Demonstrated end-to-end in a real browser (see §6).

- `initialStep`'s "Start over" fix: previously, if a host opened straight into a non-`entry` step, "Start over" would show immediately even with nothing to undo; now compares against `initialStep ?? 'entry'`.
- Mobile usability: the new Playwright test runs on both desktop and mobile Chromium projects (already configured), reusing the same responsive classes the rest of the journey already uses.
- The experience remains fully useful with NHEI/external-action features unavailable — nothing added this phase depends on either.

## 6. Test results

- **Vitest (main suite):** 4610/4610 passed (329 files) — up from the 4584-baseline plus this phase's new coverage (`nova-practical-assistance-offer.test.ts`, `nova-practical-assistance-offer.route.test.ts`, 2 new tests in `nova-live-websocket.test.ts`).
- **TypeScript (`tsc --noEmit`):** clean, 0 errors.
- **ESLint, changed files:** 0 new errors/warnings on every file this phase touched or added (confirmed against a pre-phase baseline via `git stash` — the pre-existing 11 React-hooks errors in `App.tsx`/`NovaVoiceCall.tsx`/`OmniNova.tsx` are unchanged in count and location, none introduced by this phase).
- **Component tests (`npm run test:components`):** 88/88 passed, including a new `NovaPracticalAssistanceOffer.test.tsx` (4 tests) and 4 new `NovaAgenticJourney.test.tsx` cases (`initialStep`, the practical-assistance-offer handoff, and "Return to Nova chat" reachability from all four steps).
- **Firestore emulator tests (`npm run test:emulator`):** 21/21 passed — unaffected, since this phase added no new Firestore collections, rules, or write paths (the coordinator tool is pure).
- **Firestore rules tests (`node test-rules.cjs`):** all passed.
- **Playwright, desktop + mobile:** `nhei-phase5-journey.spec.ts` 40/40 passed (38 pre-existing + 1 new test × 2 viewports), including a new end-to-end demonstration: Nova offers practical assistance → user opens it → adds a real Invisible Load item → returns to chat via "Return to Nova chat" → re-enters the workflow and confirms the item is still there. `calendar-protection.spec.ts` 18/18 passed, unaffected.
- **Voice/text orchestration:** 2 new tests in `nova-live-websocket.test.ts` prove `offer_practical_assistance` dispatches through the real `handleNovaLiveConnection` handler and relays `practicalAssistanceOffer` to the client exactly when the tool offers, and never when it refuses.
- **Permission/account-isolation, safeguarding/non-execution regression:** existing suites (Guardian Support, Calendar Protection pilot-eligibility, kill-switch, NHEI trust-boundary tests) all re-ran unchanged and green — nothing in this phase touches those boundaries.

## 7. Remaining disconnected functionality

- `OmniNova` is currently mounted only for unauthenticated/demo visitors (`flow === "app" && !user`), a pre-existing scope limit this phase did not change — real signed-in users' only Nova surfaces are the "Nova" tab (now the full journey) and the inline voice call within it.
- `OmniNova`'s guardian-offer card lacks the personalised-name lookup `NovaChat`/`NovaVoiceCall` have (cosmetic).
- Anxiety Reset, Reset Studio, Recovery Fuel, Recovery Outcomes, and Workplace/Organisation-side features remain reachable only via their own dedicated tabs, not via a Nova-conversational offer — out of scope for this phase's coordinator (which this directive scoped to the overload/organisation-language case specifically).

## 8. Safety and release restrictions (unchanged / reconfirmed)

- No NHEI personal mode was activated; Before Words remains zero-persistence and unreviewed modes remain gated exactly as before.
- No live calendar or task write became reachable: `CALENDAR_PROTECTION_EXECUTION_ENABLED` and Task Deferral's equivalent remain hardcoded off, confirmed unaffected by this phase's own route tests (`allPaths()` assertions show zero Firestore writes from `offer_practical_assistance` firing).
- No unsolicited support-contact message is possible — the new tool never sends anything, only renders an optional card.
- No automatic elevation of user text into privileged system instructions — the model's own `reason` argument is rendered as plain UI copy, never re-injected into `systemInstruction`.
- No merge, production deployment, real external action, or change to security PR #140 was made.

## 9. Recommended next major development milestone

Extend the same coordinator pattern to the other pillars the directive named as examples but out of this batch's scope — most naturally Boundary Architect ("struggling with boundaries") and Anxiety Reset/Reset Studio ("difficulty finding words" partially covered by Before Words, but an explicit in-the-moment anxiety offer is not yet wired) — using the exact `offer_*` tool + dismissible-card + planTrace/WS-relay template this phase established, so each addition stays the same small, reviewable shape.
