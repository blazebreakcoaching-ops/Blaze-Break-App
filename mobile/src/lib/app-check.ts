// Native App Check token source. Uses @react-native-firebase/app-check for
// real device/app attestation (Play Integrity on Android, App Attest with
// a DeviceCheck fallback on iOS) - the firebase-js-sdk's App Check has no
// native attestation provider, only web reCAPTCHA, which doesn't apply here.
//
// This intentionally stays on a SEPARATE Firebase "app" instance from the
// one in firebase.ts (that one is the firebase-js-sdk, used for Auth and
// Firestore). @react-native-firebase/app's default app is configured
// automatically from the native mobile/google-services.json /
// mobile/GoogleService-Info.plist files at native build time (see that
// package's own Expo config plugin) - it is not related to the
// EXPO_PUBLIC_FIREBASE_* values firebase.ts reads. Both must point at the
// same Firebase project for App Check to actually protect the project's
// own API, but that match is a deployment/config concern (see
// scripts/cto-native-release-preflight.mjs), not something this module
// can enforce at runtime.
//
// Native attestation requires the real native module, which Expo Go
// cannot load (see mobile AGENTS.md - "After adding a library with native
// code, the app needs a development build"). Running in Expo Go, or any
// build missing the native Firebase app config, must not crash the app:
// Firestore-only screens (auth, the quick check-in) work without this;
// only the REST-backed screens (Check-in's diagnostic submit, BLAME
// Reset's Nova exchange) need it, and server.ts's verifyAppCheck
// middleware has no soft mode, so an empty token correctly 401s there -
// expected, not a bug.
import type { AppCheck } from '@react-native-firebase/app-check';

let appCheckPromise: Promise<AppCheck | null> | null = null;

async function getAppCheckInstance(): Promise<AppCheck | null> {
  if (!appCheckPromise) {
    appCheckPromise = (async () => {
      try {
        const [{ getApp }, { initializeAppCheck, ReactNativeFirebaseAppCheckProvider }] = await Promise.all([
          import('@react-native-firebase/app'),
          import('@react-native-firebase/app-check'),
        ]);
        const provider = new ReactNativeFirebaseAppCheckProvider();
        provider.configure({
          android: { provider: __DEV__ ? 'debug' : 'playIntegrity' },
          apple: { provider: __DEV__ ? 'debug' : 'appAttestWithDeviceCheckFallback' },
        });
        return initializeAppCheck(getApp(), {
          provider,
          isTokenAutoRefreshEnabled: true,
        });
      } catch {
        // No native module (Expo Go), no native Firebase app config
        // (google-services.json / GoogleService-Info.plist missing), or
        // initialization otherwise failed. Fall back to no token - the
        // server correctly rejects any App Check-gated route instead of
        // trusting a fabricated one.
        return null;
      }
    })();
  }
  return appCheckPromise;
}

export async function getAppCheckToken(forceRefresh = false): Promise<string> {
  const instance = await getAppCheckInstance();
  if (!instance) return '';
  try {
    const { getToken } = await import('@react-native-firebase/app-check');
    const result = await getToken(instance, forceRefresh);
    return result.token;
  } catch {
    // A transient attestation failure must not crash the caller; it just
    // means this request goes out without the header and the server 401s
    // it, same as the no-native-module case above.
    return '';
  }
}
