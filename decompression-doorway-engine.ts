// Pure, deterministic logic behind the Decompression Doorway: notice the
// threshold -> identify what's still carried -> capture or release it ->
// check available capacity -> choose how to arrive -> one small anchor ->
// cross -> optionally check whether it stuck -> learn over time (CORE
// CLOSED LOOP). Nothing here scores, streaks, or rates a transition -
// the purpose is self-understanding, never habit compliance.

// ---- Leaving / Arriving vocabulary --------------------------------------
// LEAVING lists roles and pressures; ARRIVING prefers states and
// qualities over another role label - "Manager -> Human Being" is
// exactly the pairing the brief says never to use as a primary preset.

export const LEAVING_PRESETS: string[] = [
  'Work', 'Manager Mode', 'Business Owner Mode', 'Client Pressure', 'Caregiving',
  'Parenting', 'Social Mode', 'Conflict', 'Public Performance', 'Study / School',
  'Busy Day', 'Everyone Else',
];

export const ARRIVING_STATE_PRESETS: string[] = [
  'Present', 'Quiet', 'Off Duty', 'Patient', 'Open', 'Playful', 'Resting',
  'Available', 'Peaceful', 'Just Me', 'Home', 'Family Time', 'Alone Time',
  'Prayer / Reflection', 'Sleep', 'My Own Time',
];

export interface ThresholdPairing {
  leaving: string;
  arriving: string;
}

// GOOD PRESET EXAMPLES, TWO-WAY TRANSITIONS and RETURN TO ME TRANSITIONS,
// combined into one suggestion list - good pairings never imply the user
// only becomes human after leaving a role.
export const SUGGESTED_PAIRINGS: ThresholdPairing[] = [
  { leaving: 'Work', arriving: 'Home' },
  { leaving: 'Manager Mode', arriving: 'Off Duty' },
  { leaving: 'Business Owner Mode', arriving: 'Family Time' },
  { leaving: 'Client Pressure', arriving: 'My Own Time' },
  { leaving: 'Public Performance', arriving: 'Private Self' },
  { leaving: 'Caregiving', arriving: 'Time for Me' },
  { leaving: 'Parenting', arriving: 'Me' },
  { leaving: 'Social Mode', arriving: 'Alone Time' },
  { leaving: 'Busy Day', arriving: 'Sleep' },
  { leaving: 'Everyone Else', arriving: 'Myself' },
  // TWO-WAY TRANSITIONS - the difficult direction isn't always work to home.
  { leaving: 'Home', arriving: 'Work' },
  { leaving: 'Rest', arriving: 'Work' },
  { leaving: 'Parenting', arriving: 'Professional' },
  { leaving: 'Sleep', arriving: 'Morning' },
  { leaving: 'Weekend', arriving: 'Monday' },
  { leaving: 'Social Mode', arriving: 'Alone' },
  { leaving: 'Conflict', arriving: 'Normal Day' },
  { leaving: 'Prayer / Reflection', arriving: 'Work' },
  { leaving: 'Home', arriving: 'Social Mode' },
];

// RETURN TO ME TRANSITIONS - explicitly supported, never forced.
export const RETURN_TO_ME_PAIRINGS: ThresholdPairing[] = [
  { leaving: 'Parenting', arriving: 'Me' },
  { leaving: 'Caregiving', arriving: 'Me' },
  { leaving: 'Professional', arriving: 'Me' },
  { leaving: 'Partner', arriving: 'Me' },
  { leaving: 'Everyone Else', arriving: 'Me' },
  { leaving: 'Public Self', arriving: 'Private Self' },
];

export const RETURN_TO_ME_QUESTION = 'Who are you when nobody needs anything from you for a moment?';

// WORK-FROM-HOME SUPPORT - thresholds for a day with no physical commute.
export const WORK_FROM_HOME_THRESHOLDS: string[] = [
  'Final meeting ends', 'Laptop closes', 'Work notifications stop',
  'Workspace is physically cleared', 'Leave the work room', 'A short walk',
  'Change of clothes', 'Lighting change', 'Transition sound', 'End-of-day note',
];

// ---- Unfinished business -------------------------------------------------

export type UnfinishedBusinessAnswer =
  | 'replaying_conversation' | 'something_unfinished' | 'afraid_forget'
  | 'someone_elses_urgency' | 'frustration' | 'a_decision' | 'tomorrows_workload'
  | 'dont_know' | 'something_else';

export const UNFINISHED_BUSINESS_ORDER: UnfinishedBusinessAnswer[] = [
  'replaying_conversation', 'something_unfinished', 'afraid_forget',
  'someone_elses_urgency', 'frustration', 'a_decision', 'tomorrows_workload',
  'dont_know', 'something_else',
];

