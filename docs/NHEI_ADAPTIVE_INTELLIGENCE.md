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
