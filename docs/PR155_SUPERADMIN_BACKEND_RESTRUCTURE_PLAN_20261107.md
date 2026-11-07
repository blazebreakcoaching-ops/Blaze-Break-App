# Blaze Break — Super Admin & Backend Restructure
7 November 2026 • PR #155 draft • NO-GO for live release

## Operating principles
- **Company administration is not customer wellbeing surveillance.** Show verified identity, company affiliation, security/access, billing, invitations and operational audit; NEVER expose individual private recovery chats, wellbeing entries, health content, or personal activity scores to an employer.
- Never claim a configured integration is a successful live connection. Never invent users, active sessions, metrics, email addresses, or login dates.
- One readable executive summary; five primary admin work areas; progressive disclosure for specialist controls.
- No automatic GitHub Actions/production deployment. Merge only with tested SHA, privacy review and explicit approval.
- Status vocabulary: **source-fixed** = committed but runtime QA pending; **open** = not yet corrected; **verify** = source exists but not end-to-end tested.

## Priority 0 — Security and company access: must be correct before B2B beta

1. [x] **Source-fixed — Suspended permissions.** `getOrgMemberRole` now treats `status=suspended` as no role, including fallback arrays; `loadOrgAndCallerRole` rejects no-role callers on HR/manager paths. Test cross-tenant and direct Firestore separately.
2. [x] **Source-fixed — Last active owner.** Owner guard now excludes suspended owner records; org suspension checks the last-owner invariant. Run new route/emulator tests.
3. [x] **Source-fixed / tests unrun — Atomic join and invite seats.** `/api/org/join` and `/api/org/:orgId/invite` now both reserve against the current org roster, pending invitations and billing seat allowance in Firestore transactions. Verified invited emails convert their reserved seat atomically; concurrency tests authored. Emulator and email-delivery race testing remain outstanding.
4. [ ] **Partial source correction — Revocable invitations NOT yet built.** Cancelling a pending invite now logs the action, frees its reserved seat, and explicitly tells admins the shared joining code remains valid. The UI advises code rotation. Individual expiring/revocable invite tokens and replay/wrong-company tests remain P0.
5. [x] **Source-fixed — Cross-company reassignment.** Platform `/api/admin/orgs` now rejects an initial owner already linked to another company; dedicated transfer and cleanup remain open. New route regression authored, not executed.
6. [x] **Core source-fixed / tests unrun — Leave/remove cleanup.** Both exit paths now clear membership, admin list, team assignment, team manager and HR viewer assignments, role doc and registered org devices. Leaving also protects the final owner and writes an org audit event. Test authored; still check auxiliary grants and racing account transitions in an emulator.
7. [ ] **Open — Company membership consistency.** Prevent ownerless companies, duplicate UIDs, orphaned documents, unapproved role escalations and residual access on company deletion/archive.
8. [ ] **Open — Token/claim revocation.** Verify suspended platform admins, downgraded claims, expired escalations and removed staff are denied in a previously signed-in browser, not only after relogin. MFA/App Check on every sensitive endpoint.
9. [ ] **Open — Role matrix and ownership transfer.** Exercise platform owner, platform admin, b2b admin, customer owner, HR, manager, security, member and non-member, both permitted and forbidden operations; no hidden bypass through legacy routes.
10. [ ] **Open — Tenant isolation & personal privacy.** Cross-company records, wellbeing content, message transcripts, Nova memories and raw individual usage remain inaccessible to company dashboards. Enforce on API, Firestore rules, exports, analytics and logs.

## Priority 1 — People Directory: operational clarity and truthful identity

