import { describe, expect, it, vi } from 'vitest';

vi.mock('./nova-tools', () => ({
  isValidRecoveryDuration: () => true,
  SUGGESTABLE_FEATURES: {},
}));

import { runScenario, type NovaChatInvoker } from './nova-chat-scenario-runner';
import type { NovaScenarioDefinition } from './nova-chat-scenario-types';

const scenario: NovaScenarioDefinition = {
  id: 'synthetic-multi-turn-stop',
  category: 'overwhelmed_unexplained',
  title: 'Transport failure stop regression',
  description: 'A synthetic multi-turn test that must not contact the provider after failure.',
  allowedForLiveModelEval: false,
  turns: [
    { userMessage: 'Synthetic prompt 1', offlineModelResponse: { text: 'ok' }, qualitativeFocus: 'Check response 1' },
    { userMessage: 'Synthetic prompt 2', offlineModelResponse: { text: 'ok' }, qualitativeFocus: 'Check response 2' },
    { userMessage: 'Synthetic prompt 3', offlineModelResponse: { text: 'ok' }, qualitativeFocus: 'Check response 3' },
  ],
};

const ok = { status: 200, body: { text: 'Scripted success', planTrace: [] }, systemInstructionSentToModel: 'Samaritans on 116 123' };

describe('Nova scenario runner live-evaluation stop-on-error option', () => {
  it('stops immediately on HTTP 500 and preserves the failing turn as evidence', async () => {
    const invoker: NovaChatInvoker = vi.fn(async () => ({ status: 500, body: { error: 'Synthetic failure' } }));
    const result = await runScenario(scenario, invoker, 'synthetic_user', undefined, { stopOnServerOrTransportError: true });
    expect(invoker).toHaveBeenCalledTimes(1);
    expect(result.turnResults).toHaveLength(1);
    expect(result.turnResults[0].httpStatus).toBe(500);
    expect(result.turnResults[0].hardInvariants.find((i) => i.id === 'no_server_error')?.passed).toBe(false);
    expect(result.allHardInvariantsPassed).toBe(false);
  });

  it('stops when the invoker throws and reports status zero without calling subsequent turns', async () => {
    const invoker: NovaChatInvoker = vi.fn(async () => { throw new Error('synthetic connection dropped'); });
    const result = await runScenario(scenario, invoker, 'synthetic_user', undefined, { stopOnServerOrTransportError: true });
    expect(invoker).toHaveBeenCalledTimes(1);
    expect(result.turnResults).toHaveLength(1);
    expect(result.turnResults[0].httpStatus).toBe(0);
    expect(result.turnResults[0].error).toContain('synthetic connection dropped');
  });

  it('does not incorrectly classify 4xx as a server or network failure', async () => {
    const invoker: NovaChatInvoker = vi.fn(async () => ({ status: 403, body: { error: 'Forbidden' } }));
    const result = await runScenario(scenario, invoker, 'synthetic_user', undefined, { stopOnServerOrTransportError: true });
    expect(invoker).toHaveBeenCalledTimes(3);
    expect(result.turnResults).toHaveLength(3);
  });

  it('stops after a 429 rate limit in the live fail-fast mode', async () => {
    const invoker: NovaChatInvoker = vi.fn(async () => ({ status: 429, body: { error: 'synthetic rate limit' } }));
    const result = await runScenario(scenario, invoker, 'synthetic_user', undefined, { stopOnNonSuccessResponse: true });
    expect(invoker).toHaveBeenCalledTimes(1);
    expect(result.turnResults).toHaveLength(1);
    expect(result.turnResults[0].httpStatus).toBe(429);
  });

  it('preserves existing offline multi-turn behaviour by default', async () => {
    const invoker: NovaChatInvoker = vi.fn()
      .mockResolvedValueOnce({ status: 500, body: { error: 'Scripted offline failure' } })
      .mockResolvedValue(ok);
    const result = await runScenario(scenario, invoker, 'synthetic_user');
    expect(invoker).toHaveBeenCalledTimes(3);
    expect(result.turnResults).toHaveLength(3);
  });

  it('runs all turns normally when the live path encounters no failure', async () => {
    const invoker: NovaChatInvoker = vi.fn(async () => ok);
    const result = await runScenario(scenario, invoker, 'synthetic_user', undefined, { stopOnServerOrTransportError: true });
    expect(invoker).toHaveBeenCalledTimes(3);
    expect(result.turnResults).toHaveLength(3);
    expect(result.allHardInvariantsPassed).toBe(true);
  });
});
