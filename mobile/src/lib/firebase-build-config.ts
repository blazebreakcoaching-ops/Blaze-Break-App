import type { FirebaseOptions } from 'firebase/app';

// Firebase web API keys are PUBLIC client configuration, not private server
// keys. Never put service-account credentials, OAuth secrets or signing keys
// in Expo EXPO_PUBLIC_ values.
export interface NativeFirebaseBuildSettings {
  apiKey?: string;
  authDomain?: string;
  projectId?: string;
  appId?: string;
  firestoreDatabaseId?: string;
  messagingSenderId?: string;
  storageBucket?: string;
}

export type NativeFirebaseBuildConfig = FirebaseOptions & { firestoreDatabaseId: string };

// Do not silently use firebase-applet-config.json: that file is intentionally
// the WEBSITE's production config, and would send a staging native build's
// Auth and Firestore traffic to production even if its API URL points elsewhere.
export function buildNativeFirebaseConfig(values: NativeFirebaseBuildSettings): NativeFirebaseBuildConfig {
  const required = ['apiKey', 'authDomain', 'projectId', 'appId', 'firestoreDatabaseId'] as const;
  for (const key of required) {
    const value = values[key];
    if (typeof value !== 'string' || !value.trim() || /^(replace[_-]|your[_-])/i.test(value.trim())) {
      throw new Error('Native Firebase config missing or placeholder: EXPO_PUBLIC_FIREBASE_' +
        ({ apiKey: 'API_KEY', authDomain: 'AUTH_DOMAIN', projectId: 'PROJECT_ID', appId: 'APP_ID', firestoreDatabaseId: 'FIRESTORE_DATABASE_ID' }[key]));
    }
  }
  const projectId = values.projectId!.trim();
  const databaseId = values.firestoreDatabaseId!.trim();
  const authDomain = values.authDomain!.trim();
  if (!/^[a-z][a-z0-9-]{3,61}[a-z0-9]$/.test(projectId) ||
      !/^(\(default\)|[a-z][a-z0-9-]{3,61}[a-z0-9])$/.test(databaseId) ||
      !/^[a-z0-9.-]+(?::[0-9]+)?$/i.test(authDomain)) {
    throw new Error('Native Firebase project/database/auth domain format is invalid');
  }
  return {
    apiKey: values.apiKey!.trim(),
    authDomain,
    projectId,
    appId: values.appId!.trim(),
    firestoreDatabaseId: databaseId,
    ...(values.messagingSenderId?.trim() ? { messagingSenderId: values.messagingSenderId.trim() } : {}),
    ...(values.storageBucket?.trim() ? { storageBucket: values.storageBucket.trim() } : {}),
  };
}
