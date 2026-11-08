// Presentation only. Never replaces role, subscription, or Firestore access checks.
import { tabIncludedAtLevel, type ExperienceLevel } from '../../experience-level';

const SIMPLE_CUSTOMER_ROLES = new Set(['individual', 'employee', 'executive']);

// Always on the mobile bar (with "Tools" and "More"): a purpose-built
// five-item app bar instead of a scrolling strip of every tab.
export const MOBILE_PRIMARY_TAB_IDS: readonly string[] = ['home', 'plan', 'nova'];

export function isCustomerRole(role: string | undefined): boolean {
  return SIMPLE_CUSTOMER_ROLES.has(role ?? 'individual');
}

// A tab is displayed for a customer when their chosen experience level
// includes it, when they temporarily chose "Explore all tools", or when it
// is currently open (e.g. reached from a real tool CTA). Staff and other
// non-customer roles always see their full navigation. The caller must
// still enforce role/subscription permissions independently.
export function shouldShowCustomerNavTab(
  role: string | undefined,
  level: ExperienceLevel,
  showAllTools: boolean,
  tabId: string,
  activeTab: string,
): boolean {
  return !isCustomerRole(role) || showAllTools ||
    tabIncludedAtLevel(level, tabId) || tabId === activeTab;
}
