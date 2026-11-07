// NHEI PHASE 3C, CHECKPOINT 3 SECTION 1 - EDUCATIONAL TOPIC RELEVANCE
//
// Checkpoint 2's own integration function (nhei-nova-chat-educational-
// integration.ts) requested EVERY topic in the taxonomy on every call,
// unconditionally - its own header comment admitted this was "unfiltered
// by any guess at what the conversation is about ... not a topic
// heuristic this checkpoint has no basis to invent from the user's raw
// message." Checkpoint 3 section 1 authorises exactly that heuristic,
// with explicit bounds:
//   * independent of psychological tracking consent - this file takes a
//     plain string and returns topic labels; it has no consent parameter
//     and needs none, the same way a search-term classifier would not.
//   * never creates a personal evidence record. Nothing here produces an
//     NheiEvidenceRecord, a SelfSystem/Dimension activity count tied to
//     the user, or any object nhei-types.ts's evidence schema would
//     recognise - this is TOPIC classification of the message text
//     itself, not an interpretation of the person who sent it. The
//     result is a list of taxonomy labels, nothing else; no reference to
//     this message is persisted, logged, or stored by this file's own
//     code anywhere.
//   * not crude keyword matching as the sole method. Three distinct
//     techniques combine: (1) a specificity tier - a distinctive multi-
//     word phrase (e.g. "internal self", "perceived-received self",
//     "ship framework") is strong evidence on its own, but a short,
//     generic single term is not and requires a second, independently-
//     drawn term from the same topic's vocabulary before it counts; (2) a
//     case-sensitive check against the ORIGINAL (non-lowercased) text for
//     the four short proprietary acronyms (SHIP, BLAME, R3/R³) - a real
//     user referring to the Blaze Break framework conventionally writes
//     these as capitals, which is exactly the signal that distinguishes
//     "SHIP" the framework from "ship" the verb, "r3" is otherwise an
//     unrelated-ambiguous two-character token, and this is additional,
//     non-substring evidence about intent, not a bigger keyword list;
//     (3) deliberate omission - words that are highly generic across the
//     whole app and NOT specific to NHEI's own framework vocabulary
//     ("boundary"/"boundaries", "recovery") are never used as match terms
//     at all, even though real knowledge entries reference boundary-
//     related and recovery-related tools - those terms belong to other,
//     already-shipped Blaze Break pillars (Boundary Rehearsal, Recovery
//     Debt Inventory), and a bare mention of them is not, by itself,
//     evidence that NHEI's own conceptual education is what the person
//     is asking for.
//   * bounded: at most MAX_SELECTED_TOPICS topics are ever returned, and
//     an empty array is returned whenever nothing clears the threshold -
//     "return no NHEI educational content if no relevant approved
//     knowledge exists" starts here, before retrieval is even attempted.
//
// This file performs NO I/O, calls NO model, and is fully synchronous -
// it cannot time out, cannot fail on a network error, and its own
// correctness is exhaustively testable without a Firestore fake.

import { type NheiKnowledgeTopic, NHEI_KNOWLEDGE_TOPICS } from './nhei-knowledge-types';

const MAX_SELECTED_TOPICS = 4;
const MIN_WEAK_TERM_HITS = 2;

interface TopicVocabulary {
  topic: NheiKnowledgeTopic;
  // Distinctive multi-word phrases - a single match is sufficient.
  strongPhrases: string[];
  // Generic/short terms - need at least MIN_WEAK_TERM_HITS distinct
  // matches from this list before they count toward selection at all.
  weakTerms: string[];
}

