// Presentation only. Never replaces role, subscription, or Firestore access checks.
const SIMPLE_CUSTOMER_ROLES = new Set(['individual', 'employee', 'executive']);
const STARTER_TAB_IDS = new Set(['home', 'nova', 'plan']);

export function isCustomerRole(role: string | undefined): boolean {
  return SIMPLE_CUSTOMER_ROLES.has(role ?? 'individual');
}

// A tab is displayed for a simple customer when it is part of the quiet
// starting set OR it is currently open (e.g., reached from a real tool CTA).
// The caller must independently enforce role/subscription permissions.
export function shouldShowCustomerNavTab(
  role: string | undefined,
  showAllTools: boolean,
  tabId: string,
  activeTab: string,
): boolean {
  return !isCustomerRole(role) || showAllTools ||
    STARTER_TAB_IDS.has(tabId) || tabId === activeTab;
}
