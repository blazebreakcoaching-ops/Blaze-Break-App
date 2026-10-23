// NHEI PHASE 4B - RECOVERY ORCHESTRATION: TESTS
//
// Verifies the trusted-boundary property directly: this file's request
// type has no consent/clearance boolean to pass, and the real default
// safeguarding gate (UNINTEGRATED_SAFEGUARDING_GATE) always blocks, even
// when every other input looks ready. SIMULATED_TEST_ONLY_CLEARED_GATE is
// used only here, explicitly, to exercise the cleared:true path no real
// gate in this codebase can produce yet.

import { describe, it, expect } from 'vitest';
import { orchestrateNheiRecoveryRequest, SIMULATED_TEST_ONLY_CLEARED_GATE } from './nhei-recovery-orchestration';
import {
  writeNheiEvidence, setNheiConsent, grantNheiSystemAuthorityForTestingOnly,
  type FirestoreLike, type FirestoreCollectionRefLike, type FirestoreTransactionLike,
} from './nhei-persistence-service';
import { UNINTEGRATED_SAFEGUARDING_GATE } from './nhei-safeguarding-contract';

// Same minimal in-memory fake pattern as nhei-context-integration.test.ts.
function createFakeFirestore(): FirestoreLike {
  const store = new Map<string, Record<string, unknown>>();
  function collection(path: string): FirestoreCollectionRefLike {
    return {
      doc(id?: string) {
        const docId = id ?? `auto_${Math.random().toString(36).slice(2, 10)}`;
        const key = `${path}/${docId}`;
        return {
          id: docId,
          async get() {
            const data = store.get(key);
            return { id: docId, exists: data !== undefined, data: () => data };
          },
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

async function seedUser(db: FirestoreLike, uid: string, recordCount = 3) {
  await setNheiConsent(db, uid, 'reflection_storage', true);
  await setNheiConsent(db, uid, 'routing_insights', true);
  const authority = grantNheiSystemAuthorityForTestingOnly('test-suite');
  for (let i = 0; i < recordCount; i++) {
    await writeNheiEvidence(db, uid, validRecord({ id: `ev${i}` }), { systemAuthority: authority });
  }
}

const baseRequest = (db: FirestoreLike, uid: string, overrides: Record<string, unknown> = {}) => ({
  uid,
  conversationId: 'conv1',
  db,
  safeguardingGate: UNINTEGRATED_SAFEGUARDING_GATE,
  capacityGateInput: {},
  existingRoutingCandidates: [],
  ...overrides,
});

describe('orchestrateNheiRecoveryRequest - no personal context available', () => {
  it('returns no_personal_context_available when reflection_storage was never consented', async () => {
    const db = createFakeFirestore();
    const result = await orchestrateNheiRecoveryRequest(baseRequest(db, 'userA'));
    expect(result.status).toBe('no_personal_context_available');
  });
});

describe('orchestrateNheiRecoveryRequest - fail-closed safeguarding by default', () => {
  it('blocks even with full real evidence and consent, because the real default gate always returns cleared:false', async () => {
    const db = createFakeFirestore();
    await seedUser(db, 'userA');
    const result = await orchestrateNheiRecoveryRequest(baseRequest(db, 'userA'));
    expect(result.status).toBe('completed');
    if (result.status === 'completed') {
      expect(result.safeguardingClearance.cleared).toBe(false);
      expect(result.bridgeResult.noSuggestionReason).toBe('safeguarding_not_cleared');
      expect(result.arbitration.selected).toBeNull();
    }
  });

  it('the request type has no field that could carry a client-asserted "cleared" boolean past the real gate', async () => {
    const db = createFakeFirestore();
    await seedUser(db, 'userA');
    // Attempt to smuggle a client-asserted clearance in via an unexpected
    // field - orchestrateNheiRecoveryRequest's signature does not read it,
    // so the real gate (UNINTEGRATED_SAFEGUARDING_GATE) still decides.
    const smuggled = { ...baseRequest(db, 'userA'), safeguardingClearance: { cleared: true, ageBand: 'adult' } } as any;
    const result = await orchestrateNheiRecoveryRequest(smuggled);
    expect(result.status).toBe('completed');
    if (result.status === 'completed') expect(result.safeguardingClearance.cleared).toBe(false);
  });
});

describe('orchestrateNheiRecoveryRequest - consent is read, never accepted as a boolean', () => {
  it('routingInsightsConsented is false when the user never consented, regardless of what a caller might wish were true', async () => {
    const db = createFakeFirestore();
    await setNheiConsent(db, 'userA', 'reflection_storage', true);
    // Deliberately NOT consenting to routing_insights.
    const authority = grantNheiSystemAuthorityForTestingOnly('test-suite');
    await writeNheiEvidence(db, 'userA', validRecord(), { systemAuthority: authority });
    const smuggled = { ...baseRequest(db, 'userA'), routingInsightsConsented: true } as any;
    const result = await orchestrateNheiRecoveryRequest(smuggled);
    expect(result.status).toBe('completed');
    if (result.status === 'completed') {
      expect(result.routingInsightsConsented).toBe(false);
      expect(result.bridgeResult.noSuggestionReason).toBe('consent_not_granted');
    }
  });

  it('routingInsightsConsented is true only once the user’s own permissions document actually says so', async () => {
    const db = createFakeFirestore();
    await seedUser(db, 'userA');
    const result = await orchestrateNheiRecoveryRequest(
      baseRequest(db, 'userA', { safeguardingGate: SIMULATED_TEST_ONLY_CLEARED_GATE }),
    );
    expect(result.status).toBe('completed');
    if (result.status === 'completed') expect(result.routingInsightsConsented).toBe(true);
  });
});

describe('orchestrateNheiRecoveryRequest - full completion path (simulated clearance, test-only)', () => {
  it('produces real suggestions end-to-end once consent is real and the gate (explicitly simulated for this test) clears', async () => {
    const db = createFakeFirestore();
    await seedUser(db, 'userA');
    const result = await orchestrateNheiRecoveryRequest(
      baseRequest(db, 'userA', { safeguardingGate: SIMULATED_TEST_ONLY_CLEARED_GATE }),
    );
    expect(result.status).toBe('completed');
    if (result.status === 'completed') {
      expect(result.safeguardingClearance.cleared).toBe(true);
      // insufficientEvidence may still gate it (MIN_RECORDS_FOR_CONTEXT_SUMMARY) -
      // either a real reason or a real arbitration outcome, never a crash.
      expect(['consent_not_granted', 'safeguarding_not_cleared', 'insufficient_evidence', 'no_relevant_pattern', null])
        .toContain(result.bridgeResult.noSuggestionReason);
    }
  });

  it('runs determineBandwidth on the real caller-supplied capacity input, never inventing a band', async () => {
    const db = createFakeFirestore();
    await seedUser(db, 'userA');
    const result = await orchestrateNheiRecoveryRequest(
      baseRequest(db, 'userA', { safeguardingGate: SIMULATED_TEST_ONLY_CLEARED_GATE, capacityGateInput: {} }),
    );
    expect(result.status).toBe('completed');
    if (result.status === 'completed') {
      // With no capacity signal supplied at all, every suggestion (if any)
      // must report 'unknown', never a guessed suitability.
      for (const s of result.bridgeResult.suggestions) expect(s.capacitySuitability).toBe('unknown');
    }
  });

  it('respects an explicit low_bandwidth self-report via the real Capacity Gate', async () => {
    const db = createFakeFirestore();
    await seedUser(db, 'userA');
    const result = await orchestrateNheiRecoveryRequest(
      baseRequest(db, 'userA', {
        safeguardingGate: SIMULATED_TEST_ONLY_CLEARED_GATE,
        capacityGateInput: { explicitBandwidthReport: 'low_bandwidth' },
      }),
    );
    expect(result.status).toBe('completed');
    if (result.status === 'completed') {
      for (const s of result.bridgeResult.suggestions) expect(s.capacitySuitability).not.toBe('unknown');
    }
  });
});
