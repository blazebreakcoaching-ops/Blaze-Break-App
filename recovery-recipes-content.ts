// Recovery Recipes' structured content layer (Recovery Recipes upgrade,
// Batch 1 - Foundation). Recovery Recipes is an orchestration layer, not a
// new tool: every situation here assembles a short sequence from Blaze
// Break's existing tools (Movement Snacks, Faith & Values Grounding, Nova,
// practical/release/connection steps authored here) rather than reimplementing
// any of them. This file is pure data - no Firestore, no React, no AI - so
// the deterministic engine built on top of it (recovery-recipes-engine.ts)
// can run with zero cost and zero network dependency, matching Movement
// Snacks' and Grounding's existing "works without AI" convention (section 29).

import { MovementContext } from './movement-snacks-content';
import { GroundingLens } from './grounding-content';

// ---------- Situations ----------

export type SituationKey =
  | 'slept_badly'
  | 'hard_meeting'
  | 'guilty_resting'
  | 'angry'
  | 'numb'
  | 'cannot_focus'
  | 'need_switch_off'
  | 'over_capacity'
  | 'everything_urgent'
  | 'cant_stop_thinking'
  | 'taken_on_too_much'
  | 'waiting_uncontrollable'
  | 'difficult_conversation'
  | 'setback'
  | 'feel_behind'
  | 'just_need_reset';

export const SITUATION_LABELS: Record<SituationKey, string> = {
  slept_badly: 'I slept badly',
  hard_meeting: 'I had a hard meeting',
  guilty_resting: 'I feel guilty resting',
  angry: 'I am angry',
  numb: 'I feel numb',
  cannot_focus: 'I cannot focus',
  need_switch_off: 'I need to switch off',
  over_capacity: 'I am over capacity',
  everything_urgent: 'Everything feels urgent',
  cant_stop_thinking: 'I cannot stop thinking about work',
  taken_on_too_much: 'I have taken on too much',
  waiting_uncontrollable: 'I am waiting for something I cannot control',
  difficult_conversation: 'I need to have a difficult conversation',
  setback: 'I have had a setback',
  feel_behind: 'I feel behind',
  just_need_reset: 'I just need a reset',
};

// The original 8 situations (kept from the previous static version) shown
// first, then the 8 new ones added by this upgrade (section 2) - "Something
// else" is a UI-only entry point handled by the engine's fallback, not a
// template of its own (see recovery-recipes-engine.ts).
export const PRIMARY_SITUATION_ORDER: SituationKey[] = [
  'slept_badly', 'hard_meeting', 'guilty_resting', 'angry', 'numb', 'cannot_focus', 'need_switch_off', 'over_capacity',
];

export const ADDITIONAL_SITUATION_ORDER: SituationKey[] = [
  'everything_urgent', 'cant_stop_thinking', 'taken_on_too_much', 'waiting_uncontrollable',
  'difficult_conversation', 'setback', 'feel_behind', 'just_need_reset',
];

export const SITUATION_ORDER: SituationKey[] = [...PRIMARY_SITUATION_ORDER, ...ADDITIONAL_SITUATION_ORDER];

// ---------- Capacity (section 3) ----------

export type Capacity = 'almost_nothing' | 'a_little' | 'some_space' | 'can_go_deeper';

export const CAPACITY_LABELS: Record<Capacity, string> = {
  almost_nothing: 'Almost nothing',
  a_little: 'A little',
  some_space: 'I have some space',
  can_go_deeper: 'I can go deeper',
};

export const CAPACITY_ORDER: Capacity[] = ['almost_nothing', 'a_little', 'some_space', 'can_go_deeper'];

// ---------- Duration categories (section 8) ----------

export type DurationCategory = 'quick' | 'short' | 'standard' | 'deep';

export const DURATION_CATEGORY_LABELS: Record<DurationCategory, string> = {
  quick: 'Quick reset',
  short: 'Short recipe',
  standard: 'Standard recipe',
  deep: 'Deep recipe',
};

// Upper bound (minutes) of each category, used to classify an assembled
// recipe's total estimated duration - see categoriseDuration() below.
export const DURATION_CATEGORY_MAX_MINUTES: Record<DurationCategory, number> = {
  quick: 3,
  short: 7,
  standard: 12,
  deep: 20,
};

export const DURATION_CATEGORY_ORDER: DurationCategory[] = ['quick', 'short', 'standard', 'deep'];

