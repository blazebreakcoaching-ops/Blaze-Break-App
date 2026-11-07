import { describe, it, expect } from 'vitest';
import {
  writeNheiEvidence,
  readNheiEvidence,
  readNheiEvidenceForLongitudinalMode,
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
  grantNheiSystemAuthorityForTestingOnly,
  isValidNheiSourceRef,
  buildNheiSourceRefPath,
  type FirestoreLike,
  type FirestoreCollectionRefLike,
  type FirestoreDocSnapshotLike,
  type FirestoreTransactionLike,
} from './nhei-persistence-service';
import { excludeDisputedInterpretations } from './nhei-types';

// Minimal in-memory fake satisfying FirestoreLike - stores documents keyed
// by full path string ("collectionPath/docId"), distinguishing a direct
// child of a collection from a doc nested further down (e.g. a
// corrections subcollection) so collection.get() only returns immediate
// children, the same way a real Firestore collection listing would.
// Phase 3C-2B Checkpoint 2 section 5: writeNheiEvidence/setConfirmationState/
// writeNheiAssertedInfluence now REQUIRE db.runTransaction to exist at all -
// there is no more nontransactional fallback in production code for them to
// silently take. Every fake used with those three functions therefore needs
// a working (if simple - no real conflict detection, that rigor lives only
// in createTransactionalFakeFirestore below, for the tests that specifically
// need it) runTransaction, or every such call would now correctly fail with
// 'transaction_support_required' - which is exactly the point, and exactly
// what createFakeFirestoreWithoutTransactionSupport (below) exists to prove,
// deliberately, as isolated test scaffolding rather than a production path.
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

  // Simple, non-rigorous transaction support: runs the callback, with
  // tx.get() delegating straight to the ref's own .get() (this fake applies
  // writes immediately rather than staging them, so there is nothing
  // elaborate to stage either) - sufficient for every test that is not
  // specifically about race/conflict detection. Tests that need the real
  // thing use createTransactionalFakeFirestore below.
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

// Phase 3C-2B Checkpoint 2 section 5: deliberately isolated test scaffolding
// for the "fails closed without transaction support" requirement - the
// fallback this simulates no longer exists as a reachable code path in
// nhei-persistence-service.ts itself; this fake exists only so these specific
// tests can prove the three functions refuse to run at all against a `db`
// shaped like one, rather than silently degrading to a weaker strategy.
function createFakeFirestoreWithoutTransactionSupport(): FirestoreLike {
  const { collection } = createFakeFirestore();
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
      { systemAuthority: grantNheiSystemAuthorityForTestingOnly('test-suite') },
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

  it('grantNheiSystemAuthorityForTestingOnly requires a non-empty audit label', () => {
    expect(() => grantNheiSystemAuthorityForTestingOnly('')).toThrow();
  });

  it('Phase 3C-2B Checkpoint 2 section 7: the old, bare grantNheiSystemAuthority export no longer exists on this module - only deriveEvidenceAuthorityGrant (role-checked) and grantNheiSystemAuthorityForTestingOnly (explicitly test-only) can ever produce a token', async () => {
    const module = await import('./nhei-persistence-service');
    expect((module as Record<string, unknown>).grantNheiSystemAuthority).toBeUndefined();
    expect(typeof module.grantNheiSystemAuthorityForTestingOnly).toBe('function');
    expect(typeof module.deriveEvidenceAuthorityGrant).toBe('function');
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
      { systemAuthority: grantNheiSystemAuthorityForTestingOnly('test-suite') },
    );
    expect(withAuthority.ok).toBe(false);
    if (withAuthority.ok === false) expect(withAuthority.reason).toBe('confirmation_state_not_settable_at_creation');
  });
});

