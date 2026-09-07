# Guardian Support — Product, Safeguarding, Privacy & Technical Specification

**Status:** Draft for clinical, safeguarding, and legal review
**Scope:** Blaze Break / Nova — Guardian Support capability
**Supersedes:** the "Guardian Alert Auto-Escalation" feature flag (removed; see §E.8 Migration)

---

## Label key

Every requirement in this document carries one of four labels. They are not decorative — nothing labelled **[REVIEW]** may ship without a named, qualified sign-off recorded against it.

| Label | Meaning |
|---|---|
| **[CONFIRMED]** | Agreed requirement. Buildable now. |
| **[ASSUMPTION]** | Stated so it can be challenged. Must be validated before it hardens into a requirement. |
| **[REVIEW]** | Requires qualified review — clinical safety, safeguarding, privacy/legal, or crisis-service expertise. Not an engineering decision. |
| **[OUT OF SCOPE]** | Explicitly excluded from this specification. |

---

## 0. Purpose, and the problem being solved

Guardian Support exists to reduce the friction between *"I need a real person"* and *a pre-chosen trusted person knowing to call.*

It is not an emergency service, not a crisis line, not clinical assessment, and not a monitoring system. It does not decide whether someone is at risk. It makes an action the user already wants to take faster, calmer, and reachable with one tap at the moment it is hardest to do anything at all.

**The design constraint that governs everything below:** the system must never claim a capability it does not have, and must never claim an outcome it has not verified. A user who believes they have a safety net they do not have is worse off than a user who knows exactly what the product does.

---

## 0.1 Non-negotiable safety constraint — no risk scoring **[CONFIRMED]**

This constraint overrides every other section of this document. Where anything below appears to conflict with it, this section wins.

**Nova must not propose, design, infer, display, store, calculate, or rely on any risk score, risk level, risk band, risk probability, confidence score, severity score, danger rating, safety state, or model-derived classification of a user's mental state.**

This covers numeric, categorical, implicit, and proxy forms alike:

- low / medium / high risk; safe / unsafe; green / amber / red
- concern score, distress threshold, crisis confidence
- likelihood of self-harm, suicide probability
- automated "safety failure state"
- model confidence above a defined percentage
- keyword count, sentiment score, or behavioural score used as a trigger
- **inactivity duration used as evidence that a person is in danger**

Nova must not make, imply, or operationalise a clinical or quasi-clinical judgement about a user from their language, silence, behaviour, sentiment, history, or interaction pattern.

**Guardian outreach may be triggered only through deterministic, user-authorised pathways:**

| # | Pathway | Status |
|---|---|---|
| 1 | User taps "Ask my guardian to call me" or equivalent | **Tier 1 — build now** |
| 2 | User explicitly instructs Nova to contact their guardian; Nova shows recipient and message and requires final confirmation | **Tier 2 — build now** |
| 3 | Pre-authorised, user-configured scheduled check-in arrangement | **Tier 3 — research only, out of scope** |

**What Nova may still do.** Responding to what a person actually says is not classification. Nova may offer choices:

- "Would it help to ask someone you trust to call you?"
- "Your Guardian Call Request is ready if you want to send it."
- "Would you like to contact emergency help, a crisis service, or someone you trust?"

**What Nova may never do.** Claim it has detected risk, determined danger, identified intent, or concluded that escalation is required. The system preserves user agency, avoids covert monitoring, and never converts a private disclosure into third-party contact on the basis of an AI judgement.

**Why this is stronger than a review gate.** An earlier draft of this document proposed shadow-mode evaluation of trigger logic with precision/recall measured against clinician judgement. That was wrong and has been removed. A validated classifier is still a classifier: it still converts private disclosure into third-party contact on an inference, and validation changes only how confident we are while being wrong. The constraint is not "get approval before inferring" — it is "do not infer."

---

## A. Product decision — three tiers

### Recommendation summary

| Tier | Capability | Verdict |
|---|---|---|
| **Tier 1** | One-tap, user-initiated guardian call request | **Build now. This is the MVP.** |
| **Tier 2** | Conversational request → explicit confirmation → send | **Build now, immediately after Tier 1.** |
| **Tier 3** | Pre-authorised, user-configured scheduled check-in support | **Out of scope. Research only. Not crisis detection.** |

### Tier 1 — One-tap user-initiated Guardian Call Request **[CONFIRMED]**

The user taps a persistent, clearly-labelled action. Nova sends a pre-approved message to their chosen guardian. No inference, no judgement, no detection.

**Default message template (user-previewable and editable at setup):**

> "[First name] has asked you to call them as soon as you can. This is a support request sent from their Blaze Break app. Please try to contact them directly."

**Why this is the MVP — and why it delivers most of the actual value:**

1. **It solves the stated problem completely.** The lived-experience insight driving this feature is the gap between needing a person and reaching one. Hold music, queues, explaining yourself to a stranger. One tap that makes a trusted person's phone ring closes that gap entirely — without any risk model in between.
2. **It requires no clinical judgement.** The user's own decision is the only input. Nothing is inferred, so nothing can be inferred wrongly. This removes the entire class of false-positive and false-negative harms that inference-based designs create.
3. **It is honest by construction.** The user knows exactly what they did and exactly what was sent. Nova makes no claim about anything it hasn't done.
4. **It is testable, reversible, and observable.** Real delivery states, real audit trail, real failure UX — the foundations any later capability would need anyway, proven under real usage first.
5. **Most of the infrastructure already exists** (see §E.9): a working Twilio integration with rate limiting, App Check, Firebase auth, phone validation, and a `SupportContact` model with a guardian role.

**What Tier 1 deliberately does not do:** it does not monitor, infer, watch, score, or decide. It is a button.

### Tier 2 — Conversational confirmation flow **[CONFIRMED]**

Nova recognises an **explicit, direct request** — "tell my guardian to call me", "can you message Sam", "I need Priya now" — and prepares the alert, showing exactly what will be sent and to whom, then requires one explicit confirmation.

**The hard rule:** Nova may *recognise a request* and *prepare* an alert. It may never send one because of emotional content, distress, sadness, or any inference about the user's state. Recognition is of an **instruction**, not a **condition**.

Rationale: someone in distress may be talking to Nova rather than navigating UI. Meeting them where they are is worth building — but the send is still a deliberate act by the user, one tap away, never a surprise.

### Tier 3 — Pre-authorised scheduled check-in support **[REVIEW — research only, do not build]**

**This is not crisis detection, and must never be described or implemented as such.**

Automatic or inferred escalation — from language, sentiment, self-harm detection, inactivity classification, or any model judgement about wellbeing — is **permanently out of scope** under §0.1. It is not deferred pending approval. It is excluded.

What may be explored later is something categorically different: a **planned communication arrangement** the user configures in advance, in full knowledge of exactly what will happen.

**If the organisation later explores this, it may only take this shape [REVIEW]:**

