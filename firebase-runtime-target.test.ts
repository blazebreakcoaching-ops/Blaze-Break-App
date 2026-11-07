import { describe, expect, it } from 'vitest';
import { resolveServerFirebaseTarget } from './firebase-runtime-target';

describe('Cloud Run Firebase environment isolation', () => {
  const bundledProjectId = 'production-example';
  const bundledDatabaseId = 'named-data-store';
  it('accepts a matching production runtime and its named Firestore database', () => {
    expect(resolveServerFirebaseTarget({
      bundledProjectId, bundledDatabaseId, runtimeProjectId: bundledProjectId, production: true,
    })).toEqual({ projectId: bundledProjectId, databaseId: bundledDatabaseId });
  });
  it('rejects staging deployed with a production client config', () => {
    expect(() => resolveServerFirebaseTarget({
      bundledProjectId, bundledDatabaseId, runtimeProjectId: 'staging-example', production: true,
    })).toThrow(/does not match/);
  });
  it('rejects missing runtime identity and implicit default database in production', () => {
    expect(() => resolveServerFirebaseTarget({
      bundledProjectId, bundledDatabaseId, production: true,
    })).toThrow(/required/);
    expect(() => resolveServerFirebaseTarget({
      bundledProjectId, bundledDatabaseId: '(default)', runtimeProjectId: bundledProjectId, production: true,
    })).toThrow(/named Firestore/);
  });
  it('retains local and test-mode fallback', () => {
    expect(resolveServerFirebaseTarget({ bundledProjectId, bundledDatabaseId, production: false }).projectId)
      .toBe(bundledProjectId);
  });
});
