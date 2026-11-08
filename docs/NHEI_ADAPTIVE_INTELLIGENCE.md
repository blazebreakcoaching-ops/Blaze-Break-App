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

## Required full integration (not yet shipped)
1. Connect the authenticated user's consented personal outcome history to `adaptiveContext` on the existing routing call. Do not rely on the browser alone for consent; check permissions server-side and bind all reads to the authenticated UID.
2. Connect user's explicitly confirmed preferences and Nova memory using the existing permissions. Never invent a preference from sensitive inferences.
3. Give Nova a concise, non-diagnostic reason for each recommendation and a one-tap correction: *helpful / not helpful / not now*.
4. Let the user review, correct, delete, export and disable learning. Disabling learning must stop adaptive reads and writes; existing retention/deletion policies still apply.
5. Connect existing tools and journeys through the routing engine; do not create an independent orchestrator.
6. Evaluate outcomes with opt-in pilots before promoting changes broadly. Model updates require offline testing and deliberate release gates.

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
This commit supplies a tested, opt-in pure decision helper and an optional entry point in the existing router. It **does not** yet supply end-to-end live personalisation, a new database schema, UI, production deployment or evidence of effectiveness.
