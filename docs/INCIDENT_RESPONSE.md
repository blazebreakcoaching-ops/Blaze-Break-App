# Incident response

A confirmed gap before this document existed — there was no written plan
for what to do if something goes wrong. This is written for the actual
size of this operation today: a small team running a single Cloud Run
service, not a security operations centre. It should still be followed
for real; "small team" is a reason to keep the plan short and usable, not
a reason to skip having one.

**If you are reading this because something is actually happening right
now**, skip to §3 (by incident type) and start there. Come back and read
the rest afterward.

## 1. What counts as an incident

Anything in this list is an incident, not a bug ticket:

- A secret (API key, `MFA_ENCRYPTION_KEY`, `SSO_CONFIG_ENCRYPTION_KEY`,
  `OAUTH_STATE_SECRET`, Twilio/Brevo credentials) was exposed —
  committed to git, pasted somewhere public, or logged.
- Evidence of unauthorized access to a user's account, an admin account,
  or an organisation's data.
- Evidence someone bypassed a control this codebase relies on (App
  Check, the MFA session gate, an org permission check, a Firestore
  rule).
- A sustained abuse/cost spike (a jump in Nova/Gemini spend, an SMS cost
  spike, a burst of rate-limit rejections from one source — see
  `docs/AI_COST_CONTROL.md` and the rate-limit logging in
  `docs/SECURITY_HARDENING.md`) that looks adversarial rather than a
  real traffic increase.
- A dependency vulnerability with a known active exploit affecting a
  package this app actually uses (see `docs/DEPLOY.md` §6 for the
  Dependabot/`npm audit` baseline).
- Any report from a user or a third party that their data was exposed,
  altered, or deleted without their action.

## 2. Severity, and how fast to move

| Severity | Examples | Response |
|---|---|---|
| **Critical** | Active data breach, admin account compromise, exposed secret with signs of real use | Contain within the hour (§4), notify affected parties per §6 once contained |
| **High** | Exposed secret with no signs of use yet, a confirmed bypass of a real control, sustained cost-abuse spike | Contain same day |
| **Medium** | A vulnerable dependency with no known exploit yet, a one-off suspicious pattern that didn't repeat | Fix within the week via the normal Dependabot/PR flow |
| **Low** | Theoretical/reported-but-unconfirmed issue | Track in `docs/OUTSTANDING_SECURITY_ITEMS.md`, fix in normal priority order |

When unsure which tier something is, treat it as one tier higher until
you know more — the cost of over-reacting to a false alarm is far lower
than under-reacting to a real one.

## 3. By incident type — what to actually do

### A secret was exposed

1. **Rotate it immediately** in Google Secret Manager, then redeploy the
   Cloud Run service so it picks up the new value
   (`docs/DEPLOY.md` §2 lists every secret this app uses).
2. If it's `MFA_ENCRYPTION_KEY` or `SSO_CONFIG_ENCRYPTION_KEY`: rotating
   it means everything previously encrypted with the old key (existing
   TOTP secrets, existing inline SSO client secrets) can no longer be
   decrypted. Every user with 2FA enabled will need to re-enroll; every
   org with an inline SSO secret will need to re-enter it. There is no
   way around this — it's the correct trade-off for a compromised
   encryption key, not a bug to work around.
3. If it was committed to git: rotating the secret is necessary but not
   sufficient — the exposed value is permanently in the repository's
   history unless you rewrite history (disruptive, coordinate before
   doing it). GitHub secret scanning + push protection
   (`docs/DEPLOY.md` §6) is what should have caught this before the push
   completed; if it didn't, check whether it's actually enabled on this
   repository.
4. Check Cloud Run / Secret Manager access logs for any use of the old
   secret after the point it was exposed, if the exposure window is
   known.

### Suspected unauthorized account access

1. Force sign-out: `revokeRefreshTokens(uid)` via the Admin SDK (the same
   call `server.ts` already makes on a password change or 2FA disable —
   see `docs/SECURITY_ARCHITECTURE.md` §1) immediately invalidates every
   token already issued for that account.
2. If it's a platform admin account: also review `admin_audit_logs`
   (`GET /api/admin/audit-logs`) for what actions were taken under that
   identity while compromised, and consider whether any of those actions
   (role grants, entitlement grants, org changes) need to be reversed.
3. Have the account owner reset their password and, if not already
   enabled, turn on 2FA (`SecuritySettingsView.tsx`).
4. If the compromise came through a phished/reused password rather than
   a platform bug, this is still worth logging in
   `docs/OUTSTANDING_SECURITY_ITEMS.md` if it reveals a gap (e.g., no
   forced-2FA policy for admin accounts).

### Suspected data breach / unauthorized data access

1. Identify scope first: which collection(s), which user(s) or
   organisation(s), read-only or also written/deleted. `admin_audit_logs`
   and the per-org `audit_logs` subcollection are the first places to
   check for what actually happened, not assumptions.
