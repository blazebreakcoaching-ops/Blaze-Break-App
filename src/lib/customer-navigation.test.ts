import { describe, expect, it } from 'vitest';
import { isCustomerRole, shouldShowCustomerNavTab } from './customer-navigation';

describe('customer-first navigation', () => {
  it('starts individual customers with only Today, Nova and Plan', () => {
    for (const role of ['individual', 'employee', 'executive', undefined]) {
      expect(isCustomerRole(role)).toBe(true);
      expect(['home', 'nova', 'plan'].every(id =>
        shouldShowCustomerNavTab(role, false, id, 'home'))).toBe(true);
      expect(shouldShowCustomerNavTab(role, false, 'privacy', 'home')).toBe(false);
      expect(shouldShowCustomerNavTab(role, false, 'diagnose', 'home')).toBe(false);
    }
  });

  it('allows the user to explore existing entitled features on demand', () => {
    expect(shouldShowCustomerNavTab('individual', true, 'privacy', 'home')).toBe(true);
    expect(shouldShowCustomerNavTab('individual', true, 'reset', 'home')).toBe(true);
  });

  it('never strands someone on a tool opened from another screen', () => {
    expect(shouldShowCustomerNavTab('individual', false, 'reset', 'reset')).toBe(true);
    expect(shouldShowCustomerNavTab('individual', false, 'privacy', 'privacy')).toBe(true);
  });

  it('does not simplify staff or organisation management navigation', () => {
    for (const role of ['manager', 'organisation_admin', 'platform_admin', 'platform_owner']) {
      expect(isCustomerRole(role)).toBe(false);
      expect(shouldShowCustomerNavTab(role, false, 'admin', 'home')).toBe(true);
    }
  });
});
