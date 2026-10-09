import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { TAB_VISIBILITY_RULES, resolveTabVisibility, isTabVisible } from './tab-visibility';
import { PLATFORM_ADMIN_ROLES, EVOLUTION_ENGINE_ROLES } from './admin-roles';

const hasEntitlement = (tier: string, featureId: string): boolean => {
  // Mirrors the one real, specific rule in src/lib/entitlement.ts's
  // hasSubscriptionEntitlement that this test cares about exercising
  // (energy_budget) - kept deliberately tiny and NOT a full reimplementation,
  // since this file's job is to test resolveTabVisibility's own logic, not
  // to re-verify entitlement.ts (which has its own real callers/tests).
  if (featureId === 'energy_budget') return tier !== 'free';
  return true;
};

describe('resolveTabVisibility (pure logic)', () => {
  const diagnoseRule = TAB_VISIBILITY_RULES.find((r) => r.id === 'diagnose')!;
  const recoverRule = TAB_VISIBILITY_RULES.find((r) => r.id === 'recover')!;
  const privacyRule = TAB_VISIBILITY_RULES.find((r) => r.id === 'privacy')!;
  const adminRule = TAB_VISIBILITY_RULES.find((r) => r.id === 'admin')!;

  it('always hides the privacy tab regardless of role/tier', () => {
    expect(resolveTabVisibility(privacyRule, 'individual', 'free', hasEntitlement).visible).toBe(false);
    expect(resolveTabVisibility(privacyRule, 'platform_owner', 'executive_digital', hasEntitlement).visible).toBe(false);
  });

  it('lets every platform-staff role bypass a tab whose roles list does not include it', () => {
    for (const role of PLATFORM_ADMIN_ROLES) {
      expect(resolveTabVisibility(diagnoseRule, role, 'free', hasEntitlement).visible).toBe(true);
    }
  });

  it('hides a tab from a role not in its roles list', () => {
    const res = resolveTabVisibility(diagnoseRule, 'recovery_ally', 'free', hasEntitlement);
    expect(res.visible).toBe(false);
    expect(res.reason).toMatch(/not in this tab's allowed roles/);
  });

  it('hides a tab with no role supplied', () => {
    const res = resolveTabVisibility(diagnoseRule, undefined, 'free', hasEntitlement);
    expect(res.visible).toBe(false);
    expect(res.reason).toBe('Hidden - no role supplied.');
  });

  it('gates a tab with a featureId through hasEntitlement', () => {
    expect(resolveTabVisibility(recoverRule, 'individual', 'free', hasEntitlement).visible).toBe(false);
    expect(resolveTabVisibility(recoverRule, 'individual', 'pro', hasEntitlement).visible).toBe(true);
  });

  it('allows a tab with no featureId once the role check passes', () => {
    const homeRule = TAB_VISIBILITY_RULES.find((r) => r.id === 'home')!;
    expect(resolveTabVisibility(homeRule, 'individual', 'free', hasEntitlement).visible).toBe(true);
  });

  it('every tab using [...EVOLUTION_ENGINE_ROLES] or [...PLATFORM_ADMIN_ROLES] actually resolves true for every one of those roles', () => {
    for (const rule of TAB_VISIBILITY_RULES) {
      if (rule.id === 'evolution' || rule.id === 'intelligence') {
        for (const role of EVOLUTION_ENGINE_ROLES) {
          expect(isTabVisible(rule, role, 'free', hasEntitlement)).toBe(true);
        }
      }
    }
    for (const role of PLATFORM_ADMIN_ROLES) {
      expect(isTabVisible(adminRule, role, 'free', hasEntitlement)).toBe(true);
    }
  });
});

// Structural/text-based verification against the real App.tsx source,
// following the same pattern protected-core-invariants.test.ts uses:
// reads the actual ALL_TABS literal and asserts TAB_VISIBILITY_RULES is
// not a hand-maintained copy that has quietly drifted from it.
describe('TAB_VISIBILITY_RULES matches App.tsx ALL_TABS (structural)', () => {
  const appTsxSource = readFileSync(join(__dirname, 'src', 'App.tsx'), 'utf-8');
  const allTabsStart = appTsxSource.indexOf('export const ALL_TABS');
  const allTabsEnd = appTsxSource.indexOf('\n];', allTabsStart);
  const allTabsBlock = appTsxSource.slice(allTabsStart, allTabsEnd);

  it('found the ALL_TABS block in App.tsx', () => {
    expect(allTabsStart).toBeGreaterThan(-1);
    expect(allTabsEnd).toBeGreaterThan(allTabsStart);
  });

  it('has exactly as many tab objects in App.tsx as TAB_VISIBILITY_RULES declares', () => {
    const idMatches = allTabsBlock.match(/id:\s*"[a-z_]+",/g) || [];
    expect(idMatches.length).toBe(TAB_VISIBILITY_RULES.length);
  });

  for (const rule of TAB_VISIBILITY_RULES) {
    it(`"${rule.id}" tab's roles/featureId/group match App.tsx exactly`, () => {
      const idIndex = allTabsBlock.indexOf(`id: "${rule.id}",`);
      expect(idIndex).toBeGreaterThan(-1);
      const objStart = allTabsBlock.lastIndexOf('{', idIndex);
      const objEnd = allTabsBlock.indexOf('\n  },', objStart);
      const objSlice = allTabsBlock.slice(objStart, objEnd);

      // roles: either a literal string array or a `[...CONST_NAME]` spread.
      const rolesMatch = objSlice.match(/roles:\s*\[([\s\S]*?)\]/);
      expect(rolesMatch).not.toBeNull();
      const rolesContent = rolesMatch![1];
      const spreadMatch = rolesContent.match(/^\s*\.\.\.(\w+)\s*$/);
      if (spreadMatch) {
        const constName = spreadMatch[1];
        const resolved = constName === 'EVOLUTION_ENGINE_ROLES' ? EVOLUTION_ENGINE_ROLES
          : constName === 'PLATFORM_ADMIN_ROLES' ? PLATFORM_ADMIN_ROLES
          : null;
        expect(resolved, `Unrecognised spread constant "${constName}" in App.tsx's "${rule.id}" tab - update this test's resolver.`).not.toBeNull();
        expect([...rule.roles].sort()).toEqual([...(resolved as readonly string[])].sort());
      } else {
        const extractedRoles = (rolesContent.match(/"([^"]+)"/g) || []).map((s) => s.slice(1, -1));
        expect([...rule.roles].sort()).toEqual([...extractedRoles].sort());
      }

      const featureIdMatch = objSlice.match(/featureId:\s*"([^"]+)"/);
      expect(rule.featureId).toBe(featureIdMatch ? featureIdMatch[1] : undefined);

      const groupMatch = objSlice.match(/group:\s*"([^"]+)"/);
      expect(rule.group).toBe(groupMatch ? groupMatch[1] : undefined);
    });
  }
});
