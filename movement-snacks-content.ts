// Movement Snacks' curated content + data model (Foundation batch, section 26).
// Mirrors grounding-content.ts's convention: one place owns WHAT the library
// contains, kept separate from how it's rendered or recommended. Everything
// here is gentle, accessible, and never gym/fitness-programming language -
// see docs/PRODUCT_SAFETY_PRIVACY.md-style guardrails baked directly into
// the copy (section 6's safety language, section 7's copy clean-up:
// "Realign your physical structure"/"Circadian rhythm anchor" are gone).

export type MovementCategory = 'release' | 'reset' | 'transition' | 'energise';

export const MOVEMENT_CATEGORY_LABELS: Record<MovementCategory, { label: string; description: string }> = {
  release: { label: 'Release', description: 'Reduce the sense of accumulated physical tension.' },
  reset: { label: 'Reset', description: 'Interrupt prolonged sitting or static posture.' },
  transition: { label: 'Transition', description: 'Create a physical and psychological shift after a demanding period.' },
  energise: { label: 'Energise', description: 'A simple movement or environment change when you feel flat or stuck.' },
};

export const MOVEMENT_CATEGORY_ORDER: MovementCategory[] = ['release', 'reset', 'transition', 'energise'];

// The primary entry screen's "What do you need right now?" contextual
// choices (section 1) - deliberately need-based, not exercise-based.
export type MovementContext =
  | 'sitting_too_long'
  | 'neck_shoulders_tight'
  | 'meeting_lingering'
  | 'switch_off_work'
  | 'need_air_daylight'
  | 'restless_stuck'
  | 'quick';

export const MOVEMENT_CONTEXT_LABELS: Record<MovementContext, string> = {
  sitting_too_long: "I've been sitting too long",
  neck_shoulders_tight: 'My neck or shoulders feel tight',
  meeting_lingering: "That meeting is still with me",
  switch_off_work: 'I need to switch out of work mode',
  need_air_daylight: 'I need some air and daylight',
  restless_stuck: 'I feel restless or stuck',
  quick: 'Just give me something quick',
};

export const MOVEMENT_CONTEXT_ORDER: MovementContext[] = [
  'sitting_too_long', 'neck_shoulders_tight', 'meeting_lingering', 'switch_off_work', 'need_air_daylight', 'restless_stuck', 'quick',
];

export type MovementPosition = 'seated' | 'standing';

export interface MovementStep {
  id: string;
  // Short imperative line, shown alone while the person is moving (section
  // 3) - never a paragraph.
  instruction: string;
  // Optional secondary line - context/reassurance, still brief.
  supportingText?: string;
  durationSeconds?: number;
}

export interface MovementSnack {
  id: string;
  title: string;
  shortDescription: string;
  category: MovementCategory;
  durationSeconds: number;
  // Which "what do you need right now" contexts this is a good answer to.
  contexts: MovementContext[];
  supportedPositions: MovementPosition[];
  steps: MovementStep[];
  closingPrompt: string;
  safetyNotes?: string;
  voiceEnabled: boolean;
  active: boolean;
  // Broader tags a future recommendation layer can key off (e.g. burnout
  // archetype) - deliberately separate from `contexts`, which is only the
  // literal need-picker keys.
  recommendedFor?: string[];
  avoidWhen?: string[];
  alternativeMovementIds?: string[];
}

const COMFORTABLE_RANGE_NOTE = 'Move within a comfortable range. There is no need to force this. Stop if this feels painful or wrong for your body.';

