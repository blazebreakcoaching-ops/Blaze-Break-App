// NHEI PHASE 3C-2A/3C-2B - EXTRACTION EVALUATION HARNESS
//
// Pure, I/O-free scoring logic (no model call, no network, no Firestore)
// that compares a set of model-produced NheiExtractionCandidate values
// against the manually-authored reference annotations in
// nhei-extraction-evaluation-dataset.ts. This is NOT a benchmark of a
// real model - no credentials for a real model (Gemini or otherwise)
// exist in this environment (checked again in Phase 3C-2B for
// GEMINI_API_KEY / GOOGLE_API_KEY / GENAI-style env vars - still none
// present), so there is no safe way to run a controlled real-model
// evaluation in this environment. Per instruction's own fallback: this
// file builds the HARNESS, and both phases' delivery reports state
// plainly that real-model extraction accuracy remains UNVERIFIED -
// nothing in this file's own test suite claims otherwise. What IS
// verified by this file's tests is that the SCORING LOGIC ITSELF
// correctly distinguishes a good simulated run from specific bad ones -
// regression coverage for the harness, not a claim about any model's
// real-world accuracy. Section 3's own instruction is explicit on this
// point too: "do not construct evaluation candidates that simply
// reproduce the gold-standard answers and present their scores as
// real-model accuracy" - every "perfect run" test in this file's test
// suite is labelled as exactly what it is (a harness-mechanics check),
// never as a real-model result.
//
// Matching strategy, Phase 3C-2B section 3 revision: CONTENT-AWARE, not
// positional. Phase 3C-2A's matcher paired reference[i] with
// modelCandidates[i] purely by array position - section 3 explicitly
// asks for content-aware matching instead. This version scores every
// (reference, candidate) pair by how well their CLASSIFICATION fields
// agree (sourceType match, selfSystems overlap, dimensions overlap) -
// deliberately EXCLUDING relativeOrder/episodeIndex from the match
// score itself, so that chronological-ordering accuracy and episode-
// separation accuracy remain genuinely independent metrics computed
// AFTER matching, rather than the matcher silently "fixing" an ordering
// or episode-grouping error by using order/episode as a matching
// signal. Ties (including the common case of zero content signal at
// all) are broken by array-position proximity - the same reasonable
// fallback a human reviewer would use when content alone doesn't
// distinguish two beats. Greedy, not globally optimal - a disclosed
// simplification: it assigns the single best-scoring remaining pair
// repeatedly rather than solving the assignment problem exactly, which
// is simple enough to reason about correctly and sufficient for this
// dataset's size.
//
// Why "unsupported-inference frequency," "incorrect causal claims," and
// "third-party intention-claim violations" can only ever score zero
// against this pipeline's rawModelText field today: NheiExtractionCandidate
// (nhei-extraction-types.ts) has no field capable of holding free text at
// all - the same structural guarantee Phase 1 established for
// NheiEvidenceRecord, extended one layer earlier. There is no code path in
// this pipeline where a model's free-text reasoning is ever captured or
// exposed for scanning. This file still accepts an optional `rawModelText`
// for forward-compatibility (e.g. a future debug/logging surface that DOES
// capture a model's raw response for diagnostic purposes, independent of
// the validated candidates), but no current caller in this codebase ever
// supplies one.

import { type NheiExtractionCandidate } from './nhei-extraction-types';
import { type NheiEvaluationCategory, type NheiEvaluationFixture, type NheiReferencePoint } from './nhei-extraction-evaluation-dataset';

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
  orderingConcordance: number; // pairwise concordance of relativeOrder among true-positive pairs; 1 when fewer than 2 such pairs exist
  episodeSeparationConcordance: number; // pairwise same-episode/different-episode agreement; 1 when fewer than 2 qualifying pairs exist
  correctAbstentions: number;
  overCautiousAbstentions: number; // reference expected extraction, model abstained instead
  overconfidentExtractions: number; // reference expected abstention, model extracted anyway
  causalClaimViolationCount: number;
  thirdPartyBeliefViolationCount: number;
}

