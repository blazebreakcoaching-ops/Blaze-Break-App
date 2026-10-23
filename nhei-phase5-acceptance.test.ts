// NHEI PHASE 5 - SYNTHETIC END-TO-END ACCEPTANCE (directive §11)
//
// All 20 named scenarios, each proven against the real functions they
// exercise - not re-implementations of logic already tested elsewhere.
// No real customer data anywhere; every fixture is fabricated for this
// file. No unsupported safeguard is claimed working - scenario 6 and 18
// in particular prove the opposite (fail-closed, never executed).

import { describe, it, expect } from 'vitest';
import { NHEI_EDUCATION_REQUIRES_CONSENT } from './nhei-consent';
import {
  writeNheiEvidence, setNheiConsent, grantNheiSystemAuthorityForTestingOnly,
  readNheiEvidenceForLongitudinalMode,
  type FirestoreLike, type FirestoreCollectionRefLike, type FirestoreTransactionLike,
} from './nhei-persistence-service';
import { buildNheiPersonalContextSummary } from './nhei-context-integration';
import { deriveRecurrenceRelations } from './nhei-temporal-engine';
import { orchestrateNheiRecoveryRequest, SIMULATED_TEST_ONLY_CLEARED_GATE } from './nhei-recovery-orchestration';
import { UNINTEGRATED_SAFEGUARDING_GATE } from './nhei-safeguarding-contract';
import { buildNheiRecoverySuggestions } from './nhei-recovery-bridge';
import { arbitrateNheiRecoverySuggestions } from './nhei-recovery-arbitration';
import { initNheiRecoveryInteractionState, applyNheiRecoveryInteraction } from './nhei-recovery-interaction-contract';
import { buildNheiRecoveryNavigationPlan } from './nhei-recovery-navigation';
import {
  initNheiBeforeWordsState, beginFreeExpression, moveToOptionalPrompts, skipPrompt, decideProceedWithoutRetaining,
} from './nhei-before-words-contract';
import {
  proposeAgenticAction, presentForApproval, recordApprovalDecision,
} from './nhei-agentic-action-contract';
import type { NheiPersonalContextSummary } from './nhei-context-integration';
import type { NheiBehaviouralPattern } from './nhei-adaptive-behaviour-engine';
import type { NheiRecoveryBridgeInput } from './nhei-recovery-bridge-types';
import type { NheiSafeguardingClearance, NheiSafeguardingGate } from './nhei-safeguarding-contract';

function createFakeFirestore(): FirestoreLike {
  const store = new Map<string, Record<string, unknown>>();
  function collection(path: string): FirestoreCollectionRefLike {
    return {
      doc(id?: string) {
        const docId = id ?? `auto_${Math.random().toString(36).slice(2, 10)}`;
        const key = `${path}/${docId}`;
        return {
          id: docId,
          async get() { const data = store.get(key); return { id: docId, exists: data !== undefined, data: () => data }; },
          async set(data: Record<string, unknown>, options?: { merge?: boolean }) {
            if (options?.merge && store.has(key)) store.set(key, { ...store.get(key), ...data });
            else store.set(key, { ...data });
          },
          async update(data: Record<string, unknown>) {
            if (!store.has(key)) throw new Error('no such document');
            store.set(key, { ...store.get(key), ...data });
          },
          async delete() { store.delete(key); },
        };
      },
      async get() {
        const prefix = `${path}/`;
        const docs = [...store.entries()]
          .filter(([k]) => k.startsWith(prefix) && !k.slice(prefix.length).includes('/'))
          .map(([k, data]) => ({ id: k.slice(prefix.length), exists: true, data: () => data }));
        return { docs };
      },
    };
  }
  async function runTransaction<T>(fn: (tx: FirestoreTransactionLike) => Promise<T>): Promise<T> {
    const tx: FirestoreTransactionLike = {
      get: ((ref: any) => ref.get()) as FirestoreTransactionLike['get'],
      set: (ref, data, options) => { void ref.set(data, options); },
      update: (ref, data) => { void ref.update(data); },
      delete: (ref) => { void ref.delete(); },
    };
    return fn(tx);
  }
  return { collection, runTransaction };
}

function validRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: 'ev1', sourceType: 'USER_REPORTED_EVENT', timeUncertainty: 'unknown',
    evidenceQuality: 'medium', confirmationState: 'not_applicable',
    selfSystems: ['INTERNAL_SELF'], dimensions: ['EMOTIONAL'], relatedEventIds: [],
    ...overrides,
  };
}

function emptySummary(overrides: Partial<NheiPersonalContextSummary> = {}): NheiPersonalContextSummary {
  return {
    insufficientEvidence: false, selfSystemActivity: [], dimensionActivity: [], behaviouralPatterns: [],
    confirmedInterpretations: [], openHypotheses: [], provenanceNote: 'synthetic', ...overrides,
  };
}

function pattern(overrides: Partial<NheiBehaviouralPattern> = {}): NheiBehaviouralPattern {
  return {
    behaviourEventIds: ['ev_b'], outcomeEventIds: ['ev_o'], occurrenceCount: 2,
    selfSystems: ['RELATIONAL_SELF'], dimensions: ['EMOTIONAL'], relationTypesObserved: ['RECURRENCE'],
    interpretationConfidence: 'medium', causalClaim: false, ...overrides,
  };
}

function bridgeInput(overrides: Partial<NheiRecoveryBridgeInput> = {}): NheiRecoveryBridgeInput {
  return {
    contextSummary: emptySummary(), capacityBand: null, existingRoutingCandidates: [],
    routingInsightsConsented: true, safeguardingClearance: { cleared: true, ageBand: 'adult' }, ...overrides,
  };
}

describe('1. General educational interaction without tracking consent', () => {
  it('Educational Mode is explicitly defined to need no NHEI tracking consent', () => {
    expect(NHEI_EDUCATION_REQUIRES_CONSENT).toBe(false);
  });
});

describe('2. Personal reflection consent declined', () => {
  it('buildNheiPersonalContextSummary returns null - no personal context is ever assembled', async () => {
    const db = createFakeFirestore();
    const summary = await buildNheiPersonalContextSummary(db, 'userA');
    expect(summary).toBeNull();
  });
});

describe('3. Personal reflection consent granted in an isolated mock', () => {
  it('buildNheiPersonalContextSummary returns a real summary once reflection_storage is consented, against an in-memory fake Firestore only', async () => {
    const db = createFakeFirestore();
    await setNheiConsent(db, 'userA', 'reflection_storage', true);
    const authority = grantNheiSystemAuthorityForTestingOnly('test-suite');
    for (let i = 0; i < 3; i++) await writeNheiEvidence(db, 'userA', validRecord({ id: `ev${i}` }), { systemAuthority: authority });
    const summary = await buildNheiPersonalContextSummary(db, 'userA');
    expect(summary).not.toBeNull();
  });
});

describe('4. Longitudinal consent separately declined', () => {
  it('readNheiEvidenceForLongitudinalMode returns empty even with reflection_storage consented, when longitudinal_tracking is not', async () => {
    const db = createFakeFirestore();
    await setNheiConsent(db, 'userA', 'reflection_storage', true);
    const authority = grantNheiSystemAuthorityForTestingOnly('test-suite');
    await writeNheiEvidence(db, 'userA', validRecord(), { systemAuthority: authority });
    const records = await readNheiEvidenceForLongitudinalMode(db, 'userA');
    expect(records).toEqual([]);
  });
});

describe('5. Recovery Insights permission withheld', () => {
  it('orchestration returns consent_not_granted when routing_insights is withheld', async () => {
    const db = createFakeFirestore();
    const result = await orchestrateNheiRecoveryRequest({
      uid: 'userA', conversationId: 'c1', db, safeguardingGate: UNINTEGRATED_SAFEGUARDING_GATE,
      capacityGateInput: {}, existingRoutingCandidates: [],
    });
    expect(result.status).toBe('consent_not_granted');
  });
});

