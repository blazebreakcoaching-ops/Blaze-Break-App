# Phase 2 — complete source inventory, integration vs main
Date: 9 November 2026
Repository: `blazebreakcoaching-ops/Blaze-Break-App`
Audited integration commit: `242c0a2f4e9d1a3531c74e8f7adf45bd636fff84`
Approach: exhaustive Git trees, **not** GitHub's 300-file comparison cap.

## Counters
- `main` files: 717
- Integration files: 1271
- Shared files with identical blob SHA: 482
- Shared files with different blob SHA: 230
- Only on `main`: 5
- Only on integration: 559
- In-scope PR #159: additive integration commits on top of the multilingual base.

The differences below are **inventory, not an assertion of semantic merge safety**.
Full review and offline tests are needed before either branch can become a
release source of truth. No wholesale copy, automatic merge or deletion was done.

## Only on main — disposition
- `docs/NHEI_ADAPTIVE_INTELLIGENCE.md` — legacy NHEI reference/helper/contract. Do **not** blindly copy: newer outcome/feedback/permission behaviour exists on integration. Inspect before any future port.
- `nhei-integration-contract.test.ts` — legacy NHEI reference/helper/contract. Do **not** blindly copy: newer outcome/feedback/permission behaviour exists on integration. Inspect before any future port.
- `nhei-routing-outcome.test.ts` — legacy NHEI reference/helper/contract. Do **not** blindly copy: newer outcome/feedback/permission behaviour exists on integration. Inspect before any future port.
- `nhei-routing-outcome.ts` — legacy NHEI reference/helper/contract. Do **not** blindly copy: newer outcome/feedback/permission behaviour exists on integration. Inspect before any future port.
- `nhei-security-contract.test.ts` — legacy NHEI reference/helper/contract. Do **not** blindly copy: newer outcome/feedback/permission behaviour exists on integration. Inspect before any future port.

## Shared differing paths (complete list; 230 total)
### Critical backend/navigation (4)
- `firestore.indexes.json`
- `firestore.rules`
- `server.ts`
- `src/App.tsx`

### Documentation (8)
- `docs/API_PROVIDER_MAP.md`
- `docs/AUTH_HARDENING_AND_SOCIAL_LOGIN.md`
- `docs/DEPLOY.md`
- `docs/INTEGRATIONS_SETUP.md`
- `docs/MOBILE_SUBSCRIPTIONS.md`
- `docs/NOVA_ENV_VARS.md`
- `docs/RECOVERY_OUTCOMES_INTELLIGENCE.md`
- `docs/legal/PRIVACY_NOTICE.md`

### Other (39)
- `.env.example`
- `.github/workflows/deploy.yml`
- `.gitignore`
- `admin-roles.ts`
- `ai-model-registry.ts`
- `cost-estimates.ts`
- `dashboard-greeting.ts`
- `functions/src/index.ts`
- `index.html`
- `mobile/app.json`
- `mobile/app/(tabs)/_layout.tsx`
- `mobile/app/(tabs)/checkin/index.tsx`
- `mobile/app/(tabs)/index.tsx`
- `mobile/app/(tabs)/reset/blame.tsx`
- `mobile/app/(tabs)/reset/index.tsx`
- `mobile/app/(tabs)/reset/nervous-system.tsx`
- `mobile/app/(tabs)/reset/sleep.tsx`
- `mobile/app/_layout.tsx`
- `mobile/app/account.tsx`
- `mobile/app/sign-in.tsx`
- `mobile/app/sign-up.tsx`
- `mobile/package-lock.json`
- `mobile/package.json`
- `mobile/src/components/BlameLocateAcceptExchange.tsx`
- `mobile/src/components/DailyCheckInModal.tsx`
- `mobile/src/lib/app-check.ts`
- `mobile/src/lib/auth-context.tsx`
- `mobile/src/lib/config.ts`
- `mobile/src/lib/firebase.ts`
- `mobile/src/lib/secure-api.ts`
- `nova-tools.ts`
- `package-lock.json`
- `package.json`
- `sso-config.ts`
- `test-rules.cjs`
- `test/fake-firestore.ts`
- `user-data-collections.ts`
- `vite.config.ts`
- `vitest.config.ts`