const sameSet = <T,>(a: T[], b: T[]): boolean => a.length === b.length && new Set(a).size === new Set(b).size && a.every((v) => b.includes(v));
const overlapCount = <T,>(a: T[], b: T[]): number => a.filter((v) => b.includes(v)).length;

// Content-only match score - deliberately never consults relativeOrder or
// episodeIndex (see header comment on why).
function contentMatchScore(ref: NheiReferencePoint, candidate: NheiExtractionCandidate): number {
  let score = 0;
  if (ref.expectedSourceType !== undefined && candidate.sourceType === ref.expectedSourceType) score += 3;
  if (ref.expectedSelfSystems !== undefined) score += overlapCount(candidate.selfSystems, ref.expectedSelfSystems) * 2;
  if (ref.expectedDimensions !== undefined) score += overlapCount(candidate.dimensions, ref.expectedDimensions) * 2;
  return score;
}

interface MatchResult {
  pairs: { refIndex: number; candidateIndex: number }[];
  unmatchedRefIndices: number[];
  unmatchedCandidateIndices: number[];
}

// Greedy content-aware bipartite matching. Builds every (ref, candidate)
// score, sorts descending (ties broken by index-distance ascending - the
// positional fallback), and assigns the best remaining pair repeatedly
// until one side runs out.
function matchReferenceToCandidates(reference: NheiReferencePoint[], candidates: NheiExtractionCandidate[]): MatchResult {
  const scored: { refIndex: number; candidateIndex: number; score: number; distance: number }[] = [];
  for (let r = 0; r < reference.length; r++) {
    for (let c = 0; c < candidates.length; c++) {
      scored.push({ refIndex: r, candidateIndex: c, score: contentMatchScore(reference[r], candidates[c]), distance: Math.abs(r - c) });
    }
  }
  scored.sort((a, b) => (b.score - a.score) || (a.distance - b.distance));

  const usedRefs = new Set<number>();
  const usedCandidates = new Set<number>();
  const pairs: { refIndex: number; candidateIndex: number }[] = [];
  for (const entry of scored) {
    if (usedRefs.has(entry.refIndex) || usedCandidates.has(entry.candidateIndex)) continue;
    usedRefs.add(entry.refIndex);
    usedCandidates.add(entry.candidateIndex);
    pairs.push({ refIndex: entry.refIndex, candidateIndex: entry.candidateIndex });
  }
  pairs.sort((a, b) => a.refIndex - b.refIndex);

  const unmatchedRefIndices = reference.map((_, i) => i).filter((i) => !usedRefs.has(i));
  const unmatchedCandidateIndices = candidates.map((_, i) => i).filter((i) => !usedCandidates.has(i));
  return { pairs, unmatchedRefIndices, unmatchedCandidateIndices };
}

function pairwiseConcordance(points: { a: number; b: number }[]): number {
  let concordant = 0;
  let total = 0;
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      total += 1;
      const signA = Math.sign(points[i].a - points[j].a);
      const signB = Math.sign(points[i].b - points[j].b);
      if (signA === signB) concordant += 1;
    }
  }
  return total > 0 ? concordant / total : 1;
}

