/**
 * Cloud Run runtime and the Firebase project baked into the web bundle
 * must target the SAME project before any Firebase Admin call occurs.
 * Never fix a mismatch by overwriting GOOGLE_CLOUD_PROJECT at runtime.
 */
export function resolveServerFirebaseTarget(input: {
  bundledProjectId?: string;
  bundledDatabaseId?: string;
  runtimeProjectId?: string;
  production: boolean;
}): { projectId: string | undefined; databaseId: string | undefined } {
  const bundledProject = input.bundledProjectId?.trim();
  const runtimeProject = input.runtimeProjectId?.trim();
  const databaseId = input.bundledDatabaseId?.trim();

  if (input.production) {
    if (!runtimeProject) {
      throw new Error('FIREBASE_PROJECT_ID or runtime GCP project is required in production');
    }
    if (!bundledProject || bundledProject !== runtimeProject) {
      throw new Error('Runtime Firebase project does not match bundled web Firebase project');
    }
    if (!databaseId || databaseId === '(default)') {
      throw new Error('The named Firestore database ID is required in production');
    }
  }
  return { projectId: runtimeProject || bundledProject, databaseId };
}
