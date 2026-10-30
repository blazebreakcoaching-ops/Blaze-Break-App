# NHEI knowledge entries - independent specialist review checklist

Phase 6A, directive §9 (created); Phase 6B, directive §6 (entries #10-13
given the same full-read analysis #1-9 already had). This is a reviewer-facing checklist, not a
re-statement of the architecture or the release-blocker register - see
`docs/NHEI_ARCHITECTURE.md` for how the knowledge system fits together
and `docs/NHEI_RELEASE_BLOCKERS.md` item 1 for why this review is
blocking Educational Mode specifically. This document does not approve,
activate, or certify any entry - every entry below remains
`approvalStatus: 'draft'` in source, and stays that way until a real,
named, independent human reviewer acts on it through the existing
`POST /api/admin/nhei-knowledge/entries/:entryId/review` route
(`nhei-knowledge-review-admin.route.test.ts`).

## How to use this checklist

All 13 entries exist only as TypeScript source constants today (9 in
`nhei-knowledge-content-library.ts`, 4 in
`nhei-knowledge-content-drafts.ts`) - none has ever been imported into a
real `nhei_knowledge_entries` Firestore document in any environment. For
each entry, a reviewer should read the entry's full
`detailedExplanation`, `exampleScenarios`, and `safetyRestrictions` in
the source file directly (the table below is a navigation aid, not a
substitute), and record a decision against every column.

| # | id | Title | Evidence category (as authored) | Diagnostic/clinical-implication risk | Consent/memory implication | Reviewer decision |
|---|---|---|---|---|---|---|
| 1 | `trifecta_internal_self_v1` | The Internal Self | `BLAZE_BREAK_PROPRIETARY_CONCEPT` | Low if presented as framing, not assessment - entry's own text explicitly disclaims diagnosis/verdict. Verify the disclaimer survives into any Nova-facing composed text, not just this source entry. | None directly - entry is conceptual, not personal data. | ☐ approve ☐ reject ☐ needs rewrite |
| 2 | `trifecta_relational_self_v1` | The Relational Self | `BLAZE_BREAK_PROPRIETARY_CONCEPT` | Low. Carries an explicit `never_assert_unreported_third_party_beliefs` restriction - verify this is actually enforced wherever this entry's content reaches a live response, not just declared here. | None directly. | ☐ approve ☐ reject ☐ needs rewrite |
| 3 | `trifecta_perceived_received_self_v1` | The Perceived-Received Self | `BLAZE_BREAK_PROPRIETARY_CONCEPT` | Medium - this is the entry most at risk of being misused to assert what a third party "really" thinks. Same `never_assert_unreported_third_party_beliefs` restriction as #2; reviewer should specifically stress-test this one against the adversarial scenario in `nhei-chat-scenario-library.ts`'s `S25_adversarial_retrieved_context`-style pressure. | None directly. | ☐ approve ☐ reject ☐ needs rewrite |
| 4 | `dimension_metaphysical_v1` | The Metaphysical Dimension | `EVIDENCE_INFORMED_PRACTICE` (general field citation, no specific study) | Low-medium - explicitly not a spiritual/religious claim per its own text; reviewer should confirm that framing is sufficient on its own, without a named source. | None directly. | ☐ approve ☐ reject ☐ needs rewrite |
| 5 | `dimension_physical_v1` | The Physical Dimension | `EVIDENCE_INFORMED_PRACTICE` (general field citation) | Medium - closest of the four Dimensions to a medical topic (sleep, bodily sensation). Carries `not_a_substitute_for_professional_care`; reviewer should confirm this is strong enough given the subject matter. | None directly. | ☐ approve ☐ reject ☐ needs rewrite |
| 6 | `dimension_mental_v1` | The Mental Dimension | `EVIDENCE_INFORMED_PRACTICE` (general field citation) | Low-medium. | None directly. | ☐ approve ☐ reject ☐ needs rewrite |
| 7 | `dimension_emotional_v1` | The Emotional Dimension | `EVIDENCE_INFORMED_PRACTICE` (general field citation) | Low-medium. | None directly. | ☐ approve ☐ reject ☐ needs rewrite |
| 8 | `temporal_self_interaction_v1` | Temporal Self Interaction | `BLAZE_BREAK_PROPRIETARY_CONCEPT` | Low - explicitly a correlation-vs-causation framing, not a causal claim about the user. | **Highest of the 13** - this concept's entire function is reasoning about a user's OWN conversation history/sequence. Any live retrieval use must be checked against the real consent gate (`memoryToolIsAllowed`/`allowNovaUseSavedMemories`), not just this entry's own text. | ☐ approve ☐ reject ☐ needs rewrite |
| 9 | `adaptive_behaviour_v1` | Adaptive Behaviour | `BLAZE_BREAK_PROPRIETARY_CONCEPT` | Medium - "behavioural pattern" language is adjacent to clinical pattern-recognition; entry's own text requires genuine repetition before calling something a pattern - verify that threshold is actually enforced wherever this reaches composed output, not just asserted here. | Medium - same recurrence-tracking concern as #8. | ☐ approve ☐ reject ☐ needs rewrite |
| 10 | `framework_ship_v1_draft` | The SHIP Framework | `BLAZE_BREAK_PROPRIETARY_CONCEPT` | **Phase 6B full read.** Low-medium. The "Identity (detaching self-worth from output)" element is adjacent to self-worth/identity constructs, but is framed as a practical habit, not an assessment; the entry itself explicitly disclaims "not a clinical staging model" and "progress... not linear or guaranteed." No causal overclaim found ("reduces how often BLAME is needed" is correlational phrasing, not a guarantee). | Medium. The entry's own "How it interacts" note links SHIP-stage focus to "recurring Adaptive Behaviour patterns" - a real tie to the temporal/recurrence memory system. Reviewer should confirm any LIVE composition pairing this entry with a user's actual Adaptive Behaviour history still goes through that system's own real consent gate, never implied by this entry's text alone. | ☐ approve ☐ reject ☐ needs rewrite |
| 11 | `framework_blame_v1_draft` | The BLAME Method | `BLAZE_BREAK_PROPRIETARY_CONCEPT` | **Phase 6B full read.** Low-medium. "Locate the root cause" / "what you are actually reacting to" edges toward a reflective root-cause technique without claiming to be therapy; the entry explicitly disclaims diagnosing why the trigger occurred. The acronym's literal word ("BLAME") is a real, separate tone risk the entry's own disclaimer ("names the five steps, not an accusation") may not fully neutralise for someone in a vulnerable state reading "I used BLAME on myself" - reviewer should treat this as a product/copy question to flag upward, not only a content-accuracy one this entry's wording alone can fix. | None directly. | ☐ approve ☐ reject ☐ needs rewrite |
| 12 | `framework_r3_v1_draft` | R³: Rethink, Reflect, Rejuvenate | `BLAZE_BREAK_PROPRIETARY_CONCEPT` | **Phase 6B full read.** Low. Entirely conceptual; notably careful about NOT overclaiming implementation status ("not yet an implemented module... must not be confused with Responsibility Reset"). No psychological overreach found. | None directly. | ☐ approve ☐ reject ☐ needs rewrite |
| 13 | `context_and_agency_v1_draft` | Context and Agency | `BLAZE_BREAK_PROPRIETARY_CONCEPT` | **Phase 6B full read.** Medium - genuinely closest of the 13 to a real psychological/sociological construct (locus of control, structural vs. individual attribution). The entry disclaims reducing itself to "a bandwidth score, a capacity verdict, or any other single number" and disclaims "limited agency in one area" meaning "no agency at all" - reasonable mitigations, but this is a double-edged framing (readable either as excusing a user's choices or as dismissing real structural constraints) that needs a qualified human's tone judgement, not just a logical-consistency check. | Medium - the entry's own text ties itself to "Blaze Break's own NHEI Context and Agency engine (Phase 1)," which produces output from a user's own tracked data. Reviewer should confirm that engine's real output is never conflated with this static entry's text in a way that implies the entry itself is personalised. | ☐ approve ☐ reject ☐ needs rewrite |

## What this phase did NOT do

- **Phase 6B** read entries #10-13 in full from `nhei-knowledge-content-drafts.ts` and completed the risk/consent analysis the table above now carries for all 13 entries - this closes the gap Phase 6A explicitly left open ("not reviewed in this pass"). This is still an internal engineering read, not the independent specialist review itself - none of the four "reviewer decision" checkboxes above were ticked, for any entry, by this phase.
- Did not change any entry's `approvalStatus`, `reviewerId`, or `lastReviewedAt`.
- Did not import any entry into Firestore (the import mechanism, `nhei-knowledge-import-service.ts`, is unchanged and still requires a deliberate operator action).
- Did not grant or exercise the `nheiKnowledgeReviewer` custom claim.

## For the reviewer

For each entry, beyond the table's prompts:
1. Read the full `detailedExplanation`, every `exampleScenario`, and every `reflectionQuestion` in source - the table above is a starting point, not a complete picture.
2. Check `safetyRestrictions` against what the entry's text actually says - confirm the declared restriction is substantively true of the content, not just a label.
3. Confirm the `evidenceCategory` is honestly chosen - `BLAZE_BREAK_PROPRIETARY_CONCEPT` for anything this project invented, `EVIDENCE_INFORMED_PRACTICE` only where a general field is cited without a fabricated specific citation, and neither should ever be upgraded to `ESTABLISHED_SCIENCE` without a real, checkable source.
4. Decide one of: approve (ready for real users), reject (should not ship as currently written), or needs rewrite (concept is sound, wording needs work) - via the real review route, never by hand-editing source `approvalStatus`.
5. Record the decision and reviewer identity through `POST /api/admin/nhei-knowledge/entries/:entryId/review`, which is the only path that produces a real, auditable, independent review.

## Reviewer package contents (Phase 6B, directive §6)

A concise pointer to where each required piece of this package actually lives, so the reviewer isn't left to hunt for it:

- **The actual knowledge entries**: `nhei-knowledge-content-library.ts` (entries #1-9) and `nhei-knowledge-content-drafts.ts` (entries #10-13) - the real TypeScript source, not a paraphrase. This document's table is a navigation aid over that source, never a substitute for reading it.
- **Evaluation criteria**: `nhei-knowledge-types.ts`'s `validateKnowledgeEntry` (structural well-formedness only - passing it is not evidence of content quality) and this document's own table columns (evidence category honesty, diagnostic/clinical risk, consent/memory implication) are the criteria a reviewer applies for a content judgement; `nova-chat-evaluation-criteria.ts`'s hard invariants are a separate, deterministic app-behaviour check (does the app enforce its own gates), not a content-quality check, and should not be conflated with reviewing these entries.
- **Synthetic scenarios exercising this knowledge layer adversarially**: `nhei-real-model-adversarial-evaluation-runner.ts`'s `NHEI_ADVERSARIAL_FIXTURES` (knowledge-quarantine injection attempts) and this phase's own `nova-chat-scenario-library.ts` entries `S25_adversarial_retrieved_context` and `S34_boundary_protection_under_misleading_instructions` (direct and retrieved-context jailbreak attempts against Nova's safety floor, which this knowledge content ultimately feeds). None of these are a substitute for reading entry #1-13's own content.
- **Unresolved risks**: every "Diagnostic/clinical-implication risk" and "Consent/memory implication" cell in the table above, plus `docs/NHEI_RELEASE_BLOCKERS.md` item 1 (the standing release blocker this whole review satisfies) and the Phase 6B acceptance report's own safeguarding-issues section.
