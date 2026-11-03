/**
 * Firebase Auth Blocking Functions run as a separate Node project.
 * They must use the SAME NAMED Firestore database as firebase.json.
 * Staging is intentionally provisioned with the same database ID in its
 * separate Firebase project (docs/DEPLOY.md §10).
 */
export const BLAZE_NAMED_FIRESTORE_ID = 'ai-studio-67723f85-0bfc-4690-ac83-580d6face1fc';

export function resolveBlockingFunctionsDatabaseId(configured?: string): string {
  const value = configured === undefined ? BLAZE_NAMED_FIRESTORE_ID : configured.trim();
  if (!value || value === '(default)' || !/^[a-z][a-z0-9-]{3,61}[a-z0-9]$/.test(value)) {
    throw new Error('Invalid FIRESTORE_DATABASE_ID for Firebase Auth blocking functions');
  }
  return value;
}
