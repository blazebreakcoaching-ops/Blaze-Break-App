import { describe, it, expect } from 'vitest';
import { buildNheiRecoveryNavigationPlan, NHEI_MODULE_ANCHOR_ID } from './nhei-recovery-navigation';
import { MODULE_TARGET_TAB } from './recovery-decision-copy';
import { isKnownRoutingModule } from './recovery-signal-candidates';

describe('buildNheiRecoveryNavigationPlan', () => {
  it('energy_delta resolves to the recover tab with its own verified anchor', () => {
    const plan = buildNheiRecoveryNavigationPlan('energy_delta');
    expect(plan.tab).toBe('recover');
    expect(plan.anchorId).toBe('energy-delta-tool');
  });

  it('a module with a real tab but no verified anchor yet returns a null anchorId, never a guessed one', () => {
    const plan = buildNheiRecoveryNavigationPlan('one_less_thing');
    expect(plan.tab).toBe('recover');
    expect(plan.anchorId).toBeNull();
  });

  it('an unknown module returns a null tab, never an invented destination', () => {
    const plan = buildNheiRecoveryNavigationPlan('not_a_real_module');
    expect(plan.tab).toBeNull();
    expect(plan.anchorId).toBeNull();
  });

  it('every anchor-mapped module is both a real routing module and has a real target tab', () => {
    for (const module of Object.keys(NHEI_MODULE_ANCHOR_ID)) {
      expect(isKnownRoutingModule(module)).toBe(true);
      expect(MODULE_TARGET_TAB[module]).toBeTruthy();
    }
  });
});
