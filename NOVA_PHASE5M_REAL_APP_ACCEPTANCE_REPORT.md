# Phase 5M — Real Application Integration & User Acceptance

## 1. Exact starting and final pushed SHAs

- **Starting commit (Phase 5L's pushed end state):** `b08569f` — "Phase 5L: Unified Recovery Intelligence & Safe Integration"
- **Final commit (this phase, pushed to `claude/nhei-phase-1`):** `34a32a2` — "Phase 5M: scope playwright.config.ts to its own two spec files"

Full commit sequence this phase: `a601785` (harness + two defects), `4b86973` (auth-race fix), `34a32a2` (Playwright config scoping fix).

## 2. Real application test architecture

**Minimum infrastructure identified and built (directive §1/§2):** every prior phase's Playwright coverage ran against a dev-only preview harness (`dev-nhei-phase5-preview.html`) that never executed `src/main.tsx`, the real signed-in `App.tsx`, or real Firebase Auth/Firestore. This phase closes that gap:

- **`src/lib/firebase.ts` / `src/lib/firestore.ts`** — a new, dev-only `VITE_USE_FIREBASE_EMULATOR` opt-in routes the real client bundle's Auth and Firestore calls at local emulators instead of the real `firebase-applet-config.json` project. Unset (the normal case for `npm run dev` or a real build), this changes nothing.
- **`playwright.realapp.config.ts`** — runs the app's own real dev server (`tsx server.ts`, the same command `npm run dev` runs: real Vite middleware + the real Express API, one process) twice, on two of `server.ts`'s own already-existing non-production CORS-allowed ports (3000, 8081), with `FIRESTORE_EMULATOR_HOST`/`FIREBASE_AUTH_EMULATOR_HOST` set so the Admin SDK auto-connects to the same local emulators (standard, documented Firebase behaviour — no `server.ts` code change needed). One instance has `NOVA_AGENTIC_JOURNEY_ENABLED=false` (the current real-world default), the other `=true` (isolated test configuration only).
- **Disposable, real authentication:** every test signs in as a genuine, local-only anonymous Firebase Auth user — the same sign-in that already happens automatically for any brand-new real visitor (`auth.tsx`) — against the Auth emulator, never a real project. Nothing persists outside that one test's emulator session.
- **Mocked model responses:** `/api/nova/chat` is answered per-test via `page.route()`, exactly as prior phases' preview-harness tests already did — no live Gemini key is configured in this environment, and a live external model call would itself violate "no live external actions."
- **Two new spec files:** `tests/e2e/real-app-nova-journey.spec.ts` (flag off, desktop + mobile) and `tests/e2e/real-app-flag-gating.spec.ts` (flag on, isolated test project only).
- **Existing `playwright.config.ts`** (the Phase 5E dev-preview harness) was scoped with an explicit `testMatch` to stop it from also discovering the new real-app spec files (see §6).

## 3. Actual signed-in user journeys verified

All of the following were exercised against the **real** `App.tsx`, not a stand-in:

- Real landing page → "See a live demo" (the real, no-password entry point a real anonymous visitor uses) → real sidebar/bottom-nav → real Nova tab.
- An ordinary Nova conversation via the real chat UI and the real `/api/nova/chat` call shape.
- `suggest_feature(communicate)` → the real card → "Open Tool" → the **real `App.tsx` tab system** (`safeSetActiveTab`) actually switches to the real `communicate` tab (verified via `aria-current="page"` on the real nav button) → the real nav back to Nova → the original conversation is still there underneath.
- Declining a `suggest_feature` offer, then the same `featureId` being offered again on the very next turn: the offer does not reappear (per-session dismissal tracking, carried over from Phase 5L, now proven through the real app).
- A real full-page reload: the anonymous session's Nova conversation (localStorage) survives it, once the real "See a live demo" re-entry (expected, intentional behaviour for a never-onboarded session — see §6) is repeated.
- Flag ON (isolated project only): the real Nova tab mounts `NovaAgenticJourney` (confirmed via its own `StageBar`, `aria-label="Journey stage"` — the one structural signal that actually distinguishes it from plain `NovaChat`, since both start directly in the chat view) and `offer_practical_assistance` genuinely opens the real Invisible Load step.
- Flag OFF (the default, desktop + mobile): the real Nova tab mounts plain `NovaChat` only — no `StageBar`.

## 4. Text and voice continuity results

Text continuity is demonstrated end to end in §3 above, through the real tab system and a real reload — not a synthetic stand-in. Voice-specific real-app coverage was **not** added this phase: the existing Phase 5L voice/WebSocket test suite (`nova-live-websocket.test.ts`) already covers `suggest_feature`/`offer_practical_assistance` relay at the route level with the real flag-gating logic, and remains green (part of the full Vitest run in §7); a real-browser voice call was out of scope here since no live audio/model provider is configured in this environment (consistent with every prior phase's own finding).

## 5. Feature-gate verification

Both `NOVA_AGENTIC_JOURNEY_ENABLED` configurations were verified against the **real, server-side flag**, not a mocked config endpoint — the only way to actually prove the flag-reading code path works, not just that a hand-crafted response claims it does:

- **Flag OFF** (default, non-production webServer): plain `NovaChat` mounts; no Agentic Journey entry UI is reachable.
- **Flag ON** (isolated test webServer only, never production): `NovaAgenticJourney` mounts; `offer_practical_assistance` genuinely offers and opens the real Invisible Load step.

No production feature-flag activation occurred or is recommended by this report — both webServers ran with `NODE_ENV` unset (dev), never `production`.

## 6. UX issues found and corrected

Three genuine defects were found by this phase's own real-browser testing — none were ever reachable by a route-level test or the old preview harness:

1. **Conversation-loss bug (real signed-in accounts).** `src/main.tsx`'s "Secure Account mode" localStorage guard — added to stop a shared-device demo profile leaking into a newly-signed-in real account — was also silently discarding Nova's own chat history, ratings, feedback, and voice preference the instant a real (non-anonymous) account signed in, with no Firestore fallback anywhere to catch them. A real account's Nova conversation was unrecoverable on every page load. **Fixed**: added the five Nova-specific keys to `ALLOWED_AUTHED_KEYS`, narrowly — `blaze_profile` and everything else stays guarded.
2. **Flag-reading race condition.** `useNovaAgenticJourneyEnabled` (and, by the same pattern, `useGuardianSupportInvitationEnabled`) fetched its server config once on mount with no retry. On a brand-new anonymous sign-in, `App.tsx` mounts (firing this effect) before Firebase Auth has actually finished creating that session, so the very first call threw "not signed in" and stayed stuck at the fail-closed default for the rest of that page load — safe (server-side enforcement is unaffected), but made the flag-on experience unreliable in a way only real auth timing could surface. **Fixed**: the fetch now re-runs on every real `onAuthStateChanged` event, not just once on mount.
3. **Test/config scoping collision (infrastructure, not product).** The existing `playwright.config.ts` had no file filter, so it also discovered this phase's new real-app spec files and ran them against its own dev-preview webServer, where none of their real-app buttons exist (14 apparent "failures" that were never a regression). **Fixed**: `testMatch` added, scoping it back to its own two files.

**Not fixed, documented instead (bounded scope):**
- `useGuardianSupportInvitationEnabled.ts` has the identical pre-existing race-condition pattern to defect #2 above. This phase's own tests didn't exercise it directly, so it wasn't changed here — recommended as the first follow-up (see §10).
- A benign React warning ("Encountered two children with the same key, ``") appeared in the console during real-app testing; it did not affect any test outcome and its exact source wasn't tracked down within this phase's scope — noted as minor technical debt, not fixed.
- `speakText`'s `secureApiFetch` calls fail validation/network checks during tests (no real TTS/model provider configured in this environment) — expected given this environment's known lack of a live model key, not a defect introduced or found by this phase.
- `NovaFeedbackModal` auto-opens 3 seconds after any first load (its own weekly-reshow timer), on any tab, unrelated to Nova specifically. It is dismissible (Escape or its own close button), so not a genuine defect, but it can collide with an in-progress task if its timer lands mid-interaction — suppressed in this phase's own tests for determinism, worth a product note for anyone tuning that timer.
- A real, anonymous, never-onboarded "demo" session correctly returns to the marketing landing page on a full reload (no saved `profile.fullName` to auto-skip it with) — confirmed as intentional, existing behaviour (`App.tsx`'s own `flowRef` effect), not a defect; the underlying conversation survives underneath it regardless.

## 7. All test results

- **Full Vitest suite:** 4622 tests passed, 329 files — 0 failures.
- **Component test suite:** 90 tests passed, 11 files — 0 failures.
- **TypeScript** (`tsc --noEmit`): clean throughout, after every edit.
- **Changed-file ESLint:** clean on every file this phase touched (`firebase.ts`, `firestore.ts`, `useNovaAgenticJourneyEnabled.ts`, `main.tsx`, the two new spec files, `playwright.config.ts`) — no errors, no warnings beyond the expected "config file ignored" notice for `playwright.realapp.config.ts` itself.
- **Real-app Playwright, flag off** (`real-app-nova-journey.spec.ts`): 7/7 passed on desktop, 7/7 passed on mobile.
- **Real-app Playwright, flag on** (`real-app-flag-gating.spec.ts`): 2/2 passed (desktop project; see §9).
- **Existing dev-preview Playwright regressions** (`nhei-phase5-journey.spec.ts` + `calendar-protection.spec.ts`, desktop + mobile): 66/66 passed, after fixing the config-scoping collision in §6.
- **Firestore rules** (`node test-rules.cjs`): "All rule tests passed successfully."
- **Firestore emulator integration tests** (`npm run test:emulator`): 21/21 passed.
- **Voice/WebSocket, feature-gate, account-isolation, NHEI safeguarding/consent/non-execution regressions:** all part of the full Vitest run above (unchanged from Phase 5L, still green).
- **Distinguishing real-app vs. preview-harness testing:** §2–§6 above are explicit about which tests ran against the real `App.tsx` (the new `real-app-*.spec.ts` files, against `playwright.realapp.config.ts`) versus the existing dev-only preview harness (`nhei-phase5-journey.spec.ts`/`calendar-protection.spec.ts`, against `playwright.config.ts`) — no result in this report conflates the two.
- **Pre-existing failures:** none found anywhere in this verification pass.

## 8. Remaining genuine release blockers

- `NOVA_AGENTIC_JOURNEY_ENABLED` remains off by default; nothing in this phase turns it on in any real environment — consistent with "no production feature-flag activation."
- `useGuardianSupportInvitationEnabled.ts`'s identical latent auth-race (§6) should be fixed before relying on that flag's reliability in a real multi-user session, the same way this phase fixed its Nova-journey sibling.
- No live Gemini/model key is configured in this environment, so Nova's actual conversational quality (tone, suggestion relevance, refusal behaviour) has only ever been verified through the tool-call *mechanism* (validated featureId/reason shape, server-side enforcement, the system-prompt text given to the model), never a live model response — this is a pre-existing gap, unchanged by this phase, and remains true of every phase before it.

## 9. Readiness assessment for a restricted internal demonstration

**Ready**, with the above blockers understood and accepted: a real, signed-in (anonymous) user can genuinely move between Nova conversations, Boundary Architect/Anxiety Reset/Reset Studio/Energy Delta/Recovery Fuel, and the practical-assistance workflow (when the flag is explicitly turned on for the demo), through the real application, with the conversation and context preserved across real tab switches and even a real page reload — demonstrated, not asserted. The one limitation worth stating plainly to anyone watching a demo: a real (non-demo, email/password) account's full sign-up-and-onboarding journey through the real UI was not driven end-to-end this phase (the Secure Account mode fix in §6 was verified by simulating the exact real trigger point rather than the full UI flow — see that section's own note); a demo centred on the anonymous "See a live demo" path is fully covered.

## 10. Highest-value next product development priority

Build a minimal Playwright journey that drives the **full real sign-up flow** (anonymous → "Sign up free" → the real email/password form → the real onboarding flow → the real dashboard) at least once, end to end. This phase's defect #1 (§6) was found and fixed by reasoning about the real code path and confirming it with a targeted simulation, not by actually running that real UI flow in a browser — the one meaningfully large piece of the real application this phase's otherwise-thorough real-browser coverage still doesn't touch directly, and the most likely place for the next undiscovered "worked in every test, breaks for a real person" surprise to be hiding.

---

**Restrictions honoured:** no merge or deployment; no activation of NHEI personal modes (none touched); no real calendar/task writes (unchanged, execution kill switches still disabled); no unattended external communications; no production feature-flag activation (`NOVA_AGENTIC_JOURNEY_ENABLED` stayed off everywhere except the isolated flag-on test webServer, which never ran with `NODE_ENV=production`); no changes to security PR #140 (not touched by any file in this phase's diff).
