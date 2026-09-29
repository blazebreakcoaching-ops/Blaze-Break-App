// EXPO_PUBLIC_-prefixed env vars are inlined at build time by Expo's own
// tooling (no extra config needed) and are readable from process.env in
// both Expo Go and a built app. Falls back to the known production Cloud
// Run URL so the app works out of the box without an .env file.
export const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL || 'https://blaze-break-220686314556.europe-west2.run.app';
