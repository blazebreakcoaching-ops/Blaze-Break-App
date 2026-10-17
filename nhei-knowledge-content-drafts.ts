// NHEI PHASE 3C-1 - DRAFT KNOWLEDGE ENTRIES (SHIP, BLAME, R3, CONTEXT_AND_AGENCY)
//
// Section 6's required coverage gap: these four topics currently have no
// educational content (Phase 3B only covered Trifecta/Dimensions plus
// two Temporal/Adaptive additions). These entries exist to close that
// gap - but EXPLICITLY AS DRAFTS, never approved:
//   * approvalStatus: 'draft' on every entry.
//   * reviewerId: null, lastReviewedAt: null - unset, not filled with a
//     placeholder or borrowed identity.
//   * "Machine validation and passing unit tests do not constitute
//     independent educational or clinical review" - these entries DO
//     pass validateKnowledgeEntry (tested), which only proves they are
//     STRUCTURALLY well-formed, never that their content has been
//     reviewed by an authorised person. That review has not happened.
//   * "Do not fabricate reviewer identities" - no reviewerId is set at
//     all, by anyone, for any of these entries. A real review is
//     Phase 3C-2+ work (or earlier, standalone content-ops work) and
//     this file makes no attempt to simulate it.
//
// SHIP and BLAME content here is deliberately written to MATCH the
// existing, already-shipped definitions in server-knowledge.ts
// (NOVA_KNOWLEDGE_BASE's "THE SHIP FRAMEWORK" and "THE BLAME METHOD"
// sections) rather than re-deriving a new description - "prefer
// additive, non-contradictory knowledge integration with clear topic
// ownership" (section 5). No conflict was found between this file's
// content and server-knowledge.ts's; if a future content edit to either
// file creates one, that should be flagged for review, not silently
// resolved by picking a side - see the delivery report's trust-boundary
// section.

import { type NheiKnowledgeEntry } from './nhei-knowledge-types';

const DRAFT_AUTHOR_ID = 'nhei_content_author_v1'; // same author identity as the Phase 3B library, for consistency - still not a reviewer

function draftEntry(partial: Omit<NheiKnowledgeEntry, 'authorId' | 'reviewerId' | 'lastReviewedAt' | 'approvalStatus' | 'contentVersion'>): NheiKnowledgeEntry {
  return {
    ...partial,
    authorId: DRAFT_AUTHOR_ID,
    reviewerId: null,
    lastReviewedAt: null,
    approvalStatus: 'draft',
    contentVersion: 1,
  };
}

const ship: NheiKnowledgeEntry = draftEntry({
  id: 'framework_ship_v1_draft',
  title: 'The SHIP Framework',
  educationalSummary:
    'SHIP (Safety, Habits, Identity, Purpose) is Blaze Break\'s framework for the longer-term rebuild after burnout - ' +
    'distinct from BLAME, which stabilises a single difficult moment.',
  detailedExplanation:
    'Purpose: to describe the longer-term recovery arc, not a single technique for one hard moment. What it ' +
    'describes - matching this app\'s existing definition: Safety (controlling access, stopping the daily energy ' +
    'drain, treating boundaries as actions rather than wishes), Habits (small, repeatable anchors in sleep, food, ' +
    'movement and light - the floor version still counts), Identity (detaching self-worth from output), and Purpose ' +
    '(protecting what is genuinely urgent from what only looks urgent). What it does NOT establish: SHIP is not a ' +
    'clinical staging model and progress through it is not linear or guaranteed to follow this exact order for ' +
    'everyone. A common misunderstanding is treating SHIP and BLAME as competing methods - they operate on different ' +
    'timescales: BLAME regains control today; SHIP is what reduces how often BLAME is needed. How it interacts with ' +
    'other concepts: a SHIP-stage focus (e.g. rebuilding Habits) can show up in conversation as recurring Adaptive ' +
    'Behaviour patterns, without that recurrence alone proving which SHIP stage someone is actually in.',
  topics: ['SHIP'],
  learningObjective: 'Understand SHIP as a longer-term recovery arc operating on a different timescale from a single BLAME reset.',
  selfSystems: [],
  dimensions: [],
  exampleScenarios: [
    'Noticing that most of this week\'s difficulty traces back to disrupted sleep and skipped meals (Habits).',
    'Catching a thought that ties self-worth entirely to a single project\'s outcome (Identity).',
  ],
  reflectionQuestions: [
    'Which of the four areas - Safety, Habits, Identity, Purpose - feels most unsettled right now?',
    'Is this a today problem (BLAME) or a pattern problem (SHIP)?',
  ],
  recoveryToolReferences: ['SHIP Journey'],
  evidenceCategory: 'BLAZE_BREAK_PROPRIETARY_CONCEPT',
  sourceReferences: [],
  sourcePublicationInfo: null,
  safetyRestrictions: ['not_diagnostic'],
  ageGroup: 'all_ages',
  perceivedReceivedSelfDistinctions: null,
});

