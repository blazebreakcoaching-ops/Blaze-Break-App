// NHEI PHASE 1 - TRIFECTA OF SELF ENGINE
//
// Classifies/aggregates already-tagged evidence by which of the three Self
// systems it concerns - Internal, Relational, Perceived-Received. This
// engine does not itself decide which self-system a piece of evidence
// belongs to (that classification is supplied on the evidence record by
// whatever upstream step produced it); its job is to carry that tagging
// through faithfully: never merging distinct self-systems into one, never
// treating them as mutually exclusive, and never producing a score, a
// dominant-type verdict, or anything that reads as a personality
// determination. These are conceptual coaching categories, not medically
// or psychologically established separate entities.

import {
  type NheiEvidenceRecord,
  type SelfSystem,
  SELF_SYSTEMS,
  bucketByTag,
} from './nhei-types';

export interface SelfSystemSummary {
  selfSystem: SelfSystem;
  evidenceCount: number;
  confirmedCount: number;
  disputedCount: number;
  earliestOccurredAt: string | null;
  latestOccurredAt: string | null;
  evidenceIds: string[]; // ids only, never raw content
}

export interface TrifectaClassification {
  bySelfSystem: Record<SelfSystem, NheiEvidenceRecord[]>;
  unclassified: NheiEvidenceRecord[]; // evidence with no selfSystems tags at all
}

// A record touching e.g. both INTERNAL_SELF and PERCEIVED_RECEIVED_SELF
// appears, unmodified, in both buckets below - this is the "must not be
// automatically merged" requirement made concrete.
export function classifyBySelfSystem(records: NheiEvidenceRecord[]): TrifectaClassification {
  const { buckets, unclassified } = bucketByTag<SelfSystem>(
    records,
    (r) => r.selfSystems,
    SELF_SYSTEMS,
  );
  return { bySelfSystem: buckets, unclassified };
}

export function recordsAssociatedWithSelfSystem(records: NheiEvidenceRecord[], selfSystem: SelfSystem): NheiEvidenceRecord[] {
  return records.filter((r) => r.selfSystems.includes(selfSystem));
}

// Plain counts and id lists only - deliberately never a percentage-of-total
// "dominant self" framing, which would read as a trait/personality claim.
export function summarizeSelfSystemActivity(records: NheiEvidenceRecord[]): SelfSystemSummary[] {
  return SELF_SYSTEMS.map((selfSystem) => {
    const matching = recordsAssociatedWithSelfSystem(records, selfSystem);
    const withTime = matching
      .map((r) => r.occurredAt)
      .filter((v): v is string => typeof v === 'string')
      .sort();
    return {
      selfSystem,
      evidenceCount: matching.length,
      confirmedCount: matching.filter((r) => r.confirmationState === 'user_confirmed').length,
      disputedCount: matching.filter((r) => r.confirmationState === 'user_disputed').length,
      earliestOccurredAt: withTime.length > 0 ? withTime[0] : null,
      latestOccurredAt: withTime.length > 0 ? withTime[withTime.length - 1] : null,
      evidenceIds: matching.map((r) => r.id),
    };
  });
}

// Whether a self-system has any evidence at all - used to confirm each
// self-system is independently activatable without requiring the others
// to also be present.
export function selfSystemIsActive(records: NheiEvidenceRecord[], selfSystem: SelfSystem): boolean {
  return recordsAssociatedWithSelfSystem(records, selfSystem).length > 0;
}
