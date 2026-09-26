# Console setup: native App Check + Google Sign-In

Two one-time setup jobs, both done in web consoles (not code) by whoever owns the
Firebase project. Once done, tell Claude the files/values are in place and the
remaining code wiring (installing `@react-native-firebase/app` + `app-check`, adding
the config plugins, swapping the stub in `src/lib/app-check.ts` for the real thing,
wiring native Google Sign-In) is a same-session follow-up, not more waiting on you.

Project identifiers already set, so the console steps below have exact values to use:

- Firebase/Google Cloud project: **`gen-lang-client-0537893432`**
- iOS bundle identifier: **`com.blazebreak.app`**
- Android package name: **`com.blazebreak.app`**

(Both bundle IDs live in `mobile/app.json`. If you'd rather use a real domain you
own — e.g. `com.blazebreakcoaching.app` — change it there first, consistently for
both platforms, before registering anything below; the value in the console and the
value in `app.json` must match exactly or the config files won't work.)

---

## Part A — Firebase Console: register the apps + turn on App Check

This is what makes `/api/nova/diagnose`, `/api/user/recommendation`, and every other
backend call actually work from a real device build (they currently 401 in
production without it — expected, not a bug, until this is done).

1. Go to [console.firebase.google.com](https://console.firebase.google.com) and open
   the **`gen-lang-client-0537893432`** project (the same one the website already
   uses).

2. **Add the Android app:**
   - Project Settings (gear icon, top left) → **Your apps** → **Add app** → Android.
   - **Android package name**: `com.blazebreak.app`
   - App nickname: `Blaze Break Mobile` (anything, just a label)
   - SHA-1 (debug): needed for Google Sign-In later, not App Check — you can skip
     it for now and add it after your first `eas build`, which will print one.
   - Click through, then **download `google-services.json`**.
   - Send that file to Claude (or drop it at `mobile/google-services.json` in the
     repo yourself) — it's project config, not a secret key, safe to commit.

3. **Add the iOS app:**
   - Same **Your apps** screen → **Add app** → iOS.
   - **iOS bundle ID**: `com.blazebreak.app`
   - App nickname: `Blaze Break Mobile`
   - Download **`GoogleService-Info.plist`**, send it the same way (→
     `mobile/GoogleService-Info.plist`).

4. **Turn on App Check:**
   - Left sidebar → **App Check**.
   - Click into the **Android app** you just added → **Register** →
     choose **Play Integrity** as the provider (the standard choice; no extra Google
     Play Console setup needed for a development/internal build).
   - Click into the **iOS app** → **Register** → choose **App Attest** (or
     **DeviceCheck** if App Attest isn't available for your account/OS target — App
     Attest is preferred when it's offered).
   - Leave enforcement in **"Monitor" mode** for both until a real device build has
     been tested successfully — switching to "Enforce" too early just means every
     call fails with no App Check token yet configured on the device. The backend
     itself already always requires a valid token in production regardless of this
     dashboard toggle (`server.ts`'s `verifyAppCheck` middleware) — "Monitor" vs.
     "Enforce" here only affects Firebase's own dashboard warnings, not whether the
     token is checked.

5. **Debug token for local testing (optional but saves a lot of friction):** App
   Check's own docs cover generating a **debug provider token** for
   `@react-native-firebase/app-check` so you don't need a passing Play
   Integrity/App Attest attestation on every single test build. Not required to get
   started — flag it if development-build testing keeps failing App Check and this
   will be the fix.

That's it for Part A — the two downloaded files are the only things Claude needs
back to finish the code side.

---

## Part B — Google Cloud Console: OAuth client for native Google Sign-In

Separate from App Check. This is what lets someone tap "Continue with Google" in the
app itself (currently email/password only).

1. Go to [console.cloud.google.com](https://console.cloud.google.com) and make sure
   the **`gen-lang-client-0537893432`** project is selected (top left project
   switcher) — same project as Firebase, they're the same underlying GCP project.

2. **APIs & Services → Credentials → Create Credentials → OAuth client ID.**

3. You'll create **three** OAuth client IDs (Google's native sign-in library needs a
   separate one per platform, plus the web one the app already has):

   - **iOS**: Application type "iOS". Bundle ID: `com.blazebreak.app`.
   - **Android**: Application type "Android". Package name: `com.blazebreak.app`.
     SHA-1 certificate fingerprint: same one from Part A step 2 (from your first
     `eas build`, or `eas credentials` once you have an EAS account) — Android's
     OAuth client is tied to both the package name and the signing certificate, so
     this one can't be created until you have a build to pull the SHA-1 from.
   - **Web**: Application type "Web application" — needed even for a mobile app,
     because `@react-native-google-signin/google-signin` uses it as the
     `webClientId` under the hood to get a Firebase-compatible ID token. No redirect
     URIs needed for this use case.

4. Send Claude the **Web client ID** (looks like
   `220686314556-xxxxxxxxxxxx.apps.googleusercontent.com`) — that's the one value
   the code needs (`GoogleSignin.configure({ webClientId: '...' })`). The iOS/Android
   client IDs mostly just need to exist (registered against the right bundle
   ID/package/SHA-1); the app doesn't reference their IDs directly in code.

---

## What happens after you send the files/values back

Once `google-services.json`, `GoogleService-Info.plist`, and the Web OAuth client ID
exist, the remaining work is code-only and doesn't need anything further from you:

- Install `@react-native-firebase/app` + `@react-native-firebase/app-check` +
  `@react-native-google-signin/google-signin`.
- Add their config plugins to `app.json`.
- Replace the stub in `mobile/src/lib/app-check.ts` with the real native token
  fetch.
- Add native Google Sign-In to `sign-in.tsx`/`sign-up.tsx` and `auth-context.tsx`
  (the linking-with-anonymous-session logic already exists for email/password — the
  Google path follows the same pattern, ported from `src/lib/auth.tsx`'s
  `signInWithGoogle`).
- Switch from Expo Go to an EAS development-client build to actually test any of it
  (Expo Go can't load these native modules at all — see the main README's "Stage 2").
