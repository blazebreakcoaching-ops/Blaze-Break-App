import { describe, it, expect } from 'vitest';
import {
  NOTICE_ANSWER_ORDER,
  NOTICE_ANSWER_LABELS,
  INTENSITY_ORDER,
  INTENSITY_LABELS,
  mapIntensityToInternalScale,
  categorizeNotice,
  recommendIntervention,
  ANXIETY_BREATHING_NEED,
  WORRY_OFFLOAD_OUTCOME_ORDER,
  WORRY_OFFLOAD_OUTCOME_LABELS,
  GROUNDING_SENSE_ORDER,
  BODY_RELEASE_ORDER,
  BODY_RELEASE_PROMPTS,
  ANXIETY_CHECK_ORDER,
  ANXIETY_CHECK_BRANCHES,
  shouldOfferDifferentCategory,
  ANXIETY_HELPFUL_ASK_INTERVAL,
  shouldAskDidThatFeelUseful,
  computeMostHelpfulIntervention,
  wasBreathingPreviouslyUncomfortable,
  shouldOfferRemoveOneThing,
  shouldSuggestWorkloadRealityCheck,
  MIN_SESSIONS_FOR_WORKLOAD_SUGGESTION,
  shouldOfferDecompressionDoorway,
  containsBannedPhrase,
  ANXIETY_RESET_SAFETY_BOUNDARY,
  ANXIETY_RESET_METHOD_DESCRIPTION,
  SETTING_CONTEXT_ORDER,
  getSettingRestrictions,
  shouldShowSafetyGate,
  PHYSICAL_SAFETY_GATE_MESSAGE,
  recommendSolveRoute,
  shouldAskLaterFollowUp,
  LATER_FOLLOW_UP_ASK_INTERVAL,
  shouldOfferIndependence,
  shouldFlagRepeatedUseWithoutImprovement,
  detectRecurringDayPattern,
  MIN_SESSIONS_FOR_PATTERN_ESCALATION,
  STAY_WITH_ME_OPENING,
  STAY_WITH_ME_LINES,
  DISCREET_RESET_STEPS,
} from './anxiety-reset-engine';

