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
  exportAllNheiData,
  grantNheiSystemAuthority,
  isValidNheiSourceRef,
  buildNheiSourceRefPath,
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

  it('rejects a system-authored sourceType unless granted a real NheiSystemAuthorityToken', async () => {
    const db = createFakeFirestore();
    await setNheiConsent(db, 'userA', 'reflection_storage', true);
    const blocked = await writeNheiEvidence(db, 'userA', validRecord({ sourceType: 'SYSTEM_HYPOTHESIS', confirmationState: 'unconfirmed' }));
    expect(blocked.ok).toBe(false);
    if (blocked.ok === false) expect(blocked.reason).toBe('source_type_not_permitted');

    const allowed = await writeNheiEvidence(
      db, 'userA',
      validRecord({ sourceType: 'SYSTEM_HYPOTHESIS', confirmationState: 'unconfirmed' }),
      { systemAuthority: grantNheiSystemAuthority('test-suite') },
    );
    expect(allowed.ok).toBe(true);
  });

  it('a plain object imitating the token shape (as JSON from a request body would produce) is NOT a valid authority', async () => {
    const db = createFakeFirestore();
    await setNheiConsent(db, 'userA', 'reflection_storage', true);
    // This is exactly what `JSON.parse('{"allowSystemAuthoredSourceTypes":true}')`
    // or any other plain, request-body-shaped object would produce - no
    // amount of plain-data impersonation can satisfy the real check, since
    // the real token's brand is a module-private Symbol that cannot appear
    // in anything deserialized from JSON.
    const forgedToken = { allowSystemAuthoredSourceTypes: true, grantedBy: 'attacker' } as any;
    const result = await writeNheiEvidence(
      db, 'userA',
      validRecord({ sourceType: 'SYSTEM_HYPOTHESIS', confirmationState: 'unconfirmed' }),
      { systemAuthority: forgedToken },
    );
    expect(result.ok).toBe(false);
    if (result.ok === false) expect(result.reason).toBe('source_type_not_permitted');
  });

  it('grantNheiSystemAuthority requires a non-empty audit label', () => {
    expect(() => grantNheiSystemAuthority('')).toThrow();
  });

  it('rejects a record that arrives already confirmed or disputed at creation time - only dispute/confirm can set that', async () => {
    const db = createFakeFirestore();
    await setNheiConsent(db, 'userA', 'reflection_storage', true);
    const confirmedAtCreation = await writeNheiEvidence(db, 'userA', validRecord({ confirmationState: 'user_confirmed' }));
    expect(confirmedAtCreation.ok).toBe(false);
    if (confirmedAtCreation.ok === false) expect(confirmedAtCreation.reason).toBe('confirmation_state_not_settable_at_creation');

    const disputedAtCreation = await writeNheiEvidence(db, 'userA', validRecord({ confirmationState: 'user_disputed' }));
    expect(disputedAtCreation.ok).toBe(false);
    if (disputedAtCreation.ok === false) expect(disputedAtCreation.reason).toBe('confirmation_state_not_settable_at_creation');

    // Even with real system authority, the same creation-time rule applies -
    // there is exactly one path to a confirmed/disputed record (the
    // dedicated transition functions), never two.
    const withAuthority = await writeNheiEvidence(
      db, 'userA',
      validRecord({ sourceType: 'SYSTEM_HYPOTHESIS', confirmationState: 'user_confirmed' }),
      { systemAuthority: grantNheiSystemAuthority('test-suite') },
    );
    expect(withAuthority.ok).toBe(false);
    if (withAuthority.ok === false) expect(withAuthority.reason).toBe('confirmation_state_not_settable_at_creation');
  });
});

