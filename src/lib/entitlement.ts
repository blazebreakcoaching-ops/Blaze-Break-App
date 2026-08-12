import { SubscriptionTier, AuthRole } from '../types.ts';
import { FeatureDefinition } from './feature-registry.ts';

export const COMPAT_MAP: Record<SubscriptionTier, string[]> = {
  free: [
    'core_onboarding', 'burnout_diagnostic', 'privacy_centre', 'account_controls'
  ],
  recovery: [
    'core_onboarding', 'burnout_diagnostic', 'privacy_centre', 'account_controls',
    'nova_text_coach', 'energy_budget', 'recovery_debt', 'nutrition_recovery', 'nervous_system_reset', 'weekly_review'
  ],
  pro: [
    'core_onboarding', 'burnout_diagnostic', 'privacy_centre', 'account_controls',
    'nova_text_coach', 'energy_budget', 'recovery_debt', 'nutrition_recovery', 'nervous_system_reset', 'weekly_review',
    'nova_voice', 'nova_overload_shield', 'focus_shield', 'integrations'
  ],
  executive_digital: [
    'core_onboarding', 'burnout_diagnostic', 'privacy_centre', 'account_controls',
    'nova_text_coach', 'energy_budget', 'recovery_debt', 'nutrition_recovery', 'nervous_system_reset', 'weekly_review',
    'nova_voice', 'nova_overload_shield', 'focus_shield', 'integrations',
    'executive_pathway'
  ],
  coaching_circle: [
    'core_onboarding', 'burnout_diagnostic', 'privacy_centre', 'account_controls',
    'nova_text_coach', 'energy_budget', 'recovery_debt', 'nutrition_recovery', 'nervous_system_reset', 'weekly_review',
    'nova_voice', 'nova_overload_shield', 'focus_shield', 'integrations',
    'executive_pathway'
  ],
  private_coaching: [
    'core_onboarding', 'burnout_diagnostic', 'privacy_centre', 'account_controls',
    'nova_text_coach', 'energy_budget', 'recovery_debt', 'nutrition_recovery', 'nervous_system_reset', 'weekly_review',
    'nova_voice', 'nova_overload_shield', 'focus_shield', 'integrations',
    'executive_pathway'
  ],
  organisation_sponsored: [
    'core_onboarding', 'burnout_diagnostic', 'privacy_centre', 'account_controls',
    'nova_text_coach', 'energy_budget', 'recovery_debt', 'nutrition_recovery', 'nervous_system_reset', 'weekly_review',
    // Could vary depending on tier, assuming pro-level base for now
    'nova_voice', 'nova_overload_shield', 'focus_shield', 'integrations'
  ]
};

// Evaluate if the user's subscription covers a given feature ID logic-wise (generic features in the plan vs granular FeatureRegistry flags)
export function hasSubscriptionEntitlement(
  subscription: SubscriptionTier, 
  featureId: string
): boolean {
  // Free fallback logic if not specified in maps
  // Let's rely directly on the feature flag / ID map
  const allowed = COMPAT_MAP[subscription] || [];
  
  // Mapping specific granular features to abstract entitlement groups
  if (featureId === 'enable_nova_coach' || featureId === 'nova_coach') {
    return allowed.includes('nova_text_coach');
  }
  if (featureId === 'nova_voice_connect' || featureId === 'enable_nova_voice') {
    return allowed.includes('nova_voice');
  }
  if (featureId === 'nova_overload_shield' || featureId === 'enable_overload_shield') {
    return allowed.includes('nova_overload_shield');
  }
  if (featureId === 'energy_budget' || featureId === 'enable_energy_budget') {
    return allowed.includes('energy_budget');
  }
  // Free users still get a diagnostic preview
  if (featureId === 'burnout_diagnostic' || featureId === 'enable_burnout_diagnostic') {
    return true; 
  }
  if (featureId === 'recovery_debt' || featureId === 'enable_recovery_debt') {
    return allowed.includes('recovery_debt');
  }

  // Admin/Role specific features shouldn't be blocked by simple personal subscriptions if the user holds that role
  // e.g. a Free user who is a Platform Admin should still access the matrix. BUT usually they don't buy a subscription for that.
  
  // As a default fallback for unmatched generic UI tabs: 
  return true; 
}

// Combine everything to protect access
export function canAccessFeature(
  userRole: AuthRole,
  userSubscription: SubscriptionTier,
  feature: FeatureDefinition
): boolean {
  if (feature.status !== 'active') return false;

  // 1. Authorised Access Framework (Role check)
  if (feature.visible_roles && !feature.visible_roles.includes(userRole)) {
    return false;
  }

  // 2. Subscription Engine
  if (!hasSubscriptionEntitlement(userSubscription, feature.id) && !hasSubscriptionEntitlement(userSubscription, feature.featureFlagName)) {
    return false;
  }

  return true;
}