const blame: NheiKnowledgeEntry = draftEntry({
  id: 'framework_blame_v1_draft',
  title: 'The BLAME Method',
  educationalSummary:
    'BLAME (Breathe, Locate, Accept, Manage, Empower) is Blaze Break\'s moment-to-moment stabiliser for a stress ' +
    'spike - a brake, not a personality change.',
  detailedExplanation:
    'Purpose: to stop damage in a single activated moment, matching this app\'s existing definition. What it ' +
    'describes: Breathe and become aware (a physiological sigh, then naming the state without judgement), Locate ' +
    'the root cause (what you are actually reacting to, separating what is and isn\'t within your control), Accept ' +
    'what you can\'t control (plain, non-judgemental language about the situation), Manage what you can (choosing ' +
    'exactly one of Delete/Delegate/Do), Empower yourself to evolve (taking the chosen action). What it does NOT ' +
    'establish: BLAME does not diagnose why the triggering situation occurred, and using it does not mean the ' +
    'triggering event was objectively someone\'s fault - "blame" here names the five steps, not an accusation. A ' +
    'common misunderstanding is expecting BLAME to resolve the underlying issue - it stabilises the moment; SHIP is ' +
    'what addresses recurring patterns. How it interacts with other concepts: a BLAME reset can follow a Relational ' +
    'Self event (something someone said) or an Internal Self reaction (a feeling that arose with no obvious ' +
    'external trigger) equally - it is not specific to one self-system.',
  topics: ['BLAME'],
  learningObjective: 'Recognise BLAME as a same-moment stabiliser, distinct from resolving why the triggering situation happened.',
  selfSystems: [],
  dimensions: [],
  exampleScenarios: [
    'Feeling a sudden spike of frustration mid-meeting and using a physiological sigh before responding.',
    'Noticing racing thoughts after a difficult message and naming the state before replying.',
  ],
  reflectionQuestions: [
    'What am I actually reacting to, underneath the surface trigger?',
    'Of Delete, Delegate, or Do, which one genuinely fits what I can control right now?',
  ],
  recoveryToolReferences: ['BLAME Reset'],
  evidenceCategory: 'BLAZE_BREAK_PROPRIETARY_CONCEPT',
  sourceReferences: [],
  sourcePublicationInfo: null,
  safetyRestrictions: ['not_diagnostic'],
  ageGroup: 'all_ages',
  perceivedReceivedSelfDistinctions: null,
});

