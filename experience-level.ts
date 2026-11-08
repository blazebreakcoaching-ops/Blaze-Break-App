// Customer experience levels: Novice -> Mastering -> Expert.
// PRESENTATION ONLY (progressive disclosure). A level decides which tools
// are shown by default in navigation; it never grants or removes access.
// Role, subscription and Firestore/server checks stay authoritative, and
// every level can still open "Explore all tools", Quick find, crisis
// support and settings.
export const EXPERIENCE_LEVELS = ['novice', 'mastering', 'expert'] as const;
export type ExperienceLevel = (typeof EXPERIENCE_LEVELS)[number];
export const DEFAULT_EXPERIENCE_LEVEL: ExperienceLevel = 'novice';

export const isExperienceLevel = (value: unknown): value is ExperienceLevel =>
  typeof value === 'string' && (EXPERIENCE_LEVELS as readonly string[]).includes(value);

export const EXPERIENCE_LEVEL_LABELS: Record<ExperienceLevel, string> = {
  novice: 'Novice',
  mastering: 'Mastering',
  expert: 'Expert',
};

// Short, fixed Nova Blaze guidance for each level (not AI-generated).
export const EXPERIENCE_LEVEL_GUIDANCE: Record<ExperienceLevel, string> = {
  novice: 'Just the essentials: check in, see your insights, talk to me and follow your plan.',
  mastering: 'Adds the core recovery tools for energy, resets, boundaries, actions and support.',
  expert: 'Shows every tool you have access to. You can switch back at any time.',
};

// The critical customer journey: check-in -> insights -> Nova -> plan.
export const NOVICE_TAB_IDS: readonly string[] = ['home', 'diagnose', 'recovery_intelligence', 'nova', 'plan'];
export const MASTERING_TAB_IDS: readonly string[] = [...NOVICE_TAB_IDS, 'recover', 'reset', 'communicate', 'reflect', 'ally'];

export function tabIncludedAtLevel(level: ExperienceLevel, tabId: string): boolean {
  if (level === 'expert') return true;
  return (level === 'mastering' ? MASTERING_TAB_IDS : NOVICE_TAB_IDS).includes(tabId);
}
