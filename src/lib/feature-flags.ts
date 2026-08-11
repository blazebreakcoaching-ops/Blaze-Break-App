import { useState, useEffect } from 'react';

export type FeatureFlag = 
  | 'enable_nova_voice'
  | 'enable_calendar_integration'
  | 'enable_slack_integration'
  | 'enable_overload_shield'
  | 'enable_guardian_protocol'
  | 'enable_chapter_action_engine'
  | 'enable_nervous_system_reset'
  | 'enable_boundary_rehearsal'
  | 'enable_burnout_diagnostic'
  | 'enable_energy_budget'
  | 'enable_nova_coach'
  | 'enable_recovery_fuel_engine'
  | 'enable_mood_pulse'
  | 'enable_trigger_journal'
  | 'enable_social_battery'
  | 'enable_recovery_proof_log'
  | 'enable_body_check_in'
  | 'enable_weekly_review'
  | 'enable_return_to_work_planner'
  | 'enable_focus_shield'
  | 'enable_recovery_velocity_score'
  | 'enable_privacy_vault'
  | 'enable_consent_centre'
  | 'enable_nova_governance_layer'
  | 'enable_personalised_onboarding'
  | 'enable_recovery_ally'
  | 'enable_organisation_enrolment'
  | 'enable_anonymous_aggregation_engine'
  | 'enable_team_climate_dashboard'
  | 'enable_nova_manager_coach'
  | 'enable_positive_reinforcement_engine'
  | 'enable_anonymous_team_voice'
  | 'enable_workplace_governance_console'
  | 'enable_people_value_engine'
  | 'enable_management_savings_planner'
  | 'enable_blaze_bright_moments'
  | 'compliance_gdpr_active'
  | 'compliance_cyber_essentials'
  | 'compliance_iso_27001';

const DEFAULT_FLAGS: Record<FeatureFlag, boolean> = {
  enable_nova_voice: false,
  enable_calendar_integration: true,
  enable_slack_integration: false,
  enable_overload_shield: true,
  enable_guardian_protocol: true,
  enable_chapter_action_engine: false,
  enable_nervous_system_reset: true,
  enable_boundary_rehearsal: true,
  enable_burnout_diagnostic: true,
  enable_energy_budget: true,
  enable_nova_coach: true,
  enable_recovery_fuel_engine: true,
  enable_mood_pulse: true,
  enable_trigger_journal: true,
  enable_social_battery: true,
  enable_recovery_proof_log: true,
  enable_body_check_in: true,
  enable_weekly_review: true,
  enable_return_to_work_planner: true,
  enable_focus_shield: true,
  enable_recovery_velocity_score: true,
  enable_privacy_vault: true,
  enable_consent_centre: true,
  enable_nova_governance_layer: true,
  enable_personalised_onboarding: false,
  enable_recovery_ally: true,
  enable_organisation_enrolment: true,
  enable_anonymous_aggregation_engine: true,
  enable_team_climate_dashboard: true,
  enable_nova_manager_coach: false,
  enable_positive_reinforcement_engine: false,
  enable_anonymous_team_voice: true,
  enable_workplace_governance_console: false,
  enable_people_value_engine: true,
  enable_management_savings_planner: false,
  enable_blaze_bright_moments: true,
  compliance_gdpr_active: true,
  compliance_cyber_essentials: true,
  compliance_iso_27001: true
};

export const getFeatureFlags = (): Record<FeatureFlag, boolean> => {
  try {
    const stored = localStorage.getItem('blaze_feature_flags');
    if (stored) {
      return { ...DEFAULT_FLAGS, ...JSON.parse(stored) };
    }
  } catch (e) {}
  return DEFAULT_FLAGS;
};

export const setFeatureFlag = (flag: FeatureFlag, value: boolean) => {
  const flags = getFeatureFlags();
  flags[flag] = value;
  localStorage.setItem('blaze_feature_flags', JSON.stringify(flags));
  window.dispatchEvent(new Event('feature-flags-updated'));
};

export const useFeatureFlags = () => {
  const [flags, setFlags] = useState<Record<FeatureFlag, boolean>>(getFeatureFlags());

  useEffect(() => {
    const handleUpdate = () => {
      setFlags(getFeatureFlags());
    };
    
    window.addEventListener('feature-flags-updated', handleUpdate);
    return () => window.removeEventListener('feature-flags-updated', handleUpdate);
  }, []);

  return flags;
};
