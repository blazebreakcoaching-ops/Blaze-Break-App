# Disability inclusion and low-energy check-in — engineering audit (8 Nov 2026)

Scope: repository review of web **ConnectedDailyCheckIn**, Expo **DailyCheckInModal**, Expo Pulse, **SixtySecondCheckIn**, and Firestore rules. This is an initial source audit, **not** a WCAG certification or physical-device test.

## Implemented in this branch
- A one-question alternative in both existing web and native check-in entry points, **without changing the approved Ember visual system**.
- Four plain-English responses; no mandatory text, countdown, gamification, points, AI inference or clinical/numeric score.
- Signed-in-owner-only Firestore `low_energy_checkins` subcollection with strict enum/shape validation, immutable entries and owner-only deletion. No org access.
- Separate from `checkins` and `mood_pulses`; existing reports and analytics cannot silently treat these answers as numeric scores.
- Native VoiceOver/TalkBack labels and large selectable surfaces; web keyboard-operable buttons and visible focus.
- Existing four-slider route preserved. Skipping writes nothing. Save errors are explicit.

## Remaining defects and verification
| Severity | Area | Gap / next action |
|---|---|---|
| P0 | Auth / MFA | Manually verify VoiceOver, TalkBack, screen magnification, software keyboard and focus order on real devices; native 2FA is recently implemented and was not device-verified in this batch |
| P0 | Permission rollout | Deploy new `low_energy_checkins` rules **only with authorised release**; until then new saves will be refused by Firestore. Never claim feature live before this |
| P1 | Check-in feedback | Native screen should announce successful save for screen reader before closing; test real device announcements |
| P1 | Reading order and focus | Audit keyboard tab-order, focus trapping/restoration for all modal dialogs; audit 320px / 200% text |
| P1 | Readability | Test contrast and dynamic text at large OS font sizes across all dark/light Ember surfaces |
| P1 | Nova voice | Ensure captions/transcripts, recording consent and text-only alternatives; remove inaccessible fake progress messages in voice journal |
| P1 | Personalisation | Add opt-in, account-scoped settings for low-energy mode, reduced notifications, slower pacing, text preference; don't store diagnoses |
| P1 | Reports | Verify exported PDFs' semantics, text extraction, headings, contrast and reading order (browser print-to-PDF is not automatically tagged accessible PDF) |
| P1 | Charts | Check that charts have meaningful text equivalents and no colour-only status |
| P1 | Recovery intelligence | Check voice explanations and quantitative trend summaries under screen readers and low-data conditions |
| P2 | Admin / organisation | Audit all forms, tables, filters and error messages using keyboard and assistive technology |
| P2 | Native motor support | Test switch access, hardware keyboard and gesture alternatives |
| P2 | User research | Recruit disabled and neurodivergent beta testers; obtain permission and avoid collecting unnecessary health information |

## Test plan
- Vitest tests validate response vocabulary and explicitly enforce no numeric score mapping.
- Run TypeScript, lint, web and native Jest, Firebase emulator rules suite, Playwright, `npm run verify:integration:offline` in a working checkout.
- Add emulator tests proving cross-user reads/writes fail and malformed responses fail.
- Test accessibility with real VoiceOver, TalkBack, magnification, hardware keyboard, switch control and reduced motion.
- Test save success, denied permission, offline failure, skip, repeated taps, account switch, screen reader status and OS large text.

## Integration and release
- Work is isolated on `feature/accessible-low-energy-checkin-20261108`; do not merge into Claude's moving work branch without comparing heads.
- **Do not report this feature deployed.** Owner approval is required before merging Firestore rules or deploying the app.
- The existing numeric check-in and business intelligence remain unchanged.

## Reconciliation status (Claude, 8 Nov 2026)
Merged with the Batch 6 branch (`claude/funny-wright-0p84gv`); see docs/CTO_CONSOLIDATION_STATUS.md section 11.
| Item | Status |
|---|---|
| Cross-user / malformed-answer emulator tests | DONE: `welcome-and-low-energy-rules.emulator.test.ts` (10 tests, runs in the release gate), incl. the 2FA session gate |
| Duplicate-tap handling | DONE: synchronous guard on web and native, tested |
| Feedback after save | DONE: web role=status confirmation + Done; native AccessibilityInfo announcement; errors are alerts |
| Voice journal fake progress | DONE: replaced by one honest, announced status; typing alternative offered |
| Native welcome / sign-in / check-in on a real device | NOT RUN: see docs/DEVICE_ACCESSIBILITY_TEST_PLAN.md |
| Per-account low-energy mode, slower pacing, reduced-motion override | OPEN: needs an owner decision (new settings); OS reduced-motion is already honoured |