// Drawn directly from each entry's own educationalSummary,
// detailedExplanation, learningObjective, exampleScenarios and
// reflectionQuestions (nhei-knowledge-content-library.ts /
// nhei-knowledge-content-drafts.ts) - the actual conceptual vocabulary
// those entries use, not a guess at what users might type. Deliberately
// excludes recoveryToolReferences (feature names like "Boundary
// Rehearsal", "Weekly Review") - those name OTHER Blaze Break features,
// not NHEI's own educational concepts, and matching on them would blur
// topic selection with feature routing, which is not this file's job.
const TOPIC_VOCABULARIES: readonly TopicVocabulary[] = [
  {
    topic: 'INTERNAL_SELF',
    strongPhrases: ['internal self'],
    weakTerms: ['privately', 'private feeling', 'inward reaction', 'internal reaction', 'how i feel about it inside', 'nobody else knows how i feel'],
  },
  {
    topic: 'RELATIONAL_SELF',
    strongPhrases: ['relational self'],
    weakTerms: ['what was actually said', 'what was decided', 'what they actually said', 'what really happened between us', 'the actual conversation we had'],
  },
  {
    topic: 'PERCEIVED_RECEIVED_SELF',
    strongPhrases: ['perceived-received self', 'perceived received self'],
    weakTerms: ['what i expected them to think', 'worried what they think of me', 'assume they judged me', 'anticipated judgement', 'what i intended versus what they heard'],
  },
  {
    topic: 'METAPHYSICAL',
    strongPhrases: ['metaphysical dimension'],
    weakTerms: ['does this align with who i am', 'sense of purpose', 'feels wrong even though its practical', 'conflicts with my values', 'what matters to me'],
  },
  {
    topic: 'PHYSICAL',
    strongPhrases: ['physical dimension'],
    weakTerms: ['difficulty resting', "can't switch off", 'cant switch off', 'cant sleep', 'physically restless', 'body feels tense', 'exhausted'],
  },
  {
    topic: 'MENTAL',
    strongPhrases: ['mental dimension'],
    weakTerms: ['expecting the worst', 'assuming the outcome', 'interpreting what happened', 'overthinking this', 'predicting what will happen'],
  },
  {
    topic: 'EMOTIONAL',
    strongPhrases: ['emotional dimension'],
    weakTerms: ['naming what i feel', 'noticing my emotions', 'feeling guilty', 'feeling relieved', 'feeling frustrated', 'hard to name this feeling'],
  },
  {
    topic: 'TEMPORAL_SELF_INTERACTION',
    strongPhrases: ['temporal self interaction', 'sequence is not cause'],
    weakTerms: ['does this always happen after', 'did this cause that', 'keeps happening after', 'pattern over time'],
  },
  {
    topic: 'ADAPTIVE_BEHAVIOUR',
    strongPhrases: ['adaptive behaviour', 'adaptive behavior'],
    weakTerms: ['keep checking my phone', 'avoiding a task', 'i always end up', 'notice i tend to', 'behavioural pattern', 'behavioral pattern'],
  },
  {
    topic: 'CONTEXT_AND_AGENCY',
    strongPhrases: ['context and agency'],
    weakTerms: ['what is actually within my control', 'realistic choice', 'workload pressure', 'limited by my circumstances', 'not just about trying harder'],
  },
  {
    topic: 'SHIP',
    strongPhrases: ['ship framework', 'safety habits identity purpose', 'what does ship mean', 'what is ship'],
    weakTerms: ['longer-term rebuild after burnout', 'rebuilding after burnout', 'long-term recovery plan'],
  },
  {
    topic: 'BLAME',
    strongPhrases: ['blame method', 'breathe locate accept manage empower', 'what does blame mean', 'what is blame'],
    weakTerms: ['stress spike', 'in the moment reset', 'calm down right now'],
  },
  {
    topic: 'R3',
    // R3/R³ is a short, otherwise-ambiguous token - deliberately requires
    // the full spelled-out phrase or the case-sensitive acronym check
    // below, never a bare "r3" substring match in lowercased text.
    strongPhrases: ['rethink reflect rejuvenate', 'r³', 'what does r3 mean', 'what is r3'],
    weakTerms: [],
  },
];

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Word-boundary-safe substring match - "ship" must not match inside
// "shipping" or "worship", and this applies uniformly to every phrase,
// strong or weak, single-word or multi-word.
function containsPhrase(normalizedText: string, phrase: string): boolean {
  const pattern = new RegExp(`(?<![a-z0-9])${escapeRegExp(phrase)}(?![a-z0-9])`, 'i');
  return pattern.test(normalizedText);
}

// Case-sensitive acronym check against the ORIGINAL text - see this
// file's header comment on why capitalisation itself is a real signal
// here, not an arbitrary extra rule.
function containsCapitalizedAcronym(originalText: string, acronym: string): boolean {
  const pattern = new RegExp(`(?<![A-Za-z0-9])${escapeRegExp(acronym)}(?![A-Za-z0-9])`);
  return pattern.test(originalText);
}

export interface NheiEducationalTopicSelection {
  topics: NheiKnowledgeTopic[];
  // Diagnostic only, never logged by any caller - useful for this file's
  // own tests to assert WHY a topic was or wasn't selected without
  // re-deriving the scoring logic in the test itself.
  matchedStrongPhrase: Partial<Record<NheiKnowledgeTopic, boolean>>;
}

// The one function this file exposes. Pure, synchronous, no I/O. Returns
// an empty `topics` array whenever nothing clears the threshold - the
// caller must treat that as "do not call retrieval at all" (see
// nhei-nova-chat-educational-integration.ts), not as "retrieve
// everything."
export function selectEducationalTopics(userMessage: unknown): NheiEducationalTopicSelection {
  if (typeof userMessage !== 'string' || userMessage.trim().length === 0) {
    return { topics: [], matchedStrongPhrase: {} };
  }
  // Bounded input size - a pathologically long message should not make
  // this function's cost scale unboundedly; only the first 4000
  // characters are considered, which is far more than any realistic chat
  // turn and keeps this function's own cost flat regardless of input.
  const bounded = userMessage.slice(0, 4000);
  const normalized = bounded.toLowerCase();

  const scored: { topic: NheiKnowledgeTopic; score: number; strong: boolean }[] = [];
  const matchedStrongPhrase: Partial<Record<NheiKnowledgeTopic, boolean>> = {};

  for (const vocab of TOPIC_VOCABULARIES) {
    const strongHit = vocab.strongPhrases.some((phrase) => containsPhrase(normalized, phrase))
      || containsCapitalizedAcronym(bounded, vocab.topic === 'R3' ? 'R3' : vocab.topic === 'SHIP' ? 'SHIP' : vocab.topic === 'BLAME' ? 'BLAME' : '__none__');

    if (strongHit) {
      scored.push({ topic: vocab.topic, score: 1000, strong: true });
      matchedStrongPhrase[vocab.topic] = true;
      continue;
    }

    const weakHits = new Set(vocab.weakTerms.filter((term) => containsPhrase(normalized, term)));
    if (weakHits.size >= MIN_WEAK_TERM_HITS) {
      scored.push({ topic: vocab.topic, score: weakHits.size, strong: false });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  const topics = scored.slice(0, MAX_SELECTED_TOPICS).map((s) => s.topic);

  return { topics, matchedStrongPhrase };
}

// Exported only for this file's own tests - confirms the taxonomy this
// selector covers is exactly the real one, not a hand-copied subset that
// could silently drift if nhei-knowledge-types.ts ever changes.
export function selectorCoversFullTaxonomy(): boolean {
  const covered = new Set(TOPIC_VOCABULARIES.map((v) => v.topic));
  return NHEI_KNOWLEDGE_TOPICS.every((t) => covered.has(t)) && covered.size === NHEI_KNOWLEDGE_TOPICS.length;
}