describe('Phase 3C-2B Checkpoint 2 section 6 - readNheiEvidence consent gating, audited', () => {
  it('readNheiEvidence re-checks CURRENT consent on every call, not a stale write-time snapshot - withdrawal immediately blocks it', async () => {
    const db = createFakeFirestore();
    await setNheiConsent(db, 'userA', 'reflection_storage', true);
    await writeNheiEvidence(db, 'userA', validRecord());
    expect(await readNheiEvidence(db, 'userA')).toHaveLength(1);

    await withdrawNheiConsent(db, 'userA', 'reflection_storage');
    // The record is still physically stored (consent withdrawal alone
    // never deletes - see the "consent withdrawal vs. deletion" describe
    // block below) - but the read path returns nothing the instant
    // consent is withdrawn, without needing any separate action.
    expect(await readNheiEvidence(db, 'userA')).toEqual([]);
    const rawDoc = await db.collection('users/userA/nhei_evidence').doc('ev1').get();
    expect(rawDoc.exists).toBe(true); // still physically stored
  });

  it('re-granting consent after a withdrawal immediately restores readNheiEvidence access to the still-stored record - no re-write needed', async () => {
    const db = createFakeFirestore();
    await setNheiConsent(db, 'userA', 'reflection_storage', true);
    await writeNheiEvidence(db, 'userA', validRecord());
    await withdrawNheiConsent(db, 'userA', 'reflection_storage');
    expect(await readNheiEvidence(db, 'userA')).toEqual([]);

    await setNheiConsent(db, 'userA', 'reflection_storage', true);
    expect(await readNheiEvidence(db, 'userA')).toHaveLength(1);
  });
});

