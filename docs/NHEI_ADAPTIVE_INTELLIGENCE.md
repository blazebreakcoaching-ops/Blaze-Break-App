# NHEI — Adaptive Intelligence (decision and implementation contract)

**Decision (8 November 2026):** Adaptive Intelligence is the operating principle of NHEI and Nova Blaze, **not** a separate app, competing recommender or new navigation tab. A user describes a need once; existing capabilities work together around that person's current capacity, preferences, experience and feedback.

## Existing foundations reused
- `src/lib/nova-brain.ts`: consented user memories and preferences.
- `nova-tools.ts`: memory permission checks and reachable feature suggestions.
- `recovery-routing-engine.ts`: deterministic one-next-step selection, capacity limits, safety/eligibility restrictions, explicit user choice and reason codes.
- `recovery-outcomes-intelligence.ts`: historical intervention outcomes.
- Existing NHEI and Nova recovery intelligence surfaces remain in place.

## First implementation
`nhei-adaptive-intelligence.ts` adjusts candidate **preference hints only**, based on explicit preferences or at least three consistent user-reported outcomes from a limited recent history. The existing routing engine remains the sole decision authority. New optional `adaptiveContext` on `selectRoute` lets existing callers remain unchanged. Context is **disabled by default** unless the user opted into learning. The helper does not fetch, save or share personal information.

## Integrated in this batch
- The existing POST /api/recovery/routing-decision reads only the authenticated member's past completed outcomes (latest 100 routing records), after three permissions are true: allowAdaptiveIntelligence, allowNovaMemory and allowNovaUseSavedMemories.
- Recent verified feedback is passed as optional adaptiveContext to the EXISTING selectRoute. Deterministic eligibility, capacity, urgency and direct-request constraints remain authoritative.
- New and existing users default to adaptive learning OFF until explicitly opted in.
- Firestore permissions schema supports adaptive opt-in and bounded per-module preference lists.
- Both the Data Privacy Dashboard and Connected Nova Privacy Controls expose consent. The dashboard offers five module preference choices.
- The backend returns adaptiveLearningUsed and a compact, non-clinical adaptiveExplanation.
- Tests were written for opt-out, choice, weak evidence, outcome thresholds, privacy restriction and routing priority.

## Remaining validation and improvements
1. Run TypeScript, unit tests and Firestore rules emulator checks in local/staging. This GitHub-only connector cannot execute the build.
2. Verify both privacy controls persist across refresh, withdrawal of consent and changes in memory consent.
3. Test with real beta users, including feedback correction, multilingual support and accessibility.
4. Display plain-language adaptiveExplanation and correction actions in the live Recovery Hub; the backend now supplies the data, but the UI has not been traced end to end.
5. Integrate more feature signals only when their data, safety and outcomes have been verified.
6. Promote any future algorithmic changes through formal evaluation and reviewed releases.

## Invariants
- One primary action at a time. A valid result is **no action**.
- User's direct request, eligibility and safety conditions beat learning.
- Low capacity triggers simpler support, not extra homework.
- Missing, conflicting or weak evidence triggers a question or neutral behaviour, not confident assumptions.
- No diagnosis, medical prediction, fabricated certainty, covert surveillance or automatic employer disclosure.
- Personal coaching records stay in the private user lane; employer features receive only separately approved agreement data.
- No autonomous external actions without clear, specific authorisation.
- Multilingual, accessible and culturally appropriate presentation is part of the product, not separate intelligence silos.
- Never create a streak, score or gamified penalty for having a difficult day.

## Status
The live routing backend now supports consented feedback adaptation and privacy screens expose opt-in controls. Automated tests have been written, not executed. Production deployment and end-to-end effectiveness have not been verified.

