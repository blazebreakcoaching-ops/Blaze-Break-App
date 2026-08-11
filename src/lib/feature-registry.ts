export interface FeatureDefinition {
  id: string; // feature_id
  name: string; // feature_name
  purpose: string;
  section: string;
  status: 'planned' | 'active' | 'disabled' | 'archived'; // status
  riskLevel: 'low' | 'medium' | 'high';
  usesAI: boolean;
  usesSensitiveData: boolean;
  allowedConnections: string[];
  protectedBoundaries: string[];
  featureFlagName: string; // feature_flag
  
  // Feature Permission Registry extensions
  visible_roles?: string[];
  required_scope?: 'user' | 'organisation' | 'team' | 'ally' | 'platform';
  data_zone?: 'Private Recovery Vault' | 'Shared Recovery Ally Space' | 'Organisation Sponsored Access' | 'Anonymous Team Insights' | 'Restricted Governance Data';
  can_read?: string[];
  can_write?: string[];
  private_data_access_allowed?: boolean;
  organisation_visibility_allowed?: boolean;
  mfa_required?: boolean;
  audit_required?: boolean;
}

export const FEATURE_REGISTRY: Record<string, FeatureDefinition> = {
  burnout_diagnostic: {
    id: 'burnout_diagnostic',
    name: 'Burnout Diagnostic',
    purpose: 'Assesses the user to determine their burnout state and fingerprint.',
    section: 'Assess',
    status: 'active',
    riskLevel: 'low',
    usesAI: false,
    usesSensitiveData: true,
    allowedConnections: ['burnout_fingerprint', 'energy_budget', 'nova_coach'],
    protectedBoundaries: ['user_profile'],
    featureFlagName: 'enable_burnout_diagnostic',
    visible_roles: ['individual', 'employee', 'executive'],
    data_zone: 'Private Recovery Vault',
    private_data_access_allowed: true,
    organisation_visibility_allowed: false,
    audit_required: true
  },
  energy_budget: {
    id: 'energy_budget',
    name: 'Energy Budget',
    purpose: 'Tracks and manages the user daily energy allocation and threshold.',
    section: 'Rebuild',
    status: 'active',
    riskLevel: 'medium',
    usesAI: false,
    usesSensitiveData: false,
    allowedConnections: ['recovery_debt_tracker', 'nova_overload_shield', 'calendar_integration'],
    protectedBoundaries: ['burnout_diagnostic', 'ship_framework'],
    featureFlagName: 'enable_energy_budget'
  },
  nova_coach: {
    id: 'nova_coach',
    name: 'Nova AI Coach',
    purpose: 'Provides direct, non-clinical recovery coaching and boundary rehearsal.',
    section: 'Core',
    status: 'active',
    riskLevel: 'high',
    usesAI: true,
    usesSensitiveData: true,
    allowedConnections: ['burnout_fingerprint', 'energy_budget', 'nova_personal_brain'],
    protectedBoundaries: ['nova_identity_rules', 'safety_rules', 'guardian_protocol'],
    featureFlagName: 'enable_nova_coach',
    visible_roles: ['individual', 'employee', 'executive'],
    data_zone: 'Private Recovery Vault',
    private_data_access_allowed: true,
    organisation_visibility_allowed: false,
    audit_required: true
  },
  nova_overload_shield: {
    id: 'nova_overload_shield',
    name: 'Nova Overload Shield',
    purpose: 'Monitors external pressures (calendar, communications) to warn of impending burnout risks.',
    section: 'Protect',
    status: 'active',
    riskLevel: 'high',
    usesAI: true,
    usesSensitiveData: true,
    allowedConnections: ['calendar_integration', 'slack_integration', 'energy_budget', 'recovery_mode'],
    protectedBoundaries: ['guardian_protocol', 'core_navigation'],
    featureFlagName: 'enable_overload_shield'
  },
  nova_personal_brain: {
    id: 'nova_personal_brain',
    name: 'Nova Personal Context Brain',
    purpose: 'Stores user profile data, common triggers, daily state, recovery plan, and safety preferences for tailored coaching.',
    section: 'Core Architecture',
    status: 'active',
    riskLevel: 'high',
    usesAI: true,
    usesSensitiveData: true,
    allowedConnections: ['nova_coach', 'burnout_diagnostic', 'energy_budget', 'guardian_protocol'],
    protectedBoundaries: ['user_profile', 'safety_rules'],
    featureFlagName: 'enable_nova_coach'
  },
  guardian_protocol: {
    id: 'guardian_protocol',
    name: 'Guardian Alerts',
    purpose: 'Escalation system for when a user is in severe recovery debt or high risk.',
    section: 'Safety',
    status: 'active',
    riskLevel: 'high',
    usesAI: false,
    usesSensitiveData: true,
    allowedConnections: ['nova_coach', 'recovery_debt_tracker'],
    protectedBoundaries: ['private_transcripts'],
    featureFlagName: 'enable_guardian_protocol'
  },
  boundary_rehearsal: {
    id: 'boundary_rehearsal',
    name: 'Boundary Rehearsal',
    purpose: 'Simulated environment to practice setting boundaries with Nova.',
    section: 'Practice',
    status: 'active',
    riskLevel: 'medium',
    usesAI: true,
    usesSensitiveData: false,
    allowedConnections: ['nova_coach'],
    protectedBoundaries: ['nova_rules'],
    featureFlagName: 'enable_boundary_rehearsal'
  },
  recovery_fuel_engine: {
    id: 'recovery_fuel_engine',
    name: 'Recovery Fuel Engine',
    purpose: 'Help users understand how food rhythm, hydration, caffeine, alcohol awareness, sunlight, gut-brain education, and nutrient literacy affect burnout recovery, energy, sleep, mood, and focus.',
    section: 'Recover & Support',
    status: 'active',
    riskLevel: 'medium',
    usesAI: true,
    usesSensitiveData: true,
    allowedConnections: ['energy_budget', 'recovery_debt_tracker', 'nova_coach'],
    protectedBoundaries: ['user_profile', 'safety_rules'],
    featureFlagName: 'enable_recovery_fuel_engine'
  },
  mood_pulse: {
    id: 'mood_pulse',
    name: 'Mood Pulse',
    purpose: 'Lightweight biometric mood logger using colors & visual metrics to detect performance fatigue dips over time.',
    section: 'Recovery Intelligence signals',
    status: 'active',
    riskLevel: 'low',
    usesAI: false,
    usesSensitiveData: true,
    allowedConnections: ['nova_coach', 'burnout_fingerprint'],
    protectedBoundaries: ['user_profile'],
    featureFlagName: 'enable_mood_pulse'
  },
  trigger_journal: {
    id: 'trigger_journal',
    name: 'Trigger Journal',
    purpose: 'Identify stressors (meetings, deadline scope, tones of voice) causing emotional shutdowns or fawning behavior loops.',
    section: 'Recovery Intelligence signals',
    status: 'active',
    riskLevel: 'medium',
    usesAI: true,
    usesSensitiveData: true,
    allowedConnections: ['nova_coach', 'boundary_rehearsal'],
    protectedBoundaries: ['nova_identity_rules'],
    featureFlagName: 'enable_trigger_journal'
  },
  social_battery: {
    id: 'social_battery',
    name: 'Social Battery Tracker',
    purpose: 'Track draining and restoring interactions to safeguard emotional and relational energy from chronic siphoning.',
    section: 'Recovery Intelligence signals',
    status: 'active',
    riskLevel: 'low',
    usesAI: false,
    usesSensitiveData: true,
    allowedConnections: ['nova_coach', 'energy_budget', 'decompression_doorway'],
    protectedBoundaries: ['user_profile'],
    featureFlagName: 'enable_social_battery'
  },
  recovery_proof_log: {
    id: 'recovery_proof_log',
    name: 'Wins & Recovery Proof Log',
    purpose: 'Track boundary saves, reset moments, and daily recovery indicators to make the invisible visible and boost motivation.',
    section: 'Recovery Intelligence signals',
    status: 'active',
    riskLevel: 'low',
    usesAI: false,
    usesSensitiveData: false,
    allowedConnections: ['nova_coach', 'gamification_display'],
    protectedBoundaries: [],
    featureFlagName: 'enable_recovery_proof_log'
  },
  body_check_in: {
    id: 'body_check_in',
    name: 'Body Symptom Check-In',
    purpose: 'Log sensory indicators (jaw tension, shallow breathing, chest tightness) to detect autonomic distress before mental fatigue arrives.',
    section: 'Recovery Intelligence signals',
    status: 'active',
    riskLevel: 'low',
    usesAI: false,
    usesSensitiveData: true,
    allowedConnections: ['nova_coach', 'nervous_system_reset_studio'],
    protectedBoundaries: ['safety_rules'],
    featureFlagName: 'enable_body_check_in'
  },
  weekly_review: {
    id: 'weekly_review',
    name: 'Weekly Review Ritual',
    purpose: 'End-of-cycle process designed to consolidate daily inputs into long-term behavioral planning and strategic boundary focus.',
    section: 'Recovery Intelligence signals',
    status: 'active',
    riskLevel: 'medium',
    usesAI: true,
    usesSensitiveData: true,
    allowedConnections: ['energy_budget', 'nova_overload_shield'],
    protectedBoundaries: ['safety_rules'],
    featureFlagName: 'enable_weekly_review'
  },
  return_to_work_planner: {
    id: 'return_to_work_planner',
    name: 'Return-to-Work Planner',
    purpose: 'Phased re-entry framework with customizable meeting ceilings and boundary presets for individuals returning from leave.',
    section: 'Recovery Intelligence signals',
    status: 'active',
    riskLevel: 'medium',
    usesAI: true,
    usesSensitiveData: true,
    allowedConnections: ['nova_coach', 'energy_budget'],
    protectedBoundaries: ['user_profile'],
    featureFlagName: 'enable_return_to_work_planner'
  },
  focus_shield: {
    id: 'focus_shield',
    name: 'Focus Shield',
    purpose: 'Block out focus windows and minimize mental context-switching during active hours to preserve nervous reserves.',
    section: 'Recovery Intelligence signals',
    status: 'active',
    riskLevel: 'low',
    usesAI: false,
    usesSensitiveData: false,
    allowedConnections: ['digital_boundary_shield', 'nova_overload_shield'],
    protectedBoundaries: [],
    featureFlagName: 'enable_focus_shield'
  },
  recovery_velocity_score: {
    id: 'recovery_velocity_score',
    name: 'Recovery Velocity Score',
    purpose: 'Aggregate score reflecting whether the user’s metabolic and burnout state is improving, stalling, or slipping backward.',
    section: 'Recovery Intelligence signals',
    status: 'active',
    riskLevel: 'low',
    usesAI: false,
    usesSensitiveData: true,
    allowedConnections: ['recovery_debt_tracker', 'energy_budget', 'mood_pulse'],
    protectedBoundaries: [],
    featureFlagName: 'enable_recovery_velocity_score'
  },
  privacy_vault: {
    id: 'privacy_vault',
    name: 'Privacy Vault',
    purpose: 'Protects personal recovery data',
    section: 'Privacy & Governance',
    status: 'active',
    riskLevel: 'high',
    usesAI: false,
    usesSensitiveData: true,
    allowedConnections: ['consent_centre'],
    protectedBoundaries: [],
    featureFlagName: 'enable_privacy_vault'
  },
  consent_centre: {
    id: 'consent_centre',
    name: 'Consent Centre',
    purpose: 'Lets users control data use and sharing',
    section: 'Privacy & Governance',
    status: 'active',
    riskLevel: 'high',
    usesAI: false,
    usesSensitiveData: true,
    allowedConnections: ['privacy_vault'],
    protectedBoundaries: [],
    featureFlagName: 'enable_consent_centre'
  },
  nova_governance_layer: {
    id: 'nova_governance_layer',
    name: 'Nova Governance Layer',
    purpose: 'Controls AI memory, explanations, permissions and audits',
    section: 'Privacy & Governance',
    status: 'active',
    riskLevel: 'high',
    usesAI: true,
    usesSensitiveData: true,
    allowedConnections: ['nova_coach'],
    protectedBoundaries: ['user_profile'],
    featureFlagName: 'enable_nova_governance_layer'
  },
  personalised_onboarding: {
    id: 'personalised_onboarding',
    name: 'Personalised Onboarding',
    purpose: 'Gathers user context safely',
    section: 'Core Architecture',
    status: 'planned',
    riskLevel: 'medium',
    usesAI: false,
    usesSensitiveData: true,
    allowedConnections: ['nova_personal_brain'],
    protectedBoundaries: [],
    featureFlagName: 'enable_personalised_onboarding'
  },
  recovery_ally: {
    id: 'recovery_ally',
    name: 'Recovery Ally',
    purpose: 'Chosen supportive accountability',
    section: 'Support',
    status: 'active',
    riskLevel: 'medium',
    usesAI: false,
    usesSensitiveData: true,
    allowedConnections: ['guardian_protocol'],
    protectedBoundaries: ['nova_coach'],
    featureFlagName: 'enable_recovery_ally'
  },
  organisation_enrolment: {
    id: 'organisation_enrolment',
    name: 'Organisation Enrolment',
    purpose: 'Separates sponsored access from private use',
    section: 'Privacy & Governance',
    status: 'active',
    riskLevel: 'low',
    usesAI: false,
    usesSensitiveData: false,
    allowedConnections: [],
    protectedBoundaries: ['privacy_vault'],
    featureFlagName: 'enable_organisation_enrolment'
  },
  anonymous_aggregation_engine: {
    id: 'anonymous_aggregation_engine',
    name: 'Anonymous Aggregation Engine',
    purpose: 'Safely converts trends into team insight',
    section: 'Workplace',
    status: 'active',
    riskLevel: 'high',
    usesAI: true,
    usesSensitiveData: true,
    allowedConnections: ['team_climate_dashboard'],
    protectedBoundaries: ['privacy_vault'],
    featureFlagName: 'enable_anonymous_aggregation_engine'
  },
  team_climate_dashboard: {
    id: 'team_climate_dashboard',
    name: 'Team Climate Dashboard',
    purpose: 'Managers/HR view grouped morale/work-design trends',
    section: 'Workplace',
    status: 'active',
    riskLevel: 'medium',
    usesAI: false,
    usesSensitiveData: false,
    allowedConnections: ['anonymous_aggregation_engine', 'nova_manager_coach'],
    protectedBoundaries: [],
    featureFlagName: 'enable_team_climate_dashboard',
    visible_roles: ['manager', 'organisation_admin'],
    required_scope: 'team',
    data_zone: 'Anonymous Team Insights',
    private_data_access_allowed: false,
    organisation_visibility_allowed: true,
    mfa_required: true,
    audit_required: true
  },
  nova_manager_coach: {
    id: 'nova_manager_coach',
    name: 'Nova Manager Coach',
    purpose: 'Recommends supportive manager actions',
    section: 'Workplace',
    status: 'planned',
    riskLevel: 'medium',
    usesAI: true,
    usesSensitiveData: false,
    allowedConnections: ['team_climate_dashboard'],
    protectedBoundaries: [],
    featureFlagName: 'enable_nova_manager_coach'
  },
  positive_reinforcement_engine: {
    id: 'positive_reinforcement_engine',
    name: 'Positive Reinforcement Engine',
    purpose: 'Rewards healthy recovery behaviours',
    section: 'Core Architecture',
    status: 'planned',
    riskLevel: 'low',
    usesAI: false,
    usesSensitiveData: false,
    allowedConnections: [],
    protectedBoundaries: [],
    featureFlagName: 'enable_positive_reinforcement_engine'
  },
  anonymous_team_voice: {
    id: 'anonymous_team_voice',
    name: 'Anonymous Team Voice',
    purpose: 'Surfaces improvement themes safely',
    section: 'Workplace',
    status: 'active',
    riskLevel: 'medium',
    usesAI: false,
    usesSensitiveData: false,
    allowedConnections: ['team_climate_dashboard'],
    protectedBoundaries: [],
    featureFlagName: 'enable_anonymous_team_voice'
  },
  workplace_governance_console: {
    id: 'workplace_governance_console',
    name: 'Workplace Governance Console',
    purpose: 'Privacy, thresholds, permissions and audits',
    section: 'Privacy & Governance',
    status: 'planned',
    riskLevel: 'medium',
    usesAI: false,
    usesSensitiveData: false,
    allowedConnections: ['anonymous_aggregation_engine'],
    protectedBoundaries: [],
    featureFlagName: 'enable_workplace_governance_console'
  },
  people_value_engine: {
    id: 'people_value_engine',
    name: 'People Value Engine',
    purpose: 'Estimates financial cost opportunity of unchecked burnout',
    section: 'Workplace',
    status: 'active',
    riskLevel: 'medium',
    usesAI: false,
    usesSensitiveData: false,
    allowedConnections: ['team_climate_dashboard', 'management_savings_planner'],
    protectedBoundaries: ['privacy_vault'],
    featureFlagName: 'enable_people_value_engine'
  },
  management_savings_planner: {
    id: 'management_savings_planner',
    name: 'Management Savings Planner',
    purpose: 'Guiding 30/60/90 day action strategy to improve metrics',
    section: 'Workplace',
    status: 'planned',
    riskLevel: 'medium',
    usesAI: true,
    usesSensitiveData: false,
    allowedConnections: ['nova_manager_coach', 'people_value_engine'],
    protectedBoundaries: [],
    featureFlagName: 'enable_management_savings_planner'
  },
  blaze_bright_moments: {
    id: 'blaze_bright_moments',
    name: 'Blaze Bright Moments',
    purpose: 'Team positive reinforcement and voluntary appreciation',
    section: 'Workplace',
    status: 'active',
    riskLevel: 'low',
    usesAI: false,
    usesSensitiveData: false,
    allowedConnections: ['positive_reinforcement_engine'],
    protectedBoundaries: [],
    featureFlagName: 'enable_blaze_bright_moments'
  }
};