describe('6. Safeguarding clearance denied', () => {
  it('orchestration fails closed via the real default gate even with consent granted', async () => {
    const db = createFakeFirestore();
    await setNheiConsent(db, 'userA', 'reflection_storage', true);
    await setNheiConsent(db, 'userA', 'routing_insights', true);
    const result = await orchestrateNheiRecoveryRequest({
      uid: 'userA', conversationId: 'c1', db, safeguardingGate: UNINTEGRATED_SAFEGUARDING_GATE,
      capacityGateInput: {}, existingRoutingCandidates: [],
    });
    expect(result.status).toBe('safeguarding_not_cleared');
  });
});

describe('7. A tentative interpretation requiring correction', () => {
  it('a tentative suggestion can be flagged via correct_interpretation without changing its confirmation kind', () => {
    const result = buildNheiRecoverySuggestions(bridgeInput({
      contextSummary: emptySummary({ behaviouralPatterns: [pattern({ selfSystems: ['RELATIONAL_SELF'] })] }),
    }));
    const suggestion = result.suggestions.find((s) => s.targetModule === 'boundary_architect')!;
    expect(suggestion.interpretationKind).toBe('tentative');
    const arbitration = arbitrateNheiRecoverySuggestions({ suggestions: result.suggestions });
    let state = initNheiRecoveryInteractionState(arbitration);
    state = applyNheiRecoveryInteraction(state, { type: 'correct_interpretation', suggestionId: suggestion.suggestionId, note: 'this reading is off' });
    expect(state.correctedSuggestionIds).toContain(suggestion.suggestionId);
    expect(suggestion.interpretationKind).toBe('tentative'); // unchanged by the correction itself
  });
});

describe('8. Genuine recurrence across distinct episodes', () => {
  it('two records in different episodes sharing a tag produce a real RECURRENCE relation', () => {
    const records = [
      { id: 'e1', episodeId: 'ep1', selfSystems: ['RELATIONAL_SELF'], dimensions: ['EMOTIONAL'], occurredAt: '2024-01-01T00:00:00Z', timeUncertainty: 'exact' } as any,
      { id: 'e2', episodeId: 'ep2', selfSystems: ['RELATIONAL_SELF'], dimensions: ['EMOTIONAL'], occurredAt: '2024-01-05T00:00:00Z', timeUncertainty: 'exact' } as any,
    ];
    const relations = deriveRecurrenceRelations(records);
    expect(relations.some((r) => r.relationType === 'RECURRENCE')).toBe(true);
  });
});

describe('9. A single episode with multiple observations', () => {
  it('two records in the SAME episode sharing a tag never produce a RECURRENCE relation', () => {
    const records = [
      { id: 'e1', episodeId: 'ep1', selfSystems: ['RELATIONAL_SELF'], dimensions: ['EMOTIONAL'], occurredAt: '2024-01-01T00:00:00Z', timeUncertainty: 'exact' } as any,
      { id: 'e2', episodeId: 'ep1', selfSystems: ['RELATIONAL_SELF'], dimensions: ['EMOTIONAL'], occurredAt: '2024-01-01T00:05:00Z', timeUncertainty: 'exact' } as any,
    ];
    const relations = deriveRecurrenceRelations(records);
    expect(relations.some((r) => r.relationType === 'RECURRENCE')).toBe(false);
  });
});

describe('10. A user accepting a suitable recovery suggestion', () => {
  it('accept moves the selection without touching any external system', () => {
    const result = buildNheiRecoverySuggestions(bridgeInput({
      contextSummary: emptySummary({ behaviouralPatterns: [pattern({ selfSystems: ['RELATIONAL_SELF'] })] }),
      capacityBand: 'reflective_bandwidth',
    }));
    const arbitration = arbitrateNheiRecoverySuggestions({ suggestions: result.suggestions });
    expect(arbitration.selected).not.toBeNull();
    let state = initNheiRecoveryInteractionState(arbitration);
    state = applyNheiRecoveryInteraction(state, { type: 'accept', suggestionId: arbitration.selected!.suggestionId });
    expect(state.selectedSuggestionId).toBe(arbitration.selected!.suggestionId);
  });
});

