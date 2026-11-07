// Phase 5C, directive §9: the full combined synthetic journey, plus the
// 10 named additional scenarios. Builds on (does not duplicate)
// nova-full-vision-phase5b-journey.test.ts - this file adds the
// calendar-protection leg and makes the suggested-vs-executed distinction
// explicit, per the directive's closing instruction: "Make the
// difference between a suggested action and an executed action
// unmistakable."

import { describe, it, expect, beforeEach } from 'vitest';
import {
  initNheiBeforeWordsState, beginFreeExpression, setFreeExpressionText,
  decideProceedWithoutRetaining, decideRetainAsReflectionEvidence,
} from './nhei-before-words-contract';
import { buildNovaIntakeSummaryFromBeforeWords } from './nova-before-words-handoff-contract';
import { initNovaInvisibleLoadContext, addInvisibleLoadItem, deferInvisibleLoadItem } from './nova-invisible-load-contract';
import { buildTakeTheLoadProblemFromInvisibleLoadItem } from './nova-invisible-load-take-the-load-bridge';
import { buildNheiRecoverySuggestions } from './nhei-recovery-bridge';
import { arbitrateNheiRecoverySuggestions } from './nhei-recovery-arbitration';
import {
  identifyCalendarPressure, prepareCalendarProtectionProposal, presentCalendarProtectionForApproval,
  recordCalendarProtectionApproval, executeCalendarProtectionProposal, TEST_ONLY_FORCE_EXECUTION_ENABLED,
} from './nova-calendar-protection-service';
import { createFakeConnectorForTesting } from './nova-take-the-load-connector-contract';
import { resetStore, fakeDb } from './test/fake-firestore';
import { setCalendarProtectionPilotEligibility } from './nova-calendar-pilot-eligibility';
import type { NheiRecoveryBridgeInput } from './nhei-recovery-bridge-types';
import type { NheiPersonalContextSummary } from './nhei-context-integration';
import type { CalendarSignalState } from './calendar-workload-defence-engine';

const UID = 'journey_user';

// Phase 5J, directive §4 added a pilot-eligibility check to
// executeCalendarProtectionProposal (see nova-calendar-pilot-eligibility.ts).
// This journey test predates that layer and exercises execute via
// TEST_ONLY_FORCE_EXECUTION_ENABLED, so UID must be seeded as eligible or
// every execute call in this file reports pilot_not_eligible instead of
// the outcome each test is actually trying to prove.
beforeEach(async () => {
  resetStore();
  await setCalendarProtectionPilotEligibility(fakeDb as any, UID, true, 'test-admin');
});

function confirmedEmotionalContext(overrides?: Partial<NheiPersonalContextSummary>): NheiPersonalContextSummary {
  return {
    insufficientEvidence: false, selfSystemActivity: [], dimensionActivity: [], behaviouralPatterns: [],
    confirmedInterpretations: [{ evidenceId: 'ev1', selfSystems: ['INTERNAL_SELF'], dimensions: ['EMOTIONAL'], evidenceQuality: 'high' }],
    openHypotheses: [], provenanceNote: 'synthetic (Phase 5C journey)', ...overrides,
  };
}

function bridgeInput(overrides?: Partial<NheiRecoveryBridgeInput>): NheiRecoveryBridgeInput {
  return {
    contextSummary: confirmedEmotionalContext(), capacityBand: 'some_bandwidth', existingRoutingCandidates: [],
    routingInsightsConsented: true, safeguardingClearance: { cleared: true, ageBand: 'adult' }, ...overrides,
  };
}

