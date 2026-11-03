import { buildNativeFirebaseConfig } from './firebase-build-config';

const staging = {
  apiKey: 'public-client-key',
  authDomain: 'test-blaze-staging.firebaseapp.com',
  projectId: 'test-blaze-staging',
  appId: '1:123:web:456',
  firestoreDatabaseId: '(default)',
  messagingSenderId: '123',
};

describe('native Firebase environment isolation', () => {
  it('uses the explicit build-provided project and named database', () => {
    const result = buildNativeFirebaseConfig({ ...staging, firestoreDatabaseId: 'my-firestore-db' });
    expect(result.projectId).toBe('test-blaze-staging');
    expect(result.firestoreDatabaseId).toBe('my-firestore-db');
    expect(result.apiKey).toBe('public-client-key');
  });

  it.each(['apiKey', 'authDomain', 'projectId', 'appId', 'firestoreDatabaseId'] as const)
    ('refuses a missing required build variable: %s', (key) => {
      expect(() => buildNativeFirebaseConfig({ ...staging, [key]: '' })).toThrow(/EXPO_PUBLIC_FIREBASE_/);
    });

  it('refuses placeholder project identifiers or malformed database IDs', () => {
    expect(() => buildNativeFirebaseConfig({ ...staging, projectId: 'your-staging-project' })).toThrow();
    expect(() => buildNativeFirebaseConfig({ ...staging, firestoreDatabaseId: 'users/production' })).toThrow();
  });

  it('never inserts the website production Firebase config as a fallback', () => {
    expect(() => buildNativeFirebaseConfig({})).toThrow(/EXPO_PUBLIC_FIREBASE_/);
  });
});
