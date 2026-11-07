// NHEI PHASE 1 - ADAPTIVE BEHAVIOUR ENGINE
//
// Explores how a person's responses relate to what happened next -
// confidence, relationships, recovery - using the same evidence-threshold
// discipline already established elsewhere in this codebase
// (action-engine.ts's Personal Change Model requires >=2 independent
// occurrences before naming a trait; boundary-outcome-engine.ts's source
// patterns require >=3 entries and a 60% dominance ratio before surfacing
// one). This engine generalises that approach across the broader
// behaviour -> outcome evidence NHEI works with, rather than inventing a
// new pattern-detection method.
//
// A detected pattern is always phrased as "behaviour X was followed by
// outcome Y on N occasions" - a SEQUENCE/RECURRENCE fact already computed
// by nhei-temporal-engine.ts - never as "X caused Y." The `causalClaim`
// field on every output is hard-coded to false so a consumer cannot
// mistake this for a causal assertion even by accident. Below the evidence
// threshold, this engine returns an empty result, never a low-confidence
// guess presented the same way as a real pattern.

import {
  type NheiEvidenceRecord,
  type SelfSystem,
  type Dimension,
  type InterpretationConfidence,
  excludeDisputedInterpretations,
} from './nhei-types';
import { type NheiTemporalRelation } from './nhei-temporal-engine';

// Matches action-engine.ts's MIN_OCCURRENCES_FOR_TRAIT threshold - a single
// instance is an anecdote, not yet a pattern.
export const MIN_OCCURRENCES_FOR_BEHAVIOURAL_PATTERN = 2;

export interface NheiBehaviouralPattern {
  behaviourEventIds: string[];
  outcomeEventIds: string[];
  occurrenceCount: number;
  selfSystems: SelfSystem[];
  dimensions: Dimension[];
  relationTypesObserved: NheiTemporalRelation['relationType'][];
  interpretationConfidence: InterpretationConfidence;
  causalClaim: false; // always false - a descriptive sequence fact, never a causal one
}

const BEHAVIOUR_SOURCE_TYPES = new Set(['USER_REPORTED_BEHAVIOUR']);
const OUTCOME_SOURCE_TYPES = new Set(['USER_REPORTED_OUTCOME']);

function unionTags<T>(records: NheiEvidenceRecord[], pick: (r: NheiEvidenceRecord) => T[]): T[] {
  const set = new Set<T>();
  for (const r of records) for (const tag of pick(r)) set.add(tag);
  return Array.from(set);
}

// Finds behaviour -> outcome pairs where the temporal engine has already
// established a SEQUENCE or RECURRENCE relation between a
// USER_REPORTED_BEHAVIOUR record and a later USER_REPORTED_OUTCOME record,
// then groups those pairs by their shared self-system/dimension tags.
// Disputed interpretations (confirmationState === 'user_disputed') are
// excluded from the evidence pool before any pattern is considered, so a
// corrected interpretation can never keep contributing to a pattern.
export function detectBehaviouralPatterns(
  records: NheiEvidenceRecord[],
  relations: NheiTemporalRelation[],
): NheiBehaviouralPattern[] {
  const usable = excludeDisputedInterpretations(records);
  const byId = new Map(usable.map((r) => [r.id, r] as const));

  const behaviourToOutcomePairs = relations.filter((rel) => {
    if (rel.relationType !== 'SEQUENCE' && rel.relationType !== 'RECURRENCE') return false;
    const from = byId.get(rel.fromEventId);
    const to = byId.get(rel.toEventId);
    if (!from || !to) return false;
    return BEHAVIOUR_SOURCE_TYPES.has(from.sourceType) && OUTCOME_SOURCE_TYPES.has(to.sourceType);
  });

  // Group pairs that share at least one self-system or dimension tag -
  // each group is a candidate pattern.
  const groups: { pairs: typeof behaviourToOutcomePairs }[] = [];
  for (const pair of behaviourToOutcomePairs) {
    const from = byId.get(pair.fromEventId)!;
    const to = byId.get(pair.toEventId)!;
    const sharesWithGroup = (group: { pairs: typeof behaviourToOutcomePairs }) =>
      group.pairs.some((p) => {
        const gFrom = byId.get(p.fromEventId)!;
        const gTo = byId.get(p.toEventId)!;
        return (
          gFrom.selfSystems.some((s) => from.selfSystems.includes(s)) ||
          gTo.selfSystems.some((s) => to.selfSystems.includes(s)) ||
          gFrom.dimensions.some((d) => from.dimensions.includes(d)) ||
          gTo.dimensions.some((d) => to.dimensions.includes(d))
        );
      });
    const existing = groups.find(sharesWithGroup);
    if (existing) existing.pairs.push(pair);
    else groups.push({ pairs: [pair] });
  }

  const patterns: NheiBehaviouralPattern[] = [];
  for (const group of groups) {
    if (group.pairs.length < MIN_OCCURRENCES_FOR_BEHAVIOURAL_PATTERN) continue;
    const behaviourRecords = group.pairs.map((p) => byId.get(p.fromEventId)!);
    const outcomeRecords = group.pairs.map((p) => byId.get(p.toEventId)!);
    patterns.push({
      behaviourEventIds: behaviourRecords.map((r) => r.id),
      outcomeEventIds: outcomeRecords.map((r) => r.id),
      occurrenceCount: group.pairs.length,
      selfSystems: unionTags([...behaviourRecords, ...outcomeRecords], (r) => r.selfSystems),
      dimensions: unionTags([...behaviourRecords, ...outcomeRecords], (r) => r.dimensions),
      relationTypesObserved: Array.from(new Set(group.pairs.map((p) => p.relationType))),
      interpretationConfidence: group.pairs.length >= MIN_OCCURRENCES_FOR_BEHAVIOURAL_PATTERN + 1 ? 'medium' : 'low',
      causalClaim: false,
    });
  }
  return patterns;
}