// ---------- Step types (section 5) ----------

export type RecipeStepType =
  | 'movement' | 'nova_reflection' | 'grounding' | 'practical_action' | 'release' | 'connection' | 'rest';

export interface RecipeStepChoice {
  id: string;
  label: string;
}

export interface RecipeStep {
  id: string;
  type: RecipeStepType;
  title: string;
  instruction: string;
  estimatedSeconds: number;
  // Section 10/34: never trap the person in a step - every step but a
  // handful of safety-relevant ones can be skipped.
  skippable: boolean;
  // 'movement' - launches this Movement Snack by id (deep-linked, section
  // 14); movementContext is the deterministic fallback used if that
  // specific movement is unavailable/recently overused (resolved via
  // getMovementRecommendation, never a random pick).
  movementId?: string;
  movementContext?: MovementContext;
  // 'nova_reflection' - one or two short, curated questions. Deterministic
  // by default; Nova (Batch 7) may rephrase but never invents new ones
  // that bypass this allowlisted content.
  reflectionQuestions?: string[];
  // 'grounding' - a short excerpt shown inline, never the full 5-stage
  // Grounding flow (section 13). Lens-neutral default plus optional
  // lens-specific variants, respecting the person's preferred lens.
  groundingExcerpt?: string;
  groundingExcerptByLens?: Partial<Record<GroundingLens, string>>;
  // 'practical_action' | 'release' | 'connection' - a small structured
  // choice, never free-form unless the step itself has no choices (in
  // which case it's a single instruction with nothing to select).
  choices?: RecipeStepChoice[];
}

// ---------- Recipe templates (section 27) ----------

export interface RecipeTemplate {
  id: string;
  situationKey: SituationKey;
  title: string;
  summary: string;
  // Plain-language "why this sequence" shown on the recipe preview.
  reason: string;
  defaultDurationCategory: DurationCategory;
  supportedCapacities: Capacity[];
  // The minimum useful recipe (section 6) - always included, capped at 1-2
  // steps so 'almost_nothing' never receives more than that.
  coreSteps: RecipeStep[];
  // Added once capacity is 'some_space' or 'can_go_deeper'.
  expandedSteps: RecipeStep[];
  // Added only at 'can_go_deeper' - "a brief reflective component"
  // (section 3). Omitted entirely for situations the brief explicitly
  // warns against over-processing (guilty_resting, angry, over_capacity).
  deepStep?: RecipeStep;
  // The final "stop here" line - shown on the preview and the completion
  // screen, not rendered as its own player step.
  closingAction: string;
  // Falls back to this situation's template if this one can't be built
  // (e.g. a required movement is unavailable) - omitted on just_need_reset
  // itself, which is the fallback of last resort.
  fallbackTemplateId?: SituationKey;
  tags: string[];
  // Only set when a step in this template is a 'grounding' step.
  supportedLenses?: GroundingLens[];
  safetyFlags?: string[];
  safetyNote?: string;
  active: boolean;
}

