// Phase 5B, directive §8: a combined synthetic user journey across every
// system this batch touches, plus the required refusal/uncertainty/
// changed-preference/revoked-permission/connector-failure/no-personal-
// context scenarios.
//
// HONESTY NOTE: the "optional NHEI interpretation" step below uses an
// independently-constructed synthetic NheiPersonalContextSummary - it is
// NOT derived from the Before Words free text by any real extraction
// model. No such pipeline exists in this codebase (nhei-extraction-
// service.ts's real-model path is unexercised - see
// docs/NHEI_RELEASE_BLOCKERS.md item 4/8) and this phase adds none. This
// test demonstrates how the pieces WOULD compose if that pipeline
// existed and were approved, never that it already does.
//
// Everything here runs through pure, synchronous/async functions already
// built - no Firestore, no model call, no real connector.

import { describe, it, expect } from 'vitest';
import {
  initNheiBeforeWordsState, beginFreeExpression, setFreeExpressionText, moveToOptionalPrompts,
  answerPrompt, moveToReview, decideProceedWithoutRetaining, decideRetainAsReflectionEvidence,
} from './nhei-before-words-contract';
import { buildNovaIntakeSummaryFromBeforeWords } from './nova-before-words-handoff-contract';
import { initNovaInvisibleLoadContext, addInvisibleLoadItem, optOutOfInvisibleLoad } from './nova-invisible-load-contract';
import { buildNheiRecoverySuggestions } from './nhei-recovery-bridge';
import { arbitrateNheiRecoverySuggestions } from './nhei-recovery-arbitration';
import { initNheiRecoveryInteractionState, applyNheiRecoveryInteraction } from './nhei-recovery-interaction-contract';
import {
  identifyCandidateActions, prepareAction, presentForApproval, recordApprovalDecision,
  beginExecution, executeViaConnector,
} from './nova-take-the-load-engine';
import { createFakeConnectorForTesting } from './nova-take-the-load-connector-contract';
import type { NheiRecoveryBridgeInput } from './nhei-recovery-bridge-types';
import type { NheiPersonalContextSummary } from './nhei-context-integration';
import type { NovaStatedPracticalProblem } from './nova-take-the-load-types';

function syntheticConfirmedEmotionalContext(overrides?: Partial<NheiPersonalContextSummary>): NheiPersonalContextSummary {
  return {
    insufficientEvidence: false,
    selfSystemActivity: [],
    dimensionActivity: [],
    behaviouralPatterns: [],
    confirmedInterpretations: [{ evidenceId: 'ev1', selfSystems: ['INTERNAL_SELF'], dimensions: ['EMOTIONAL'], evidenceQuality: 'high' }],
    openHypotheses: [],
    provenanceNote: 'synthetic (Phase 5B journey test)',
    ...overrides,
  };
}

function baseBridgeInput(overrides?: Partial<NheiRecoveryBridgeInput>): NheiRecoveryBridgeInput {
  return {
    contextSummary: syntheticConfirmedEmotionalContext(),
    capacityBand: 'some_bandwidth',
    existingRoutingCandidates: [],
    routingInsightsConsented: true,
    safeguardingClearance: { cleared: true, ageBand: 'adult' },
    ...overrides,
  };
}

describe('combined synthetic journey: Before Words -> handoff -> NHEI -> Invisible Load -> Recovery Intelligence -> Take the Load', () => {
  it('runs the full happy path end to end with a user-confirmed outcome', async () => {
    // 1. Before Words.
    let words = initNheiBeforeWordsState();
    words = beginFreeExpression(words);
    words = setFreeExpressionText(words, 'Everything at work has felt heavier than usual this month.');
    words = moveToOptionalPrompts(words);
    words = answerPrompt(words, 'how_my_body_feels', 'Tense shoulders most evenings.', false);
    words = moveToReview(words);
    words = decideRetainAsReflectionEvidence(words);

    // 2. Handoff into a Nova intake summary.
    const intake = buildNovaIntakeSummaryFromBeforeWords(words);
    expect(intake).not.toBeNull();
    expect(intake!.hasUncertainty).toBe(false);

    // 3. Optional NHEI interpretation - a separately-constructed synthetic context (see header note).
    const bridgeInput = baseBridgeInput();

    // 4. Invisible Load context, alongside, not inside, NHEI.
    let invisibleLoad = initNovaInvisibleLoadContext();
    invisibleLoad = addInvisibleLoadItem(invisibleLoad, 'Covering a teammate\'s on-call rotation', 'obligation', true);
    expect(invisibleLoad.items).toHaveLength(1);

    // 5. Recovery Intelligence: bridge -> arbitration.
    const bridgeResult = buildNheiRecoverySuggestions(bridgeInput);
    expect(bridgeResult.suggestions.length).toBeGreaterThan(0);
    const arbitration = arbitrateNheiRecoverySuggestions({ suggestions: bridgeResult.suggestions });
    expect(arbitration.selected).not.toBeNull();

    // 6. Proposed practical action via Take the Load, using the selected suggestion's reason as the stated problem.
    const problem: NovaStatedPracticalProblem = { description: arbitration.selected!.reason, capacityBand: 'some_bandwidth' };
    const [calendarProposal] = identifyCandidateActions(problem);
    let proposal = prepareAction(calendarProposal, problem);
    expect(proposal.state).toBe('prepared');
    proposal = presentForApproval(proposal);

    // 7. Explicit user approval.
    proposal = recordApprovalDecision(proposal, true);
    expect(proposal.state).toBe('approved');

    // 8. Simulated connector outcome.
    proposal = beginExecution(proposal);
    proposal = await executeViaConnector(proposal, createFakeConnectorForTesting());
    expect(proposal.state).toBe('confirmed');

    // 9. User-confirmed feedback on the underlying recovery suggestion, via the real Phase 4B interaction reducer.
    const interaction = applyNheiRecoveryInteraction(initNheiRecoveryInteractionState(arbitration), { type: 'accept', suggestionId: arbitration.selected!.suggestionId });
    expect(interaction.selectedSuggestionId).toBe(arbitration.selected!.suggestionId);
  });
});

