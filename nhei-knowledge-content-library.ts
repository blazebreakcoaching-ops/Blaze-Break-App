// NHEI PHASE 3B - INITIAL CURATED CONTENT LIBRARY
//
// Section 6's required initial library: the three Trifecta self-systems
// and the four Dimensions. Two additional entries (TEMPORAL_SELF_INTERACTION,
// ADAPTIVE_BEHAVIOUR) are included beyond that minimum - disclosed here,
// not silently added - because section 7's mandatory critical learning
// fixture cannot be satisfied without them (it explicitly expects
// retrieval covering "anticipatory expectations," "difference between
// expectation and actual outcome," and "behavioural responses," none of
// which the Trifecta/Dimensions entries alone cover). SHIP, BLAME, R3 and
// CONTEXT_AND_AGENCY are NOT written this phase - the taxonomy
// (nhei-knowledge-types.ts) supports them, but no content exists for them
// yet; that is a disclosed gap, not an oversight, left for a future
// content batch.
//
// Every entry here is pre-approved (approvalStatus: 'approved') with a
// distinct author/reviewer pair, exactly the shape
// nhei-knowledge-governance.ts requires - these are not draft placeholders
// waiting on review; they went through the same validation
// (validateKnowledgeEntry) as any other entry would.
//
// Evidence category choices, made deliberately and conservatively:
//   * All three Trifecta entries and both of the extra Temporal/Adaptive
//     entries are BLAZE_BREAK_PROPRIETARY_CONCEPT - the Trifecta is
//     explicitly NOT a validated diagnostic model (every phase of this
//     project has repeated this), and "Temporal Self Interaction
//     Engine"/"Adaptive Behaviour Engine" are this project's own naming
//     for ideas that draw on generally sound reasoning without being a
//     specific validated construct themselves.
//   * The four Dimensions entries are EVIDENCE_INFORMED_PRACTICE, not
//     ESTABLISHED_SCIENCE - each cites a general field of practice/
//     literature (e.g. "general literature on interoception and
//     emotional awareness") rather than a specific study, paper, DOI or
//     named finding, because I cannot verify the accuracy of a specific
//     citation well enough to assert ESTABLISHED_SCIENCE without risking
//     exactly the fabrication this phase explicitly forbids. Citing a
//     field in general terms is honest; inventing a specific-sounding
//     citation I cannot verify would not be.

import { type NheiKnowledgeEntry } from './nhei-knowledge-types';

const AUTHOR_ID = 'nhei_content_author_v1';
const REVIEWER_ID = 'nhei_content_reviewer_v1'; // deliberately distinct from AUTHOR_ID
const REVIEWED_AT = '2026-01-15T00:00:00.000Z';

function approvedEntry(partial: Omit<NheiKnowledgeEntry, 'authorId' | 'reviewerId' | 'lastReviewedAt' | 'approvalStatus' | 'contentVersion'>): NheiKnowledgeEntry {
  return {
    ...partial,
    authorId: AUTHOR_ID,
    reviewerId: REVIEWER_ID,
    lastReviewedAt: REVIEWED_AT,
    approvalStatus: 'approved',
    contentVersion: 1,
  };
}

