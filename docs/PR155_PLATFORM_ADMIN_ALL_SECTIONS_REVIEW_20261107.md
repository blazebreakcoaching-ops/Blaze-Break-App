# Blaze Break — Platform Admin: all-sections review and remaining acceptance work
Date: 7 November 2026
Status: **NO-GO / SOURCE INVENTORY IN PROGRESS / RUNTIME QA NOT EXECUTED**
Repository: `blazebreakcoaching-ops/Blaze-Break-App`, draft PR #155, branch `cto/customer-first-experience-20261106`.

## Scope correction

The earlier release checks prioritised the customer/Nova/Calendar journey; the follow-up company audit prioritised the organisations and staff controls. **Neither was a comprehensive platform-admin audit.** This register covers all 15 currently rendered Platform Command Centre tabs, the 59 `/api/admin/*` routes found in `server.ts`, and separately the customer organisation administration surface and admin-only routes absent from the dashboard. A matched route or existing test is **not** proof of a passing feature.

## Platform admin screen inventory — status by area

| Tab | Relevant server/function areas | Source review findings | Still needs actual verification |
|---|---|---|---|
| Overview | `/api/admin/users`, `/api/admin/summary`, `/api/admin/cost-usage`, `/api/admin/orgs`, feedback and audit | Data is loaded from existing endpoints. Summary deliberately swallows failed subqueries into empty/zero defaults, and uses `Math.max(usersSnap.size, 1)`, which can misrepresent real counts. | Empty tenant, denied permissions, partial Firestore outages, non-fabricated counts, refresh |
| User Roles & Claims | `/api/admin/users`, per-UID role, suspension | Platform-owner gate exists on security-claim writes; tests present. Some permission denials use generic 500 rather than 403, masking access issues. | Promote/demote, stale claims, suspended user, MFA, UID reuse, cross-account |
| Plans & Entitlements | Per-UID `/entitlement`, grants and access timeline | Manual admin grants exist; real provider settlement is separate. | Plan/status expiry, upgrade/downgrade, org seat reconciliation, effective access after relogin |
| Promote Platform Admins | `/api/admin/admin-users` and role/delete | Platform-owner checks, temporary role metadata, last-owner guards are present in source. Some blocked requests return 500 instead of a suitable permission/conflict status. | Grant, revoke, expiry, current token revocation, last owner protection |
| Organisations | `/api/admin/orgs` + customer `OrgDashboard` | P0 lifecycle and seat/privilege issues in separate company report. Company-list failure previously looked like “no organisations”; patched in draft. | Create/edit, assignment, staff join, roles, full CRM onboarding lifecycle, two companies |
| Communications | `/api/admin/cost-usage`, provider indicators | Cost estimates/configuration flags appear; do not confuse with real provider reconciliation. | SMS/email delivery, quotas, missing credentials, failures, test environment |
| Privacy Operations | `/api/admin/privacy/retention-queue` | Read-only queue exists; account export/deletion flows are outside this tab. | Real retention rules, dry-run, clock boundary, consent revocation, export/erasure |
| Auditor Event Log | `/api/admin/audit-logs` | Reads a limited collection; check audit completeness, security event pagination and redaction. | Every mutation logged once, no private content, ordering, attribution |
| System Health | `/api/admin/system-health` | Reports configured dependencies/static kill switches and rate-limit settings — not live uptime, alerts or error monitoring. | Health truthfulness, kill-switch state, monitoring/rollback |
| Platform Controls | Feature flags, public legal reads, legal publication | Flag read/write and legal document endpoints exist. Publishing legal content is sensitive and must be permission-tested. | Settings permission matrix, feature flag toggling, legal version/acceptance |
| Release Centre | Channels, registered devices | Channels/devices routes exist. PR's production workflow is manual-only and exact-SHA guarded; not run. | Channel rollback, client version behavior, updates, auth, permissions |
| Incidents | `/api/admin/incidents` routes | Manual incident CRUD exists; no evidence of automated detection or alerting. | Workflow, write failures, audit trail, authorization, sensitive data handling |
| NHEI Knowledge Review | `/api/admin/nhei-knowledge/*`, reviewer claim | Dedicated reviewer grant and review/import routes exist. Client's 403 branch was unreachable because `secureApiFetch` throws on non-2xx; draft now handles thrown status. | Claim revoke while signed in, review dual control, rejected import, audit |
| Somatic De-escalation Stats | `/api/admin/summary` | Missing summary previously left tab blank. Draft now renders error/retry; summary source still needs truthful partial-outage semantics. | Zero use, high volume, Firestore errors, privacy-safe aggregation |
| Feedback & Testimonials | `/api/admin/feedback` | Endpoint returns `feedback_submissions` records. Draft now shows failed-load vs genuinely empty. Review access scope and customer consent before displaying or reusing content. | Submit, review, testimonial consent, private data, errors and date filters |

