// NHEI PHASE 3C-2A - SECTION 2: EVALUATION HARNESS REGRESSION TESTS
//
// "Use deterministic fixture tests for continuous regression coverage."
// Every "model output" here is hand-constructed, fixed data - nothing in
// this file calls a model. These tests verify the SCORING LOGIC itself
// (nhei-extraction-evaluation.ts) correctly distinguishes a good
// simulated run from specific, deliberately-introduced kinds of bad ones
// - they are not, and do not claim to be, a real-model benchmark. See
// nhei-extraction-evaluation.ts's header comment for why no real-model
// run exists anywhere in this codebase.

import { describe, it, expect } from 'vitest';
import { evaluateExtractionRun, summarizeEvaluationRuns } from './nhei-extraction-evaluation';
import { NHEI_EVALUATION_DATASET, NHEI_EVALUATION_CATEGORIES, type NheiReferencePoint, type NheiEvaluationFixture } from './nhei-extraction-evaluation-dataset';
import { type NheiExtractionCandidate } from './nhei-extraction-types';

function candidateFromReference(ref: NheiReferencePoint, index: number): NheiExtractionCandidate {
  if (ref.expectAbstain) {
    return {
      candidateId: `c${index}`, abstain: true, sourceType: 'UNKNOWN', selfSystems: [], dimensions: [],
      relativeOrder: ref.expectedRelativeOrder ?? index, timeUncertainty: 'unknown', evidenceQuality: 'unknown', relatedCandidateIds: [],
    };
  }
  return {
    candidateId: `c${index}`, abstain: false,
    sourceType: ref.expectedSourceType ?? 'UNKNOWN',
    selfSystems: ref.expectedSelfSystems ?? [],
    dimensions: ref.expectedDimensions ?? [],
    relativeOrder: ref.expectedRelativeOrder ?? index,
    timeUncertainty: ref.expectedRelativeOrder !== undefined ? 'approximate' : 'unknown',
    evidenceQuality: 'medium',
    relatedCandidateIds: [],
  };
}

const perfectRunFor = (fixture: NheiEvaluationFixture): NheiExtractionCandidate[] => fixture.reference.map(candidateFromReference);

function fixtureByCategory(category: string): NheiEvaluationFixture {
  const fixture = NHEI_EVALUATION_DATASET.find((f) => f.category === category);
  if (!fixture) throw new Error(`no fixture for category ${category}`);
  return fixture;
}

describe('NHEI_EVALUATION_DATASET - dataset shape', () => {
  it('covers all 12 required categories, exactly once each', () => {
    expect(NHEI_EVALUATION_DATASET).toHaveLength(12);
    const categories = NHEI_EVALUATION_DATASET.map((f) => f.category).sort();
    expect(categories).toEqual([...NHEI_EVALUATION_CATEGORIES].sort());
  });

  it('every fixture has at least one reference point and non-empty turns', () => {
    for (const fixture of NHEI_EVALUATION_DATASET) {
      expect(fixture.turns.length).toBeGreaterThan(0);
      expect(fixture.reference.length).toBeGreaterThan(0);
    }
  });
});

describe('evaluateExtractionRun - a perfect simulated run scores perfectly', () => {
  it('scores 1.0 across every metric for every fixture in the dataset, given a reference-matching run', () => {
    for (const fixture of NHEI_EVALUATION_DATASET) {
      const result = evaluateExtractionRun({ fixture, modelCandidates: perfectRunFor(fixture) });
      expect(result.eventExtractionPrecision).toBe(1);
      expect(result.eventExtractionRecall).toBe(1);
      expect(result.selfSystemAccuracy).toBe(1);
      expect(result.dimensionAccuracy).toBe(1);
      expect(result.evidenceTypeAccuracy).toBe(1);
      expect(result.orderingConcordance).toBe(1);
      expect(result.overCautiousAbstentions).toBe(0);
      expect(result.overconfidentExtractions).toBe(0);
    }
  });

  it('the full-dataset summary reports datasetSize 12 and all-1.0 means for a perfect run across the board', () => {
    const results = NHEI_EVALUATION_DATASET.map((fixture) => evaluateExtractionRun({ fixture, modelCandidates: perfectRunFor(fixture) }));
    const summary = summarizeEvaluationRuns(results);
    expect(summary.datasetSize).toBe(12);
    expect(Object.keys(summary.categoryCounts)).toHaveLength(12);
    expect(summary.meanEventExtractionPrecision).toBe(1);
    expect(summary.meanEventExtractionRecall).toBe(1);
    expect(summary.meanSelfSystemAccuracy).toBe(1);
    expect(summary.meanOrderingConcordance).toBe(1);
  });
});

