# Notification Architecture

## Channel priority

```
In-app  →  Push  →  Email  →  SMS (only where explicitly justified)
```

SMS is never the default routine-engagement channel. Twilio UK SMS is
charged per message segment and is materially more expensive than push;
it's reserved for genuine safety escalation (Guardian alerts) and
user-configured ally accountability nudges (opt-in, per-schedule).

## Push, not FCM — a deliberate deviation from the brief

The hardening brief asked for Firebase Cloud Messaging. What actually
exists in this codebase is **standard Web Push** (VAPID keys,
`web-push` npm library, subscriptions at
`users/{uid}/push_subscriptions/{hash}`), already fully wired and working
— `GET /api/push/vapid-public-key`, `POST /api/push/subscribe`,
`POST /api/push/unsubscribe`, consumed today by the stale-check-in/
low-recovery-score push (`runScheduledPulseCheck`).

**There is no native iOS or Android app in this repository** — Blaze
Break is a single web app (PWA-capable) served by the Express server; the
audit found no Capacitor/React Native/native project anywhere. Web Push
already works on Android Chrome, desktop browsers, and iOS 16.4+ for a
PWA installed to the home screen — the same devices/platforms the brief's
"iOS and Android" push requirement is actually about, given there's no
native shell. Migrating a fully working push implementation to FCM would
be a substantial rewrite for no functional gain today, which the
hardening brief's own operating principles explicitly warn against
("do not rewrite working systems unnecessarily"). This was a deliberate
call, not an oversight — see `docs/OUTSTANDING_TASKS.md`: if/when a real
native iOS/Android app is built (Capacitor or otherwise), FCM becomes the
natural push transport for that shell, and this decision should be
revisited then.

## `NotificationRouter` (`notification-router.ts`)

The first centralised notification-decision point in this codebase.
Before this work, each system (the ally-nudge SMS scheduler, the push
pulse-check scheduler, the in-app banner) independently decided
whether/how to notify someone, and — critically — only the in-app banner
actually consulted `users/{uid}/preferences/notifications`
(`notificationsEnabled`, `allowedNudgeCategories`, `nudgeFrequency`,
`quietHoursStart`/`quietHoursEnd`). A person's own quiet-hours and
category choices never applied to push or SMS.

`routeNotification(category, prefs, localHour, sentTodayCount, availability)`
is the pure decision function:

1. **Guardian alerts always bypass every gate** (preferences, quiet
   hours, frequency, daily cap) and prefer SMS, falling back to push.
   This is deliberate: a guardian alert is a safety escalation the person
   themselves just triggered by tapping a button right now, not a routine
   nudge that can wait until morning. See
   `docs/PRODUCT_SAFETY_PRIVACY.md`'s "safety must not be removed to save
   money" principle — the same reasoning applies to convenience/quiet
   hours, not just cost.
2. Every other category checks, in order: `notificationsEnabled` and
   `nudgeFrequency !== 'off'`, an explicit category allow-list (empty list
   = all categories allowed, matching the existing opt-out model), quiet
   hours (handles the overnight-wrap case, e.g. 22→7, correctly), and a
   per-day cap if configured.
3. Channel selection: push if available, else email, else — **only for
   `ally_nudge`** — SMS. Routine categories never silently fall back to
   SMS just because push failed; that's a deliberate reading of "do not
   automatically send SMS just because push failed once."

Wired into `runScheduledPulseCheck` (the push scheduler): each candidate's
notification preferences and timezone (from their profile) are read, the
local hour is resolved via `Intl.DateTimeFormat` (same pattern the
ally-nudge scheduler already used for its own local-time handling), and
the push is skipped entirely if the router says no. The router was **not**
wired into the ally-nudge SMS scheduler in this pass — that scheduler
already has its own explicit per-schedule opt-in (the user configured
exactly this time/day/message when they set it up), which is a stronger
signal than the general preference doc; layering the general quiet-hours
check on top is a reasonable future enhancement, not done here to avoid
changing a schedule's actual configured behavior without a product
decision (see `docs/OUTSTANDING_TASKS.md`).

## SMS guardrails (`sms-guardrails.ts`)

Every Twilio send in this codebase goes through one function
(`sendTwilioMessage` in `server.ts`), tagged with a category:
`guardian_alert`, `ally_nudge`, or `manual_send`.

- **Per-user aggregate cap**: 20/day, 150/month, shared across
  `ally_nudge` and `manual_send`. **`guardian_alert` is exempt from this
  cap** — it already has its own tighter, dedicated limits
  (`guardianAlertLimiter`: 5/hour, plus a 15/day cap and per-contact
  cooldown enforced in-handler) because it's a safety feature, not a
  cost-optimisation target. A shared cost cap must never be able to
  silently swallow a real crisis alert because someone also used up their
  nudge/manual-send quota that day.
- **Segment/encoding estimation**: `estimateSmsSegments()` flags whether a
  message is GSM-7 (160 chars/segment) or has dropped to UCS-2 (70
  chars/segment, e.g. from emoji) and how many segments it will actually
  cost — an estimate, not a byte-exact reproduction of Twilio's own
  encoding detection, logged alongside every send for later cost review.
- **Kill switches**: `SMS_ENABLED` (global — also stops guardian alerts;
  this is for genuine provider incidents/outages, not routine cost
  management, per "never disable genuine safety systems to save money")
  and `SMS_MANUAL_SEND_ENABLED` (category-specific, `/api/twilio/send`
  only). The ally-nudge scheduler already has its own dedicated kill
  switch from earlier work, `NUDGE_SCHEDULER_ENABLED` (defaults **off** —
  the only switch in this codebase that defaults off on purpose, since
  unattended recurring messaging has no standing governance approval to
  be on by default). All three follow the same default-on-unless-exactly-
  `'false'` polarity as every other kill switch in this codebase, except
  the nudge scheduler's deliberately-inverted one.
- **Deduplication**: unchanged from earlier work — the guardian alert
  route has idempotency-key-as-document-ID protection; the ally-nudge
  scheduler's `lastSentPeriod` check guards same-day duplicate sends
  (acknowledged in its own comments as guarding midnight-boundary
  duplication specifically, not full concurrent-instance locking — a
  known, documented, accepted gap, not new to this pass).

## Email (Brevo)

Unchanged in this pass — already used appropriately for transactional
mail only (support/deletion requests, org invites, Recovery Ally
invites), never for anything SMS-shaped. No batching/suppression-list
infrastructure exists for marketing email because no marketing email is
sent; if that changes, it needs its own consent/unsubscribe work (see
`docs/OUTSTANDING_TASKS.md`).

## Phone auth / SMS OTP

Audited and confirmed absent: authentication is entirely client-side
Firebase Auth (Google sign-in, anonymous), no `PhoneAuthProvider` anywhere
in the codebase. No SMS-pumping/OTP-abuse exposure exists because there's
no SMS-based auth to abuse.