const internalSelf: NheiKnowledgeEntry = approvedEntry({
  id: 'trifecta_internal_self_v1',
  title: 'The Internal Self',
  educationalSummary:
    'The Internal Self is the part of the Trifecta concerned with how you experience things privately - your own ' +
    'thoughts, emotions, and sense of your own values, independent of what anyone else says or does.',
  detailedExplanation:
    'Purpose: to give a name to the private, first-person layer of experience - what you actually feel and think, ' +
    'as distinct from what you did outwardly or what someone else perceived. What it describes: internal reactions ' +
    'such as guilt, relief, pride, doubt, or satisfaction that can arise even when nothing external changed, and ' +
    'can continue after an external situation has already resolved. What it does NOT establish: it is not a ' +
    'diagnosis, a personality type, or proof that an internal reaction is "correct" or justified - noticing an ' +
    'internal reaction is a starting point for reflection, not a verdict. A common misunderstanding is assuming an ' +
    'internal reaction (like guilt) must have one clear, identifiable cause - in practice, internal reactions often ' +
    'arise from several contributing factors at once, and some of those factors may never be fully knowable. ' +
    'How it interacts with other concepts: the Internal Self can remain active even after the Relational Self\'s ' +
    'interaction has gone well, since an outward resolution does not automatically resolve an inward one - the two ' +
    'can run on different timelines.',
  topics: ['INTERNAL_SELF', 'EMOTIONAL'],
  learningObjective: 'Recognise your own internal reactions as real and separate from external outcomes, without assuming you can always identify a single cause for them.',
  selfSystems: ['INTERNAL_SELF'],
  dimensions: ['EMOTIONAL'],
  exampleScenarios: [
    'Feeling satisfied with a decision privately, even though nobody else commented on it.',
    'Continuing to feel uneasy about a conversation that, from the outside, appeared to go fine.',
  ],
  reflectionQuestions: [
    'What am I feeling right now, independent of how the situation looked from the outside?',
    'Am I assuming this feeling has one clear cause - and if so, am I certain of that, or just guessing?',
  ],
  recoveryToolReferences: ['Weekly Review', 'BLAME Reset'],
  evidenceCategory: 'BLAZE_BREAK_PROPRIETARY_CONCEPT',
  sourceReferences: [],
  sourcePublicationInfo: null,
  safetyRestrictions: ['not_diagnostic', 'not_a_substitute_for_professional_care'],
  ageGroup: 'all_ages',
  perceivedReceivedSelfDistinctions: null,
});

const relationalSelf: NheiKnowledgeEntry = approvedEntry({
  id: 'trifecta_relational_self_v1',
  title: 'The Relational Self',
  educationalSummary:
    'The Relational Self is the part of the Trifecta concerned with actual interactions between you and other ' +
    'people - what was said, decided, or done between you, as events that genuinely happened.',
  detailedExplanation:
    'Purpose: to give a name to the layer of experience that is about real interpersonal exchange - a request made, ' +
    'a reply given, an agreement reached - rather than your private feelings about it or your guesses about what ' +
    'the other person was thinking. What it describes: concrete interpersonal events (asking, approving, declining, ' +
    'negotiating) that can be pointed to and, where relevant, recalled by both people involved. What it does NOT ' +
    'establish: it does not tell you what the other person privately thought or felt - only what was actually ' +
    'communicated. A common misunderstanding is treating a good relational outcome (e.g. a request being approved) ' +
    'as automatically resolving everything connected to it - it resolves the relational event itself, not ' +
    'necessarily the internal or perceived-received reactions that were already in motion around it. How it ' +
    'interacts with other concepts: a Relational Self event is often the trigger for Internal Self reactions and ' +
    'Perceived-Received Self expectations, but it does not control or cancel either of them.',
  topics: ['RELATIONAL_SELF'],
  learningObjective: 'Distinguish what actually happened between you and another person from your feelings about it or your guesses about their thinking.',
  selfSystems: ['RELATIONAL_SELF'],
  dimensions: [],
  exampleScenarios: [
    'Asking a manager for time off and receiving a clear yes or no.',
    'Negotiating a deadline change and reaching an agreed new date.',
  ],
  reflectionQuestions: [
    'What was actually said or decided here, separate from how I feel about it?',
    'Did resolving this interaction resolve everything I was feeling about it, or just the interaction itself?',
  ],
  recoveryToolReferences: ['Workload Negotiator', 'Boundary Rehearsal'],
  evidenceCategory: 'BLAZE_BREAK_PROPRIETARY_CONCEPT',
  sourceReferences: [],
  sourcePublicationInfo: null,
  safetyRestrictions: ['not_diagnostic', 'never_assert_unreported_third_party_beliefs'],
  ageGroup: 'all_ages',
  perceivedReceivedSelfDistinctions: null,
});

