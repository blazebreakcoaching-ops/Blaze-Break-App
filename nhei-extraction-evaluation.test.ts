// NHEI PHASE 3C-2A/3C-2B - EVALUATION HARNESS REGRESSION TESTS
//
// "Use deterministic fixture tests for continuous regression coverage."
// Every "model output" here is hand-constructed, fixed data - nothing in
// this file calls a model. These tests verify the SCORING LOGIC itself
// (nhei-extraction-evaluation.ts) correctly distinguishes a good
// simulated run from specific, deliberately-introduced kinds of bad ones
// - they are not, and do not claim to be, a real-model benchmark. Per
// section 3's explicit instruction, no test here presents a harness-
// mechanics check as if it were real-model accuracy.

import { describe, it, expect } from 'vitest';
import { evaluateExtractionRun, summarizeEvaluationRuns, assessInterpretationStability } from './nhei-extraction-evaluation';
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
    ...(ref.expectedEpisodeIndex !== undefined ? { episodeIndex: ref.expectedEpisodeIndex } : {}),
  };
}

const perfectRunFor = (fixture: NheiEvaluationFixture): NheiExtractionCandidate[] => fixture.reference.map(candidateFromReference);

function fixtureByCategory(category: string): NheiEvaluationFixture {
  const fixture = NHEI_EVALUATION_DATASET.find((f) => f.category === category);
  if (!fixture) throw new Error(`no fixture for category ${category}`);
  return fixture;
}