describe('source provenance - sourceRef allowlist', () => {
  it('accepts a sourceRef whose collection is on the allowlist', async () => {
    const db = createFakeFirestore();
    await setNheiConsent(db, 'userA', 'reflection_storage', true);
    const result = await writeNheiEvidence(db, 'userA', validRecord(), { sourceRef: { collection: 'checkins', docId: 'c1' } });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.sourceRef).toEqual({ collection: 'checkins', docId: 'c1' });
  });

  it('rejects a sourceRef whose collection is not on the allowlist, writing nothing', async () => {
    const db = createFakeFirestore();
    await setNheiConsent(db, 'userA', 'reflection_storage', true);
    const result = await writeNheiEvidence(db, 'userA', validRecord(), { sourceRef: { collection: 'users', docId: 'userB' } as any });
    expect(result.ok).toBe(false);
    if (result.ok === false) expect(result.reason).toBe('invalid_source_ref');
    expect(await readNheiEvidence(db, 'userA')).toEqual([]);
  });

  it('rejects a docId containing a slash, which would otherwise look like a multi-segment path', async () => {
    const db = createFakeFirestore();
    await setNheiConsent(db, 'userA', 'reflection_storage', true);
    const result = await writeNheiEvidence(db, 'userA', validRecord(), { sourceRef: { collection: 'checkins', docId: '../other_uid/secret' } });
    expect(result.ok).toBe(false);
    if (result.ok === false) expect(result.reason).toBe('invalid_source_ref');
  });

  it('isValidNheiSourceRef rejects a non-object and an unknown collection', () => {
    expect(isValidNheiSourceRef(null)).toBe(false);
    expect(isValidNheiSourceRef('checkins')).toBe(false);
    expect(isValidNheiSourceRef({ collection: 'users', docId: 'x' })).toBe(false);
    expect(isValidNheiSourceRef({ collection: 'checkins', docId: 'x' })).toBe(true);
  });

  it('buildNheiSourceRefPath always scopes the implied path under the SAME uid the evidence belongs to', () => {
    // The uid comes from the function's own argument, never from the
    // sourceRef data itself - there is no field on NheiSourceRef capable
    // of naming a different user's uid, so this can never resolve to a
    // path outside the caller-supplied uid's own subtree.
    const path = buildNheiSourceRefPath('userA', { collection: 'checkins', docId: 'c1' });
    expect(path).toBe('users/userA/checkins/c1');
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

  it('deleting one of two events referenced by a persisted influence relation cascades - no orphaned relation remains', async () => {
    const db = createFakeFirestore();
    await setNheiConsent(db, 'userA', 'reflection_storage', true);
    await setNheiConsent(db, 'userA', 'longitudinal_tracking', true);
    await writeNheiEvidence(db, 'userA', validRecord({ id: 'a' }));
    await writeNheiEvidence(db, 'userA', validRecord({ id: 'b' }));
    await writeNheiEvidence(db, 'userA', validRecord({ id: 'c' }));
    await writeNheiAssertedInfluence(db, 'userA', { fromEventId: 'a', toEventId: 'b', relationType: 'USER_ATTRIBUTED_INFLUENCE', interpretationConfidence: 'medium' });
    // An unrelated relation between b and c must survive deleting 'a'.
    await writeNheiAssertedInfluence(db, 'userA', { fromEventId: 'b', toEventId: 'c', relationType: 'HYPOTHESISED_INFLUENCE', interpretationConfidence: 'low' });

    await deleteNheiEvidenceRecord(db, 'userA', 'a');

    const relationsSnap = await db.collection('users/userA/nhei_temporal_relations').get();
    const remaining = relationsSnap.docs.map((d) => d.data());
    expect(remaining.some((r: any) => r.fromEventId === 'a' || r.toEventId === 'a')).toBe(false);
    expect(remaining.some((r: any) => r.fromEventId === 'b' && r.toEventId === 'c')).toBe(true);
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

describe('exportAllNheiData - GDPR export completeness', () => {
  it('includes nested correction-history records per evidence item, not just the evidence itself', async () => {
    const db = createFakeFirestore();
    await setNheiConsent(db, 'userA', 'reflection_storage', true);
    await setNheiConsent(db, 'userA', 'longitudinal_tracking', true);
    await writeNheiEvidence(db, 'userA', validRecord({ confirmationState: 'unconfirmed' }));
    await disputeNheiEvidence(db, 'userA', 'ev1');
    await confirmNheiEvidence(db, 'userA', 'ev1');

    const bundle = await exportAllNheiData(db, 'userA');
    expect(bundle.evidence).toHaveLength(1);
    expect(bundle.evidence[0].evidence.id).toBe('ev1');
    // Two transitions (unconfirmed->disputed, disputed->confirmed) means
    // two correction-history entries - this is exactly the data a naive
    // `listCollections()`-based export would miss, since it is nested
    // under the evidence document, not the user document.
    expect(bundle.evidence[0].corrections).toHaveLength(2);
  });

  it('includes persisted temporal relations', async () => {
    const db = createFakeFirestore();
    await setNheiConsent(db, 'userA', 'reflection_storage', true);
    await setNheiConsent(db, 'userA', 'longitudinal_tracking', true);
    await writeNheiEvidence(db, 'userA', validRecord({ id: 'a' }));
    await writeNheiEvidence(db, 'userA', validRecord({ id: 'b' }));
    await writeNheiAssertedInfluence(db, 'userA', { fromEventId: 'a', toEventId: 'b', relationType: 'USER_ATTRIBUTED_INFLUENCE', interpretationConfidence: 'high' });

    const bundle = await exportAllNheiData(db, 'userA');
    expect(bundle.temporalRelations).toHaveLength(1);
  });

  it('is NOT gated by consent - a GDPR export right survives consent withdrawal', async () => {
    const db = createFakeFirestore();
    await setNheiConsent(db, 'userA', 'reflection_storage', true);
    await writeNheiEvidence(db, 'userA', validRecord());
    await withdrawNheiConsent(db, 'userA', 'reflection_storage');

    // The ordinary read path is now hidden (see "consent withdrawal vs.
    // deletion" above) but the export path must still return the data -
    // withdrawing consent stops new processing, it does not forfeit the
    // Article 15/20 right to what was already collected.
    expect(await readNheiEvidence(db, 'userA')).toEqual([]);
    const bundle = await exportAllNheiData(db, 'userA');
    expect(bundle.evidence).toHaveLength(1);
  });

  it('handles a uid with no NHEI data at all', async () => {
    const db = createFakeFirestore();
    const bundle = await exportAllNheiData(db, 'userA');
    expect(bundle).toEqual({ evidence: [], temporalRelations: [] });
  });
});

describe('Phase 3C-2A section 9 - closing the consent/write race condition', () => {
  // Wraps a fake FirestoreLike so that the FIRST write to one specific
  // collection path triggers a caller-supplied side effect immediately
  // after it commits - this is how these tests deterministically
  // reproduce "a withdrawal request's write lands in the exact window
  // between this function's write and its own re-check," without needing
  // real concurrency or timing.
  function withWriteSideEffect(db: FirestoreLike, triggerPath: string, sideEffect: () => Promise<void>): FirestoreLike {
    let fired = false;
    return {
      collection(path: string) {
        const real = db.collection(path);
        return {
          ...real,
          doc(id?: string) {
            const realDoc = real.doc(id);
            return {
              ...realDoc,
              set: async (data: Record<string, unknown>, options?: { merge?: boolean }) => {
                const result = await realDoc.set(data, options);
                if (path === triggerPath && !fired) {
                  fired = true;
                  await sideEffect();
                }
                return result;
              },
            };
          },
        };
      },
    };
  }

  it('reproduces the race: a withdrawal landing between the evidence write and the post-write check rolls the write back, not merely hides it', async () => {
    const db = createFakeFirestore();
    await setNheiConsent(db, 'userA', 'reflection_storage', true);

    const racingDb = withWriteSideEffect(db, 'users/userA/nhei_evidence', async () => {
      await setNheiConsent(db, 'userA', 'reflection_storage', false);
    });

    const result = await writeNheiEvidence(racingDb, 'userA', validRecord());
    expect(result.ok).toBe(false);
    if (result.ok === false) expect(result.reason).toBe('consent_required');

    // Not merely excluded from a consent-gated read - actually gone from
    // the store. readNheiEvidence would return [] anyway (consent is now
    // false), so this reads the raw store directly to prove deletion,
    // not just read-side filtering.
    const rawDoc = await db.collection('users/userA/nhei_evidence').doc('ev1').get();
    expect(rawDoc.exists).toBe(false);
  });

  it('a write with no concurrent withdrawal still succeeds normally - the fix adds no false rejections', async () => {
    const db = createFakeFirestore();
    await setNheiConsent(db, 'userA', 'reflection_storage', true);
    const result = await writeNheiEvidence(db, 'userA', validRecord());
    expect(result.ok).toBe(true);
    const stored = await db.collection('users/userA/nhei_evidence').doc('ev1').get();
    expect(stored.exists).toBe(true);
  });

  it('reproduces the same race for a confirmation-state change: a withdrawal lands between the update and the re-check, and is reverted to its previous state', async () => {
    const db = createFakeFirestore();
    await setNheiConsent(db, 'userA', 'reflection_storage', true);
    await writeNheiEvidence(db, 'userA', validRecord());

    // withWriteSideEffect's trigger fires on .set(), but confirmNheiEvidence
    // uses .update() internally for the actual state change - a second,
    // update-aware wrapper races the withdrawal in at that point instead:
    // write succeeds (already happened above) -> update (confirm) ->
    // withdrawal lands -> post-check reverts.
    const updateRacingDb: FirestoreLike = {
      collection(path: string) {
        const real = db.collection(path);
        return {
          ...real,
          doc(id?: string) {
            const realDoc = real.doc(id);
            let fired = false;
            return {
              ...realDoc,
              update: async (data: Record<string, unknown>) => {
                const result = await realDoc.update(data);
                if (path === 'users/userA/nhei_evidence' && !fired) {
                  fired = true;
                  await setNheiConsent(db, 'userA', 'reflection_storage', false);
                }
                return result;
              },
            };
          },
        };
      },
    };

    const result = await confirmNheiEvidence(updateRacingDb, 'userA', 'ev1');
    expect(result.ok).toBe(false);
    if (result.ok === false) expect(result.reason).toBe('consent_required');

    // Reverted back to its pre-confirmation state ('not_applicable' per
    // validRecord()'s default), not left half-confirmed under revoked
    // consent.
    const rawDoc = await db.collection('users/userA/nhei_evidence').doc('ev1').get();
    expect(rawDoc.data()?.confirmationState).toBe('not_applicable');
  });

  it('reproduces the same race for an asserted-influence write: a withdrawal lands between the write and the re-check, and the relation is rolled back', async () => {
    const db = createFakeFirestore();
    await setNheiConsent(db, 'userA', 'reflection_storage', true);
    await setNheiConsent(db, 'userA', 'longitudinal_tracking', true);
    await writeNheiEvidence(db, 'userA', validRecord({ id: 'a' }));
    await writeNheiEvidence(db, 'userA', validRecord({ id: 'b' }));

    const racingDb = withWriteSideEffect(db, 'users/userA/nhei_temporal_relations', async () => {
      await setNheiConsent(db, 'userA', 'longitudinal_tracking', false);
    });

    const result = await writeNheiAssertedInfluence(racingDb, 'userA', {
      fromEventId: 'a', toEventId: 'b', relationType: 'USER_ATTRIBUTED_INFLUENCE', interpretationConfidence: 'medium',
    });
    expect(result.ok).toBe(false);
    if (result.ok === false) expect(result.reason).toBe('consent_required');

    const rawDoc = await db.collection('users/userA/nhei_temporal_relations').doc('a__b__USER_ATTRIBUTED_INFLUENCE').get();
    expect(rawDoc.exists).toBe(false);
  });

  it('distinguishes this race-closing rollback from withdrawNheiConsent itself - withdrawal alone still never deletes pre-existing, validly-written data', async () => {
    const db = createFakeFirestore();
    await setNheiConsent(db, 'userA', 'reflection_storage', true);
    const writeResult = await writeNheiEvidence(db, 'userA', validRecord());
    expect(writeResult.ok).toBe(true); // validly written, no race this time

    await withdrawNheiConsent(db, 'userA', 'reflection_storage');
    // The record itself is untouched by withdrawal alone.
    const rawDoc = await db.collection('users/userA/nhei_evidence').doc('ev1').get();
    expect(rawDoc.exists).toBe(true);
  });

  it('error handling: a post-write consent read failure fails closed (treated as not consented), never silently treated as success', async () => {
    const db = createFakeFirestore();
    await setNheiConsent(db, 'userA', 'reflection_storage', true);

    let readCount = 0;
    const throwingDb: FirestoreLike = {
      collection(path: string) {
        const real = db.collection(path);
        if (path === 'users/userA/nova_permissions') {
          return {
            ...real,
            doc(id?: string) {
              const realDoc = real.doc(id);
              return {
                ...realDoc,
                get: async () => {
                  readCount += 1;
                  // First read (pre-write check) succeeds normally;
                  // second read (the post-write race-closing check)
                  // throws, simulating a transient Firestore error at
                  // exactly the point this fix added a new read.
                  if (readCount >= 2) throw new Error('simulated transient read failure');
                  return realDoc.get();
                },
              };
            },
          };
        }
        return real;
      },
    };

    // getNheiConsent already fails closed on any error (see its own
    // try/catch) - so the post-write check reads back "not consented"
    // rather than throwing further, and the write is correctly rolled
    // back rather than the function crashing or (worse) returning
    // success despite being unable to verify consent held.
    const result = await writeNheiEvidence(throwingDb, 'userA', validRecord());
    expect(result.ok).toBe(false);
    if (result.ok === false) expect(result.reason).toBe('consent_required');
    const rawDoc = await db.collection('users/userA/nhei_evidence').doc('ev1').get();
    expect(rawDoc.exists).toBe(false);
  });
});