export function evaluateExtractionRun(input: NheiEvaluationRunInput): NheiEvaluationMetrics {
  const { fixture, modelCandidates, rawModelText } = input;
  const { pairs, unmatchedRefIndices, unmatchedCandidateIndices } = matchReferenceToCandidates(fixture.reference, modelCandidates);

  let truePositives = 0;
  let falsePositives = 0;
  let falseNegatives = 0;
  let selfSystemMatches = 0;
  let dimensionMatches = 0;
  let evidenceTypeMatches = 0;
  let correctAbstentions = 0;
  let overCautiousAbstentions = 0;
  let overconfidentExtractions = 0;
  const orderingPoints: { a: number; b: number }[] = [];
  const episodePoints: { refEpisode: number; candidateEpisode: number }[] = [];

  for (const { refIndex, candidateIndex } of pairs) {
    const ref = fixture.reference[refIndex];
    const model = modelCandidates[candidateIndex];

    if (ref.expectAbstain) {
      if (model.abstain) correctAbstentions += 1;
      else { overconfidentExtractions += 1; falsePositives += 1; }
      continue;
    }
    if (model.abstain) { overCautiousAbstentions += 1; falseNegatives += 1; continue; }

    truePositives += 1;
    if (ref.expectedSourceType !== undefined && model.sourceType === ref.expectedSourceType) evidenceTypeMatches += 1;
    if (ref.expectedSelfSystems !== undefined && sameSet(model.selfSystems, ref.expectedSelfSystems)) selfSystemMatches += 1;
    if (ref.expectedDimensions !== undefined && sameSet(model.dimensions, ref.expectedDimensions)) dimensionMatches += 1;
    if (ref.expectedRelativeOrder !== undefined) orderingPoints.push({ a: ref.expectedRelativeOrder, b: model.relativeOrder });
    if (ref.expectedEpisodeIndex !== undefined && model.episodeIndex !== undefined) {
      episodePoints.push({ refEpisode: ref.expectedEpisodeIndex, candidateEpisode: model.episodeIndex });
    }
  }

  // Unmatched reference points (the model produced fewer non-abstain
  // candidates than expected, or none at all) are recall losses, unless
  // the unmatched reference itself expected abstention (nothing to miss).
  for (const refIndex of unmatchedRefIndices) {
    if (!fixture.reference[refIndex].expectAbstain) falseNegatives += 1;
  }
  // Unmatched candidates beyond what the reference covers are precision
  // losses when they are confident (non-abstain) extractions.
  for (const candidateIndex of unmatchedCandidateIndices) {
    if (!modelCandidates[candidateIndex].abstain) falsePositives += 1;
  }

  const orderingConcordance = pairwiseConcordance(orderingPoints);
  // Episode separation is scored as a SAME-EPISODE/DIFFERENT-EPISODE
  // agreement, not a raw index match - a model could use entirely
  // different episode-index numbering than the reference (e.g. starting
  // at 5 instead of 0) and still be perfectly correct about WHICH beats
  // belong together, which is the only thing that actually matters.
  let episodeConcordant = 0;
  let episodeTotal = 0;
  for (let i = 0; i < episodePoints.length; i++) {
    for (let j = i + 1; j < episodePoints.length; j++) {
      episodeTotal += 1;
      const refSame = episodePoints[i].refEpisode === episodePoints[j].refEpisode;
      const candidateSame = episodePoints[i].candidateEpisode === episodePoints[j].candidateEpisode;
      if (refSame === candidateSame) episodeConcordant += 1;
    }
  }
  const episodeSeparationConcordance = episodeTotal > 0 ? episodeConcordant / episodeTotal : 1;

  const causalClaimViolationCount = rawModelText
    ? fixture.forbiddenCausalClaimSubstrings.filter((s) => rawModelText.toLowerCase().includes(s.toLowerCase())).length
    : 0;
  const thirdPartyBeliefViolationCount = rawModelText
    ? fixture.forbiddenThirdPartyBeliefSubstrings.filter((s) => rawModelText.toLowerCase().includes(s.toLowerCase())).length
    : 0;

  return {
    fixtureId: fixture.id,
    category: fixture.category,
    eventExtractionPrecision: truePositives + falsePositives > 0 ? truePositives / (truePositives + falsePositives) : 1,
    eventExtractionRecall: truePositives + falseNegatives > 0 ? truePositives / (truePositives + falseNegatives) : 1,
    selfSystemAccuracy: truePositives > 0 ? selfSystemMatches / truePositives : 1,
    dimensionAccuracy: truePositives > 0 ? dimensionMatches / truePositives : 1,
    evidenceTypeAccuracy: truePositives > 0 ? evidenceTypeMatches / truePositives : 1,
    orderingConcordance,
    episodeSeparationConcordance,
    correctAbstentions,
    overCautiousAbstentions,
    overconfidentExtractions,
    causalClaimViolationCount,
    thirdPartyBeliefViolationCount,
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
  meanEpisodeSeparationConcordance: number;
  totalCorrectAbstentions: number;
  totalOverCautiousAbstentions: number;
  totalOverconfidentExtractions: number;
  totalCausalClaimViolations: number;
  totalThirdPartyBeliefViolations: number;
}

const mean = (values: number[]): number => (values.length === 0 ? 1 : values.reduce((a, b) => a + b, 0) / values.length);

// Dataset-level rollup - "report the evaluation dataset size [and]
// methodology." Never called against a real model's output in this
// phase (see this file's header comment); exercised in this file's own
// tests against deterministic, hand-authored simulated runs only.
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
    meanEpisodeSeparationConcordance: mean(results.map((r) => r.episodeSeparationConcordance)),
    totalCorrectAbstentions: results.reduce((a, r) => a + r.correctAbstentions, 0),
    totalOverCautiousAbstentions: results.reduce((a, r) => a + r.overCautiousAbstentions, 0),
    totalOverconfidentExtractions: results.reduce((a, r) => a + r.overconfidentExtractions, 0),
    totalCausalClaimViolations: results.reduce((a, r) => a + r.causalClaimViolationCount, 0),
    totalThirdPartyBeliefViolations: results.reduce((a, r) => a + r.thirdPartyBeliefViolationCount, 0),
  };
}