describe('NHEI_EVALUATION_DATASET - dataset shape', () => {
  it('covers all 18 required categories (12 from Phase 3C-2A + 6 added in Phase 3C-2B section 3), exactly once each', () => {
    expect(NHEI_EVALUATION_DATASET).toHaveLength(18);
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

describe('evaluateExtractionRun - a perfect simulated run scores perfectly (harness-mechanics check, NOT a real-model result)', () => {
  it('scores 1.0 across every metric for every fixture in the dataset, given a reference-matching run', () => {
    for (const fixture of NHEI_EVALUATION_DATASET) {
      const result = evaluateExtractionRun({ fixture, modelCandidates: perfectRunFor(fixture) });
      expect(result.eventExtractionPrecision).toBe(1);
      expect(result.eventExtractionRecall).toBe(1);
      expect(result.selfSystemAccuracy).toBe(1);
      expect(result.dimensionAccuracy).toBe(1);
      expect(result.evidenceTypeAccuracy).toBe(1);
      expect(result.orderingConcordance).toBe(1);
      expect(result.episodeSeparationConcordance).toBe(1);
      expect(result.overCautiousAbstentions).toBe(0);
      expect(result.overconfidentExtractions).toBe(0);
    }
  });

  it('the full-dataset summary reports datasetSize 18 and all-1.0 means for a perfect run across the board', () => {
    const results = NHEI_EVALUATION_DATASET.map((fixture) => evaluateExtractionRun({ fixture, modelCandidates: perfectRunFor(fixture) }));
    const summary = summarizeEvaluationRuns(results);
    expect(summary.datasetSize).toBe(18);
    expect(Object.keys(summary.categoryCounts)).toHaveLength(18);
    expect(summary.meanEventExtractionPrecision).toBe(1);
    expect(summary.meanEventExtractionRecall).toBe(1);
    expect(summary.meanSelfSystemAccuracy).toBe(1);
    expect(summary.meanOrderingConcordance).toBe(1);
    expect(summary.meanEpisodeSeparationConcordance).toBe(1);
  });
});

describe('evaluateExtractionRun - content-aware matching (Phase 3C-2B section 3)', () => {
  it('matches candidates to reference points by content even when the candidate ARRAY ORDER is shuffled - not relying on position', () => {
    const fixture = fixtureByCategory('multiple_simultaneous_self_systems'); // 3 distinctly-tagged reference points
    const perfect = perfectRunFor(fixture);
    // Shuffle the candidate array order (e.g. the model emitted them in a
    // different sequence than the reference lists them) while keeping
    // each candidate's own content fields intact.
    const shuffled = [perfect[2], perfect[0], perfect[1]];
    const result = evaluateExtractionRun({ fixture, modelCandidates: shuffled });
    // Despite the array-order shuffle, content-aware matching should
    // still find the correct correspondence for every distinctly-tagged
    // candidate, so classification accuracy stays perfect.
    expect(result.evidenceTypeAccuracy).toBe(1);
    expect(result.selfSystemAccuracy).toBe(1);
    expect(result.eventExtractionRecall).toBe(1);
  });

  it('still detects a genuine ordering error via relativeOrder, independent of the content-aware match itself', () => {
    const fixture = fixtureByCategory('multi_event');
    const run = perfectRunFor(fixture);
    const swapped = run[0].relativeOrder;
    run[0] = { ...run[0], relativeOrder: run[1].relativeOrder };
    run[1] = { ...run[1], relativeOrder: swapped };
    const result = evaluateExtractionRun({ fixture, modelCandidates: run });
    expect(result.orderingConcordance).toBeLessThan(1);
    // The swap only touched relativeOrder, not classification fields -
    // evidence-type accuracy for the (correctly content-matched) pairs
    // stays perfect, proving ordering concordance is independent of
    // classification accuracy and of the matcher itself.
    expect(result.evidenceTypeAccuracy).toBe(1);
  });
});

describe('evaluateExtractionRun - episode separation (Phase 3C-2B section 3)', () => {
  it('scores perfect episode separation when repeated beats within ONE episode are correctly kept together', () => {
    const fixture = fixtureByCategory('repeated_within_one_episode');
    const result = evaluateExtractionRun({ fixture, modelCandidates: perfectRunFor(fixture) });
    expect(result.episodeSeparationConcordance).toBe(1);
  });

  it('scores perfect episode separation when similar beats across independent episodes are correctly kept apart', () => {
    const fixture = fixtureByCategory('similar_across_independent_episodes');
    const result = evaluateExtractionRun({ fixture, modelCandidates: perfectRunFor(fixture) });
    expect(result.episodeSeparationConcordance).toBe(1);
  });

  it('detects an episode-separation ERROR: treating two genuinely separate episodes as the same one', () => {
    const fixture = fixtureByCategory('similar_across_independent_episodes');
    const run = perfectRunFor(fixture);
    // Force both candidates onto the same episodeIndex, even though the
    // reference expects them to be two distinct episodes.
    run[1] = { ...run[1], episodeIndex: run[0].episodeIndex };
    const result = evaluateExtractionRun({ fixture, modelCandidates: run });
    expect(result.episodeSeparationConcordance).toBeLessThan(1);
  });

  it('detects the OPPOSITE episode-separation error: splitting one real episode into two', () => {
    const fixture = fixtureByCategory('repeated_within_one_episode');
    const run = perfectRunFor(fixture);
    run[1] = { ...run[1], episodeIndex: (run[1].episodeIndex ?? 0) + 1 };
    const result = evaluateExtractionRun({ fixture, modelCandidates: run });
    expect(result.episodeSeparationConcordance).toBeLessThan(1);
  });
});

describe('evaluateExtractionRun - detects specific, deliberately introduced errors', () => {
  it('detects a wrong self-system tag (dropping PERCEIVED_RECEIVED_SELF from a simultaneously-tagged beat)', () => {
    const fixture = fixtureByCategory('multiple_simultaneous_self_systems');
    const run = perfectRunFor(fixture);
    run[0] = { ...run[0], selfSystems: ['INTERNAL_SELF'] };
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
    run[0] = { ...run[0], sourceType: 'USER_REPORTED_THOUGHT' };
    const result = evaluateExtractionRun({ fixture, modelCandidates: run });
    expect(result.evidenceTypeAccuracy).toBe(0);
  });

  it('counts a forbidden CAUSAL claim substring separately from a third-party-belief one', () => {
    const fixture = fixtureByCategory('delayed_emotional_response');
    const result = evaluateExtractionRun({
      fixture, modelCandidates: perfectRunFor(fixture),
      rawModelText: 'The meeting caused the guilt two days later, and she definitely knew it.',
    });
    expect(result.causalClaimViolationCount).toBeGreaterThan(0);
    expect(result.thirdPartyBeliefViolationCount).toBe(0);
  });

  it('counts a forbidden THIRD-PARTY-BELIEF claim substring separately from a causal one', () => {
    const fixture = fixtureByCategory('conflicting_expectation_outcome');
    const result = evaluateExtractionRun({
      fixture, modelCandidates: perfectRunFor(fixture),
      rawModelText: 'He was planning to say no the whole time.',
    });
    expect(result.thirdPartyBeliefViolationCount).toBeGreaterThan(0);
    expect(result.causalClaimViolationCount).toBe(0);
  });

  it('reports zero claim violations of either kind when no rawModelText is supplied at all - the realistic case for this pipeline', () => {
    const fixture = fixtureByCategory('conflicting_expectation_outcome');
    const result = evaluateExtractionRun({ fixture, modelCandidates: perfectRunFor(fixture) });
    expect(result.causalClaimViolationCount).toBe(0);
    expect(result.thirdPartyBeliefViolationCount).toBe(0);
  });

  it('handles a model producing fewer candidates than the reference expects (missing beats) as recall loss, not a crash', () => {
    const fixture = fixtureByCategory('multi_event');
    const run = perfectRunFor(fixture).slice(0, 1);
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

describe('evaluateExtractionRun - new scenario categories score correctly against their own reference', () => {
  it('separate_emotional_experiences: two unrelated feelings are not required to share anything, and a perfect run scores perfectly', () => {
    const fixture = fixtureByCategory('separate_emotional_experiences');
    const result = evaluateExtractionRun({ fixture, modelCandidates: perfectRunFor(fixture) });
    expect(result.eventExtractionRecall).toBe(1);
    expect(result.episodeSeparationConcordance).toBe(1); // both events ARE in different episodes in this fixture too
  });

  it('user_disagreement_with_interpretation: the user\'s own corrected self-report is what should be extracted', () => {
    const fixture = fixtureByCategory('user_disagreement_with_interpretation');
    const result = evaluateExtractionRun({ fixture, modelCandidates: perfectRunFor(fixture) });
    expect(result.evidenceTypeAccuracy).toBe(1);
    expect(result.dimensionAccuracy).toBe(1);
  });

  it('actual_feedback_vs_assumed_judgement: real communicated feedback is classified RELATIONAL_SELF, not PERCEIVED_RECEIVED_SELF', () => {
    const fixture = fixtureByCategory('actual_feedback_vs_assumed_judgement');
    const result = evaluateExtractionRun({ fixture, modelCandidates: perfectRunFor(fixture) });
    expect(result.selfSystemAccuracy).toBe(1);

    // Deliberately introduce the confusion this fixture exists to catch -
    // misclassifying real feedback as an anticipated/assumed judgement -
    // and confirm the harness detects it.
    const wrong = perfectRunFor(fixture);
    wrong[0] = { ...wrong[0], selfSystems: ['PERCEIVED_RECEIVED_SELF'] };
    const wrongResult = evaluateExtractionRun({ fixture, modelCandidates: wrong });
    expect(wrongResult.selfSystemAccuracy).toBeLessThan(1);
  });

  it('physical_exhaustion_uncertain_cause: the state is extracted even though its cause is unknown', () => {
    const fixture = fixtureByCategory('physical_exhaustion_uncertain_cause');
    const result = evaluateExtractionRun({ fixture, modelCandidates: perfectRunFor(fixture) });
    expect(result.eventExtractionRecall).toBe(1);
    expect(result.dimensionAccuracy).toBe(1);
  });
});

describe('assessInterpretationStability', () => {
  const makeCandidate = (overrides: Partial<NheiExtractionCandidate> = {}): NheiExtractionCandidate => ({
    candidateId: 'c0', abstain: false, sourceType: 'USER_REPORTED_EVENT', selfSystems: ['INTERNAL_SELF'], dimensions: ['EMOTIONAL'],
    relativeOrder: 0, timeUncertainty: 'approximate', evidenceQuality: 'medium', relatedCandidateIds: [],
    ...overrides,
  });

  it('reports full agreement across identical repeated runs', () => {
    const run = [makeCandidate()];
    const result = assessInterpretationStability([run, run, run]);
    expect(result.abstainAgreementRate).toBe(1);
    expect(result.sourceTypeAgreementRate).toBe(1);
    expect(result.selfSystemsAgreementRate).toBe(1);
    expect(result.dimensionsAgreementRate).toBe(1);
  });

  it('detects disagreement on sourceType across runs while selfSystems/dimensions still agree', () => {
    const runA = [makeCandidate({ sourceType: 'USER_REPORTED_EVENT' })];
    const runB = [makeCandidate({ sourceType: 'USER_REPORTED_THOUGHT' })];
    const result = assessInterpretationStability([runA, runB]);
    expect(result.sourceTypeAgreementRate).toBe(0);
    expect(result.selfSystemsAgreementRate).toBe(1);
    expect(result.dimensionsAgreementRate).toBe(1);
  });

  it('detects disagreement on whether to abstain at all, and does not evaluate downstream fields for that position', () => {
    const runA = [makeCandidate({ abstain: false })];
    const runB = [makeCandidate({ abstain: true, sourceType: 'UNKNOWN', selfSystems: [], dimensions: [] })];
    const result = assessInterpretationStability([runA, runB]);
    expect(result.abstainAgreementRate).toBe(0);
    // No positions qualify as "every run agreed non-abstain," so these
    // default to 1 (nothing disagreed, because nothing was comparable) -
    // the abstain disagreement itself is what the report should flag.
    expect(result.sourceTypeAgreementRate).toBe(1);
  });

  it('requires at least 2 runs', () => {
    expect(() => assessInterpretationStability([[makeCandidate()]])).toThrow();
  });

  it('treats a position only some runs produced a candidate for as unassessed, not a silent agreement', () => {
    const runA = [makeCandidate(), makeCandidate({ candidateId: 'c1' })];
    const runB = [makeCandidate()]; // only one candidate this run
    const result = assessInterpretationStability([runA, runB]);
    // Position 0 is assessed (both runs have it, and agree); position 1
    // cannot be assessed (runB has nothing there) - this must not count
    // as agreement by default.
    expect(result.positionCount).toBe(2);
    expect(result.abstainAgreementRate).toBeLessThan(1);
  });
});
