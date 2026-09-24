# Blaze Break — Data Protection Impact Assessment (DRAFT)

**Status: DRAFT — LEGAL REVIEW / DPO REVIEW REQUIRED.** A DPIA is a
legal judgement exercise as much as a technical one; this document
provides the accurate technical/product input a reviewer needs. A risk
is marked "mitigated" only where a real, verified technical control
exists — not because a policy document says it should be mitigated.

*Version: 0.1 (draft) · Not yet published*

## 1. Purpose and necessity

Blaze Break processes wellbeing-related personal data to provide a
burnout-recovery coaching product: tracking self-reported state
(check-ins, mood, energy), providing AI-assisted coaching (Nova),
supporting structured recovery tools (Energy Budget, recovery plans,
boundary rehearsal), and — for organisation-sponsored accounts —
producing aggregate wellbeing signal for employers. Each of these is
necessary to the stated purpose; none of them is a byproduct of
unrelated data collection (see §7 for what is explicitly not collected).

## 2. Proportionality

The product's own design already reflects a proportionality principle in
several concrete ways, verified in code rather than asserted:
- Nova's context builder sends only what the user has explicitly
  consented to (`nova_permissions/current`, individually toggleable per
  data category — `docs/PRODUCT_SAFETY_PRIVACY.md` §3).
- Organisation-facing analytics are aggregate-only, gated by a
  configurable minimum-cohort threshold, never raw individual data
  (`DATA_FLOW_MAP.md` §4).
- Sensitive free-text content (stress trigger notes, boundary scripts,
  diagnosis reflections) is explicitly excluded from Nova's context even
  when the parent feature is consented to — only counts/summaries reach
  the AI provider (regression-tested, `nova-context-modules.route.test.ts`).

## 3. Personal data categories and special category data

See `DATA_INVENTORY.md` in full. The special-category question (UK GDPR
Art. 9) applies squarely to the wellbeing/mental-health-adjacent content
this product's entire value proposition is built on — **LEGAL REVIEW
REQUIRED** to confirm the Art. 9 condition relied upon (see
`PRIVACY_NOTICE.md` §4).

## 4. AI processing and profiling

- Nova (Gemini, with optional Vertex/Claude paths) processes wellbeing
  content to generate coaching responses. This is not automated
  decision-making with legal or similarly significant effect on the
  individual (Nova coaches; it does not, for example, determine
  someone's employment status, benefits eligibility, or access to
  anything material) — **LEGAL REVIEW REQUIRED** to confirm this
  characterisation, since UK GDPR Art. 22's specific protections turn on
  exactly this distinction.
- `AnxietyResetMode.tsx`'s `safetyLevel` field is a form of
  categorisation derived from the user's own self-reported sliders (not
  language inference) — flagged in `docs/PRODUCT_SAFETY_PRIVACY.md` §3
  as needing a product decision on whether it should be bound by the
  same "no risk score, in any form" rule the Guardian feature commits
  to. **This DPIA treats that as an open risk, not a resolved one** —
  see §8.
- No automated crisis-detection or automated third-party contact exists.
  A previous request to build exactly this (Nova autonomously texting a
  Guardian contact based on its own read of "critical feelings" in a
  conversation) was explicitly declined and not built — see
  `docs/PRODUCT_SAFETY_PRIVACY.md` §3. This DPIA notes the decision, not
  as a mitigation for a risk that doesn't exist (since the feature was
  never built), but as evidence the product's own governance process
  works as intended.

## 5. Voice/audio

Nova Live voice audio is streamed to the AI provider in real time and
discarded — never persisted by Blaze Break (verified: no Cloud Storage
usage anywhere in this codebase). Risk here is bounded by the fact there
is no retained audio artefact to secure or leak.

## 6. Employer involvement and organisation analytics

This is the single highest-risk area in the product from a DPIA
perspective, precisely because it's the one place personal wellbeing
data intersects with a power-imbalanced relationship (employer/
employee).

- **Risk**: an employer identifying, or attempting to identify, an
  individual employee's wellbeing state from aggregate data.
- **Mitigation actually implemented**: minimum-cohort suppression (floor
  of 3, default configurable to 5). A specific differencing/
  re-identification attack (relabelling every consenting member except
  one target into a team, then subtracting the org-wide total) was
  found and fixed — a team is now only shown if **both** it and its
  complement independently clear the threshold
  (`docs/PRODUCT_SAFETY_PRIVACY.md` §5, regression-tested in
  `org-risk-trend.route.test.ts`).
