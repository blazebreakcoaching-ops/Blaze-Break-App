import { describe, it, expect } from 'vitest';
import {
  BOUNDARY_PROFILE_ORDER, BOUNDARY_PROFILE_LABELS,
  BOUNDARY_ACTION_ORDER, BOUNDARY_ACTION_LABELS, BOUNDARY_ACTION_KIND,
  DEFAULT_PROFILE_ACTIONS, shouldOfferDoorwayCrossing, DOORWAY_CROSSING_LINE,
  URGENT_OR_LOUD_QUESTIONS, URGENCY_CLASSIFICATION_ORDER, URGENCY_CLASSIFICATION_LABELS,
  URGENCY_CLASSIFICATION_GUIDANCE, URGENT_OR_LOUD_SUMMARY_QUESTION,
} from './digital-boundary-shield-engine';

describe('Boundary Profiles: seven spec profiles, all actions configurable', () => {
  it('has exactly the seven spec profiles', () => {
    expect(BOUNDARY_PROFILE_ORDER).toHaveLength(7);
    expect(Object.keys(BOUNDARY_PROFILE_LABELS)).toHaveLength(7);
  });
  it('has all seven spec actions, each with an honest capability kind', () => {
    expect(BOUNDARY_ACTION_ORDER).toHaveLength(7);
    for (const a of BOUNDARY_ACTION_ORDER) {
      expect(['self_checklist', 'routes_to_real_tool']).toContain(BOUNDARY_ACTION_KIND[a]);
    }
  });
  it('every profile has a default action list, custom starts empty', () => {
    for (const p of BOUNDARY_PROFILE_ORDER) {
      expect(DEFAULT_PROFILE_ACTIONS[p]).toBeDefined();
    }
    expect(DEFAULT_PROFILE_ACTIONS.custom).toEqual([]);
  });
  it('never claims a self_checklist action is a completed system action in its label', () => {
    for (const a of BOUNDARY_ACTION_ORDER) {
      if (BOUNDARY_ACTION_KIND[a] === 'self_checklist') {
        expect(BOUNDARY_ACTION_LABELS[a].toLowerCase()).not.toMatch(/muted|silenced|blocked/);
      }
    }
  });
});

describe('Decompression Doorway crossing: only after Workday Ending, only when chosen', () => {
  it('offers crossing for Workday Ending with start_doorway included', () => {
    expect(shouldOfferDoorwayCrossing('workday_ending', ['start_doorway', 'close_laptop'])).toBe(true);
  });
  it('never offers crossing for other profiles, or when the action was removed', () => {
    expect(shouldOfferDoorwayCrossing('focus_block', ['start_doorway'])).toBe(false);
    expect(shouldOfferDoorwayCrossing('workday_ending', ['close_laptop'])).toBe(false);
  });
  it('uses the exact spec line', () => {
    expect(DOORWAY_CROSSING_LINE).toBe('Work is closed. Want help leaving it there?');
  });
});

describe('"Urgent or Loud?": guided questions, never a one-line pronouncement', () => {
  it('has all five spec questions', () => {
    expect(URGENT_OR_LOUD_QUESTIONS).toHaveLength(5);
    expect(URGENT_OR_LOUD_QUESTIONS.map((q) => q.text)).toEqual([
      'What happens if this waits?', 'Is there a real deadline?', 'Who says it needs action now?',
      'What is the consequence of waiting?', 'What is the smallest response required?',
    ]);
  });
  it('has all five spec classifications, each with guidance, user always able to override', () => {
    expect(URGENCY_CLASSIFICATION_ORDER).toHaveLength(5);
    expect(Object.keys(URGENCY_CLASSIFICATION_LABELS)).toHaveLength(5);
    for (const c of URGENCY_CLASSIFICATION_ORDER) {
      expect(URGENCY_CLASSIFICATION_GUIDANCE[c].length).toBeGreaterThan(0);
    }
  });
  it('never diagnoses the other person or uses alarm language in guidance', () => {
    for (const c of URGENCY_CLASSIFICATION_ORDER) {
      expect(URGENCY_CLASSIFICATION_GUIDANCE[c].toLowerCase()).not.toMatch(/manipulat|toxic|emergency|crisis/);
    }
  });
  it('uses the exact spec summary question', () => {
    expect(URGENT_OR_LOUD_SUMMARY_QUESTION).toBe('So, what is this?');
  });
});
