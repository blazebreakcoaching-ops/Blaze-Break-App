# Data role analysis — controller / processor by processing activity

**This document does not conclude UK GDPR controller/processor status.**
Every row ends in a `LEGAL REVIEW REQUIRED` note because that
determination is a legal one — Art. 4(7)/4(8) "controller"/"processor"
turns on who decides the *purposes and means* of processing, which is a
fact-specific legal judgement, not something engineering can certify.
What this document provides is the accurate *processing-activity map* a
solicitor needs to make that call, split by activity rather than treated
as one blanket answer — because, per this document's own instructions,
"employer = controller, Blaze Break = processor" is not automatically
true for everything Blaze Break does.

Each row: what happens, who decides why it happens, and the likely
starting position for legal review — never stated as a final answer.

## B2C — no organisation involved at all

| Activity | Who decides purpose/means | Likely position | Notes |
|---|---|---|---|
| Individual consumer signs up, uses Blaze Break directly (no employer sponsorship) | Blaze Break decides what the product does, how it processes wellbeing data, what Nova does with it | **Blaze Break: likely controller** for this processing | Standard consumer-service pattern. LEGAL REVIEW REQUIRED to confirm no nuance changes this. |
| Nova AI processing (Gemini/Vertex/Claude) of consumer content | Blaze Break decides to send it, the provider processes it per its own terms | **Blaze Break: likely controller. AI provider: likely processor** (or the provider's own published role, which may differ — Google/Anthropic each publish their own controller/processor positions for API usage) | LEGAL REVIEW REQUIRED — confirm against each provider's actual, current data-processing terms rather than assuming the generic SaaS pattern; `docs/DATA_POLICY.md` already flags that Blaze Break has no technical control over post-request provider behaviour. |
| Brevo (transactional email), Twilio (SMS) | Blaze Break decides what to send and to whom; the vendor sends it per Blaze Break's instruction | **Blaze Break: likely controller. Vendor: likely processor** | Standard "process this on my instruction" pattern — the classic processor shape. LEGAL REVIEW REQUIRED to confirm a DPA is in place with each (see `SUBPROCESSOR_REGISTER.md`). |
| Firebase/Google Cloud (hosting, Firestore, Auth, App Check) | Blaze Break decides what's stored and why; Google provides infrastructure per Blaze Break's configuration | **Blaze Break: likely controller. Google Cloud: likely processor** (under Google Cloud's standard Data Processing Terms) | LEGAL REVIEW REQUIRED — confirm Google Cloud's DPA is accepted for this project (usually a standard click-through, but must be confirmed, not assumed — see `OWNER_LEGAL_INPUTS.md`). |

## B2B — organisation-sponsored access

This is the split the spec explicitly calls for — **not** one blanket
answer for every organisation-related activity.

| Activity | Who decides purpose/means | Likely position | Notes |
|---|---|---|---|
| Organisation provides an employee's email address for licence provisioning | The organisation decides who gets a licence and why (an HR/business decision) | **Organisation: likely controller** for the provisioning act itself. **Blaze Break: likely processor**, acting on the org's instruction to create the account | This is the one activity where the spec's default assumption ("employer=controller") is likely to actually hold — but still LEGAL REVIEW REQUIRED, since even here the precise scope matters (the instruction is "create this licence," not "control everything this person subsequently does with it"). |
| Employee privately engages with Blaze Break/Nova after their account exists (check-ins, journals, Nova conversations, Energy Budget, recovery plans) | **Blaze Break decides independently how its wellbeing/coaching service operates** — the organisation has no input into, and per `docs/PRODUCT_SAFETY_PRIVACY.md` §5 has no visibility into, this processing at all | **Blaze Break: likely controller** for this specific processing, independent of the organisation, **not** the organisation acting through Blaze Break as its processor | This is the spec's key distinction, and it is real and enforced in code — the employer genuinely cannot decide the purposes or means of an individual's private coaching use, because the employer cannot even see it happening. LEGAL REVIEW REQUIRED to confirm this reasoning holds and to consider whether **joint controllership** is a better fit for any part of this (e.g. if the org's own terms with its employees create obligations here) — flagged, not resolved, by this document. |
| Aggregate org-analytics computation (k-anonymity-gated risk trend, participation, engagement figures) | Blaze Break decides the aggregation methodology and the k-anonymity threshold mechanism; the organisation decides to view the output and, within limits, the display threshold configuration | **Possible joint controller** scenario — Blaze Break controls how the aggregate is computed and protected; the organisation controls what it does with the resulting aggregate figure | LEGAL REVIEW REQUIRED — this is the most legally nuanced activity in the whole map and the one most likely to need explicit joint-controller terms in the DPA/MSA rather than a simple processor clause. |
| Org data-use policy settings (`allowModelTraining`, `allowProductAnalytics`, `allowContentRetentionForDebugging`, `retentionPeriodDays`) | The organisation's own admin/owner/security_admin sets this | **Organisation: controller of this specific choice.** Blaze Break executes it (or, honestly, does not yet execute most of it — see `docs/DATA_POLICY.md`'s "what this does NOT cover yet") | LEGAL REVIEW REQUIRED once any real pipeline reads these flags — today they are largely unenforced switches, which itself needs to be represented accurately rather than implying an active data-processing choice exists where none does yet. |
| Enterprise OAuth integrations (Slack/Jira/Asana/Calendly/Monday.com) | The **individual employee** connects their own account (per-user opt-in, not org-initiated); the organisation only ever sees the resulting k-anonymity-gated aggregate | **Ambiguous — LEGAL REVIEW REQUIRED specifically for this one.** The individual's own action initiates the data pull, but the organisation is the ultimate beneficiary of the resulting aggregate signal. Does not cleanly fit either controller/processor role without legal analysis. |
| Org audit logs (`logOrgAuditAction`) | The organisation's own administrative actions, logged by Blaze Break for the organisation's accountability | **Organisation: likely controller. Blaze Break: likely processor** for this specific record | Standard processor pattern — Blaze Break logs on the org's behalf, for the org's own accountability purpose. |

## What this document is not

- Not a finished DPA schedule (see `B2B_DPA_DRAFT.md`, which explicitly
  references this document rather than re-deriving these conclusions).
- Not a legal opinion. Every "likely" above is an engineering-informed
  starting hypothesis for a solicitor to confirm, adjust, or reject.
- Not a claim that Blaze Break has resolved its controller/processor
  registration status with the ICO — see `OWNER_LEGAL_INPUTS.md`.
