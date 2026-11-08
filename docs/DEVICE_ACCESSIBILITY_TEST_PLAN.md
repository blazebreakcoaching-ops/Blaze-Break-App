# Physical-device accessibility test plan (iOS + Android)

Status: **ready to run, not yet run.** No physical device or EAS build was
available in the coding environment. Nothing in this plan has been executed.

## Build
- Development build via EAS (`npx eas-cli@latest build --profile development`), one iPhone and one Android phone.
- Point the build at a **staging** Firebase project with the Batch 6 / PR #157 / #158 Firestore rules deployed there first. Saving a one-question check-in will be refused until those rules are deployed.
- Use synthetic test accounts only. Never use a real customer account.

## Settings to test under
| Setting | iOS | Android |
|---|---|---|
| Screen reader | VoiceOver | TalkBack |
| Largest text | Larger Text, maximum AX size | Font size max + Display size max |
| Reduced motion | Reduce Motion on | Remove animations on |
| Contrast | Increase Contrast | High-contrast text |
| Input | Full Keyboard Access / Switch Control | Switch Access / hardware keyboard |

## Journeys and pass criteria
| # | Journey | Pass when |
|---|---|---|
| 1 | Sign in with email | Fields read as "Email address" / "Password"; an empty submit announces the error; Sign in reads as a button and as busy while signing in |
| 2 | Two-factor challenge | Code field label read; wrong code announced; recovery-code switch and "Cancel and sign out" reachable; nothing behind the challenge is reachable |
| 3 | Pulse welcome | Greeting read as a heading; uses the preferred name only when the setting is on; time of day matches the chosen time zone (test one zone 8+ hours away) |
| 4 | One-question check-in | Choice screen, then 4 options each read with label + hint; a tap announces "Saved. Thank you for checking in."; a double tap saves once (check Firestore); offline shows a spoken error; "Not today" writes nothing; reopening starts at the choice screen |
| 5 | Full check-in | Each slider reads its name and value 0-10 and is adjustable with swipe up/down |
| 6 | Welcome settings (Account) | Every field labelled; invalid time zone explained; change on phone appears on web after reload, and the reverse |
| 7 | Nova chat and voice | New replies are announced; voice call shows and reads the live transcript; voice can be ended without sight |
| 8 | Large text at 320-pt-wide screens | No clipped or overlapping text on Pulse, check-in, Account, sign-in |

## Record per run
Device, OS version, assistive setting, build number, pass/fail per journey, screen recording for any failure. File failures as issues with the journey number.
