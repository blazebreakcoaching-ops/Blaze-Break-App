# Data inventory

Every category of personal data Blaze Break's actual, shipped codebase
collects, computed from the real Firestore schema, `server.ts` routes,
and the existing engineering docs this builds on (`docs/DATA_POLICY.md`,
`docs/DATA_RETENTION.md`, `docs/VENDOR_REGISTER.md`,
`docs/SECURITY_ARCHITECTURE.md` §9, `docs/PRODUCT_SAFETY_PRIVACY.md`).
This is engineering ground truth, not a legal conclusion — lawful-basis
columns are flagged for review, not asserted.

**Scope note, checked directly against the code before writing anything
below:** there is no live payment processor (Stripe/Apple/Google are all
unbuilt — `docs/STRIPE_PRODUCTS.md`, `docs/MOBILE_SUBSCRIPTIONS.md`), no
third-party analytics/tracking SDK of any kind, and no Cloud Storage
usage (voice is processed in memory and discarded, never persisted —
`docs/API_PROVIDER_MAP.md`). Nothing below invents a category to fill
those gaps.

## How to read this table

- **Reaches AI provider?** — whether this data (or a derived summary of
  it) is ever included in a prompt sent to Gemini/Vertex/Anthropic. See
  `docs/DATA_POLICY.md` for what Blaze Break does and doesn't control
  about a provider's own use of that data once sent.
- **Reaches an organisation?** — whether an org admin/HR viewer/team
  manager can see this data about a specific, named individual. Per
  `docs/PRODUCT_SAFETY_PRIVACY.md` §5, the answer for every wellbeing-
  adjacent category is **No, aggregate-only** — this is Blaze Break's
  core B2B privacy boundary, not a per-category judgement call.
- **User-exportable?** — via `GET /api/user/export`.
- **Erased on account deletion?** — via `POST /api/user/delete-account`,
  which walks every Firestore subcollection under `users/{uid}` plus the
  hand-maintained registry of top-level, `userId`-keyed collections in
  `user-data-collections.ts` (guardrail-tested so a new collection can't
  be silently missed — `docs/SECURITY_ARCHITECTURE.md` §9).
- **Lawful basis** — flagged `LEGAL REVIEW REQUIRED` throughout. This
  document identifies *what* is processed and *why the feature needs
  it*, which is the engineering input a solicitor needs — it does not
  itself decide UK GDPR Art. 6 (or Art. 9, for anything wellbeing-
  related) lawful basis.

## Account & authentication

