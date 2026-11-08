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