| Requirement | Detail |
|---|---|
| User-chosen schedule | The user picks the check-in cadence. The system does not propose one based on anything it has observed. |
| User-chosen guardian and message | Both selected and previewed in advance, at configuration time. |
| User-chosen consequence | The user decides whether a missed check-in produces an in-app reminder only, an optional prompt, or a pre-authorised guardian message. |
| Full advance transparency | Before enabling, the user is shown exactly when check-ins are due, what happens if they do not respond, who is contacted, and the exact message text. |
| Revocable at any time | Pause, change, or revoke without friction and without notifying the guardian. |

**Hard limits on any such feature [CONFIRMED]:**

- A missed check-in is **a missed check-in**. It must never be represented — in copy, data model, logs, or guardian message — as proof of danger, a mental-health emergency, self-harm intent, or a "safety failure."
- The guardian message must reflect the arrangement the user set up, not an inferred state. For example: *"[Name] set up a check-in with me and hasn't responded to it. They asked me to let you know if that happened."*
- No wellbeing inference of any kind may inform whether, when, or how the message is sent.
- Missed-check-in status must not be stored or displayed as a risk indicator, band, or score.

**§A.3.1 Review required before any Tier 3 work begins [REVIEW]**

| # | Workstream | Owner | Output |
|---|---|---|---|
| 1 | Is a scheduled check-in arrangement clinically appropriate in a non-clinical consumer product at all? | Clinical safety lead | Written position |
| 2 | Crisis-service practitioner consultation on planned check-ins (not detection) | Clinical safety lead | Practitioner guidance on cadence, wording, and consequence design |
| 3 | Lived-experience research, including people who have experienced unwanted escalation | Product + research | What users want, fear, and would find intrusive |
| 4 | Harm modelling for a missed check-in that was benign (holiday, phone lost, simply busy) | Clinical + product | Documented harm model |
| 5 | Harm modelling for a check-in arrangement that gives false reassurance | Clinical + legal | Signed residual-risk acceptance |
| 6 | UK GDPR analysis: lawful basis, Art. 9 condition, and whether a scheduled arrangement engages Art. 22 | Privacy counsel | Written determination; DPIA addendum |
| 7 | Abuse and adversarial testing: coerced setup, surveillance-by-proxy, retaliation risk | Safeguarding + security | Red-team report |
| 8 | Guardian-side burden and consent: what it means to be on the receiving end of a standing arrangement | Safeguarding lead | Guardian consent position |
| 9 | Independent clinical safety case and hazard log | Clinical safety officer | Approved safety case |
| 10 | Regulatory positioning under UK MHRA | Legal counsel | Written determination |

**[CONFIRMED]** No item above involves building, evaluating, or shadow-testing a classifier, because no classifier may exist. Any proposal that reintroduces inference — however well governed — falls under §0.1 and is rejected without further review.

---

## B. Consent and setup design

### B.1 Setup flow **[CONFIRMED]**

| Step | Screen | Requirement |
|---|---|---|
| 1 | **What this is** | Plain-language explanation of exactly what Guardian Support does and does not do, before any data is entered. Includes explicitly: "This is not an emergency service. Nova cannot guarantee your guardian will see the message or respond." |
| 2 | **Safe contact check** | Shown *before* contact entry, not after. See §B.2. |
| 3 | **Add contact** | Full name; mobile number (E.164, validated); relationship; preferred language; optional backup contact. |
| 4 | **Verify contact** | See §B.3. |
| 5 | **Choose what you authorise** | Three separate, independently-toggled permissions. See §B.4. |
| 6 | **Preview and personalise message** | User sees the exact message text that will be sent, and may edit within constraints (§B.5). |
| 7 | **Confirm consent** | Explicit, unbundled, affirmative action. Records consent version + timestamp (§B.7). |

### B.2 Safe contact check **[CONFIRMED]**

Displayed prominently before contact entry, not buried:

> **Choose someone who is safe for you.**
> Only add a person you trust to respond with care. Please don't add someone who might react badly, put you at risk, or use this against you if they learn you're struggling.
> You can change or remove your guardian at any time, and they will not be told if you do.

That final sentence is a deliberate safeguarding provision: a user in a coercive or controlling relationship must be able to remove a contact without the removal itself becoming a disclosure event. **[CONFIRMED]** No notification is ever sent to a guardian on removal, pause, or edit.

### B.3 Guardian verification and notification **[REVIEW]**

Three options, with a recommendation but a genuine open decision:

| Option | Description | Trade-off |
|---|---|---|
| **A. No prior contact** | Guardian learns of their role only when the first alert arrives. | Maximum user privacy and safety in coercive situations. Guardian is unprepared; may ignore an unexpected SMS from an unknown number. |
| **B. Verification code** | User must enter a code sent to the guardian's phone to confirm the number works. | Proves the number is reachable and correct. Requires the user to have contact with the guardian at setup, which may be impossible or unsafe. |
| **C. Guardian opt-in** | Guardian receives an invitation and must accept. | Guardian is prepared and knows what to expect. Creates a disclosure the user may not want, and a failure mode where a non-responding guardian blocks setup entirely. |

**Recommendation [ASSUMPTION]:** Option B as default (verifies reachability, the most common real-world failure), with an explicit "skip verification" path for users who cannot safely complete it, falling back to Option A. Option C offered but never required.

**[REVIEW]** — Safeguarding lead must decide whether an unverified, unnotified guardian is acceptable, and whether a guardian has any right to be informed they have been designated. There may also be a lawful-basis question in messaging a third party who has not consented to processing (§F.10).

### B.4 Authorised actions — three independent permissions **[CONFIRMED]**

Presented as three separate toggles, never bundled into one "I agree":

1. **"I can send a request for my guardian to call me."** — Tier 1. Default: **on** once a guardian is configured.
2. **"Nova can prepare a request during a conversation, but must ask me to confirm before sending."** — Tier 2. Default: **off**. Opt-in.
3. **"Set up a scheduled check-in with my guardian."** — Tier 3. **Rendered visibly disabled**, with the text: *"Not available yet. This would be a check-in schedule you set up yourself — Nova will never decide on its own that you need help, or contact anyone based on what it thinks about how you're doing."*

**[CONFIRMED]** No option offering automatic, inferred, or detection-based contact may appear in this list in any state — not enabled, not disabled, not "coming soon." Offering it as a future possibility implies the product intends to build it.

**[CONFIRMED]** Option 3's control must be *present and visibly unavailable* rather than hidden. Hiding it invites the assumption that it exists silently; showing it disabled makes the product's limits legible. It must not be enable-able by feature flag alone (§E.7).

### B.5 Message templates **[CONFIRMED]**

