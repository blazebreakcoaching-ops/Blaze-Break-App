import { describe, it, expect } from 'vitest';
import { validateFeatureRegistryUpsert } from './feature-registry-v2';
import { NHEI_FEATURE_REGISTRY_ENTRY, NHEI_FEATURE_ID } from './nhei-feature-registry-entry';
import { NHEI_CONSENT_FIELD } from './nhei-consent';
import { NHEI_EDUCATIONAL_MODE_ENV_VAR } from './nhei-educational-mode-flag';

describe('NHEI_FEATURE_REGISTRY_ENTRY', () => {
  it('passes the real registry upsert validator', () => {
    const result = validateFeatureRegistryUpsert(NHEI_FEATURE_REGISTRY_ENTRY);
    expect(result.valid).toBe(true);
  });

  it('is registered at a still-conservative lifecycle state - still draft, never flipped by this registration alone', () => {
    expect(NHEI_FEATURE_REGISTRY_ENTRY.lifecycleState).toBe('draft');
    expect(NHEI_FEATURE_REGISTRY_ENTRY.entitlementRequirement).toBeNull();
  });

  it('Phase 3C-2B Checkpoint 2: enforcementState and featureFlag now reflect Educational Mode\'s real, flagged wiring - no longer the Phase 2 "nothing wired, no flag" state', () => {
    expect(NHEI_FEATURE_REGISTRY_ENTRY.enforcementState).toBe('partially_enforced');
    expect(NHEI_FEATURE_REGISTRY_ENTRY.featureFlag).toBe(NHEI_EDUCATIONAL_MODE_ENV_VAR);
  });

  it('declares the private_recovery_vault data zone and the real consent fields it requires', () => {
    expect(NHEI_FEATURE_REGISTRY_ENTRY.dataZones).toEqual(['private_recovery_vault']);
    expect(new Set(NHEI_FEATURE_REGISTRY_ENTRY.requiredPermissions)).toEqual(new Set(Object.values(NHEI_CONSENT_FIELD)));
  });

  it('uses a well-formed, lowercase_snake_case featureId', () => {
    expect(NHEI_FEATURE_REGISTRY_ENTRY.featureId).toBe(NHEI_FEATURE_ID);
    expect(/^[a-z][a-z0-9_]{1,99}$/.test(NHEI_FEATURE_ID)).toBe(true);
  });
});