## Additional integrated development — 8 November 2026
- **Floor Mode:** the existing Recovery Intelligence Hub provides a user-selectable, locally remembered low-stimulation view that shows one next step instead of the full tool catalogue. When capacity is reported low, a simpler-view option is offered. This is not yet a fully automatic mode across all tabs.
- **Where was I?:** the Hub reuses the established /api/user/resume-prompt endpoint for unfinished recovery activity and offers a voluntary continuation.
- **Second Memory:** private user-created open loops are stored under users/{uid}/nova_second_memory via authenticated server-only CRUD endpoints. A compact card is accessible in Recovery Hub and Memory Centre. With both existing memory permissions, up to two open loops feed Nova's current text context as user-authored data, not instructions. Users can complete, reopen, delete and bulk-erase notes, including after consent withdrawal. No autonomous actions are performed.
- **Outcome integrity:** repeated started/completed reports are idempotent, ratings can be corrected, and event records and session counts now update within a single database transaction.
- **Personalisation freshness:** only the most recent 90 days of confirmed user feedback feed adaptive routing.
- **Consent:** missing consent defaults to off, the learning toggle is independent, and disabling Nova memory also disables adaptive learning. Firestore memory validation now accepts the canonicalKey/dataZone fields the existing client actually sends.
- **Coordinated discovery:** Nova can recommend existing Recovery Intelligence and Privacy areas, and navigation no longer awards points.
- **Testing:** additional pure tests and source-level integration contract tests were committed. None were executed from this GitHub-only environment.

## Explicitly outstanding before claiming full completion
1. Run npm run lint, npm test and npm run build in a real checkout; run Firestore emulator rule tests and staging E2E journeys. Fix any findings.
2. Deploy Firestore rules and server/frontend together as a controlled staging release. Commits are **not** a deployment.
3. Verify auth, App Check, first-run permission creation, consent withdrawal, note erasure, memory writes and cross-device changes with actual accounts.
4. Check localisation, accessibility, native layout, low-bandwidth network behaviour and age-appropriate safety in realistic sessions.
5. Expand actual feature adapters based on validated information from modules not yet wired into the existing router. Avoid speculative classifications or broad private-data sharing.
6. Test proactive **in-app** assistance with users. Background reminders, calendar integrations and external actions require separate explicit permission and safety review.
7. Validate real-world benefit, retention and trust before describing the system as clinically effective or continuously self-learning.

## Integrated follow-on batch — security, customer control and contextual learning
The following changes are committed to the same main branch, but not yet compiled or deployed:

1. **Feedback transparency:** a member-only API lists recent completed-module ratings. The Data Privacy Dashboard can show, correct and forget each rating. The correction uses the existing authenticated outcome endpoint; forgetting removes the subjective helpfulness field while preserving the activity event.
2. **Learning reset:** a deliberately confirmed API disables adaptation, clears saved module preferences and erases past helpfulness ratings in bounded batches. An incomplete erasure is reported for retry. The Recovery Hub and privacy UI do not disclose ratings to employers.
3. **True attribution:** audit fields distinguish learning *enabled* from a recommendation actually influenced by a preference or outcome. The platform outcome report uses the latter and explicitly warns that observational results are not proof of causation.
4. **Context-sensitive outcomes:** repeated helpfulness only influences a new recommendation when it was observed at the same user-reported/calculated capacity band. Missing capacity metadata does not establish a matched context. Existing explicit user preferences remain higher priority than historical feedback.
5. **Onboarding consent reliability:** permissions creation is awaitable before onboarding memories are written; Firestore rules recheck active memory consent at write time. Missing permission, unknown account or failed consent reads disable memory rather than silently enabling it.
6. **Cross-device/account isolation:** client profile memory is restored from the authenticated person's Firestore permission state; per-account local storage keys isolate Nova chat history, voice preference, ratings and feedback. The Nova chat component remounts when signed-in UID changes. Legacy unscoped local history is not auto-imported.
7. **Joined-up experience:** Nova chat links to the one-step Recovery Hub and optionally opens Second Memory. The main Nova coaching instructions recognise unusual or changing needs, ask rather than assume, and avoid compulsory framework journeys.
8. **User agency after opt-out:** members can still inspect and erase old Second Memory notes after disabling learning, without restoring learning consent.
9. **Regression coverage:** scenario tests and source-level contract tests cover privacy boundaries, low capacity, explicit requests, feedback quality, account isolation and reset controls.

