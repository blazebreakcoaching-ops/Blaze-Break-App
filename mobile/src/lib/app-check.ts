// Native App Check token source. Deliberately a stub for now: real
// attestation needs @react-native-firebase/app + @react-native-firebase/
// app-check, which are native modules requiring an EAS development-client
// build (incompatible with plain Expo Go) - see the mobile plan's "App
// Check" section. Until that's wired in, this always returns "", which
// means server.ts's REST routes will correctly 401 in production (its
// verifyAppCheck middleware has no soft mode - see server.ts:468-496).
// That's expected, not a bug: Firestore-only screens (auth, the quick
// check-in) work fine without this; only the REST-backed screens
// (Check-in's diagnostic submit, BLAME Reset's Nova exchange) need it.
export async function getAppCheckToken(_forceRefresh = false): Promise<string> {
  return '';
}