- User previews the exact outgoing text at setup and may personalise a bounded portion.
- **Constraints:** the message must always contain (a) the user's first name or chosen identifier, (b) an explicit request to call, (c) the disclosure that it was sent from Blaze Break. These cannot be edited away.
- Templates are **versioned**. The version used is recorded on every alert (§D.7).
- **[REVIEW]** — final default wording, and whether the message may indicate urgency level, requires clinical and safeguarding sign-off. Wording that implies emergency may cause a guardian to call 999 on the user's behalf, which is a significant consequence the user did not choose.

### B.6 Control, withdrawal, and portability **[CONFIRMED]**

| Control | Requirement |
|---|---|
| Edit contact | Immediate, no confirmation delay, no guardian notification |
| Pause | Temporarily disables all sending without deleting configuration |
| Replace | Swap contact without losing alert history |
| Disable entirely | One action, immediate |
| Delete | Removes contact and consent record; alert history retained per §D.9 retention rules with contact details redacted |
| Export | Guardian configuration and alert history included in the existing `/api/user/export` endpoint |

**[CONFIRMED]** All of the above must be reachable within two taps from the Privacy Vault and from the Guardian setup screen.

### B.7 Consent record **[CONFIRMED]**

Every consent action writes an immutable record:

```
consentVersion, consentTextHash, timestamp, userId,
authorisedActions[], contactIds[], templateVersion,
ipCountry (coarse), userAgentClass, withdrawalTimestamp?
```

Stored append-only. A withdrawal creates a new record; it never mutates the original.

### B.8 Re-consent cadence **[REVIEW]**

**[ASSUMPTION]** — Recommendation: re-confirm on **material change** rather than on a fixed calendar interval, plus a lightweight annual review prompt.

Material changes triggering re-confirmation: template wording change, new authorised action added, contact unreachable for N consecutive attempts, or 12 months elapsed.

Rationale: arbitrary short intervals (e.g. 90 days) train users to dismiss consent dialogs, actively degrading consent quality. But a configuration that silently persists for years after the relationship has changed is equally unsafe. **[REVIEW]** — privacy counsel and safeguarding lead should set the final cadence; this is a genuine judgement call between consent freshness and consent fatigue.

---

## C. Crisis conversation UX — exact copy

**Governing rules for all copy below [CONFIRMED]:**

- Never say "I will keep you safe" or any variant.
- Never say "your guardian has been told" before confirmed dispatch.
- Never claim or imply risk assessment ("I can see you're in danger").
- Never use guilt, urgency pressure, or coercion.
- Never present emergency services as the only path.
- Short sentences. Warm. Calm. No exclamation marks.
- The guardian action, where configured, is always one tap and always visible.

---

### C.1 User explicitly asks Nova to message their guardian

> I can send that now.
>
> **To:** Priya (Sister) · +44 7700 900123
> **Message:** "Tourae has asked you to call them as soon as you can. This is a support request sent from their Blaze Break app. Please try to contact them directly."
>
> `[ Send it now ]`  `[ Change something ]`  `[ Not right now ]`

After sending — **only after the provider accepts** (see §D.6 state mapping):

> Sent. Priya has it now.
>
> I can't tell whether she's seen it or when she'll call. If you don't hear back soon, you can send it again or try someone else.
>
> `[ Send again ]`  `[ Other ways to get support ]`

---

### C.2 User says they are overwhelmed, but has not asked for contact

No alert is prepared. No confirmation is pre-loaded. The action is offered, not pushed.

> That sounds really heavy. I'm here.
>
> Do you want to talk it through, or would it help to have someone call you?
>
> `[ Ask Priya to call me ]`  `[ Just talk ]`

**[CONFIRMED]** The guardian button is present but never pre-selected, never emphasised over "just talk", and never re-offered more than once in a conversation unless the user raises it.

---

### C.3 User says they may harm themselves, or are in immediate danger

This is the most carefully constrained copy in the product. Nova offers routes; it does not assess, and it does not act alone.

> I'm really glad you told me.
>
> I'm an app, so I can't be with you the way a person can — but I can help you reach someone right now.
>
> `[ Ask Priya to call me now ]`
> `[ Show me urgent support options ]`
>
> If you're in immediate danger, please call **999**. For urgent mental health support in the UK you can call **NHS 111 and choose option 2**, or **Samaritans on 116 123**, free, any time.
>
> You don't have to do this alone.

**[CONFIRMED]** Even here, the guardian message is not sent without the user's tap.
**[REVIEW]** — this exact wording, the ordering of options, and the resource list require clinical safety and crisis-practitioner sign-off before release. The resource list must also be locale-aware; the numbers above are UK-specific.

---

### C.4 User stops replying after Nova offered guardian contact

**[CONFIRMED]** Silence triggers nothing. No message. No escalation. No timer. No "are you still there?" pressure.

The conversation simply remains open, with the action still available. On return:

> I'm still here whenever you want to pick this up.
>
> `[ Ask Priya to call me ]`

Nova does **not** say "I was worried", "you disappeared", or anything implying it was monitoring. It was not.

---

### C.5 User has not set up a guardian

> I don't have anyone set up to contact for you yet.
>
> If you'd like, you can add someone you trust — then reaching them is one tap, any time.
>
> `[ Set up a trusted contact ]`
>
> Right now, if you need to talk to someone, **Samaritans** are free on **116 123**, any time. If you're in immediate danger, please call **999**.

**[CONFIRMED]** Setup must never be forced mid-crisis. The offer is made once; the crisis resources are given regardless.

---

### C.6 Alert attempt fails

Honesty over reassurance. The user must know the message did **not** go.

> I couldn't get that message through to Priya. That's a problem on my side, not yours.
>
> `[ Try again ]`  `[ Try someone else ]`  `[ Other support options ]`
>
> If you need someone now and this isn't working, please call **Samaritans on 116 123**, or **999** if you're in immediate danger.

**[CONFIRMED]** The word "sent" must not appear anywhere in a failure state.

---

### C.7 Message sent, no response confirmed

> The message reached Priya's phone. I can't tell whether she's read it or when she'll get back to you.
>
> `[ Send again ]`  `[ Try someone else ]`  `[ Other support options ]`

**[CONFIRMED]** "Reached her phone" only if the provider returned `delivered`. If the status is `provider_accepted` but not confirmed delivered, the wording is *"I've sent it — I can't confirm it's arrived yet."* The distinction is not pedantic; it is the difference between a true and a false statement to someone deciding whether to keep waiting.

---

## D. Message delivery specification

### D.1 Endpoint **[CONFIRMED]**

```
POST /api/guardian/alert
```

Middleware chain, matching the existing hardened pattern used by `/api/twilio/send`:

```
guardianAlertLimiter → verifyAppCheck → authenticateFirebaseUser → handler
```

**[CONFIRMED]** The user ID is taken **exclusively** from the verified auth token (`requireAuth(req).uid`). It is never read from the request body, params, or query. A caller may only ever trigger an alert for their own account.

### D.2 Pre-send validation gate **[CONFIRMED]**