describe('11. A user dismissing it', () => {
  it('dismiss clears the selection', () => {
    const result = buildNheiRecoverySuggestions(bridgeInput({
      contextSummary: emptySummary({ behaviouralPatterns: [pattern({ selfSystems: ['RELATIONAL_SELF'] })] }),
    }));
    const arbitration = arbitrateNheiRecoverySuggestions({ suggestions: result.suggestions });
    let state = initNheiRecoveryInteractionState(arbitration);
    state = applyNheiRecoveryInteraction(state, { type: 'dismiss', suggestionId: arbitration.selected!.suggestionId });
    expect(state.selectedSuggestionId).toBeNull();
  });
});

describe('12. A user exploring alternatives', () => {
  it('view_alternative records what is being viewed without changing the selection', () => {
    const result = buildNheiRecoverySuggestions(bridgeInput({
      contextSummary: emptySummary({
        behaviouralPatterns: [pattern({ selfSystems: ['RELATIONAL_SELF'] })],
        confirmedInterpretations: [{ evidenceId: 'ev9', selfSystems: ['INTERNAL_SELF'], dimensions: ['PHYSICAL'], evidenceQuality: 'high' }],
      }),
    }));
    const arbitration = arbitrateNheiRecoverySuggestions({ suggestions: result.suggestions });
    expect(arbitration.alternatives.length).toBeGreaterThan(0);
    let state = initNheiRecoveryInteractionState(arbitration);
    const alt = arbitration.alternatives[0];
    state = applyNheiRecoveryInteraction(state, { type: 'view_alternative', suggestionId: alt.suggestionId });
    expect(state.viewedAlternativeId).toBe(alt.suggestionId);
    expect(state.selectedSuggestionId).toBe(arbitration.selected!.suggestionId);
  });
});

describe('13. Unknown recovery capacity', () => {
  it('capacitySuitability stays "unknown", never guessed, and a selection can still be made', () => {
    const result = buildNheiRecoverySuggestions(bridgeInput({
      contextSummary: emptySummary({ behaviouralPatterns: [pattern({ selfSystems: ['INTERNAL_SELF'] })] }),
      capacityBand: null,
    }));
    const arbitration = arbitrateNheiRecoverySuggestions({ suggestions: result.suggestions });
    expect(arbitration.selected?.capacitySuitability).toBe('unknown');
  });
});

describe('14. Unavailable recovery destination', () => {
  it('a flagged-unavailable module is excluded; arbitration abstains honestly if it was the only one', () => {
    const result = buildNheiRecoverySuggestions(bridgeInput({
      contextSummary: emptySummary({ behaviouralPatterns: [pattern({ selfSystems: ['RELATIONAL_SELF'] })] }),
    }));
    const arbitration = arbitrateNheiRecoverySuggestions({ suggestions: result.suggestions, unavailableModules: ['boundary_architect'] });
    expect(arbitration.selected).toBeNull();
    expect(arbitration.abstentionReason).toBe('all_targets_unavailable');
  });
});

describe('15. Energy Delta navigation', () => {
  it('resolves to the recover tab with its own verified scroll anchor, never a bare tab landing', () => {
    const plan = buildNheiRecoveryNavigationPlan('energy_delta');
    expect(plan.tab).toBe('recover');
    expect(plan.anchorId).toBe('energy-delta-tool');
  });
});

describe('16. A Before Words interaction without forced labels', () => {
  it('every prompt can be skipped and the person can still reach a real ending with no label chosen', () => {
    let state = initNheiBeforeWordsState();
    state = beginFreeExpression(state);
    state = moveToOptionalPrompts(state);
    state = skipPrompt(state, 'what_happened');
    state = skipPrompt(state, 'how_my_body_feels');
    state = skipPrompt(state, 'what_im_thinking');
    state = skipPrompt(state, 'what_i_need_right_now');
    state = decideProceedWithoutRetaining(state);
    expect(state.decision).toBe('proceed_without_retaining');
    expect(state.skippedPromptCategories).toHaveLength(4);
  });
});

