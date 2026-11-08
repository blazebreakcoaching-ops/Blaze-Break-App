# Blaze Break — Unified NHEI × Multilingual Integration Register
Date: 8 November 2026
Working branch: `integration/nhei-multilingual-20261108`
Source branch: `claude/funny-wright-0p84gv`
Separate NHEI source: `main` at `4cb1708b6fcd08d64ea40c2d4fc6e2a13bcc2c0b`

## Phase 1: baseline and first source audit

This is a work-in-progress integration register, not a release certificate.
GitHub compare confirms the two branches **diverged** at `ddf4513b86cafbacc0c60a135f4a60cc50f22e66`: multilingual is ahead 770 commits and behind 114 relative to main. A blind merge or copying `server.ts`, `src/App.tsx`, `firestore.rules`, or `src/lib/nova-brain.ts` risks dropping functionality. The multilingual branch also carries major other product/security/Expo work absent on main. Work on this integration branch first; do not force-push either original branch.

## Feature-by-feature matrix — initial read against the multilingual source

| Existing workstream | Baseline from `docs/NOVA_FULL_VISION_CAPABILITY_REGISTER.md` | Phase action | Release gate |
|---|---|---|---|
| A. NHEI Experience Intelligence | Partial | Reconcile new consented adaptation/routing from main with existing NHEI gates; do not activate blocked modes | Independent knowledge and safety approvals |
| B. Before Words | Built but offline | Trace actual UI-to-Nova handoff and permission, avoid duplicate memory | Real user journey, no silent persistence |
| C. Invisible Load | Built but offline | Verify Take the Load mapping and hidden/offline state | No unapproved agentic action |
| D. Recovery Friction/Environment | Not started as named workstream | Map existing adjacent tools before creating adapters | Evidence-backed candidate metadata |
| E. Take the Load | Built but offline | Trace existing categorisation, deferral and calendar bridges | Explicit action approval |
| F. Calendar Protection | Integrated read-only | Preserve opt-in and existing read-only behaviour | Calendar permissions + account isolation |
| G. Boundary Messaging | Integrated | Verify direct-request preference wins | Privacy and safe messaging |
| H. Energy/Capacity | Integrated | Map current capacity to routing with provenance | Never exceed self-reported capacity |
| I. Support Circle | Integrated, Tier 3 blocked | Preserve tier and sharing boundaries | Real-world safety approval |
| J. Care Navigation | Integrated, external verification | Avoid claiming provider validation not done | Localisation of safety info |
| K. Voice/Multimodal | Integrated | Verify locale, RTL and accessibility | Real device testing |
| L. Agentic/Proactive | Partial, guarded | No action without user authorisation | Separate gated pilot |
| M. Recovery Outcomes | Partial | Reconcile feedback correction/withdrawal with existing outcome events | Atomic writes and consent |
| N. Identity/Values | Integrated | Keep culturally appropriate, no inferred identity | Member control and translation review |
| O. Privacy Vault/Consent | Partial | Harmonise all memory and learning toggles across accounts | Rules emulator and opt-out E2E |
| P. Wearables | Not started | Do not invent data adapter | Separate opt-in and approval |
| Q. Coaching Handoffs | Not started | Do not infer a connected professional | Separate data-sharing consent |
| R. Organisation Insights | Partial | Preserve aggregate-only employer lane | Cross-role leakage tests |

Source status descriptions are a point-in-time register and MUST be revalidated at live call sites. Do not reclassify built-but-offline as live solely because code exists.

## Translation coverage work queue

1. **Consent and privacy first**: translated onboarding privacy notices, memory/learning/reminder consent and accessible labels (10 new keys, 12 catalogues, committed to this integration branch); all non-English language packs remain machine drafts.
2. Safety and crisis navigation, emergency labels and non-clinical disclaimers: human-review gate before production.
3. Web landing/auth, remaining onboarding pathway and help text: preserve underlying stable values (e.g. `profile.primaryDrain`, `profile.pathway`) while localising display strings.
4. Burnout Fingerprint questionnaire and explanations, all recovery tool screens.
5. Reports/PDF, subscription, Privacy Centre, server explanations/errors, emails/notifications.
6. Native tab bar, account/security screens, Expo recovery routes and large-text/RTL layout.

## Reconciliation protocol

- Begin from the multilingual branch in an isolated working branch (already created).
- Identify each `main`-only NHEI addition; bring over isolated pure helpers/tests first where dependencies exist.
- Merge behaviour, not entire versions of shared hot files; manually reconcile `server.ts`, `src/App.tsx`, `firestore.rules`, privacy screens and Nova memory cache after reviewing **both** versions.
- Keep two levels of proof: source inspection (available via GitHub) versus executed tests/staging (not yet available in this connector-only environment).
- Test `npm ci --legacy-peer-deps`, lint, full web build, unit/component suites, emulator, Expo build/Jest and staging user journeys. No GitHub Actions or deployment.
- Required journeys: fresh opt-out, opt-in and withdrawal; memory review/correction/deletion; low-capacity Floor Mode; direct request vs learned suggestion; edit/forget feedback; cross-account switch; device language vs saved locale; RTL/mobile/screen reader; recovery handoff to Nova; offline failure.
- Do not update `main` until the combined branch's diff is reviewed and all executable release checks pass.

## Human and infrastructure gates

Human native-speaker validation for all 11 drafts (especially safety), safeguarding and knowledge approval for gated NHEI modes, physical-device accessibility verification, staging auth/App Check, Firebase rules/index deployment authorisation and controlled production release remain outstanding. This document does not call them completed.