- **Residual risk, honestly stated, not glossed over**: this fix closes
  the specific attack found. It does **not** provide a formally complete
  k-anonymity guarantee against a slower attack built from many
  overlapping team-reassignment combinations over time. This is
  documented as an open item in `docs/PRODUCT_SAFETY_PRIVACY.md` §5 and
  is **not marked "resolved" in this DPIA** — a fully formal guarantee is
  a larger design project, not yet built.
- **Likelihood**: low for the specific closed attack (requires an org
  admin's deliberate, non-trivial manipulation); **medium-to-unknown**
  for the general residual risk, since it hasn't been formally bounded.
- **Severity**: high if realised (exposes an individual's private
  wellbeing state to their employer, the exact outcome the product's
  entire B2B privacy boundary exists to prevent).

## 7. What is not processed (bounding the assessment)

No payment data, no biometric data, no device location, no third-party
tracking/advertising data — confirmed in `DATA_INVENTORY.md`'s "What is
explicitly NOT collected today" section. This DPIA does not need to
assess risks for data categories that don't exist in this product.

## 8. Risk register

| Risk | Likelihood | Severity | Mitigation (verified, not assumed) | Residual risk | Owner |
|---|---|---|---|---|---|
| Employer re-identifies an individual from aggregate data | Low (specific known attack, fixed) / Medium-unknown (general case) | High | Minimum-cohort threshold + differencing-attack fix | Not formally bounded for the general case | **LEGAL/DPO REVIEW REQUIRED** on whether residual risk is acceptable as-is |
| AI provider misuses sent content | Low (per provider's own published terms) | Medium-High (sensitive content) | Provider terms only — no Blaze Break technical control post-request | Accepted, provider-dependent | **LEGAL REVIEW REQUIRED** to confirm provider terms are current and sufficient |
| `AnxietyResetMode.tsx` safetyLevel scope ambiguity | Unknown until product decision made | Medium (internal metric only today, never surfaced to org) | Confirmed never reaches org/HR viewer | Open — needs an explicit scope decision, not a code fix | **OWNER INPUT REQUIRED** — product decision |
| No automated data-retention/expiry | Certain (confirmed fact, not a risk of occurring) | Medium (storage-limitation principle exposure, not an acute security risk) | None currently — `docs/DATA_RETENTION.md` documents the open decision | Open until a retention decision is made | **OWNER DECISION REQUIRED** |
| Nova safety-floor bypass | Low (regression-tested, unconditional on every conversational surface) | High if it occurred | `NOVA_SAFETY_INSTRUCTIONS` unconditionally appended, tested in `nova-chat-safety.route.test.ts` / `nova-questioning-style.route.test.ts` | Low | Monitored via existing tests |
| Guardian alert sent without genuine user action | Low (hardened, tested) | High if it occurred | Server-side `isRealGuardian` check, cooldown, cap, idempotency, in-flight lock — `guardian-alert.route.test.ts` | Low | Monitored via existing tests |
| Data breach of Firestore/GCP infrastructure | Unknown (standard cloud risk) | High (wellbeing content) | Firebase Auth + App Check + Firestore rules layered access control — `docs/SECURITY_ARCHITECTURE.md` | Standard cloud-hosting residual risk | See `docs/INCIDENT_RESPONSE.md` |

## 9. Decisions requiring DPO/legal review before this DPIA can be
considered final

1. Art. 9 lawful condition for wellbeing/special-category data.
2. Whether the general (non-specific-attack) organisation-analytics
   re-identification residual risk is acceptable, or requires the
   larger formal k-anonymity project before B2B launch/scale-up.
3. `AnxietyResetMode.tsx` safetyLevel's product scope.
4. Data retention decision (see `DATA_RETENTION_SCHEDULE.md`).
5. International transfer mechanism confirmation for each AI/
   infrastructure provider.

---

*This document is a first-pass draft prepared from direct code
inspection. It is not a substitute for a qualified DPO/solicitor's
formal DPIA sign-off, and residual risks above are not marked resolved
merely because a document describes them. See `LEGAL_REVIEW_REQUIRED.md`.*
