
export type BurnoutProfile =
  | 'High-Functioning Exhausted'
  | 'Over-Giver'
  | 'Silent Resenter'
  | 'Founder on Fire'
  | 'Manager in the Middle'
  | 'The Impostor'
  | 'The Perfectionist'
  | 'The Constant Adapter'
  | 'The Second Shift'
  | 'Crisis Sprinter'
  | 'People-Pleasing Performer'
  | 'Responsibility Addict';

export type SHIPStage = 'Safety' | 'Habits' | 'Identity' | 'Purpose';

export interface BurnoutFingerprint {
  profile: BurnoutProfile;
  description: string;
  priorities: string[];
  blend?: { profile: string; percentage: number }[];
  scores?: {
    workload: number;
    boundaries: number;
    peoplePleasing: number;
    guilt: number;
    sleep: number;
    emotionalOverload: number;
    meaning: number;
    selfDoubt?: number;
    delegationControl?: number;
    maskingLoad?: number;
    caregivingLoad?: number;
    crisisDependency?: number;
    emotionalPerformance?: number;
    responsibilityCreep?: number;
  };
  analysis?: string;
}

export interface EnergyCredit {
  id: string;
  task: string;
  cost: number;
  priority: 'High' | 'Medium' | 'Low';
  type: 'Executive' | 'Emotional' | 'Physical' | 'Social';
  shipStage?: 'Safety' | 'Habits' | 'Identity' | 'Purpose';
  action?: 'keep' | 'delegate' | 'defer';
}

export interface DayPlan {
  totalCredits: number;
  plannedTasks: EnergyCredit[];
  actualSpent: number;
}

export interface RecoveryDebt {
  category: string;
  debtLevel: number; // 0-100
  notes: string;
}

export interface Badge {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: 'streak' | 'points' | 'milestone';
}

export interface SupportContact {
  id: string;
  name: string;
  role: 'primary_guardian' | 'backup_guardian' | 'coach' | 'peer';
  isGuardian: boolean;
  contactMethod: string;
  relation?: string;
  notificationPreference?: 'sms' | 'whatsapp';
  autoAlertEnabled?: boolean;
}

export interface OrgTrends {
  averageEngagement: number; // 0-100
  topBurnoutProfile: BurnoutProfile;
  totalPointsEarned: number;
  recoveryDebtTrend: { date: string; value: number }[];
  profileDistribution: { profile: string; count: number }[];
  boundaryPracticesCount: number;
}

export type AuthRole = 
  | 'individual' 
  | 'employee' 
  | 'recovery_ally' 
  | 'manager' 
  | 'organisation_admin' 
  | 'executive' 
  | 'platform_admin' 
  | 'security_admin'
  | 'platform_owner'
  | 'support_admin'
  | 'content_admin'
  | 'coach_admin'
  | 'b2b_admin'
  | 'viewer_admin'
  | 'user';

export interface AdminUserRecord {
  uid: string;
  email: string;
  displayName: string;
  role: 'platform_owner' | 'platform_admin' | 'support_admin' | 'content_admin' | 'coach_admin' | 'b2b_admin' | 'viewer_admin' | 'user';
  status: 'active' | 'suspended';
  permissions: string[];
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  lastLoginAt?: string | null;
}

export interface AnxietyResetEvent {
  id?: string;
  userId: string;
  startedAt: string;
  endedAt: string;
  mode: 'anxiety_reset';
  triggerType: string;
  intensityBefore: number;
  intensityAfter: number;
  selectedTool: string;
  completed: boolean;
  durationSeconds: number;
  userNote: string;
  novaFollowUpShown: boolean;
  followUpActionId: string;
  safetyLevel: 'normal_support' | 'heightened_anxiety' | 'panic_level' | 'possible_crisis' | 'immediate_danger';
  createdAt: string;
  updatedAt: string;
}

export type SubscriptionTier = 'free' | 'recovery' | 'pro' | 'executive_digital' | 'coaching_circle' | 'private_coaching' | 'organisation_sponsored';

export interface AuthScope {
  user_id?: string;
  organisation_id?: string;
  team_ids?: string[];
  ally_relationship_ids?: string[];
}

export interface UserProfileData {
  fullName: string;
  role: string;
  organization: string;
  avatarBase64?: string;
  managerEmail?: string;
  pathway?: string;
  purpose?: string;
  novaTone?: string;
  primaryDrain?: string;
  authRole?: AuthRole;
  authScope?: AuthScope;
  subscription?: SubscriptionTier;
  // Personalisation Consent
  preferredName?: string;
  useNameInGreetings?: boolean;
  useLocalTime?: boolean;
  timeZone?: string;
  useGeneralRegion?: boolean;
  region?: string;
  sendNovaNudges?: boolean;
  nudgeFrequency?: 'discreet' | 'supportive' | 'detailed' | 'off';
  letNovaLearn?: boolean;
  orgSponsoredAccess?: boolean;
  consentMatrix?: Record<string, boolean>;
}

export interface Debt {
  id: string;
  label: string;
  value: number;
  unit: string;
  max: number;
  color: string;
  impact: string;
  novaNote: string;
  cleared?: boolean;
}

export interface UserStats {
  points: number;
  streak: number;
  rehearsalCount: number;
  lastEngagementDate: string; // YYYY-MM-DD
  unlockedBadges: string[]; // Badge IDs
  supportCircle: SupportContact[];
  committedActionIds: string[];
  weeklyGoalsComplete?: number;
  level?: number;
  profile?: UserProfileData;
  debts?: Debt[];
  recoveryScore?: number;
  intelligence?: {
    moodLogs?: any[];
    triggers?: any[];
    socialBattery?: number;
    wins?: any[];
    bodySymptoms?: string[];
    weeklyReview?: any;
    rtwPhase?: number;
    meetingLimit?: number;
    isFocusShieldActive?: boolean;
  };
}

export const BADGES: Badge[] = [
  { id: 'first_step', name: 'The First Step', description: 'Complete your first diagnostic.', icon: 'Flag', category: 'milestone' },
  { id: 'consistency_3', name: '3-Day Spark', description: 'Maintain a 3-day recovery streak.', icon: 'Zap', category: 'streak' },
  { id: 'consistency_7', name: 'Flow State', description: 'Maintain a 7-day recovery streak.', icon: 'Waves', category: 'streak' },
  { id: 'point_1000', name: 'Energy Master', description: 'Earn 1,000 total recovery points.', icon: 'Target', category: 'points' },
  { id: 'boundary_set', name: 'Boundary Breaker', description: 'Rehearse 5 boundary scenarios.', icon: 'Shield', category: 'milestone' },
  { id: 'boundary_boss', name: 'Boundary Boss', description: 'Rehearse 10 boundary scenarios with precision.', icon: 'ShieldAlert', category: 'milestone' },
  { id: 'master_healer', name: 'Master Healer', description: 'Reach 2,500 total points.', icon: 'Award', category: 'points' },
  { id: 'consistent_sleep', name: 'Consistent Sleep', description: 'Maintain sleep debt below 4 hours.', icon: 'Moon', category: 'milestone' },
  { id: 'master_boundaries', name: 'Master of Boundaries', description: 'Rehearse 15 boundary scripts with precision.', icon: 'ShieldCheck', category: 'milestone' },
];