describe('Phase 5C full journey: struggles to describe workload -> practical calendar help', () => {
  it('runs the complete chain, keeping "suggested" and "executed" unmistakably distinct', async () => {
    // 1. A person struggles to describe their workload - Before Words, no forced retention.
    let words = initNheiBeforeWordsState();
    words = beginFreeExpression(words);
    words = setFreeExpressionText(words, 'I don\'t even know where to start - it\'s just a lot.');
    words = decideRetainAsReflectionEvidence(words); // explicit choice, not forced
    const intake = buildNovaIntakeSummaryFromBeforeWords(words);
    expect(intake).not.toBeNull();

    // 2. Identifies practical obligations - Invisible Load.
    let load = initNovaInvisibleLoadContext();
    load = addInvisibleLoadItem(load, 'Covering a colleague\'s on-call week', 'obligation', true);

    // 3. Receives a relevant recovery suggestion - Recovery Intelligence.
    const bridgeResult = buildNheiRecoverySuggestions(bridgeInput());
    const arbitration = arbitrateNheiRecoverySuggestions({ suggestions: bridgeResult.suggestions });
    expect(arbitration.selected).not.toBeNull();

    // 4. Requests help protecting calendar time - Take the Load / Calendar Protection.
    const problemResult = buildTakeTheLoadProblemFromInvisibleLoadItem(load.items[0], 'some_bandwidth');
    expect(problemResult.ok).toBe(true);

    const pressure = identifyCalendarPressure(heavySignal());
    expect(pressure.pressureDetected).toBe(true);

    const prepared = await prepareCalendarProtectionProposal(fakeDb as any, UID, 'journey-key-1', {
      startIso: '2026-04-01T14:00:00.000Z', endIso: '2026-04-01T14:30:00.000Z', title: 'Protected recovery block',
    });
    // 5. Inspects an exact proposed action - never vague.
    expect(prepared.startIso).toBe('2026-04-01T14:00:00.000Z');
    expect(prepared.title).toBe('Protected recovery block');
    expect(prepared.state).toBe('prepared'); // SUGGESTED, not executed

    await presentCalendarProtectionForApproval(fakeDb as any, UID, prepared.proposalId);
    // 6. Approves.
    const approval = await recordCalendarProtectionApproval(fakeDb as any, UID, prepared.proposalId, {
      approved: true, approvalFingerprint: prepared.approvalFingerprint,
    });
    expect(approval.status).toBe('approved'); // Still SUGGESTED/approved, not executed - unmistakably distinct.

    // 7. Observes a simulated execution result - in production, this is ALWAYS execution_disabled.
    const executed = await executeCalendarProtectionProposal(fakeDb as any, UID, prepared.proposalId, null);
    expect(executed.status).toBe('execution_disabled');
  });

  it('the same flow, approved and run through the TEST-ONLY override, reaches a real "confirmed" (EXECUTED) state - distinct from "approved" (SUGGESTED, approved)', async () => {
    const prepared = await prepareCalendarProtectionProposal(fakeDb as any, UID, 'journey-key-2', {
      startIso: '2026-04-02T14:00:00.000Z', endIso: '2026-04-02T14:30:00.000Z', title: 'Protected block',
    });
    await presentCalendarProtectionForApproval(fakeDb as any, UID, prepared.proposalId);
    const approval = await recordCalendarProtectionApproval(fakeDb as any, UID, prepared.proposalId, { approved: true, approvalFingerprint: prepared.approvalFingerprint });
    expect(approval.status).toBe('approved'); // SUGGESTED + approved
    const executed = await executeCalendarProtectionProposal(fakeDb as any, UID, prepared.proposalId, createFakeConnectorForTesting(), TEST_ONLY_FORCE_EXECUTION_ENABLED);
    expect(executed.status).toBe('confirmed'); // EXECUTED - a different, later, distinct state
  });
});

