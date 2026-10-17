// NHEI PHASE 3C-2A - SECTION 10: AUTHORITY CONTRACT TESTS
// Phase 3C-2B section 6 adds the "glued together, end to end" tests at
// the bottom of this file - see that describe block's own comment.

import { describe, it, expect } from 'vitest';
import {
  deriveKnowledgeReviewerIdentity,
  deriveEvidenceAuthorityGrant,
  NHEI_KNOWLEDGE_REVIEWER_ROLE,
  NHEI_EVIDENCE_AUTHORITY_ROLE,
} from './nhei-authority-contract';
import {
  writeNheiEvidence,
  setNheiConsent,
  type FirestoreLike,
  type FirestoreCollectionRefLike,
  type FirestoreDocSnapshotLike,
  type FirestoreTransactionLike,
} from './nhei-persistence-service';

describe('deriveKnowledgeReviewerIdentity', () => {
  it('derives the reviewerId from caller.uid when the correct role is present', () => {
    const result = deriveKnowledgeReviewerIdentity({ uid: 'reviewer_123', role: NHEI_KNOWLEDGE_REVIEWER_ROLE });
    expect(result.ok).toBe(true);
    expect(result.reviewerId).toBe('reviewer_123');
  });

  it('denies a caller without the specific reviewer role, even a general admin/platform_admin role', () => {
    const result = deriveKnowledgeReviewerIdentity({ uid: 'admin_1', role: 'platform_admin' });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('role_not_granted');
  });

  it('denies a caller with no role at all', () => {
    const result = deriveKnowledgeReviewerIdentity({ uid: 'u1' });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('role_not_granted');
  });

  it('denies a caller object with no uid, even if a role string happens to be present', () => {
    const result = deriveKnowledgeReviewerIdentity({ uid: '', role: NHEI_KNOWLEDGE_REVIEWER_ROLE });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('missing_uid');
  });

  it('the reviewerId is always exactly caller.uid - there is no other field this function could read it from', () => {
    const caller = { uid: 'exact_match_id', role: NHEI_KNOWLEDGE_REVIEWER_ROLE };
    const result = deriveKnowledgeReviewerIdentity(caller);
    expect(result.reviewerId).toBe(caller.uid);
  });
});

describe('deriveEvidenceAuthorityGrant', () => {
  it('mints a token only for a caller with the evidence-authority role', () => {
    const result = deriveEvidenceAuthorityGrant({ uid: 'authority_1', role: NHEI_EVIDENCE_AUTHORITY_ROLE });
    expect(result.ok).toBe(true);
    expect(result.token).toBeDefined();
    expect(result.token?.grantedBy).toContain('authority_1');
  });

  it('denies a caller with the reviewer role but not the evidence-authority role - the two are separate authorities', () => {
    const result = deriveEvidenceAuthorityGrant({ uid: 'reviewer_1', role: NHEI_KNOWLEDGE_REVIEWER_ROLE });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('role_not_granted');
    expect(result.token).toBeUndefined();
  });

  it('denies a caller with no uid', () => {
    const result = deriveEvidenceAuthorityGrant({ uid: '', role: NHEI_EVIDENCE_AUTHORITY_ROLE });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('missing_uid');
  });

  it('the grantedBy label on the minted token traces back to the verified caller uid, for audit purposes', () => {
    const result = deriveEvidenceAuthorityGrant({ uid: 'traceable_uid', role: NHEI_EVIDENCE_AUTHORITY_ROLE });
    expect(result.token?.grantedBy).toBe('nhei_evidence_authority:traceable_uid');
  });
});

// ---- Phase 3C-2B section 6: glued together, end to end ------------------
//
// The two describe blocks above test deriveKnowledgeReviewerIdentity and
// deriveEvidenceAuthorityGrant in isolation, which is necessary but not
// sufficient - it proves the authority contract makes the right decision
// about a caller, not that a real privileged write
// (nhei-persistence-service.ts's writeNheiEvidence, gated on a
// NheiSystemAuthorityToken) actually honours a token this contract
// produced, or actually refuses to honour one it should never have
// produced. This section closes that loop for real, using the exact
// token type writeNheiEvidence checks (isValidSystemAuthorityToken),
// not a stand-in.
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
          .map(([k, data]) => ({ id: k.slice(prefix.length), exists: true, data: () => data }) as FirestoreDocSnapshotLike);
        return { docs };
      },
    };
  }
  // Phase 3C-2B Checkpoint 2 section 5: writeNheiEvidence now requires
  // db.runTransaction to exist at all - see nhei-persistence-service.ts's
  // own comment. A simple, non-rigorous implementation (this fake applies
  // writes immediately rather than staging them, so there's nothing to
  // stage) is sufficient here, since this file's "glued together" tests
  // are not about race/conflict detection.
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

function systemHypothesisRecord() {
  return {
    id: 'ev1',
    sourceType: 'SYSTEM_HYPOTHESIS',
    timeUncertainty: 'unknown',
    evidenceQuality: 'medium',
    confirmationState: 'unconfirmed',
    selfSystems: ['INTERNAL_SELF'],
    dimensions: ['EMOTIONAL'],
    relatedEventIds: [],
  };
}

describe('deriveEvidenceAuthorityGrant glued to writeNheiEvidence - the real end-to-end chain', () => {
  it('a token derived from a caller WITH the evidence-authority role actually unlocks a privileged (SYSTEM_HYPOTHESIS) write', async () => {
    const db = createFakeFirestore();
    await setNheiConsent(db, 'userA', 'reflection_storage', true);

    const grant = deriveEvidenceAuthorityGrant({ uid: 'authority_1', role: NHEI_EVIDENCE_AUTHORITY_ROLE });
    expect(grant.ok).toBe(true);

    const result = await writeNheiEvidence(db, 'userA', systemHypothesisRecord(), { systemAuthority: grant.token });
    expect(result.ok).toBe(true);
  });

  it('a caller WITHOUT the evidence-authority role never gets a token, and the privileged write is correctly refused as a result', async () => {
    const db = createFakeFirestore();
    await setNheiConsent(db, 'userA', 'reflection_storage', true);

    // Same caller shape a request-authenticated route would see, just
    // missing the one role that matters - a general platform_admin, or
    // no role, must not be treated as equivalent to the specific
    // nhei_evidence_authority role.
    const grant = deriveEvidenceAuthorityGrant({ uid: 'admin_1', role: 'platform_admin' });
    expect(grant.ok).toBe(false);
    expect(grant.token).toBeUndefined();

    // Passing `undefined` through is exactly what a future route would do
    // if it correctly checked grant.ok first and never called
    // writeNheiEvidence at all on denial - but even if it mistakenly
    // forwarded the (nonexistent) token anyway, there is nothing here
    // that could satisfy the real check.
    const result = await writeNheiEvidence(db, 'userA', systemHypothesisRecord(), { systemAuthority: grant.token });
    expect(result.ok).toBe(false);
    if (result.ok === false) expect(result.reason).toBe('source_type_not_permitted');
  });
});
