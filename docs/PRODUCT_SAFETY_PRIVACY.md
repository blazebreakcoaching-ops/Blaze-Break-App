# Product safety, privacy, and claims - durable principles

This document exists so the decisions below survive future development,
not just this one audit pass. It follows a full-repository product-safety
review (clinical/regulatory language, Nova behaviour, Guardian escalation,
the employer privacy firewall, and customer-facing claims). Where this
document and older/narrower docs disagree, this one wins for the
cross-cutting principles; feature-specific specs (e.g.
`GUARDIAN_SUPPORT_SPEC.md`, `ENTERPRISE_RBAC.md`) remain the source of
truth for their own area's detail.

## 1. Product positioning

Blaze Break is a private burnout, wellbeing, and recovery-support
platform built around Nova, a conversational coach. It is **not**:
a diagnostic medical product, an autonomous clinical decision system, a
hidden employee-monitoring tool, or a covert risk-scoring system. Every
customer-facing claim should be checked against what the code actually
does before it ships - see §6.

## 2. Clinical/regulatory language

Blaze Break's own "Banned Claims" list (`AssuranceCentre.tsx`) already
prohibited words like "detect burnout" and stated the product "does not
diagnose, treat or replace medical or emergency services." A repo-wide
audit found the shipped UI itself violated that policy in ~20 places -
a nav tab literally labelled "Diagnose," screen titles, buttons, an
onboarding walkthrough, and a Trust Centre FAQ answer all using
"Diagnostic"/"Diagnosis." These have been renamed to check-in/assessment
framing (e.g. "Diagnose" → "Check-in," "Retake Diagnostic Assessment" →
"Retake Check-in"). Internal identifiers - the `burnout_diagnostic`
feature flag, the `diagnostics`/`diagnosis_progress` Firestore
collections, the `/api/nova/diagnose` route - were deliberately **not**
renamed in this pass: renaming a persisted field name or route without a
real migration would be a breaking change for no safety benefit, since
none of those identifiers are shown to a user. If a genuine schema rename
is ever wanted, it needs its own migration, not a find-and-replace.

The GAD-7 anxiety check-in (`Gad7Check.tsx`) was already the model example
of correct handling in this codebase: it names the instrument explicitly,
never claims Blaze Break diagnoses anxiety, and repeatedly says "not a
diagnosis." New copy should match that pattern - name the instrument,
separate Blaze Break's interpretation from a professional diagnosis, and
say so explicitly rather than staying vague.

Also fixed as a fabricated clinical claim: `Walkthrough.tsx`'s onboarding
breathing exercise used to say "Test Succeeded... you triggered an
instantaneous vagus nerve dampening. Heart rate variability (HRV)
increased" after a plain on-screen timer, with no biometric sensor
anywhere in the codebase. There is no HRV measurement anywhere in this
app. That copy now says plainly that the app has no sensor and can't
measure anything about the user's body.

## 3. Nova: explainability, memory, feature routing, safety

**Explainability.** Nova's only user-facing "why" surfaces (the privacy
shield tooltip in `NovaChat.tsx`, the feature-suggestion card's `reason`
field) were already structured, concise, data-provenance style
explanations - never raw model chain-of-thought. No change needed here;
keep new "why did Nova suggest this" work in that same shape.

**Memory.** `remember_about_user`'s write path (`server.ts`,
`nova-tools.ts`) already gates writes behind an explicit user opt-in,
validates content length/type, rate-limits to 2 writes per turn, and
deliberately excludes `'verified'` as a model-writable confidence level
(a probabilistic inference is never "verified"). Users can see, edit, and
delete every memory in `MemoryCentre.tsx`. This is a reasonable, already
good design - no change made.

**Feature routing.** `suggest_feature`'s allow-list (`SUGGESTABLE_FEATURES`
in `nova-tools.ts`) is validated server-side against a hardcoded catalog
before ever reaching the client, and every entry maps to a real, reachable
tab in `App.tsx`. Nova cannot suggest a feature that doesn't exist. No
change needed to the mechanism; the "Diagnose" label inside it was renamed
to "Check-in" alongside the nav tab (see §2).

**A real bug, now fixed: the crisis-safety instruction was silently
dropped in normal use.** `POST /api/nova/chat` used to compute its system
prompt as `(systemInstruction || NOVA_SYSTEM_PROMPT) + contextAddendum`.
Every real caller (the main Nova chat tab, and every other surface that
calls this route with its own `systemInstruction`, e.g. boundary
rehearsal) supplies a non-empty `systemInstruction`, which **fully
replaced** `NOVA_SYSTEM_PROMPT` - including the only crisis-safety
instruction the main text-chat surface had. This wasn't an edge case; it
was the normal code path. Fixed by introducing `NOVA_SAFETY_INSTRUCTIONS`,
a constant now always appended to the merged prompt regardless of what
`systemInstruction` a caller supplies, mirroring the live-voice persona's
own "this overrides everything above" safety block. Regression-tested in
`nova-chat-safety.route.test.ts`.