## Staging acceptance gate (not performed)
Run these commands in a trusted checkout of the latest main branch:
- `npm ci --legacy-peer-deps`
- `npm run lint` (TypeScript)
- `npm test` (Vitest)
- `npm run build`

Then run Firebase Firestore rules emulator tests against memory consent, private notes, cross-account denial and owner-only deletes; validate the authenticated API routes using test accounts.

For each flow below, verify correct UI, database state, response status, accessibility, and no cross-account or employer information leakage:
- New user opts OUT and IN, refreshes and changes device; no memory created or read without permission.
- User changes preference, then requests a different tool; their request wins if eligible.
- User reports a helpful activity repeatedly, then reports lower capacity; old capacity-specific feedback must not override the new context.
- User corrects or forgets a helpfulness rating; the next recommendation must use the changed history.
- User resets learning; further adaptation stops and ratings are cleared, or incomplete erasure is explicitly reported.
- Two accounts use the same browser; chat and feedback from account A never appear under account B.
- User creates notes, disables memory, reviews old notes, then deletes them.
- Floor Mode displays one task at a time, including unfinished-work prompts when appropriate.
- Backend or Firestore is offline; the interface shows a failure and does not claim data was saved.
- Nova handles ambiguous or culturally specific situations without claiming a diagnosis or inventing available tools.

The build and tests **have not been executed in this GitHub-only working environment**. Keep staging gated until checks pass, and do not use real customer data for tests.

## Later product scope, not silently claimed as implemented
- Wider automatic routing adapters across all existing modules, once inputs and outcome mappings are verified.
- Privacy-reviewed proactive assistance outside an actively opened app (requires explicit permission and scheduling controls).
- Longitudinal evaluation with consenting beta participants, human oversight and measured improvement.
- Global localisation end-to-end verification, native app usability, resilience and accessibility testing.

## Follow-on integrity and rights fixes — 8 November 2026
- **Atomic Second Memory creation:** the backend reads current member consent and bounded note count within one Firestore transaction before creating a note. This prevents concurrent requests from bypassing the note cap or relying on an outdated permission read. A real concurrency test is still needed.
- **Durable feedback withdrawal:** forgetting or resetting subjective ratings adds a `feedbackWithdrawnAt` marker. A delayed repeat outcome request cannot silently reintroduce a rating the person erased.
- **Member rights after opt-out:** Memory Centre now offers an explicit, on-demand review of all persisted Nova memories through the user's own Firestore read permissions, independently of the active coaching memory cache. Editable entries can be corrected or forgotten, without re-enabling learning.
- **Actual feature suggestions:** Nova's server tool description now matches the existing validated destination list, including Recovery Intelligence and Privacy Controls. This avoids offering only outdated feature choices.
- **Regression contracts:** `nhei-security-contract.test.ts` adds targeted source-level checks. Unit, rules emulator and full E2E tests still require execution and review.

**Do not call the system production-ready on the basis of these commits alone.** Verify the Firestore transaction, memory permission rules, signed-in account isolation, feedback withdrawal, client rendering and build on staging. Keep privacy-sensitive functionality gated until those checks pass.

## Follow-on release audit — 8 November 2026 (latest)
**Scope:** existing NHEI/Nova code, no new standalone service, no GitHub Actions or deployments triggered.

Verified from repository source:
- `firestore.rules` now distinguishes consented memory **creation** from owner-only **text correction** of editable existing memories. The update path cannot change source, type, confidence, creation time, editability or privacy zone; no new memory can be created without current consent.
- Second Memory note creation checks permissions and collection capacity inside one Firestore transaction.
- Second Memory, adaptive feedback and historical memory review components clear stale UI state on authenticated account switches; late note/history reads are ignored when the active account changes.
- A forgotten recovery rating carries `feedbackWithdrawnAt` and may not be re-submitted through a delayed outcome event.
- `nhei-firestore-consent.emulator.test.ts` contains actual Firestore rules tests for opt-out creation denial, opt-in creation, correction after opt-out, deletion and cross-account denial.
- `package.json` provides `npm run test:nhei` and `npm run test:nhei:rules` without enabling GitHub Actions.

