// NHEI PHASE 3C-1 - EDUCATIONAL RESPONSE COMPOSITION
//
// "Produce trustworthy, contextual educational responses" (section 1)
// and "the system must be able to produce an appropriate educational
// response rather than a diagnosis" (section 4's fixture) - without a
// second live-model call. Response generation stays a PURE, deterministic
// assembly of already-validated structured data (the timeline, self-
// system/dimension summaries, and Phase 3B knowledge entries) rather
// than free text a model writes fresh - this is a deliberate scope
// choice, disclosed in the delivery report: generating genuinely novel
// prose would mean a second, non-reproducible model call this phase's
// own testing requirements explicitly rule out ("do not make successful
// tests depend only on an LLM asserting that its own response was
// correct"). Nothing here is free text improvisation - every string in
// the output traces back to either a knowledge entry's own
// pre-approved, pre-reviewed text, or a fixed template string defined in
// this file.
//
// Trust boundary (Phase 3C-1 section 7, hardened in Phase 3C-2A section 5):
// retrieved knowledge entries are consumed here as DATA ONLY - their
// `title`/`educationalSummary` text is copied into the output verbatim,
// never interpreted as an instruction, never concatenated into anything
// that could change this function's control flow. See
// nhei-educational-response-composer.test.ts's dedicated injection tests.
//
// Two SEPARATE guarantees, not one (Phase 3C-2A section 5's explicit
// instruction not to conflate them):
//   A. Malicious content cannot change this function's deterministic
//      control flow. TRUE and verified here: this function has no
//      branch, loop bound, or side effect whose behaviour depends on the
//      CONTENT of any string field (only on counts/booleans from
//      selfSystemSummaries/dimensionSummaries/behaviouralPatterns/
//      timeline) - a knowledge entry's title or educationalSummary could
//      contain any text at all and composeEducationalResponse would take
//      the exact same code path. MAX_COMPOSED_FIELD_LENGTH below adds a
//      defence-in-depth length clamp on top of that - belt-and-suspenders
//      given validateKnowledgeEntry (nhei-knowledge-types.ts) already caps
//      these fields at write time, in case a document is ever read
//      without having gone through that validation (e.g. a future direct
//      Firestore edit bypassing the service layer).
//   B. Malicious content cannot cause a DOWNSTREAM LANGUAGE MODEL to
//      disregard its higher-priority instructions. NOT APPLICABLE to this
//      file, and NOT verified by anything in this file's tests - this
//      function never calls a model, so there is no "downstream language
//      model" code path here for B to even describe. Guarantee B is a
//      property of a knowledge-to-model INTERFACE that does not exist yet
//      anywhere in this pipeline (buildExtractionPrompt's only input is
//      conversation turns - see nhei-extraction-schema.ts - never
//      knowledge entries). nhei-knowledge-model-interface.ts prepares a
//      structural design for that interface, ready for Phase 3C-2B, but
//      per instruction this phase does not claim B is verified by A's
//      tests, here or anywhere else in this delivery.

import { type NheiConversationMode } from './nhei-conversation-modes';
import { type SelfSystemSummary } from './nhei-trifecta-engine';
import { type DimensionSummary } from './nhei-dimensions-engine';
import { type NheiBehaviouralPattern } from './nhei-adaptive-behaviour-engine';
import { type TemporalTimelineEntry } from './nhei-temporal-engine';
import { type NheiKnowledgeEntry } from './nhei-knowledge-types';

export interface NheiRecognizedExperience {
  kind: 'self_system' | 'dimension';
  label: string;
  evidenceCount: number;
}

export interface NheiEducationalResponseSection {
  heading: string;
  body: string; // verbatim from a knowledge entry's educationalSummary, or a fixed template
  sourceKnowledgeEntryId: string | null;
  evidenceCategory: NheiKnowledgeEntry['evidenceCategory'] | null;
}

export interface NheiEducationalResponsePackage {
  mode: NheiConversationMode;
  recognizedExperiences: NheiRecognizedExperience[];
  orderedExperienceCount: number;
  sections: NheiEducationalResponseSection[];
  uncertaintyNotes: string[];
  disclaimer: string;
}

export const NHEI_EDUCATIONAL_DISCLAIMER =
  'This reflects educational information about common patterns of human experience, not a diagnosis, ' +
  'a verdict about your personality, or a determination of what caused what. You are welcome to agree, ' +
  'disagree, or ask for something different.';