Every one of these must pass before anything is queued. Any failure returns a specific, non-generic error:

1. Authenticated user resolves to a real, non-deleted account.
2. An active `GuardianConsent` record exists, not withdrawn, not paused.
3. The consent record authorises the specific trigger source used (`manual_button`, `conversational_confirmed`).
4. The `contactId` belongs to this user and is active.
5. The phone number normalises to valid E.164 (reuse the existing `^\+[1-9]\d{6,14}$` validation).
6. The message template ID and version exist and are approved.
7. Rate limit, cooldown, and deduplication checks pass (§D.3).
8. `guardian_alerts_enabled` feature flag is on for this user (§E.7).

### D.3 Rate limiting, idempotency, cooldown **[CONFIRMED]**

| Control | Value | Rationale |
|---|---|---|
| Idempotency key | Client-generated UUID, required, unique-indexed | Double-tap, retry, or network replay cannot send twice |
| Per-contact cooldown | **[ASSUMPTION]** 10 minutes | Prevents accidental repeat flooding of a guardian |
| Per-user rate limit | **[ASSUMPTION]** 5 alerts / hour, 15 / day | Prevents runaway loops and abuse |
| Cooldown override | User-visible "send again" is permitted during cooldown, with explicit confirmation showing the last send time | A genuine escalating crisis must not be blocked by a cooldown |

**[REVIEW]** — all numeric values above are engineering placeholders, not clinical judgements. A safeguarding lead should set them. The override behaviour in particular is a safety trade-off: too rigid and we block someone who genuinely needs to try again; too loose and we enable harassment of a guardian.

### D.4 Queue and worker **[CONFIRMED]**

- Alert is persisted **before** any provider call. A crash between accept and send must never lose an alert silently.
- Durable job queue; background worker performs the provider call.
- Retry: exponential backoff, max 3 attempts, on transient provider errors only. Never retry on invalid-number or opt-out errors.
- Every attempt writes an `AlertAttempt` row.
- **Dead-letter:** exhausted alerts transition to `failed` and must surface in the user's history and in operational alerting (§D.10).

### D.5 Provider abstraction **[CONFIRMED]**

```ts
interface MessagingProvider {
  send(to: E164, body: string, opts): Promise<ProviderAcceptance>;
  parseStatusWebhook(payload: unknown): DeliveryEvent | null;
  readonly id: 'twilio' | string;
}
```

Twilio is the initial implementation (already integrated, with UK IDTA + SCCs + DPF in place per prior processor review). The abstraction exists so a provider outage or a data-residency requirement does not require rewriting the pipeline.

### D.6 State machine and honest language mapping **[CONFIRMED]**

| State | Meaning | Permitted user-facing language |
|---|---|---|
| `draft` | Prepared, not confirmed | "Ready to send" |
| `confirmation_required` | Awaiting explicit user confirm | "Tap to send" |
| `user_confirmed` | User confirmed, not yet queued | "Sending…" |
| `queued` | Persisted, awaiting worker | "Sending…" |
| `provider_accepted` | Provider accepted for delivery | "I've sent it — I can't confirm it's arrived yet" |
| `delivered` | Provider confirmed handset delivery | "The message reached their phone" |
| `delivery_unknown` | Accepted, no receipt within window | "I've sent it — I can't confirm it arrived" |
| `failed` | Terminal failure | "I couldn't get that message through" |
| `cancelled` | User cancelled | "Cancelled — nothing was sent" |
| `expired` | Unconfirmed draft aged out | (silent; no claim made) |

**[CONFIRMED]** This mapping is the single source of truth for what Nova may say. It is enforced in code, not left to prompt instructions (§E.6).

### D.7 Audit log **[CONFIRMED]**

Append-only, tamper-evident (hash-chained), containing per alert:

```
alertId, userId, contactId (reference, not raw number),
consentVersion, templateId + templateVersion,
triggerSource, userConfirmedAt, confirmationMethod,
providerId, providerMessageId, providerResponseCode,
stateTransitions[] with timestamps, finalState
```

**[CONFIRMED]** The audit log records **that** an alert was sent and under what authority. It must **never** contain the conversation content that preceded it.

### D.8 The deterministic-dispatch rule **[CONFIRMED]**

> **An LLM may recommend or prepare a guardian alert. An LLM may never dispatch one.**

Implementation: Nova's tool surface exposes only `prepare_guardian_alert`, which returns a draft for UI rendering. It has no send capability. Dispatch occurs solely via `POST /api/guardian/alert`, which requires a `userConfirmationToken` issued by the UI when the user taps a real confirmation control. Model output cannot mint that token.

This is the architectural guarantee that no hallucination, prompt injection, or misclassification can cause a message to be sent.

### D.9 Data protection **[CONFIRMED]**

- TLS in transit; encryption at rest.
- Guardian phone numbers encrypted at rest with a separate key; never written to application logs.
- All logging of alert flows redacts message bodies and phone numbers (last 4 digits only where needed for support).
- Secrets in a managed secret store; least-privilege service accounts.
- **Retention [REVIEW]:** alert metadata retained for audit; conversation content never retained as part of an alert record. Final retention period requires privacy counsel — audit/defence needs must be balanced against data minimisation for special-category data.

### D.10 Observability **[CONFIRMED]**

- Metrics: send success rate, provider latency, delivery-confirmation rate, failure rate by cause, cooldown-block rate.
- **Paging alert** on failure-rate breach — a broken guardian pipeline is a safety incident, not a routine bug.
- Synthetic canary send to a test number on a schedule, verifying the whole path end to end.
- User-visible fallback whenever the pipeline is degraded: crisis resources shown, no false "sent" claim.

---

## E. Architecture

### E.1 Components

```
Mobile-first web client
  ├── GuardianSetup            (consent, contacts, templates)
  ├── GuardianQuickAction      (persistent one-tap; crisis UI + Nova surface)
  ├── GuardianConfirmSheet     (renders draft, mints confirmation token)
  └── GuardianHistory          (honest status per §D.6)

Node/TypeScript server
  ├── /api/guardian/*          (consent, contacts, alert, history)
  ├── guardian-policy.ts       (PURE, unit-tested: eligibility, cooldown, state)
  ├── guardian-dispatch.ts     (queue producer; the only send path)
  ├── guardian-worker.ts       (queue consumer; provider calls; retries)
  ├── providers/twilio.ts      (MessagingProvider impl)
  └── /api/webhooks/messaging  (delivery receipts → state transitions)

Nova (LLM)
  └── prepare_guardian_alert   (READ/DRAFT ONLY — cannot dispatch)

Firestore + durable queue + append-only audit store
```

**[CONFIRMED]** `guardian-policy.ts` contains no I/O, following the existing `nova-tools.ts` / `org-risk-trend.ts` pattern in this repo, so every eligibility, cooldown, and state-transition rule is unit-testable without a live Firestore.

### E.2 Data model

