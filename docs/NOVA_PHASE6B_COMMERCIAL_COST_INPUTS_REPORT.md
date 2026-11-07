# Phase 6B — Commercial Cost Inputs Report (developer-only)

Directive §8. This report identifies **which inputs are required** to calculate a
realistic monthly per-customer cost for three commercial-modelling candidate
tiers. It is explicitly **not** a pricing decision, a profitability claim, or
anything approved for a pricing page — see the restriction at the end of this
document.

**Candidate tiers (as named in the directive, not yet implemented anywhere in
this codebase):**

| Candidate tier | Candidate price | Nearest existing internal plan (for modelling only) |
|---|---|---|
| Essential | £5.99/mo | `core` |
| Continuity | £24.99/mo | `performance` |
| Executive | £59.99/mo | `executive` |

That right-hand mapping is **a modelling convenience this report chose**, not
a decision recorded anywhere else in the codebase — `entitlements.ts` has no
`essential`/`continuity` plan id today, only `free`/`core`/`performance`/
`executive`/`legacy_premium`. Treat the mapping as provisional.

## 1. What a realistic monthly cost calculation needs

For each candidate tier, a realistic per-customer monthly cost needs:

1. **Real per-customer usage volume** at that tier (messages/day, voice
   minutes/month, memory operations/month, etc.) — not the quota ceiling,
   which is a maximum, not a typical customer's real behaviour.
2. **Real per-unit provider cost** (USD per message/token/minute/send) at the
   time of billing.
3. **Non-AI operating costs** attributable to that customer (Firebase reads/
   writes, Cloud Function invocations, storage) — currently has no
   per-customer attribution at all (see §11 of the Phase 6A report and the
   "Firebase/cloud operations" row below).
4. **Payment-processing cost** (Stripe or equivalent fees) — `stripe-billing.ts`
   exists but, per `billing-adapter.ts`, the only active provider today is
   `NullEntitlementProvider`: no live payment processor is wired up, so this
   input does not exist yet either.

## 2. Input-by-input status

