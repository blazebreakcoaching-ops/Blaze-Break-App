import { describe, it, expect } from 'vitest';
import {
  deriveNheiConsentState,
  isNheiPurposeConsented,
  NHEI_CONSENT_FIELD,
  NHEI_CONSENT_PURPOSES,
  isValidNheiConsentPurpose,
  NHEI_EDUCATION_REQUIRES_CONSENT,
} from './nhei-consent';

describe('deriveNheiConsentState - default-off, fail-closed', () => {
  it('defaults every purpose to false when no permissions doc exists', () => {
    const state = deriveNheiConsentState(undefined);
    expect(state).toEqual({ reflection_storage: false, longitudinal_tracking: false, routing_insights: false });
  });

  it('defaults to false when the doc exists but has none of the NHEI fields', () => {
    const state = deriveNheiConsentState({ allowCheckins: true, updatedAt: '2026-01-01' });
    expect(state.reflection_storage).toBe(false);
    expect(state.longitudinal_tracking).toBe(false);
    expect(state.routing_insights).toBe(false);
  });

  it('only a literal boolean true counts as consent - not truthy strings/numbers', () => {
    const state = deriveNheiConsentState({
      allowNheiReflectionStorage: 'true',
      allowNheiLongitudinalTracking: 1,
      allowNheiRoutingInsights: true,
    });
    expect(state.reflection_storage).toBe(false);
    expect(state.longitudinal_tracking).toBe(false);
    expect(state.routing_insights).toBe(true);
  });

  it('reads all three fields independently when explicitly granted', () => {
    const state = deriveNheiConsentState({
      allowNheiReflectionStorage: true,
      allowNheiLongitudinalTracking: true,
      allowNheiRoutingInsights: false,
    });
    expect(isNheiPurposeConsented(state, 'reflection_storage')).toBe(true);
    expect(isNheiPurposeConsented(state, 'longitudinal_tracking')).toBe(true);
    expect(isNheiPurposeConsented(state, 'routing_insights')).toBe(false);
  });
});

describe('NHEI_CONSENT_FIELD mapping', () => {
  it('maps every purpose to a distinct nova_permissions field name', () => {
    const fields = NHEI_CONSENT_PURPOSES.map((p) => NHEI_CONSENT_FIELD[p]);
    expect(new Set(fields).size).toBe(fields.length);
    expect(fields.every((f) => f.startsWith('allowNhei'))).toBe(true);
  });
});

describe('isValidNheiConsentPurpose', () => {
  it('accepts the three defined purposes and rejects anything else', () => {
    expect(isValidNheiConsentPurpose('reflection_storage')).toBe(true);
    expect(isValidNheiConsentPurpose('longitudinal_tracking')).toBe(true);
    expect(isValidNheiConsentPurpose('routing_insights')).toBe(true);
    expect(isValidNheiConsentPurpose('psychological_tracking')).toBe(false);
    expect(isValidNheiConsentPurpose(undefined)).toBe(false);
  });
});

describe('general education never requires NHEI consent', () => {
  it('is a fixed false, not a runtime check against any consent state', () => {
    expect(NHEI_EDUCATION_REQUIRES_CONSENT).toBe(false);
  });
});
