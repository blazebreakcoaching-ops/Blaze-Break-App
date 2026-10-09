import { describe, it, expect } from 'vitest';
import {
  validateFeatureRegistryUpsert,
  isGovernanceWarning,
  migrateLegacyFeatureEntry,
  migrateOrphanFlagEntry,
  buildInitialRegistry,
  LegacyFeatureDefinition,
} from './feature-registry-v2';

const validEntry = () => ({
  featureId: 'nova_overload_shield',
  displayName: 'Nova Overload Shield',
  description: 'Monitors pressure signals.',
  productOwner: null,
  technicalOwner: null,
  lifecycleState: 'live',
  enforcementState: 'fully_enforced',
  featureFlag: 'enable_overload_shield',
  entitlementRequirement: null,
  dataZones: ['private_recovery_vault'],
  dependencies: ['energy_budget'],
  downstreamConsumers: [],
  requiredConnectors: [],
  requiredPermissions: [],
  minAppVersion: null,
  fallbackMode: null,
  rollbackMethod: null,
  expectedFlagRetirement: null,
  notes: null,
});

describe('validateFeatureRegistryUpsert', () => {
  it('accepts a well-formed entry', () => {
    expect(validateFeatureRegistryUpsert(validEntry())).toEqual({ valid: true });
  });

  it('rejects a missing/malformed featureId', () => {
    expect(validateFeatureRegistryUpsert({ ...validEntry(), featureId: 'Nova Shield' }).valid).toBe(false);
    expect(validateFeatureRegistryUpsert({ ...validEntry(), featureId: '' }).valid).toBe(false);
    expect(validateFeatureRegistryUpsert({ ...validEntry(), featureId: 123 }).valid).toBe(false);
  });

  it('rejects a missing displayName', () => {
    expect(validateFeatureRegistryUpsert({ ...validEntry(), displayName: '' }).valid).toBe(false);
  });

  it('rejects an invalid lifecycleState', () => {
    expect(validateFeatureRegistryUpsert({ ...validEntry(), lifecycleState: 'enabled' }).valid).toBe(false);
  });

  it('rejects an invalid enforcementState', () => {
    expect(validateFeatureRegistryUpsert({ ...validEntry(), enforcementState: 'active' }).valid).toBe(false);
  });

  it('rejects invalid dataZones entries', () => {
    expect(validateFeatureRegistryUpsert({ ...validEntry(), dataZones: ['some_random_zone'] }).valid).toBe(false);
  });

  it('rejects a non-array-of-strings dependencies field', () => {
    expect(validateFeatureRegistryUpsert({ ...validEntry(), dependencies: 'energy_budget' }).valid).toBe(false);
    expect(validateFeatureRegistryUpsert({ ...validEntry(), dependencies: [1, 2] }).valid).toBe(false);
  });

  it('allows null for nullable short-string fields', () => {
    expect(validateFeatureRegistryUpsert({ ...validEntry(), productOwner: null, featureFlag: null }).valid).toBe(true);
  });
});

describe('isGovernanceWarning', () => {
  it('flags a live feature that is not fully enforced', () => {
    expect(isGovernanceWarning({ lifecycleState: 'live', enforcementState: 'not_wired' })).toBe(true);
    expect(isGovernanceWarning({ lifecycleState: 'public_beta', enforcementState: 'unknown' })).toBe(true);
    expect(isGovernanceWarning({ lifecycleState: 'private_beta', enforcementState: 'partially_enforced' })).toBe(true);
  });

  it('does not flag a live feature that is fully enforced', () => {
    expect(isGovernanceWarning({ lifecycleState: 'live', enforcementState: 'fully_enforced' })).toBe(false);
  });

  it('does not flag a draft/deprecated feature regardless of enforcement', () => {
    expect(isGovernanceWarning({ lifecycleState: 'draft', enforcementState: 'not_wired' })).toBe(false);
    expect(isGovernanceWarning({ lifecycleState: 'deprecated', enforcementState: 'unknown' })).toBe(false);
  });
});

