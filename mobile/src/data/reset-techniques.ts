// Content banks ported verbatim from
// ../../../src/components/NervousSystemReset.tsx:21-47 - names,
// descriptions, and instruction copy are content, not UI, so they copy
// 1:1. The elaborate Web Audio soundscape/pacer-sound engine and canvas
// visualizer that surround these on web are deliberately NOT ported -
// nice-to-have polish, not load-bearing (see the mobile plan).
export type BreathingModeKey = 'box' | '478' | 'coherent' | 'sigh' | 'extended' | 'rectangle' | 'calm';
export type GroundingModeKey = '60sec' | '5things' | 'scan' | 'feet' | 'sound' | 'room' | 'timer';

export interface BreathingMode {
  key: BreathingModeKey;
  name: string;
  description: string;
  instruction: string;
}

export interface GroundingMode {
  key: GroundingModeKey;
  name: string;
  description: string;
  instructions: string[];
}

export const BREATHING_MODES: BreathingMode[] = [
  { key: 'box', name: 'Box Breathing', description: 'Steady focus. Balances the nervous system.', instruction: 'Inhale 4s • Hold 4s • Exhale 4s • Hold 4s' },
  { key: '478', name: '4-7-8 Breathing', description: 'Evening wind-down. Prepares body for sleep.', instruction: 'Inhale 4s • Hold 7s • Exhale 8s' },
  { key: 'coherent', name: 'Coherent Breathing', description: 'Calm rhythm. Aligns heart rate and breathing.', instruction: 'Inhale 5s • Exhale 5s' },
  { key: 'sigh', name: 'Physiological Sigh', description: 'Quick reset. Offloads carbon dioxide immediately.', instruction: 'Double Inhale • Long Exhale' },
  { key: 'extended', name: 'Extended Exhale', description: 'Downshifting stress. Triggers parasympathetic response.', instruction: 'Inhale 4s • Exhale 6s' },
  { key: 'rectangle', name: 'Rectangle Breathing', description: 'Visual breathing tool for grounding.', instruction: 'Inhale short side • Exhale long side' },
  { key: 'calm', name: 'Calm Count', description: 'Simple beginner version. Gentle regulation.', instruction: 'Inhale 1-2-3 • Exhale 1-2-3' },
];

export const GROUNDING_MODES: GroundingMode[] = [
  { key: '60sec', name: '60-Second Grounding', description: 'Fast recalibration of your surroundings.', instructions: ['Look around', 'Name 1 thing you see', 'Name 1 thing you hear', 'Name 1 thing you feel', 'Take 1 deep breath'] },
  { key: '5things', name: 'Name 5 Things', description: 'Classic grounding when mentally overloaded.', instructions: ['Name 5 things you can see', 'Name 4 things you can feel', 'Name 3 things you can hear', 'Name 2 things you can smell', 'Name 1 thing you can taste'] },
  { key: 'scan', name: 'Body Scan', description: 'Progressive awareness of physical tension.', instructions: ['Notice your toes', 'Move attention up to your calves', 'Notice your thighs and hips', 'Feel your stomach and chest', 'Release your shoulders and jaw'] },
  { key: 'feet', name: 'Feet-on-Floor', description: 'Tethering technique for panicky feelings.', instructions: ['Place both feet flat on the ground', 'Press down gently through your heels', 'Notice the solid floor beneath you', 'Imagine roots growing from your feet', 'Breathe steadily'] },
  { key: 'sound', name: 'Sound-Based Grounding', description: 'Auditory focus to stop racing thoughts.', instructions: ['Close your eyes', 'Listen for the loudest sound', 'Listen for the quietest sound', 'Listen for a sound inside the room', 'Listen for a sound outside the room'] },
  { key: 'room', name: 'Come Back to the Room', description: 'Spatial awareness recovery.', instructions: ['Find a corner of the room', 'Trace the lines of the ceiling', 'Notice the colours of the walls', 'Count the windows', 'Acknowledge you are safe here'] },
  { key: 'timer', name: 'Calm Visual Timer', description: 'A soothing focus anchor.', instructions: ['Watch the shape expand and contract', 'Let your thoughts drift past', 'Keep your eyes on the centre point', 'Allow 2 minutes to pass', 'Return to your task'] },
];
