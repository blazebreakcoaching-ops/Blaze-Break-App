import { describe, it, expect } from 'vitest';
import {
  writeNheiEvidence,
  readNheiEvidence,
  disputeNheiEvidence,
  confirmNheiEvidence,
  deleteNheiEvidenceRecord,
  deleteAllNheiData,
  writeNheiAssertedInfluence,
  readNheiTemporalView,
  getNheiConsent,
  setNheiConsent,
  withdrawNheiConsent,
  type FirestoreLike,
  type FirestoreCollectionRefLike,
  type FirestoreDocSnapshotLike,
} from './nhei-persistence-service';
import { excludeDisputedInterpretations } from './nhei-types';

// Minimal in-memory fake satisfying FirestoreLike - stores documents keyed
// by full path string ("collectionPath/docId"), distinguishing a direct
// child of a collection from a doc nested further down (e.g. a
// corrections subcollection) so collection.get() only returns immediate
// children, the same way a real Firestore collection listing would.
function createFakeFirestore(): FirestoreLike {
  const store = new Map<string, Record<string, unknown>>();

  function collection(path: string): FirestoreCollectionRefLike {
    return {
      doc(id?: string) {
        const docId = id ?? `auto_${Math.random().toString(36).slice(2, 10)}`;
        const key = `${path}/${docId}`;
        return {
          id: docId,
          async get(): Promise<FirestoreDocSnapshotLike> {
            const data = store.get(key);
            return { id: docId, exists: data !== undefined, data: () => data };
          },
          async set(data: Record<string, unknown>, options?: { merge?: boolean }) {
            if (options?.merge && store.has(key)) {
              store.set(key, { ...store.get(key), ...data });
            } else {
              store.set(key, { ...data });
            }
          },
          async update(data: Record<string, unknown>) {
            if (!store.has(key)) throw new Error('no such document');
            store.set(key, { ...store.get(key), ...data });
          },
          async delete() {
            store.delete(key);
          },
        };
      },
      async get() {
        const prefix = `${path}/`;
        const docs = [...store.entries()]
          .filter(([k]) => k.startsWith(prefix) && !k.slice(prefix.length).includes('/'))
          .map(([k, data]) => {
            const id = k.slice(prefix.length);
            return { id, exists: true, data: () => data } as FirestoreDocSnapshotLike;
          });
        return { docs };
      },
    };
  }

  return { collection };
}

function validRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: 'ev1',
    sourceType: 'USER_REPORTED_EVENT',
    timeUncertainty: 'unknown',
    evidenceQuality: 'medium',
    confirmationState: 'not_applicable',
    selfSystems: ['INTERNAL_SELF'],
    dimensions: ['EMOTIONAL'],
    relatedEventIds: [],
    ...overrides,
  };
}

describe('writeNheiEvidence / readNheiEvidence - default-off consent', () => {
  it('blocks the write when reflection_storage has never been granted', async () => {
    const db = createFakeFirestore();
    const result = await writeNheiEvidence(db, 'userA', validRecord());
    expect(result.ok).toBe(false);
    if (result.ok === false) expect(result.reason).toBe('consent_required');
    expect(await readNheiEvidence(db, 'userA')).toEqual([]);
  });

  it('succeeds once reflection_storage is explicitly granted, and the record round-trips', async () => {
    const db = createFakeFirestore();
    await setNheiConsent(db, 'userA', 'reflection_storage', true);
    const result = await writeNheiEvidence(db, 'userA', validRecord());
    expect(result.ok).toBe(true);
    const records = await readNheiEvidence(db, 'userA');
    expect(records).toHaveLength(1);
    expect(records[0].id).toBe('ev1');
    expect(records[0].sourceRef).toBeNull();
  });

  it('rejects a malformed record and writes nothing', async () => {
    const db = createFakeFirestore();
    await setNheiConsent(db, 'userA', 'reflection_storage', true);
    const result = await writeNheiEvidence(db, 'userA', { id: 'bad' });
    expect(result.ok).toBe(false);
    if (result.ok === false) expect(result.reason).toBe('invalid_record');
    expect(await readNheiEvidence(db, 'userA')).toEqual([]);
  });

  it('rejects a system-authored sourceType unless explicitly authorised', async () => {
    const db = createFakeFirestore();
    await setNheiConsent(db, 'userA', 'reflection_storage', true);
    const blocked = await writeNheiEvidence(db, 'userA', validRecord({ sourceType: 'SYSTEM_HYPOTHESIS', confirmationState: 'unconfirmed' }));
    expect(blocked.ok).toBe(false);
    if (blocked.ok === false) expect(blocked.reason).toBe('source_type_not_permitted');

    const allowed = await writeNheiEvidence(
      db, 'userA',
      validRecord({ sourceType: 'SYSTEM_HYPOTHESIS', confirmationState: 'unconfirmed' }),
      { allowSystemAuthoredSourceTypes: true },
    );
    expect(allowed.ok).toBe(true);
  });
});