2. If it's ongoing (an active exploit, not a historical exposure): the
   fastest full stop is redeploying with the vulnerable route/rule
   change reverted, or — if that's not immediately possible — disabling
   the specific route in code and shipping that as an emergency deploy.
   There is no platform-wide "kill switch" for the whole API; Cloud Run
   traffic can be stopped by scaling the service to zero instances if
   containment truly requires taking the app offline.
3. Once contained, move to §6 (notification) if any real user's personal
   data was actually exposed — not just theoretically exposable.

### Abuse / cost spike

1. Check the rate-limit rejection logs (`[RATE LIMIT] ...`, added in
   this hardening pass — see `docs/SECURITY_HARDENING.md`) and the
   `/api/admin/cost-usage` dashboard for which route and which
   IP/account.
2. A single account or IP driving the spike: the existing per-capability
   daily quota (`entitlements.ts`) and rate limiters should already be
   capping the damage — confirm they're actually firing (the logging
   added in this pass is what makes this checkable at all; before it,
   429s produced no log output). If they aren't firing as expected, that
   itself is the incident to fix.
3. A distributed spike across many IPs: this is the point at which
   `docs/DEPLOY.md` §6's suggestion of Google Cloud Armor (WAF) in front
   of the service stops being optional — it isn't configured today (see
   `docs/OUTSTANDING_SECURITY_ITEMS.md`).

### Vulnerable dependency with an active exploit

1. Check whether the vulnerable code path is actually reachable in this
   app (a transitive dependency's vulnerable function may never be
   called) before treating it as urgent.
2. If reachable: patch immediately, don't wait for the weekly Dependabot
   batch (`docs/DEPLOY.md` §6). If no patched version exists yet, look
   for a way to disable the affected feature until one ships.

## 4. Containment checklist (any incident)

- [ ] Identify what's actually affected — don't assume scope, check logs
- [ ] Stop the ongoing harm (rotate the secret / revoke the session /
      patch the route / disable the feature)
- [ ] Preserve evidence before cleaning up — `admin_audit_logs`, Cloud
      Run request logs, and the specific data state, if relevant, before
      any remediation touches it
- [ ] Fix the root cause, not just the symptom
- [ ] Write it down — a short note of what happened, even for something
      contained quickly, so a pattern across incidents is visible later

## 5. Detection — what's actually watching today

Being honest about what exists rather than describing an aspirational
setup:

- Rate-limit rejections and failed MFA/TOTP attempts are logged
  (`console.warn`/`console.error`) to Cloud Run's stdout/stderr, visible
  in Cloud Logging. There is no automated alerting on these logs
  today — someone has to go look. Setting up a Cloud Monitoring alert on
  a spike in `[RATE LIMIT]` or `[MFA] Failed verification attempt` lines
  is a real, concrete next step, not yet done (see
  `docs/OUTSTANDING_SECURITY_ITEMS.md`).
- GitHub Dependabot raises PRs for vulnerable dependencies weekly
  (grouped) and immediately for security advisories.
- GitHub secret scanning + push protection should be enabled on the
  repository (`docs/DEPLOY.md` §6) — confirm this is actually turned on,
  don't assume it is.
- There is no dedicated security monitoring/SIEM tool, no anomaly
  detection, and no on-call rotation. For an app this size that's a
  reasonable starting point, not a gap to apologize for — but it does
  mean detection today is mostly "someone notices," which is why the
  logging added in this pass matters: it gives that someone something to
  actually look at.

## 6. Notification — who needs to know

This app is not currently known to be subject to a specific breach-
notification regulatory regime beyond general GDPR obligations (personal
data of EU/UK users is processed here — see `docs/DATA_POLICY.md` and
`docs/DATA_RETENTION.md`). If a confirmed breach involves real personal
data:

- Affected individuals should be told what happened, what data was
  involved, and what's being done — in plain language, matching this
  product's own tone, not legal boilerplate for its own sake.
- If the scale or nature of a breach raises a genuine question about
  regulatory notification obligations (e.g. GDPR Article 33/34), that's
  a legal question this document cannot answer — get real legal advice
  before deciding notification isn't required, not after.
- Enterprise customers (organisations) should be told directly and
  promptly if their org's data specifically was affected, separate from
  a general individual-user notice.

## 7. Who does this today

This is currently a small operation without a dedicated security team.
The platform owner (the account behind `teampublication@gmail.com` /
`teampublication@googlemail.com`, the hardcoded `platform_owner` identity
throughout `server.ts`) is the actual point of accountability for
executing this plan today. As the team grows, this section should be
updated with real names/roles rather than left pointing at one person —
that update itself belongs in `docs/OUTSTANDING_SECURITY_ITEMS.md` once
there's someone else to name.
