# Blaze Break — existing-feature fixes, 4 Nov 2026
**Code:** cto/existing-features-stability-20261104 (branched from the 30faeb2 green integration baseline).
**Scope:** only existing features; Stripe, Zoom, Secret Me Brain and external integrations remain unchanged and out of scope.

## Fixed in source
- **Signed-in appearance persistence:** src/main.tsx intercepts browser localStorage to keep shared anonymous/demo profile data away from registered accounts. It allowed legacy 'blaze_dark_mode' but silently rejected the newly implemented 'blaze_theme_mode'. Added the new device-level preference to the explicit allowlist, preserving demo-profile isolation.
- **Unexpected "What's New" interruption:** src/App.tsx previously rendered WhatsNewModal for anonymous demo users, although it is designed for existing accounts. It now renders only for registered users. The modal's 3-second timer could appear mid-compose, mid-click or over another dialog; it now offers the announcement only on a quiet first load, and cancels for the page visit when the user starts interacting. Declining an interruption does NOT mark the announcement as seen, allowing another quiet visit to offer it later.
- Added regression guards for signed-in theme persistence, anonymous-demo exclusion and modal readiness while editing or another modal is active.

## Required verification after these commits
Run \`EXPECTED_RELEASE_SHA=<candidate-head-sha> npm run verify:web:offline\` and \`EXPECTED_RELEASE_SHA=<candidate-head-sha> npm run verify:integration:offline\` on a clean checkout with the required Firebase emulators. Record exact SHA and all exit codes. Test real web login on one registered account: choose Dark, reload, choose System, toggle OS mode and verify automatic changes, and ensure no demo profile data leaks. Verify anonymous onboarding/Nova is never obstructed by WhatsNew, registered users receive it on quiet visit and it never interrupts an active task.

**Security/release boundaries:** Existing Firestore/MFA enforcement gap, staging verification, PR #140, and real production smoke/rollback remain OPEN. Code source changes do not authorise merging or deployment. Production main remains untouched.
