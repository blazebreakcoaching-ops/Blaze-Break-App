// Phase 3's personal grounding routines (section 8) - pure data, no
// React/Firestore. The 4 preset routines are fixed prompt sequences with
// their own closing style; a custom routine (section 9) is instead a
// named, saved shortcut to one of the 3 session depths + a lens - a
// fully bespoke prompt-by-prompt editor is out of scope for this pass
// (a reasonable, documented scope reduction, same as Phase 2's templated
// Explore-This question sets).

import { ClosingStyle } from './grounding-adaptive';

export type PresetRoutineType = 'morning' | 'evening' | 'before_difficult' | 'after_difficult';
export type RoutineType = PresetRoutineType | 'custom';

export interface PresetRoutine {
  type: PresetRoutineType;
  name: string;
  prompts: string[];
  finishPrompt?: string;
  closingStyle: ClosingStyle;
  // Only Morning/Evening genuinely translate to a distinct daily rhythm -
  // Before/After Something Difficult are triggered by an event, not a
  // time of day, so they're excluded from the reminder day-picker in the
  // UI even though the underlying field would technically support it.
  supportsDailyReminder: boolean;
}

export const PRESET_ROUTINES: Record<PresetRoutineType, PresetRoutine> = {
  morning: {
    type: 'morning',
    name: 'Morning Grounding',
    prompts: ['What matters today?', 'What is actually mine to carry?', 'What can remain unfinished?'],
    finishPrompt: 'Name one intention for today.',
    closingStyle: 'practical',
    supportsDailyReminder: true,
  },
  evening: {
    type: 'evening',
    name: 'End-of-Day Release',
    prompts: [
      'What are you still mentally carrying from today?',
      'Is anything here no longer actionable tonight?',
      'What needs to be left until tomorrow?',
    ],
    closingStyle: 'compassionate',
    supportsDailyReminder: true,
  },
  before_difficult: {
    type: 'before_difficult',
    name: 'Before Something Difficult',
    prompts: ['What can I prepare?', 'What can I not control?', 'How do I want to show up?'],
    closingStyle: 'values',
    supportsDailyReminder: false,
  },
  after_difficult: {
    type: 'after_difficult',
    name: 'After Something Difficult',
    prompts: [
      'What actually happened?',
      'What are you replaying?',
      'What can still be acted on?',
      'What now needs acceptance?',
    ],
    closingStyle: 'compassionate',
    supportsDailyReminder: false,
  },
};

export const PRESET_ROUTINE_ORDER: PresetRoutineType[] = ['morning', 'evening', 'before_difficult', 'after_difficult'];

// Section 24's decision-grounding mode - not a decision oracle, never
// makes the decision for the person. Reuses the same generic run-through
// as the preset routines (GroundingRoutineRun) rather than a bespoke
// flow. The two Islamic addendum questions are appended only when the
// session's lens is Islamic, and stop short of anything resembling a
// religious ruling.
export const DECISION_GROUNDING_PROMPTS: string[] = [
  'What decision are you facing?',
  'What facts do you know?',
  'What are you assuming?',
  'What is within your influence?',
  'What value matters most here?',
  'What are you afraid will happen?',
  'What would a responsible next step look like?',
];

export const DECISION_GROUNDING_ISLAMIC_ADDENDUM: string[] = [
  'Have you taken the reasonable means available to you?',
  'What part now requires trust rather than more mental rehearsal?',
];

// End-of-Day Release's optional Islamic closing (section 8) - shown only
// when the routine's lens is 'islamic', and only ever this exact,
// non-declarative offer - never a generated prayer, never framed as
// obligatory.
export const EVENING_ISLAMIC_CLOSING = "You have taken today's available means. Allow tonight to end.";