describe('migrateLegacyFeatureEntry', () => {
  const legacy: LegacyFeatureDefinition = {
    id: 'nova_overload_shield',
    name: 'Nova Overload Shield',
    purpose: 'Monitors pressure.',
    status: 'active',
    riskLevel: 'high',
    allowedConnections: ['calendar_integration', 'energy_budget'],
    featureFlagName: 'enable_overload_shield',
  };

  it('maps legacy status to the new lifecycle vocabulary', () => {
    expect(migrateLegacyFeatureEntry(legacy, new Set()).lifecycleState).toBe('live');
    expect(migrateLegacyFeatureEntry({ ...legacy, status: 'planned' }, new Set()).lifecycleState).toBe('draft');
    expect(migrateLegacyFeatureEntry({ ...legacy, status: 'disabled' }, new Set()).lifecycleState).toBe('frozen');
    expect(migrateLegacyFeatureEntry({ ...legacy, status: 'archived' }, new Set()).lifecycleState).toBe('deprecated');
  });

  it('marks enforcement fully_enforced only when the flag is confirmed wired, never invented', () => {
    const wired = migrateLegacyFeatureEntry(legacy, new Set(['enable_overload_shield']));
    expect(wired.enforcementState).toBe('fully_enforced');
    expect(wired.notes).toMatch(/confirmed read outside the registry/);

    const unwired = migrateLegacyFeatureEntry(legacy, new Set());
    expect(unwired.enforcementState).toBe('unknown');
    expect(unwired.notes).toMatch(/not read anywhere outside the registry/);
  });

  it('carries dependencies forward from allowedConnections without alteration', () => {
    const entry = migrateLegacyFeatureEntry(legacy, new Set());
    expect(entry.dependencies).toEqual(['calendar_integration', 'energy_budget']);
  });

  it('maps a recognised legacy data_zone string, and omits an unrecognised one rather than guessing', () => {
    const withZone = migrateLegacyFeatureEntry({ ...legacy, data_zone: 'Private Recovery Vault' }, new Set());
    expect(withZone.dataZones).toEqual(['private_recovery_vault']);

    const withUnknownZone = migrateLegacyFeatureEntry({ ...legacy, data_zone: 'Some Legacy Zone Nobody Mapped' }, new Set());
    expect(withUnknownZone.dataZones).toEqual([]);
  });

  it('never fabricates an owner', () => {
    const entry = migrateLegacyFeatureEntry(legacy, new Set());
    expect(entry.productOwner).toBeNull();
    expect(entry.technicalOwner).toBeNull();
  });
});

describe('migrateOrphanFlagEntry', () => {
  it('marks a wired orphan flag fully_enforced and an unwired one not_wired', () => {
    expect(migrateOrphanFlagEntry('enable_energy_delta_v1', new Set(['enable_energy_delta_v1'])).enforcementState).toBe('fully_enforced');
    expect(migrateOrphanFlagEntry('enable_energy_delta_v1', new Set()).enforcementState).toBe('not_wired');
  });

  it('derives a readable featureId and displayName from the flag id', () => {
    const entry = migrateOrphanFlagEntry('enable_energy_delta_v1', new Set());
    expect(entry.featureId).toBe('energy_delta_v1');
    expect(entry.displayName).toBe('Energy Delta V1');
  });

  it('always starts as draft lifecycle - no evidence it ever shipped as a described feature', () => {
    expect(migrateOrphanFlagEntry('compliance_gdpr_active', new Set()).lifecycleState).toBe('draft');
  });
});

describe('buildInitialRegistry', () => {
  const legacyRegistry: Record<string, LegacyFeatureDefinition> = {
    nova_overload_shield: {
      id: 'nova_overload_shield',
      name: 'Nova Overload Shield',
      purpose: 'Monitors pressure.',
      status: 'active',
      riskLevel: 'high',
      allowedConnections: [],
      featureFlagName: 'enable_overload_shield',
    },
  };
  const allFlagIds = ['enable_overload_shield', 'enable_nova_voice', 'compliance_gdpr_active'];

  it('produces one entry per legacy feature plus one per orphan flag, with no flag double-counted', () => {
    const result = buildInitialRegistry(legacyRegistry, allFlagIds, ['enable_overload_shield', 'enable_nova_voice']);
    expect(result).toHaveLength(3);
    const ids = result.map((e) => e.featureId);
    expect(ids).toContain('nova_overload_shield');
    expect(ids).toContain('nova_voice');
    expect(ids).toContain('compliance_gdpr_active');
  });

  it('respects the wired-flag allowlist exactly - no flag is marked enforced without being named', () => {
    const result = buildInitialRegistry(legacyRegistry, allFlagIds, ['enable_overload_shield']);
    const shield = result.find((e) => e.featureId === 'nova_overload_shield')!;
    const voice = result.find((e) => e.featureId === 'nova_voice')!;
    expect(shield.enforcementState).toBe('fully_enforced');
    expect(voice.enforcementState).toBe('not_wired');
  });
});