describe('Phase 5C journey - the 10 additional required scenarios', () => {
  it('1. consent refusal: proceeding without retaining Before Words means no intake summary exists at all', () => {
    let words = initNheiBeforeWordsState();
    words = beginFreeExpression(words);
    words = decideProceedWithoutRetaining(words);
    expect(buildNovaIntakeSummaryFromBeforeWords(words)).toBeNull();
  });

  it('2. consent withdrawal: revoking routing_insights mid-journey makes Recovery Intelligence abstain', () => {
    const before = buildNheiRecoverySuggestions(bridgeInput({ routingInsightsConsented: true }));
    expect(before.suggestions.length).toBeGreaterThan(0);
    const afterWithdrawal = buildNheiRecoverySuggestions(bridgeInput({ routingInsightsConsented: false }));
    expect(afterWithdrawal.noSuggestionReason).toBe('consent_not_granted');
  });

  it('3. missing calendar write permission: the propose route itself is covered in nova-calendar-protection-route.test.ts; at the service level, a proposal can still be prepared, but execution is categorically disabled regardless', async () => {
    const prepared = await prepareCalendarProtectionProposal(fakeDb as any, UID, 'scenario-3', {
      startIso: '2026-04-03T10:00:00.000Z', endIso: '2026-04-03T10:30:00.000Z', title: 'x',
    });
    await presentCalendarProtectionForApproval(fakeDb as any, UID, prepared.proposalId);
    await recordCalendarProtectionApproval(fakeDb as any, UID, prepared.proposalId, { approved: true, approvalFingerprint: prepared.approvalFingerprint });
    const outcome = await executeCalendarProtectionProposal(fakeDb as any, UID, prepared.proposalId, null);
    expect(outcome.status).toBe('execution_disabled');
  });

  it('4. modified approval parameters: an approval with a fingerprint that does not match the prepared proposal is rejected', async () => {
    const prepared = await prepareCalendarProtectionProposal(fakeDb as any, UID, 'scenario-4', {
      startIso: '2026-04-04T10:00:00.000Z', endIso: '2026-04-04T10:30:00.000Z', title: 'x',
    });
    await presentCalendarProtectionForApproval(fakeDb as any, UID, prepared.proposalId);
    const outcome = await recordCalendarProtectionApproval(fakeDb as any, UID, prepared.proposalId, { approved: true, approvalFingerprint: 'tampered' });
    expect(outcome.status).toBe('fingerprint_mismatch');
  });

  it('5. duplicate execution requests: a second execute call for an already-confirmed proposal never calls the connector again', async () => {
    const prepared = await prepareCalendarProtectionProposal(fakeDb as any, UID, 'scenario-5', {
      startIso: '2026-04-05T10:00:00.000Z', endIso: '2026-04-05T10:30:00.000Z', title: 'x',
    });
    await presentCalendarProtectionForApproval(fakeDb as any, UID, prepared.proposalId);
    await recordCalendarProtectionApproval(fakeDb as any, UID, prepared.proposalId, { approved: true, approvalFingerprint: prepared.approvalFingerprint });
    await executeCalendarProtectionProposal(fakeDb as any, UID, prepared.proposalId, createFakeConnectorForTesting(), TEST_ONLY_FORCE_EXECUTION_ENABLED);
    let connectorCalledAgain = false;
    const spy = { ...createFakeConnectorForTesting(), execute: async (_r: any) => { connectorCalledAgain = true; return { ok: true, detail: 'x' }; } };
    const second = await executeCalendarProtectionProposal(fakeDb as any, UID, prepared.proposalId, spy as any, TEST_ONLY_FORCE_EXECUTION_ENABLED);
    expect(second.status).toBe('already_executed');
    expect(connectorCalledAgain).toBe(false);
  });

  it('6. connector failures: a failing fake connector produces a recorded failure, never a silent retry', async () => {
    const prepared = await prepareCalendarProtectionProposal(fakeDb as any, UID, 'scenario-6', {
      startIso: '2026-04-06T10:00:00.000Z', endIso: '2026-04-06T10:30:00.000Z', title: 'x',
    });
    await presentCalendarProtectionForApproval(fakeDb as any, UID, prepared.proposalId);
    await recordCalendarProtectionApproval(fakeDb as any, UID, prepared.proposalId, { approved: true, approvalFingerprint: prepared.approvalFingerprint });
    const failing = createFakeConnectorForTesting({ executeResult: { ok: false, detail: 'synthetic outage' } });
    const outcome = await executeCalendarProtectionProposal(fakeDb as any, UID, prepared.proposalId, failing, TEST_ONLY_FORCE_EXECUTION_ENABLED);
    expect(outcome.status).toBe('failed');
    if (outcome.status === 'failed') expect(outcome.proposal.failureReason).toBe('synthetic outage');
  });

  it('7. unsupported undo: a proposal that never reached confirmed cannot be undone', async () => {
    const prepared = await prepareCalendarProtectionProposal(fakeDb as any, UID, 'scenario-7', {
      startIso: '2026-04-07T10:00:00.000Z', endIso: '2026-04-07T10:30:00.000Z', title: 'x',
    });
    await presentCalendarProtectionForApproval(fakeDb as any, UID, prepared.proposalId);
    await recordCalendarProtectionApproval(fakeDb as any, UID, prepared.proposalId, { approved: true, approvalFingerprint: prepared.approvalFingerprint });
    const { undoCalendarProtectionProposal } = await import('./nova-calendar-protection-service');
    await expect(undoCalendarProtectionProposal(fakeDb as any, UID, prepared.proposalId, null)).rejects.toThrow(/Can only undo a confirmed proposal/);
  });

  it('8. low/unknown recovery capacity: a null capacity band abstains honestly rather than inventing a fit', () => {
    let load = initNovaInvisibleLoadContext();
    load = addInvisibleLoadItem(load, 'Something unclear', 'practical_friction', false);
    const result = buildTakeTheLoadProblemFromInvisibleLoadItem(load.items[0], null);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.problem.capacityBand).toBeNull();
  });

  it('9. user correction: deferring an Invisible Load item after adding it blocks the "get help" bridge until undeferred', async () => {
    let load = initNovaInvisibleLoadContext();
    load = addInvisibleLoadItem(load, 'Reconsidering this one', 'commitment', true);
    load = deferInvisibleLoadItem(load, load.items[0].id);
    const result = buildTakeTheLoadProblemFromInvisibleLoadItem(load.items[0], 'some_bandwidth');
    expect(result).toEqual({ ok: false, reason: 'item_deferred' });
  });

  it('10. safeguarding denial: the recovery bridge abstains regardless of consent or evidence quality when safeguarding is not cleared', () => {
    const blocked = buildNheiRecoverySuggestions(bridgeInput({ safeguardingClearance: { cleared: false, reason: 'safeguarding_layer_not_integrated' } }));
    expect(blocked.noSuggestionReason).toBe('safeguarding_not_cleared');
  });
});

function heavySignal(): CalendarSignalState {
  return { totalMeetingHours: 40, meetingCount: 30, backToBackCount: 10, eveningMeetingCount: 5, weekendMeetingCount: 2, windowDays: 7, updatedAt: new Date().toISOString() };
}
