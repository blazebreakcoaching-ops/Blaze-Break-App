// NHEI PHASE 3B - CONNECTION TO EXISTING NHEI ENGINES
//
// Section 10's "pure integration contract that can receive structured
// NHEI topic requests and return relevant educational material." This
// file does exactly one job - map an already-interpreted NHEI context
// summary (built by Phase 3A's nhei-context-integration.ts, itself built
// on Phase 1's engines) onto the Knowledge Engine's topic taxonomy, then
// delegate to retrieveApprovedKnowledge. It performs NONE of the other
// responsibilities a real integration would eventually need, and is not
// allowed to:
//   * Experience interpretation - already done upstream, by Phase 1's
//     Trifecta/Dimensions/Adaptive Behaviour engines, before this file
//     ever sees a summary.
//   * Evidence classification - same; this file never looks at a raw
//     NheiEvidenceRecord, only the already-summarised activity counts.
//   * Temporal reasoning - already done upstream by nhei-temporal-engine.ts;
//     this file does not compute or re-derive any relation.
//   * User-facing response generation - this file returns structured
//     NheiKnowledgeEntry data only. Turning that into words a user reads
//     is a future prompt-builder's job, not this one's.
// What it DOES do: knowledge retrieval, and only that - deciding which
// topics are worth asking the Knowledge Service about, given what a
// user's NHEI context summary already says is active.
//
// Not imported by server.ts or any live route in Phase 3B, per instruction.

import { type NheiPersonalContextSummary } from './nhei-context-integration';
import { type NheiKnowledgeTopic, isValidNheiKnowledgeTopic } from './nhei-knowledge-types';
import { retrieveApprovedKnowledge } from './nhei-knowledge-service';
import { type NheiKnowledgeRetrievalResult } from './nhei-knowledge-retrieval-engine';
import type { FirestoreLike } from './nhei-persistence-service';

// SelfSystem and Dimension values (nhei-types.ts) are, by construction,
// literally the same strings as their corresponding NheiKnowledgeTopic
// values - this function still validates rather than blindly casting, so
// a future rename on either side fails loudly here instead of silently
// mismatching.
function toKnownTopics(values: string[]): NheiKnowledgeTopic[] {
  return values.filter(isValidNheiKnowledgeTopic);
}

// Derives the topics worth asking about from a context summary that is
// ALREADY the product of Phase 1/3A's interpretation - this function
// adds no interpretation of its own. A self-system or dimension counts
// as "worth asking about" only if the summary actually shows evidence
// activity for it (evidenceCount > 0) - an inactive self-system does not
// generate a topic request, so a user with no Relational Self evidence
// at all is never served Relational Self education as if it were
// relevant to them specifically.
export function topicsFromNheiPersonalContextSummary(summary: NheiPersonalContextSummary): NheiKnowledgeTopic[] {
  const active = new Set<string>();
  for (const s of summary.selfSystemActivity) if (s.evidenceCount > 0) active.add(s.selfSystem);
  for (const d of summary.dimensionActivity) if (d.evidenceCount > 0) active.add(d.dimension);
  if (summary.behaviouralPatterns.length > 0) active.add('ADAPTIVE_BEHAVIOUR');
  return toKnownTopics([...active]);
}

export interface RetrieveEducationOptions {
  limit?: number;
}

// The one function this file exposes end to end: summary in, approved
// knowledge entries out. Returns the retrieval engine's own explicit
// "nothing found" result unchanged when there is nothing relevant or
// approved yet - this file never substitutes anything of its own when
// that happens.
export async function retrieveEducationForNheiContext(
  db: FirestoreLike,
  summary: NheiPersonalContextSummary,
  options: RetrieveEducationOptions = {},
): Promise<NheiKnowledgeRetrievalResult> {
  const topics = topicsFromNheiPersonalContextSummary(summary);
  if (topics.length === 0) {
    return { found: false, entries: [], invalidTopics: [] };
  }
  return retrieveApprovedKnowledge(db, { topics, limit: options.limit });
}