## Extra back-office API areas NOT represented as their own tab

- `/api/admin/evolution/*` — registry, protected core, change proposals, cost budget, freeze, rollout, Nova runtime, memory health. These are operationally sensitive and require independent source+integration tests; seeing them in `server.ts` does **not** mean they have a working end-user admin UI.
- `/api/admin/nova-settings`, `/api/admin/knowledge-chunks`, `/api/admin/content-library` — privileged configuration writes outside this dashboard's explicit tab workflow. Their request payloads are currently forwarded broadly into Firestore; require bounded schemas and authorization/failure-mode testing before exposing to admins.
- `/api/admin/recovery-outcomes`, `/api/admin/product-intelligence` — aggregate analytics routes with separate content-manage permissions; validate output privacy, query limits and Firestore cost.
- Customer company `OrgDashboard`, team/HR dashboards, member roles, seats, invites, SSO, device and connector administration are **separate from** platform AdminDashboard. The P0 company report is `docs/PR155_COMPANY_STAFF_ADMIN_AUDIT_20261107.md`.

## Confirmed errors addressed in draft (SOURCE CODE ONLY; not passed QA)

1. Organisation list load failures now produce a visible error, not “No organisations provisioned.”
2. A successful company save stays successful even when fetching the updated list fails.
3. Somatic stats show an unavailable/retry state instead of rendering a blank tab.
4. Feedback load failures now display an error rather than “No submissions.”
5. NHEI reviewer denial is recognised from the thrown API error's 403 status.
6. A small source-regression test covers these UI failure states; written but **not run**.

## Confirmed/potential release blockers to work next

**P0 company security**: Suspended members still resolve roles; joining with code skips seat cap; old team-manager/HR grants remain on departure; company reassignment can leave conflicting memberships; shared join code remains usable after invite cancellation. See company report.

**P1 platform trust**: Several platform-admin endpoints send 500 for forbidden requests; summary reports zero/one data on Firestore failure; server-only Nova/content configuration routes need bounded schemas and test proof. These are source observations needing careful compatibility review, not evidence of a production incident.

**P1 operational readiness**: No authenticated staging sign-in, Firestore emulator, real company-and-staff journey, test-suite result, actual messaging, or live monitoring proof from this review.

## Required acceptance work

- Extend offline release tests to include each admin tab's happy path, permission-denied case, network failure and stale account switch.
- Verify all 59 admin routes plus server-only controls against least-privilege permission matrix (reviewer, owner, ordinary staff, non-admin).
- Test all customer org roles and cross-tenant access, without disclosing individual coaching/wellbeing/chat information.
- Run the full offline release gate at the exact release candidate SHA, with captured evidence. Then staging smoke tests, safe rollback and owner go/no-go. Do not merge or deploy automatically.

**Truthful interpretation**: Source inventory is broad; individual route and tab behavior has **not** been fully executed or certified. This file is a living QA backlog, not release approval.
