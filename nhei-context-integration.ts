// NHEI PHASE 3A - PERSONAL CONTEXT BRAIN INTEGRATION CONTRACT
//
// Section 6 of the Phase 3A approval: design the interface that will let
// Nova's existing getNovaContextAndMetadata function (server.ts) retrieve
// approved NHEI context LATER. This file implements and unit-tests that
// interface in isolation - nothing in server.ts imports this file, and
// nothing here is called from any live Nova route. Wiring it into
// getNovaContextAndMetadata is explicitly Phase 3B+ work, gated on its
// own approval.
//
// Requirements this file is built to satisfy:
//   * Consent-gated access: returns null - not an empty summary, not an
//     error, no Firestore read beyond the one consent check - the moment
//     reflection_storage isn't consented. "No effect on users who have
//     not opted in" is structural: buildNheiPersonalContextSummary
//     performs zero evidence reads if that check fails, not a null-ed-out
//     summary built from data it already fetched.
//   * Minimal structured summaries, no raw conversation duplication: this
//     file only ever imports and re-exposes Phase 1's existing
//     count/id/label-only summary shapes (SelfSystemSummary,
//     DimensionSummary, NheiContextAgencyEvidenceSummary,
//     NheiBehaviouralPattern) - none of which has ever had a content
//     field, by Phase 1's original design.
//   * User-confirmed patterns distinguished from hypotheses: evidence
//     whose sourceType is USER_CONFIRMED_INTERPRETATION (confirmedInterpretations)
//     is returned in a field separate from SYSTEM_HYPOTHESIS evidence
//     (openHypotheses) - a consumer (a future prompt-builder) cannot
//     accidentally treat one as the other, because they are never merged
//     into one list.
//   * Explicit uncertainty: every evidence-derived item here still
//     carries its own evidenceQuality; behaviouralPatterns still carry
//     interpretationConfidence and the hard-coded causalClaim: false from
//     the Adaptive Behaviour engine. Nothing is stripped of its
//     uncertainty on the way into this summary.
//   * Clear source provenance: every bucket is keyed by the real
//     sourceType/evidence id, not collapsed into an unlabelled blob.
//   * No automatic inference from missing data: insufficientEvidence is
//     carried straight through from the Context and Agency engine's own
//     threshold (MIN_RECORDS_FOR_CONTEXT_SUMMARY) - when true, a future
//     consumer is expected to say so rather than invent something from a
//     handful of records.

import {
  type NheiEvidenceRecord,
  excludeDisputedInterpretations,
} from './nhei-types';
import { summarizeSelfSystemActivity, type SelfSystemSummary } from './nhei-trifecta-engine';
import { summarizeDimensionActivity, type DimensionSummary } from './nhei-dimensions-engine';
import { summariseAvailableEvidence } from './nhei-context-agency-engine';
import { detectBehaviouralPatterns, type NheiBehaviouralPattern } from './nhei-adaptive-behaviour-engine';
import { readNheiEvidence, readNheiTemporalView, type FirestoreLike } from './nhei-persistence-service';

// A fixed, non-identifying description of what this summary is and is
// not - intended for a future prompt-builder to cite verbatim rather than
// improvise its own framing of where this context came from.
export const NHEI_CONTEXT_PROVENANCE_NOTE =
  'Derived from the user\'s own self-reported NHEI evidence records (no raw text). ' +
  'Reflects coaching-category associations the user or a prior step tagged, not a ' +
  'diagnosis. Confirmed interpretations and open system hypotheses are kept separate ' +
  'and must not be presented as equivalent.';

export interface NheiConfirmedInterpretation {
  evidenceId: string;
  selfSystems: NheiEvidenceRecord['selfSystems'];
  dimensions: NheiEvidenceRecord['dimensions'];
  evidenceQuality: NheiEvidenceRecord['evidenceQuality'];
}

export interface NheiOpenHypothesis {
  evidenceId: string;
  selfSystems: NheiEvidenceRecord['selfSystems'];
  dimensions: NheiEvidenceRecord['dimensions'];
  evidenceQuality: NheiEvidenceRecord['evidenceQuality'];
}

export interface NheiPersonalContextSummary {
  insufficientEvidence: boolean;
  selfSystemActivity: SelfSystemSummary[];
  dimensionActivity: DimensionSummary[];
  behaviouralPatterns: NheiBehaviouralPattern[];
  confirmedInterpretations: NheiConfirmedInterpretation[];
  openHypotheses: NheiOpenHypothesis[];
  provenanceNote: string;
}

function toConfirmedInterpretation(r: NheiEvidenceRecord): NheiConfirmedInterpretation {
  return { evidenceId: r.id, selfSystems: r.selfSystems, dimensions: r.dimensions, evidenceQuality: r.evidenceQuality };
}
function toOpenHypothesis(r: NheiEvidenceRecord): NheiOpenHypothesis {
  return { evidenceId: r.id, selfSystems: r.selfSystems, dimensions: r.dimensions, evidenceQuality: r.evidenceQuality };
}

// The one function this contract exposes. Returns null, performing no
// evidence read at all, unless reflection_storage is consented - see
// readNheiEvidence/readNheiTemporalView, which already enforce that gate
// before this function ever sees a single record.
export async function buildNheiPersonalContextSummary(
  db: FirestoreLike,
  uid: string,
): Promise<NheiPersonalContextSummary | null> {
  const temporalView = await readNheiTemporalView(db, uid);
  if (temporalView === null) return null;

  const records = await readNheiEvidence(db, uid);
  const usable = excludeDisputedInterpretations(records);

  const evidenceSummary = summariseAvailableEvidence(usable);
  const behaviouralPatterns = detectBehaviouralPatterns(usable, temporalView.relations);
  const confirmedInterpretations = usable
    .filter((r) => r.sourceType === 'USER_CONFIRMED_INTERPRETATION')
    .map(toConfirmedInterpretation);
  const openHypotheses = usable
    .filter((r) => r.sourceType === 'SYSTEM_HYPOTHESIS')
    .map(toOpenHypothesis);

  return {
    insufficientEvidence: evidenceSummary.insufficientEvidence,
    selfSystemActivity: summarizeSelfSystemActivity(usable),
    dimensionActivity: summarizeDimensionActivity(usable),
    behaviouralPatterns,
    confirmedInterpretations,
    openHypotheses,
    provenanceNote: NHEI_CONTEXT_PROVENANCE_NOTE,
  };
}