describe('cross-user isolation', () => {
  it('writing for one uid never becomes visible under another uid - by construction, not by filtering', async () => {
    const db = createFakeFirestore();
    await setNheiConsent(db, 'userA', 'reflection_storage', true);
    await setNheiConsent(db, 'userB', 'reflection_storage', true);
    await writeNheiEvidence(db, 'userA', validRecord({ id: 'onlyA' }));

    expect(await readNheiEvidence(db, 'userA')).toHaveLength(1);
    expect(await readNheiEvidence(db, 'userB')).toEqual([]);
  });
});

describe('consent withdrawal vs. deletion', () => {
  it('withdrawing consent hides the data from reads without deleting it', async () => {
    const db = createFakeFirestore();
    await setNheiConsent(db, 'userA', 'reflection_storage', true);
    await writeNheiEvidence(db, 'userA', validRecord());
    expect(await readNheiEvidence(db, 'userA')).toHaveLength(1);

    await withdrawNheiConsent(db, 'userA', 'reflection_storage');
    expect(await readNheiEvidence(db, 'userA')).toEqual([]);

    // Re-granting proves the underlying record was never deleted - only
    // the read path was gated.
    await setNheiConsent(db, 'userA', 'reflection_storage', true);
    expect(await readNheiEvidence(db, 'userA')).toHaveLength(1);
  });
});

describe('dispute / confirm - correction history only when consented', () => {
  it('disputing without longitudinal_tracking consent updates state but writes no correction history', async () => {
    const db = createFakeFirestore();
    await setNheiConsent(db, 'userA', 'reflection_storage', true);
    await writeNheiEvidence(db, 'userA', validRecord());

    const result = await disputeNheiEvidence(db, 'userA', 'ev1');
    expect(result.ok).toBe(true);
    const [record] = await readNheiEvidence(db, 'userA');
    expect(record.confirmationState).toBe('user_disputed');

    const corrections = await db.collection('users/userA/nhei_evidence/ev1/corrections').get();
    expect(corrections.docs).toHaveLength(0);
  });

  it('disputing WITH longitudinal_tracking consent also writes a correction-history entry', async () => {
    const db = createFakeFirestore();
    await setNheiConsent(db, 'userA', 'reflection_storage', true);
    await setNheiConsent(db, 'userA', 'longitudinal_tracking', true);
    await writeNheiEvidence(db, 'userA', validRecord({ confirmationState: 'unconfirmed' }));

    await disputeNheiEvidence(db, 'userA', 'ev1');
    const corrections = await db.collection('users/userA/nhei_evidence/ev1/corrections').get();
    expect(corrections.docs).toHaveLength(1);
    const data = corrections.docs[0].data()!;
    expect(data.previousConfirmationState).toBe('unconfirmed');
    expect(data.newConfirmationState).toBe('user_disputed');
  });

  it('a disputed record is excluded by the shared confirmed-pattern filter, never silently re-presented as confirmed', async () => {
    const db = createFakeFirestore();
    await setNheiConsent(db, 'userA', 'reflection_storage', true);
    await writeNheiEvidence(db, 'userA', validRecord());
    await disputeNheiEvidence(db, 'userA', 'ev1');

    const records = await readNheiEvidence(db, 'userA');
    expect(excludeDisputedInterpretations(records)).toEqual([]);
  });

  it('confirmNheiEvidence can reverse a dispute, returning the previous state', async () => {
    const db = createFakeFirestore();
    await setNheiConsent(db, 'userA', 'reflection_storage', true);
    await writeNheiEvidence(db, 'userA', validRecord());
    await disputeNheiEvidence(db, 'userA', 'ev1');

    const result = await confirmNheiEvidence(db, 'userA', 'ev1');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.previousState).toBe('user_disputed');
    const [record] = await readNheiEvidence(db, 'userA');
    expect(record.confirmationState).toBe('user_confirmed');
  });

  it('returns not_found for a nonexistent evidence id', async () => {
    const db = createFakeFirestore();
    await setNheiConsent(db, 'userA', 'reflection_storage', true);
    const result = await disputeNheiEvidence(db, 'userA', 'does-not-exist');
    expect(result.ok).toBe(false);
    if (result.ok === false) expect(result.reason).toBe('not_found');
  });
});

