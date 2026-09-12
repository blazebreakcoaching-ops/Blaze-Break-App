import { describe, it, expect } from 'vitest';
import { validateAckInput, describeFollowUp, EscalationAck } from './team-escalation';

describe('validateAckInput', () => {
  it('accepts a missing body (note is entirely optional)', () => {
    expect(validateAckInput(null)).toEqual({ valid: true });
    expect(validateAckInput(undefined)).toEqual({ valid: true });
  });

  it('accepts an empty object', () => {
    expect(validateAckInput({})).toEqual({ valid: true });
  });

  it('accepts a valid note', () => {
    expect(validateAckInput({ note: 'Held a 1:1 with the team on Friday.' })).toEqual({ valid: true });
  });

  it('accepts an explicit null note', () => {
    expect(validateAckInput({ note: null })).toEqual({ valid: true });
  });

  it('rejects a non-object, non-null/undefined body', () => {
    expect(validateAckInput('nope').valid).toBe(false);
    expect(validateAckInput(42).valid).toBe(false);
  });

  it('rejects a non-string note', () => {
    expect(validateAckInput({ note: 12345 }).valid).toBe(false);
  });

  it('rejects an overlong note', () => {
    expect(validateAckInput({ note: 'x'.repeat(501) }).valid).toBe(false);
  });

  it('accepts a note at exactly the length boundary', () => {
    expect(validateAckInput({ note: 'x'.repeat(500) }).valid).toBe(true);
  });
});

describe('describeFollowUp', () => {
  const now = new Date('2026-06-15T00:00:00.000Z');

  it('reports no_recent_acknowledgment when there are no acks at all', () => {
    const result = describeFollowUp([], now);
    expect(result.status).toBe('no_recent_acknowledgment');
    expect(result.lastAcknowledgedAt).toBeNull();
  });

  it('reports acknowledged when the most recent ack is within the window', () => {
    const acks: EscalationAck[] = [
      { team: 'A', acknowledgedBy: 'mgr_1', createdAt: '2026-06-10T00:00:00.000Z' },
    ];
    const result = describeFollowUp(acks, now, 14);
    expect(result.status).toBe('acknowledged');
    expect(result.lastAcknowledgedAt).toBe('2026-06-10T00:00:00.000Z');
    expect(result.lastAcknowledgedBy).toBe('mgr_1');
  });

  it('reports no_recent_acknowledgment when the most recent ack is outside the window', () => {
    const acks: EscalationAck[] = [
      { team: 'A', acknowledgedBy: 'mgr_1', createdAt: '2026-05-01T00:00:00.000Z' },
    ];
    const result = describeFollowUp(acks, now, 14);
    expect(result.status).toBe('no_recent_acknowledgment');
    // Still surfaces the (stale) last ack for context, just not counted as current.
    expect(result.lastAcknowledgedAt).toBe('2026-05-01T00:00:00.000Z');
  });

  it('picks the most recent ack when there are several, regardless of input order', () => {
    const acks: EscalationAck[] = [
      { team: 'A', acknowledgedBy: 'mgr_1', createdAt: '2026-06-01T00:00:00.000Z' },
      { team: 'A', acknowledgedBy: 'mgr_1', createdAt: '2026-06-12T00:00:00.000Z' },
      { team: 'A', acknowledgedBy: 'mgr_1', createdAt: '2026-06-05T00:00:00.000Z' },
    ];
    const result = describeFollowUp(acks, now, 14);
    expect(result.lastAcknowledgedAt).toBe('2026-06-12T00:00:00.000Z');
  });

  it('ignores malformed ack entries rather than crashing', () => {
    const acks = [
      { team: 'A', acknowledgedBy: 'mgr_1', createdAt: 'not-a-date' },
      { team: 'A', acknowledgedBy: 'mgr_1' } as any,
    ];
    const result = describeFollowUp(acks as EscalationAck[], now, 14);
    expect(result.status).toBe('no_recent_acknowledgment');
    expect(result.lastAcknowledgedAt).toBeNull();
  });

  it('carries the note through for the most recent ack', () => {
    const acks: EscalationAck[] = [
      { team: 'A', acknowledgedBy: 'mgr_1', createdAt: '2026-06-10T00:00:00.000Z', note: 'Held a check-in.' },
    ];
    expect(describeFollowUp(acks, now, 14).note).toBe('Held a check-in.');
  });

  it('a future-dated ack (clock skew) is not treated as within the window', () => {
    const acks: EscalationAck[] = [
      { team: 'A', acknowledgedBy: 'mgr_1', createdAt: '2026-06-20T00:00:00.000Z' }, // after "now"
    ];
    const result = describeFollowUp(acks, now, 14);
    expect(result.status).toBe('no_recent_acknowledgment');
  });

  it('uses the default 14-day window when none is specified', () => {
    const acks: EscalationAck[] = [
      { team: 'A', acknowledgedBy: 'mgr_1', createdAt: '2026-06-05T00:00:00.000Z' }, // 10 days before "now"
    ];
    expect(describeFollowUp(acks, now).status).toBe('acknowledged');
  });
});
