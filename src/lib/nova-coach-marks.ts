import type { NovaGuideTab } from './nova-guide';

export interface NovaCoachMark {
  id: string;
  target: string;
  title: string;
  explanation: string;
}

// Targets are identifiers on real, already-accessible UI. Never assume
// a hidden menu, paid feature, unread check-in, or third-party integration.
export const NOVA_COACH_MARKS: Record<NovaGuideTab, readonly NovaCoachMark[]> = {
  home: [
    { id: 'start', target: 'today-reset', title: 'Start where you are',
      explanation: 'Need a quick reset? This button opens a short exercise. Nothing starts until you choose it.' },
    { id: 'chat', target: 'today-nova', title: 'Talk it through',
      explanation: 'This opens Nova Blaze, where you can talk through one issue at a time.' },
    { id: 'progress', target: 'today-progress', title: 'More only when you want it',
      explanation: 'Your check-ins and progress stay tucked away here until you open them.' },
  ],
  diagnose: [
    { id: 'checkin', target: 'checkin-content', title: 'Your check-in',
      explanation: 'Start here when you feel ready. Answer honestly and take it at your own pace.' },
  ],
  nova: [
    { id: 'help', target: 'nova-show-how', title: 'Help is always nearby',
      explanation: 'Use Show me how whenever you want a quick reminder. You decide when to open it.' },
    { id: 'message', target: 'nova-message-input', title: 'Tell Nova what you need',
      explanation: "Type a question here. It's fine to keep it short, and you choose what to share." },
  ],
  plan: [
    { id: 'plan', target: 'plan-content', title: 'Your plan, your pace',
      explanation: 'This area brings your recovery actions together. Pick just one step when you are ready.' },
  ],
};

export function novaCoachMarksForPage(page: string): readonly NovaCoachMark[] {
  return Object.prototype.hasOwnProperty.call(NOVA_COACH_MARKS, page)
    ? NOVA_COACH_MARKS[page as NovaGuideTab] : [];
}
