// NHEI PHASE 2 - FEATURE REGISTRY v2 ENTRY (DRAFT)
//
// The canonical FeatureRegistryEntry for NHEI, registered at the most
// conservative lifecycle/enforcement state the schema has:
//   * lifecycleState: 'draft'            - "Initial lifecycle state must
//                                           be draft."
//   * enforcementState: 'not_wired'      - genuinely true today: nothing
//                                           in server.ts imports
//                                           nhei-persistence-service.ts,
//                                           and no route or UI references
//                                           it.
//   * featureFlag: null                  - no flag exists for it; adding
//                                           one now, with nothing reading
//                                           it, would be exactly the kind
//                                           of "orphan flag" this
//                                           registry's own comments warn
//                                           about.
//   * entitlementRequirement: null       - not gated on a plan, because
//                                           it isn't reachable at all yet.
//
// This file defines and validates the entry object itself
// (nhei-feature-registry-entry.test.ts proves it passes
// validateFeatureRegistryUpsert from feature-registry-v2.ts). Actually
// persisting it into the live `platform_feature_registry` Firestore
// collection means calling the real admin endpoint
// (POST /api/admin/evolution/registry) against a real environment with
// Evolution Engine admin access - an operational action, not a code
// change, and one this Phase 2 delivery deliberately does not perform
// (no deploy, no production-facing activation as a side effect of
// registering the feature). See the Phase 2 delivery report for the
// exact approval being requested for that step.

import type { FeatureRegistryEntry } from './feature-registry-v2';
import { NHEI_CONSENT_FIELD } from './nhei-consent';

export const NHEI_FEATURE_ID = 'nova_human_experience_intelligence';

export const NHEI_FEATURE_REGISTRY_ENTRY: Omit<FeatureRegistryEntry, 'createdAt' | 'lastChangedAt'> = {
  featureId: NHEI_FEATURE_ID,
  displayName: 'Nova Human Experience Intelligence (NHEI)',
  description:
    'Coaching-intelligence layer for Nova: Trifecta of Self, Four Dimensions, ' +
    'Temporal Self Interaction, Adaptive Behaviour and Context & Agency engines. ' +
    'A coaching intelligence system, not a diagnostic or psychological ' +
    'surveillance system. Phase 1 (pure engines) and Phase 2 (consent-gated ' +
    'Firestore persistence) are built; disabled for all users; not wired into ' +
    'any route, UI or live Nova prompt.',
  productOwner: null,
  technicalOwner: null,
  lifecycleState: 'draft',
  enforcementState: 'not_wired',
  featureFlag: null,
  entitlementRequirement: null,
  dataZones: ['private_recovery_vault'],
  dependencies: [],
  downstreamConsumers: [],
  requiredConnectors: [],
  // The three nova_permissions fields any future wiring of this feature
  // must check before reading or writing NHEI data - named here so the
  // registry records the real requirement rather than leaving it
  // implicit in code only.
  requiredPermissions: Object.values(NHEI_CONSENT_FIELD),
  minAppVersion: null,
  fallbackMode: 'disabled',
  rollbackMethod: 'Set lifecycleState back to draft / featureFlag stays unset; no persisted NHEI data is read by any other feature, so rollback cannot cascade.',
  expectedFlagRetirement: null,
  notes:
    'Registered at Phase 2 checkpoint per architecture approval. No feature flag ' +
    'exists yet because nothing reads one - see enforcementState. Do not flip ' +
    'lifecycleState past draft without a separate approval checkpoint.',
};