// Fixed, reusable uncertainty templates - never generated per-response,
// so their wording is reviewable once rather than trusted to come out
// right every time.
const UNCERTAINTY_NOTE_PERCEIVED_RECEIVED =
  'An anticipated judgement is the user\'s own expectation, not a known fact about what anyone else actually thought.';
const UNCERTAINTY_NOTE_NO_CAUSE_ESTABLISHED =
  'The exact cause of an emotional reaction described here is not established by this conversation alone - ' +
  'more than one contributing factor may be involved, and some may not be identifiable at all.';
const UNCERTAINTY_NOTE_SINGLE_INSTANCE =
  'A single instance is not yet treated as an established pattern - that would need to happen more than once.';

export interface ComposeEducationalResponseInput {
  mode: NheiConversationMode;
  timeline: TemporalTimelineEntry[];
  selfSystemSummaries: SelfSystemSummary[];
  dimensionSummaries: DimensionSummary[];
  behaviouralPatterns: NheiBehaviouralPattern[];
  retrievedKnowledge: NheiKnowledgeEntry[]; // caller guarantees these are already approved-only (the retrieval engine's own job)
}

// Defence-in-depth only - see the guarantee-A comment above. Generous
// enough to never truncate any entry that actually passed
// validateKnowledgeEntry (whose own MAX_LONG is 4000), so this never
// changes behaviour for legitimate content; it exists purely as a second,
// independent backstop against an oversized field reaching composed
// output at all, from whatever source.
const MAX_COMPOSED_FIELD_LENGTH = 4000;
const boundField = (value: string): string =>
  value.length > MAX_COMPOSED_FIELD_LENGTH ? value.slice(0, MAX_COMPOSED_FIELD_LENGTH) : value;

export function composeEducationalResponse(input: ComposeEducationalResponseInput): NheiEducationalResponsePackage {
  const recognizedExperiences: NheiRecognizedExperience[] = [
    ...input.selfSystemSummaries
      .filter((s) => s.evidenceCount > 0)
      .map((s) => ({ kind: 'self_system' as const, label: s.selfSystem, evidenceCount: s.evidenceCount })),
    ...input.dimensionSummaries
      .filter((d) => d.evidenceCount > 0)
      .map((d) => ({ kind: 'dimension' as const, label: d.dimension, evidenceCount: d.evidenceCount })),
  ];

  // Only ever copies pre-approved text verbatim - never rewrites,
  // summarises further, or combines two entries' sentences into one new
  // sentence (which could accidentally assert a connection neither
  // entry itself asserts).
  // Structurally, only title/educationalSummary/id/evidenceCategory are
  // ever read from an entry here - detailedExplanation, sourceReferences,
  // exampleScenarios, reflectionQuestions, authorId, and reviewerId have
  // no code path into this output at all, adversarial or not (see
  // nhei-educational-response-composer.test.ts's dedicated tests proving
  // this for each of those fields individually).
  const sections: NheiEducationalResponseSection[] = input.retrievedKnowledge.map((entry) => ({
    heading: boundField(entry.title),
    body: boundField(entry.educationalSummary),
    sourceKnowledgeEntryId: entry.id,
    evidenceCategory: entry.evidenceCategory,
  }));

  const uncertaintyNotes: string[] = [];
  const activeSelfSystems = new Set(recognizedExperiences.filter((e) => e.kind === 'self_system').map((e) => e.label));
  if (activeSelfSystems.has('PERCEIVED_RECEIVED_SELF')) uncertaintyNotes.push(UNCERTAINTY_NOTE_PERCEIVED_RECEIVED);
  if (activeSelfSystems.has('INTERNAL_SELF')) uncertaintyNotes.push(UNCERTAINTY_NOTE_NO_CAUSE_ESTABLISHED);
  if (input.behaviouralPatterns.length === 0 && input.timeline.length > 0) uncertaintyNotes.push(UNCERTAINTY_NOTE_SINGLE_INSTANCE);

  return {
    mode: input.mode,
    recognizedExperiences,
    orderedExperienceCount: input.timeline.length,
    sections,
    uncertaintyNotes,
    disclaimer: NHEI_EDUCATIONAL_DISCLAIMER,
  };
}