export const MOVEMENT_SNACKS: Record<string, MovementSnack> = {
  neck_shoulder: {
    id: 'neck_shoulder',
    title: 'Neck & Shoulder Release',
    shortDescription: 'Let go of tension held from screen time.',
    category: 'release',
    durationSeconds: 90,
    contexts: ['neck_shoulders_tight', 'sitting_too_long'],
    supportedPositions: ['seated', 'standing'],
    steps: [
      { id: 's1', instruction: 'Lift your shoulders up', supportingText: 'Up towards your ears, then let them drop.', durationSeconds: 8 },
      { id: 's2', instruction: 'Roll your shoulders gently', supportingText: 'A few slow backward rolls.', durationSeconds: 12 },
      { id: 's3', instruction: 'Slowly look to the left', supportingText: 'Only as far as feels easy - no pulling.', durationSeconds: 8 },
      { id: 's4', instruction: 'Slowly look to the right', supportingText: 'Same gentle range.', durationSeconds: 8 },
      { id: 's5', instruction: 'Tilt your right ear towards your right shoulder', supportingText: 'Let gravity do the work, not effort.', durationSeconds: 10 },
      { id: 's6', instruction: 'Tilt your left ear towards your left shoulder', durationSeconds: 10 },
      { id: 's7', instruction: 'Let your hands relax completely', durationSeconds: 6 },
      { id: 's8', instruction: 'Return to neutral', supportingText: 'Notice what feels different.', durationSeconds: 6 },
    ],
    closingPrompt: 'That tension had somewhere to go. Notice what feels different now.',
    safetyNotes: COMFORTABLE_RANGE_NOTE + ' No pulling and no forcing the range.',
    voiceEnabled: true,
    active: true,
    alternativeMovementIds: ['desk_stretch', 'upper_body_shake'],
  },

  hand_wrist: {
    id: 'hand_wrist',
    title: 'Hand & Wrist Release',
    shortDescription: 'A brief reset for hands tired from typing or holding a phone.',
    category: 'release',
    durationSeconds: 45,
    contexts: ['sitting_too_long'],
    supportedPositions: ['seated', 'standing'],
    steps: [
      { id: 's1', instruction: 'Shake your hands out gently', durationSeconds: 8 },
      { id: 's2', instruction: 'Open your fingers wide, then relax them', durationSeconds: 8 },
      { id: 's3', instruction: 'Slowly circle your wrists', supportingText: 'One direction, then the other.', durationSeconds: 12 },
      { id: 's4', instruction: 'Press your palms together gently in front of your chest', durationSeconds: 10 },
      { id: 's5', instruction: 'Let your hands fall loose at your sides', durationSeconds: 5 },
    ],
    closingPrompt: 'Small, easily missed tension - worth noticing.',
    safetyNotes: COMFORTABLE_RANGE_NOTE,
    voiceEnabled: true,
    active: true,
    alternativeMovementIds: ['neck_shoulder'],
  },

  jaw_face: {
    id: 'jaw_face',
    title: 'Jaw & Face Reset',
    shortDescription: 'Release tension you might not notice you\'re holding.',
    category: 'release',
    durationSeconds: 40,
    contexts: ['restless_stuck'],
    supportedPositions: ['seated', 'standing'],
    steps: [
      { id: 's1', instruction: 'Notice your jaw', supportingText: 'Is it clenched? Let it soften.', durationSeconds: 8 },
      { id: 's2', instruction: 'Let your tongue rest gently on the roof of your mouth', durationSeconds: 8 },
      { id: 's3', instruction: 'Raise your eyebrows, then release', durationSeconds: 6 },
      { id: 's4', instruction: 'Let your whole face go soft', supportingText: 'As if no one is watching.', durationSeconds: 10 },
    ],
    closingPrompt: 'A face held tight all day is easy to forget about. Now you\'ve noticed it.',
    voiceEnabled: true,
    active: true,
  },

  upper_body_shake: {
    id: 'upper_body_shake',
    title: 'Upper-Body Shake-Out',
    shortDescription: 'Shed tension held across your shoulders and arms.',
    category: 'release',
    durationSeconds: 40,
    contexts: ['restless_stuck', 'neck_shoulders_tight'],
    supportedPositions: ['standing'],
    steps: [
      { id: 's1', instruction: 'Stand if you can', supportingText: 'Seated is fine if standing isn\'t possible right now.' },
      { id: 's2', instruction: 'Gently shake out your hands', durationSeconds: 10 },
      { id: 's3', instruction: 'Let the shake travel up through your arms', durationSeconds: 10 },
      { id: 's4', instruction: 'Roll your shoulders loose', durationSeconds: 10 },
      { id: 's5', instruction: 'Let everything settle', durationSeconds: 6 },
    ],
    closingPrompt: 'Notice what feels looser.',
    safetyNotes: COMFORTABLE_RANGE_NOTE,
    voiceEnabled: true,
    active: true,
  },

  desk_stretch: {
    id: 'desk_stretch',
    title: 'Desk Reset',
    shortDescription: 'A one-minute reset for wherever you\'re sitting.',
    category: 'reset',
    durationSeconds: 60,
    contexts: ['sitting_too_long', 'neck_shoulders_tight'],
    supportedPositions: ['seated', 'standing'],
    steps: [
      { id: 's1', instruction: 'Move your feet firmly to the floor', durationSeconds: 6 },
      { id: 's2', instruction: 'Let your shoulders drop', durationSeconds: 6 },
      { id: 's3', instruction: 'Gently lengthen through your spine', supportingText: 'Sit or stand a little taller.', durationSeconds: 8 },
      { id: 's4', instruction: 'Reach overhead if that\'s comfortable', supportingText: 'Skip this if it isn\'t.', durationSeconds: 10 },
      { id: 's5', instruction: 'Look away from the screen', supportingText: 'Find something further away to focus on.', durationSeconds: 10 },
      { id: 's6', instruction: 'Stand if appropriate', durationSeconds: 6 },
      { id: 's7', instruction: 'Take a few steps', durationSeconds: 10 },
    ],
    closingPrompt: 'Return when you\'re ready.',
    safetyNotes: 'There is no single "correct" posture here - just a change from the one you\'ve been holding.',
    voiceEnabled: true,
    active: true,
    alternativeMovementIds: ['posture_reset', 'walk_3min'],
  },

  posture_reset: {
    id: 'posture_reset',
    title: 'Posture Reset',
    shortDescription: 'Reset your position, breathing and tension.',
    category: 'reset',
    durationSeconds: 30,
    contexts: ['sitting_too_long', 'quick'],
    supportedPositions: ['seated', 'standing'],
    steps: [
      { id: 's1', instruction: 'Sit or stand a little taller', durationSeconds: 6 },
      { id: 's2', instruction: 'Let your chin tuck slightly', durationSeconds: 6 },
      { id: 's3', instruction: 'Expand your chest as you breathe in', durationSeconds: 8 },
      { id: 's4', instruction: 'Let it go on the breath out', durationSeconds: 8 },
    ],
    closingPrompt: 'A small shift, on purpose.',
    voiceEnabled: true,
    active: true,
  },

  walk_3min: {
    id: 'walk_3min',
    title: '3-Minute Walk',
    shortDescription: 'Break the static, seated posture.',
    category: 'reset',
    durationSeconds: 180,
    contexts: ['sitting_too_long', 'restless_stuck'],
    supportedPositions: ['standing'],
    steps: [
      { id: 's1', instruction: 'Stand up', durationSeconds: 5 },
      { id: 's2', instruction: 'Walk away from your workspace', supportingText: 'Any direction - the point is leaving, not distance.', durationSeconds: 15 },
      { id: 's3', instruction: 'Keep your eyes looking forward, not down at a screen', durationSeconds: 140 },
      { id: 's4', instruction: 'Head back when you\'re ready', durationSeconds: 10 },
    ],
    closingPrompt: 'Your body just did something different than sitting. That\'s the whole point.',
    voiceEnabled: true,
    active: true,
    alternativeMovementIds: ['desk_stretch'],
  },

  look_away: {
    id: 'look_away',
    title: 'Look Away',
    shortDescription: 'Give your eyes and attention a short break from the screen.',
    category: 'reset',
    durationSeconds: 45,
    contexts: ['sitting_too_long', 'quick'],
    supportedPositions: ['seated', 'standing'],
    steps: [
      { id: 's1', instruction: 'Let your eyes leave the screen', durationSeconds: 5 },
      { id: 's2', instruction: 'Find something farther away to look at', supportingText: 'A window, the far side of the room - anything distant.', durationSeconds: 30 },
      { id: 's3', instruction: 'Stand or change position if you can', durationSeconds: 10 },
    ],
    closingPrompt: 'Back whenever you\'re ready.',
    voiceEnabled: true,
    active: true,
  },

  shake_meeting: {
    id: 'shake_meeting',
    title: 'Shake Off the Meeting',
    shortDescription: 'Let your body register that the interaction has ended.',
    category: 'transition',
    durationSeconds: 60,
    contexts: ['meeting_lingering'],
    supportedPositions: ['seated', 'standing'],
    steps: [
      { id: 's1', instruction: 'Step away', supportingText: 'Physically change position if you can.', durationSeconds: 8 },
      { id: 's2', instruction: 'Release your shoulders, hands and jaw', durationSeconds: 12 },
      { id: 's3', instruction: 'Shake out your hands and arms', supportingText: 'Or your whole body, if that\'s comfortable.', durationSeconds: 12 },
      { id: 's4', instruction: 'Take one or two longer breaths out', supportingText: 'No need to hold anything - just exhale a little longer than usual.', durationSeconds: 12 },
    ],
    closingPrompt: 'That interaction has ended. What needs action, and what can stay there?',
    safetyNotes: COMFORTABLE_RANGE_NOTE,
    voiceEnabled: true,
    active: true,
    alternativeMovementIds: ['upper_body_shake'],
  },

  after_work: {
    id: 'after_work',
    title: 'After-Work Decompression',
    shortDescription: 'A physical boundary ritual between working and personal life.',
    category: 'transition',
    durationSeconds: 480,
    contexts: ['switch_off_work'],
    supportedPositions: ['standing'],
    steps: [
      { id: 's1', instruction: 'Stand up and step away from where you\'ve been working', supportingText: 'Close the laptop or leave the workspace behind, if you can.', durationSeconds: 15 },
      { id: 's2', instruction: 'Drop your shoulders', durationSeconds: 8 },
      { id: 's3', instruction: 'Unclench your hands', durationSeconds: 8 },
      { id: 's4', instruction: 'Let your jaw soften', durationSeconds: 8 },
      { id: 's5', instruction: 'Move somewhere different', supportingText: 'Another room, outside, or just away from your desk.', durationSeconds: 15 },
      { id: 's6', instruction: 'Walk for a few minutes', supportingText: 'No pace target, no steps target - this is a transition, not exercise.', durationSeconds: 180 },
    ],
    closingPrompt: 'Work has ended. You don\'t have to keep carrying it in your body.',
    voiceEnabled: true,
    active: true,
  },

  end_of_day_walk: {
    id: 'end_of_day_walk',
    title: 'End-of-Day Walk',
    shortDescription: 'A short walk to mark the day changing shape.',
    category: 'transition',
    durationSeconds: 180,
    contexts: ['switch_off_work', 'need_air_daylight'],
    supportedPositions: ['standing'],
    steps: [
      { id: 's1', instruction: 'Step outside if you can', supportingText: 'A hallway or another room works too.', durationSeconds: 10 },
      { id: 's2', instruction: 'Walk at whatever pace feels comfortable', durationSeconds: 150 },
      { id: 's3', instruction: 'Notice the day changing shape', durationSeconds: 10 },
    ],
    closingPrompt: 'The day is allowed to end.',
    voiceEnabled: true,
    active: true,
    alternativeMovementIds: ['after_work'],
  },

  sunlight_walk: {
    id: 'sunlight_walk',
    title: 'Sunlight Walk',
    shortDescription: 'Step into daylight and give your body a clearer time-of-day signal.',
    category: 'energise',
    durationSeconds: 300,
    contexts: ['need_air_daylight'],
    supportedPositions: ['standing'],
    steps: [
      { id: 's1', instruction: 'Step outside if you can', durationSeconds: 10 },
      { id: 's2', instruction: 'Walk at whatever pace feels comfortable', durationSeconds: 260 },
      { id: 's3', instruction: 'Look around rather than at your phone', supportingText: 'Put it away if that helps - Blaze Break will let you know when the time is up.', durationSeconds: 20 },
    ],
    closingPrompt: 'A little daylight, a little distance from the screen.',
    safetyNotes: 'Never look directly at the sun.',
    voiceEnabled: true,
    active: true,
    alternativeMovementIds: ['end_of_day_walk', 'fresh_air_reset'],
  },

  whole_body_shake: {
    id: 'whole_body_shake',
    title: 'Shake & Reset',
    shortDescription: 'A quick change of state when you feel restless or stuck.',
    category: 'energise',
    durationSeconds: 40,
    contexts: ['restless_stuck', 'quick'],
    supportedPositions: ['standing'],
    steps: [
      { id: 's1', instruction: 'Stand if you can', durationSeconds: 5 },
      { id: 's2', instruction: 'Shake out your hands', durationSeconds: 8 },
      { id: 's3', instruction: 'Let the shake move through your arms and shoulders', durationSeconds: 10 },
      { id: 's4', instruction: 'Bounce gently on your feet, if that\'s comfortable', durationSeconds: 10 },
      { id: 's5', instruction: 'Let it all settle', durationSeconds: 7 },
    ],
    closingPrompt: 'A quick change of state - however small.',
    safetyNotes: COMFORTABLE_RANGE_NOTE,
    voiceEnabled: true,
    active: true,
    alternativeMovementIds: ['upper_body_shake', 'walk_3min'],
  },

  fresh_air_reset: {
    id: 'fresh_air_reset',
    title: 'Fresh-Air Reset',
    shortDescription: 'Leave the workstation and change your environment for a minute.',
    category: 'energise',
    durationSeconds: 90,
    contexts: ['need_air_daylight', 'restless_stuck'],
    supportedPositions: ['standing'],
    steps: [
      { id: 's1', instruction: 'Step away from where you\'ve been working', durationSeconds: 10 },
      { id: 's2', instruction: 'Get some fresh air if you can', supportingText: 'An open window or doorway works too.', durationSeconds: 60 },
      { id: 's3', instruction: 'Notice the change in air, light or sound', durationSeconds: 15 },
    ],
    closingPrompt: 'A different environment, even briefly, is a real reset.',
    voiceEnabled: true,
    active: true,
    alternativeMovementIds: ['sunlight_walk'],
  },
};

