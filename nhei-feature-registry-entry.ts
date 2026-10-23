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
import { NHEI_EDUCATIONAL_MODE_ENV_VAR } from './nhei-educational-mode-flag';

export const NHEI_FEATURE_ID = 'nova_human_experience_intelligence';

export const NHEI_FEATURE_REGISTRY_ENTRY: Omit<FeatureRegistryEntry, 'createdAt' | 'lastChangedAt'> = {
  featureId: NHEI_FEATURE_ID,
  displayName: 'Nova Human Experience Intelligence (NHEI)',
  description:
    'Coaching-intelligence layer for Nova: Trifecta of Self, Four Dimensions, ' +
    'Temporal Self Interaction, Adaptive Behaviour and Context & Agency engines. ' +
    'A coaching intelligence system, not a diagnostic or psychological ' +
    'surveillance system. Phase 1 (pure engines) and Phase 2 (consent-gated ' +
    'Firestore persistence) are built. Phase 3C-2B Checkpoint 2 wires ' +
    'Educational Mode only into POST /api/nova/chat, behind a server-only, ' +
    'default-OFF flag (see featureFlag). Phase 3C Checkpoint 3 added a second, ' +
    'independently-propagating gate (app_config/nhei_feature_state, AND-combined ' +
    'with the flag) that can disable the feature with one Firestore write, no ' +
    'redeploy - see nhei-feature-governance.ts. Personal Reflection and ' +
    'Longitudinal Mode remain entirely unwired. Disabled for all users.',
  productOwner: null,
  technicalOwner: null,
  lifecycleState: 'draft',
  // Partially, not fully, enforced: Educational Mode now has a real,
  // tested code path reachable from a live route (gated by featureFlag
  // below, defaulting off) - but Personal Reflection and Longitudinal
  // Mode remain exactly as 'not_wired' as the whole feature was before
  // this checkpoint. A single enforcementState value cannot represent
  // "one of three modes is wired" precisely, so this is the closest
  // accurate value; the notes field spells out the real split.
  enforcementState: 'partially_enforced',
  // Server-only env var (nhei-educational-mode-flag.ts), never a
  // client-visible/client-settable flag from feature-flag-ids.ts's list -
  // deliberate, since this checkpoint's own instruction is "no
  // client-provided field may bypass this gate." Recorded here purely
  // for Evolution Engine governance visibility; the real check is the
  // env-var read in server.ts's /api/nova/chat handler.
  featureFlag: NHEI_EDUCATIONAL_MODE_ENV_VAR,
  entitlementRequirement: null,
  dataZones: ['private_recovery_vault'],
  dependencies: [],
  downstreamConsumers: [],
  requiredConnectors: [],
  // The three nova_permissions fields any future wiring of this feature
  // must check before reading or writing NHEI data - named here so the
  // registry records the real requirement rather than leaving it
  // implicit in code only. Educational Mode itself needs none of these -
  // it is explicitly accessible without NHEI tracking consent - but they
  // remain listed because Personal Reflection/Longitudinal Mode (still
  // unwired) will need them the moment either is ever connected.
  requiredPermissions: Object.values(NHEI_CONSENT_FIELD),
  minAppVersion: null,
  fallbackMode: 'disabled',
  rollbackMethod:
    'Fast path: set app_config/nhei_feature_state.educationalModeEnabled=false (one Firestore write, no deploy). ' +
    'Slow path: unset the env var - Cloud Run needs a new revision for that, not instant.',
  expectedFlagRetirement: null,
  notes:
    'Registered at Phase 2 checkpoint per architecture approval; updated at Phase 3C-2B Checkpoint 2 once ' +
    'Educational Mode gained a real, flagged, default-off code path. Do not set the featureFlag env var to "true" ' +
    'and do not flip lifecycleState past draft without a separate approval checkpoint - this registration ' +
    'describes what exists and is tested, not an activation decision.',
};
