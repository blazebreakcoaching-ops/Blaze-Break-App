// NHEI PHASE 1 - FOUR DIMENSIONS OF HUMAN EXPERIENCE ENGINE
//
// Classifies/aggregates already-tagged evidence by which of the four
// Dimensions it concerns - Metaphysical, Physical, Mental, Emotional. Same
// shape and the same guarantees as nhei-trifecta-engine.ts: this engine
// carries existing dimension tags through faithfully, allows one piece of
// evidence to touch multiple dimensions at once without merging them, and
// never produces a diagnostic score or infers a personality/condition from
// the resulting associations.

import {
  type NheiEvidenceRecord,
  type Dimension,
  DIMENSIONS,
  bucketByTag,
} from './nhei-types';

export interface DimensionSummary {
  dimension: Dimension;
  evidenceCount: number;
  confirmedCount: number;
  disputedCount: number;
  earliestOccurredAt: string | null;
  latestOccurredAt: string | null;
  evidenceIds: string[]; // ids only, never raw content
}

export interface DimensionsClassification {
  byDimension: Record<Dimension, NheiEvidenceRecord[]>;
  unclassified: NheiEvidenceRecord[]; // evidence with no dimension tags at all
}

export function classifyByDimension(records: NheiEvidenceRecord[]): DimensionsClassification {
  const { buckets, unclassified } = bucketByTag<Dimension>(
    records,
    (r) => r.dimensions,
    DIMENSIONS,
  );
  return { byDimension: buckets, unclassified };
}

export function recordsAssociatedWithDimension(records: NheiEvidenceRecord[], dimension: Dimension): NheiEvidenceRecord[] {
  return records.filter((r) => r.dimensions.includes(dimension));
}

// Plain counts and id lists only - never a diagnostic score, never a
// "primary dimension" verdict framed as a trait of the person.
export function summarizeDimensionActivity(records: NheiEvidenceRecord[]): DimensionSummary[] {
  return DIMENSIONS.map((dimension) => {
    const matching = recordsAssociatedWithDimension(records, dimension);
    const withTime = matching
      .map((r) => r.occurredAt)
      .filter((v): v is string => typeof v === 'string')
      .sort();
    return {
      dimension,
      evidenceCount: matching.length,
      confirmedCount: matching.filter((r) => r.confirmationState === 'user_confirmed').length,
      disputedCount: matching.filter((r) => r.confirmationState === 'user_disputed').length,
      earliestOccurredAt: withTime.length > 0 ? withTime[0] : null,
      latestOccurredAt: withTime.length > 0 ? withTime[withTime.length - 1] : null,
      evidenceIds: matching.map((r) => r.id),
    };
  });
}

export function dimensionIsActive(records: NheiEvidenceRecord[], dimension: Dimension): boolean {
  return recordsAssociatedWithDimension(records, dimension).length > 0;
}