describe('deletion - independent of consent state', () => {
  it('deleteNheiEvidenceRecord removes the record and its correction history', async () => {
    const db = createFakeFirestore();
    await setNheiConsent(db, 'userA', 'reflection_storage', true);
    await setNheiConsent(db, 'userA', 'longitudinal_tracking', true);
    await writeNheiEvidence(db, 'userA', validRecord({ confirmationState: 'unconfirmed' }));
    await disputeNheiEvidence(db, 'userA', 'ev1');

    await deleteNheiEvidenceRecord(db, 'userA', 'ev1');
    expect(await readNheiEvidence(db, 'userA')).toEqual([]);
    const corrections = await db.collection('users/userA/nhei_evidence/ev1/corrections').get();
    expect(corrections.docs).toHaveLength(0);
  });

  it('deleteAllNheiData clears evidence and persisted relations for that uid only', async () => {
    const db = createFakeFirestore();
    await setNheiConsent(db, 'userA', 'reflection_storage', true);
    await setNheiConsent(db, 'userA', 'longitudinal_tracking', true);
    await writeNheiEvidence(db, 'userA', validRecord({ id: 'a' }));
    await writeNheiEvidence(db, 'userA', validRecord({ id: 'b' }));
    await writeNheiAssertedInfluence(db, 'userA', { fromEventId: 'a', toEventId: 'b', relationType: 'USER_ATTRIBUTED_INFLUENCE', interpretationConfidence: 'medium' });

    await deleteAllNheiData(db, 'userA');
    expect(await readNheiEvidence(db, 'userA')).toEqual([]);
    const relations = await db.collection('users/userA/nhei_temporal_relations').get();
    expect(relations.docs).toHaveLength(0);
  });
});

describe('writeNheiAssertedInfluence - longitudinal_tracking gate', () => {
  it('blocks the assertion without longitudinal_tracking consent', async () => {
    const db = createFakeFirestore();
    await setNheiConsent(db, 'userA', 'reflection_storage', true);
    await writeNheiEvidence(db, 'userA', validRecord({ id: 'a' }));
    await writeNheiEvidence(db, 'userA', validRecord({ id: 'b' }));

    const result = await writeNheiAssertedInfluence(db, 'userA', {
      fromEventId: 'a', toEventId: 'b', relationType: 'USER_ATTRIBUTED_INFLUENCE', interpretationConfidence: 'high',
    });
    expect(result.ok).toBe(false);
    if (result.ok === false) expect(result.reason).toBe('consent_required');
  });

  it('persists a valid assertion once consented, and rejects one referencing an unknown event id', async () => {
    const db = createFakeFirestore();
    await setNheiConsent(db, 'userA', 'reflection_storage', true);
    await setNheiConsent(db, 'userA', 'longitudinal_tracking', true);
    await writeNheiEvidence(db, 'userA', validRecord({ id: 'a' }));
    await writeNheiEvidence(db, 'userA', validRecord({ id: 'b' }));

    const ok = await writeNheiAssertedInfluence(db, 'userA', {
      fromEventId: 'a', toEventId: 'b', relationType: 'USER_ATTRIBUTED_INFLUENCE', interpretationConfidence: 'high',
    });
    expect(ok.ok).toBe(true);

    const missing = await writeNheiAssertedInfluence(db, 'userA', {
      fromEventId: 'a', toEventId: 'does-not-exist', relationType: 'HYPOTHESISED_INFLUENCE', interpretationConfidence: 'low',
    });
    expect(missing.ok).toBe(false);
    if (missing.ok === false) expect(missing.reason).toBe('not_found');
  });
});