```ts
interface TrustedContact {
  id: string;
  userId: string;
  name: string;
  phoneE164: string;            // encrypted at rest
  relationship: string;
  preferredLanguage: string;
  isPrimary: boolean;
  verificationStatus: 'unverified' | 'code_sent' | 'verified' | 'skipped_by_user';
  status: 'active' | 'paused' | 'removed';
  createdAt: string; updatedAt: string;
}

interface GuardianConsent {
  id: string;
  userId: string;
  consentVersion: string;
  consentTextHash: string;
  authorisedActions: ('manual_send' | 'conversational_confirmed')[];
  contactIds: string[];
  templateVersion: string;
  grantedAt: string;
  withdrawnAt?: string;
  supersededBy?: string;        // append-only chain
}

interface GuardianAlert {
  id: string;
  userId: string;
  contactId: string;
  idempotencyKey: string;       // unique index
  state: AlertState;            // see §D.6
  triggerSource: 'manual_button' | 'conversational_confirmed';
  templateId: string; templateVersion: string;
  consentVersionAtSend: string;
  userConfirmedAt: string;
  createdAt: string; updatedAt: string;
}

interface AlertAttempt {
  id: string; alertId: string; attemptNumber: number;
  providerId: string; providerMessageId?: string;
  responseCode?: string; errorClass?: 'transient' | 'permanent';
  attemptedAt: string;
}

interface AlertDeliveryEvent {
  id: string; alertId: string; providerMessageId: string;
  eventType: 'accepted' | 'delivered' | 'undelivered' | 'failed';
  providerTimestamp: string; receivedAt: string;
}

interface SafetyPlan {                        // [REVIEW] — clinical design required
  id: string; userId: string;
  ownWords?: string;                          // user-authored only
  contactIds: string[];
  updatedAt: string;
}

interface MessageTemplate {
  id: string; version: string; locale: string;
  body: string;                               // with {{firstName}} token
  requiredTokens: string[];
  approvedBy: string; approvedAt: string;     // clinical sign-off recorded
  status: 'draft' | 'approved' | 'retired';
}

interface AuditEvent {
  id: string; userId: string;
  eventType: string; subjectId: string;
  payloadHash: string; previousHash: string;  // hash chain
  occurredAt: string;
}

interface FeatureFlag {
  key: string;
  enabled: boolean;
  requiresCapability: string[];               // see §E.7
  copyKey: string;                            // copy bound to flag state
}
```

**Note on `SafetyPlan`:** included in the model for completeness because it was requested, but its content and clinical role is **[REVIEW]**. A safety plan is a recognised clinical instrument; implementing one without clinical design would be exactly the kind of unearned authority this specification rejects. Recommend: MVP stores only user-authored free text and their chosen contacts, with no structure implying clinical validity.

### E.3 API endpoints

```
POST /api/guardian/contacts            → create contact
PATCH /api/guardian/contacts/:id       → edit / pause / remove
POST /api/guardian/contacts/:id/verify → send + check verification code
GET  /api/guardian/consent             → current consent state
POST /api/guardian/consent             → grant / update (append-only)
DELETE /api/guardian/consent           → withdraw
POST /api/guardian/alert               → dispatch (the only send path)
GET  /api/guardian/alerts              → history with honest status
POST /api/webhooks/messaging           → provider delivery receipts
```

**Example — dispatch request:**

```json
POST /api/guardian/alert
{
  "contactId": "tc_8f2a",
  "idempotencyKey": "b3d1c0e4-...",
  "triggerSource": "conversational_confirmed",
  "userConfirmationToken": "uct_9d1f...",
  "templateId": "call_request",
  "templateVersion": "1.2"
}
```

**Success (202):**

```json
{
  "alertId": "ga_44b1",
  "state": "queued",
  "userMessage": "Sending…",
  "contactDisplayName": "Priya",
  "canRetryAfter": "2026-09-05T19:10:00Z"
}
```

**Blocked by consent (403):**

```json
{
  "error": "consent_not_authorised",
  "userMessage": "I don't have permission to message Priya yet. You can turn that on in Guardian settings.",
  "action": { "label": "Open Guardian settings", "route": "/privacy/guardian" }
}
```

**[CONFIRMED]** Every error response carries a `userMessage` written to the §C rules. Nova renders that string; it does not compose its own status language.

### E.4 State machine

```
draft ──► confirmation_required ──► user_confirmed ──► queued
                    │                                    │
                    └──► cancelled                        ▼
                    └──► expired                  provider_accepted
                                                    │      │
                                       ┌────────────┘      └────────────┐
                                       ▼                                ▼
                                  delivered                    delivery_unknown
                                                                        │
                              (any attempt path exhausted) ──────►   failed
```

Terminal: `delivered`, `delivery_unknown`, `failed`, `cancelled`, `expired`.
**[CONFIRMED]** Transitions are enforced in `guardian-policy.ts` as a pure function; illegal transitions throw rather than silently coercing state.

### E.5 Dispatch pipeline pseudocode

```
POST /api/guardian/alert:
  uid = requireAuth(req).uid                    # token only, never body
  assertFeatureEnabled('guardian_alerts', uid)
  assertValidConfirmationToken(body.userConfirmationToken, uid)

  existing = findByIdempotencyKey(body.idempotencyKey, uid)
  if existing: return existing                  # replay-safe, no second send

  consent   = loadActiveConsent(uid)
  contact   = loadContact(body.contactId, uid)
  template  = loadApprovedTemplate(body.templateId, body.templateVersion)

  decision = guardianPolicy.evaluate({          # PURE, unit-tested
    consent, contact, template,
    triggerSource: body.triggerSource,
    recentAlerts: loadRecentAlerts(uid),
    now
  })
  if not decision.allowed:
    return error(decision.code, decision.userMessage)

  alert = persistAlert(state='queued', ...)     # persist BEFORE provider call
  writeAudit('guardian_alert_queued', alert)
  enqueue(alert.id)
  return { alertId, state: 'queued', userMessage: 'Sending…' }

worker(alertId):
  alert = load(alertId)
  body  = render(template, { firstName: user.firstName })
  try:
    acceptance = provider.send(contact.phoneE164, body)
    transition(alert, 'provider_accepted', acceptance.providerMessageId)
  catch e:
    if e.class == 'transient' and attempts < 3: scheduleRetry(backoff)
    else: transition(alert, 'failed', e.code); notifyUserOfFailure(alert)
  finally:
    writeAttempt(alert, ...)
```

### E.6 Conversational routing pseudocode

