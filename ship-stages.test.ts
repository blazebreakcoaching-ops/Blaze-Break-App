import { describe, it, expect } from 'vitest';
import { SHIP_STAGE_ORDER, SHIP_QUEST_IDS_BY_STAGE, findInProgressShipStage } from './ship-stages';

// Pins the exact quest ids/order this file duplicates from
// src/components/ShipJourney.tsx's SHIP_STAGES (see this file's own header
// comment for why it's a duplicate rather than a shared import) - a
// tripwire so a quest id change over there doesn't silently drift from
// what the resume-prompt route in server.ts reasons from.
describe('SHIP_QUEST_IDS_BY_STAGE', () => {
  it('matches the exact stage order and quest ids ShipJourney.tsx defines', () => {
    expect(SHIP_STAGE_ORDER).toEqual(['Safety', 'Habits', 'Identity', 'Purpose']);
    expect(SHIP_QUEST_IDS_BY_STAGE).toEqual({
      Safety: ['ship_safety_boundary_script', 'ship_safety_blame_reset', 'ship_safety_digital_blackout'],
      Habits: ['ship_habits_sleep_debt', 'ship_habits_movement_snack', 'ship_habits_checkin_streak'],
      Identity: ['ship_identity_reflect_action', 'ship_identity_fingerprint_recheck', 'ship_identity_resentment_log'],
      Purpose: ['ship_purpose_reality_check', 'ship_purpose_weekly_goal', 'ship_purpose_support_circle'],
    });
  });
});

describe('findInProgressShipStage', () => {
  it('returns null when nothing has ever been committed - never nags someone who has not started', () => {
    expect(findInProgressShipStage([])).toBeNull();
  });

  it('finds a partially-committed later stage even when an earlier stage is entirely untouched', () => {
    expect(findInProgressShipStage(['ship_habits_sleep_debt'])).toBe('Habits');
  });

  it('returns the first stage (in order) that has some but not all quests committed', () => {
    expect(findInProgressShipStage(['ship_safety_boundary_script'])).toBe('Safety');
  });

  it('skips a fully-completed earlier stage and finds the next genuinely in-progress one', () => {
    const committed = [
      'ship_safety_boundary_script', 'ship_safety_blame_reset', 'ship_safety_digital_blackout', // Safety: all 3 done
      'ship_habits_sleep_debt', // Habits: 1 of 3 done
    ];
    expect(findInProgressShipStage(committed)).toBe('Habits');
  });

  it('returns null once every stage is either fully complete or entirely untouched (nothing genuinely in progress)', () => {
    const allSafetyDone = ['ship_safety_boundary_script', 'ship_safety_blame_reset', 'ship_safety_digital_blackout'];
    expect(findInProgressShipStage(allSafetyDone)).toBeNull();
  });

  it('returns null once every single quest across every stage is committed - the whole journey is complete', () => {
    const everyQuest = Object.values(SHIP_QUEST_IDS_BY_STAGE).flat();
    expect(findInProgressShipStage(everyQuest)).toBeNull();
  });

  it('ignores unrelated committed action ids from other parts of the app', () => {
    expect(findInProgressShipStage(['some_other_recovery_plan_action', 'ship_purpose_reality_check'])).toBe('Purpose');
  });
});
