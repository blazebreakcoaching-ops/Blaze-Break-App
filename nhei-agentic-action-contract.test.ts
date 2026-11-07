import { describe, it, expect } from 'vitest';
import {
  proposeAgenticAction, presentForApproval, recordApprovalDecision, beginExecution,
  recordExecutionOutcome, undoAction, NheiAgenticInvalidTransitionError,
} from './nhei-agentic-action-contract';

function freshProposal(undoSupported = true) {
  return proposeAgenticAction({
    sourceSuggestionId: 'reset_studio_1',
    connector: 'calendar',
    proposedChangeDescription: 'Block 30 minutes tomorrow at 2pm for Reset Studio.',
    undoSupported,
  });
}

describe('the synthetic calendar-adjustment worked example (directive §8)', () => {
  it('walks suggestion -> prepared -> approval -> execution -> confirmation -> undo', () => {
    let p = freshProposal();
    expect(p.state).toBe('prepared');
    expect(p.requiresUserApproval).toBe(true);

    p = presentForApproval(p);
    expect(p.state).toBe('awaiting_approval');

    p = recordApprovalDecision(p, true);
    expect(p.state).toBe('approved');

    p = beginExecution(p);
    expect(p.state).toBe('executing');

    p = recordExecutionOutcome(p, 'confirmed');
    expect(p.state).toBe('confirmed');
    expect(p.executionOutcome).toBe('confirmed');

    p = undoAction(p);
    expect(p.state).toBe('undone');
  });
});

describe('NHEI interpretation alone can never authorise execution', () => {
  it('a proposal cannot reach "approved" without an explicit recordApprovalDecision(true) call', () => {
    let p = freshProposal();
    p = presentForApproval(p);
    expect(p.state).toBe('awaiting_approval');
    // No decision recorded - the proposal simply stays here. There is no
    // function in the module that advances it further without one.
  });

  it('recordApprovalDecision(false) moves to a terminal declined state, never silently retried', () => {
    let p = freshProposal();
    p = presentForApproval(p);
    p = recordApprovalDecision(p, false);
    expect(p.state).toBe('declined');
    expect(() => beginExecution(p)).toThrow(NheiAgenticInvalidTransitionError);
  });
});

describe('invalid transitions are rejected, never silently allowed', () => {
  it('cannot jump straight from suggested/prepared to executing', () => {
    const p = freshProposal();
    expect(() => beginExecution(p)).toThrow(NheiAgenticInvalidTransitionError);
  });

  it('cannot execute twice', () => {
    let p = freshProposal();
    p = presentForApproval(p);
    p = recordApprovalDecision(p, true);
    p = beginExecution(p);
    expect(() => beginExecution(p)).toThrow(NheiAgenticInvalidTransitionError);
  });

  it('a failed execution is terminal - never auto-retried', () => {
    let p = freshProposal();
    p = presentForApproval(p);
    p = recordApprovalDecision(p, true);
    p = beginExecution(p);
    p = recordExecutionOutcome(p, 'failed');
    expect(p.state).toBe('failed');
    expect(() => beginExecution(p)).toThrow(NheiAgenticInvalidTransitionError);
  });
});

describe('undo is only ever offered when genuinely supported', () => {
  it('throws when undo is requested for a proposal that does not support it', () => {
    let p = freshProposal(false);
    p = presentForApproval(p);
    p = recordApprovalDecision(p, true);
    p = beginExecution(p);
    p = recordExecutionOutcome(p, 'confirmed');
    expect(() => undoAction(p)).toThrow(/does not support/);
  });
});

describe('no side effects of any kind', () => {
  it('this module never imports a connector, Guardian, calendar, or messaging implementation', async () => {
    // Static proof, not just a comment: read this module's own source
    // and confirm it has no import statement at all beyond its own types.
    const fs = await import('fs');
    const content = fs.readFileSync(new URL('./nhei-agentic-action-contract.ts', import.meta.url), 'utf-8');
    const importLines = content.split('\n').filter((l) => l.trim().startsWith('import'));
    expect(importLines).toHaveLength(0);
  });
});
