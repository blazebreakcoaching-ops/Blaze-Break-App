import { describe, it, expect } from 'vitest';
import { validateFeatureRegistryUpsert } from './feature-registry-v2';
import { NHEI_FEATURE_REGISTRY_ENTRY, NHEI_FEATURE_ID } from './nhei-feature-registry-entry';
import { NHEI_CONSENT_FIELD } from './nhei-consent';

describe('NHEI_FEATURE_REGISTRY_ENTRY', () => {
  it('passes the real registry upsert validator', () => {
    const result = validateFeatureRegistryUpsert(NHEI_FEATURE_REGISTRY_ENTRY);
    expect(result.valid).toBe(true);
  });

  it('is registered at the most conservative lifecycle/enforcement state', () => {
    expect(NHEI_FEATURE_REGISTRY_ENTRY.lifecycleState).toBe('draft');
    expect(NHEI_FEATURE_REGISTRY_ENTRY.enforcementState).toBe('not_wired');
    expect(NHEI_FEATURE_REGISTRY_ENTRY.featureFlag).toBeNull();
    expect(NHEI_FEATURE_REGISTRY_ENTRY.entitlementRequirement).toBeNull();
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