```
onUserMessage(text, ctx):
  # Nova NEVER classifies risk. It detects an explicit instruction only.
  intent = novaToolCall()      # may return prepare_guardian_alert

  if intent == 'prepare_guardian_alert':
     if not ctx.consent.authorises('conversational_confirmed'):
        return copy('C5_no_guardian_or_not_authorised')
     draft = buildDraft(ctx.user, ctx.contact, approvedTemplate)
     return renderConfirmSheet(draft)          # UI mints confirmation token
                                               # NOTHING IS SENT HERE

  # All other paths: Nova responds conversationally and MAY surface the
  # one-tap action. It may not prepare, queue, or claim any send.
  return novaResponse(text) + maybeOfferGuardianAction(ctx)

# Status language is NEVER model-generated:
statusLine(alert) = STATE_COPY_MAP[alert.state]      # §D.6, enforced in code
```

### E.7 Feature flag strategy **[CONFIRMED]**

The previous failure — copy promising a capability the code did not have — must be structurally impossible, not merely avoided by care.

1. **Copy is bound to flag state.** Each flag declares a `copyKey`; the UI cannot render capability-claiming copy that is not owned by an enabled flag.
2. **Capability preconditions.** A flag declares `requiresCapability: ['guardian_dispatch_pipeline']`. The server refuses to report a flag as enabled if the named capability is not registered at boot. A flag cannot be switched on for a feature that does not exist.
3. **No inference path can be flag-enabled, because none exists.** There is no classifier, scorer, or detector in the codebase to gate. The CI check in item 4 additionally fails the build if any module imports or defines wellbeing-classification logic in the guardian path.
4. **CI check.** A test asserts that every user-facing string claiming an action ("we will contact", "automatically notify") is reachable only under a flag whose capability is registered. This test fails the build otherwise.

### E.8 Migration from "Guardian Check-In Suggestions"

| Step | Action | Label |
|---|---|---|
| 1 | Ship Tier 1 behind `guardian_alerts` flag, default off | **[CONFIRMED]** |
| 2 | Internal + canary testing with real numbers, non-production accounts | **[CONFIRMED]** |
| 3 | Enable Tier 1; update Guardian settings copy to describe the real capability | **[CONFIRMED]** |
| 4 | Ship Tier 2 behind `guardian_conversational` flag, default off, opt-in per user | **[CONFIRMED]** |
| 5 | Retire the "Check-In Suggestions" framing once Tier 1+2 are live; the Nova memory note is rewritten to describe real capability | **[CONFIRMED]** |
| 6 | Tier 3 (scheduled check-in) remains visibly disabled with honest copy; no inference capability is built at any point | **[CONFIRMED]** |

**[CONFIRMED]** At no point may the Tier 3 toggle become enable-able as a side effect of steps 1–5, and at no point may any step introduce wellbeing classification.

### E.9 What already exists in this codebase

Genuinely reusable, verified present:

| Asset | Location | Reuse |
|---|---|---|
| Twilio send integration | `server.ts` `/api/twilio/send` | Basis for `providers/twilio.ts` |
| SMS rate limiter | `server.ts` `smsLimiter` | Pattern for `guardianAlertLimiter` |
| App Check + Firebase auth chain | `verifyAppCheck`, `authenticateFirebaseUser` | Applied unchanged |
| Guardian contact model | `SupportContact` in `types.ts` | Extend → `TrustedContact` |
| E.164 validation | `NovaGuardianRelay.tsx` | Move to `guardian-policy.ts` |
| Manual per-contact alert send | `NovaGuardianRelay.tsx` `sendRealAlert` | Foundation for Tier 1 |
| Pure-logic + unit-test pattern | `nova-tools.ts`, `org-risk-trend.ts` | Model for `guardian-policy.ts` |
| Field-validated Firestore rules | `firestore.rules` | Model for new collections |
| CI enforcement | `.github/workflows/ci.yml` | Hosts the §E.7 copy-safety test |

**[CONFIRMED]** The `autoAlertEnabled` field currently present on `SupportContact` is vestigial — always written `false`, never read. It must be **removed**, not repurposed, so no future reader mistakes it for a live automatic-escalation switch.

### E.10 Test plan

| Layer | Coverage |
|---|---|
| **Unit** | `guardian-policy.ts`: consent gating, cooldown, rate limits, every legal and illegal state transition, template token enforcement |
| **Integration** | Full dispatch path with mocked provider: accept, transient failure + retry, permanent failure, webhook state transitions, idempotency replay |
| **End-to-end** | Setup → consent → one-tap send → status display; conversational request → confirm → send; cancel path; failure path |
| **Accessibility** | Quick action reachable by keyboard and screen reader; confirm sheet has focus trap, `role="dialog"`, Escape; status changes announced via `aria-live`; targets ≥44px; usable one-handed and at 200% zoom |
| **Load** | Provider latency/outage under concurrent sends; queue drain behaviour |
| **Security** | Cannot send for another `uid`; confirmation token cannot be forged or replayed; webhook signature verification; rate-limit bypass attempts |
| **Privacy** | No message body or phone number in logs; export includes guardian data; deletion removes contacts and consent; audit contains no conversation content |
| **Failure-mode** | Provider down, queue down, DB write fails post-accept, webhook never arrives, crash between persist and send |
| **Red-team** | Prompt injection attempting dispatch; model asked to claim a send it did not make; compromised session triggering alerts; coerced setup; alert flooding |

**[CONFIRMED]** The red-team suite must include an explicit adversarial test that Nova cannot be induced to state "I've contacted your guardian" when no alert exists in a sent state.

---

## F. Clinical and safeguarding governance checklist

Every item requires a **named owner** and a **recorded decision** before launch.

| # | Decision | Owner | Label |
|---|---|---|---|
| 1 | Intended user population; minimum age; exclusion criteria | Clinical safety lead | **[REVIEW]** |
| 2 | Under-18 policy: permitted, blocked, or different flow with parental considerations | Safeguarding + legal | **[REVIEW]** |
| 3 | Explicit "what this does / does not do" statement for terms, onboarding, and consent screen | Clinical + legal | **[REVIEW]** |
| 4 | Guardian suitability guidance and relationship-risk framing (§B.2 wording) | Safeguarding lead | **[REVIEW]** |
| 5 | Whether guardians must consent to receiving alerts; lawful basis for messaging them | Privacy counsel | **[REVIEW]** |
| 6 | Capacity and consent-quality: is consent given during distress valid, and does setup need to be blocked mid-crisis? | Clinical + legal | **[REVIEW]** |
| 7 | Final crisis copy (§C.1–C.7) and resource list, locale-aware | Clinical + crisis practitioner | **[REVIEW]** |
| 8 | Guardian message wording and its disclaimer | Clinical + legal | **[REVIEW]** |
| 9 | Escalation boundary: what Nova does when a user indicates immediate danger | Clinical safety lead | **[REVIEW]** |
| 10 | Adverse-event process: definition, reporting route, timeline, review | Clinical safety officer | **[REVIEW]** |
| 11 | Support and complaints pathway for users **and guardians** | Product + support | **[REVIEW]** |
| 12 | Clinical safety case and hazard log (DCB0129-aligned) | Clinical safety officer | **[REVIEW]** |
| 13 | Human-factors review: distressed, dissociated, impaired, offline, low battery, unable to type | Clinical + design | **[REVIEW]** |
| 14 | UK GDPR: lawful basis, Art. 9 condition, explicit-consent requirement, Art. 22 analysis, DPIA | Privacy counsel | **[REVIEW]** |
| 15 | Cross-border transfer position for messaging provider | Privacy counsel | **[REVIEW]** |
| 16 | Retention periods for alerts, audit, and consent records | Privacy counsel | **[REVIEW]** |
| 17 | Sign-off that no risk scoring, classification, or inferred safety state exists anywhere in the guardian path (§0.1) | Eng lead + clinical lead | **[CONFIRMED]** |

