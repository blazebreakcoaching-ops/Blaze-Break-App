import { describe, it, expect } from 'vitest';
import {
  identifyCandidateActions, prepareAction, presentForApproval, recordApprovalDecision,
  beginExecution, executeViaConnector, retryExecution, undoViaConnector,
} from './nova-take-the-load-engine';
import { createFakeConnectorForTesting } from './nova-take-the-load-connector-contract';
import type { NovaStatedPracticalProblem } from './nova-take-the-load-types';
import { NovaTakeTheLoadInvalidTransitionError } from './nova-take-the-load-types';

const PROBLEM: NovaStatedPracticalProblem = {
  description: 'I have three deadlines colliding this week and no room to breathe.',
  capacityBand: 'some_bandwidth',
};

describe('identifyCandidateActions', () => {
  it('returns exactly the two scoped categories, never inventing a third', () => {
    const proposals = identifyCandidateActions(PROBLEM);
    expect(proposals.map((p) => p.category).sort()).toEqual(['calendar_protection', 'task_deferral']);
  });

  it('carries the user\'s own words into the explanation, never a reinterpreted version', () => {
    const [proposal] = identifyCandidateActions(PROBLEM);
    expect(proposal.explanation).toContain(PROBLEM.description);
  });

  it('marks calendar_protection as undo-supported and task_deferral as not', () => {
    const proposals = identifyCandidateActions(PROBLEM);
    const calendar = proposals.find((p) => p.category === 'calendar_protection')!;
    const task = proposals.find((p) => p.category === 'task_deferral')!;
    expect(calendar.undoSupported).toBe(true);
    expect(task.undoSupported).toBe(false);
  });
});

describe('prepareAction - capacity/feasibility, never an invented score', () => {
  it('reports capacityFit "unknown" for a null band, never defaulting to fits or does_not_fit', () => {
    const [proposal] = identifyCandidateActions({ ...PROBLEM, capacityBand: null });
    const prepared = prepareAction(proposal, { ...PROBLEM, capacityBand: null });
    expect(prepared.feasibility?.capacityFit).toBe('unknown');
    expect(prepared.state).toBe('prepared'); // unknown is still offered, never silently withheld
  });

  it('moves to infeasible, not prepared, when the stated capacity band does not fit the category\'s effort', () => {
    const lowCapacity: NovaStatedPracticalProblem = { ...PROBLEM, capacityBand: 'low_bandwidth' };
    const [, taskDeferral] = identifyCandidateActions(lowCapacity); // task_deferral needs reflective_bandwidth
    const prepared = prepareAction(taskDeferral, lowCapacity);
    expect(prepared.feasibility?.capacityFit).toBe('does_not_fit');
    expect(prepared.state).toBe('infeasible');
  });

  it('lists real, category-specific dependencies, never an empty or invented list', () => {
    const [proposal] = identifyCandidateActions(PROBLEM);
    const prepared = prepareAction(proposal, PROBLEM);
    expect(prepared.feasibility?.dependencies.length).toBeGreaterThan(0);
  });
});

describe('approval gate - the only way out of awaiting_approval', () => {
  it('requires presentForApproval before any approval decision can be recorded', () => {
    const [proposal] = identifyCandidateActions(PROBLEM);
    const prepared = prepareAction(proposal, PROBLEM);
    expect(() => recordApprovalDecision(prepared, true)).toThrow(NovaTakeTheLoadInvalidTransitionError);
  });

  it('a decline stops the flow - no execution, no retry path, nothing further is possible', () => {
    const [proposal] = identifyCandidateActions(PROBLEM);
    const prepared = prepareAction(proposal, PROBLEM);
    const awaiting = presentForApproval(prepared);
    const declined = recordApprovalDecision(awaiting, false);
    expect(declined.state).toBe('declined');
    expect(declined.approved).toBe(false);
    expect(() => beginExecution(declined)).toThrow(NovaTakeTheLoadInvalidTransitionError);
  });

  it('an approval moves to approved only, never straight to executing', () => {
    const [proposal] = identifyCandidateActions(PROBLEM);
    const prepared = prepareAction(proposal, PROBLEM);
    const awaiting = presentForApproval(prepared);
    const approved = recordApprovalDecision(awaiting, true);
    expect(approved.state).toBe('approved');
    expect(approved.approved).toBe(true);
  });
});

