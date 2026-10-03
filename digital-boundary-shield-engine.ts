// DIGITAL BOUNDARY SHIELD - "Make the boundary real." Pure logic for
// reusable Boundary Profiles and the "Urgent or Loud?" guided filter.
//
// DIGITAL BOUNDARY TRUTH: every action here is honestly labelled by what
// it actually does. This app cannot mute Slack/Teams/WhatsApp/email
// directly from this screen - where a real integration exists (Boundary
// Autopilot's Slack status/DND, Decompression Doorway), actions route
// there rather than pretending to perform it locally. Everything else is
// a self-checklist the user confirms for themselves, never a simulated
// system action.

export type BoundaryProfileId =
  | 'focus_block' | 'workday_ending' | 'deep_recovery' | 'weekend_protection'
  | 'family_time' | 'sleep_wind_down' | 'custom';

export const BOUNDARY_PROFILE_ORDER: BoundaryProfileId[] = [
  'focus_block', 'workday_ending', 'deep_recovery', 'weekend_protection', 'family_time', 'sleep_wind_down', 'custom',
];

export const BOUNDARY_PROFILE_LABELS: Record<BoundaryProfileId, string> = {
  focus_block: 'Focus Block',
  workday_ending: 'Workday Ending',
  deep_recovery: 'Deep Recovery',
  weekend_protection: 'Weekend Protection',
  family_time: 'Family Time',
  sleep_wind_down: 'Sleep Wind-Down',
  custom: 'Custom',
};

export type BoundaryActionId =
  | 'park_unfinished_work' | 'update_work_status' | 'mute_work_notifications'
  | 'close_work_tabs' | 'close_email' | 'close_laptop' | 'start_doorway';

export const BOUNDARY_ACTION_ORDER: BoundaryActionId[] = [
  'park_unfinished_work', 'update_work_status', 'mute_work_notifications',
  'close_work_tabs', 'close_email', 'close_laptop', 'start_doorway',
];

export const BOUNDARY_ACTION_LABELS: Record<BoundaryActionId, string> = {
  park_unfinished_work: 'Park unfinished work',
  update_work_status: 'Update work status',
  mute_work_notifications: 'Quiet work notifications',
  close_work_tabs: 'Close work tabs',
  close_email: 'Close email',
  close_laptop: 'Close laptop',
  start_doorway: 'Start Decompression Doorway',
};

// Honest capability per action:
// - 'self_checklist': something only the user can actually do (close a
//   laptop) - the app just lets them mark it done, never claims to do it.
// - 'routes_to_real_tool': this app DOES have a genuine integration for
//   it elsewhere (Boundary Autopilot's Slack status/DND, Decompression
//   Doorway's unfinished-business capture and crossing ritual) - the
//   action is a real handoff there, never simulated locally.
export type BoundaryActionKind = 'self_checklist' | 'routes_to_real_tool';

export const BOUNDARY_ACTION_KIND: Record<BoundaryActionId, BoundaryActionKind> = {
  park_unfinished_work: 'routes_to_real_tool',
  update_work_status: 'routes_to_real_tool',
  mute_work_notifications: 'routes_to_real_tool',
  close_work_tabs: 'self_checklist',
  close_email: 'self_checklist',
  close_laptop: 'self_checklist',
  start_doorway: 'routes_to_real_tool',
};

// Sensible defaults per profile - all configurable, never forced (the
// user can remove any of them when building/editing a profile).
export const DEFAULT_PROFILE_ACTIONS: Record<BoundaryProfileId, BoundaryActionId[]> = {
  focus_block: ['mute_work_notifications', 'close_work_tabs'],
  workday_ending: ['park_unfinished_work', 'update_work_status', 'mute_work_notifications', 'close_work_tabs', 'close_email', 'close_laptop', 'start_doorway'],
  deep_recovery: ['mute_work_notifications', 'close_work_tabs', 'close_email', 'close_laptop'],
  weekend_protection: ['update_work_status', 'mute_work_notifications', 'close_email'],
  family_time: ['mute_work_notifications', 'close_laptop'],
  sleep_wind_down: ['close_email', 'close_laptop', 'mute_work_notifications'],
  custom: [],
};

// Only the Workday Ending profile naturally leads into leaving the role
// behind - never forced on the others.
export const shouldOfferDoorwayCrossing = (profileId: BoundaryProfileId, actions: BoundaryActionId[]): boolean =>
  profileId === 'workday_ending' && actions.includes('start_doorway');

export const DOORWAY_CROSSING_LINE = 'Work is closed. Want help leaving it there?';

// ---- "Urgent or Loud?" guided filter ---------------------------------------
// Never a one-line pronouncement from a crude heuristic - the user is
// guided through the real questions, then classifies it themselves. The
// classification is always theirs to override.

export interface UrgentOrLoudQuestion {
  id: 'waits' | 'real_deadline' | 'who_says' | 'consequence' | 'smallest_response';
  text: string;
}

export const URGENT_OR_LOUD_QUESTIONS: UrgentOrLoudQuestion[] = [
  { id: 'waits', text: 'What happens if this waits?' },
  { id: 'real_deadline', text: 'Is there a real deadline?' },
  { id: 'who_says', text: 'Who says it needs action now?' },
  { id: 'consequence', text: 'What is the consequence of waiting?' },
  { id: 'smallest_response', text: 'What is the smallest response required?' },
];

export type UrgencyClassification =
  | 'actually_urgent' | 'important_not_immediate' | 'someone_elses_urgency' | 'can_wait' | 'needs_more_information';

export const URGENCY_CLASSIFICATION_ORDER: UrgencyClassification[] = [
  'actually_urgent', 'important_not_immediate', 'someone_elses_urgency', 'can_wait', 'needs_more_information',
];

export const URGENCY_CLASSIFICATION_LABELS: Record<UrgencyClassification, string> = {
  actually_urgent: 'Actually urgent',
  important_not_immediate: 'Important, not immediate',
  someone_elses_urgency: "Someone else's urgency",
  can_wait: 'Can wait',
  needs_more_information: 'Needs more information',
};

// Plain, practical next-step copy per classification - never a diagnosis
// of the other person, never an alarm.
export const URGENCY_CLASSIFICATION_GUIDANCE: Record<UrgencyClassification, string> = {
  actually_urgent: 'If it truly needs action now, respond cleanly and specifically, then step away again.',
  important_not_immediate: "This matters, but it doesn't need to happen this second. It's safe to schedule a real response.",
  someone_elses_urgency: "Someone else's time pressure doesn't have to become yours. A brief acknowledgement now, a real response later, is a reasonable choice.",
  can_wait: "This can wait. You don't need to reply right now to prove you saw it.",
  needs_more_information: "It's fair to ask what's actually needed before deciding how fast to move.",
};

export const URGENT_OR_LOUD_SUMMARY_QUESTION = 'So, what is this?';
