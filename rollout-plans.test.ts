import { describe, it, expect } from 'vitest';
import { canTransitionRolloutStatus, validateRolloutPlanCreate, ROLLOUT_PLAN_STATUSES } from './rollout-plans';

describe('canTransitionRolloutStatus', () => {
  it('allows the real documented transitions', () => {
    expect(canTransitionRolloutStatus('planned', 'active')).toBe(true);
    expect(canTransitionRolloutStatus('planned', 'rolled_back')).toBe(true);
    expect(canTransitionRolloutStatus('active', 'paused')).toBe(true);
    expect(canTransitionRolloutStatus('active', 'completed')).toBe(true);
    expect(canTransitionRolloutStatus('active', 'rolled_back')).toBe(true);
    expect(canTransitionRolloutStatus('paused', 'active')).toBe(true);
    expect(canTransitionRolloutStatus('paused', 'rolled_back')).toBe(true);
  });

  it('rejects transitions out of terminal states', () => {
    for (const terminal of ['completed', 'rolled_back'] as const) {
      for (const to of ROLLOUT_PLAN_STATUSES) {
        expect(canTransitionRolloutStatus(terminal, to)).toBe(false);
      }
    }
  });

  it('rejects skipping planned straight to completed', () => {
    expect(canTransitionRolloutStatus('planned', 'completed')).toBe(false);
  });

  it('rejects paused straight to completed (must resume to active first)', () => {
    expect(canTransitionRolloutStatus('paused', 'completed')).toBe(false);
  });
});

describe('validateRolloutPlanCreate', () => {
  const validInput = () => ({
    targetFeatureId: 'energy_budget',
    targetPercentage: 25,
    stopConditions: 'Pause if error rate exceeds 1% or support tickets spike.',
    rationale: 'Staging out gradually to catch regressions early.',
  });

  it('accepts a valid plan', () => {
    expect(validateRolloutPlanCreate(validInput())).toEqual({ valid: true });
  });
  it('rejects a missing targetFeatureId', () => {
    expect(validateRolloutPlanCreate({ ...validInput(), targetFeatureId: '' }).valid).toBe(false);
  });
  it('rejects an out-of-range percentage', () => {
    expect(validateRolloutPlanCreate({ ...validInput(), targetPercentage: -1 }).valid).toBe(false);
    expect(validateRolloutPlanCreate({ ...validInput(), targetPercentage: 101 }).valid).toBe(false);
  });
  it('rejects a non-number percentage', () => {
    expect(validateRolloutPlanCreate({ ...validInput(), targetPercentage: '25' }).valid).toBe(false);
  });
  it('rejects empty stopConditions or rationale', () => {
    expect(validateRolloutPlanCreate({ ...validInput(), stopConditions: '  ' }).valid).toBe(false);
    expect(validateRolloutPlanCreate({ ...validInput(), rationale: '' }).valid).toBe(false);
  });
  it('rejects a non-object input', () => {
    expect(validateRolloutPlanCreate(null).valid).toBe(false);
  });
});
