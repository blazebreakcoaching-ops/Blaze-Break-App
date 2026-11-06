/**
 * Nova Guide: fixed, truthful, client-side explanations for existing screens.
 * These are not AI-generated messages and do not read private recovery data.
 * Only the real, customer-accessible tabs are exposed as destinations.
 */
export type NovaGuideTab = 'home' | 'diagnose' | 'nova' | 'plan';
export type NovaGuideIcon = 'sparkles' | 'home' | 'check-in' | 'nova' | 'plan';

export interface NovaGuideStep {
  id: 'welcome' | NovaGuideTab;
  title: string;
  message: string;
  why: string;
  icon: NovaGuideIcon;
  tab?: NovaGuideTab;
  action?: string;
}

export const NOVA_GUIDE_STEPS: readonly NovaGuideStep[] = [
  {
    id: 'welcome',
    title: 'One small step at a time',
    message: "Hi, I'm Nova Blaze. Want a quick look around? You can stop at any point.",
    why: 'There is no rush to learn every tool. Start wherever feels useful.',
    icon: 'sparkles',
  },
  {
    id: 'home',
    title: 'Your calm starting place',
    message: 'Today helps you choose just one helpful thing to do next.',
    why: 'You can always come back here when the rest feels like a lot.',
    icon: 'home',
    tab: 'home',
    action: 'Open Today',
  },
  {
    id: 'diagnose',
    title: 'A check-in, not a test',
    message: "A short check-in helps you reflect on what has been taking your energy.",
    why: "There are no right answers, and it isn't a medical diagnosis.",
    icon: 'check-in',
    tab: 'diagnose',
    action: 'Open Check-in',
  },
  {
    id: 'nova',
    title: 'Talk it through with Nova',
    message: 'Ask me to help sort through a challenge or find a manageable next step.',
    why: 'You choose what to share. You can change Nova preferences in Settings.',
    icon: 'nova',
    tab: 'nova',
    action: 'Talk with Nova',
  },
  {
    id: 'plan',
    title: 'Make progress your way',
    message: 'Your Recovery Plan brings together small, practical actions.',
    why: "Pick what fits today. You don't need to do everything at once.",
    icon: 'plan',
    tab: 'plan',
    action: 'Open My Plan',
  },
];

export function novaGuideIndexForPage(page: string): number {
  const index = NOVA_GUIDE_STEPS.findIndex(step => step.id === page);
  return index >= 0 ? index : 0;
}

// Store only the invitation dismissal, never personal responses or messages.
// Scoping by authenticated UID prevents one shared browser user's dismissal
// from hiding the invitation for another signed-in account.
export function novaGuideInviteKey(uid: string): string {
  return `blaze-nova-guide-invite-v1:${encodeURIComponent(uid)}`;
}