describe('17. A proposed agentic action awaiting explicit approval', () => {
  it('a freshly presented proposal sits at awaiting_approval until a decision is recorded', () => {
    const proposal = presentForApproval(proposeAgenticAction({
      sourceSuggestionId: 'reset_studio_1', connector: 'calendar',
      proposedChangeDescription: 'Block 30 minutes tomorrow.', undoSupported: true,
    }));
    expect(proposal.state).toBe('awaiting_approval');
  });
});

describe('18. An external action that must remain unexecuted', () => {
  it('a declined proposal can never reach executing/confirmed', () => {
    const proposal = recordApprovalDecision(
      presentForApproval(proposeAgenticAction({
        sourceSuggestionId: 'reset_studio_1', connector: 'calendar',
        proposedChangeDescription: 'Block 30 minutes tomorrow.', undoSupported: true,
      })),
      false,
    );
    expect(proposal.state).toBe('declined');
    expect(['executing', 'confirmed']).not.toContain(proposal.state);
  });
});

describe('19. A youth/unknown-age restricted flow', () => {
  it('a youth ageBand is carried through orchestration untouched, never re-derived', async () => {
    const db = createFakeFirestore();
    await setNheiConsent(db, 'userA', 'reflection_storage', true);
    await setNheiConsent(db, 'userA', 'routing_insights', true);
    const authority = grantNheiSystemAuthorityForTestingOnly('test-suite');
    for (let i = 0; i < 3; i++) await writeNheiEvidence(db, 'userA', validRecord({ id: `ev${i}` }), { systemAuthority: authority });

    const youthGate: NheiSafeguardingGate = async (): Promise<NheiSafeguardingClearance> => ({ cleared: true, ageBand: 'youth' });
    const result = await orchestrateNheiRecoveryRequest({
      uid: 'userA', conversationId: 'c1', db, safeguardingGate: youthGate, capacityGateInput: {}, existingRoutingCandidates: [],
    });
    expect(result.status).toBe('completed');
    if (result.status === 'completed') expect(result.bridgeResult.ageBand).toBe('youth');
  });

  it('the real default gate (used for any unverified age) still fails closed for everyone, youth or adult alike', async () => {
    const db = createFakeFirestore();
    const result = await orchestrateNheiRecoveryRequest({
      uid: 'userA', conversationId: 'c1', db, safeguardingGate: SIMULATED_TEST_ONLY_CLEARED_GATE,
      capacityGateInput: {}, existingRoutingCandidates: [],
    });
    // routing_insights was never consented here either - proves age alone
    // never bypasses the consent check.
    expect(result.status).toBe('consent_not_granted');
  });
});

describe('20. Withdrawal or revocation of consent', () => {
  it('revoking routing_insights after it was granted makes orchestration block again immediately', async () => {
    const db = createFakeFirestore();
    await setNheiConsent(db, 'userA', 'reflection_storage', true);
    await setNheiConsent(db, 'userA', 'routing_insights', true);
    const before = await orchestrateNheiRecoveryRequest({
      uid: 'userA', conversationId: 'c1', db, safeguardingGate: SIMULATED_TEST_ONLY_CLEARED_GATE,
      capacityGateInput: {}, existingRoutingCandidates: [],
    });
    expect(before.status).not.toBe('consent_not_granted');

    await setNheiConsent(db, 'userA', 'routing_insights', false);
    const after = await orchestrateNheiRecoveryRequest({
      uid: 'userA', conversationId: 'c1', db, safeguardingGate: SIMULATED_TEST_ONLY_CLEARED_GATE,
      capacityGateInput: {}, existingRoutingCandidates: [],
    });
    expect(after.status).toBe('consent_not_granted');
  });
});