describe('refusal, uncertainty, and changed-preference scenarios', () => {
  it('proceeding without retaining Before Words yields no intake summary at all - never reconstructed later', () => {
    let words = initNheiBeforeWordsState();
    words = beginFreeExpression(words);
    words = setFreeExpressionText(words, 'Not something I want kept.');
    words = decideProceedWithoutRetaining(words);
    expect(buildNovaIntakeSummaryFromBeforeWords(words)).toBeNull();
  });

  it('an uncertain prompt answer carries its uncertainty through the handoff, never resolved away', () => {
    let words = initNheiBeforeWordsState();
    words = beginFreeExpression(words);
    words = moveToOptionalPrompts(words);
    words = answerPrompt(words, 'what_im_thinking', 'Maybe I\'m overreacting?', true);
    words = decideRetainAsReflectionEvidence(words);
    expect(buildNovaIntakeSummaryFromBeforeWords(words)!.hasUncertainty).toBe(true);
  });

  it('a user declining the proposed Take the Load action stops the flow - no execution, and the decline carries no "resistance" field anywhere on the type', async () => {
    const problem: NovaStatedPracticalProblem = { description: 'Too much at once.', capacityBand: 'some_bandwidth' };
    const [proposal0] = identifyCandidateActions(problem);
    const prepared = prepareAction(proposal0, problem);
    const awaiting = presentForApproval(prepared);
    const declined = recordApprovalDecision(awaiting, false);
    expect(declined.state).toBe('declined');
    // Structural proof the decline is never scored as resistance: the proposal type has no such field.
    expect(Object.keys(declined)).not.toContain('resistanceCount');
    expect(Object.keys(declined)).not.toContain('resistanceScore');
  });

  it('opting out of Invisible Load after adding items clears them - the user can always take it back', () => {
    let context = addInvisibleLoadItem(initNovaInvisibleLoadContext(), 'A commitment', 'commitment', true);
    context = optOutOfInvisibleLoad(context);
    expect(context.items).toEqual([]);
    expect(context.optedOut).toBe(true);
  });

  it('revoking routing_insights consent mid-journey makes the bridge abstain, never falling back to a stale suggestion', () => {
    const consented = buildNheiRecoverySuggestions(baseBridgeInput({ routingInsightsConsented: true }));
    expect(consented.suggestions.length).toBeGreaterThan(0);

    const revoked = buildNheiRecoverySuggestions(baseBridgeInput({ routingInsightsConsented: false }));
    expect(revoked.suggestions).toEqual([]);
    expect(revoked.noSuggestionReason).toBe('consent_not_granted');
  });
});

describe('connector failure and absence of relevant personal context', () => {
  it('a connector failure moves the proposal to failed, with a reason, never a silent retry', async () => {
    const problem: NovaStatedPracticalProblem = { description: 'Need a protected block this week.', capacityBand: 'some_bandwidth' };
    const [calendarProposal] = identifyCandidateActions(problem);
    let proposal = prepareAction(calendarProposal, problem);
    proposal = presentForApproval(proposal);
    proposal = recordApprovalDecision(proposal, true);
    proposal = beginExecution(proposal);
    const failingConnector = createFakeConnectorForTesting({ executeResult: { ok: false, detail: 'calendar connector unreachable' } });
    proposal = await executeViaConnector(proposal, failingConnector);
    expect(proposal.state).toBe('failed');
    expect(proposal.failureReason).toBe('calendar connector unreachable');
  });

  it('no relevant personal context (insufficientEvidence) produces an explicit abstention, never an invented suggestion', () => {
    const noContext = buildNheiRecoverySuggestions(baseBridgeInput({ contextSummary: syntheticConfirmedEmotionalContext({ insufficientEvidence: true }) }));
    expect(noContext.suggestions).toEqual([]);
    expect(noContext.noSuggestionReason).toBe('insufficient_evidence');

    const arbitration = arbitrateNheiRecoverySuggestions({ suggestions: noContext.suggestions });
    expect(arbitration.selected).toBeNull();
    expect(arbitration.abstentionReason).toBe('no_candidates');
  });

  it('safeguarding not cleared blocks the bridge regardless of consent or evidence - the fail-closed default', () => {
    const blocked = buildNheiRecoverySuggestions(baseBridgeInput({ safeguardingClearance: { cleared: false, reason: 'safeguarding_layer_not_integrated' } }));
    expect(blocked.suggestions).toEqual([]);
    expect(blocked.noSuggestionReason).toBe('safeguarding_not_cleared');
  });
});
