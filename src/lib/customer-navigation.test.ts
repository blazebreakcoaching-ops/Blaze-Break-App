import { describe, it, expect } from 'vitest';
import { isCustomerRole, shouldShowCustomerNavTab, MOBILE_PRIMARY_TAB_IDS } from './customer-navigation';
import { NOVICE_TAB_IDS, MASTERING_TAB_IDS, EXPERIENCE_LEVELS, isExperienceLevel, tabIncludedAtLevel } from '../../experience-level';

const CUSTOMER_ROLES = ['individual', 'employee', 'executive', undefined];

describe('experience levels are progressive disclosure, never a lock', () => {
  it('Novice shows exactly the critical journey: Today, Check-in, Insights, Nova, My Plan', () => {
    expect([...NOVICE_TAB_IDS].sort()).toEqual(['diagnose', 'home', 'nova', 'plan', 'recovery_intelligence']);
    for (const role of CUSTOMER_ROLES) {
      NOVICE_TAB_IDS.forEach((id) => expect(shouldShowCustomerNavTab(role, 'novice', false, id, 'home')).toBe(true));
      expect(shouldShowCustomerNavTab(role, 'novice', false, 'reset', 'home')).toBe(false);
      expect(shouldShowCustomerNavTab(role, 'novice', false, 'privacy', 'home')).toBe(false);
    }
  });

  it('each level contains everything the level below shows', () => {
    NOVICE_TAB_IDS.forEach((id) => expect(MASTERING_TAB_IDS).toContain(id));
    MASTERING_TAB_IDS.forEach((id) => expect(tabIncludedAtLevel('expert', id)).toBe(true));
    expect(shouldShowCustomerNavTab('individual', 'mastering', false, 'reset', 'home')).toBe(true);
    expect(shouldShowCustomerNavTab('individual', 'mastering', false, 'privacy', 'home')).toBe(false);
    expect(shouldShowCustomerNavTab('individual', 'expert', false, 'privacy', 'home')).toBe(true);
  });

  it('"Explore all tools" reveals everything at every level', () => {
    for (const level of EXPERIENCE_LEVELS) {
      expect(shouldShowCustomerNavTab('individual', level, true, 'privacy', 'home')).toBe(true);
      expect(shouldShowCustomerNavTab('individual', level, true, 'fuel', 'home')).toBe(true);
    }
  });

  it('the currently open tab is always shown, even when reached from a CTA', () => {
    expect(shouldShowCustomerNavTab('individual', 'novice', false, 'reset', 'reset')).toBe(true);
    expect(shouldShowCustomerNavTab('individual', 'novice', false, 'privacy', 'privacy')).toBe(true);
  });

  it('staff and admin roles always keep their full navigation', () => {
    for (const role of ['manager', 'organisation_admin', 'platform_admin', 'security_admin']) {
      expect(isCustomerRole(role)).toBe(false);
      expect(shouldShowCustomerNavTab(role, 'novice', false, 'admin', 'home')).toBe(true);
    }
  });

  it('only the three known levels are accepted', () => {
    for (const bad of ['', 'Expert', 'admin', null, 3, undefined]) expect(isExperienceLevel(bad)).toBe(false);
    EXPERIENCE_LEVELS.forEach((l) => expect(isExperienceLevel(l)).toBe(true));
  });

  it('the mobile bar keeps the essential tabs, all shown at Novice', () => {
    MOBILE_PRIMARY_TAB_IDS.forEach((id) => expect(NOVICE_TAB_IDS).toContain(id));
  });
});