### F.9 Tier 3 release gate **[REVIEW]**

Tier 3 (scheduled check-in support only — never inference) may not ship until **all** of: §A.3.1 items 1–10 complete; hazard log closed with residual risk accepted in writing; DPIA addendum approved; independent clinical safety case signed; red-team report closed; lived-experience panel review completed; and a documented, tested kill-switch with defined activation criteria.

**[CONFIRMED]** This gate does not apply to inference-based escalation, which has no gate because it is excluded outright under §0.1.

### F.10 Standing recommendation **[CONFIRMED]**

Obtain qualified UK legal advice and named clinical-safety supervision **before** enabling any automated escalation, and **before** messaging guardians who have not themselves consented to processing. This is not a formality; both are live legal questions, not engineering ones.

### F.11 Human-factors requirements **[CONFIRMED]**

- The one-tap action must work with **no typing**.
- It must be reachable in **one tap from the crisis UI** and one tap from Nova.
- It must render and function on a **slow or intermittent connection**, queueing locally and syncing.
- It must be **legible and operable one-handed**, at large text sizes, in dark mode.
- A user who is dissociated or cognitively impaired must not be required to read a long screen to act.

---

## G. Hazard analysis

Severity: 1 (negligible) – 5 (catastrophic). Likelihood: 1 (remote) – 5 (frequent). Both are **[ASSUMPTION]** pending clinical review.

| # | Hazard | Who is harmed | Failure mode | Sev | Lik | Mitigation | Residual | Owner | Evidence needed |
|---|---|---|---|---|---|---|---|---|---|
| 1 | False-positive guardian contact | User; guardian; relationship | Alert sent when user did not want it | 4 | 1 | No inferred sends anywhere in the product (§0.1); explicit confirmation required; deterministic dispatch (§D.8) | Low — the inference class of this hazard is designed out, not mitigated | Clinical lead | Confirmation-path E2E evidence |
| 2 | False negative — no alert in genuine crisis | User | User unable to act; nothing sent | 5 | 3 | Product does not claim to detect; crisis resources always shown; one-tap kept maximally reachable | **Accepted, documented** | Clinical lead | Written residual-risk acceptance |
| 3 | Guardian is abusive, coercive, or unsafe | User | Alert discloses distress to a dangerous person | 5 | 2 | Safe-contact check before entry (§B.2); silent removal; no guardian notification on change | Medium | Safeguarding lead | Safeguarding review of setup flow |
| 4 | Guardian unavailable or ignores message | User | No human response; user believes help is coming | 4 | 4 | Honest status copy (§C.7); backup contact; alternative resources always offered | Medium | Product | Copy validated with users |
| 5 | Wrong or mistyped number | Uninvolved third party; user | Distress disclosed to a stranger; no help arrives | 4 | 3 | E.164 validation; verification code (§B.3); preview before first send | Medium | Eng lead | Verification completion-rate data |
| 6 | Shared or compromised guardian phone | User | Unintended disclosure | 4 | 2 | Minimal-content message; no clinical detail in SMS | Medium | Safeguarding lead | Message-content review |
| 7 | Delivery failure | User | User believes help was requested when it wasn't | 5 | 2 | Explicit `failed` state; failure copy never says "sent" (§C.6); paging alert (§D.10) | Low | Eng lead | Failure-path E2E test evidence |
| 8 | LLM hallucinates alert status | User | User told help is coming when it isn't | 5 | 3 | Status strings code-owned, never model-generated (§D.6, §E.6); red-team test | Low | Eng lead | Passing red-team suite |
| 9 | Duplicate / repeated alerts | Guardian; user | Guardian flooded; relationship damaged | 3 | 3 | Idempotency key; per-contact cooldown; per-user rate limit (§D.3) | Low | Eng lead | Integration test evidence |
| 10 | User changes their mind mid-flow | User | Unwanted send | 3 | 3 | Cancel available until `queued`; `cancelled` state; no send without confirmation token | Low | Product | E2E cancel-path test |
| 11 | Data breach of mental-health disclosures | User | Severe privacy harm; potential real-world consequences | 5 | 2 | Encryption at rest/in transit; separate key for numbers; log redaction; least privilege; audit excludes conversation content | Medium | Security + privacy | Pen-test report; DPIA |
| 12 | Under-18 use | Minor; guardians | Consent validity; safeguarding duties unmet | 5 | 3 | Age policy required before launch | **Unresolved** | Safeguarding + legal | Item F.2 decision |
| 13 | Cross-border messaging / data transfer | User | Unlawful transfer of special-category data | 3 | 2 | Twilio UK IDTA + SCCs + DPF confirmed; provider abstraction allows regional change | Low | Privacy counsel | Transfer assessment on file |
| 14 | Over-reliance on Nova instead of emergency care | User | Delay in accessing appropriate care | 5 | 3 | Explicit non-emergency framing at setup and in crisis copy; emergency options always present | Medium | Clinical lead | Copy comprehension testing |
| 15 | Inactivity treated as evidence of danger | User | Unwanted contact; user stops using the app honestly | 4 | 1 | **Prohibited outright** (§0.1). No inactivity monitoring exists. Any future check-in feature treats a missed check-in as a missed check-in only, never as proof of danger | None | Product | §0.1 compliance sign-off |
| 16 | Malicious actor triggers alerts from compromised account | User; guardian | Harassment; false alarm; loss of trust | 4 | 2 | Auth from token only; App Check; rate limits; full audit; visible user history | Medium | Security | Security test evidence |
| 17 | Alert sent after consent withdrawn | User | Consent violation | 4 | 2 | Consent re-validated at dispatch time, not cached (§D.2) | Low | Eng lead | Integration test evidence |
| 18 | Guardian receives alert with no context and calls 999 | User | Unwanted emergency response; loss of autonomy | 4 | 3 | Message wording avoids emergency framing **[REVIEW]** | Medium | Clinical lead | Item F.8 decision |

---

## H. MVP recommendation

**Build Tier 1 and Tier 2. Do not build any form of inferred escalation, ever.**