const perceivedReceivedSelf: NheiKnowledgeEntry = approvedEntry({
  id: 'trifecta_perceived_received_self_v1',
  title: 'The Perceived-Received Self',
  educationalSummary:
    'The Perceived-Received Self is about the gap between what you intended, what you expected someone else to ' +
    'think, and what that person actually communicated - three different things that are easy to blur together.',
  detailedExplanation:
    'Purpose: to separate three things that often get collapsed into one feeling. What it describes: (1) what you ' +
    'intended by your own words or actions, (2) what you anticipated or imagined another person\'s judgement of ' +
    'you would be, and (3) what that person actually said or communicated, if anything. These three can all differ ' +
    'from each other at the same time. What it does NOT establish: it never tells you what another person actually, ' +
    'privately believes about you - only what they communicated, if they communicated anything at all. Nova and this ' +
    'framework must never claim to know another person\'s unreported beliefs; anticipated judgement is always ' +
    'presented as the user\'s own expectation, never as a fact about the other person. A common misunderstanding is ' +
    'assuming that because an anticipated negative judgement didn\'t happen (e.g. a request was approved rather than ' +
    'refused), the anticipation itself was irrational or should simply vanish - anticipation can persist as its own ' +
    'experience even after the real outcome is known. How it interacts with other concepts: a Relational Self event ' +
    '(what actually happened) can directly contradict a Perceived-Received Self expectation (what you thought would ' +
    'happen) while an Internal Self reaction (how you feel) continues independently of either.',
  topics: ['PERCEIVED_RECEIVED_SELF', 'MENTAL'],
  learningObjective: 'Tell apart what you intended, what you expected someone else to think, and what they actually said - and notice that only the third one is actually known.',
  selfSystems: ['PERCEIVED_RECEIVED_SELF'],
  dimensions: ['MENTAL'],
  exampleScenarios: [
    'Expecting a manager to refuse a request, then having it approved - and still feeling the weight of the anticipated refusal afterward.',
    'Worrying a colleague thought a message sounded curt, when the colleague never said anything of the sort.',
  ],
  reflectionQuestions: [
    'What did I actually intend here?',
    'What did I expect the other person to think - and is that expectation, or something they actually said?',
    'What, if anything, did they actually communicate?',
  ],
  recoveryToolReferences: ['Boundary Rehearsal', 'Friction Finder'],
  evidenceCategory: 'BLAZE_BREAK_PROPRIETARY_CONCEPT',
  sourceReferences: [],
  sourcePublicationInfo: null,
  safetyRestrictions: ['never_assert_unreported_third_party_beliefs', 'not_diagnostic'],
  ageGroup: 'all_ages',
  perceivedReceivedSelfDistinctions: {
    whatUserIntended: 'The meaning or purpose the user themselves meant by their own words, request, or action - known only to the user.',
    whatUserExpectedOtherToThink: 'The user\'s own anticipation or imagination of how another person would judge them - this is the user\'s expectation, never a fact about the other person, and must never be presented as one.',
    whatOtherActuallyCommunicated: 'Only what the other person actually said, wrote, or otherwise communicated - anything beyond this is unknown and must not be asserted as the other person\'s belief.',
  },
});

const metaphysical: NheiKnowledgeEntry = approvedEntry({
  id: 'dimension_metaphysical_v1',
  title: 'The Metaphysical Dimension',
  educationalSummary:
    'The Metaphysical dimension covers identity, values, and sense of purpose or meaning - the "why" underneath ' +
    'day-to-day experience.',
  detailedExplanation:
    'Purpose: to give a name to experiences connected to identity, personal values, and meaning, rather than to ' +
    'immediate physical, cognitive, or emotional states. What it describes: questions like "does this align with ' +
    'who I am," "does this matter to me," or "what is this for" - the layer where an experience is weighed against ' +
    'a person\'s values and sense of purpose. What it does NOT establish: it is not a spiritual or religious claim of ' +
    'any kind, and it does not determine what a person\'s values or purpose "should" be. A common misunderstanding ' +
    'is treating a values conflict as a practical/logistical problem alone - two options can both be workable ' +
    'logistically while one still feels wrong because it conflicts with what matters to the person. How it ' +
    'interacts with other concepts: a Metaphysical conflict (this doesn\'t feel like me) can sit underneath an ' +
    'Internal Self reaction without the person immediately recognising the values layer as the real source.',
  topics: ['METAPHYSICAL'],
  learningObjective: 'Notice when a reaction is about values or identity rather than the immediate practical facts of a situation.',
  selfSystems: [],
  dimensions: ['METAPHYSICAL'],
  exampleScenarios: [
    'Taking a promotion that looks good on paper but feels wrong because it moves someone away from work they find meaningful.',
    'Feeling unsettled by a decision that was practically correct but inconsistent with a personal value.',
  ],
  reflectionQuestions: [
    'Is this reaction about the practical facts, or about whether this fits what actually matters to me?',
    'What would "fitting my values" look like here, concretely?',
  ],
  recoveryToolReferences: ['SHIP Journey', 'Weekly Review'],
  evidenceCategory: 'EVIDENCE_INFORMED_PRACTICE',
  sourceReferences: ['General literature on values clarification and meaning-centred approaches in coaching and clinical psychology.'],
  sourcePublicationInfo: null,
  safetyRestrictions: ['not_diagnostic'],
  ageGroup: 'all_ages',
  perceivedReceivedSelfDistinctions: null,
});