export const RECIPE_TEMPLATES: Record<SituationKey, RecipeTemplate> = {
  slept_badly: {
    id: 'slept_badly',
    situationKey: 'slept_badly',
    title: "After a Bad Night's Sleep",
    summary: 'Protect your capacity and simplify the day, rather than trying to power through.',
    reason: "A rough night changes what's realistic today - this isn't about fixing the sleep, just working with what you've got.",
    defaultDurationCategory: 'short',
    supportedCapacities: CAPACITY_ORDER,
    coreSteps: [
      {
        id: 'daylight_or_reset', type: 'movement', title: 'Get a change of light or state',
        instruction: 'A short walk in daylight if you can get it, or a quick physical reset if not.',
        estimatedSeconds: 180, skippable: true, movementId: 'sunlight_walk', movementContext: 'need_air_daylight',
      },
      {
        id: 'what_needs_doing', type: 'practical_action', title: 'What actually needs doing today?',
        instruction: "Sort today's list into what genuinely must happen and what can wait.",
        estimatedSeconds: 45, skippable: true,
        choices: [{ id: 'must', label: 'Must happen' }, { id: 'can_wait', label: 'Can wait' }],
      },
    ],
    expandedSteps: [
      {
        id: 'lower_the_bar', type: 'release', title: 'Lower the bar on purpose',
        instruction: "Choose one thing you'll deliberately do at a lower standard today.",
        estimatedSeconds: 30, skippable: true,
      },
    ],
    deepStep: {
      id: 'low_capacity_reflection', type: 'nova_reflection', title: 'A brief reflection', instruction: '',
      estimatedSeconds: 40, skippable: true,
      reflectionQuestions: ['What would a lower-energy day, well spent, actually look like today?'],
    },
    closingAction: 'Today does not need to look like a high-energy day.',
    fallbackTemplateId: 'just_need_reset',
    tags: ['sleep', 'capacity', 'daylight'],
    active: true,
  },
  hard_meeting: {
    id: 'hard_meeting',
    situationKey: 'hard_meeting',
    title: 'After a Hard Meeting',
    summary: "Let your body register that it's over, then decide what - if anything - still needs you.",
    reason: 'Meetings like that leave a physical charge behind. Moving it through beats replaying it.',
    defaultDurationCategory: 'quick',
    supportedCapacities: CAPACITY_ORDER,
    coreSteps: [
      {
        id: 'shake_it_off', type: 'movement', title: 'Shake Off the Meeting',
        instruction: "A short physical reset to help your body register that the interaction has ended.",
        estimatedSeconds: 60, skippable: true, movementId: 'shake_meeting', movementContext: 'meeting_lingering',
      },
      {
        id: 'action_needed', type: 'practical_action', title: 'Does anything genuinely need action?',
        instruction: "Be honest - not everything from a hard meeting needs a follow-up.",
        estimatedSeconds: 30, skippable: true,
        choices: [{ id: 'yes', label: 'Yes, capture it' }, { id: 'no', label: 'No, let it go' }],
      },
    ],
    expandedSteps: [
      {
        id: 'release_replay', type: 'release', title: 'Leave the rest there',
        instruction: "What doesn't need action doesn't need more of your attention either.",
        estimatedSeconds: 20, skippable: true,
      },
    ],
    deepStep: {
      id: 'boundary_reflection', type: 'nova_reflection', title: 'A brief reflection', instruction: '',
      estimatedSeconds: 30, skippable: true,
      reflectionQuestions: ['Is there a boundary worth naming before your next meeting like that?'],
    },
    closingAction: 'The meeting has ended. You do not need to keep having it internally.',
    fallbackTemplateId: 'just_need_reset',
    tags: ['meeting', 'rumination'],
    active: true,
  },
  guilty_resting: {
    id: 'guilty_resting',
    situationKey: 'guilty_resting',
    title: 'When Rest Feels Like It Needs Justifying',
    summary: 'A brief look at the belief underneath the guilt - not a deep dive.',
    reason: 'Guilt about resting usually comes from a belief worth naming, not from actual wrongdoing.',
    defaultDurationCategory: 'short',
    supportedCapacities: CAPACITY_ORDER,
    coreSteps: [
      {
        id: 'belief_check', type: 'nova_reflection', title: 'A quick belief check', instruction: '',
        estimatedSeconds: 30, skippable: true,
        reflectionQuestions: ['What do you believe resting says about you?'],
      },
      {
        id: 'reframe', type: 'release', title: 'A reframe',
        instruction: 'Would you expect this pace from someone you care about?',
        estimatedSeconds: 25, skippable: true,
      },
    ],
    expandedSteps: [
      {
        id: 'values_grounding', type: 'grounding', title: 'A short grounding line', instruction: '',
        estimatedSeconds: 30, skippable: true,
        groundingExcerpt: 'Rest is not something you have to earn through exhaustion. It is part of how the work gets done well, not a reward for finishing it.',
        groundingExcerptByLens: {
          islamic: 'Rest is not the absence of faith in your effort - Allah does not burden a soul beyond what it can bear (Qur’an 2:286). Caring for yourself is part of caring for the trust you carry.',
          faith: 'You are allowed to rest without earning it first. Care for yourself is not separate from your values - it protects them.',
        },
      },
    ],
    // Deliberately no deepStep - the brief is explicit: "Do not over-reflect."
    closingAction: 'Rest does not need to be earned by exhaustion.',
    fallbackTemplateId: 'just_need_reset',
    tags: ['rest', 'guilt', 'values'],
    supportedLenses: ['secular', 'values', 'faith', 'islamic'],
    active: true,
  },
  angry: {
    id: 'angry',
    situationKey: 'angry',
    title: "When You're Angry",
    summary: "Create space before you act or respond, not a plan to suppress it.",
    reason: "Anger is real information. It just doesn't need to be acted on at peak intensity.",
    defaultDurationCategory: 'short',
    supportedCapacities: CAPACITY_ORDER,
    coreSteps: [
      {
        id: 'physical_reset', type: 'movement', title: 'A physical reset',
        instruction: 'Let some of the physical charge move through before you decide anything.',
        estimatedSeconds: 60, skippable: true, movementId: 'whole_body_shake', movementContext: 'restless_stuck',
      },
      {
        id: 'act_or_wait', type: 'practical_action', title: 'Do you need to act now, or just not act yet?',
        instruction: "Most of the time, it's the second one.",
        estimatedSeconds: 30, skippable: true,
        choices: [{ id: 'act_now', label: 'This needs action now' }, { id: 'not_yet', label: 'It can wait' }],
      },
    ],
    expandedSteps: [
      {
        id: 'note_for_later', type: 'practical_action', title: 'What needs saying, later',
        instruction: "Optional - jot down what still needs saying, once you're not at peak intensity.",
        estimatedSeconds: 40, skippable: true,
      },
    ],
    // No deepStep - the brief is explicit: "Do not diagnose anger."
    closingAction: 'You do not have to resolve this at peak intensity.',
    fallbackTemplateId: 'just_need_reset',
    tags: ['anger', 'boundary'],
    active: true,
  },
  numb: {
    id: 'numb',
    situationKey: 'numb',
    title: 'When You Feel Numb',
    summary: 'A gentle reconnection with the here and now - nothing that demands insight.',
    reason: "Numbness is your system protecting you from overload. This isn't about forcing feeling back.",
    defaultDurationCategory: 'quick',
    supportedCapacities: CAPACITY_ORDER,
    coreSteps: [
      {
        id: 'gentle_change', type: 'movement', title: 'A small change of state',
        instruction: 'Nothing demanding - just a small shift in what your body and surroundings are doing.',
        estimatedSeconds: 60, skippable: true, movementId: 'fresh_air_reset', movementContext: 'need_air_daylight',
      },
      {
        id: 'what_would_help', type: 'connection', title: 'What would help right now?',
        instruction: "There's no wrong answer here.",
        estimatedSeconds: 20, skippable: true,
        choices: [{ id: 'company', label: 'Company' }, { id: 'quiet', label: 'Quiet' }, { id: 'practical', label: 'Something practical' }],
      },
    ],
    expandedSteps: [
      {
        id: 'reach_out', type: 'connection', title: 'If it would help',
        instruction: 'Talk to Nova, or reach out to someone you trust. No pressure either way.',
        estimatedSeconds: 20, skippable: true,
      },
    ],
    // No deepStep at all - the brief is explicit: "Do not force introspection.
    // Do not pathologise." Numbness never gets a probing reflection step.
    closingAction: "There's nothing you need to figure out right now.",
    fallbackTemplateId: 'just_need_reset',
    tags: ['numbness', 'gentle'],
    safetyFlags: ['gentle_only', 'no_forced_introspection', 'preserve_safety_escalation'],
    safetyNote: 'This recipe is kept deliberately gentle and never asks you to explain or justify how you feel.',
    active: true,
  },
  cannot_focus: {
    id: 'cannot_focus',
    situationKey: 'cannot_focus',
    title: "When You Can't Focus",
    summary: "Find out what's actually in the way, then shrink the task down to one thing.",
    reason: "Focus problems are usually fatigue, overload, or a task that's too vague - not a discipline failure.",
    defaultDurationCategory: 'short',
    supportedCapacities: CAPACITY_ORDER,
    coreSteps: [
      {
        id: 'short_reset', type: 'movement', title: 'A short reset',
        instruction: 'A minute or two to reset before trying to focus again.',
        estimatedSeconds: 90, skippable: true, movementId: 'desk_stretch', movementContext: 'sitting_too_long',
      },
      {
        id: 'one_thing', type: 'practical_action', title: 'What is the one thing that matters next?',
        instruction: 'Not the whole list - just the next useful thing.',
        estimatedSeconds: 30, skippable: true,
      },
    ],
    expandedSteps: [
      {
        id: 'remove_secondary', type: 'practical_action', title: 'Remove the rest, for now',
        instruction: 'Close the tabs, silence the notifications, park everything except that one thing.',
        estimatedSeconds: 30, skippable: true,
      },
    ],
    deepStep: {
      id: 'why_hard', type: 'nova_reflection', title: 'A brief check', instruction: '',
      estimatedSeconds: 30, skippable: true,
      reflectionQuestions: ["Is this actually about the task, or about how much you're carrying today?"],
    },
    closingAction: 'You do not need to focus on everything. Just the next useful thing.',
    fallbackTemplateId: 'just_need_reset',
    tags: ['focus', 'overload'],
    active: true,
  },
  need_switch_off: {
    id: 'need_switch_off',
    situationKey: 'need_switch_off',
    title: 'Switching Off',
    summary: "Close what's open, then let After-Work Decompression handle the rest.",
    reason: 'Switching off works better as a physical transition than a mental decision.',
    defaultDurationCategory: 'standard',
    supportedCapacities: CAPACITY_ORDER,
    coreSteps: [
      {
        id: 'capture_unfinished', type: 'practical_action', title: 'Capture anything genuinely unfinished',
        instruction: "One note, so it's out of your head and somewhere safe until tomorrow.",
        estimatedSeconds: 40, skippable: true,
      },
      {
        id: 'after_work_flow', type: 'movement', title: 'After-Work Decompression',
        instruction: 'The full physical boundary ritual between work and the rest of your day.',
        estimatedSeconds: 300, skippable: true, movementId: 'after_work', movementContext: 'switch_off_work',
      },
    ],
    expandedSteps: [],
    deepStep: undefined,
    closingAction: 'Work is over. You do not need to keep carrying it.',
    fallbackTemplateId: 'just_need_reset',
    tags: ['switch_off', 'boundary', 'evening'],
    active: true,
  },
  over_capacity: {
    id: 'over_capacity',
    situationKey: 'over_capacity',
    title: "When You're Over Capacity",
    summary: 'Reduce the load immediately - no extra reflection, no self-improvement tasks.',
    reason: "When you're over capacity, the answer is less, not more insight.",
    defaultDurationCategory: 'quick',
    supportedCapacities: CAPACITY_ORDER,
    coreSteps: [
      {
        id: 'what_can_go', type: 'practical_action', title: 'What can be postponed, delegated, dropped or left unfinished?',
        instruction: 'Pick one. Just one.',
        estimatedSeconds: 45, skippable: true,
        choices: [
          { id: 'postpone', label: 'Postpone it' }, { id: 'delegate', label: 'Delegate it' },
          { id: 'drop', label: 'Drop it' }, { id: 'leave_unfinished', label: 'Leave it unfinished' },
        ],
      },
      {
        id: 'sixty_second_reset', type: 'movement', title: 'A 60-second reset', instruction: '',
        estimatedSeconds: 60, skippable: true, movementId: 'posture_reset', movementContext: 'sitting_too_long',
      },
    ],
    expandedSteps: [
      {
        id: 'stabilise', type: 'release', title: 'One stabilising action',
        instruction: 'Whatever would make the next hour feel 10% more manageable.',
        estimatedSeconds: 30, skippable: true,
      },
    ],
    // No deepStep - the brief is explicit: "Do not generate extra
    // self-improvement tasks."
    closingAction: 'One thing is enough for now.',
    fallbackTemplateId: 'just_need_reset',
    tags: ['capacity', 'overload'],
    active: true,
  },
  everything_urgent: {
    id: 'everything_urgent',
    situationKey: 'everything_urgent',
    title: 'When Everything Feels Urgent',
    summary: "Separate what's actually urgent from what just feels loud.",
    reason: "Urgency and importance aren't the same thing - untangling them usually brings the pile down to size.",
    defaultDurationCategory: 'short',
    supportedCapacities: CAPACITY_ORDER,
    coreSteps: [
      {
        id: 'list_pressures', type: 'practical_action', title: 'List up to three things pressing on you',
        instruction: "Just the top three - not the whole list.",
        estimatedSeconds: 45, skippable: true,
      },
      {
        id: 'classify', type: 'practical_action', title: 'Classify each one', instruction: '',
        estimatedSeconds: 40, skippable: true,
        choices: [{ id: 'now', label: 'Now' }, { id: 'later', label: 'Later' }, { id: 'not_mine', label: 'Not mine' }],
      },
    ],
    expandedSteps: [
      {
        id: 'choose_next', type: 'practical_action', title: 'Choose one next step',
        instruction: 'Just the next one - not the whole plan.',
        estimatedSeconds: 30, skippable: true,
      },
    ],
    closingAction: "Not everything that feels loud is actually urgent.",
    fallbackTemplateId: 'just_need_reset',
    tags: ['urgency', 'triage'],
    active: true,
  },
  cant_stop_thinking: {
    id: 'cant_stop_thinking',
    situationKey: 'cant_stop_thinking',
    title: "When Work Won't Leave Your Head",
    summary: 'Get it out of your head and onto paper, then give your body something else to do.',
    reason: 'More thinking rarely produces more control - a clear stopping point usually does.',
    defaultDurationCategory: 'short',
    supportedCapacities: CAPACITY_ORDER,
    coreSteps: [
      {
        id: 'brain_dump', type: 'practical_action', title: 'Quick brain-dump',
        instruction: 'Write down whatever keeps circling, without editing it.',
        estimatedSeconds: 60, skippable: true,
      },
      {
        id: 'mark_status', type: 'practical_action', title: 'Mark it', instruction: '',
        estimatedSeconds: 20, skippable: true,
        choices: [{ id: 'needs_action_tomorrow', label: 'Needs action tomorrow' }, { id: 'nothing_tonight', label: 'Nothing to do tonight' }],
      },
    ],
    expandedSteps: [
      {
        id: 'short_movement', type: 'movement', title: 'A short Movement Snack', instruction: '',
        estimatedSeconds: 90, skippable: true, movementId: 'desk_stretch', movementContext: 'restless_stuck',
      },
    ],
    closingAction: 'More thinking tonight may not create more control.',
    fallbackTemplateId: 'just_need_reset',
    tags: ['rumination', 'evening'],
    active: true,
  },
  taken_on_too_much: {
    id: 'taken_on_too_much',
    situationKey: 'taken_on_too_much',
    title: "When You've Taken On Too Much",
    summary: 'See the full list, then decide what actually stays.',
    reason: "Overcommitment is usually invisible until it's written down in one place.",
    defaultDurationCategory: 'standard',
    supportedCapacities: CAPACITY_ORDER,
    coreSteps: [
      {
        id: 'list_commitments', type: 'practical_action', title: "List what you're currently carrying",
        instruction: 'Everything, even the small things.',
        estimatedSeconds: 60, skippable: true,
      },
      {
        id: 'sort_commitments', type: 'practical_action', title: 'Sort each one', instruction: '',
        estimatedSeconds: 45, skippable: true,
        choices: [
          { id: 'keep', label: 'Keep' }, { id: 'postpone', label: 'Postpone' },
          { id: 'delegate', label: 'Delegate' }, { id: 'remove', label: 'Remove' },
        ],
      },
    ],
    expandedSteps: [
      {
        id: 'values_check', type: 'release', title: 'A values check',
        instruction: 'Does this list reflect what actually matters to you, or just what’s loudest?',
        estimatedSeconds: 30, skippable: true,
      },
    ],
    deepStep: {
      id: 'one_message', type: 'practical_action', title: 'One communication action',
      instruction: 'If something needs to be said to someone else, choose one message to send.',
      estimatedSeconds: 40, skippable: true,
    },
    closingAction: "Not everything you're carrying has to stay yours.",
    fallbackTemplateId: 'just_need_reset',
    tags: ['overcommitment', 'boundary'],
    active: true,
  },
  waiting_uncontrollable: {
    id: 'waiting_uncontrollable',
    situationKey: 'waiting_uncontrollable',
    title: "Waiting For Something You Can't Control",
    summary: "Separate what you can still prepare from what's simply out of your hands.",
    reason: "Waiting isn't the same as failing to act - most of the anxiety comes from checking, not from the waiting itself.",
    defaultDurationCategory: 'short',
    supportedCapacities: CAPACITY_ORDER,
    coreSteps: [
      {
        id: 'grounding_excerpt', type: 'grounding', title: 'A short grounding moment', instruction: '',
        estimatedSeconds: 30, skippable: true,
        groundingExcerpt: 'Not everything is yours to control. What you can do is prepare well and let the outcome be what it is.',
        groundingExcerptByLens: {
          islamic: 'Tie your camel, then place your trust in Allah (a saying attributed to the Prophet ▷). Do what is genuinely yours to do, then release the rest to Him.',
          faith: 'Some things are held, not solved. You are allowed to do your part and then let go of the rest.',
        },
      },
      {
        id: 'anything_actionable', type: 'practical_action', title: 'Is there anything genuinely actionable right now?',
        instruction: '', estimatedSeconds: 25, skippable: true,
        choices: [{ id: 'yes', label: 'Yes, something small' }, { id: 'no', label: 'No, nothing right now' }],
      },
    ],
    expandedSteps: [
      {
        id: 'optional_movement', type: 'movement', title: 'An optional Movement Snack',
        instruction: 'If checking has kept you sitting and still, a short reset can help.',
        estimatedSeconds: 90, skippable: true, movementId: 'walk_3min', movementContext: 'restless_stuck',
      },
    ],
    closingAction: 'Waiting is not the same as failing to act.',
    fallbackTemplateId: 'just_need_reset',
    tags: ['waiting', 'control', 'rumination'],
    supportedLenses: ['secular', 'values', 'faith', 'islamic'],
    active: true,
  },
  difficult_conversation: {
    id: 'difficult_conversation',
    situationKey: 'difficult_conversation',
    title: 'Preparing for a Difficult Conversation',
    summary: 'Get clear, not rehearsed. A calm opening line beats a script.',
    reason: 'Over-rehearsing a hard conversation usually makes it feel bigger, not easier.',
    defaultDurationCategory: 'short',
    supportedCapacities: CAPACITY_ORDER,
    coreSteps: [
      {
        id: 'what_to_say', type: 'nova_reflection', title: 'Get clear', instruction: '',
        estimatedSeconds: 35, skippable: true, reflectionQuestions: ['What needs to be said clearly?'],
      },
      {
        id: 'outcome', type: 'nova_reflection', title: "Check the outcome you're chasing", instruction: '',
        estimatedSeconds: 35, skippable: true, reflectionQuestions: ['What outcome are you trying to control here?'],
      },
    ],
    expandedSteps: [
      {
        id: 'values_lens', type: 'release', title: 'A values lens',
        instruction: 'What would saying this in line with your own values actually sound like?',
        estimatedSeconds: 30, skippable: true,
      },
    ],
    // No deepStep - the brief is explicit: don't turn this into lengthy
    // script generation unless the person chooses Nova themselves.
    closingAction: 'Choose one calm opening sentence, and start there.',
    fallbackTemplateId: 'just_need_reset',
    tags: ['conversation', 'preparation'],
    active: true,
  },
  setback: {
    id: 'setback',
    situationKey: 'setback',
    title: 'After a Setback',
    summary: 'Separate what actually happened from what it means about everything else.',
    reason: 'One setback rarely changes as much as it feels like it does in the moment.',
    defaultDurationCategory: 'short',
    supportedCapacities: CAPACITY_ORDER,
    coreSteps: [
      {
        id: 'fact_vs_interpretation', type: 'nova_reflection', title: 'Fact vs interpretation', instruction: '',
        estimatedSeconds: 35, skippable: true, reflectionQuestions: ['What actually happened - just the facts?'],
      },
      {
        id: 'what_changes', type: 'nova_reflection', title: "What this does and doesn't change", instruction: '',
        estimatedSeconds: 35, skippable: true, reflectionQuestions: ['What does this change - and what does it not change?'],
      },
    ],
    expandedSteps: [
      {
        id: 'next_action_or_rest', type: 'practical_action', title: 'Choose what comes next', instruction: '',
        estimatedSeconds: 25, skippable: true,
        choices: [{ id: 'next_action', label: 'One next action' }, { id: 'rest', label: 'Rest instead' }],
      },
    ],
    deepStep: {
      id: 'optional_grounding', type: 'grounding', title: 'An optional grounding moment', instruction: '',
      estimatedSeconds: 30, skippable: true,
      groundingExcerpt: 'A setback is information, not a verdict on your worth or your trajectory.',
      groundingExcerptByLens: {
        islamic: 'Trials are part of the path, not a sign you have been abandoned on it. Ease often follows hardship (Qur’an 94:5-6).',
      },
    },
    closingAction: 'One setback is not the whole story.',
    fallbackTemplateId: 'just_need_reset',
    tags: ['setback', 'perspective'],
    supportedLenses: ['secular', 'values', 'faith', 'islamic'],
    active: true,
  },
  feel_behind: {
    id: 'feel_behind',
    situationKey: 'feel_behind',
    title: 'When You Feel Behind',
    summary: "Check what you're actually being measured against.",
    reason: "'Behind' is almost always a comparison, not a fact - and it's worth knowing which one you're reacting to.",
    defaultDurationCategory: 'short',
    supportedCapacities: CAPACITY_ORDER,
    coreSteps: [
      {
        id: 'behind_compared_to', type: 'nova_reflection', title: 'Behind, compared with what?', instruction: '',
        estimatedSeconds: 30, skippable: true, reflectionQuestions: ['Behind compared with what, exactly?'],
      },
      {
        id: 'identify_source', type: 'practical_action', title: 'Identify the source', instruction: '',
        estimatedSeconds: 30, skippable: true,
        choices: [
          { id: 'real_deadline', label: 'A real deadline' }, { id: 'self_expectation', label: 'A self-imposed expectation' },
          { id: 'comparison', label: 'A comparison with someone else' },
        ],
      },
    ],
    expandedSteps: [
      {
        id: 'one_responsible_step', type: 'practical_action', title: 'Choose one responsible next step', instruction: '',
        estimatedSeconds: 25, skippable: true,
      },
    ],
    closingAction: "Release the rest of the comparison. It isn't the job.",
    fallbackTemplateId: 'just_need_reset',
    tags: ['comparison', 'perspective'],
    active: true,
  },
  just_need_reset: {
    id: 'just_need_reset',
    situationKey: 'just_need_reset',
    title: 'A Simple Reset',
    summary: 'Low-friction, no setup - just a short reset and one clear next step.',
    reason: "Sometimes there's no bigger story here. A short reset is genuinely enough.",
    defaultDurationCategory: 'quick',
    supportedCapacities: CAPACITY_ORDER,
    coreSteps: [
      {
        id: 'sixty_second', type: 'movement', title: 'A 60-second Movement Snack', instruction: '',
        estimatedSeconds: 60, skippable: true, movementId: 'posture_reset', movementContext: 'quick',
      },
      {
        id: 'whats_next', type: 'practical_action', title: 'What matters next?', instruction: '',
        estimatedSeconds: 20, skippable: true,
      },
    ],
    expandedSteps: [],
    // This template is itself the universal fallback - no fallbackTemplateId.
    closingAction: "That's a reset. You're free to carry on.",
    tags: ['reset', 'general'],
    active: true,
  },
};

