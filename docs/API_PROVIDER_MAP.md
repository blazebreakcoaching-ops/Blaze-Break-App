# API Provider Map

Every external provider Blaze Break's running application actually calls.
(Claude.ai — the tool used to develop this codebase — is not a runtime
dependency of the app and is deliberately not listed here.)

| Provider | Purpose | Feature(s) | Billing basis | Server/client | Secret | Free usage | Premium usage | Fallback | Kill switch | Cost driver |
|---|---|---|---|---|---|---|---|---|---|---|
| **Gemini (Developer API)** | Nova's AI | Chat, diagnose narrative, speech, voice-journal, one-less-thing, Live voice | Per-token (text) / per-minute (Live) | Server-only | `GEMINI_API_KEY` | Capability-quota'd (see FREE_PREMIUM_ENTITLEMENTS.md) | Capability-quota'd (generous) | Diagnose falls back to static text; chat/voice have none (core feature) | Unsetting the key disables all Gemini features at once; `NOVA_LIVE_VOICE_ENABLED` disables Live voice specifically | Highest - Live voice per-minute, chat per-token |
| **Vertex AI** | Alternate Nova chat provider | `/api/nova/chat` when `NOVA_CHAT_PROVIDER=vertex` | Per-token | Server-only | ADC (service account) | n/a - alt path | n/a - alt path | Falls back to Gemini Developer API path | `NOVA_CHAT_PROVIDER` env var | Same order as Gemini text |
| **Anthropic (Claude)** | Alternate Nova chat provider | `/api/nova/chat` when `NOVA_CHAT_PROVIDER=claude` | Per-token | Server-only | `ANTHROPIC_API_KEY` | n/a - alt path | n/a - alt path | Falls back to Gemini Developer API path | `NOVA_CHAT_PROVIDER` env var | Same order as Gemini text |
| **OpenAI** | None - configured, unused | n/a | n/a | Server-only (client initialised, never called) | `OPENAI_API_KEY` | n/a | n/a | n/a | n/a | None - not a live cost driver |
| **Firebase (Auth, Firestore, App Check)** | Core platform | Auth, all data storage, bot/abuse protection | Per-operation (reads/writes/storage) | Both (client SDK for reads user owns; Admin SDK server-side) | ADC | Full | Full | None - core dependency | n/a | Read/write volume - see AI_COST_CONTROL.md's context-bounding fix |
| **Web Push (VAPID)** | Push notifications | Stale check-in / low recovery score nudges, routed via NotificationRouter | Free (no per-message provider cost) | Server-only (sends), client (subscribes) | VAPID key pair (env) | Full | Full | Falls back to no notification (never SMS automatically) | n/a - free, no cost-driven kill switch needed | None (free channel) |
| **Twilio** | SMS/WhatsApp | Guardian alerts (safety), ally accountability nudges (opt-in), manual send | Per-message-segment | Server-only | `TWILIO_ACCOUNT_SID`/`TWILIO_AUTH_TOKEN`/`TWILIO_PHONE_NUMBER` | Guardian: full (safety-exempt from cost caps). Nudge/manual: capped, see NOTIFICATION_ARCHITECTURE.md | Same caps as Free (SMS caps aren't tier-differentiated - a cost/abuse ceiling, not a feature) | None for guardian (safety-critical); nudge/manual have no fallback channel today (push doesn't reach a phone number, only an app subscription) | `SMS_ENABLED` (global), `SMS_MANUAL_SEND_ENABLED` (category), `NUDGE_SCHEDULER_ENABLED` (defaults off) | Second-highest after Live voice - see sms-guardrails.ts |
| **Brevo** | Transactional email | Support/deletion request emails, org invites, Recovery Ally invites | Per-email (generous free tier) | Server-only | `BREVO_API_KEY` | Full | Full | None currently (low volume, non-critical path) | n/a | Low |
| **Stripe** | Consumer web billing | **Not implemented** - see FREE_PREMIUM_ENTITLEMENTS.md | Subscription | n/a | n/a | n/a | n/a | `NullEntitlementProvider` | n/a | n/a until built |
| **Apple App Store** | Consumer iOS billing | **Not implemented** | Subscription | n/a | n/a | n/a | n/a | `NullEntitlementProvider` | n/a | n/a until built |
| **Google Play** | Consumer Android billing | **Not implemented** | Subscription | n/a | n/a | n/a | n/a | `NullEntitlementProvider` | n/a | n/a until built |
| **Slack/Jira/Asana/Calendly/Monday.com** | Enterprise integrations | Org-level connectors (unrelated to consumer cost) | OAuth, no direct spend | Server-only | Per-provider client ID/secret | n/a - org feature | n/a - org feature | Per-integration | n/a | None (no per-call cost to Blaze Break) |

## Cost priority (highest risk first)

Matches the hardening brief's own stated order, cross-referenced against
what this pass found and fixed:

1. **Twilio SMS** — was unbounded across ally-nudge/manual categories;
   now capped (`sms-guardrails.ts`), with guardian alerts kept exempt and
   separately protected.
2. **Gemini Live sessions/context growth** — was missing an idle timeout
   and any Live-specific kill switch, and every chat/voice turn re-read a
   user's entire history; both fixed (`docs/AI_COST_CONTROL.md`).
3. **AI abuse/repeated calls** — Nova chat/diagnose/voice-journal now have
   dedicated rate limits and capability quotas, not just the generic
   per-IP limiter.
4. **Unnecessary Firestore reads/polling** — the context-builder fix
   above is the big one; the existing scheduled jobs
   (`processNudgeSchedules`, `runScheduledPulseCheck`) were already
   audited as efficient, targeted collection-group queries, not full
   user-base scans - no change needed there.
5. **Storage/egress** — audited: no Cloud Storage usage exists in this
   codebase at all (voice-journal audio is processed and discarded, never
   persisted), so there is nothing to optimise here today.
6. **Cheap text AI workloads** — already using the fast model tier
   (`gemini-3.5-flash`) for classification-shaped tasks; not a priority
   finding.
