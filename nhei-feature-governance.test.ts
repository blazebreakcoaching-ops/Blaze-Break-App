// NHEI PHASE 3C CHECKPOINT 3 SECTION 2 - OPERATIONAL FEATURE GOVERNANCE TESTS

import { describe, it, expect } from 'vitest';
import {
  isNheiModeEnabledInGovernanceDoc,
  validateNheiGovernanceToggleInput,
  isNheiModeEnabledInGovernance,
  NHEI_FEATURE_GOVERNANCE_COLLECTION,
  NHEI_FEATURE_GOVERNANCE_DOC_ID,
  DEFAULT_NHEI_FEATURE_GOVERNANCE_STATE,
} from './nhei-feature-governance';
import type { FirestoreLike, FirestoreCollectionRefLike } from './nhei-persistence-service';

function createFakeFirestore(initial?: Record<string, unknown>): FirestoreLike {
  const store = new Map<string, Record<string, unknown>>();
  if (initial) store.set(`${NHEI_FEATURE_GOVERNANCE_COLLECTION}/${NHEI_FEATURE_GOVERNANCE_DOC_ID}`, initial);
  function collection(path: string): FirestoreCollectionRefLike {
    return {
      doc(id?: string) {
        const docId = id ?? 'auto';
        const key = `${path}/${docId}`;
        return {
          id: docId,
          async get() {
            const data = store.get(key);
            return { id: docId, exists: data !== undefined, data: () => data };
          },
          async set(data: Record<string, unknown>) { store.set(key, { ...data }); },
          async update(data: Record<string, unknown>) {
            if (!store.has(key)) throw new Error('no such document');
            store.set(key, { ...store.get(key), ...data });
          },
          async delete() { store.delete(key); },
        };
      },
      async get() { return { docs: [] }; },
    };
  }
  return { collection };
}

describe('isNheiModeEnabledInGovernanceDoc - pure interpretation, fail-closed', () => {
  it('defaults to false for every mode when the document is missing entirely', () => {
    expect(isNheiModeEnabledInGovernanceDoc(null, 'educational')).toBe(false);
    expect(isNheiModeEnabledInGovernanceDoc(undefined, 'educational')).toBe(false);
  });

  it('defaults to false when the relevant field is simply absent', () => {
    expect(isNheiModeEnabledInGovernanceDoc({}, 'educational')).toBe(false);
  });

  it('defaults to false when the field is a malformed (non-boolean) value', () => {
    expect(isNheiModeEnabledInGovernanceDoc({ educationalModeEnabled: 'true' as unknown as boolean }, 'educational')).toBe(false);
    expect(isNheiModeEnabledInGovernanceDoc({ educationalModeEnabled: 1 as unknown as boolean }, 'educational')).toBe(false);
  });

  it('returns true only when the field is exactly boolean true', () => {
    expect(isNheiModeEnabledInGovernanceDoc({ educationalModeEnabled: true }, 'educational')).toBe(true);
  });

  it('each of the three modes is read from its own field, independently', () => {
    const doc = { educationalModeEnabled: true, personalReflectionModeEnabled: false, longitudinalModeEnabled: true };
    expect(isNheiModeEnabledInGovernanceDoc(doc, 'educational')).toBe(true);
    expect(isNheiModeEnabledInGovernanceDoc(doc, 'personal_reflection')).toBe(false);
    expect(isNheiModeEnabledInGovernanceDoc(doc, 'longitudinal')).toBe(true);
  });

  it('the documented default state object itself reads as all-disabled', () => {
    expect(isNheiModeEnabledInGovernanceDoc(DEFAULT_NHEI_FEATURE_GOVERNANCE_STATE, 'educational')).toBe(false);
    expect(isNheiModeEnabledInGovernanceDoc(DEFAULT_NHEI_FEATURE_GOVERNANCE_STATE, 'personal_reflection')).toBe(false);
    expect(isNheiModeEnabledInGovernanceDoc(DEFAULT_NHEI_FEATURE_GOVERNANCE_STATE, 'longitudinal')).toBe(false);
  });
});

describe('validateNheiGovernanceToggleInput', () => {
  it('rejects a non-object input', () => {
    expect(validateNheiGovernanceToggleInput(null).valid).toBe(false);
    expect(validateNheiGovernanceToggleInput('true').valid).toBe(false);
  });

  it('rejects a non-boolean value for any of the three mode fields', () => {
    expect(validateNheiGovernanceToggleInput({ educationalModeEnabled: 'true' }).valid).toBe(false);
    expect(validateNheiGovernanceToggleInput({ personalReflectionModeEnabled: 1 }).valid).toBe(false);
    expect(validateNheiGovernanceToggleInput({ longitudinalModeEnabled: {} }).valid).toBe(false);
  });

  it('accepts a partial update - not every field needs to be present at once', () => {
    expect(validateNheiGovernanceToggleInput({ educationalModeEnabled: false }).valid).toBe(true);
  });

  it('accepts an empty object (a no-op toggle) and a fully-specified one', () => {
    expect(validateNheiGovernanceToggleInput({}).valid).toBe(true);
    expect(validateNheiGovernanceToggleInput({
      educationalModeEnabled: true, personalReflectionModeEnabled: false, longitudinalModeEnabled: false, reason: 'pilot',
    }).valid).toBe(true);
  });

  it('rejects an overlong reason string', () => {
    expect(validateNheiGovernanceToggleInput({ reason: 'x'.repeat(2001) }).valid).toBe(false);
  });

  it('accepts a null reason', () => {
    expect(validateNheiGovernanceToggleInput({ reason: null }).valid).toBe(true);
  });
});

describe('isNheiModeEnabledInGovernance - the real, async, fail-closed Firestore read', () => {
  it('returns false when the document does not exist', async () => {
    const db = createFakeFirestore();
    expect(await isNheiModeEnabledInGovernance(db, 'educational')).toBe(false);
  });

  it('returns true once the document explicitly enables that mode', async () => {
    const db = createFakeFirestore({ educationalModeEnabled: true });
    expect(await isNheiModeEnabledInGovernance(db, 'educational')).toBe(true);
  });

  it('never throws - a broken Firestore read resolves to false, not a rejected promise', async () => {
    const brokenDb: FirestoreLike = {
      collection() { throw new Error('simulated Firestore outage'); },
    };
    await expect(isNheiModeEnabledInGovernance(brokenDb, 'educational')).resolves.toBe(false);
  });

  it('a different mode on the same document is read independently', async () => {
    const db = createFakeFirestore({ educationalModeEnabled: true, personalReflectionModeEnabled: false });
    expect(await isNheiModeEnabledInGovernance(db, 'educational')).toBe(true);
    expect(await isNheiModeEnabledInGovernance(db, 'personal_reflection')).toBe(false);
    expect(await isNheiModeEnabledInGovernance(db, 'longitudinal')).toBe(false);
  });

  it('cross-instance propagation is immediate by construction - no cache, a second read after a write sees the new value', async () => {
    const db = createFakeFirestore({ educationalModeEnabled: false });
    expect(await isNheiModeEnabledInGovernance(db, 'educational')).toBe(false);
    await db.collection(NHEI_FEATURE_GOVERNANCE_COLLECTION).doc(NHEI_FEATURE_GOVERNANCE_DOC_ID).set({ educationalModeEnabled: true });
    expect(await isNheiModeEnabledInGovernance(db, 'educational')).toBe(true);
  });
});
