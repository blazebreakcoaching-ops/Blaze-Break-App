// NHEI PHASE 3C-2A - SECTION 2: EXTRACTION EVALUATION HARNESS
//
// Pure, I/O-free scoring logic (no model call, no network, no Firestore)
// that compares a set of model-produced NheiExtractionCandidate values
// against the manually-authored reference annotations in
// nhei-extraction-evaluation-dataset.ts. This is NOT a benchmark of a
// real model - no credentials for a real model (Gemini or otherwise)
// exist in this environment (confirmed by checking for GEMINI_API_KEY /
// GOOGLE_API_KEY / GENAI-style env vars before writing this file - none
// are present), so there is no safe way to run a controlled real-model
// evaluation this phase. Per instruction's own fallback: this file builds
// the HARNESS, and the Phase 3C-2A delivery report states plainly that
// real-model extraction accuracy remains UNVERIFIED - nothing in this
// file's own test suite claims otherwise. What IS verified by this
// file's tests is that the SCORING LOGIC ITSELF correctly distinguishes
// a good simulated run from a bad one - regression coverage for the
// harness, not a claim about any model's real-world accuracy.
//
// Matching strategy (disclosed simplification): reference points and
// model candidates are aligned POSITIONALLY - reference[i] against
// modelCandidates[i] - rather than by any content-based matching
// algorithm. This is simple enough to reason about correctly, matches
// how a human reviewer would naturally line up "the candidates the
// pipeline produced, in order" against "the narrative beats I expected,
// in order," and makes ordering/classification errors fully visible
// rather than silently absorbed by a cleverer matcher. Its limitation:
// if a model's candidate COUNT differs from the reference's (extra or
// missing candidates mid-sequence, not just at the end), positional
// alignment past that point becomes unreliable - a more sophisticated
// bipartite/content-aware matcher would handle that better. This is
// named here, not hidden, as future harness work.
//
// Why "unsupported-inference frequency" and "third-party intention-claim
// violations" can only ever score zero against this pipeline's rawModelText
// field today: NheiExtractionCandidate (nhei-extraction-types.ts) has no
// field capable of holding free text at all - the same structural
// guarantee Phase 1 established for NheiEvidenceRecord, extended one
// layer earlier. There is no code path in this pipeline where a model's
// free-text reasoning is ever captured or exposed for scanning. This
// file still accepts an optional `rawModelText` for forward-compatibility
// (e.g. a future debug/logging surface that DOES capture a model's raw
// response for diagnostic purposes, independent of the validated
// candidates), but no current caller in this codebase ever supplies one.

import { type NheiExtractionCandidate } from './nhei-extraction-types';
import { type NheiEvaluationCategory, type NheiEvaluationFixture } from './nhei-extraction-evaluation-dataset';

export interface NheiEvaluationRunInput {
  fixture: NheiEvaluationFixture;
  modelCandidates: NheiExtractionCandidate[];
  rawModelText?: string; // see header comment - never populated by any real caller in this codebase today
}

export interface NheiEvaluationMetrics {
  fixtureId: string;
  category: NheiEvaluationCategory;
  eventExtractionPrecision: number;
  eventExtractionRecall: number;
  selfSystemAccuracy: number; // fraction of true-positive pairs with an exact self-system SET match
  dimensionAccuracy: number; // fraction of true-positive pairs with an exact dimension SET match
  evidenceTypeAccuracy: number; // fraction of true-positive pairs with an exact sourceType match
  orderingConcordance: number; // pairwise concordance of relativeOrder among true-positive pairs; 1 when fewer than 2 such pairs exist (nothing to disagree about)
  correctAbstentions: number;
  overCautiousAbstentions: number; // reference expected extraction, model abstained instead
  overconfidentExtractions: number; // reference expected abstention, model extracted anyway
  claimViolationCount: number; // forbiddenClaimSubstrings found in rawModelText, if supplied
}

const sameSet = <T,>(a: T[], b: T[]): boolean => a.length === b.length && new Set(a).size === new Set(b).size && a.every((v) => b.includes(v));

