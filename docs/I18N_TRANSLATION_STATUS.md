# Translation status (Batch 7, 8 November 2026)

**Status of every non-English language: MACHINE DRAFT - not reviewed, not production-ready.**
All 11 packs were drafted with AI assistance (no paid translation API) and have
not been reviewed by a native speaker. `i18n/locales.ts` marks them
`machine-draft`; the app tells customers this whenever a non-English language
is selected. Change a status to `reviewed` only after a documented native-speaker
review of the whole pack.

## How it works
- English source of truth: `i18n/en.ts` (212 keys). Packs: `i18n/packs/*.ts`.
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
| en | English | English | 212/212 | Source |
| de | German | Deutsch | 212/212 | Machine draft |
| nl | Dutch | Nederlands | 212/212 | Machine draft |
| fr | French | Français | 212/212 | Machine draft |
| ar | Arabic | العربية | 212/212 | Machine draft (RTL) |
| es | Spanish | Español | 212/212 | Machine draft |
| pt | Portuguese | Português | 212/212 | Machine draft |
| hi | Hindi | हिन्दी | 212/212 | Machine draft |
| ur | Urdu | اردو | 212/212 | Machine draft (RTL) |
| zh | Mandarin Chinese (Simplified) | 中文（简体） | 212/212 | Machine draft |
| bn | Bengali | বাংলা | 212/212 | Machine draft |
| pl | Polish | Polski | 212/212 | Machine draft |

"212/212" means every catalogue key has a draft. It does **not** mean the whole
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