| Data | Fields | Source | Stored | Purpose | Reaches AI? | Reaches org? | Exportable? | Erased on deletion? |
|---|---|---|---|---|---|---|---|---|
| Identity/auth record | uid, email, displayName, phone (if provided), provider (Google/Microsoft/Facebook/email/anonymous), photoURL | Firebase Authentication (client SDK + `src/lib/auth.tsx`) | Firebase Auth (Google-managed, not Firestore) | Sign-in, account identity | No | No | Partially (email/displayName included in export; Firebase Auth itself has no direct export API — see `LEGAL_REVIEW_REQUIRED.md`) | Firebase Auth user record is deleted as part of account deletion |
| Password (if email/password) | hashed password | Firebase Authentication | Firebase Auth (hashed, not accessible to this app's own code) | Sign-in | No | No | No (never was accessible) | Yes |
| 2FA/TOTP secret | encrypted TOTP secret, recovery codes | `users/{uid}/security/mfa` | Firestore, `MFA_ENCRYPTION_KEY`-encrypted at rest | Account security | No | No | No (a secret, not user content) | Yes |
| MFA session token | short-lived signed token | Server memory / `sessionStorage` | Not persisted server-side beyond the session | Re-auth gate after password/2FA change | No | No | n/a | n/a (ephemeral) |
| Role/entitlement claims | `admin`, `platform_admin`, `platformOwner`, `role` custom claims | Firebase Auth custom claims, `users/{uid}/entitlements/status` | Firebase Auth + Firestore | Access control | No | Org sees only its own members' `authRole`/org role, never wellbeing content | Yes (own record only) | Yes |

## Profile & onboarding

| Data | Fields | Source | Stored | Purpose | Reaches AI? | Reaches org? | Exportable? | Erased on deletion? |
|---|---|---|---|---|---|---|---|---|
| Profile | fullName, role (job title), organization, managerEmail, avatarBase64 | Onboarding, Settings | `users/{uid}/user_stats/core.profile` | Personalisation, Nova context | Yes — role, organization, pathway, purpose, primaryDrain, novaTone, questioningStyle (fullName deliberately excluded — see the `allowOnboardingProfile` Nova context block) | No | Yes | Yes |
| Onboarding answers | pathway, purpose, primaryDrain, novaTone, questioningStyle | `SituationalOnboarding.tsx` | Same doc as Profile above | Personalise Nova's coaching approach from the first session | Yes (durable context block, see above) | No | Yes | Yes |
| Personalisation/consent flags | useNameInGreetings, useLocalTime, timeZone, useGeneralRegion, region, sendNovaNudges, nudgeFrequency, letNovaLearn, consentMatrix | Onboarding consent step | Same doc | Governs what Nova is allowed to use/remember | No (governs, doesn't itself reach AI) | No | Yes | Yes |

## Wellbeing & recovery content — the sensitive core of the product

| Data | Fields | Source | Stored | Purpose | Reaches AI? | Reaches org? | Exportable? | Erased on deletion? |
|---|---|---|---|---|---|---|---|---|
| Burnout Fingerprint (archetype) | archetype, identifiedAt, version, source | Diagnostic assessment | `users/{uid}/recovery/fingerprint` | Personalises tools, feeds Nova | Yes (archetype only, if consented — `allowFingerprint`) | Aggregate-only, never per-person | Yes | Yes |
| Daily check-ins | energyLevel, focusLevel, detachmentLevel, stressLoad, note | `ConnectedDailyCheckIn.tsx` | `users/{uid}/checkins/{id}` | Track state over time | Yes (aggregate counts/scores, if consented — never the free-text note) | Aggregate-only | Yes | Yes |
| Mood pulses | moodLabel, intensity | Pulse check-in | `users/{uid}/mood_pulses/{id}` | Track mood trend | Yes (aggregate, if consented) | Aggregate-only | Yes | Yes |
| Body check-ins | somatic tension signals | `SomaticResetOverlay.tsx` and related | `users/{uid}/body_checkins/{id}` | Nervous-system tracking | Yes (aggregate signal counts, if consented) | Aggregate-only | Yes | Yes |
| GAD-7 anxiety check-in | 7 standard GAD-7 responses, score | `Gad7Check.tsx` | `users/{uid}/gad7_assessments/{id}` | Validated anxiety screening instrument, explicitly non-diagnostic | **No** — confirmed: `scoreGad7`/`interpretGad7` (`gad7.ts`) are pure deterministic functions, no AI call involved anywhere in this route | Aggregate-only | Yes | Yes |
| Energy Budget | commitments, energyDrain, type, status | `EnergyBudget.tsx` | `users/{uid}/energy_commitments/{id}` | Workload/capacity planning | Yes (aggregate totals, if consented) | Aggregate-only | Yes | Yes |
| Recovery Plan / diagnosis action plans | completedIds, allActionIds, committed boundaries, submitted journal text | `RecoveryPlan.tsx`, `DiagnoseSection.tsx` | `users/{uid}/recovery_plan_progress/state`, `users/{uid}/diagnosis_progress/{profile}` | Track progress on a personalised recovery plan | Yes (completion counts only — raw journal/reflection text is explicitly excluded, regression-tested in `nova-context-modules.route.test.ts`) | Aggregate-only | Yes | Yes |
| Stress triggers | text, severity, energyLevel, date | Quick-note trigger log | `users/{uid}/stress_triggers/{id}` | Personal pattern tracking | Yes (count + average severity only, never the text) | Aggregate-only | Yes | Yes |
| Weekly habit cycles / goals | goals, status, category | Weekly Goal Tracker | `users/{uid}/weekly_habit_cycles/{id}`, `users/{uid}/goals/{id}` | Habit tracking | Yes (aggregate counts, if consented) | Aggregate-only | Yes | Yes |
| Boundary Rehearsal scripts | scenarioType, status, rehearsed script text | `BoundaryRehearsal.tsx` | `users/{uid}/boundary_scripts/{id}` | Practice/rehearse boundary conversations | Yes (aggregate scenario/status counts only, never script text) | Aggregate-only | Yes | Yes |
| Recovery Fuel log | skippedBreakfast, hydrationGlasses, etc. | `RecoveryFuelEngine.tsx` | `users/{uid}/recovery_fuel_logs/{id}` | Physiological self-tracking | Yes (aggregate, if consented) | Aggregate-only | Yes | Yes |
| Focus Zone sessions | durationMinutes, completed | `FocusZone.tsx` | `users/{uid}/focus_sessions/{id}` | Focus-session tracking | Yes (aggregate, if consented) | Aggregate-only | Yes | Yes |
| Nervous System Reset sessions | durationSeconds | `NervousSystemReset.tsx` | `users/{uid}/somatic_reset_sessions/{id}` | Somatic-reset usage tracking | Yes (aggregate, if consented) | Aggregate-only | Yes | Yes |
| `AnxietyResetMode` safety level | categorical `safetyLevel` derived from self-reported sliders | `AnxietyResetMode.tsx` | Under the user's own tree | Internal safety signal | No | No — internal platform metric only, never surfaced to an org | Yes | Yes |
| Wins / positive reinforcement log | category, text | `PositiveReinforcementEngine`-adjacent UI | `users/{uid}/wins/{id}` | Motivational tracking | Yes (aggregate category counts) | Aggregate-only | Yes | Yes |
| Derived summaries | recovery_debt, recovery_velocity, energy_trend, mood_trend | Server-computed | `users/{uid}/derived/{summaryId}` | Power Home dashboard + Nova context | Yes (if consented) | Aggregate-only | Yes | Yes |

## Nova conversational AI

| Data | Fields | Source | Stored | Purpose | Reaches AI? | Reaches org? | Exportable? | Erased on deletion? |
|---|---|---|---|---|---|---|---|---|
| Nova chat messages | user message text, Nova's response | `/api/nova/chat` | **Confirmed: not persisted server-side as a transcript.** No chat-history Firestore collection exists anywhere in this codebase — conversation history is held only in the client's own React state for the duration of the session and resent with each turn | Yes — sent live to the AI provider | No | n/a (nothing stored to export) | n/a (nothing stored to erase) |
| Nova Live voice audio | live microphone audio stream | `useNovaLiveVoice.ts`, `/api/nova/live` WebSocket | Not persisted — processed and discarded, per `docs/API_PROVIDER_MAP.md`'s storage audit | Yes — streamed live to Gemini Live | No | n/a (not stored) | n/a (not stored) |
| Nova memories | content, type (`profile`/`trigger`/`state`/`rule`/`preference`), confidence, source, canEdit | `remember_about_user` tool, various feature write-backs | `users/{uid}/nova_memories/{id}` | Personalise future Nova responses | Yes (up to 5 most recent, if consented) | No | Yes (visible/editable in `MemoryCentre.tsx`) | Yes |
| Voice-journal transcript | transcription (full text), themes, analysis, advice, emotionalTone | `DailyVoiceJournal.tsx` → `/api/nova/voice-journal` | **Confirmed: `users/{uid}/voice_journal_entries/{id}`** — a subcollection under the user's own doc, so it's automatically covered by the standard export/`recursiveDelete` path (no separate registration needed) | Yes — full transcription text sent to Gemini for analysis; an excerpt (first ~120 characters) also written into a Nova memory | No | Yes | Yes |
| Resentment analysis input/output | raw venting text (`log`), plus AI-generated `yesMeantNo`/`unclear`/`unappreciated`/`missingBoundary` fields | `ResentmentTracker.tsx` → `/api/nova/resentment-analysis` | **Confirmed: `users/{uid}/resentment_logs/{id}`** — subcollection, same automatic export/deletion coverage as above. **Note: the raw free-text venting itself is stored, not just the AI's structured output** — this is the single most sensitive raw-text collection in the app and deserves explicit mention in the Privacy Notice | Yes — full raw text sent to Gemini | No | Yes | Yes |

## Guardian / trusted-contact support

| Data | Fields | Source | Stored | Purpose | Reaches AI? | Reaches org? | Exportable? | Erased on deletion? |
|---|---|---|---|---|---|---|---|---|
| Support circle contacts | name, phone/email, role, isGuardian | `NovaGuardianRelay.tsx` | `users/{uid}/support_circle/{id}` (validated subcollection; legacy `user_stats/core.supportCircle` array being migrated) | Let the user configure who can be alerted | No | No | Yes | Yes |
| Guardian alert record | recipient, template used, timestamp, idempotency key | `POST /api/guardian/alert` | **Confirmed: `users/{uid}/guardian_alerts/{id}`** — subcollection, automatic export/deletion coverage | No (message is template + first name + category only) | No | Yes | Yes |

## Billing & subscription

| Data | Fields | Source | Stored | Purpose | Reaches AI? | Reaches org? | Exportable? | Erased on deletion? |
|---|---|---|---|---|---|---|---|---|
| Entitlement record | plan (Free/Core/Performance/Executive/Legacy Premium), status, billingSource, cancelAtPeriodEnd | Admin-granted today (no live payment processor — see Scope note above) | `users/{uid}/entitlements/status` | Determine feature access | No | No | Yes | Yes |
| Payment/card details | — | **None collected** — no Stripe/Apple/Google integration exists in this codebase today | n/a | n/a | n/a | n/a | n/a | n/a |
| Usage/metering | monthly Nova Live minutes, SMS counts, etc. | Server-computed | `users/{uid}/usage/*` | Enforce tier caps | No | No | Yes (subcollection, automatic coverage) | Yes |

## Notifications & communications

| Data | Fields | Source | Stored | Purpose | Reaches AI? | Reaches org? | Exportable? | Erased on deletion? |
|---|---|---|---|---|---|---|---|---|
| Phone number | E.164 phone number | Onboarding/Settings, Guardian contact setup | `users/{uid}` tree | SMS delivery (Guardian alerts, nudges) | No | No | Yes | Yes |
| Web Push subscription | browser push endpoint/keys | Browser Push API | `users/{uid}/push_subscriptions/{id}` | Deliver browser notifications | No | No | Yes (subcollection, automatic coverage) | Yes |
| Notification preferences | channel toggles, quiet hours | Settings | Under the user's own tree | Route notifications per user choice | No | No | Yes | Yes |
| Email sent via Brevo | recipient email, email content (password reset, verification, security notices, support/deletion-request replies) | `server.ts` (`sendBrevoHtmlEmail`) | Not stored by Blaze Break beyond the send call; held by Brevo per its own retention | Transactional communication | No | No | n/a (transient) | n/a |
| SMS sent via Twilio | recipient phone number, message text | `server.ts`, `guardian-alert.ts` | Not stored by Blaze Break beyond the guardian_alerts record above; held by Twilio per its own retention | Guardian alerts, opt-in nudges | No | No | n/a (transient) | n/a |

## Organisation / B2B

| Data | Fields | Source | Stored | Purpose | Reaches AI? | Reaches org? | Exportable? | Erased on deletion? |
|---|---|---|---|---|---|---|---|---|
| Organisation membership | orgId, role (owner/admin/security_admin/billing_admin/connector_admin/manager/hr_viewer/member/viewer) | Org invite/provisioning | `organisations/{orgId}/members/{uid}` | Access control for org features | No | By definition, yes — this is the org's own membership record | Yes (own membership record) | Membership record removed; underlying personal wellbeing data is NOT thereby exposed to the org (see `DATA_ROLE_ANALYSIS.md`) |
| Aggregate org analytics | k-anonymity-gated (floor of 3, default threshold 5) risk trend, engagement, participation figures | Server-computed from consenting members' data | `organisations/{orgId}/derived/*` | Employer-facing wellbeing signal, aggregate only | n/a (aggregate output, not raw input to AI beyond `NOVA_MANAGER_COACH_PROMPT`'s pre-aggregated, k-anonymised numbers) | Yes — this is the entire point of this category | Org-level export by org admin (own org only) | Deleted with the org, or per-member contribution removed on that member's account deletion |
| Org data-use policy | allowModelTraining, allowProductAnalytics, allowContentRetentionForDebugging, retentionPeriodDays | Org admin/owner/security_admin setting | `organisations/{orgId}.dataPolicy` | Governs org-level data-use choices — see `docs/DATA_POLICY.md` | n/a | Org's own setting | Org's own audit log | Deleted with the org |
| Org audit log | structured before/after diffs of admin actions | `logOrgAuditAction` | `organisations/{orgId}/audit_logs/{id}` | Accountability trail | No | Yes (org's own log) | Org-level export | Retained per `docs/DATA_RETENTION.md`'s audit-log exception (kept for accountability even after related content is erased) |
| Enterprise integration tokens | OAuth tokens for Slack/Jira/Asana/Calendly/Monday.com | Per-user OAuth connect flow | `users/{uid}/integration_tokens` (per-connecting-user, not org-keyed) | Pull read-only workload signals into aggregate org analytics | No | Only as aggregated, k-anonymity-gated signals | No (a credential, not user content) | Yes |

## Security & operational logs

| Data | Fields | Source | Stored | Purpose | Reaches AI? | Reaches org? | Exportable? | Erased on deletion? |
|---|---|---|---|---|---|---|---|---|
| Personal audit log | login events, security-relevant actions (password change, 2FA enable/disable, failed MFA attempts) | Server middleware | `audit_logs` collection | Accountability, abuse detection | No | No | Yes | **No — deliberately kept** (`eraseOnDeletion: false` in `user-data-collections.ts`) as an accountability trail that must outlive the account it records; exported to the user on request, never erased |
| Rate-limit / abuse signals | IP address (ephemeral, in-memory), request counts | Express rate limiters | Not persisted to Firestore | Abuse prevention | No | No | n/a | n/a |
| IP-velocity sign-in tracking | IP address (sanitised), event timestamps | `beforeSignIn` blocking function | `signin_ip_velocity/{ip}/events/{eventId}` | Credential-stuffing detection | No | No | n/a (not user-content, and fully Firestore-rules-locked, no read path at all) | Not user-keyed — cleared by its own stale-event cleanup, not account deletion |
| Cloud Run / Cloud Logging request logs | request metadata, error stack traces | Google Cloud infrastructure | Google Cloud Logging, per GCP's own retention | Operational debugging | No | No | No | Outside this app's direct control — GCP's own log retention window applies (LEGAL REVIEW REQUIRED / OWNER INPUT REQUIRED: confirm and document the project's configured Cloud Logging retention) |

## Feedback & support

| Data | Fields | Source | Stored | Purpose | Reaches AI? | Reaches org? | Exportable? | Erased on deletion? |
|---|---|---|---|---|---|---|---|---|
| Feedback submissions | category, free-text feedback | `FeedbackForm.tsx` | `feedback_submissions` collection | Product feedback | No | No | Yes (registered in `user-data-collections.ts` after the gap this session's own audit found) | Yes |
| Support/deletion request emails | sender email, message content | Contact/support form, deletion request flow | Routed through Brevo, not separately persisted in Firestore beyond what the sender already has in their own export | Customer support | No | No | n/a (the user already has their own copy) | n/a |

## What is explicitly NOT collected today

- No payment card data (no live payment processor).
- No third-party analytics/tracking cookies (`docs/VENDOR_REGISTER.md` confirms no such SDK exists).
- No persisted voice/audio recordings (Live voice is streamed and discarded).
- No biometric data of any kind (no HRV/heart-rate sensor exists anywhere in this codebase — see `docs/PRODUCT_SAFETY_PRIVACY.md` §2, a previously fabricated claim already corrected).
- No location data beyond a user-entered, optional, coarse "region" string (`useGeneralRegion`/`region` — never device GPS).

## Open items

Every engineering-confirmable question this document originally flagged
(Nova chat transcript persistence, voice-journal/resentment-analysis
persistence, push-subscription/usage/guardian-alert export coverage,
GAD-7's AI reach) was resolved by reading the actual code, not left open
— see the table entries above, each now stating what was found. The one
remaining genuinely open item is **Cloud Run / Cloud Logging's configured
retention window**, which lives in Google Cloud project configuration,
not this repository — see `LEGAL_REVIEW_REQUIRED.md` and
`OWNER_LEGAL_INPUTS.md` for that and every other business/legal decision
this document surfaced but cannot answer itself (lawful basis for each
category, exact retention periods for wellbeing content, whether Firebase
Auth's own record should be described as separately "exportable" given it
has no direct export API of its own).
