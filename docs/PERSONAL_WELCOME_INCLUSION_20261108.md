# Blaze Break — Personal Welcome / Global Inclusion Batch (8 November 2026)

## Scope and status
Implementation branch: `feature/personal-welcome-global-inclusion-20261108`, based on the isolated accessibility / one-tap check-in PR #157. This batch has **not** merged, deployed or run GitHub Actions.

### Implemented
- Reused existing `dashboard-greeting.ts`, `UserProfileData`, `SituationalOnboarding`, `SettingsModal`, user Firestore profile, native Pulse, native sign-up and Account. No duplicate authentication or Ember theme.
- Shared, deterministic English message catalog and `personalWelcome` functions with time-zone-aware local hours, daylight-saving handling, deterministic daily variation, and Warm/Simple/Direct tone.
- Device locale/time-zone suggestions; no GPS, IP geolocation, network lookups or AI generation.
- Signed-in native account settings for preferred name, optional region, IANA time zone, welcome tone, name-consent and opt-out. One account cannot read another's private profile through this client.
- Native sign-up accepts optional preferred name and time zone, and reports when account creation succeeds but preference saving fails.
- Native Pulse displays the account's chosen greeting only after its own profile loads. Existing Pulse check-in, security gate and route architecture remain.
- Existing web onboarding/settings accept preferred name, region, time zone and welcome tone. Dashboard uses the shared greeting engine. The web profile is saved through its existing settings flow.
- Firestore `preferences/ui` allowlist updated to permit `greetingTone`, validate three values, validate greeting switches as booleans, and permit only released `en` translation code.
- Pure test cases cover IANA time-zone, UK DST, date formatting, pluralisation, language fallback, controlled name use and deterministic output; rule tests added for preferences and account isolation.
- Preserved English-only user-facing copy: future-language pack structure and RTL direction utility exist, **not** a completed French/Spanish/Arabic translation.

### Known gaps, follow-ups and risk
1. **Verification P0:** Full `npm run verify:integration:offline`, native Jest, device accessibility checks and Firebase emulator security tests were **not executed** in this connector-only session. Run on an actual development checkout and report results before integration.
2. **Release P0:** Firestore rules changes are required for native greeting style saving. No merge or deployment without owner's approval.
3. **Cross-platform parity P1:** Web profile fields currently live in `user_stats/core.profile`, while native uses Firestore root `users/{uid}` and `preferences/ui`. These must be reconciled into a single backward-compatible canonical preference service before claiming two-way web/native sync.
4. **Language coverage P1:** English is the only production-reviewed catalog. Add professional translations and explicit locale selection after full UI inventory, external-language QA and screen-reader/RTL checks. Do not show unsupported languages in an active selector.
5. **Native welcome P1:** Observe greeting change upon returning to the Pulse screen after changing settings; test stale account-switch callbacks and dynamic text / reduced motion on real iOS and Android.
6. **Web accessibility P1:** Audit onboarding progress animations at reduced motion, keyboard focus, settings errors and screen reader semantics. Do not alter approved Ember design.
7. **Secure account creation P1:** Test race between native auth listener `ensureUserDocument` and preferred-name profile writes, especially anonymous-to-email upgrade and offline write failure.
8. **Consent alignment P1:** Audit web `useNameInGreetings` and native `usePreferredName` before synchronising preference fields, preserving prior explicit opt-outs.

## Engineering handoff
Review this branch as a draft onto PR #157 and then reconcile with Claude's active accessibility work branch. Preserve PR #157's qualitative check-in segregation and owner-only Firestore security. Check builds and regression tests before any merge; no direct main merge. The owner's priority is simple, low-energy, inclusive and independently usable onboarding, not an artificially chatty interface.