describe('readNheiTemporalView', () => {
  it('returns null (not an empty view) when reflection_storage is not consented', async () => {
    const db = createFakeFirestore();
    expect(await readNheiTemporalView(db, 'userA')).toBeNull();
  });

  it('includes computed relations over consented evidence even without longitudinal_tracking', async () => {
    const db = createFakeFirestore();
    await setNheiConsent(db, 'userA', 'reflection_storage', true);
    await writeNheiEvidence(db, 'userA', validRecord({ id: 'a', reportedOrder: 1 }));
    await writeNheiEvidence(db, 'userA', validRecord({ id: 'b', reportedOrder: 2 }));

    const view = await readNheiTemporalView(db, 'userA');
    expect(view).not.toBeNull();
    expect(view!.timeline.map((e) => e.record.id)).toEqual(['a', 'b']);
  });

  it('only includes a persisted asserted influence once longitudinal_tracking is also consented', async () => {
    const db = createFakeFirestore();
    await setNheiConsent(db, 'userA', 'reflection_storage', true);
    await setNheiConsent(db, 'userA', 'longitudinal_tracking', true);
    await writeNheiEvidence(db, 'userA', validRecord({ id: 'a' }));
    await writeNheiEvidence(db, 'userA', validRecord({ id: 'b' }));
    await writeNheiAssertedInfluence(db, 'userA', { fromEventId: 'a', toEventId: 'b', relationType: 'USER_ATTRIBUTED_INFLUENCE', interpretationConfidence: 'high' });

    const withTracking = await readNheiTemporalView(db, 'userA');
    expect(withTracking!.relations.some((r) => r.relationType === 'USER_ATTRIBUTED_INFLUENCE')).toBe(true);

    await withdrawNheiConsent(db, 'userA', 'longitudinal_tracking');
    const withoutTracking = await readNheiTemporalView(db, 'userA');
    expect(withoutTracking!.relations.some((r) => r.relationType === 'USER_ATTRIBUTED_INFLUENCE')).toBe(false);
  });
});

describe('no raw-text leakage through the persistence layer', () => {
  const SENSITIVE_RAW_TEXT = 'I feel like a failure because of what happened with my brother';

  it('a sneaky extra field attached to input is stripped before anything is persisted', async () => {
    const db = createFakeFirestore();
    await setNheiConsent(db, 'userA', 'reflection_storage', true);
    await writeNheiEvidence(db, 'userA', validRecord({ debugContent: SENSITIVE_RAW_TEXT }));

    const records = await readNheiEvidence(db, 'userA');
    expect(JSON.stringify(records)).not.toContain(SENSITIVE_RAW_TEXT);

    const view = await readNheiTemporalView(db, 'userA');
    expect(JSON.stringify(view)).not.toContain(SENSITIVE_RAW_TEXT);
  });
});

describe('getNheiConsent', () => {
  it('reflects exactly what setNheiConsent wrote, independently per purpose', async () => {
    const db = createFakeFirestore();
    await setNheiConsent(db, 'userA', 'reflection_storage', true);
    const state = await getNheiConsent(db, 'userA');
    expect(state.reflection_storage).toBe(true);
    expect(state.longitudinal_tracking).toBe(false);
    expect(state.routing_insights).toBe(false);
  });
});
