// NHEI PHASE 3C-2B CHECKPOINT 2 - SECTION 9: SAFEGUARDING INTEGRATION
// INTERFACE TESTS
//
// Confirms the one thing this checkpoint's section 9 actually requires be
// true in code: Personal Reflection/Longitudinal Mode cannot run without
// a safeguarding gate, and the only gate that exists today
// (UNINTEGRATED_SAFEGUARDING_GATE) unconditionally blocks. Nothing here
// wires this into a route - there is no server.ts import of this file.

import { describe, it, expect } from 'vitest';
import { runGatedReflectiveModeTurn } from './nhei-gated-reflective-mode-integration';
import { UNINTEGRATED_SAFEGUARDING_GATE, type NheiSafeguardingGate } from './nhei-safeguarding-contract';
import { NHEI_CONSENT_DEFAULTS } from './nhei-consent';
import type { FirestoreLike } from './nhei-persistence-service';

function noopDb(): FirestoreLike {
  return { collection: () => ({ doc: () => ({ id: 'x', get: async () => ({ id: 'x', exists: false, data: () => undefined }) }) as any, get: async () => ({ docs: [] }) }) };
}

describe('runGatedReflectiveModeTurn - the required safeguarding integration interface', () => {
  it('blocks unconditionally today, using the real default gate - Personal Reflection/Longitudinal extraction never runs', async () => {
    const result = await runGatedReflectiveModeTurn(
      UNINTEGRATED_SAFEGUARDING_GATE,
      { uid: 'userA', conversationId: 'conv1' },
      NHEI_CONSENT_DEFAULTS,
      { mode: 'personal_reflection', turns: ['I feel overwhelmed'], modelCaller: async () => '[]', batchId: 'b1' },
      noopDb(),
    );
    expect(result.stage).toBe('safeguarding');
    expect(result.ok).toBe(false);
    if (result.stage === 'safeguarding') {
      expect(result.clearance.cleared).toBe(false);
      expect(result.clearance.reason).toBe('safeguarding_layer_not_integrated');
    }
  });

  it('never calls the model/pipeline at all when the gate blocks - modelCaller is never invoked', async () => {
    let modelCallerInvoked = false;
    await runGatedReflectiveModeTurn(
      UNINTEGRATED_SAFEGUARDING_GATE,
      { uid: 'userA', conversationId: 'conv1' },
      NHEI_CONSENT_DEFAULTS,
      {
        mode: 'longitudinal',
        turns: ['test'],
        modelCaller: async () => { modelCallerInvoked = true; return '[]'; },
        batchId: 'b1',
      },
      noopDb(),
    );
    expect(modelCallerInvoked).toBe(false);
  });

  it('the safeguarding gate receives ONLY uid/conversationId - never evidence, never a Trifecta classification, by construction (the function signature has no such parameter to pass one through)', async () => {
    let receivedContext: unknown = null;
    const spyGate: NheiSafeguardingGate = async (context) => {
      receivedContext = context;
      return { cleared: false, reason: 'safeguarding_layer_not_integrated' };
    };
    await runGatedReflectiveModeTurn(
      spyGate,
      { uid: 'userA', conversationId: 'conv1' },
      NHEI_CONSENT_DEFAULTS,
      { mode: 'personal_reflection', turns: ['test'], modelCaller: async () => '[]', batchId: 'b1' },
      noopDb(),
    );
    expect(receivedContext).toEqual({ uid: 'userA', conversationId: 'conv1' });
  });

  it('proceeds to the real pipeline once a (hypothetical, test-only) gate clears - proving the interface is correctly wired for a future real gate, not permanently broken', async () => {
    const alwaysClearGate: NheiSafeguardingGate = async () => ({ cleared: true, ageBand: 'adult' });
    const result = await runGatedReflectiveModeTurn(
      alwaysClearGate,
      { uid: 'userA', conversationId: 'conv1' },
      NHEI_CONSENT_DEFAULTS, // no consent granted - Personal Reflection Mode can still RUN without it; only persistence needs consent
      { mode: 'personal_reflection', turns: ['test'], modelCaller: async () => '[]', batchId: 'b1' },
      noopDb(),
    );
    // Reaching the pipeline stage at all (rather than being stopped here)
    // proves the gate-then-pipeline sequencing works; the pipeline's own
    // mode authorisation is a separate, already-tested concern
    // (nhei-conversation-modes.test.ts) - Personal Reflection Mode is
    // authorised to run without consent, it just could never persist
    // anything, which is not what this test is checking.
    expect(result.stage).toBe('pipeline');
    expect(result.ok).toBe(true);
  });
});