**A related, unresolved item worth a deliberate decision:**
`AnxietyResetMode.tsx` computes and persists a per-user categorical
`safetyLevel` (`'normal_support' | 'heightened_anxiety' | 'panic_level' |
'possible_crisis' | 'immediate_danger'`) derived from the user's own
self-reported 0-10 intensity sliders (not language inference). It's
aggregated into an internal platform-superadmin metric, never surfaced to
an org/HR viewer, and two of its five values are never actually assigned.
This sits in tension with the letter of `GUARDIAN_SUPPORT_SPEC.md` §0.1's
"no risk score... in any form" rule, even though that rule's stated scope
is the Guardian feature specifically and this is a sibling feature. This
was **not changed** in this pass - it needs a product decision (does §0.1
bind this feature too?) rather than a unilateral code change, and is
listed as an open item below.

## 4. Safety without surveillance (Guardian)

The Guardian trusted-contact system's actual send path,
`POST /api/guardian/alert`, is well built: server-side `isRealGuardian`
check against the caller's own stored contact (never trusting the
client), a 10-minute per-contact cooldown, a 15/day cap, idempotency, and
an in-flight lock closing the read-then-write race between the
cooldown/cap check and the send. It is thoroughly tested in
`guardian-alert.route.test.ts`.

Two real problems were found and fixed:

1. **The actively-rendered Guardian UI bypassed all of that.**
   `NovaGuardianRelay.tsx`'s "Manual SOS" and "One-Touch Alert" buttons
   called a separate, unprotected `POST /api/twilio/send` directly - no
   guardian check, no cooldown, no idempotency, no daily cap - and
   rendered on every contact card regardless of whether that contact was
   actually a guardian. Fixed: both buttons now call the hardened
   `/api/guardian/alert` endpoint, and are only shown for contacts that
   pass `isRealGuardian`.
2. **`isRealGuardian` itself had a bypass.** It checked
   `contact.isGuardian === true` with `OR`, independent of role - so a
   contact record with `role: 'manager'` and `isGuardian: true` (never
   producible via the normal UI, but not prevented server-side or by
   Firestore rules on the write path actually used) would still pass, even
   though the product's own UI says managers are "strictly prohibited from
   receiving Guardian crisis intercepts." Fixed: `isRealGuardian` now
   explicitly rejects `role: 'manager'` or `role: 'peer'` regardless of the
   `isGuardian` flag. The underlying Firestore-rules gap (the rule that
   actually governs `user_stats/{uid}.supportCircle` doesn't validate
   `role` the way a separate, unused `support_circle` subcollection rule
   does) is **not yet fixed** - see open items.

**A P0 found and fixed: an unattended, cron-driven messaging system that
contradicted this project's own written safety policy.**
`AllyNudgeScheduler` lets a user configure a recurring SMS/WhatsApp
message to a chosen contact, sent automatically by a 5-minute cron job
with zero per-send user action after setup. This is, functionally,
exactly `GUARDIAN_SUPPORT_SPEC.md`'s own "Tier 3" capability - a planned
communication arrangement configured in advance - which that spec
declares **"permanently out of scope... not deferred pending approval. It
is excluded"** until ten named governance workstreams (clinical,
safeguarding, legal) and a documented, tested kill-switch exist. None of
that review had happened, yet the feature was live. Fixed: a new
`NUDGE_SCHEDULER_ENABLED` kill switch, off by default (the only kill
switch in this codebase that defaults to *off* rather than on, on
purpose - see `nudgeSchedulerIsEnabled`'s docstring in `guardian-alert.ts`),
gating both new-schedule creation and the cron job itself. It stays off
until that governance review actually happens - flipping it on is a
product/legal decision, not an engineering one.

Also fixed: the landing page called this feature an "Autonomous Guardian
System" in its heading while its own body copy said "no automatic
monitoring... just a fast, private way to ask for help." Retitled to
"One-Tap Guardian Support" so the heading stops contradicting the body.

## 5. The employer privacy firewall

Every `/api/org/...` and `/api/admin/...` route was checked for whether it
ever exposes a named individual's private wellbeing content (Nova
conversations, Nova memories, GAD-7 results, journal entries, individual
mood/body check-ins) to an org admin, team manager, or HR viewer. None do
- every wellbeing-adjacent org route is aggregate-only, gated by
`org.privacyThreshold`. `GET /api/admin/users/:uid` does let Blaze Break's
own platform staff (not an employer) pull one user's full Burnout
Fingerprint with no additional audit log entry; it's currently unused by
any frontend and is flagged below as worth hardening, but it is a
platform-internal route, not an employer-facing one.