export const UNFINISHED_BUSINESS_LABELS: Record<UnfinishedBusinessAnswer, string> = {
  replaying_conversation: "A conversation I'm replaying",
  something_unfinished: 'Something unfinished',
  afraid_forget: "Something I'm afraid I'll forget",
  someone_elses_urgency: "Someone else's urgency",
  frustration: 'Frustration',
  a_decision: 'A decision',
  tomorrows_workload: "Tomorrow's workload",
  dont_know: "I don't know",
  something_else: 'Something else',
};

export type UnfinishedBusinessDisposition = 'park' | 'schedule' | 'needs_action_now' | 'let_go';

export const DISPOSITION_ORDER: UnfinishedBusinessDisposition[] = ['park', 'schedule', 'needs_action_now', 'let_go'];

export const DISPOSITION_LABELS: Record<UnfinishedBusinessDisposition, string> = {
  park: 'Park It',
  schedule: 'Schedule It',
  needs_action_now: 'It genuinely needs action now',
  let_go: 'Let It Go',
};

export type ParkReminderChoice = 'tomorrow' | 'specific_day' | 'no_reminder';

// ---- Capacity-aware arrival -----------------------------------------------
// Reuses the same "very low capacity" cutoff Energy Delta Management
// already uses, rather than inventing a second threshold.
export const CAPACITY_VERY_LOW_CUTOFF = 40;

export const ARRIVAL_QUALITY_OPTIONS: string[] = [
  'Present', 'Quiet', 'Patient', 'Open', 'Playful', 'Off Duty', 'Resting', 'Just Myself', "I don't know yet",
];

// CAPACITY-AWARE ARRIVAL: never ask someone significantly depleted to
// perform an unrealistic emotional state ("Be playful", "Be fully
// present", "Show up positively").
export const LOW_CAPACITY_ARRIVAL_OPTIONS: string[] = [
  'Quiet', 'Good enough', 'I need ten minutes first', 'Just be present', "I don't know",
];

export const getArrivalQualityOptions = (capacityVeryLow: boolean): string[] =>
  capacityVeryLow ? LOW_CAPACITY_ARRIVAL_OPTIONS : ARRIVAL_QUALITY_OPTIONS;

// NOVA COMPANION STYLE: a short, warm reflection, never a canned
// "state calibrated" confirmation.
const ARRIVAL_REFLECTION_LINES: Record<string, string> = {
  'Present': 'Present. Not perfect. Just here.',
  'Quiet': 'Quiet is enough tonight.',
  'Good enough': 'Good enough is enough.',
  'I need ten minutes first': "That's allowed. Take the ten minutes.",
  'Just be present': 'Just be present. Nothing more required.',
  "I don't know": "That's okay. No need to decide right now.",
  "I don't know yet": "That's okay. No need to decide right now.",
  'Off Duty': "You're off duty.",
  'Resting': 'Resting counts.',
};

export const reflectArrivalChoice = (quality: string): string =>
  ARRIVAL_REFLECTION_LINES[quality] || `${quality}. That's enough tonight.`;

// ---- Transition ritual ----------------------------------------------------

export const RITUAL_ANCHORS: string[] = [
  'Close the laptop', 'Put the work phone away', 'Change clothes', 'Wash your face',
  'Step outside briefly', 'Take one slow breath', 'Play a chosen transition sound',
  'Walk around the block', "Put tomorrow's notes somewhere safe", 'Sit quietly for two minutes',
  'Remove work notifications where supported', 'Change lighting', 'Make tea / water',
  'Begin prayer / reflection', 'Do nothing except pause',
];

export const DECOMPRESSION_SOUND_OPTIONS: string[] = ['Doorway tone', 'Soft chime', 'Night Air', 'Stillness', 'No sound'];

// ---- Nudge consent ---------------------------------------------------------

export type NudgeFrequency = 'always_ask' | 'only_hard_days' | 'specific_days' | 'off';

export const NUDGE_FREQUENCY_ORDER: NudgeFrequency[] = ['always_ask', 'only_hard_days', 'specific_days', 'off'];

export const NUDGE_FREQUENCY_LABELS: Record<NudgeFrequency, string> = {
  always_ask: 'Always ask',
  only_hard_days: 'Only on hard days',
  specific_days: 'Specific days',
  off: 'Off',
};

// ---- Duration / depth ------------------------------------------------------

export type DoorwayDepth = 'quick' | 'standard' | 'deeper';

export const DOORWAY_DEPTH_ORDER: DoorwayDepth[] = ['quick', 'standard', 'deeper'];