describe('evaluateExtractionRun - detects specific, deliberately introduced errors', () => {
  it('detects a wrong self-system tag (dropping PERCEIVED_RECEIVED_SELF from a simultaneously-tagged beat)', () => {
    const fixture = fixtureByCategory('multiple_simultaneous_self_systems');
    const run = perfectRunFor(fixture);
    run[0] = { ...run[0], selfSystems: ['INTERNAL_SELF'] }; // should have been ['PERCEIVED_RECEIVED_SELF', 'INTERNAL_SELF']
    const result = evaluateExtractionRun({ fixture, modelCandidates: run });
    expect(result.selfSystemAccuracy).toBeLessThan(1);
  });

  it('detects over-cautious abstention (a model abstaining on a clear, simple event)', () => {
    const fixture = fixtureByCategory('simple_experience');
    const run = perfectRunFor(fixture);
    run[0] = { ...run[0], abstain: true };
    const result = evaluateExtractionRun({ fixture, modelCandidates: run });
    expect(result.overCautiousAbstentions).toBe(1);
    expect(result.eventExtractionRecall).toBe(0);
  });

  it('detects overconfident extraction (a model extracting something from ordinary, unrelated small talk)', () => {
    const fixture = fixtureByCategory('ordinary_conversation_unrelated');
    const run: NheiExtractionCandidate[] = [
      { candidateId: 'c0', abstain: false, sourceType: 'USER_REPORTED_EVENT', selfSystems: ['INTERNAL_SELF'], dimensions: [], relativeOrder: 0, timeUncertainty: 'unknown', evidenceQuality: 'low', relatedCandidateIds: [] },
    ];
    const result = evaluateExtractionRun({ fixture, modelCandidates: run });
    expect(result.overconfidentExtractions).toBe(1);
    expect(result.eventExtractionPrecision).toBe(0);
  });

  it('detects a wrong evidence-type classification', () => {
    const fixture = fixtureByCategory('simple_experience');
    const run = perfectRunFor(fixture);
    run[0] = { ...run[0], sourceType: 'USER_REPORTED_THOUGHT' }; // reference expects USER_REPORTED_EVENT
    const result = evaluateExtractionRun({ fixture, modelCandidates: run });
    expect(result.evidenceTypeAccuracy).toBe(0);
  });

  it('detects a chronological-ordering error independent of classification correctness', () => {
    const fixture = fixtureByCategory('multi_event');
    const run = perfectRunFor(fixture);
    // Swap the relativeOrder values of the first two candidates - their
    // sourceType/self-system tags are still individually "correct" in
    // isolation, but the relative order between them is now wrong,
    // which ordering concordance (not classification accuracy) must catch.
    const swapped = run[0].relativeOrder;
    run[0] = { ...run[0], relativeOrder: run[1].relativeOrder };
    run[1] = { ...run[1], relativeOrder: swapped };
    const result = evaluateExtractionRun({ fixture, modelCandidates: run });
    expect(result.orderingConcordance).toBeLessThan(1);
    // Classification-only metrics for THOSE two candidates individually
    // remain correct - this proves ordering concordance is measuring
    // something genuinely independent, not just re-deriving classification error.
    expect(result.evidenceTypeAccuracy).toBe(1);
  });

  it('counts a forbidden claim substring found in optional raw model text, when supplied', () => {
    const fixture = fixtureByCategory('conflicting_expectation_outcome');
    const run = perfectRunFor(fixture);
    const result = evaluateExtractionRun({
      fixture, modelCandidates: run,
      rawModelText: 'The user reported that he was planning to say no the whole time.',
    });
    expect(result.claimViolationCount).toBeGreaterThan(0);
  });

  it('reports zero claim violations when no rawModelText is supplied at all - the realistic case for this pipeline', () => {
    const fixture = fixtureByCategory('conflicting_expectation_outcome');
    const result = evaluateExtractionRun({ fixture, modelCandidates: perfectRunFor(fixture) });
    expect(result.claimViolationCount).toBe(0);
  });

  it('handles a model producing fewer candidates than the reference expects (missing beats) as recall loss, not a crash', () => {
    const fixture = fixtureByCategory('multi_event');
    const run = perfectRunFor(fixture).slice(0, 1); // only the first of three expected beats
    const result = evaluateExtractionRun({ fixture, modelCandidates: run });
    expect(result.eventExtractionRecall).toBeLessThan(1);
  });

  it('handles a model producing MORE candidates than the reference expects as precision loss, not a crash', () => {
    const fixture = fixtureByCategory('simple_experience');
    const run = [
      ...perfectRunFor(fixture),
      { candidateId: 'extra', abstain: false, sourceType: 'USER_REPORTED_EVENT', selfSystems: [], dimensions: [], relativeOrder: 5, timeUncertainty: 'unknown', evidenceQuality: 'low', relatedCandidateIds: [] } as NheiExtractionCandidate,
    ];
    const result = evaluateExtractionRun({ fixture, modelCandidates: run });
    expect(result.eventExtractionPrecision).toBeLessThan(1);
  });
});