// ---- Phase 3C-2B section 3: interpretation stability across repeated runs ----
//
// "Interpretation stability across repeated runs" - section 4 asks for
// this to be assessed against a REAL model by repeating a subset of
// scenarios; no real model exists in this environment (see header
// comment), so this function is the pure METRIC only, exercised in this
// file's tests against hand-constructed repeated "runs" (never a real
// model called twice). It measures agreement across runs field-by-field
// for each position, not overall pass/fail - a model that is stable on
// sourceType but unstable on dimensions should show that distinction,
// not be averaged into one number that hides it.
export interface NheiInterpretationStabilityResult {
  runCount: number;
  positionCount: number;
  abstainAgreementRate: number; // fraction of positions where every run agreed on abstain vs not
  sourceTypeAgreementRate: number; // among positions where every run agreed non-abstain, fraction with identical sourceType across all runs
  selfSystemsAgreementRate: number; // same, for selfSystems as a set
  dimensionsAgreementRate: number; // same, for dimensions as a set
}

export function assessInterpretationStability(runs: NheiExtractionCandidate[][]): NheiInterpretationStabilityResult {
  if (runs.length < 2) {
    throw new Error('assessInterpretationStability requires at least 2 runs to compare');
  }
  const positionCount = Math.max(...runs.map((r) => r.length));
  let abstainAgreements = 0;
  let nonAbstainPositions = 0;
  let sourceTypeAgreements = 0;
  let selfSystemsAgreements = 0;
  let dimensionsAgreements = 0;

  for (let i = 0; i < positionCount; i++) {
    const atPosition = runs.map((r) => r[i]);
    if (atPosition.some((c) => c === undefined)) continue; // a run that didn't even produce a candidate here - treated as a position this metric can't assess, not a silent pass
    const abstainValues = new Set(atPosition.map((c) => c.abstain));
    if (abstainValues.size === 1) {
      abstainAgreements += 1;
      if (atPosition[0].abstain === false) {
        nonAbstainPositions += 1;
        if (new Set(atPosition.map((c) => c.sourceType)).size === 1) sourceTypeAgreements += 1;
        if (atPosition.every((c) => sameSet(c.selfSystems, atPosition[0].selfSystems))) selfSystemsAgreements += 1;
        if (atPosition.every((c) => sameSet(c.dimensions, atPosition[0].dimensions))) dimensionsAgreements += 1;
      }
    }
  }

  return {
    runCount: runs.length,
    positionCount,
    abstainAgreementRate: positionCount > 0 ? abstainAgreements / positionCount : 1,
    sourceTypeAgreementRate: nonAbstainPositions > 0 ? sourceTypeAgreements / nonAbstainPositions : 1,
    selfSystemsAgreementRate: nonAbstainPositions > 0 ? selfSystemsAgreements / nonAbstainPositions : 1,
    dimensionsAgreementRate: nonAbstainPositions > 0 ? dimensionsAgreements / nonAbstainPositions : 1,
  };
}
