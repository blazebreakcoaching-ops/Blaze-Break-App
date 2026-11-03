import { describe, expect, it } from 'vitest';
import { BLAZE_NAMED_FIRESTORE_ID, resolveBlockingFunctionsDatabaseId } from './firebase-target';

describe('Firebase Auth blocking-function Firestore target', () => {
  it('uses the named Enterprise database, never (default)', () => {
    expect(resolveBlockingFunctionsDatabaseId()).toBe(BLAZE_NAMED_FIRESTORE_ID);
    expect(resolveBlockingFunctionsDatabaseId()).not.toBe('(default)');
  });
  it('accepts an explicitly configured named database for isolated projects', () => {
    expect(resolveBlockingFunctionsDatabaseId('staging-project-database')).toBe('staging-project-database');
  });
  it.each(['(default)', '', ' ', 'users/production', 'https://database'])
  ('refuses invalid database ID %s', value => {
    expect(() => resolveBlockingFunctionsDatabaseId(value)).toThrow();
  });
});
