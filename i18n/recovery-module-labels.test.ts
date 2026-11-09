import { describe, expect, it } from 'vitest';
import { MODULE_DISPLAY_NAMES, MODULE_TARGET_TAB } from '../recovery-decision-copy';
import { MODULE_ROUTE_MAP } from '../recovery-signal-candidates';
import { LOCALE_CODES, PACKS, en } from './index';
import { localizedRecoveryModuleName } from './recovery-module-labels';

describe('recovery module names in the multilingual feedback view', () => {
  it('covers the entire routing catalogue, not only the visible sample modules', () => {
    const ids = Object.keys(MODULE_ROUTE_MAP).sort();
    expect(Object.keys(MODULE_DISPLAY_NAMES).sort()).toEqual(ids);
    expect(Object.keys(MODULE_TARGET_TAB).sort()).toEqual(ids);
    for (const code of LOCALE_CODES) {
      for (const id of [...ids, 'unknown']) {
        const key = `module.${id}` as keyof typeof en;
        const text = PACKS[code][key];
        expect(typeof text).toBe('string');
        expect(text?.trim().length).toBeGreaterThan(0);
      }
    }
  });

  it('never exposes a raw internal module ID for unknown records', () => {
    expect(localizedRecoveryModuleName('en', 'not-a-module')).toBe('Recovery tool');
    expect(localizedRecoveryModuleName('fr', 'not-a-module')).toBe(PACKS.fr['module.unknown']);
    expect(localizedRecoveryModuleName('ar', null)).toBe(PACKS.ar['module.unknown']);
  });

  it('uses the selected language without altering persisted route identifiers', () => {
    expect(localizedRecoveryModuleName('es', 'guided_reset')).toBe(PACKS.es['module.guided_reset']);
    expect(localizedRecoveryModuleName('ar', 'support_circle')).toBe(PACKS.ar['module.support_circle']);
    expect(localizedRecoveryModuleName('en', 'guided_reset')).toBe(MODULE_DISPLAY_NAMES.guided_reset);
  });
});
