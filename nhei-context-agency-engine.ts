// NHEI PHASE 1 - CONTEXT AND AGENCY ENGINE
//
// Deliberately narrow scope for Phase 1. The eventual job of this engine -
// per the architecture audit - is to extend recovery-capacity-gate.ts's
// bandwidth concept (environmental pressure, responsibility load,
// available resources, realistic choices) with NHEI's own evidence. This
// file does NOT do that yet: Phase 1 is explicitly forbidden from
// modifying or integrating with Recovery Routing at all, and a real
// pressure/resource/capacity model would require new evidence semantics
// this specification doesn't define. Building that out is Phase 4+ work,
// gated on its own approval (see the Phase 1 delivery report).
//
// What this file provides instead is a purely descriptive evidence-
// availability summary - counts and distributions only, never a bandwidth
// value, a capacity score, or any other verdict that could read as a
// consequential decision input. The output type is named
// NheiContextAgencyEvidenceSummary, not "Assessment" or "Score", on
// purpose: it reports what evidence exists, not what it means.

import {
  type NheiEvidenceRecord,
  type SelfSystem,
  type Dimension,
  type EvidenceSourceType,
  SELF_SYSTEMS,
  DIMENSIONS,
  EVIDENCE_SOURCE_TYPES,
} from './nhei-types';

// Below this many records, even a purely descriptive summary would imply
// more pattern than the evidence supports - reported honestly rather than
// padded out.
export const MIN_RECORDS_FOR_CONTEXT_SUMMARY = 3;

export interface NheiContextAgencyEvidenceSummary {
  insufficientEvidence: boolean;
  totalEvidenceCount: number;
  bySourceType: Record<EvidenceSourceType, number>;
  bySelfSystem: Record<SelfSystem, number>;
  byDimension: Record<Dimension, number>;
  confirmedCount: number;
  disputedCount: number;
  unconfirmedCount: number;
}

export function summariseAvailableEvidence(records: NheiEvidenceRecord[]): NheiContextAgencyEvidenceSummary {
  const bySourceType = Object.fromEntries(EVIDENCE_SOURCE_TYPES.map((t) => [t, 0])) as Record<EvidenceSourceType, number>;
  const bySelfSystem = Object.fromEntries(SELF_SYSTEMS.map((s) => [s, 0])) as Record<SelfSystem, number>;
  const byDimension = Object.fromEntries(DIMENSIONS.map((d) => [d, 0])) as Record<Dimension, number>;

  let confirmedCount = 0;
  let disputedCount = 0;
  let unconfirmedCount = 0;

  for (const record of records) {
    bySourceType[record.sourceType] += 1;
    for (const s of record.selfSystems) bySelfSystem[s] += 1;
    for (const d of record.dimensions) byDimension[d] += 1;
    if (record.confirmationState === 'user_confirmed') confirmedCount += 1;
    else if (record.confirmationState === 'user_disputed') disputedCount += 1;
    else if (record.confirmationState === 'unconfirmed') unconfirmedCount += 1;
  }

  return {
    insufficientEvidence: records.length < MIN_RECORDS_FOR_CONTEXT_SUMMARY,
    totalEvidenceCount: records.length,
    bySourceType,
    bySelfSystem,
    byDimension,
    confirmedCount,
    disputedCount,
    unconfirmedCount,
  };
}