### Security/feature integration (35)
- `nhei-adaptive-intelligence.test.ts`
- `nhei-adaptive-intelligence.ts`
- `nova-runtime-registry.test.ts`
- `nova-runtime-registry.ts`
- `org-billing.route.test.ts`
- `org-connectors.route.test.ts`
- `org-data-policy.route.test.ts`
- `org-me.route.test.ts`
- `org-rbac.route.test.ts`
- `org-rbac.ts`
- `org-search.route.test.ts`
- `recovery-decision-copy.ts`
- `recovery-outcomes-intelligence.test.ts`
- `recovery-outcomes-intelligence.ts`
- `recovery-outcomes.route.test.ts`
- `recovery-recalculate.route.test.ts`
- `recovery-routing-decision.route.test.ts`
- `recovery-routing-outcome.route.test.ts`
- `recovery-signal-candidates.test.ts`
- `recovery-signal-candidates.ts`
- `src/components/AdminDashboard.tsx`
- `src/components/EvolutionEngine.tsx`
- `src/components/ExecutiveBoardReport.tsx`
- `src/components/NovaChat.tsx`
- `src/components/OrgDashboard.tsx`
- `src/components/OrgDashboardMoments.tsx`
- `src/components/OrgDashboardValue.tsx`
- `src/components/PrivacyVault.tsx`
- `src/components/RecoveryIntelligenceHub.tsx`
- `src/lib/auth.test.ts`
- `src/lib/auth.tsx`
- `src/lib/firebase.ts`
- `src/lib/firestore.ts`
- `src/lib/nova-brain.ts`
- `src/lib/secure-api.ts`

### Test coverage (40)
- `account-security.route.test.ts`
- `admin-audit-log-resilience.route.test.ts`
- `admin-incidents.route.test.ts`
- `admin-orgs.route.test.ts`
- `admin-permission-enforcement.route.test.ts`
- `admin-summary.route.test.ts`
- `admin-users-list.route.test.ts`
- `admin-users.route.test.ts`
- `ai-model-registry.test.ts`
- `diagnose-narrative-style-tone.route.test.ts`
- `error-message-leak-guardrail.test.ts`
- `evolution-nova-runtime.route.test.ts`
- `executive-work-design.route.test.ts`
- `mfa-defensive-errors.route.test.ts`
- `nova-brain.test.ts`
- `nova-chat-safety.route.test.ts`
- `nova-live-websocket.test.ts`
- `nova-manager-coach-chat.route.test.ts`
- `nova-memory-context.route.test.ts`
- `nova-tools.test.ts`
- `oauth-integrations.route.test.ts`
- `positive-reinforcement.route.test.ts`
- `pressure-transfer-detector.route.test.ts`
- `protected-core-invariants.test.ts`
- `provider-signal-routes.route.test.ts`
- `recommendation.route.test.ts`
- `sso-config.route.test.ts`
- `sso-config.test.ts`
- `team-dashboard.route.test.ts`
- `team-escalation.route.test.ts`
- `trust-mirror-privacy-receipts.route.test.ts`
- `user-data-collections.test.ts`
- `user-data-endpoints.route.test.ts`
- `wdi-end-to-end.test.ts`
- `work-design-debt.route.test.ts`
- `work-design-drift-detector.route.test.ts`
- `work-design-interventions.route.test.ts`
- `work-design-pulse-end-to-end.test.ts`
- `workplace-governance.route.test.ts`
- `workplace-policy.route.test.ts`