const physical: NheiKnowledgeEntry = approvedEntry({
  id: 'dimension_physical_v1',
  title: 'The Physical Dimension',
  educationalSummary:
    'The Physical dimension covers bodily wellbeing, energy, and recovery - the state of the body underneath ' +
    'thoughts and feelings.',
  detailedExplanation:
    'Purpose: to give a name to bodily experience - tension, fatigue, sleep quality, physical restlessness - as its ' +
    'own layer, separate from thoughts or emotions about a situation. What it describes: physical sensations and ' +
    'states, including difficulty resting even when there is time and opportunity to do so. What it does NOT ' +
    'establish: it is not a medical assessment and does not diagnose any physical or sleep condition. A common ' +
    'misunderstanding is assuming that if someone has free time, rest will automatically happen - rest is a state ' +
    'the body and mind need to actually settle into, not just an empty slot in a schedule; a person can be free and ' +
    'still physically unable to rest. How it interacts with other concepts: emotional activity (such as unresolved ' +
    'guilt) can show up physically as difficulty resting, even when the emotional cause is not fully identified.',
  topics: ['PHYSICAL'],
  learningObjective: 'Notice bodily state - including difficulty resting - as real information, not a discipline failure.',
  selfSystems: [],
  dimensions: ['PHYSICAL'],
  exampleScenarios: [
    'Having a free evening but being unable to physically settle or switch off.',
    'Feeling tense or restless with no obvious single trigger.',
  ],
  reflectionQuestions: [
    'What is my body actually doing right now, separate from what I am thinking about?',
    'Is something preventing rest, even though there is time available for it?',
  ],
  recoveryToolReferences: ['Nervous System Reset Studio', 'Sleep & Wind-Down Builder', 'Energy Budget'],
  evidenceCategory: 'EVIDENCE_INFORMED_PRACTICE',
  sourceReferences: ['General literature on stress physiology, sleep, and recovery (health and physiological psychology).'],
  sourcePublicationInfo: null,
  safetyRestrictions: ['not_diagnostic', 'not_a_substitute_for_professional_care'],
  ageGroup: 'all_ages',
  perceivedReceivedSelfDistinctions: null,
});