| Input | Status | Detail |
|---|---|---|
| Nova text messages/customer/month | **Measured usage** (real, but not yet tier-segmented by real paying customers) | `usage_counters`' `nova_text` field, real per-uid daily counts, aggregated by `/api/admin/cost-usage`'s `byTier`. No real paying "Essential/Continuity/Executive" customers exist yet (no live checkout) - today's `byTier` breakdown is only ever across `free`/`core`/`performance`/`executive`/`legacy_premium`, populated by admin-granted plans, not real purchases. |
| Nova text tokens/customer/month | **Measured usage** (new this phase) | `novaTextPromptTokens`/`novaTextOutputTokens`, real Gemini `usageMetadata`, captured by `/api/nova/chat` (server.ts) this phase and surfaced in `/api/admin/cost-usage`'s `measured` field. Still only reflects whatever uids have actually chatted in this environment - not real paying customers. |
| Nova text cost/customer/month | **Estimated cost** | `estimateNovaTextCostFromMeasuredTokens` (cost-estimates.ts) applies `ai-model-price-registry.ts`'s `gemini-3.5-flash` rate to the real measured tokens above. The rate itself is a documented placeholder (see that file's `sourceNote`) never checked against a real Google invoice - genuinely real tokens, estimated price. |
| Nova voice minutes/customer/month | **Measured usage** | `nova_voice_minutes`, real elapsed session duration, the single most precise metering in this app (confirmed in the Phase 6A commercial-observability audit). |
| Nova voice cost/customer/month | **Estimated cost** | `novaVoicePerSession` flat rate (cost-estimates.ts) × session count, OR the new `gemini-3.1-flash-live-preview` per-1k-token placeholder rate in the price registry - both explicitly disclosed as rough; real Gemini Live billing is per-second-of-audio, not reducible to either cleanly. |
| Memory search/write operations/customer/month | **Measured usage** (new this phase) | `novaMemorySearchCount`/`novaMemoryWriteCount`, real counts from `executeNovaTool`'s instrumentation, surfaced in `/api/admin/cost-usage`'s `measured` field. No separate cost estimate exists for these - they currently ride inside the same billed `nova_text` call, so attributing a distinct marginal cost to them specifically would double-count. |
| Agentic-action proposals/customer/month | **Measured usage** (new this phase) | `agenticProposalCount`/`agenticProposalsByTool`, real counts. Zero marginal provider cost today - every one of these tools is propose/offer-only server-side (no real external send), so there is no real spend to attribute beyond the parent chat/voice call that triggered it. |
| Background reasoning calls/customer/month | **Unavailable** | No background job anywhere in this codebase currently calls a paid Gemini model (confirmed by code read this phase) - there is nothing to measure or estimate. If a future background job (e.g. a nudge-generation job) starts calling a model, it needs its own instrumentation before this row can be filled in. |
| Email sends/customer/month | **Unavailable** (not instrumented) | `sendBrevoEmail` (server.ts) has no usage counter, unlike SMS (`allSmsCount`/`categoryCounts`). Would need the same kind of `usage_counters` increment SMS already has before this can be measured. |
| SMS/WhatsApp sends/customer/month | **Measured usage** | `allSmsCount` + `categoryCounts` (guardian_alert/ally_nudge/manual_send), real per-send counts. |
| SMS cost/customer/month | **Estimated cost** | `smsPerSegment` flat rate (cost-estimates.ts), a real Twilio UK list-price figure at the time it was written, not a live Twilio billing read. |
| Firebase/Cloud Function spend/customer/month | **Unavailable** | No Cloud Billing export integration exists; there is no mechanism anywhere in this codebase to attribute Firestore read/write/storage cost or Cloud Function invocation cost to a specific uid. This is a full gap, not a partial one. |
| Payment-processing fees/customer/month | **Unavailable** | No live payment provider is wired up (`NullEntitlementProvider` is the only active `EntitlementProvider` per `billing-adapter.ts`) - there is no real transaction to take a fee from yet. |
| Real customer count per candidate tier | **Assumption needing real customer evidence** | There are no real paying customers on any tier today (no live checkout exists - `stripe-billing.ts` exists but nothing in this codebase currently drives a customer into a specific candidate tier through a real purchase). Any monthly-cost total multiplied by "likely subscriber count" is pure assumption until real signups exist. |
| Real usage DISTRIBUTION within a tier (is a typical Essential customer anywhere near their `core` quota ceiling, or far below it?) | **Assumption needing real customer evidence** | The entitlement quota ceilings (`core`: 300 msgs/day, 60 voice-min/month; `performance`: 600 msgs/day, 240 voice-min/month; `executive`: 1000 msgs/day, 600 voice-min/month - all from `entitlements.ts`'s real `CAPABILITIES` table) are maximums, set as abuse/fair-use ceilings, not predictions of typical real usage. Modelling "realistic monthly cost" on the ceiling, rather than real observed behaviour, would systematically overstate cost per customer - there is no real customer behaviour yet to calibrate against. |

## 3. What this means for the three candidate tiers, concretely

For each candidate tier, a realistic monthly cost figure requires multiplying
a **real observed per-customer usage number** (not yet available — no real
paying customers exist) by the **estimated per-unit rates** above (available,
but explicitly labelled estimates, not live billing data), and then adding
the **unavailable** categories (background reasoning, email, Firebase/cloud
spend, payment fees) once those are instrumented — none of which this report
invents a number for.

A worked "worst-case ceiling" figure (every customer on a tier maxing out
every quota every day) could be computed from the real `CAPABILITIES` limits
and the real price registry today, but it would represent an upper bound on
theoretical cost, not a realistic expected one, and this report deliberately
does **not** produce that figure here — doing so without flagging it as a
ceiling, not an expectation, is exactly the kind of invented-precision this
directive warns against ("Do not invent per-tier profitability").

## 4. Explicit restriction (directive §8)

This report does not, and must not be read to:
- State or imply a per-tier profit margin.
- Recommend that £5.99/£24.99/£59.99 are correct, final, or approved prices.
- Deploy, draft, or link to any customer-facing pricing page.
- Treat the `essential`/`continuity`/`executive` → `core`/`performance`/
  `executive` mapping in §0 as anything other than a modelling convenience
  this report chose for its own internal consistency.

The only thing this report asserts is **which inputs exist, with what
confidence, and which are still missing** — exactly the four-way distinction
(measured / estimated / unavailable / assumption-needing-real-evidence) the
directive asked for.
