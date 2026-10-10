import { describe, it, expect } from 'vitest';
import {
  isWorkDesignDebtStatus, validateCreateWorkDesignDebtInput, validateAssignOwnerInput,
  validateStatusTransition, outcomeCanResolveDebt, WORK_DESIGN_DEBT_STATUSES,
} from './work-design-debt';

describe('isWorkDesignDebtStatus', () => {
  it('accepts every named status', () => {
    for (const s of WORK_DESIGN_DEBT_STATUSES) expect(isWorkDesignDebtStatus(s)).toBe(true);
  });

  it('rejects an unknown status', () => {
    expect(isWorkDesignDebtStatus('tolerated')).toBe(false);
    expect(isWorkDesignDebtStatus(42)).toBe(false);
  });
});

describe('validateCreateWorkDesignDebtInput', () => {
  const valid = { team: 'Team A', signalKey: 'meeting_pressure', description: 'Meetings routinely run through lunch.' };

  it('accepts a well-formed input', () => {
    expect(validateCreateWorkDesignDebtInput(valid)).toEqual({ valid: true });
  });

  it('rejects a missing team', () => {
    const { team, ...rest } = valid;
    expect(validateCreateWorkDesignDebtInput(rest).valid).toBe(false);
  });

  it('rejects an empty description', () => {
    expect(validateCreateWorkDesignDebtInput({ ...valid, description: '' }).valid).toBe(false);
  });

  it('rejects a non-object input', () => {
    expect(validateCreateWorkDesignDebtInput('nope').valid).toBe(false);
    expect(validateCreateWorkDesignDebtInput(null).valid).toBe(false);
  });
});

describe('validateAssignOwnerInput', () => {
  it('accepts a non-empty ownerUid', () => {
    expect(validateAssignOwnerInput({ ownerUid: 'uid_1' })).toEqual({ valid: true });
  });

  it('rejects a missing ownerUid', () => {
    expect(validateAssignOwnerInput({}).valid).toBe(false);
    expect(validateAssignOwnerInput({ ownerUid: '' }).valid).toBe(false);
  });
});

describe('outcomeCanResolveDebt', () => {
  it('accepts useful and partly_useful', () => {
    expect(outcomeCanResolveDebt('useful')).toBe(true);
    expect(outcomeCanResolveDebt('partly_useful')).toBe(true);
  });

  it('rejects every other outcome, including no outcome at all', () => {
    expect(outcomeCanResolveDebt('no_clear_difference')).toBe(false);
    expect(outcomeCanResolveDebt('created_another_problem')).toBe(false);
    expect(outcomeCanResolveDebt('stopped_early')).toBe(false);
    expect(outcomeCanResolveDebt(null)).toBe(false);
    expect(outcomeCanResolveDebt(undefined)).toBe(false);
  });
});

describe('validateStatusTransition — mandatory owner rule', () => {
  it('allows moving to "identified" with no owner (that is the starting state)', () => {
    const result = validateStatusTransition({ status: 'identified', ownerUid: null }, { status: 'identified' }, null);
    expect(result.valid).toBe(true);
  });

  it('refuses to move past "identified" with no owner assigned', () => {
    const result = validateStatusTransition({ status: 'identified', ownerUid: null }, { status: 'owned' }, null);
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/owner/i);
  });

  it('allows moving to "owned" once an owner is assigned', () => {
    const result = validateStatusTransition({ status: 'identified', ownerUid: 'uid_1' }, { status: 'owned' }, null);
    expect(result.valid).toBe(true);
  });

  it('allows moving to "in_progress" and "monitoring" and "deferred" with an owner assigned', () => {
    for (const status of ['in_progress', 'monitoring', 'deferred']) {
      const result = validateStatusTransition({ status: 'owned', ownerUid: 'uid_1' }, { status }, null);
      expect(result.valid).toBe(true);
    }
  });
});

describe('validateStatusTransition — no coaching-tolerance resolution rule', () => {
  const owned = { status: 'owned' as const, ownerUid: 'uid_1' };

  it('refuses to resolve without a linkedInterventionId', () => {
    const result = validateStatusTransition(owned, { status: 'resolved' }, null);
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/intervention/i);
  });

  it('refuses to resolve when the linked intervention has no recorded outcome yet', () => {
    const result = validateStatusTransition(owned, { status: 'resolved', linkedInterventionId: 'i1' }, null);
    expect(result.valid).toBe(false);
  });

  it('refuses to resolve when the linked intervention outcome was "no_clear_difference"', () => {
    const result = validateStatusTransition(owned, { status: 'resolved', linkedInterventionId: 'i1' }, 'no_clear_difference');
    expect(result.valid).toBe(false);
  });

  it('refuses to resolve when the linked intervention outcome was "created_another_problem"', () => {
    const result = validateStatusTransition(owned, { status: 'resolved', linkedInterventionId: 'i1' }, 'created_another_problem');
    expect(result.valid).toBe(false);
  });

  it('allows resolving when the linked intervention outcome was "useful"', () => {
    const result = validateStatusTransition(owned, { status: 'resolved', linkedInterventionId: 'i1' }, 'useful');
    expect(result.valid).toBe(true);
  });

  it('allows resolving when the linked intervention outcome was "partly_useful"', () => {
    const result = validateStatusTransition(owned, { status: 'resolved', linkedInterventionId: 'i1' }, 'partly_useful');
    expect(result.valid).toBe(true);
  });

  it('rejects an unknown status', () => {
    const result = validateStatusTransition(owned, { status: 'tolerated' }, null);
    expect(result.valid).toBe(false);
  });
});