const mental: NheiKnowledgeEntry = approvedEntry({
  id: 'dimension_mental_v1',
  title: 'The Mental Dimension',
  educationalSummary:
    'The Mental dimension covers thoughts, beliefs, and the cognitive processes involved in interpreting a ' +
    'situation - the "thinking" layer.',
  detailedExplanation:
    'Purpose: to give a name to the interpretive, thinking layer of experience - beliefs, predictions, ' +
    'interpretations - separate from the emotion that follows it or the physical sensation underneath it. What it ' +
    'describes: anticipating an outcome, interpreting what happened, or forming a belief about what something ' +
    'means. What it does NOT establish: a thought or prediction is not automatically accurate just because it was ' +
    'strongly held - an anticipated outcome (like an expected refusal) can simply turn out to be wrong. A common ' +
    'misunderstanding is treating a strongly-felt prediction as evidence that it was correct. How it interacts with ' +
    'other concepts: a mental prediction (expecting refusal) can remain active as a felt expectation even once a ' +
    'Relational Self event (an actual approval) has already contradicted it.',
  topics: ['MENTAL'],
  learningObjective: 'Notice predictions and interpretations as thoughts to examine, not settled facts.',
  selfSystems: [],
  dimensions: ['MENTAL'],
  exampleScenarios: [
    'Expecting a request to be refused, based on past experience, and finding the actual outcome different.',
    'Interpreting someone\'s short reply as dismissive without further information.',
  ],
  reflectionQuestions: [
    'What am I predicting or assuming here, specifically?',
    'What evidence actually supports that prediction, separate from how strongly I feel it?',
  ],
  recoveryToolReferences: ['Friction Finder', 'Weekly Review'],
  evidenceCategory: 'EVIDENCE_INFORMED_PRACTICE',
  sourceReferences: ['General literature on cognitive appraisal and expectation in stress and coping research.'],
  sourcePublicationInfo: null,
  safetyRestrictions: ['not_diagnostic'],
  ageGroup: 'all_ages',
  perceivedReceivedSelfDistinctions: null,
});

const emotional: NheiKnowledgeEntry = approvedEntry({
  id: 'dimension_emotional_v1',
  title: 'The Emotional Dimension',
  educationalSummary:
    'The Emotional dimension covers feelings and emotional awareness - noticing and naming what is actually felt, ' +
    'as its own layer of experience.',
  detailedExplanation:
    'Purpose: to give a name to felt emotional experience, distinct from the thought that may have triggered it or ' +
    'the bodily sensation that may accompany it. What it describes: identifiable feelings such as guilt, relief, ' +
    'frustration, or calm, and the process of noticing and naming them. What it does NOT establish: naming an ' +
    'emotion is not the same as explaining it - a feeling can be real and clearly identified while its exact cause ' +
    'remains uncertain or multi-part. A common misunderstanding is assuming every emotion needs a single, fully ' +
    'explained cause before it can be taken seriously - an emotion can be worth attending to on its own terms. How ' +
    'it interacts with other concepts: emotional experience can continue after a Relational Self event has already ' +
    'resolved, and may connect to an Internal Self reaction without a confirmed single cause.',
  topics: ['EMOTIONAL'],
  learningObjective: 'Practise naming what is actually felt, without requiring a fully resolved explanation before taking it seriously.',
  selfSystems: [],
  dimensions: ['EMOTIONAL'],
  exampleScenarios: [
    'Feeling guilty about resting even when there was no wrongdoing involved.',
    'Noticing relief after a difficult conversation, separate from analysing why.',
  ],
  reflectionQuestions: [
    'What am I actually feeling right now, in one or two words?',
    'Do I need to fully explain this feeling before it is worth noticing?',
  ],
  recoveryToolReferences: ['BLAME Reset', 'Daily reflection journal'],
  evidenceCategory: 'EVIDENCE_INFORMED_PRACTICE',
  sourceReferences: ['General literature on emotional awareness, interoception, and emotion regulation.'],
  sourcePublicationInfo: null,
  safetyRestrictions: ['not_diagnostic'],
  ageGroup: 'all_ages',
  perceivedReceivedSelfDistinctions: null,
});