export const DOORWAY_DEPTH_LABELS: Record<DoorwayDepth, string> = {
  quick: 'Quick Doorway', standard: 'Standard Doorway', deeper: 'Deeper Decompression',
};

export const DOORWAY_DEPTH_DURATION_LABEL: Record<DoorwayDepth, string> = {
  quick: '30 seconds', standard: '2 minutes', deeper: '5 minutes',
};

// "Nova should recommend the shortest level likely to be sufficient" -
// Deeper is only ever recommended once the same transition has
// genuinely been difficult repeatedly, never by default.
export const recommendDoorwayDepth = (transitionRepeatedlyDifficult: boolean): DoorwayDepth =>
  transitionRepeatedlyDifficult ? 'deeper' : 'quick';

export const DEEPER_DECOMPRESSION_QUESTIONS: string[] = [
  'What are you leaving?',
  'What are you still carrying?',
  'What genuinely needs action?',
  'What can stay behind?',
  'What capacity do you have left?',
  'How do you want to arrive?',
  'What small action marks the transition?',
];

// ---- Arrival check ----------------------------------------------------------

export type ArrivalCheckResponse = 'yes' | 'mostly' | 'not_really' | 'not_sure';

export const ARRIVAL_CHECK_ORDER: ArrivalCheckResponse[] = ['yes', 'mostly', 'not_really', 'not_sure'];

export const ARRIVAL_CHECK_LABELS: Record<ArrivalCheckResponse, string> = {
  yes: 'Yes', mostly: 'Mostly', not_really: 'Not really', not_sure: "I'm not sure",
};

export type ArrivalCheckOptionId = 'clear_it' | 'talk_to_nova' | 'not_now';

export const ARRIVAL_CHECK_OPTION_LABELS: Record<ArrivalCheckOptionId, string> = {
  clear_it: 'Clear it', talk_to_nova: 'Talk to Nova', not_now: 'Not now',
};

export interface ArrivalCheckBranch {
  novaLine: string;
  options: ArrivalCheckOptionId[];
}

export const ARRIVAL_CHECK_BRANCHES: Record<ArrivalCheckResponse, ArrivalCheckBranch> = {
  yes: { novaLine: 'Good. Leave it there.', options: [] },
  mostly: { novaLine: "That counts. You don't need a perfect switch.", options: [] },
  not_really: { novaLine: 'Something followed you through. Want to clear it or leave it alone?', options: ['clear_it', 'talk_to_nova', 'not_now'] },
  not_sure: { novaLine: 'No need to analyse it. Notice where you are now.', options: [] },
};

// Sparingly - never after every transition. A simple interval, same
// shape as this session's other "occasional" gates.
export const ARRIVAL_CHECK_ASK_INTERVAL = 3;

export const shouldOfferArrivalCheck = (totalCrossingsBeforeThisOne: number): boolean =>
  (totalCrossingsBeforeThisOne + 1) % ARRIVAL_CHECK_ASK_INTERVAL === 0;

// ---- Failed / incomplete transitions ---------------------------------------

export type FollowedThroughAnswer =
  | 'the_conversation' | 'something_unfinished' | 'anger' | 'worry'
  | 'work_notifications' | 'reopened_work' | 'couldnt_switch_off' | 'not_sure';

export const FOLLOWED_THROUGH_ORDER: FollowedThroughAnswer[] = [
  'the_conversation', 'something_unfinished', 'anger', 'worry',
  'work_notifications', 'reopened_work', 'couldnt_switch_off', 'not_sure',
];

export const FOLLOWED_THROUGH_LABELS: Record<FollowedThroughAnswer, string> = {
  the_conversation: 'The conversation',
  something_unfinished: 'Something unfinished',
  anger: 'Anger',
  worry: 'Worry',
  work_notifications: 'Work notifications',
  reopened_work: 'I reopened work',
  couldnt_switch_off: "I couldn't switch off",
  not_sure: "I'm not sure",
};

export type FollowUpTool = 'rumination_furnace' | 'one_less_thing' | 'tomorrow_parking_list' | 'quick_reset' | 'talk_to_nova' | 'nothing';

export const FOLLOW_UP_TOOL_LABELS: Record<FollowUpTool, string> = {
  rumination_furnace: 'Rumination Furnace',
  one_less_thing: 'One Less Thing',
  tomorrow_parking_list: 'Tomorrow Parking List',
  quick_reset: 'Quick Reset',
  talk_to_nova: 'Talk to Nova',
  nothing: 'Nothing — I just needed to notice it',
};

