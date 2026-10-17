import { describe, it, expect } from 'vitest';
import { buildNheiPersonalContextSummary, NHEI_CONTEXT_PROVENANCE_NOTE } from './nhei-context-integration';
import { writeNheiEvidence, setNheiConsent, disputeNheiEvidence, grantNheiSystemAuthority, type FirestoreLike, type FirestoreCollectionRefLike } from './nhei-persistence-service';

// Same minimal in-memory fake pattern as nhei-persistence-service.test.ts.
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
  return { collection };
}

function validRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: 'ev1', sourceType: 'USER_REPORTED_EVENT', timeUncertainty: 'unknown',
    evidenceQuality: 'medium', confirmationState: 'not_applicable',
    selfSystems: ['INTERNAL_SELF'], dimensions: ['EMOTIONAL'], relatedEventIds: [],
    ...overrides,
  };
}

describe('buildNheiPersonalContextSummary - consent gating', () => {
  it('returns null (no effect) for a user who has never consented', async () => {
    const db = createFakeFirestore();
    expect(await buildNheiPersonalContextSummary(db, 'userA')).toBeNull();
  });

  it('returns a real summary once reflection_storage is consented', async () => {
    const db = createFakeFirestore();
    await setNheiConsent(db, 'userA', 'reflection_storage', true);
    await writeNheiEvidence(db, 'userA', validRecord());
    const summary = await buildNheiPersonalContextSummary(db, 'userA');
    expect(summary).not.toBeNull();
  });
});

describe('buildNheiPersonalContextSummary - structure and minimality', () => {
  it('carries insufficientEvidence straight from the Context and Agency engine threshold', async () => {
    const db = createFakeFirestore();
    await setNheiConsent(db, 'userA', 'reflection_storage', true);
    await writeNheiEvidence(db, 'userA', validRecord({ id: 'e1' }));
    const summary = await buildNheiPersonalContextSummary(db, 'userA');
    expect(summary!.insufficientEvidence).toBe(true); // below MIN_RECORDS_FOR_CONTEXT_SUMMARY

    await writeNheiEvidence(db, 'userA', validRecord({ id: 'e2' }));
    await writeNheiEvidence(db, 'userA', validRecord({ id: 'e3' }));
    const summary2 = await buildNheiPersonalContextSummary(db, 'userA');
    expect(summary2!.insufficientEvidence).toBe(false);
  });

  it('never contains a raw-text/content field anywhere in its output', async () => {
    const db = createFakeFirestore();
    await setNheiConsent(db, 'userA', 'reflection_storage', true);
    const SENSITIVE_RAW_TEXT = 'I feel like a failure because of what happened with my brother';
    await writeNheiEvidence(db, 'userA', validRecord({ debugContent: SENSITIVE_RAW_TEXT }));
    const summary = await buildNheiPersonalContextSummary(db, 'userA');
    expect(JSON.stringify(summary)).not.toContain(SENSITIVE_RAW_TEXT);
  });

  it('includes the fixed provenance note verbatim', async () => {
    const db = createFakeFirestore();
    await setNheiConsent(db, 'userA', 'reflection_storage', true);
    await writeNheiEvidence(db, 'userA', validRecord());
    const summary = await buildNheiPersonalContextSummary(db, 'userA');
    expect(summary!.provenanceNote).toBe(NHEI_CONTEXT_PROVENANCE_NOTE);
  });
});

describe('buildNheiPersonalContextSummary - confirmed interpretations vs. open hypotheses', () => {
  it('keeps USER_CONFIRMED_INTERPRETATION and SYSTEM_HYPOTHESIS evidence in separate, distinctly labelled buckets', async () => {
    const db = createFakeFirestore();
    await setNheiConsent(db, 'userA', 'reflection_storage', true);
    const authority = grantNheiSystemAuthority('test-suite');
    await writeNheiEvidence(db, 'userA', validRecord({ id: 'confirmed1', sourceType: 'USER_CONFIRMED_INTERPRETATION', confirmationState: 'not_applicable' }), { systemAuthority: authority });
    await writeNheiEvidence(db, 'userA', validRecord({ id: 'hypothesis1', sourceType: 'SYSTEM_HYPOTHESIS', confirmationState: 'unconfirmed' }), { systemAuthority: authority });
    await writeNheiEvidence(db, 'userA', validRecord({ id: 'plain1' }));

    const summary = await buildNheiPersonalContextSummary(db, 'userA');
    expect(summary!.confirmedInterpretations.map((c) => c.evidenceId)).toEqual(['confirmed1']);
    expect(summary!.openHypotheses.map((h) => h.evidenceId)).toEqual(['hypothesis1']);
    // Never cross-contaminated - a hypothesis never shows up as confirmed, or vice versa.
    expect(summary!.confirmedInterpretations.some((c) => c.evidenceId === 'hypothesis1')).toBe(false);
    expect(summary!.openHypotheses.some((h) => h.evidenceId === 'confirmed1')).toBe(false);
  });

  it('a disputed interpretation never appears in either bucket', async () => {
    const db = createFakeFirestore();
    await setNheiConsent(db, 'userA', 'reflection_storage', true);
    const authority = grantNheiSystemAuthority('test-suite');
    await writeNheiEvidence(db, 'userA', validRecord({ id: 'hyp1', sourceType: 'SYSTEM_HYPOTHESIS', confirmationState: 'unconfirmed' }), { systemAuthority: authority });
    await disputeNheiEvidence(db, 'userA', 'hyp1');

    const summary = await buildNheiPersonalContextSummary(db, 'userA');
    expect(summary!.openHypotheses).toEqual([]);
    expect(summary!.confirmedInterpretations).toEqual([]);
  });
});

describe('buildNheiPersonalContextSummary - behavioural patterns carry their own uncertainty', () => {
  it('every surfaced pattern still has causalClaim: false and an interpretationConfidence', async () => {
    const db = createFakeFirestore();
    await setNheiConsent(db, 'userA', 'reflection_storage', true);
    await setNheiConsent(db, 'userA', 'longitudinal_tracking', true);
    await writeNheiEvidence(db, 'userA', validRecord({ id: 'b1', sourceType: 'USER_REPORTED_BEHAVIOUR', reportedOrder: 1, timeUncertainty: 'approximate' }));
    await writeNheiEvidence(db, 'userA', validRecord({ id: 'o1', sourceType: 'USER_REPORTED_OUTCOME', reportedOrder: 2, timeUncertainty: 'approximate' }));
    await writeNheiEvidence(db, 'userA', validRecord({ id: 'b2', sourceType: 'USER_REPORTED_BEHAVIOUR', reportedOrder: 3, timeUncertainty: 'approximate' }));
    await writeNheiEvidence(db, 'userA', validRecord({ id: 'o2', sourceType: 'USER_REPORTED_OUTCOME', reportedOrder: 4, timeUncertainty: 'approximate' }));

    const summary = await buildNheiPersonalContextSummary(db, 'userA');
    expect(summary!.behaviouralPatterns.length).toBeGreaterThan(0);
    for (const pattern of summary!.behaviouralPatterns) {
      expect(pattern.causalClaim).toBe(false);
      expect(['low', 'medium', 'high', 'unknown']).toContain(pattern.interpretationConfidence);
    }
  });
});
