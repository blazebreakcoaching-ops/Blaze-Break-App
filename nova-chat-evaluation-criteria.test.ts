import { describe, expect, it, vi } from 'vitest';

// Keep the test isolated from tool execution and provider infrastructure.
vi.mock('./nova-tools', () => ({
  isValidRecoveryDuration: () => true,
  SUGGESTABLE_FEATURES: {},
}));

import { evaluateHardInvariants } from './nova-chat-evaluation-criteria';

const safetyPrompt = 'Synthetic system prompt with Samaritans on 116 123.';
const ctx = {
  systemInstructionSentToModel: safetyPrompt,
  memoryConsentGranted: false,
  additionalInvariants: [],
  seededMemoryContents: [],
};

function checks(httpStatus: number, error: string | null, systemPrompt: string | null = safetyPrompt) {
  return evaluateHardInvariants({
    turnIndex: 0,
    userMessage: 'Synthetic user text',
    responseText: httpStatus === 200 ? 'Synthetic response text' : null,
    httpStatus,
    planTrace: [],
    error,
  }, { ...ctx, systemInstructionSentToModel: systemPrompt });
}

function invariant(result: ReturnType<typeof checks>, id: string) {
  const found = result.find((r) => r.id === id);
  expect(found).toBeDefined();
  return found!;
}

describe('Nova hard-invariant evidence integrity', () => {
  it('passes a normal response with no server error', () => {
    expect(invariant(checks(200, null), 'no_server_error').passed).toBe(true);
  });

  it('does not mistake a recorded 500 error for a passing server response', () => {
    const r = invariant(checks(500, 'Non-200 status: 500'), 'no_server_error');
    expect(r.passed).toBe(false);
    expect(r.detail).toContain('Server or transport failure');
  });

  it('fails closed on a 504 gateway failure even when the runner captured error text', () => {
    expect(invariant(checks(504, 'Gateway timeout'), 'no_server_error').passed).toBe(false);
  });

  it('fails closed on a status 0 request exception', () => {
    expect(invariant(checks(0, 'Request aborted'), 'no_server_error').passed).toBe(false);
  });

  it('keeps a 4xx client refusal separate from a 5xx server/transport failure, without calling it a success', () => {
    const r = checks(403, 'Forbidden');
    expect(invariant(r, 'no_server_error').passed).toBe(true);
    expect(invariant(r, 'http_success').passed).toBe(false);
  });

  it('rejects rate-limited and transport-failed turns as unsuccessful even without a server 5xx', () => {
    expect(invariant(checks(429, 'Rate limited'), 'http_success').passed).toBe(false);
    expect(invariant(checks(0, 'Connection lost'), 'http_success').passed).toBe(false);
  });

  it('accepts an actual HTTP 200 success', () => {
    expect(invariant(checks(200, null), 'http_success').passed).toBe(true);
  });

  it('does not claim the model omitted or received safety instructions when the live path cannot inspect them', () => {
    const r = invariant(checks(200, null, null), 'safety_floor_present');
    expect(r.passed).toBe(false);
    expect(r.detail).toContain('NOT VERIFIED');
    expect(r.detail).not.toContain('missing');
  });

  it('verifies the safety floor only when the provider-call configuration is observable', () => {
    expect(invariant(checks(200, null, safetyPrompt), 'safety_floor_present').passed).toBe(true);
    expect(invariant(checks(200, null, 'Synthetic prompt without safety instructions'), 'safety_floor_present').passed).toBe(false);
  });
});