**Important: source inspection is not a substitute for execution.** The connected GitHub integration can read and commit code but cannot execute npm, start an emulator, authenticate with staging, or deploy. No CI status was reported for the latest checked commit. Do NOT sign off build, security rules or E2E acceptance as passed.

### Exact external validation sequence (staging, test accounts only)
1. Check out latest `main` in a trusted Node 22+ environment, then run `npm ci --legacy-peer-deps`.
2. Run `npm run lint`, `npm run test:nhei`, `npm test`, and `npm run build`. Correct any failures before deployment.
3. Start an isolated Firestore emulator using the checked-in rules; set `FIRESTORE_EMULATOR_HOST=127.0.0.1:8080`; run `npm run test:nhei:rules`. A missing emulator causes the rules suite to skip, and **must not count as a pass**.
4. Deploy tested rules and server/client to **staging only**, using the existing Google Cloud/Firebase release process and approved credentials.
5. Verify two real test accounts on the same device and separate devices; try switching accounts while notes, chat and feedback are open.
6. Exercise consent off/on, notes CRUD, user memory correction after opt-out, feedback correction/forget/reset, changing capacity and explicit override, low-energy Floor Mode, the resume prompt and Nova's links to real existing tools.
7. Validate accessibility, languages, disconnected network behaviour, server logs, error handling and client UI. Only after real beta evidence and acceptance checks should a production release be approved.

Keep calendar, employer-sharing and proactive external actions out of this release until their own explicit permission boundaries and tests pass.


## Consolidated follow-on engineering batch — 8 November 2026

**Code added to main, not deployed or runtime-tested:**
- Prevent stale Second Memory notes, errors, and mutation results from updating a different authenticated account/session. Reset note state, loading, and deletion confirmations on identity change.
- Reset Recovery Hub recommendations, pending outcome feedback, return-to-activity prompt, and directional display when authenticated identity changes. Discard late API responses for an obsolete account/session.
- Keep outcome-save errors bound to the authenticated account that initiated the request.
- Display the reason only when adaptive intelligence **actually influenced** a recommendation. Explain explicit preference versus comparable past feedback in plain English and provide a direct route to the existing privacy settings.
- Add source-contract tests for these boundaries and attribution.

**Release blockers still open — not code-completion claims:**
1. Fresh checkout and dependency installation, TypeScript check, unit tests, production build, and Firestore rules emulator tests. The connector alone cannot execute them; Git clone was attempted in this execution environment but DNS resolution for github.com failed.
2. Run account-switch, permission withdrawal, memory correction/deletion, learning-reset, offline/error, feedback and cross-device journeys against a controlled staging Firebase project.
3. Verify staging authentication/App Check and coordinated frontend/server/rules deployment. Do not deploy automatically or activate GitHub Actions.
4. Test accessibility, translations, mobile layouts, security rules, and real user-facing value with consented beta participants before product sign-off.
5. Wider module adapters and proactive outside-app support remain conditional on validated data mapping, explicit consent and safety review; they are not implemented by this batch.

**Status:** Source code and test definitions have advanced. A complete secure production release cannot be certified without the runtime and staging checks above.

### Shared memory cache follow-up (same batch)
A later source audit identified a separate shared-cache race: async Firestore reads from a former signed-in user could overwrite the next user's in-memory Nova brain. The init lifecycle now clears the cache immediately for a new UID, uses an invalidation generation, discards obsolete responses (including failure handlers), and clears on sign-out/withdrawal. Synchronous brain reads return no data unless the cache belongs to the current Auth UID. User-facing edit/delete methods also require the active UID and an editable memory. Source contracts were added. **Execution, runtime validation and deploy remain outstanding.**
