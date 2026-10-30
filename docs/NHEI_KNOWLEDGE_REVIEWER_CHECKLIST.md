# NHEI knowledge entries - independent specialist review checklist

Phase 6A, directive §9. This is a reviewer-facing checklist, not a
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
| 10 | `framework_ship_v1_draft` | The SHIP Framework | `BLAZE_BREAK_PROPRIETARY_CONCEPT` | Not reviewed in this pass - content exists only in `nhei-knowledge-content-drafts.ts`; reviewer should read the full entry there before deciding. | Unknown until read in full. | ☐ approve ☐ reject ☐ needs rewrite |
| 11 | `framework_blame_v1_draft` | The BLAME Method | `BLAZE_BREAK_PROPRIETARY_CONCEPT` | Not reviewed in this pass - note the name itself ("BLAME") is worth checking for unintended tone/connotation in a burnout-coaching context, separate from its content. | Unknown until read in full. | ☐ approve ☐ reject ☐ needs rewrite |
| 12 | `framework_r3_v1_draft` | R³: Rethink, Reflect, Rejuvenate | `BLAZE_BREAK_PROPRIETARY_CONCEPT` | Not reviewed in this pass. | Unknown until read in full. | ☐ approve ☐ reject ☐ needs rewrite |
| 13 | `context_and_agency_v1_draft` | Context and Agency | `BLAZE_BREAK_PROPRIETARY_CONCEPT` | Not reviewed in this pass - by name, this one sounds closest to touching on locus-of-control, a genuine psychological construct; reviewer should confirm the entry doesn't borrow that construct's authority without being evidence-linked to it. | Unknown until read in full. | ☐ approve ☐ reject ☐ needs rewrite |

## What this phase did NOT do

- Did not read entries #10-13 in enough depth to pre-fill a risk rating with confidence - they are flagged "not reviewed in this pass" above rather than guessed at, consistent with every prior phase's own rule against fabricating a review finding.
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
