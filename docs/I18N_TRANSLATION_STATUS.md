# Translation status (Batch 7, 8 November 2026)

**Status of every non-English language: MACHINE DRAFT - not reviewed, not production-ready.**
All 11 packs were drafted with AI assistance (no paid translation API) and have
not been reviewed by a native speaker. `i18n/locales.ts` marks them
`machine-draft`; the app tells customers this whenever a non-English language
is selected. Change a status to `reviewed` only after a documented native-speaker
review of the whole pack.

## How it works
- English source of truth: `i18n/en.ts` (268 keys). Packs: `i18n/packs/*.ts`.
- Runtime: `i18n/index.ts` - translate with English fallback, CLDR plurals,
  RTL direction, BCP-47 tags, local number/date formatting with IANA time zones.
- Shared by web (`src/lib/i18n-react.tsx`) and Expo (`mobile/src/lib/i18n.tsx`).
- Account-scoped: `users/{uid}/preferences/ui.localePreference` (rules: the 12
  codes only). Device choice is remembered (code only) until the account's
  explicitly saved language loads.
- Nova replies in the stored language (server-read only); safety block always last.
- Missing-key detection: `npx tsx scripts/i18n-missing-keys.mjs` and `i18n/i18n.test.ts`.

## Coverage per language
| Code | Language | Native name | Catalogue keys | Review status |
|---|---|---|---|---|
| en | English | English | 268/268 | Source |
| de | German | Deutsch | 268/268 | Machine draft |
| nl | Dutch | Nederlands | 268/268 | Machine draft |
| fr | French | Français | 268/268 | Machine draft |
| ar | Arabic | العربية | 268/268 | Machine draft (RTL) |
| es | Spanish | Español | 268/268 | Machine draft |
| pt | Portuguese | Português | 268/268 | Machine draft |
| hi | Hindi | हिन्दी | 268/268 | Machine draft |
| ur | Urdu | اردو | 268/268 | Machine draft (RTL) |
| zh | Mandarin Chinese (Simplified) | 中文（简体） | 268/268 | Machine draft |
| bn | Bengali | বাংলা | 268/268 | Machine draft |
| pl | Polish | Polski | 268/268 | Machine draft |

"268/268" means every catalogue key has a draft. It does **not** mean the whole
app is translated - see below.

## Screens translated (web unless stated)
Navigation (sidebar, mobile bar, Tools sheet), page titles for customer pages,
Today page (heading, actions, progress, eyebrow), sample-account banner,
greetings (all tones and times of day; web + Expo), experience levels,
one-question check-in (web + Expo), native full check-in sheet, Recovery
Intelligence panel (incl. chart labels), personal plan honesty text,
Settings personalisation + language + Low-Energy Mode (web + Expo),
onboarding personalisation, crisis-support button, Nova chat input, native
sign-in, reward/badge pop-ups.

## Still English (honest list)
Landing page and web sign-up/sign-in dialog; onboarding questions (pathway,
pressure, Nova tone, consent text); the 7/14-question Burnout Fingerprint
check-in and its results; most tool screens (Recover, Nervous System, Nutrition,
Communicate, Action Engine, Support Circle, User Guide); Recovery Reports and
PDF export; Subscription; Privacy Centre; notification and email content;
server-generated insight explanations (`describeTrend`); most error messages
from the server; native tab bar labels. Nova's replies follow the chosen
language, but its consent/safety wording comes from the model.

## Review plan before calling any language production-ready
1. Native-speaker review of the pack (especially safety and crisis wording).
2. Screen-reader check (VoiceOver/TalkBack) in that language; RTL check for ar/ur.
3. Translate the remaining English screens above, crisis/safety screens first.
4. Then set the language status to `reviewed` in `i18n/locales.ts`.

## Unified integration branch — consent and support copy

The source catalogue now has 268 entries (212 from Batch 7 plus 10 onboarding consent, 10 support-directory, 8 onboarding prompt, 8 Fingerprint interface and 6 notification-setting strings). All twelve packs have draft entries for the new keys. These are **unreviewed machine drafts**, especially the support wording, and require specialist/native-speaker validation. The translated support-directory headings do not alter provider names, numbers, links or region selection. Onboarding stored answer values remain unchanged while consent labels and accessible names are localised. Other English-only areas listed above remain outstanding. No combined runtime tests have yet been executed.

## Continuation — core onboarding and Recovery Hub (8 November)

Added eight core onboarding step headings/questions in English and the eleven other **unreviewed machine-draft** packs. The React onboarding screen displays the translated prompts but retains all stored `purpose`, `pathway`, `primaryDrain` and `novaTone` values unchanged. Onboarding subtitles, option labels, profile fields and many other screens are still English: this is **not** a claim of completed translations. Recovery Intelligence uses shared translations for its heading and navigable Explore tools, while remaining tools and feedback wording still need coverage. `i18n/onboarding-prompts.test.ts` checks all 12 catalogues but has **not been run**.

## Batch 9 — Fingerprint and notification settings

The shared English catalogue has **268 source keys**, with the same 254 non-empty draft entries in each of the eleven other packs. Added eight Fingerprint selection/progress/loading/retry strings and six notification-settings introduction/enable/quiet-hours strings. Wired them to the existing `DiagnoseSection.tsx` and `NotificationSettingsView.tsx` display components; no question IDs, numeric score values, Nudge preference IDs or delivery channels changed.

**Still English:** the Fingerprint's seven/fourteen actual question texts and answer options, result interpretation; most notification category/frequency details; onboarding subtitles/options; reports, privacy, billing, notifications/email templates. This is interface-string coverage, not whole-screen translation. All eleven non-English catalogues remain **unreviewed AI drafts**.

**Test status:** new `i18n/fingerprint-entry.test.ts` and `i18n/notification-preferences.test.ts` authored. GitHub source checks confirm new key presence and matching progress variables across packs. No TypeScript, Vitest, emulator, native-speaker or staging pass has been executed for this head.

## Batch 10 — fourteen Fingerprint question prompts

Added fourteen question prompts to the shared catalogue (268 entries per locale), with draft text in all eleven non-English languages, and connected the prompts to the existing 7/14-question Fingerprint screen. English entries preserve the original assessment prompts verbatim. Persistent question IDs and 1–4 answer values are unchanged.

**Critical limitation:** answer choices remain in English; result explanations are not fully translated; translated prompts have not undergone native-speaker, safeguarding, clinical/measurement equivalence or RTL testing. They are not validated alternate-language versions of the original assessment and must not be marked release-ready. Cross-language score equivalence is **not established**. The released UI must not imply multilingual assessment validity until that review is complete.

The `i18n/fingerprint-question-prompts.test.ts` source contract checks presence and answer-ID stability; it has been authored but not executed.