11. [x] **Source-fixed — Name / company / sign-in metadata.** `GET /api/admin/users` now returns Firebase Auth display name and Firestore company ID. Anonymous classification requires NO linked email/phone as well as empty providerData.
12. [x] **Source-fixed — Readable People UI.** Accounts shown as registered first (demo accounts in their own filter); name/email/company/role/plan/joined/last sign-in, including time and account drawer context.
13. [ ] **Open — True, paginated cross-source directory.** Current route reads only first **100 Firestore users** and misses Firebase Auth-only accounts. Build paginated Auth/Firestore reconciliation, cursor, safe exact-UID/email search, server-side filters, accurate counts, no unbounded scans. Show counts across whole user population, not first page.
14. [ ] **Open — Profile reconciliation.** Clearly label verified Firebase email vs optional self-entered display name; handle never-verified, phone-only, anonymous, orphaned, deleted and duplicate identities, safely.
15. [ ] **Open — Sign-in history with governance.** Firebase Auth provides *latest sign-in*, not an activity log. If needed, instrument transparent, bounded sign-in security events (success/failure, account ID, timestamp, login method, retention rules); avoid unnecessary IP/device profiling or employer-visible tracking.
16. [ ] **Open — Demo-account lifecycle.** Make 30-day demo expiry, cleanup, never-signed-in classification, conversion to real accounts and retention visible, with accurate counts and alarms.
17. [ ] **Open — User lookup beyond first page.** Search by complete email/UID across the entire directory, not only the loaded page; display reliable pagination, sorting, export of authorised metadata and explicit stale/error states.
18. [ ] **Open — Secure account actions.** Confirm/resume/suspend/reset/role/plan actions with recent MFA, correct HTTP denial codes, immediate effect, audit logs, and no accidental privilege grants.

## Priority 1 — Company Executive Console & customer admin

19. [x] **Source-fixed — Read-only company overview.** Platform company detail now includes staff count, pending invites, available seats, over-capacity flag, suspended records and roster mismatch warning without viewing wellbeing content. Company details are guarded against stale responses from another selected company.
20. [ ] **Open — Dedicated company detail workspace.** Replace cramped inline panel with a clear company page: identity, account owner, billing status, contacts, staff roster, invitations, seat utilisation, security policy, status and chronological operational audit.
21. [ ] **Partially source-fixed — Company lifecycle controls.** Company name and minimum cohort size are now server-validated; creation/edit, archive, authenticated owner transfer and duplicate handling still need dedicated acceptance.
22. [ ] **Partially source-fixed — Staff onboarding workflow.** Invitation seat reservation now occurs before email delivery; repeated invitation addresses do not spend additional seats and failed delivery stays visible. Invite cancellation logs an event but does not revoke the shared code. Full guided onboarding, actual Brevo delivery and token-based invitations are outstanding.
23. [ ] **Open — Staff removal workflow.** Suspend versus remove versus leave must be explicit, reversible where safe and auditable, with immediate permission loss.
24. [ ] **Open — Role and team manager controls.** Grouped role matrix, manager/HR designations, last-owner safeguards, pending approvals, and exact access overview. Separate platform support from company-owner permissions; never impersonate private employee accounts.
25. [ ] **Open — Company billing reconciliation.** Show source, plan, seat allowance, assigned seats, pending invitations, overages and invoice/payment state; keep real Stripe/other provider activation behind separate acceptance gate.
26. [ ] **Open — Executive reporting.** Only aggregated work-design signals above configured privacy thresholds; show “insufficient data” rather than fake zero. Operational counts (invites/seats) are separate from sensitive aggregated employee signals.
27. [ ] **Open — Company support actions.** Read-only company health, contact/admin name, request history, safe note-taking, user-visible audit trail and escalation; do not add unconsented personal monitoring.

## Priority 1 — Platform Command Centre experience

28. [x] **Source-fixed — Navigation.** 15 top-level tabs reorganised into five main work areas: Overview, People & Companies, Operations, Security & Release, Insights.
29. [x] **Source-fixed — Failure visibility.** Company-list and Feedback outages no longer claim empty data; Somatic Statistics has retry; NHEI denial and rate-limit errors have improved messaging.
30. [x] **Source-fixed — Truthful summary.** `/api/admin/summary` no longer fabricates “at least 1” user or “100% completion” without sessions; provides `dataAvailability` flags and flags partial Firestore query failures.
31. [ ] **Open — Split 3,600+ line admin component.** Create smaller owned screens/components per workspace with a shared design system, navigation, loading/retry/empty primitives, responsive tables and typed API schemas; remove duplicated/legacy UI overrides.
32. [ ] **Open — Role-aware UI.** Hide controls without permission instead of exposing every advanced admin button and returning 403; server enforcement remains authoritative.
33. [ ] **Open — Real executive home.** Top-line service availability, registered accounts, company count, outstanding invites, incidents, failing integrations, privacy/retention status, costs with a real measurement window and explicit stale status.
34. [ ] **Open — Focused interaction design.** Search first, actionable filters, saved views including account category, clear task progression, keyboard accessibility, reduced motion, loading, optimistic changes with rollback, mobile screens.
35. [ ] **Open — Company access from platform admin.** Give platform staff a lawful, auditable read-only support view. Do not silently treat a platform owner as an organisation member or allow privileged access to employee recovery content.