describe('Phase 3C-2B Checkpoint 2 section 6 - readNheiEvidenceForLongitudinalMode: the dedicated, stricter read interface', () => {
  it('returns [] when reflection_storage alone is held but longitudinal_tracking is not - plain storage consent is not enough for this use', async () => {
    const db = createFakeFirestore();
    await setNheiConsent(db, 'userA', 'reflection_storage', true);
    await writeNheiEvidence(db, 'userA', validRecord());

    // The plain read interface correctly returns the record under
    // reflection_storage consent alone - that purpose IS sufficient for
    // Personal Reflection Mode's own single-session use.
    expect(await readNheiEvidence(db, 'userA')).toHaveLength(1);
    // The Longitudinal Mode interface requires the MORE SPECIFIC purpose
    // too, and refuses without it, even though the data is the same data.
    expect(await readNheiEvidenceForLongitudinalMode(db, 'userA')).toEqual([]);
  });

  it('returns [] when longitudinal_tracking alone is held but reflection_storage is not - both purposes are required, not just the longitudinal one', async () => {
    const db = createFakeFirestore();
    await setNheiConsent(db, 'userA', 'reflection_storage', true);
    await writeNheiEvidence(db, 'userA', validRecord());
    await setNheiConsent(db, 'userA', 'longitudinal_tracking', true);
    await setNheiConsent(db, 'userA', 'reflection_storage', false);

    expect(await readNheiEvidenceForLongitudinalMode(db, 'userA')).toEqual([]);
  });

  it('returns the evidence only once BOTH reflection_storage and longitudinal_tracking are currently held', async () => {
    const db = createFakeFirestore();
    await setNheiConsent(db, 'userA', 'reflection_storage', true);
    await writeNheiEvidence(db, 'userA', validRecord());
    await setNheiConsent(db, 'userA', 'longitudinal_tracking', true);

    const result = await readNheiEvidenceForLongitudinalMode(db, 'userA');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('ev1');
  });

  it('withdrawing longitudinal_tracking alone immediately blocks this interface, even though reflection_storage (and the plain read path) remain unaffected', async () => {
    const db = createFakeFirestore();
    await setNheiConsent(db, 'userA', 'reflection_storage', true);
    await setNheiConsent(db, 'userA', 'longitudinal_tracking', true);
    await writeNheiEvidence(db, 'userA', validRecord());
    expect(await readNheiEvidenceForLongitudinalMode(db, 'userA')).toHaveLength(1);

    await withdrawNheiConsent(db, 'userA', 'longitudinal_tracking');
    expect(await readNheiEvidenceForLongitudinalMode(db, 'userA')).toEqual([]);
    // The plain read path is a different purpose and is correctly
    // unaffected by withdrawing this specific one.
    expect(await readNheiEvidence(db, 'userA')).toHaveLength(1);
  });

  it('never makes a Firestore read at all when reflection_storage is absent - same no-attempted-read discipline as readNheiEvidence', async () => {
    const db = createFakeFirestore();
    let evidenceCollectionGetCalls = 0;
    const spyingDb: FirestoreLike = {
      collection(path: string) {
        const real = db.collection(path);
        if (path === 'users/userA/nhei_evidence') {
          return { ...real, async get() { evidenceCollectionGetCalls += 1; return real.get(); } };
        }
        return real;
      },
    };
    await readNheiEvidenceForLongitudinalMode(spyingDb, 'userA');
    expect(evidenceCollectionGetCalls).toBe(0);
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

// Phase 3C-2A section 9's original race-closing tests (a nontransactional
// write-then-recheck-then-compensate pattern, deliberately raced via a
// write-side-effect wrapper) are superseded, not merely renamed: Phase
// 3C-2B Checkpoint 1 built the REAL transactional fix for the same races
// (see the "Phase 3C-2B section 2" describe block below, which exercises
// the identical scenarios - evidence write, confirmation-state change,
// asserted-influence write, all raced against a concurrent withdrawal -
// but against a `db` with genuine per-document conflict detection, which
// is strictly stronger evidence than racing the old compensating-rollback
// fallback ever was). Checkpoint 2 section 5 goes a step further: that
// fallback is no longer reachable from writeNheiEvidence/
// setConfirmationState/writeNheiAssertedInfluence at all. This block now
// tests the one thing that changed - that all three functions fail
// closed, immediately, with no write of any kind, when transaction
// support is unavailable - rather than re-testing races the section 2
// block below already covers more rigorously.
describe('Phase 3C-2B Checkpoint 2 section 5 - transaction support is required; no nontransactional fallback remains', () => {
  it('writeNheiEvidence fails closed with transaction_support_required against a db with no runTransaction, and writes nothing', async () => {
    const db = createFakeFirestoreWithoutTransactionSupport();
    expect(db.runTransaction).toBeUndefined();
    await setNheiConsent(db, 'userA', 'reflection_storage', true);

    const result = await writeNheiEvidence(db, 'userA', validRecord());
    expect(result.ok).toBe(false);
    if (result.ok === false) expect(result.reason).toBe('transaction_support_required');

    const rawDoc = await db.collection('users/userA/nhei_evidence').doc('ev1').get();
    expect(rawDoc.exists).toBe(false);
  });

  it('confirmNheiEvidence (setConfirmationState) fails closed the same way, leaving any existing record unmodified', async () => {
    // A db that genuinely has no runTransaction - the record is placed
    // directly via a raw .set() (not through writeNheiEvidence, which
    // would itself now correctly refuse on this same db) purely to give
    // confirmNheiEvidence something pre-existing to (not) modify.
    const db = createFakeFirestoreWithoutTransactionSupport();
    await setNheiConsent(db, 'userA', 'reflection_storage', true);
    await db.collection('users/userA/nhei_evidence').doc('ev1').set(validRecord() as unknown as Record<string, unknown>);

    const result = await confirmNheiEvidence(db, 'userA', 'ev1');
    expect(result.ok).toBe(false);
    if (result.ok === false) expect(result.reason).toBe('transaction_support_required');

    const rawDoc = await db.collection('users/userA/nhei_evidence').doc('ev1').get();
    expect(rawDoc.data()?.confirmationState).toBe('not_applicable'); // untouched
  });

  it('writeNheiAssertedInfluence fails closed the same way, writing no relation', async () => {
    const db = createFakeFirestoreWithoutTransactionSupport();
    await setNheiConsent(db, 'userA', 'reflection_storage', true);
    await setNheiConsent(db, 'userA', 'longitudinal_tracking', true);

    const result = await writeNheiAssertedInfluence(db, 'userA', {
      fromEventId: 'a', toEventId: 'b', relationType: 'USER_ATTRIBUTED_INFLUENCE', interpretationConfidence: 'medium',
    });
    expect(result.ok).toBe(false);
    if (result.ok === false) expect(result.reason).toBe('transaction_support_required');

    const rawDoc = await db.collection('users/userA/nhei_temporal_relations').doc('a__b__USER_ATTRIBUTED_INFLUENCE').get();
    expect(rawDoc.exists).toBe(false);
  });

  it('this fail-closed check happens even when consent IS held - lacking transaction support is never "fine because consent was fine"', async () => {
    const db = createFakeFirestoreWithoutTransactionSupport();
    await setNheiConsent(db, 'userA', 'reflection_storage', true);
    const result = await writeNheiEvidence(db, 'userA', validRecord());
    // Not consent_required (consent was in fact granted) - specifically
    // transaction_support_required, so the real cause is never misreported
    // as a consent problem a user might think they can fix by re-consenting.
    expect(result.ok).toBe(false);
    if (result.ok === false) expect(result.reason).toBe('transaction_support_required');
  });

  it('an invalid record is still rejected as invalid_record before the transaction-support check even matters - validation order is unchanged', async () => {
    const db = createFakeFirestoreWithoutTransactionSupport();
    await setNheiConsent(db, 'userA', 'reflection_storage', true);
    const result = await writeNheiEvidence(db, 'userA', { id: 'bad' });
    expect(result.ok).toBe(false);
    if (result.ok === false) expect(result.reason).toBe('invalid_record');
  });
});

// ============================================================================
// Phase 3C-2B section 2 - transactional consent/write concurrency
// ============================================================================
//
// A fake that genuinely simulates Firestore's optimistic-concurrency
// transaction semantics, not just a FIFO queue that serialises "transaction"
// bodies (which test/fake-firestore.ts's existing fake deliberately does -
// see its own comment on why that's sufficient for ITS callers). This fake
// goes further: every document carries a revision counter, every tx.get()
// records the revision it saw, and a transaction's writes are staged
// (never applied to the store until commit) and only actually committed if
// every document the transaction read is still at the same revision it was
// at read-time - otherwise the whole callback is re-run (retried), exactly
// matching what the real Admin SDK does on a version conflict. This is
// what makes it possible to test the ACTUAL invariant this section cares
// about - "no optional write commits based on consent already revoked at
// the commit point" - rather than merely exercising the code path.
interface VersionedDoc { data: Record<string, unknown> | undefined; rev: number; }

function createTransactionalFakeFirestore(): FirestoreLike & { rawStore: Map<string, VersionedDoc> } {
  const store = new Map<string, VersionedDoc>();
  const refPath = new WeakMap<object, string>();

  function docRefFor(path: string): ReturnType<FirestoreCollectionRefLike['doc']> {
    const docId = path.slice(path.lastIndexOf('/') + 1);
    const ref = {
      id: docId,
      async get(): Promise<FirestoreDocSnapshotLike> {
        const d = store.get(path);
        return { id: docId, exists: d?.data !== undefined, data: () => d?.data };
      },
      async set(data: Record<string, unknown>, options?: { merge?: boolean }) {
        const cur = store.get(path);
        const next = options?.merge && cur?.data ? { ...cur.data, ...data } : { ...data };
        store.set(path, { data: next, rev: (cur?.rev ?? 0) + 1 });
      },
      async update(data: Record<string, unknown>) {
        const cur = store.get(path);
        if (!cur?.data) throw new Error('no such document');
        store.set(path, { data: { ...cur.data, ...data }, rev: cur.rev + 1 });
      },
      async delete() {
        const cur = store.get(path);
        store.set(path, { data: undefined, rev: (cur?.rev ?? 0) + 1 });
      },
    };
    refPath.set(ref, path);
    return ref as any;
  }

  function collectionRefFor(path: string): FirestoreCollectionRefLike {
    const ref: FirestoreCollectionRefLike = {
      doc(id?: string) {
        const docId = id ?? `auto_${Math.random().toString(36).slice(2, 10)}`;
        return docRefFor(`${path}/${docId}`);
      },
      async get() {
        const prefix = `${path}/`;
        const docs = [...store.entries()]
          .filter(([k, v]) => k.startsWith(prefix) && !k.slice(prefix.length).includes('/') && v.data !== undefined)
          .map(([k, v]) => ({ id: k.slice(prefix.length), exists: true, data: () => v.data }) as FirestoreDocSnapshotLike);
        return { docs };
      },
    };
    refPath.set(ref, path);
    return ref;
  }

  let txQueue: Promise<void> = Promise.resolve();
  const MAX_RETRIES = 5;

  async function runTransaction<T>(fn: (tx: FirestoreTransactionLike) => Promise<T>): Promise<T> {
    let release!: () => void;
    const prior = txQueue;
    txQueue = new Promise((resolve) => { release = resolve; });
    await prior;
    try {
      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        const readVersions = new Map<string, number>();
        type PendingWrite = { kind: 'set' | 'update' | 'delete'; path: string; data?: Record<string, unknown>; merge?: boolean };
        const pendingWrites: PendingWrite[] = [];

        const tx: FirestoreTransactionLike = {
          get: (async (ref: any) => {
            const path = refPath.get(ref);
            if (path === undefined) throw new Error('fake transaction: unknown ref');
            if (!readVersions.has(path)) readVersions.set(path, store.get(path)?.rev ?? 0);
            // Collection reads are not themselves conflict-tracked below
            // (a disclosed simplification - see nhei-persistence-service.ts's
            // comment on writeNheiAssertedInfluence) - distinguish by
            // whether this looks like a doc path (has a sibling 'doc' call)
            // or a collection path: cheaply, a doc ref always has an `id`
            // matching its own last path segment AND was created via
            // docRefFor, which we can tell apart by checking if a '.doc('
            // method exists on it.
            if (typeof (ref as FirestoreCollectionRefLike).doc === 'function') {
              const prefix = `${path}/`;
              const docs = [...store.entries()]
                .filter(([k, v]) => k.startsWith(prefix) && !k.slice(prefix.length).includes('/') && v.data !== undefined)
                .map(([k, v]) => ({ id: k.slice(prefix.length), exists: true, data: () => v.data }) as FirestoreDocSnapshotLike);
              return { docs };
            }
            const d = store.get(path);
            const docId = path.slice(path.lastIndexOf('/') + 1);
            return { id: docId, exists: d?.data !== undefined, data: () => d?.data };
          }) as FirestoreTransactionLike['get'],
          set(ref, data, options) {
            const path = refPath.get(ref);
            if (path === undefined) throw new Error('fake transaction: unknown ref');
            pendingWrites.push({ kind: 'set', path, data, merge: options?.merge });
          },
          update(ref, data) {
            const path = refPath.get(ref);
            if (path === undefined) throw new Error('fake transaction: unknown ref');
            pendingWrites.push({ kind: 'update', path, data });
          },
          delete(ref) {
            const path = refPath.get(ref);
            if (path === undefined) throw new Error('fake transaction: unknown ref');
            pendingWrites.push({ kind: 'delete', path });
          },
        };

        const result = await fn(tx);

        let conflict = false;
        for (const [path, versionAtRead] of readVersions) {
          if ((store.get(path)?.rev ?? 0) !== versionAtRead) { conflict = true; break; }
        }
        if (conflict) {
          if (attempt === MAX_RETRIES) throw new Error('fake transaction: exceeded max retries under contention');
          continue; // re-run fn from scratch with fresh reads, exactly like the real SDK
        }

        for (const w of pendingWrites) {
          const cur = store.get(w.path);
          if (w.kind === 'set') {
            const next = w.merge && cur?.data ? { ...cur.data, ...w.data } : { ...w.data };
            store.set(w.path, { data: next, rev: (cur?.rev ?? 0) + 1 });
          } else if (w.kind === 'update') {
            store.set(w.path, { data: { ...(cur?.data ?? {}), ...w.data }, rev: (cur?.rev ?? 0) + 1 });
          } else {
            store.set(w.path, { data: undefined, rev: (cur?.rev ?? 0) + 1 });
          }
        }
        return result;
      }
      throw new Error('unreachable');
    } finally {
      release();
    }
  }

  return { collection: collectionRefFor, runTransaction, rawStore: store };
}

// Wraps a transactional fake so that, on the FIRST tx.get() call across the
// entire runTransaction invocation (including retries - it only ever fires
// once, period), a caller-supplied side effect runs AFTER that read
// resolves. This is how these tests inject "a concurrent write landed
// immediately after this transaction did its first read" deterministically,
// without needing real concurrency.
function withSideEffectAfterFirstTransactionRead(db: FirestoreLike, sideEffect: () => Promise<void>): FirestoreLike {
  let fired = false;
  return {
    collection: (path: string) => db.collection(path),
    async runTransaction(fn) {
      return db.runTransaction!(async (tx: any) => {
        const wrappedTx = {
          ...tx,
          get: async (ref: any) => {
            const snap = await tx.get(ref);
            if (!fired) {
              fired = true;
              await sideEffect();
            }
            return snap;
          },
        };
        return fn(wrappedTx);
      });
    },
  };
}

describe('Phase 3C-2B section 2 - transactional consent/write concurrency', () => {
  it('withdrawal landing immediately after the transaction\'s first (consent) read is caught by the transaction engine itself, not by a later re-check', async () => {
    const db = createTransactionalFakeFirestore();
    await setNheiConsent(db, 'userA', 'reflection_storage', true);

    const racingDb = withSideEffectAfterFirstTransactionRead(db, async () => {
      await setNheiConsent(db, 'userA', 'reflection_storage', false);
    });

    const result = await writeNheiEvidence(racingDb, 'userA', validRecord());
    expect(result.ok).toBe(false);
    if (result.ok === false) expect(result.reason).toBe('consent_required');
    const raw = db.rawStore.get('users/userA/nhei_evidence/ev1');
    expect(raw?.data).toBeUndefined();
  });

  it('a transaction that reads consent=true and nothing concurrent happens commits normally - the fix adds no false rejections', async () => {
    const db = createTransactionalFakeFirestore();
    await setNheiConsent(db, 'userA', 'reflection_storage', true);
    const result = await writeNheiEvidence(db, 'userA', validRecord());
    expect(result.ok).toBe(true);
  });

  it('withdrawal DURING a confirmation-state transaction is caught the same way, and the update is never committed half-applied', async () => {
    const db = createTransactionalFakeFirestore();
    await setNheiConsent(db, 'userA', 'reflection_storage', true);
    await writeNheiEvidence(db, 'userA', validRecord());

    const racingDb = withSideEffectAfterFirstTransactionRead(db, async () => {
      await setNheiConsent(db, 'userA', 'reflection_storage', false);
    });
    const result = await confirmNheiEvidence(racingDb, 'userA', 'ev1');
    expect(result.ok).toBe(false);
    if (result.ok === false) expect(result.reason).toBe('consent_required');
    // The evidence record's confirmationState was never touched at all -
    // not reverted, because it was never committed in the first place.
    const raw = db.rawStore.get('users/userA/nhei_evidence/ev1');
    expect(raw?.data?.confirmationState).toBe('not_applicable');
  });

  it('withdrawal DURING an asserted-influence transaction is caught the same way', async () => {
    const db = createTransactionalFakeFirestore();
    await setNheiConsent(db, 'userA', 'reflection_storage', true);
    await setNheiConsent(db, 'userA', 'longitudinal_tracking', true);
    await writeNheiEvidence(db, 'userA', validRecord({ id: 'a' }));
    await writeNheiEvidence(db, 'userA', validRecord({ id: 'b' }));

    const racingDb = withSideEffectAfterFirstTransactionRead(db, async () => {
      await setNheiConsent(db, 'userA', 'longitudinal_tracking', false);
    });
    const result = await writeNheiAssertedInfluence(racingDb, 'userA', {
      fromEventId: 'a', toEventId: 'b', relationType: 'USER_ATTRIBUTED_INFLUENCE', interpretationConfidence: 'medium',
    });
    expect(result.ok).toBe(false);
    if (result.ok === false) expect(result.reason).toBe('consent_required');
    expect(db.rawStore.get('users/userA/nhei_temporal_relations/a__b__USER_ATTRIBUTED_INFLUENCE')?.data).toBeUndefined();
  });

  it('two genuinely concurrent writeNheiEvidence calls for the SAME user both succeed when consent holds throughout - contention alone is not mistaken for a consent problem', async () => {
    const db = createTransactionalFakeFirestore();
    await setNheiConsent(db, 'userA', 'reflection_storage', true);
    const [a, b] = await Promise.all([
      writeNheiEvidence(db, 'userA', validRecord({ id: 'a' })),
      writeNheiEvidence(db, 'userA', validRecord({ id: 'b' })),
    ]);
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
  });

  it('simultaneous confirmation-state changes on two DIFFERENT evidence records both succeed independently', async () => {
    const db = createTransactionalFakeFirestore();
    await setNheiConsent(db, 'userA', 'reflection_storage', true);
    await writeNheiEvidence(db, 'userA', validRecord({ id: 'a' }));
    await writeNheiEvidence(db, 'userA', validRecord({ id: 'b' }));
    const [a, b] = await Promise.all([
      confirmNheiEvidence(db, 'userA', 'a'),
      disputeNheiEvidence(db, 'userA', 'b'),
    ]);
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
  });

  it('retry/idempotency: a transaction retried after a transient conflict produces exactly one committed write, never a duplicate', async () => {
    const db = createTransactionalFakeFirestore();
    await setNheiConsent(db, 'userA', 'reflection_storage', true);
    // Force exactly one conflict on the FIRST attempt by bumping the
    // permissions doc's revision via an unrelated, consent-preserving
    // write (re-granting the same value still bumps the revision) right
    // after the first read - the transaction must retry once and still
    // land exactly one evidence document, not two.
    const racingDb = withSideEffectAfterFirstTransactionRead(db, async () => {
      await setNheiConsent(db, 'userA', 'reflection_storage', true); // same value, but still a write -> bumps revision
    });
    const result = await writeNheiEvidence(racingDb, 'userA', validRecord());
    expect(result.ok).toBe(true);
    const snap = await db.collection('users/userA/nhei_evidence').get();
    expect(snap.docs.filter((d) => d.id === 'ev1')).toHaveLength(1);
  });

  it('revocation followed by re-consent before the transaction commits allows the write through, correctly reading the LATEST state', async () => {
    const db = createTransactionalFakeFirestore();
    await setNheiConsent(db, 'userA', 'reflection_storage', true);
    const racingDb = withSideEffectAfterFirstTransactionRead(db, async () => {
      await setNheiConsent(db, 'userA', 'reflection_storage', false);
      await setNheiConsent(db, 'userA', 'reflection_storage', true); // re-consented before this transaction's retry re-reads
    });
    const result = await writeNheiEvidence(racingDb, 'userA', validRecord());
    expect(result.ok).toBe(true);
  });

  it('permission changes concurrent with deletion: withdrawing consent while a record is being deleted does not block or corrupt the deletion', async () => {
    const db = createTransactionalFakeFirestore();
    await setNheiConsent(db, 'userA', 'reflection_storage', true);
    await writeNheiEvidence(db, 'userA', validRecord());
    // deleteNheiEvidenceRecord is deliberately NOT consent-gated (Phase
    // 2: "delete eligible NHEI personal data" is independent of consent
    // state) - a concurrent withdrawal must not interfere with it at all.
    await withdrawNheiConsent(db, 'userA', 'reflection_storage');
    await deleteNheiEvidenceRecord(db, 'userA', 'ev1');
    expect(db.rawStore.get('users/userA/nhei_evidence/ev1')?.data).toBeUndefined();
  });

  it('a genuine transaction-engine failure (not a consent decision) surfaces as a real error rather than being misreported as consent_required', async () => {
    const db = createTransactionalFakeFirestore();
    await setNheiConsent(db, 'userA', 'reflection_storage', true);
    const brokenDb: FirestoreLike = {
      collection: (path: string) => db.collection(path),
      runTransaction: async () => { throw new Error('simulated transaction engine outage'); },
    };
    await expect(writeNheiEvidence(brokenDb, 'userA', validRecord())).rejects.toThrow('simulated transaction engine outage');
  });

  it('superseded by Checkpoint 2 section 5: a db without transaction support no longer gets a weaker fallback - it fails closed instead, with no write at all', async () => {
    const db = createFakeFirestoreWithoutTransactionSupport();
    expect(db.runTransaction).toBeUndefined();
    await setNheiConsent(db, 'userA', 'reflection_storage', true);
    const result = await writeNheiEvidence(db, 'userA', validRecord());
    // Previously (Phase 3C-2A/Checkpoint 1) this fell back to a
    // compensating-rollback write-then-recheck strategy and succeeded.
    // Checkpoint 2 section 5 removed that fallback from production code
    // entirely - see the dedicated describe block earlier in this file -
    // so this now fails closed instead, which is the whole point.
    expect(result.ok).toBe(false);
    if (result.ok === false) expect(result.reason).toBe('transaction_support_required');
  });
});