describe('anxiety-reset-engine', () => {
  it('has exactly 8 NOTICE answers, each with a label, including a valid "I don\'t know"', () => {
    expect(NOTICE_ANSWER_ORDER.length).toBe(8);
    expect(NOTICE_ANSWER_ORDER).toContain('dont_know');
    NOTICE_ANSWER_ORDER.forEach((a) => expect(NOTICE_ANSWER_LABELS[a]).toBeTruthy());
  });

  it('keeps intensity plain-language only, never labelling the top as "Total Crisis"', () => {
    expect(INTENSITY_ORDER).toEqual(['manageable', 'hard_to_focus', 'overwhelming']);
    expect(mapIntensityToInternalScale('manageable')).toBeLessThan(mapIntensityToInternalScale('overwhelming'));
    expect(INTENSITY_LABELS.overwhelming.toLowerCase()).not.toContain('crisis');
  });

  it('categorises cognitive-overload NOTICE answers correctly', () => {
    expect(categorizeNotice('racing_thoughts')).toBe('cognitive');
    expect(categorizeNotice('worried_specific')).toBe('cognitive');
    expect(categorizeNotice('dreading')).toBe('cognitive');
    expect(categorizeNotice('stuck_decision')).toBe('cognitive');
    expect(categorizeNotice('cant_switch_off')).toBe('cognitive');
  });

  it('categorises body tension as physical, and panic/dont_know as general', () => {
    expect(categorizeNotice('body_tense')).toBe('physical');
    expect(categorizeNotice('panicky')).toBe('general');
    expect(categorizeNotice('dont_know')).toBe('general');
  });

  it('recommends Worry Offload for the cognitive path', () => {
    expect(recommendIntervention({ category: 'cognitive', breathingPreviouslyUncomfortable: false, preferredIntervention: null })).toBe('worry_offload');
  });

  it('recommends breathing for the physical path unless it was previously uncomfortable', () => {
    expect(recommendIntervention({ category: 'physical', breathingPreviouslyUncomfortable: false, preferredIntervention: null })).toBe('breathing');
    expect(recommendIntervention({ category: 'physical', breathingPreviouslyUncomfortable: true, preferredIntervention: null })).toBe('grounding');
  });

  it('respects a durable "don\'t suggest breathing" / "prefer grounding" preference', () => {
    expect(recommendIntervention({ category: 'physical', breathingPreviouslyUncomfortable: false, preferredIntervention: null, breathingPreference: 'dont_suggest' })).toBe('grounding');
    expect(recommendIntervention({ category: 'physical', breathingPreviouslyUncomfortable: false, preferredIntervention: null, breathingPreference: 'prefer_grounding' })).toBe('grounding');
    expect(recommendIntervention({ category: 'physical', breathingPreviouslyUncomfortable: false, preferredIntervention: null, breathingPreference: 'usually_helps' })).toBe('breathing');
  });

  it('recommends grounding for the general/panic/dont_know path', () => {
    expect(recommendIntervention({ category: 'general', breathingPreviouslyUncomfortable: false, preferredIntervention: null })).toBe('grounding');
  });

  it('lets a real learned preference override the default mapping', () => {
    expect(recommendIntervention({ category: 'cognitive', breathingPreviouslyUncomfortable: false, preferredIntervention: 'grounding' })).toBe('grounding');
  });

  it('never recommends breathing from a preference once breathing was previously uncomfortable', () => {
    expect(recommendIntervention({ category: 'physical', breathingPreviouslyUncomfortable: true, preferredIntervention: 'breathing' })).toBe('grounding');
  });

  it('overrides every other signal with Discreet Reset when the setting is discreet-only', () => {
    expect(recommendIntervention({ category: 'cognitive', breathingPreviouslyUncomfortable: false, preferredIntervention: null, settingContext: 'meeting_or_class' })).toBe('discreet_reset');
    expect(recommendIntervention({ category: 'physical', breathingPreviouslyUncomfortable: false, preferredIntervention: 'breathing', settingContext: 'around_others' })).toBe('discreet_reset');
  });

  it('flags the right setting restrictions for travelling, meetings and bed, and none for private', () => {
    expect(getSettingRestrictions('meeting_or_class')).toContain('discreet_only');
    expect(getSettingRestrictions('around_others')).toContain('discreet_only');
    expect(getSettingRestrictions('travelling')).toContain('no_eyes_closed');
    expect(getSettingRestrictions('in_bed')).toContain('no_stimulating_focus');
    expect(getSettingRestrictions('private')).toEqual([]);
    expect(getSettingRestrictions(null)).toEqual([]);
  });

  it('offers exactly 6 situational context options', () => {
    expect(SETTING_CONTEXT_ORDER.length).toBe(6);
  });

  it('hands breathing off to the shared Breathing & Guided Reset system with the calm need', () => {
    expect(ANXIETY_BREATHING_NEED).toBe('calm');
  });

  it('has exactly four Worry Offload outcomes, with "What Do I Actually Know?" replacing Fear vs Fact', () => {
    expect(WORRY_OFFLOAD_OUTCOME_ORDER).toEqual(['park_it', 'find_the_fact', 'find_one_next_step', 'let_it_go']);
    expect(WORRY_OFFLOAD_OUTCOME_LABELS.find_the_fact).toBe('What Do I Actually Know?');
  });

  it('keeps grounding to a short four-step version, never forcing the full 5-4-3-2-1', () => {
    expect(GROUNDING_SENSE_ORDER).toEqual(['see', 'support', 'sound', 'neutral_sensation']);
  });

  it('never instructs aggressive muscle tensing in body release prompts, and includes a face step', () => {
    expect(BODY_RELEASE_ORDER.length).toBe(5);
    expect(BODY_RELEASE_ORDER).toContain('face');
    Object.values(BODY_RELEASE_PROMPTS).forEach((step) => {
      const combined = `${step.notice} ${step.release}`.toLowerCase();
      expect(combined).not.toMatch(/squeeze|tense|clench|tighten/);
    });
  });

  it('includes "Still anxious, but I can continue" as a first-class checkpoint response', () => {
    expect(ANXIETY_CHECK_ORDER).toEqual(['steadier', 'still_anxious_continuing', 'about_same', 'more_unsettled', 'not_sure']);
    Object.values(ANXIETY_CHECK_BRANCHES).forEach((branch) => {
      expect(containsBannedPhrase(branch.novaLine)).toBe(false);
    });
  });

  it('never insists on completing the intervention when more unsettled, and offers Stay With Me', () => {
    expect(ANXIETY_CHECK_BRANCHES.more_unsettled.options).toContain('grounding');
    expect(ANXIETY_CHECK_BRANCHES.more_unsettled.options).toContain('quick_support');
    expect(ANXIETY_CHECK_BRANCHES.more_unsettled.options).toContain('stay_with_me');
  });

  it('offers a different category rather than repeating the same exercise on about_same or more_unsettled', () => {
    expect(shouldOfferDifferentCategory('about_same')).toBe(true);
    expect(shouldOfferDifferentCategory('more_unsettled')).toBe(true);
    expect(shouldOfferDifferentCategory('steadier')).toBe(false);
    expect(shouldOfferDifferentCategory('still_anxious_continuing')).toBe(false);
    expect(shouldOfferDifferentCategory('not_sure')).toBe(false);
  });

  it('lets "still anxious but can continue" proceed without requiring calm first', () => {
    expect(ANXIETY_CHECK_BRANCHES.still_anxious_continuing.options).toContain('deal_with_anxious_about');
    expect(ANXIETY_CHECK_BRANCHES.still_anxious_continuing.options).toContain('go_back_to_what_i_was_doing');
  });

  it('asks "did that feel useful?" only occasionally, every third session', () => {
    expect(ANXIETY_HELPFUL_ASK_INTERVAL).toBe(3);
    expect(shouldAskDidThatFeelUseful(0)).toBe(false);
    expect(shouldAskDidThatFeelUseful(1)).toBe(false);
    expect(shouldAskDidThatFeelUseful(2)).toBe(true);
  });

  it('never computes a most-helpful intervention below the minimum sample size', () => {
    expect(computeMostHelpfulIntervention([
      { intervention: 'grounding', helpful: 'yes' },
      { intervention: 'grounding', helpful: 'yes' },
    ])).toBeNull();
  });

  it('computes a real most-helpful intervention once there is enough positive signal', () => {
    const entries: { intervention: 'grounding' | 'breathing'; helpful: 'yes' | 'not_really' | 'a_little' }[] = [
      { intervention: 'grounding', helpful: 'yes' },
      { intervention: 'grounding', helpful: 'yes' },
      { intervention: 'grounding', helpful: 'yes' },
      { intervention: 'breathing', helpful: 'not_really' },
      { intervention: 'breathing', helpful: 'not_really' },
      { intervention: 'breathing', helpful: 'a_little' },
    ];
    expect(computeMostHelpfulIntervention(entries)).toBe('grounding');
  });

  it('flags a real negative breathing signal without fabricating one', () => {
    expect(wasBreathingPreviouslyUncomfortable([
      { intervention: 'grounding', checkResponse: 'more_unsettled' },
      { intervention: 'breathing', checkResponse: 'steadier' },
    ])).toBe(false);
    expect(wasBreathingPreviouslyUncomfortable([
      { intervention: 'breathing', checkResponse: 'more_unsettled' },
    ])).toBe(true);
  });

  it('offers Help Me Remove One Thing only when steadier and the load genuinely exceeds capacity', () => {
    expect(shouldOfferRemoveOneThing('steadier', true)).toBe(true);
    expect(shouldOfferRemoveOneThing('steadier', false)).toBe(false);
    expect(shouldOfferRemoveOneThing('more_unsettled', true)).toBe(false);
  });

  it('suggests Workload Reality Check only after real repeated urgency, never on a single session', () => {
    expect(shouldSuggestWorkloadRealityCheck(['racing_thoughts'])).toBe(false);
    expect(shouldSuggestWorkloadRealityCheck(['racing_thoughts', 'dreading'])).toBe(false);
    expect(shouldSuggestWorkloadRealityCheck(Array(MIN_SESSIONS_FOR_WORKLOAD_SUGGESTION).fill('racing_thoughts'))).toBe(true);
    expect(shouldSuggestWorkloadRealityCheck(['racing_thoughts', 'body_tense', 'panicky'])).toBe(false);
  });

  it('offers Decompression Doorway only after real repeated "can\'t switch off" signals', () => {
    expect(shouldOfferDecompressionDoorway(['cant_switch_off'])).toBe(false);
    expect(shouldOfferDecompressionDoorway(Array(MIN_SESSIONS_FOR_WORKLOAD_SUGGESTION).fill('cant_switch_off'))).toBe(true);
  });

  it('never confidently labels severe/unfamiliar physical symptoms as anxiety', () => {
    expect(shouldShowSafetyGate('body_tense')).toBe(true);
    expect(shouldShowSafetyGate('panicky')).toBe(true);
    expect(shouldShowSafetyGate('racing_thoughts')).toBe(false);
    expect(containsBannedPhrase(PHYSICAL_SAFETY_GATE_MESSAGE)).toBe(false);
  });

  it('routes "help me with what I\'m anxious about" to one sensible place, never all six at once', () => {
    expect(recommendSolveRoute({ category: 'cognitive', loadExceedsCapacity: false, recentUrgencyPattern: false, roleCarriedOver: false })).toBe('what_i_know');
    expect(recommendSolveRoute({ category: 'general', loadExceedsCapacity: false, recentUrgencyPattern: false, roleCarriedOver: false })).toBe('one_controllable_step');
    expect(recommendSolveRoute({ category: 'general', loadExceedsCapacity: true, recentUrgencyPattern: false, roleCarriedOver: false })).toBe('one_less_thing');
    expect(recommendSolveRoute({ category: 'general', loadExceedsCapacity: true, recentUrgencyPattern: true, roleCarriedOver: false })).toBe('workload_reality_check');
    expect(recommendSolveRoute({ category: 'general', loadExceedsCapacity: true, recentUrgencyPattern: true, roleCarriedOver: true })).toBe('decompression_doorway');
  });

  it('asks the later follow-up selectively, every fourth session, never after every reset', () => {
    expect(LATER_FOLLOW_UP_ASK_INTERVAL).toBe(4);
    expect(shouldAskLaterFollowUp(0)).toBe(false);
    expect(shouldAskLaterFollowUp(3)).toBe(true);
  });

  it('never offers independence below the minimum real successful-use count', () => {
    expect(shouldOfferIndependence([
      { intervention: 'grounding', helpful: 'yes' },
    ], 'grounding')).toBe(false);
  });

  it('offers independence once the same simple reset has genuinely helped several times', () => {
    const entries = Array(4).fill({ intervention: 'grounding' as const, helpful: 'yes' as const });
    expect(shouldOfferIndependence(entries, 'grounding')).toBe(true);
    expect(shouldOfferIndependence(entries, 'breathing')).toBe(false);
  });

  it('never flags repeated use without improvement from a handful of mixed sessions', () => {
    expect(shouldFlagRepeatedUseWithoutImprovement(['yes', 'a_little'])).toBe(false);
  });

  it('flags repeated use without improvement only with a real pattern of low benefit', () => {
    expect(shouldFlagRepeatedUseWithoutImprovement(['not_really', 'not_really', 'a_little', 'not_really'])).toBe(true);
    expect(shouldFlagRepeatedUseWithoutImprovement(['yes', 'yes', 'yes', 'yes'])).toBe(false);
  });

  it('never surfaces a day-of-week pattern below the minimum sample or without real dominance', () => {
    expect(detectRecurringDayPattern([{ dayOfWeek: 1 }, { dayOfWeek: 2 }])).toBeNull();
    expect(detectRecurringDayPattern(Array(MIN_SESSIONS_FOR_PATTERN_ESCALATION).fill({ dayOfWeek: 1 }))).toBe('Monday');
    expect(detectRecurringDayPattern([{ dayOfWeek: 1 }, { dayOfWeek: 2 }, { dayOfWeek: 3 }])).toBeNull();
  });

  it('keeps Stay With Me extremely low-demand and companion-like, never analytical', () => {
    expect(containsBannedPhrase(STAY_WITH_ME_OPENING)).toBe(false);
    STAY_WITH_ME_LINES.forEach((line) => expect(containsBannedPhrase(line)).toBe(false));
    expect(STAY_WITH_ME_LINES.length).toBeGreaterThan(0);
  });

  it('keeps Discreet Reset steps free of anything visibly demanding', () => {
    expect(DISCREET_RESET_STEPS.length).toBeGreaterThan(0);
    DISCREET_RESET_STEPS.forEach((step) => expect(containsBannedPhrase(step)).toBe(false));
  });

  it('keeps the safety boundary concise and free of clinical overclaims', () => {
    expect(containsBannedPhrase(ANXIETY_RESET_SAFETY_BOUNDARY)).toBe(false);
    expect(containsBannedPhrase(ANXIETY_RESET_METHOD_DESCRIPTION)).toBe(false);
    expect(ANXIETY_RESET_SAFETY_BOUNDARY.toLowerCase()).not.toContain('treats');
  });

  it('flags every clinical-overclaim phrase the spec explicitly bans, including the newly added ones', () => {
    expect(containsBannedPhrase('Grounded in clinical anxiety-support techniques')).toBe(true);
    expect(containsBannedPhrase('All logs are encrypted, completely confidential')).toBe(true);
    expect(containsBannedPhrase('We matched tools to counter your physiological trigger')).toBe(true);
    expect(containsBannedPhrase('Vaporise Chaos & Move On')).toBe(true);
    expect(containsBannedPhrase('Executive control restoration achieved')).toBe(true);
    expect(containsBannedPhrase('Amygdala shutdown complete')).toBe(true);
    expect(containsBannedPhrase("That's just anxiety, it won't happen")).toBe(true);
    expect(containsBannedPhrase("Let's start here.")).toBe(false);
  });
});
