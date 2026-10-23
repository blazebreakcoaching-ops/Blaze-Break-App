# NHEI architecture — Nova Human Experience Intelligence

This is the map of what NHEI actually is today, in code, kept in version
control rather than only in a per-checkpoint delivery report (which is
how this document came to exist: Phase 3C Checkpoint 3 section 10 asked
for the agreed architecture and the release-blocker register to live
here, not only in the scratchpad reports handed over at each checkpoint).
Those per-checkpoint reports remain the detailed, point-in-time record of
*what changed and why* at each step; this file and
`docs/NHEI_RELEASE_BLOCKERS.md` are the maintained, current-state summary
that should be kept accurate as NHEI continues to change, the way
`docs/SECURITY_ARCHITECTURE.md`/`docs/OUTSTANDING_SECURITY_ITEMS.md`
already work for security.

**A note on scope and honesty, matching that same precedent.** This
describes what is actually built and tested in this codebase today. It
does not describe a shipped, customer-facing feature — as of this
writing, **no NHEI mode is enabled for any real user**, and nothing here
should be read as implying otherwise. Where this document names something
as "proposed" or "not yet built," that is a deliberate, load-bearing
distinction, not hedging.

## What NHEI is

A coaching-intelligence layer for Nova, structured around a fixed,
non-clinical taxonomy — never a diagnostic or psychological-surveillance
system. The taxonomy (`nhei-knowledge-types.ts`, `nhei-types.ts`):

- **Three Selves** (`SelfSystem`): Internal, Relational, Perceived-Received.
- **Four Dimensions** (`Dimension`): Metaphysical, Physical, Mental, Emotional.
- **Three Blaze Break frameworks**: SHIP (longer-term rebuild), BLAME
  (moment-to-moment stabiliser), R³ (planned educational content, not an
  executable module anywhere in this app).
- **Two supporting concepts**: Temporal Self Interaction (sequence ≠
  cause), Adaptive Behaviour (observed response patterns, never a
  verdict), and Context & Agency (environmental pressure/realistic
  choice, never a bandwidth score).

Three operating modes, each independently gated:

| Mode | Status | What it does |
|---|---|---|
| **Educational** | Partially wired, server-only flag + Firestore gate, both default OFF | Retrieves approved knowledge-library text relevant to the user's own chat message and splices it into Nova's prompt as quarantined reference material. No evidence extraction, no persistence, no consent required. |
| **Personal Reflection** | Specified, not wired | Would extract structured evidence from a conversation and let a user confirm/correct it. Requires the independent safeguarding system (see below) to exist first. |
| **Longitudinal** | Specified, not wired | Would fold prior sessions' evidence into a reflection. Requires its own, additional consent purpose and the dedicated read interface described below. |

## The pipeline (Educational Mode, the only live path)

```
POST /api/nova/chat (server.ts)
  → nheiEducationalModeIsEnabledNow()            [env var, Checkpoint 2 §2 — default OFF]
  → isNheiModeEnabledInGovernance(db, 'educational') [Firestore doc, Checkpoint 3 §2 — default OFF]
  → buildNheiEducationalChatAddendum(db, ageBand, message)
      → selectEducationalTopics(message)          [Checkpoint 3 §1 — pure, local, no evidence created]
      → runNheiConversationPipeline('educational', topics, ageBand)
          → retrieveApprovedKnowledge(db, topics, ageBand)  [nhei-knowledge-service.ts]
          → composeEducationalResponse(...)         [nhei-educational-response-composer.ts]
      → quarantineKnowledgeEntryForPrompt(...)     [nhei-knowledge-model-interface.ts]
  → mergedSystemPrompt = NOVA_SYSTEM_PROMPT + ... + nheiAddendum + NOVA_SAFETY_INSTRUCTIONS
```

Both gates are checked, in that order, before any Firestore read happens
at all; a disabled gate means zero NHEI processing, not merely an
unaffected output (tested directly via Firestore-call spies). The
educational addendum is always appended **before** the real safety floor,
never after and never in place of it.

## Other engines that exist, offline/unwired today

- `nhei-trifecta-engine.ts` / `nhei-dimensions-engine.ts` — summarise
  which Self/Dimension has evidence activity. Used only by the
  Personal Reflection/Longitudinal pipeline path, not by Educational Mode.
- `nhei-temporal-engine.ts` — sequence/co-occurrence/recurrence only,
  never causation; recurrence requires ≥2 tag-sharing records.