// "Then offer the smallest relevant tool" - one suggestion, not a menu.
export const suggestFollowUpTool = (answer: FollowedThroughAnswer): FollowUpTool => {
  switch (answer) {
    case 'the_conversation':
    case 'anger':
    case 'worry':
      return 'rumination_furnace';
    case 'something_unfinished':
    case 'reopened_work':
      return 'one_less_thing';
    case 'work_notifications':
      return 'tomorrow_parking_list';
    case "couldnt_switch_off":
      return 'quick_reset';
    default:
      return 'talk_to_nova';
  }
};

// ---- Role weight (clues, never diagnoses) ----------------------------------

export const ROLE_WEIGHT_OPTIONS: string[] = ['Work', 'Manager', 'Parent', 'Caregiver', 'Business Owner', 'Public Self', 'Other'];

export type SwitchedOnReason =
  | 'responsibility' | 'unfinished_work' | 'guilt' | 'people_can_reach_me'
  | 'dont_trust_handled' | 'habit' | 'not_sure';

export const SWITCHED_ON_REASON_ORDER: SwitchedOnReason[] = [
  'responsibility', 'unfinished_work', 'guilt', 'people_can_reach_me', 'dont_trust_handled', 'habit', 'not_sure',
];

export const SWITCHED_ON_REASON_LABELS: Record<SwitchedOnReason, string> = {
  responsibility: 'Responsibility',
  unfinished_work: 'Unfinished work',
  guilt: 'Guilt',
  people_can_reach_me: 'People can still reach me',
  dont_trust_handled: "I don't trust it will be handled",
  habit: 'Habit',
  not_sure: "I'm not sure",
};

// ---- Pattern learning (hypotheses, never conclusions) ----------------------

export const MIN_SESSIONS_FOR_DOORWAY_PATTERN = 3;

export interface CapacityAtArrivalEntry {
  capacity: number | null;
}

// "You're often arriving home with very little capacity left."
export const detectLowCapacityArrivalPattern = (entries: CapacityAtArrivalEntry[]): boolean => {
  const known = entries.map((e) => e.capacity).filter((c): c is number => c !== null);
  if (known.length < MIN_SESSIONS_FOR_DOORWAY_PATTERN) return false;
  const lowCount = known.filter((c) => c < CAPACITY_VERY_LOW_CUTOFF).length;
  return lowCount / known.length >= 0.6;
};

// "You often skip your Parent -> Me transition."
export const detectFrequentSkipPattern = (totalPrompted: number, totalSkipped: number): boolean =>
  totalPrompted >= MIN_SESSIONS_FOR_DOORWAY_PATTERN && totalSkipped / totalPrompted >= 0.5;

// DEEPER REDISCOVERY QUESTION: "What version of you gets most of your
// energy - and which version only gets what's left?" Only offered with
// real history behind it and never while the user is overwhelmed right now.
export const MIN_SESSIONS_FOR_DEEPER_REDISCOVERY = 5;

export const shouldOfferDeeperRediscoveryQuestion = (
  totalSessions: number,
  isCurrentlyOverwhelmed: boolean
): boolean => !isCurrentlyOverwhelmed && totalSessions >= MIN_SESSIONS_FOR_DEEPER_REDISCOVERY;

// ---- My Thresholds storage helpers (pure) ----------------------------------
// Stable, URL/doc-id-safe key for a leaving->arriving pair so "My
// Thresholds" can store one profile per recurring pair rather than one
// row per session.
export const pairKeyFor = (leaving: string, arriving: string): string =>
  `${leaving}__${arriving}`.toLowerCase().trim().replace(/[^a-z0-9_]+/g, '_');

export const CAPACITY_HISTORY_MAX = 10;

// Keeps only recent real history so a years-old low-capacity day doesn't
// permanently anchor a pattern read.
export const appendCapacityHistory = (history: (number | null)[], capacity: number | null): (number | null)[] =>
  [...history, capacity].slice(-CAPACITY_HISTORY_MAX);

// ---- Companion-voice guardrail ---------------------------------------------
// NOVA'S VOICE HERE IS A COMPANION, NEVER A COMPLIANCE ENGINE - this tool
// in particular must never sound like it's grading or enforcing the
// transition. Any Nova-voiced copy this component writes should avoid
// every phrase below.
export const DECOMPRESSION_BANNED_PHRASES: string[] = [
  'transition protocol', 'boundary compliance', 'threshold compliance',
  'execute the crossing', 'validate your transition', 'compliance score',
  'boundary adherence', 'transition successfully logged', 'initiate crossing sequence',
  'crossing verified', 'boundary violation', 'non-compliant transition',
];

export const containsBannedPhrase = (text: string): boolean => {
  const lower = text.toLowerCase();
  return DECOMPRESSION_BANNED_PHRASES.some((p) => lower.includes(p));
};
