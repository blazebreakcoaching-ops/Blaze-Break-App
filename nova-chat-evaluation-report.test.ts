import { describe, expect, it } from 'vitest';
import { buildRunReport, renderMarkdown } from './nova-chat-evaluation-report';
import type { NovaScenarioEvaluationResult } from './nova-chat-scenario-types';

// No Gemini client, credentials, network or Firestore. These are pure
// regression tests of how Nova labels evidence and blocks false approval.
const config = {
  featureFlagState: { NOVA_AGENTIC_JOURNEY_ENABLED: false },
  note: 'Synthetic test case; not a model evaluation.',
};

function scenario(status: number, responseText: string | null, passed = true): NovaScenarioEvaluationResult {
  return {
    scenarioId: 'evidence_test',
    category: 'overwhelmed_unexplained',
    title: 'Synthetic evidence status test',
    turnResults: [{
      turnIndex: 0,
      userMessage: 'Synthetic test prompt',
      httpStatus: status,
      responseText,
      planTrace: [],
      hardInvariants: [{ id: 'no_server_error', passed, detail: 'Synthetic assertion only' }],
      heuristicSignals: [],
      error: null,
    }],
    allHardInvariantsPassed: passed,
    qualitativeReview: {
      focusPerTurn: ['Independently review the response'],
      automatedJudgment: null,
      reviewStatus: 'unreviewed',
      suggestedFollowUp: 'Human reviewer must inspect the actual response.',
    },
  };
}

describe('Nova evaluation report evidence integrity', () => {
  it('labels a blocked live evaluation NOT RUN, never as a completed real-model test', () => {
    const report = buildRunReport('live_gemini', [], { ...config, modelId: null });
    const markdown = renderMarkdown(report);

    expect(markdown).toContain('NOT RUN (live evaluation blocked before a model call)');
    expect(markdown).toContain('Pilot approval**: NOT GRANTED');
    expect(markdown).not.toContain('LIVE Gemini (usable real-model response captured');
    expect(report.unresolvedRisks).toEqual(expect.arrayContaining([
      expect.stringContaining('No real-model scenario results'),
    ]));
  });

  it('does not treat a real-model call with no usable reply as conversational-quality evidence', () => {
    const report = buildRunReport('live_gemini', [scenario(500, null, false)], {
      ...config,
      modelId: 'synthetic-model-id',
    });

    expect(renderMarkdown(report)).toContain('LIVE EVALUATION ATTEMPT (no usable model response captured)');
    expect(report.unresolvedRisks).toEqual(expect.arrayContaining([
      expect.stringContaining('hard-invariant failure'),
      expect.stringContaining('No usable real-model response'),
      expect.stringContaining('Independent human qualitative/safeguarding review'),
    ]));
  });

  it('records human-review blocker even when every automated invariant passes', () => {
    const report = buildRunReport('live_gemini', [scenario(200, 'Synthetic response', true)], {
      ...config,
      modelId: 'synthetic-model-id',
    });

    expect(renderMarkdown(report)).toContain('LIVE Gemini (usable real-model response captured; independent review pending)');
    expect(renderMarkdown(report)).toContain('Pilot approval**: NOT GRANTED');
    expect(report.unresolvedRisks).toEqual(expect.arrayContaining([
      expect.stringContaining('Independent human qualitative/safeguarding review is outstanding'),
    ]));
    expect(report.unresolvedRisks).not.toEqual([]);
  });

  it('renders NOT RUN when a priced model was selected but no actual invoker attempt happened', () => {
    const report = buildRunReport('live_gemini', [], {
      ...config,
      modelId: 'synthetic-model-id',
      callsAttempted: 0,
    });

    expect(renderMarkdown(report)).toContain('NOT RUN (live evaluation blocked before a model call)');
    expect(renderMarkdown(report)).toContain('Provider calls attempted**: 0');
    expect(report.unresolvedRisks).toEqual(expect.arrayContaining([
      expect.stringContaining('No Gemini provider calls were attempted'),
    ]));
  });

  it('distinguishes unverified safety floor from a proven failing safety check in report text', () => {
    const incomplete = scenario(200, 'Scripted reply');
    incomplete.allHardInvariantsPassed = false;
    incomplete.turnResults[0].hardInvariants = [{
      id: 'safety_floor_present', passed: false,
      detail: 'NOT VERIFIED: provider-call system prompt was not observable',
    }];
    const report = buildRunReport('live_gemini', [incomplete], {
      ...config, modelId: 'synthetic-model-id', callsAttempted: 1,
    });
    expect(renderMarkdown(report)).toContain('Hard invariants: INCOMPLETE (unverified safety evidence)');
    expect(renderMarkdown(report)).toContain('Provider calls attempted**: 1');
    expect(renderMarkdown(report)).toContain('Pilot approval**: NOT GRANTED');
  });

  it('never presents an offline mock as proof of conversational quality', () => {
    const report = buildRunReport('offline', [scenario(200, 'Scripted mock')], config);

    expect(renderMarkdown(report)).toContain('OFFLINE (mocked model');
    expect(renderMarkdown(report)).toContain('Pilot approval**: NOT GRANTED');
    expect(report.unresolvedRisks).toEqual(expect.arrayContaining([
      expect.stringContaining('mocked model'),
    ]));
  });
});