describe('execution via connector - the only reachable external-write point', () => {
  async function approvedProposal() {
    const [proposal] = identifyCandidateActions(PROBLEM);
    const prepared = prepareAction(proposal, PROBLEM);
    const awaiting = presentForApproval(prepared);
    const approved = recordApprovalDecision(awaiting, true);
    return beginExecution(approved);
  }

  it('executeViaConnector refuses to run outside the executing state', async () => {
    const [proposal] = identifyCandidateActions(PROBLEM);
    await expect(executeViaConnector(proposal, createFakeConnectorForTesting())).rejects.toThrow();
  });

  it('a successful fake-connector outcome moves to confirmed', async () => {
    const executing = await approvedProposal();
    const result = await executeViaConnector(executing, createFakeConnectorForTesting());
    expect(result.state).toBe('confirmed');
    expect(result.failureReason).toBeNull();
  });

  it('a failed fake-connector outcome moves to failed, recording the reason, never auto-retried', async () => {
    const executing = await approvedProposal();
    const connector = createFakeConnectorForTesting({ executeResult: { ok: false, detail: 'simulated connector outage' } });
    const result = await executeViaConnector(executing, connector);
    expect(result.state).toBe('failed');
    expect(result.failureReason).toBe('simulated connector outage');
  });

  it('retryExecution requires an explicit call and increments retryCount', async () => {
    const executing = await approvedProposal();
    const failed = await executeViaConnector(executing, createFakeConnectorForTesting({ executeResult: { ok: false, detail: 'down' } }));
    const retried = retryExecution(failed);
    expect(retried.state).toBe('executing');
    expect(retried.retryCount).toBe(1);
    const confirmed = await executeViaConnector(retried, createFakeConnectorForTesting());
    expect(confirmed.state).toBe('confirmed');
  });

  it('undo only succeeds when undoSupported is true for the category', async () => {
    const [calendarProposal] = identifyCandidateActions(PROBLEM); // calendar_protection, undoSupported true
    const prepared = prepareAction(calendarProposal, PROBLEM);
    const awaiting = presentForApproval(prepared);
    const approved = recordApprovalDecision(awaiting, true);
    const executing = beginExecution(approved);
    const confirmed = await executeViaConnector(executing, createFakeConnectorForTesting());
    const undone = await undoViaConnector(confirmed, createFakeConnectorForTesting());
    expect(undone.state).toBe('undone');
  });

  it('undo throws for a category whose undoSupported flag is false', async () => {
    const reflectiveProblem: NovaStatedPracticalProblem = { ...PROBLEM, capacityBand: 'reflective_bandwidth' };
    const [, taskProposal] = identifyCandidateActions(reflectiveProblem); // task_deferral, undoSupported false
    const prepared = prepareAction(taskProposal, reflectiveProblem);
    const awaiting = presentForApproval(prepared);
    const approved = recordApprovalDecision(awaiting, true);
    const executing = beginExecution(approved);
    const confirmed = await executeViaConnector(executing, createFakeConnectorForTesting());
    await expect(undoViaConnector(confirmed, createFakeConnectorForTesting())).rejects.toThrow(/not supported/);
  });
});

describe('zero dependency on NHEI', () => {
  it('this engine file has no import of anything under the nhei- prefix', async () => {
    const fs = await import('node:fs');
    const content = fs.readFileSync(new URL('./nova-take-the-load-engine.ts', import.meta.url), 'utf8');
    expect(content).not.toMatch(/from\s+['"].*nhei-/);
  });

  it('the shared types file also has no NHEI import', async () => {
    const fs = await import('node:fs');
    const content = fs.readFileSync(new URL('./nova-take-the-load-types.ts', import.meta.url), 'utf8');
    expect(content).not.toMatch(/from\s+['"].*nhei-/);
  });
});