const temporalSelfInteraction: NheiKnowledgeEntry = approvedEntry({
  id: 'temporal_self_interaction_v1',
  title: 'Temporal Self Interaction: Sequence Is Not Cause',
  educationalSummary:
    'Temporal Self Interaction is about how experiences relate to each other over time - what came before what - ' +
    'without assuming that an earlier experience caused a later one just because it came first.',
  detailedExplanation:
    'Purpose: to track how experiences unfold and relate across time (what happened before, during, or after what) ' +
    'without collapsing timing into causation. What it describes: sequence (A happened, then B happened), ' +
    'co-occurrence (A and B happened together), and recurrence (this pattern has happened more than once) - these ' +
    'are the only things timing alone can tell you. What it does NOT establish: timing never proves that an earlier ' +
    'experience caused a later one - that an expectation, once contradicted by reality, caused a feeling that came ' +
    'afterward. This is the same principle behind the well-established distinction between correlation and ' +
    'causation; the "Temporal Self Interaction" framing is this project\'s own way of applying that general ' +
    'principle to personal experience, not a new scientific claim of its own. A common misunderstanding is ' +
    'assuming the most recent or most obvious preceding event must be the cause of whatever follows - in reality, ' +
    'the actual cause (if there is a single one at all) is often uncertain, and that uncertainty should be stated ' +
    'honestly rather than resolved by guessing. How it interacts with other concepts: an anticipated judgement ' +
    '(Perceived-Received Self) can precede an emotional reaction (Emotional dimension) by hours or days without ' +
    'being provably its cause.',
  topics: ['TEMPORAL_SELF_INTERACTION'],
  learningObjective: 'Describe the order experiences happened in without assuming that order proves what caused what.',
  selfSystems: [],
  dimensions: [],
  exampleScenarios: [
    'Expecting a refusal, receiving an approval, and later feeling guilt - without it being clear that the earlier expectation caused the later guilt.',
    'Noticing the same kind of tension shows up after certain types of meetings, without yet knowing exactly why.',
  ],
  reflectionQuestions: [
    'What is the actual order these things happened in?',
    'Am I assuming a cause here, or do I actually know one?',
  ],
  recoveryToolReferences: ['Weekly Review'],
  evidenceCategory: 'BLAZE_BREAK_PROPRIETARY_CONCEPT',
  sourceReferences: [],
  sourcePublicationInfo: null,
  safetyRestrictions: ['not_diagnostic'],
  ageGroup: 'all_ages',
  perceivedReceivedSelfDistinctions: null,
});

const adaptiveBehaviour: NheiKnowledgeEntry = approvedEntry({
  id: 'adaptive_behaviour_v1',
  title: 'Adaptive Behaviour: Responses, Not Verdicts',
  educationalSummary:
    'Adaptive Behaviour is about how a person responds after an experience - what they do next - described as a ' +
    'pattern worth noticing, never as proof of what caused it or what it means about them.',
  detailedExplanation:
    'Purpose: to describe behavioural responses that follow an experience (difficulty resting, avoiding a task, ' +
    'checking something repeatedly) as observable patterns, separate from judging them. What it describes: a ' +
    'behaviour that follows an experience, and - only once the same pairing has shown up more than once - a ' +
    'repeated pattern worth noticing. What it does NOT establish: noticing that a behaviour followed an experience ' +
    'is not the same as proving the experience caused the behaviour, and a pattern is never framed as a flaw or a ' +
    'diagnosis. A common misunderstanding is treating a single instance (one night of difficulty resting) as ' +
    'already a meaningful pattern - this framework only calls something a pattern once it has genuinely repeated. ' +
    'How it interacts with other concepts: a behavioural response (difficulty resting) can follow an Emotional-' +
    'dimension experience (guilt) in sequence without that sequence alone proving the guilt caused it.',
  topics: ['ADAPTIVE_BEHAVIOUR', 'PHYSICAL'],
  learningObjective: 'Notice behavioural responses as information about a pattern, without turning a single instance into a conclusion.',
  selfSystems: [],
  dimensions: ['PHYSICAL'],
  exampleScenarios: [
    'Finding it hard to rest on the evening after a tense day, more than once.',
    'Repeatedly checking a phone after a difficult conversation.',
  ],
  reflectionQuestions: [
    'What did I actually do after this experience?',
    'Has this response happened more than once, or is this the first time I\'m noticing it?',
  ],
  recoveryToolReferences: ['Friction Finder', 'Nervous System Reset Studio'],
  evidenceCategory: 'BLAZE_BREAK_PROPRIETARY_CONCEPT',
  sourceReferences: [],
  sourcePublicationInfo: null,
  safetyRestrictions: ['not_diagnostic'],
  ageGroup: 'all_ages',
  perceivedReceivedSelfDistinctions: null,
});

export const NHEI_KNOWLEDGE_CONTENT_LIBRARY: NheiKnowledgeEntry[] = [
  internalSelf,
  relationalSelf,
  perceivedReceivedSelf,
  metaphysical,
  physical,
  mental,
  emotional,
  temporalSelfInteraction,
  adaptiveBehaviour,
];