const r3: NheiKnowledgeEntry = draftEntry({
  id: 'framework_r3_v1_draft',
  title: 'R³: Rethink, Reflect, Rejuvenate',
  educationalSummary:
    'R³ is planned educational content describing three reflective habits - Rethink, Reflect, Rejuvenate - not an ' +
    'executable tool in this app today, and not to be confused with the separate "Responsibility Reset" feature.',
  detailedExplanation:
    'Purpose: to name three complementary reflective habits that support ongoing recovery. What it describes (as ' +
    'planned content - not yet an implemented module): Rethink (questioning an assumption that may no longer be ' +
    'true), Reflect (reviewing what actually happened and what was learned, separate from judging it), Rejuvenate ' +
    '(actively restoring capacity, not just stopping work). What it does NOT establish: R³ is not currently an ' +
    'executable feature anywhere in this app, and must not be confused with "Responsibility Reset," an unrelated, ' +
    'already-shipped feature with a similar-sounding name. A common misunderstanding would be assuming R³ is ' +
    'already a tool a user can open - it is not, as of this phase. How it interacts with other concepts: Reflect, ' +
    'in particular, overlaps with the Weekly Review tool\'s existing purpose, without being the same thing.',
  topics: ['R3'],
  learningObjective: 'Understand R³ as three planned reflective habits - Rethink, Reflect, Rejuvenate - distinct from any currently-built feature.',
  selfSystems: [],
  dimensions: [],
  exampleScenarios: [
    'Questioning whether an old belief about needing to be constantly available still holds (Rethink).',
    'Taking a deliberate recovery action rather than just stopping work and calling it rest (Rejuvenate).',
  ],
  reflectionQuestions: [
    'Is there an assumption here worth questioning (Rethink)?',
    'Am I actually restoring capacity, or just pausing (Rejuvenate)?',
  ],
  recoveryToolReferences: ['Weekly review'],
  evidenceCategory: 'BLAZE_BREAK_PROPRIETARY_CONCEPT',
  sourceReferences: [],
  sourcePublicationInfo: null,
  safetyRestrictions: ['not_diagnostic'],
  ageGroup: 'all_ages',
  perceivedReceivedSelfDistinctions: null,
});

const contextAndAgency: NheiKnowledgeEntry = draftEntry({
  id: 'context_and_agency_v1_draft',
  title: 'Context and Agency',
  educationalSummary:
    'Context and Agency is about the environmental pressures and realistic choices surrounding an experience - ' +
    'what is actually within someone\'s control right now, described honestly rather than scored.',
  detailedExplanation:
    'Purpose: to name environmental pressure, responsibility load, and realistic choice as their own layer, ' +
    'separate from judging someone for not having "tried harder." What it describes: the surrounding ' +
    'circumstances - workload, responsibilities, available support - that shape what a realistic choice actually ' +
    'looks like for someone right now. What it does NOT establish: this is deliberately NOT a bandwidth score, a ' +
    'capacity verdict, or any other single number - Blaze Break\'s own NHEI Context and Agency engine (Phase 1) ' +
    'produces only a descriptive evidence-availability summary for exactly this reason, and this entry does not ' +
    'claim more than that engine does. A common misunderstanding is assuming limited agency in one area means a ' +
    'person has no agency at all - context can narrow realistic choice without eliminating it entirely. How it ' +
    'interacts with other concepts: context can explain why an Adaptive Behaviour pattern persists without that ' +
    'context being an excuse or a diagnosis.',
  topics: ['CONTEXT_AND_AGENCY'],
  learningObjective: 'Consider environmental pressure and realistic choice as real factors, without reducing them to a single score or a verdict about effort.',
  selfSystems: [],
  dimensions: [],
  exampleScenarios: [
    'Having genuinely competing responsibilities that limit which recovery actions are realistic this week.',
    'Recognising that a workload pattern is shaped by team structure, not just personal time management.',
  ],
  reflectionQuestions: [
    'What is actually within my control here, realistically, right now?',
    'Is there a structural factor at play that effort alone would not fix?',
  ],
  recoveryToolReferences: ['Workload Reality Check'],
  evidenceCategory: 'BLAZE_BREAK_PROPRIETARY_CONCEPT',
  sourceReferences: [],
  sourcePublicationInfo: null,
  safetyRestrictions: ['not_diagnostic'],
  ageGroup: 'all_ages',
  perceivedReceivedSelfDistinctions: null,
});

export const NHEI_KNOWLEDGE_DRAFT_ENTRIES: NheiKnowledgeEntry[] = [ship, blame, r3, contextAndAgency];
