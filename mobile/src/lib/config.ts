// This value is public client configuration, never a secret. It MUST be
// set separately for each EAS/internal/production build. A silent production
// fallback allowed development/staging devices to send authenticated user
// requests to the live Cloud Run service when a build variable was missing.
// Fail closed instead; see docs/CTO_FIREBASE_GCLOUD_DEPLOY_HANDOFF.md.
export const API_BASE_URL = (process.env.EXPO_PUBLIC_API_BASE_URL || '').trim().replace(/\/+$/, '');
