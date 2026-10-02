import { describe, it, expect } from 'vitest';
import {
  NOTICE_ANSWER_ORDER,
  NOTICE_ANSWER_LABELS,
  INTENSITY_ORDER,
  mapIntensityToInternalScale,
  categorizeNotice,
  recommendIntervention,
  ANXIETY_BREATHING_NEED,
  WORRY_OFFLOAD_OUTCOME_ORDER,
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
  containsBannedPhrase,
  ANXIETY_RESET_SAFETY_BOUNDARY,
  ANXIETY_RESET_METHOD_DESCRIPTION,
} from './anxiety-reset-engine';

describe('anxiety-reset-engine', () => {
  it('has exactly 8 NOTICE answers, each with a label, including a valid "I don\'t know"', () => {
    expect(NOTICE_ANSWER_ORDER.length).toBe(8);
    expect(NOTICE_ANSWER_ORDER).toContain('dont_know');
    NOTICE_ANSWER_ORDER.forEach((a) => expect(NOTICE_ANSWER_LABELS[a]).toBeTruthy());
  });

  it('keeps intensity plain-language only, with intensities never exposed as a number', () => {
    expect(INTENSITY_ORDER).toEqual(['manageable', 'hard_to_focus', 'overwhelming']);
    expect(mapIntensityToInternalScale('manageable')).toBeLessThan(mapIntensityToInternalScale('overwhelming'));
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

  it('recommends grounding for the general/panic/dont_know path', () => {
    expect(recommendIntervention({ category: 'general', breathingPreviouslyUncomfortable: false, preferredIntervention: null })).toBe('grounding');
  });

  it('lets a real learned preference override the default mapping', () => {
    expect(recommendIntervention({ category: 'cognitive', breathingPreviouslyUncomfortable: false, preferredIntervention: 'grounding' })).toBe('grounding');
  });

  it('never recommends breathing from a preference once breathing was previously uncomfortable', () => {
    expect(recommendIntervention({ category: 'physical', breathingPreviouslyUncomfortable: true, preferredIntervention: 'breathing' })).toBe('grounding');
  });

  it('hands breathing off to the shared Breathing & Guided Reset system with the calm need', () => {
    expect(ANXIETY_BREATHING_NEED).toBe('calm');
  });

  it('has exactly four Worry Offload outcomes', () => {
    expect(WORRY_OFFLOAD_OUTCOME_ORDER).toEqual(['park_it', 'find_the_fact', 'find_one_next_step', 'let_it_go']);
  });

  it('keeps grounding to a short three-sense version, never forcing the full 5-4-3-2-1', () => {
    expect(GROUNDING_SENSE_ORDER).toEqual(['see', 'feel', 'hear']);
  });

  it('never instructs aggressive muscle tensing in body release prompts', () => {
    expect(BODY_RELEASE_ORDER.length).toBe(4);
    Object.values(BODY_RELEASE_PROMPTS).forEach((step) => {
      const combined = `${step.notice} ${step.release}`.toLowerCase();
      expect(combined).not.toMatch(/squeeze|tense|clench|tighten/);
    });
  });

  it('never asks whether the nervous system was "successfully regulated"', () => {
    expect(ANXIETY_CHECK_ORDER).toEqual(['steadier', 'about_same', 'more_unsettled', 'not_sure']);
    Object.values(ANXIETY_CHECK_BRANCHES).forEach((branch) => {
      expect(containsBannedPhrase(branch.novaLine)).toBe(false);
    });
  });

  it('offers a different category rather than repeating the same exercise on about_same or more_unsettled', () => {
    expect(shouldOfferDifferentCategory('about_same')).toBe(true);
    expect(shouldOfferDifferentCategory('more_unsettled')).toBe(true);
    expect(shouldOfferDifferentCategory('steadier')).toBe(false);
    expect(shouldOfferDifferentCategory('not_sure')).toBe(false);
  });

  it('never insists on completing the intervention when more unsettled', () => {
    expect(ANXIETY_CHECK_BRANCHES.more_unsettled.options).toContain('grounding');
    expect(ANXIETY_CHECK_BRANCHES.more_unsettled.options).toContain('quick_support');
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

  it('keeps the safety boundary concise and free of clinical overclaims', () => {
    expect(containsBannedPhrase(ANXIETY_RESET_SAFETY_BOUNDARY)).toBe(false);
    expect(containsBannedPhrase(ANXIETY_RESET_METHOD_DESCRIPTION)).toBe(false);
    expect(ANXIETY_RESET_SAFETY_BOUNDARY.toLowerCase()).not.toContain('treats');
  });

  it('flags every clinical-overclaim phrase the spec explicitly bans', () => {
    expect(containsBannedPhrase('Grounded in clinical anxiety-support techniques')).toBe(true);
    expect(containsBannedPhrase('All logs are encrypted, completely confidential')).toBe(true);
    expect(containsBannedPhrase('We matched tools to counter your physiological trigger')).toBe(true);
    expect(containsBannedPhrase('Vaporise Chaos & Move On')).toBe(true);
    expect(containsBannedPhrase("Let's start here.")).toBe(false);
  });
});