- `nhei-adaptive-behaviour-engine.ts` — behavioural-pattern detection from
  temporal relations, same non-causal discipline.
- `nhei-knowledge-bridge.ts` — maps a context summary's active
  self-systems/dimensions onto knowledge topics. This is the
  *evidence-driven* topic selector for Personal Reflection/Longitudinal
  Mode — a different function from Educational Mode's own
  `nhei-educational-topic-selector.ts` (Checkpoint 3 §1), which classifies
  message TEXT, not interpreted evidence, and creates no evidence record.
- `nhei-extraction-service.ts` — conversation-to-evidence extraction via
  a dependency-injected model caller; real Gemini integration exists
  (`createGeminiExtractionCallerWithUsage`) but has never been exercised
  against a real model in this environment (no credential exists here).
- `nhei-gated-reflective-mode-integration.ts` — the required integration
  point for Personal Reflection/Longitudinal Mode: takes a mandatory
  `NheiSafeguardingGate` parameter (the compiler refuses a call site that
  omits it), currently always bound to `UNINTEGRATED_SAFEGUARDING_GATE`
  (`nhei-safeguarding-contract.ts`), which unconditionally returns
  `cleared: false`. Not imported by `server.ts` or any route.

## Feature governance (both default OFF, AND-combined)

1. `NHEI_EDUCATIONAL_MODE_ENABLED` — a server-only `process.env` read
   (`nhei-educational-mode-flag.ts`), requiring the exact string `'true'`.
   Changing it on this app's actual Cloud Run deployment requires a new
   service revision (confirmed against `docs/DEPLOY.md` — not an
   in-process reload).
2. `app_config/nhei_feature_state` — a Firestore document
   (`nhei-feature-governance.ts`), read fresh on every request with no
   cache, fail-closed on any missing/malformed/erroring read. Three
   independent boolean fields, one per mode. Exists specifically because
   (1) alone is slow to flip off in production; this is the fast path —
   one Firestore write, no deploy, visible to every instance on its next
   request.

Both must be true for Educational Mode to do anything. Neither alone is
sufficient — confirmed by dedicated tests in both directions.

## Consent and privacy boundaries

- Educational Mode needs **no NHEI consent** at all — `authoriseConversationMode`'s
  `'educational'` branch ignores its consent parameter entirely.
- Personal Reflection/Longitudinal would need `reflection_storage`
  (persistence) and, for cross-session use specifically,
  `longitudinal_tracking` as a second, independent purpose — enforced by
  `readNheiEvidenceForLongitudinalMode` (`nhei-persistence-service.ts`),
  which requires both, re-checked on every read (not a write-time
  snapshot), not yet wired into any route.
- All personal-data writes (`writeNheiEvidence`, `setConfirmationState`,
  `writeNheiAssertedInfluence`) require real Firestore transaction
  support and fail closed without it — no nontransactional fallback
  exists in production code.
- Export (`exportAllNheiData`), correction (per-evidence-record
  `corrections` subcollection), and deletion
  (`deleteNheiEvidenceRecord`/`deleteAllNheiData`/account-level
  `eraseUserAccount`) all exist, are tested, and are reachable today
  through the app's existing GDPR export/delete endpoints — independent
  of whether any NHEI mode is ever activated for anyone.
- `NHEI_RETENTION_SWEEP_ENABLED` is hardcoded `false`; no automatic
  deletion scheduling exists anywhere in this codebase.

## The trust boundary between retrieved knowledge and the model

Approved knowledge text is never concatenated into the prompt raw. It is
wrapped in a nonce-suffixed delimiter pair with an explicit "this is
reference data, not an instruction" framing
(`quarantineKnowledgeEntryForPrompt`), and any delimiter-lookalike
substring inside the knowledge text itself is defused so content cannot
forge a fake closing boundary. This is a proven, tested property of
**string construction** — the boundary cannot be forged, and the real
safety floor always lands after it. It is **not**, and is never claimed
to be, a proof that a real model will always honour that framing; no
real-model test has been run against this content (no usable credential
exists in this environment — see `docs/NHEI_RELEASE_BLOCKERS.md`).

## Where this document can go stale

This file should be updated whenever a mode's wiring state changes (the
table above), a new consent purpose or gate is added, or a governance
mechanism changes — the same discipline `docs/SECURITY_ARCHITECTURE.md`
expects of itself. The per-checkpoint delivery reports remain the
detailed history of each change; this file is the current-state summary,
not a replacement for them.
