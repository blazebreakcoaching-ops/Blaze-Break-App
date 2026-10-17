// NHEI PHASE 3C-1 - SCHEMA-CONSTRAINED EXTRACTION PROMPT
//
// Section 3: "use schema-constrained model output... compatible with the
// existing Nova provider architecture." This codebase's existing
// pattern (server.ts, e.g. the Voice Journal and resentment-extraction
// routes) is `ai.models.generateContent({..., config: { responseMimeType:
// "application/json", responseSchema: {...} } })` using the `Type` enum
// from @google/genai. This file builds exactly that kind of schema and
// prompt, for consistency with how the rest of this app already talks
// to the model - but nothing here calls the network. Importing `Type` is
// just importing an enum of string constants; no API key or network
// access is required to build the schema object itself.

import { Type } from '@google/genai';
import { SELF_SYSTEMS, DIMENSIONS, TIME_UNCERTAINTIES, EVIDENCE_QUALITIES } from './nhei-types';
import { NHEI_EXTRACTABLE_SOURCE_TYPES } from './nhei-extraction-types';

// The schema the model's JSON output must satisfy. Deliberately has NO
// property capable of holding raw text - see nhei-extraction-types.ts's
// header comment. A model given this schema is never offered a field to
// quote the user in.
export const NHEI_EXTRACTION_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    candidates: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          candidateId: { type: Type.STRING },
          abstain: { type: Type.BOOLEAN },
          sourceType: { type: Type.STRING, enum: [...NHEI_EXTRACTABLE_SOURCE_TYPES] },
          selfSystems: { type: Type.ARRAY, items: { type: Type.STRING, enum: [...SELF_SYSTEMS] } },
          dimensions: { type: Type.ARRAY, items: { type: Type.STRING, enum: [...DIMENSIONS] } },
          relativeOrder: { type: Type.INTEGER },
          timeUncertainty: { type: Type.STRING, enum: [...TIME_UNCERTAINTIES] },
          evidenceQuality: { type: Type.STRING, enum: [...EVIDENCE_QUALITIES] },
          relatedCandidateIds: { type: Type.ARRAY, items: { type: Type.STRING } },
        },
        required: ['candidateId', 'abstain', 'sourceType', 'selfSystems', 'dimensions', 'relativeOrder', 'timeUncertainty', 'evidenceQuality'],
      },
    },
  },
  required: ['candidates'],
} as const;

export interface NheiExtractionPromptInput {
  // One string per conversation turn, in order. This is the ONLY place
  // raw conversation text appears in the whole extraction pipeline - it
  // goes into the PROMPT sent to the model, never into the model's
  // structured OUTPUT, and never into anything persisted. Phase 3C-1
  // only ever uses synthetic fixture text here, per instruction.
  turns: string[];
}

// Builds the instruction text sent alongside the conversation. Explicit
// about what the model must NOT do - restating the structural
// constraints the schema already enforces, since a model is more likely
// to comply with a constraint it can both read and is mechanically held
// to, than one it is only told about.
export function buildExtractionPrompt(input: NheiExtractionPromptInput): string {
  const numberedTurns = input.turns.map((t, i) => `${i}. ${t}`).join('\n');
  return `You are extracting STRUCTURAL classifications from a user's conversation turns, never raw quotes or paraphrases. For each distinct event, thought, emotion, behaviour, or outcome the user describes, output one candidate with:
- a sourceType from the allowed list (never invent one),
- which self-systems (INTERNAL_SELF/RELATIONAL_SELF/PERCEIVED_RECEIVED_SELF) and dimensions (METAPHYSICAL/PHYSICAL/MENTAL/EMOTIONAL) it touches, if any - multiple may apply, and it is fine for none to apply,
- its relativeOrder (0-based position in the narrative, not a real timestamp),
- your own confidence in this classification as evidenceQuality.
Set abstain: true, with the other fields left at reasonable defaults, whenever you cannot confidently classify something - never guess to fill a field. Never assert that one event CAUSED another; relatedCandidateIds only records that two candidates are connected in the narrative, never that one produced the other. Never claim to know what a third party (e.g. a manager) privately thought - only classify what the user themselves reported.

Conversation turns:
${numberedTurns}`;
}