## Priority 1 — Every other admin/backend section

36. [ ] **Open — Admin Users & Claims:** reconcile Firebase custom claims vs `admin_users` docs, expiry, owner protection, suspensions, fresh tokens, MFA enforcement and logged before/after.
37. [ ] **Open — Plans/Entitlements:** truthful effective plan, access history beyond the 100 audit entries, manual comp expiry, cancellation, trial/demo conversion, organisation sponsorship and provider state.
38. [ ] **Open — Communications:** Brevo, Twilio, push provider health, send queue, error/bounce status, opt-in, rate limits, retry/backoff, verified delivery metrics and actual versus estimated spend.
39. [ ] **Open — Privacy Operations:** retention sweep dry-run and acknowledgement, export/erasure progress, permissions/consent receipts, Calendar aggregate deletion policy and audit without exposing private content.
40. [ ] **Open — Audit Log:** complete append-only coverage for privilege, billing, company and policy mutations; pagination, retention, redaction, who/when/before/after, alert on audit write failure.
41. [ ] **Open — System Health:** actual uptime/latency/error, Cloud Run revisions, Firebase failures, queue/cron last run, quota, cost budgets and rollback. “Configured” is not “healthy”.
42. [ ] **Open — Platform Controls:** server-driven feature flags, legal document publication versioning, four-eyes approval for high-risk switches, rollback and source-of-truth for local flags.
43. [ ] **Open — Release Centre:** staging channels, app version, rollout, device revocation, signed SHA, auth gating, protected deploy environment and rollback proof.
44. [ ] **Open — Incidents:** distinguish manual incident entry from automated detection; incident owner, severity, status, timeline, evidence, alerts and review.
45. [ ] **Open — NHEI Knowledge:** reviewer claim and expiry/revocation, dual control, import validation, provenance, approval states, educational mode gate and audit.
46. [ ] **Open — Recovery Statistics & Feedback:** full data completeness, time windows, consent for testimonial reuse, private feedback retention, safe aggregated reporting and no fake empty states.
47. [ ] **Open — Nova/Evolution server-only endpoints:** registry, change governance, freeze, model spending, prompt/content/knowledge writes, context memory health, strict input validation and auditable access. Some endpoints exist without a corresponding visible admin workflow.
48. [ ] **Open — Finance and payment operations:** paid subscriptions, invoice status, failed payments, refunds, credits, subscription-owner changes, provider reconciliation. Do not activate live payments before tested billing-provider setup.

## Priority 2 — Backend architecture and proof

49. [ ] **Open — Testing.** Run all current-head Vitest/TypeScript/build, auth/Firestore emulator, permission matrix, two-company and suspended-user tests; capture exact commit SHA and logs.
50. [ ] **Open — Browser QA.** Test all five work areas and fifteen original tabs, full company creation/invite/join/remove, demo-vs-real accounts, denied access, network errors and mobile layouts.
51. [ ] **Open — Contracts and migration.** Version API responses, validate Zod request/response shapes, Firestore indexes and legacy membership migration, idempotent writes and rollback.
52. [ ] **Open — Performance.** Cursor pagination for people/orgs/audit, avoid N+1 Auth/Firestore requests, lazy load expensive panels, bound scans and query cost, backoff.
53. [ ] **Open — Operational security.** Secret scanning, App Check, Firebase token revocation, MFA, CORS, rate limits, traceability, backups, access review, privacy/retention policy.
54. [ ] **Open — Staging and launch gate.** Signed-in private staging with test accounts; safe data and email sandbox; complete runbook; rollback rehearsal; approval before merging/deploying; beta invite plan.

## Release policy

The source changes above are committed to PR #155's **draft** branch, not merged or deployed. Existing unit tests and newly authored regression tests are **NOT VERIFIED AS EXECUTED** in this ChatGPT GitHub-only environment. This document is a prioritised engineering scope, not a claim the 54 items are complete.

**Next execution order:** (a) finish remaining P0 company security, (b) paginated directory + company admin lifecycle, (c) full screen/component cleanup, (d) test all admin routes and company flow, (e) staging, (f) approval then release.