**A P0 re-identification bug was found and fixed in the aggregate
threshold itself.** `GET /api/org/:orgId/risk-trend` grouped consenting
members by team and showed a team's aggregate strain score whenever that
team's size cleared `org.privacyThreshold` - checking team size alone.
Team labels are entirely admin-assigned and reassignable at any time. An
admin could relabel every consenting member **except one target person**
into a team ("Team A"), and since the org-wide total is already shown
once the org itself clears its threshold, that excluded person's
individual signal becomes recoverable by subtracting Team A's numbers
from the org-wide total - a classic differencing attack. This is now
closed: a team is only included in the breakdown if **both** it and its
complement (everyone else in the consenting cohort) independently clear
the threshold. Fixed in the `/risk-trend` handler in `server.ts`, with
regression tests in `org-risk-trend.route.test.ts` under
`describe('differencing / re-identification attack via team composition')`.

**This fix does not fully solve the general problem.** It closes the
specific, demonstrated "near-total team" attack, but does not defend
against a slower attack built from many overlapping team combinations
over time (e.g. iteratively reassigning people between several mid-sized
teams and diffing repeated reads). A genuinely complete k-anonymity
guarantee (formal suppression across every combination of released
aggregates) is a larger piece of work than this pass covers - see open
items. In the meantime, the k-anonymity/anonymity marketing language
across `PrivacyPolicyAccordion.tsx`, `AssuranceCentre.tsx`, and
`DataZoneVisualizer.tsx` was corrected to stop promising an absolute
guarantee ("ensuring you cannot be singled out," "K-Anonymized," a flat
"10 or more participants" figure that didn't match the real, admin
configurable default of 5 with a floor of 3) and instead describe what is
actually implemented: a minimum-cohort suppression threshold, honestly
described as reducing but not eliminating re-identification risk for
small cohorts.

## 6. Claims must match code

Two other real misrepresentations were found and fixed, both at the exact
moment a user requests account deletion (a GDPR Article 17 request):

- A consent checkbox in `PrivacyVault.tsx` had the user affirmatively
  state that "audit ledgers will be permanently destroyed" on deletion.
  They are not - `user-data-collections.ts` deliberately configures
  `audit_logs` with `eraseOnDeletion: false`, because an audit trail that
  describes an account must survive the account itself. The checkbox now
  says what actually happens: personal recovery data is erased; security
  audit records are kept separately for accountability and legal reasons.
- `PrivacyPolicyAccordion.tsx` claimed deletion "cryptographically shreds
  all your associated data across all zones instantly... We retain zero
  shadow profiles." No cryptographic-shredding mechanism exists anywhere
  in this codebase (deletion is a plain Firestore `recursiveDelete`), and
  the same file's own `AssuranceCentre.tsx` marks "Encryption @ Rest" as
  "Pending." Rewritten to describe what deletion actually does, including
  the audit-log exception and the fact that Blaze Break has no technical
  control over data already sent to third-party AI/messaging providers
  before a deletion request (a fact `docs/DATA_POLICY.md` already stated
  honestly - the UI just didn't match it).

The general rule going forward: if a customer-facing claim can't be
pointed at real, working code, either fix the code or fix the claim. Don't
leave the two disagreeing.

## 7. What was deliberately left unchanged, and why

- Internal identifiers (`burnout_diagnostic` feature flag,
  `diagnostics`/`diagnosis_progress` Firestore collections,
  `/api/nova/diagnose` route) - renaming these is a real migration, not a
  copy fix, and none are user-visible.
- `AnxietyResetMode.tsx`'s `safetyLevel` field - needs a product decision
  on scope, not a unilateral removal (§3).
- The Firestore-rules gap on `user_stats/{uid}.supportCircle`'s `role`
  field - `isRealGuardian`'s server-side fix (§4) is the actual
  enforcement point for the one endpoint that sends real alerts, so this
  is defense-in-depth, not the primary fix. Tightening the rule itself
  needs a careful pass across the whole `user_stats` document shape to
  avoid breaking unrelated legitimate writes, which this pass didn't do.
- `GET /api/admin/users/:uid`'s full-fingerprint access for platform staff
  - flagged, not fixed, since it's unused by any current frontend and
    hardening it (e.g. requiring an explicit audit-logged justification)
    is a small but separate change.
- The general, fully-formal k-anonymity guarantee (§5) - the specific
  attack found was closed; the broader guarantee is a larger design
  question.
- Lower-severity pseudo-science branding (e.g. "Solfeggio"/"432Hz"
  soundscape labels in `FocusZone.tsx`/`NervousSystemReset.tsx`) and
  several unhedged physiological "Fact:" claims in
  `RecoveryFuelEngine.tsx`'s nutrition module - real findings, correctly
  scoped as lower priority than the P0s above, not yet addressed.

## 8. Regulatory/clinical review this document cannot substitute for

This pass corrected internal inconsistencies (the product's own banned-
claims list vs. its shipped copy) and closed concrete engineering bugs. It
is not a substitute for: a real UK ICO-facing DPIA for the org analytics
feature, a formal legal review of the data-retention/export claims now
made more conservative, or a clinical/safeguarding review of
`AnxietyResetMode.tsx`'s `safetyLevel` field's actual scope under
`GUARDIAN_SUPPORT_SPEC.md` §0.1. Those need a human specialist, not a
self-certification.
