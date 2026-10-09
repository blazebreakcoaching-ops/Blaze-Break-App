// Single source of truth for which top-level app tabs are visible to a
// given role + subscription tier - extracted from App.tsx's ALL_TABS
// and isTabVisible (Evolution Engine PR6) so the Effective Configuration
// simulator can reuse the exact real resolution logic instead of
// re-deriving a parallel model. App.tsx's own isTabVisible now delegates
// to resolveTabVisibility below rather than keeping a second copy -
// Evolution Engine PR1 found and fixed three real role-gating bugs in
// that exact function, and a hand-maintained duplicate here would have
// a chance to silently reintroduce one of them.
//
// TAB_VISIBILITY_RULES is a data mirror of ALL_TABS with the icon
// component omitted (this module stays icon/React-free so nothing
// unexpected gets pulled in by importing it). tab-visibility.test.ts
// reads App.tsx's actual source text and asserts every rule here
// matches what's literally written there, so the two can never silently
// drift apart without a failing test catching it.
//
// Deliberately does NOT import hasSubscriptionEntitlement directly -
// the caller passes it in, so this file has exactly one real dependency
// (admin-roles.ts) and can never accidentally pull src/lib/entitlement.ts
// (and its own feature-registry.ts import) into anything that imports
// this module just for the rule data.

import { PLATFORM_ADMIN_ROLES, EVOLUTION_ENGINE_ROLES, isPlatformAdminRole } from './admin-roles';

export interface TabVisibilityRule {
  id: string;
  label: string;
  roles: readonly string[];
  featureId?: string;
  group?: string;
}

// Verified against App.tsx's ALL_TABS (see tab-visibility.test.ts).
export const TAB_VISIBILITY_RULES: TabVisibilityRule[] = [
  { id: 'home', label: 'Pulse', roles: ['individual', 'employee', 'executive'] },
  { id: 'plan', label: 'Recovery Plan', roles: ['individual', 'employee', 'executive'] },
  { id: 'diagnose', label: 'Check-in', roles: ['individual', 'employee', 'executive'], featureId: 'burnout_diagnostic', group: 'recovery_tools' },
  { id: 'recover', label: 'Recover', roles: ['individual', 'employee', 'executive'], featureId: 'energy_budget', group: 'recovery_tools' },
  { id: 'fuel', label: 'Nutrition', roles: ['individual', 'employee', 'executive'], featureId: 'nutrition_recovery', group: 'recovery_tools' },
  { id: 'reset', label: 'Nervous System', roles: ['individual', 'employee', 'executive'], featureId: 'nervous_system_reset', group: 'recovery_tools' },
  { id: 'anxiety_reset', label: 'Anxiety Reset', roles: ['individual', 'employee', 'executive'], group: 'recovery_tools' },
  { id: 'wellbeing', label: 'Anxiety Check-in', roles: ['individual', 'employee', 'executive'], group: 'recovery_tools' },
  { id: 'communicate', label: 'Communicate', roles: ['individual', 'employee', 'executive'] },
  { id: 'reflect', label: 'Action Engine', roles: ['individual', 'employee', 'executive'], featureId: 'weekly_review' },
  { id: 'nova', label: 'Nova Coach', roles: ['individual', 'employee', 'executive'], featureId: 'nova_text_coach' },
  { id: 'subscription', label: 'Subscription', roles: ['individual', 'employee', 'executive'] },
  { id: 'privacy', label: 'Privacy Centre', roles: ['individual', 'employee', 'executive', 'manager', 'organisation_admin'] },
  { id: 'ally', label: 'My Support Circle', roles: ['individual', 'employee', 'executive', 'recovery_ally'] },
  { id: 'guide', label: 'User Guide', roles: ['individual', 'employee', 'recovery_ally', 'manager', 'organisation_admin', 'executive', 'platform_admin', 'security_admin', 'platform_owner', 'support_admin', 'content_admin', 'coach_admin', 'b2b_admin', 'viewer_admin', 'user'] },
  { id: 'org', label: 'Organisation', roles: ['manager', 'organisation_admin', 'platform_admin', 'security_admin'] },
  { id: 'evolution', label: 'Evolution Engine', roles: [...EVOLUTION_ENGINE_ROLES] },
  { id: 'intelligence', label: 'Intelligence Layer', roles: [...EVOLUTION_ENGINE_ROLES] },
  { id: 'executive', label: 'Executive ROI', roles: ['executive', 'platform_admin', 'security_admin'] },
  { id: 'admin', label: 'Command Centre', roles: [...PLATFORM_ADMIN_ROLES] },
];

export interface TabVisibilityResult {
  visible: boolean;
  reason: string;
}

// Mirrors App.tsx's isTabVisible exactly (including the "privacy" special
// case and the platform-staff bypass), but also returns WHY - the thing
// isTabVisible's plain boolean never needed until the Effective
// Configuration simulator needed to explain itself.
export const resolveTabVisibility = (
  rule: TabVisibilityRule,
  role: string | undefined,
  tier: string,
  hasEntitlement: (tier: string, featureId: string) => boolean
): TabVisibilityResult => {
  if (rule.id === 'privacy') {
    return { visible: false, reason: 'Always hidden from the nav regardless of role or tier - reachable via Settings > Consent & Privacy instead.' };
  }
  if (isPlatformAdminRole(role)) {
    return { visible: true, reason: `Visible because "${role}" is a platform-staff role - every platform-staff role bypasses this tab's own roles list entirely.` };
  }
  if (!role || !rule.roles.includes(role)) {
    return {
      visible: false,
      reason: role
        ? `Hidden - role "${role}" is not in this tab's allowed roles (${rule.roles.join(', ')}).`
        : 'Hidden - no role supplied.',
    };
  }
  if (rule.featureId && !hasEntitlement(tier, rule.featureId)) {
    return { visible: false, reason: `Hidden - subscription tier "${tier}" does not pass hasSubscriptionEntitlement for featureId "${rule.featureId}".` };
  }
  if (rule.featureId) {
    return { visible: true, reason: `Visible - role "${role}" is allowed, and hasSubscriptionEntitlement("${tier}", "${rule.featureId}") returned true.` };
  }
  return { visible: true, reason: `Visible - role "${role}" is allowed, and this tab has no entitlement requirement.` };
};

export const isTabVisible = (
  rule: TabVisibilityRule,
  role: string | undefined,
  tier: string,
  hasEntitlement: (tier: string, featureId: string) => boolean
): boolean => resolveTabVisibility(rule, role, tier, hasEntitlement).visible;
