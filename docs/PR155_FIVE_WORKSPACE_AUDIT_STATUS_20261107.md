# Blaze Break — Five main workspaces: audit status
Date: 7 November 2026 • PR #155 (DRAFT, unmerged)
This is a source-inventory and gap register. **None of the five workspaces has passed complete runtime, integration and staging QA at the current SHA.**

## 1. Organisation — PARTIAL SOURCE AUDIT
Primary entry: `src/App.tsx` -> `src/components/OrgDashboard.tsx`. Customer org admin also uses `TeamDashboard`, `HrEscalationDashboard`, `ExecutiveWorkDesignReport`. Organisation tabs: Pulse, Value, Moments, Team, Governance.
Already reviewed: company provisioning, memberships, invitations, roles, HR/manager grants, staff suspension, parts of billing/privacy and the platform-level company detail. Suspended-member role check and platform company support improvements are now in the draft source.
Outstanding P0: atomic seat cap for join codes; revocable invitations; full leave/removal cleanup of HR/manager access; approved ownership transfer; test multi-org isolation, privacy thresholds, legacy roles. Check all tab content, errors, CSV import, billing, SSO, data policy, dashboard loading and mobile UX.
Evidence: `docs/PR155_COMPANY_STAFF_ADMIN_AUDIT_20261107.md`, `docs/PR155_SUPERADMIN_BACKEND_RESTRUCTURE_PLAN_20261107.md`.

## 2. Evolution Engine — INVENTORY / NOT FULLY AUDITED
Primary entry: `src/components/EvolutionEngine.tsx` (~2,000 lines). Navigation declares 14 sections: Overview, Registry, Effective Configuration, Change Proposals, Dependency Map, Protected Core, Nova Context Brain, Connector Layer, Rollouts, Evaluations, Release Health, Flag Debt, Audit, Advanced.
Source explicitly marks **Evaluations** and **Advanced** as not built (Shadow Mode/Replay Lab and granular evolution_* authorization). Many endpoints live at `/api/admin/evolution/*` and have individual tests; those tests were not executed. Must review role boundaries, feature flags, freeze behavior, protected core, approval/apply actions, costs, rollout status and errors. `secureApiFetch` throws on non-2xx, so UI branches checking `!res.ok` after it require review for unreachable logic.

## 3. Intelligence Layer — FIRST-PASS INVENTORY / NOT FULLY AUDITED
Primary entry: `src/components/RecoveryIntelligenceLayer.tsx` (~1,461 lines) plus `OutcomeTracker`.
Client directly loads personal mood/trigger/wins/preferences from Firestore; derived summaries are pulled from `users/{uid}/derived/*`; server `POST /api/recovery/recalculate` performs recalculation. Demo mode seeds illustrative summaries without persistence.
Must audit state reset when Firebase UID changes, stale asynchronous reads, preference autosave errors, missing data vs empty data, consent and personal privacy, score provenance, demo-vs-real separation, recalculation costs, persistence/retry and mobile accessibility. Do not presume a successful server-side or browser test.

## 4. Recovery Report — FIRST-PASS INVENTORY / NOT FULLY AUDITED
Primary entry: `src/components/ExecutiveBoardReport.tsx` (~719 lines) and `GET /api/signals/executive-report`. A distinct organisation report exists at `ExecutiveWorkDesignReport.tsx`.
**Confirmed source mismatch:** the personal report's export labels refer to PDF, but `executeDownloadBlob` creates `text/html` and downloads a `.html` file for later browser printing. Do not mark real PDF export as complete. Must review missing/invalid metrics, date windows, report completeness, identity data, print/export, embedded content escaping, consent/privacy, accuracy, zero-data handling, and export logs/tests. Organisation report separately requires privacy-threshold and aggregate-only verification.

## 5. Command Centre — BROAD SOURCE AUDIT / PARTIAL FIXES / NOT SIGNED OFF
Primary entry: `src/components/AdminDashboard.tsx` (~3,815 lines) and 59 `/api/admin/*` routes.
All 15 visible sections were inventoried: Overview, Users, Entitlements, Admins, Organisations, Communications, Privacy, Audit, Health, Controls, Release, Incidents, NHEI Review, Somatic Stats, Feedback.
Draft improvements: grouped navigation, readable People directory, demo-account filtering, company staff/seat summary, clearer errors, truthful availability states and role checks. Still not proven with a complete suite.
Outstanding: full directory beyond 100 Firestore records, identity reconciliation, sign-in security event history, all-action role matrix, staging and backend monitoring, audit completeness, maintenance splits, and the P0 org lifecycle issues.
Evidence: `docs/PR155_PLATFORM_ADMIN_ALL_SECTIONS_REVIEW_20261107.md`.

## Release decision / next audit order
**NO-GO** for merging or production release. All five need source-boundary review, role/permission tests, state/error behavior checks, real integration tests, browser QA and staging proof at the same commit.
Work order: (1) P0 Organisation security and tenant isolation; (2) Command Centre directory and company management; (3) Evolution Engine permissions/freeze/proposal apply; (4) Intelligence Layer private state and data quality; (5) Recovery Report honest export and numerical accuracy; (6) end-to-end cross-workspace integration and sign-off.
No GitHub Actions run, deployment, Firestore mutation, or production merge is authorised by this document.