export const MOVEMENT_ORDER: string[] = [
  'neck_shoulder', 'hand_wrist', 'jaw_face', 'upper_body_shake',
  'desk_stretch', 'posture_reset', 'walk_3min', 'look_away',
  'shake_meeting', 'after_work', 'end_of_day_walk',
  'sunlight_walk', 'whole_body_shake', 'fresh_air_reset',
];

export const MOVEMENTS_BY_CATEGORY: Record<MovementCategory, string[]> = MOVEMENT_ORDER.reduce((acc, id) => {
  const category = MOVEMENT_SNACKS[id]!.category;
  (acc[category] ||= []).push(id);
  return acc;
}, {} as Record<MovementCategory, string[]>);

// The "I need to stay where I am" filter (section 21) - anything that lists
// 'seated' among its supported positions.
export const seatedFriendlyMovementIds = (): string[] =>
  MOVEMENT_ORDER.filter((id) => MOVEMENT_SNACKS[id]!.supportedPositions.includes('seated'));

// Section 5's optional movement check-out.
export type MovementFeedback = 'looser' | 'more_settled' | 'more_awake' | 'about_the_same' | 'more_uncomfortable';

export const MOVEMENT_FEEDBACK_OPTIONS: { id: MovementFeedback; label: string }[] = [
  { id: 'looser', label: 'A little looser' },
  { id: 'more_settled', label: 'More settled' },
  { id: 'more_awake', label: 'More awake' },
  { id: 'about_the_same', label: 'About the same' },
  { id: 'more_uncomfortable', label: 'More uncomfortable' },
];