| Decision | Recommendation |
|---|---|
| One-tap user-initiated guardian call request | **Ship.** Prominent in the crisis UI and directly inside Nova conversations. |
| Conversational request with explicit confirmation | **Ship**, immediately after Tier 1, opt-in per user. |
| Silent, automatic, or language-based guardian alerts | **Excluded permanently** under §0.1. Not deferred — there is no approval path that makes this acceptable. |
| Inactivity or silence as evidence of danger | **Excluded permanently** under §0.1. |
| Any risk score, band, safety state, or wellbeing classification | **Excluded permanently** under §0.1, in numeric, categorical, implicit, and proxy forms alike. |
| Tier 3 (user-configured scheduled check-in) | Research only. Gate visibly disabled until §F.9 is satisfied. This is a planned communication arrangement, not detection. |

**Why this is the right shape, not a hedge:** the value in the story that motivated this feature is not that a system detected something. It is that a trusted person called. Tier 1 delivers that in one tap, today, with no possibility of the system being wrong about someone's state — because it never guesses. Tier 2 makes the same action reachable from inside a conversation, for a person who is talking rather than tapping.

There is a real remaining gap: the case where a user cannot act at all. It would be dishonest to pretend Tier 1 and Tier 2 close it.

But the answer to that gap is not a model guessing. A scheduled check-in the user sets up themselves — knowing exactly when it is due, what happens if they miss it, who gets contacted, and what the message says — closes part of that gap **without any inference at all**, because the user authorised the specific outcome in advance rather than an algorithm deciding it applies to them. That is the only shape worth researching, and it is still subject to full clinical, safeguarding, legal, privacy, security, and lived-experience review before anyone builds it.

**Out of scope for this specification [OUT OF SCOPE]:** clinical risk assessment; any risk score, risk band, danger rating, safety state, or wellbeing classification in any form; any suicide- or self-harm-detection model; sentiment or keyword scoring used as a trigger; inactivity treated as evidence of danger; automated contact with emergency services; location sharing; guardian-side application; and passive sensing of any kind (device usage, movement, sleep, typing).

These are excluded by §0.1, not deferred. No review, approval, or governance process reinstates them.

---

## Appendix — open decisions requiring qualified review

| Ref | Decision | Required reviewer |
|---|---|---|
| §B.3 | Guardian verification and whether guardians must be notified or consent | Safeguarding lead + privacy counsel |
| §B.5 | Final default message wording and urgency framing | Clinical safety lead |
| §B.8 | Re-consent cadence | Privacy counsel + safeguarding lead |
| §C.3 | Immediate-danger copy, option ordering, resource list | Clinical safety lead + crisis practitioner |
| §D.3 | Cooldown, rate limits, and override behaviour | Safeguarding lead |
| §D.9 | Retention periods for alert, audit, and consent data | Privacy counsel |
| §E.2 | `SafetyPlan` clinical design, or decision to exclude | Clinical safety lead |
| §F.2 | Under-18 policy | Safeguarding lead + legal |
| §F.14 | Lawful basis, Art. 9 condition, Art. 22 analysis, DPIA | Privacy counsel |
| §A.3 / §F.9 | Whether a user-configured scheduled check-in is defensible at all | Clinical safety officer (independent) |

---

## Appendix B — Open question: does §0.1 extend to the org wellbeing trend? **[REVIEW]**

Raised for the product owner's decision rather than resolved unilaterally, because the answer is genuinely not mine to assume.

The organisation dashboard contains a feature built separately from Guardian Support: an aggregate **"Wellbeing Concern Trend"**, producing a 0–100 `overallConcern` figure per team, derived from the HSE-aligned climate survey and mood-pulse aggregates.

**The case that §0.1 does not apply:**

- It is **aggregate and k-anonymous**. It never describes an individual, and is suppressed entirely below the org's configured minimum cohort size.
- It **triggers nothing**. No contact, no outreach, no escalation, no intervention. It is a management-information display.
- It is **not a model judgement**. It is transparent arithmetic over answers people voluntarily gave to a survey — no inference about anyone's state from their language, silence, or behaviour.
- It makes **no clinical claim** and is explicitly labelled in the UI as not a prediction.

**The case that it deserves scrutiny anyway:**

- The literal term **"concern score" appears in §0.1's prohibited list.** Even if the underlying mechanism is different in kind, the vocabulary is the one the constraint names.
- Aggregate today does not guarantee aggregate tomorrow. A future request to "drill into which team members are driving this" would convert it into exactly the thing §0.1 forbids, and the existing scaffolding would make that easy.
- Language shapes what gets built next. A product that already displays a "concern level" has normalised the concept.

**Recommendation [ASSUMPTION], for the product owner to accept or reject:**

Keep the feature — it is aggregate, consented, non-triggering, and genuinely useful for the structural staffing decisions it was built for — but:

1. **Rename it** away from "concern" toward what it actually measures, e.g. *"Team Climate Trend"* or *"Working Conditions Trend"*, removing the vocabulary §0.1 prohibits.
2. **Record an explicit architectural decision** that it must never be drilled down to individuals, and that individual-level derivation is prohibited by the same constraint governing Guardian Support.
3. **Add a CI or code-review check** that the org aggregation path never joins to individual identity.

**[REVIEW]** — this is the product owner's call. It is documented here rather than acted on unilaterally, because the constraint is theirs to interpret and the feature was built to a brief that predates it.

---

### Resolution (product owner: accepted, keep-and-rename)

The recommendation above was accepted. As implemented:

1. **Renamed (done).** The UI now reads *"Team Climate Trend"* and *"Strain Level"* everywhere a person sees it (`OrgDashboard.tsx`), and the computation layer uses `Strain` throughout (`org-risk-trend.ts` and its tests: `computeClimateStrain`, `computeMoodStrain`, `computeOverallStrain`). The word "concern" no longer appears in any user-facing string or in the calculation code.

2. **One deliberate exception — the wire format.** The persisted Firestore field names and the JSON API keys still say `moodConcern` / `climateConcern` / `overallConcern` / `teamConcerns`. This is intentional, **not** an incomplete rename: those names are the on-disk schema of every `risk_trend_history` document already written for any org using the dashboard. Renaming them in place would silently break trend continuity (the month-over-month comparison reads prior snapshots by those keys). **Unifying the wire format to "strain" therefore requires a data migration, not a find-and-replace, and is deliberately deferred until someone chooses to do that migration.** Until then: display and compute say *strain*; storage and API say *concern*. Both `server.ts` and `org-risk-trend.ts` carry inline comments stating this so the split is not mistaken for an oversight.

3. **Architectural decision recorded (done).** `computeStrainSnapshotForCohort` in `server.ts` carries an explicit comment that the snapshot is aggregate-only and must never be computed or exposed for an individual, naming the k-anonymity gate in the route handler (which drops any org or team cohort below the configured threshold before a snapshot is ever computed) as the boundary that enforces it. Recommendation 3 (an automated check that the aggregation path never joins to individual identity) is **not yet implemented** and remains open.