export const RECIPE_TEMPLATE_ORDER: SituationKey[] = SITUATION_ORDER;

// ---------- Duration estimation (section 8) ----------

export const categoriseDuration = (minutes: number): DurationCategory => {
  for (const cat of DURATION_CATEGORY_ORDER) {
    if (minutes <= DURATION_CATEGORY_MAX_MINUTES[cat]) return cat;
  }
  return 'deep';
};

export const estimateDurationMinutes = (steps: RecipeStep[]): number => {
  const totalSeconds = steps.reduce((sum, s) => sum + s.estimatedSeconds, 0);
  return Math.max(1, Math.round(totalSeconds / 60));
};

// ---------- Feedback (section 16) ----------

export type RecipeFeedback = 'yes' | 'some' | 'not_really';

export const RECIPE_FEEDBACK_OPTIONS: { id: RecipeFeedback; label: string }[] = [
  { id: 'yes', label: 'Yes, this was what I needed' },
  { id: 'some', label: 'Some of it helped' },
  { id: 'not_really', label: 'Not really' },
];

// "Which part helped most" - deliberately its own small enum rather than
// reusing RecipeStepType, since section 16 names "Nova" and "stopping" as
// distinct answers from the step-type taxonomy (Nova's handoff, and simply
// ending the recipe, aren't step types in their own right).
export type HelpfulPartId = 'movement' | 'reflection' | 'simplifying_tasks' | 'release' | 'nova' | 'grounding' | 'stopping';

export const HELPFUL_PART_OPTIONS: { id: HelpfulPartId; label: string }[] = [
  { id: 'movement', label: 'Movement' },
  { id: 'reflection', label: 'Reflection' },
  { id: 'simplifying_tasks', label: 'Simplifying tasks' },
  { id: 'release', label: 'Release' },
  { id: 'nova', label: 'Nova' },
  { id: 'grounding', label: 'Grounding' },
  { id: 'stopping', label: 'Stopping' },
];