export function evaluateExtractionRun(input: NheiEvaluationRunInput): NheiEvaluationMetrics {
  const { fixture, modelCandidates, rawModelText } = input;
  const length = Math.max(fixture.reference.length, modelCandidates.length);

  let truePositives = 0;
  let falsePositives = 0;
  let falseNegatives = 0;
  let selfSystemMatches = 0;
  let dimensionMatches = 0;
  let evidenceTypeMatches = 0;
  let correctAbstentions = 0;
  let overCautiousAbstentions = 0;
  let overconfidentExtractions = 0;
  const orderingPairs: { refOrder: number; modelOrder: number }[] = [];

  for (let i = 0; i < length; i++) {
    const ref = fixture.reference[i];
    const model: NheiExtractionCandidate | undefined = modelCandidates[i];

    if (!ref) {
      // An extra model candidate beyond what the reference expects at all.
      if (model && !model.abstain) falsePositives += 1;
      continue;
    }

    if (!model) {
      // The model produced nothing at a position the reference covers.
      if (!ref.expectAbstain) falseNegatives += 1;
      continue;
    }

    if (ref.expectAbstain) {
      if (model.abstain) {
        correctAbstentions += 1;
      } else {
        overconfidentExtractions += 1;
        falsePositives += 1;
      }
      continue;
    }

    // Reference expects real extraction here.
    if (model.abstain) {
      overCautiousAbstentions += 1;
      falseNegatives += 1;
      continue;
    }

    truePositives += 1;
    if (ref.expectedSourceType !== undefined && model.sourceType === ref.expectedSourceType) evidenceTypeMatches += 1;
    if (ref.expectedSelfSystems !== undefined && sameSet(model.selfSystems, ref.expectedSelfSystems)) selfSystemMatches += 1;
    if (ref.expectedDimensions !== undefined && sameSet(model.dimensions, ref.expectedDimensions)) dimensionMatches += 1;
    if (ref.expectedRelativeOrder !== undefined) orderingPairs.push({ refOrder: ref.expectedRelativeOrder, modelOrder: model.relativeOrder });
  }

  let concordant = 0;
  let totalPairs = 0;
  for (let i = 0; i < orderingPairs.length; i++) {
    for (let j = i + 1; j < orderingPairs.length; j++) {
      totalPairs += 1;
      const refSign = Math.sign(orderingPairs[i].refOrder - orderingPairs[j].refOrder);
      const modelSign = Math.sign(orderingPairs[i].modelOrder - orderingPairs[j].modelOrder);
      if (refSign === modelSign) concordant += 1;
    }
  }

  const claimViolationCount = rawModelText
    ? fixture.forbiddenClaimSubstrings.filter((s) => rawModelText.toLowerCase().includes(s.toLowerCase())).length
    : 0;

  return {
    fixtureId: fixture.id,
    category: fixture.category,
    eventExtractionPrecision: truePositives + falsePositives > 0 ? truePositives / (truePositives + falsePositives) : 1,
    eventExtractionRecall: truePositives + falseNegatives > 0 ? truePositives / (truePositives + falseNegatives) : 1,
    selfSystemAccuracy: truePositives > 0 ? selfSystemMatches / truePositives : 1,
    dimensionAccuracy: truePositives > 0 ? dimensionMatches / truePositives : 1,
    evidenceTypeAccuracy: truePositives > 0 ? evidenceTypeMatches / truePositives : 1,
    orderingConcordance: totalPairs > 0 ? concordant / totalPairs : 1,
    correctAbstentions,
    overCautiousAbstentions,
    overconfidentExtractions,
    claimViolationCount,
  };
}

export interface NheiEvaluationDatasetSummary {
  datasetSize: number;
  categoryCounts: Record<string, number>;
  meanEventExtractionPrecision: number;
  meanEventExtractionRecall: number;
  meanSelfSystemAccuracy: number;
  meanDimensionAccuracy: number;
  meanEvidenceTypeAccuracy: number;
  meanOrderingConcordance: number;
  totalCorrectAbstentions: number;
  totalOverCautiousAbstentions: number;
  totalOverconfidentExtractions: number;
  totalClaimViolations: number;
}

const mean = (values: number[]): number => (values.length === 0 ? 1 : values.reduce((a, b) => a + b, 0) / values.length);

// Dataset-level rollup - "report the evaluation dataset size [and]
// methodology" (section 2). Never called against a real model's output
// in this phase (see this file's header comment); exercised in this
// file's own tests against the deterministic, hand-authored simulated
// runs only.
export function summarizeEvaluationRuns(results: NheiEvaluationMetrics[]): NheiEvaluationDatasetSummary {
  const categoryCounts: Record<string, number> = {};
  for (const r of results) categoryCounts[r.category] = (categoryCounts[r.category] ?? 0) + 1;

  return {
    datasetSize: results.length,
    categoryCounts,
    meanEventExtractionPrecision: mean(results.map((r) => r.eventExtractionPrecision)),
    meanEventExtractionRecall: mean(results.map((r) => r.eventExtractionRecall)),
    meanSelfSystemAccuracy: mean(results.map((r) => r.selfSystemAccuracy)),
    meanDimensionAccuracy: mean(results.map((r) => r.dimensionAccuracy)),
    meanEvidenceTypeAccuracy: mean(results.map((r) => r.evidenceTypeAccuracy)),
    meanOrderingConcordance: mean(results.map((r) => r.orderingConcordance)),
    totalCorrectAbstentions: results.reduce((a, r) => a + r.correctAbstentions, 0),
    totalOverCautiousAbstentions: results.reduce((a, r) => a + r.overCautiousAbstentions, 0),
    totalOverconfidentExtractions: results.reduce((a, r) => a + r.overconfidentExtractions, 0),
    totalClaimViolations: results.reduce((a, r) => a + r.claimViolationCount, 0),
  };
}