### User experience/localisation (104)
- `src/components/AccountStatusBanner.tsx`
- `src/components/AdaptiveFeedbackHistory.tsx`
- `src/components/AllyNudgeScheduler.tsx`
- `src/components/AllyView.tsx`
- `src/components/AnonymousSuggestionBox.tsx`
- `src/components/ArchetypeBlend.tsx`
- `src/components/AssuranceCentre.tsx`
- `src/components/AuthActionPage.tsx`
- `src/components/BLAMEResetOverlay.tsx`
- `src/components/BlameLocateAcceptExchange.tsx`
- `src/components/BoundaryAutopilot.tsx`
- `src/components/BoundaryRehearsal.tsx`
- `src/components/CalendarDefenseView.tsx`
- `src/components/CapacityField.tsx`
- `src/components/ConnectedRecoveryModules.tsx`
- `src/components/ConsentMatrix.tsx`
- `src/components/CrisisSupport.tsx`
- `src/components/DailyGoal.tsx`
- `src/components/DataPrivacyDashboard.tsx`
- `src/components/DataZoneVisualizer.tsx`
- `src/components/DebtTracker.tsx`
- `src/components/DiagnoseSection.tsx`
- `src/components/DigitalBoundaryShield.tsx`
- `src/components/EmailVerificationBanner.tsx`
- `src/components/EnergyBudget.tsx`
- `src/components/EnergyBudgetMatrix.tsx`
- `src/components/FaithValuesMode.tsx`
- `src/components/FeatureFlagsView.tsx`
- `src/components/FeedbackForm.tsx`
- `src/components/FocusZone.tsx`
- `src/components/FrictionFinder.tsx`
- `src/components/FutureSelfSimulator.tsx`
- `src/components/Gad7Check.tsx`
- `src/components/GamificationDisplay.tsx`
- `src/components/GroundingCarryingExercise.tsx`
- `src/components/GroundingExploreThis.tsx`
- `src/components/GroundingMonthlyReflection.tsx`
- `src/components/GroundingResetFlow.tsx`
- `src/components/GroundingRoutines.tsx`
- `src/components/GroundingSavedReflections.tsx`
- `src/components/HomeSection.tsx`
- `src/components/HrEscalationDashboard.tsx`
- `src/components/InAppNudge.tsx`
- `src/components/IntegrationsDashboard.tsx`
- `src/components/LandingPage.tsx`
- `src/components/LegalDocumentModal.tsx`
- `src/components/MemoryCentre.tsx`
- `src/components/MfaChallenge.tsx`
- `src/components/MicroInterventions.tsx`
- `src/components/MicroRecovery.tsx`
- `src/components/MovementSnacks.tsx`
- `src/components/NegotiatorTool.tsx`
- `src/components/NervousSystemReset.tsx`
- `src/components/NotificationSettingsView.tsx`
- `src/components/NovaFeedbackModal.tsx`
- `src/components/NovaGuardianRelay.tsx`
- `src/components/NovaOverloadShield.tsx`
- `src/components/NovaRecommendationCard.tsx`
- `src/components/NovaVoiceCall.tsx`
- `src/components/OmniBrainMap.tsx`
- `src/components/OmniNova.tsx`
- `src/components/OneLessThing.tsx`
- `src/components/OrgManagerCoachChat.tsx`
- `src/components/OutcomeTracker.tsx`
- `src/components/PastNovaMemoriesReview.tsx`
- `src/components/PrivacyPolicyAccordion.tsx`
- `src/components/RecommendationLedger.tsx`
- `src/components/RecoveryAlly.tsx`
- `src/components/RecoveryExplanation.tsx`
- `src/components/RecoveryFuelEngine.tsx`
- `src/components/RecoveryHistoryChart.tsx`
- `src/components/RecoveryIntelligenceLayer.tsx`
- `src/components/RecoveryPlan.tsx`
- `src/components/RecoveryVelocityMap.tsx`
- `src/components/ReflectSection.tsx`
- `src/components/RelapseRadar.tsx`
- `src/components/ResetStudio.tsx`
- `src/components/SecondMemoryCard.tsx`
- `src/components/SecuritySettingsView.tsx`
- `src/components/SettingsModal.tsx`
- `src/components/SituationalOnboarding.tsx`
- `src/components/SixtySecondCheckIn.tsx`
- `src/components/SleepBuilder.tsx`
- `src/components/SmartCard.tsx`
- `src/components/SomaticCheckInCard.tsx`
- `src/components/SomaticResetOverlay.tsx`
- `src/components/SubscriptionCentre.tsx`
- `src/components/TeamClimateSurvey.tsx`
- `src/components/TeamDashboard.tsx`
- `src/components/TrustCentrePage.tsx`
- `src/components/UserGuide.tsx`
- `src/components/Walkthrough.tsx`
- `src/components/WeeklyGoalTracker.tsx`
- `src/components/WhatsNewModal.tsx`
- `src/components/WorkDesignSignalCard.tsx`
- `src/components/WorkloadRealityCheck.tsx`
- `src/index.css`
- `src/lib/audit-logger.ts`
- `src/lib/boundary-autopilot.ts`
- `src/lib/mfa-session.ts`
- `src/lib/useGuardianSupportInvitationEnabled.ts`
- `src/lib/useNovaLiveVoice.ts`
- `src/main.tsx`
- `src/types.ts`

## Integration-only paths
559 paths are unique to integration, including multilingual
packs, protected recovery flows, consent/session guards, reviewed safety-gate
source and mobile/newer platform integrations. Their existence is not a test
pass and they must be preserved during any later branch consolidation.

## Branch policy
- Keep PR #159 **draft** based on `integration/nhei-multilingual-20261108`.
- Do not overwrite `server.ts`, Firestore rules/indexes, Auth, Nova cache,
  feature registration or native files from a stale `main` snapshot.
- A person responsible for release must first establish a tested base,
  reconcile incompatible versions on an integration checkout, and run the
  approved exact-SHA offline gate. This phase does **not** authorise a
  merge, staging deployment or automatic activation of NHEI.
