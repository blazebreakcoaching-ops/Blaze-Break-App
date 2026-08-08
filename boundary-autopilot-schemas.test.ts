import { describe, it, expect } from 'vitest';
import { SendMessageSchema, SetDndSchema, SetStatusSchema } from './boundary-autopilot-schemas';

// Boundary Autopilot takes real, consequential, hard-to-undo actions (sending
// a real Slack message, declining a real meeting) on the user's behalf. The
// one thing standing between "draft" and "actually happened" is confirm:
// z.literal(true) on every schema. These tests exist specifically to catch a
// regression in that gate — the highest-consequence failure mode in the app.

describe('SendMessageSchema: confirmation gating', () => {
  const validBase = { recipientId: 'U123', message: 'Hello there' };

  it('rejects a request with confirm omitted entirely', () => {
    const result = SendMessageSchema.safeParse(validBase);
    expect(result.success).toBe(false);
  });

  it('rejects a request with confirm: false', () => {
    const result = SendMessageSchema.safeParse({ ...validBase, confirm: false });
    expect(result.success).toBe(false);
  });

  it('rejects a request with confirm as a truthy non-boolean (e.g. "true" string)', () => {
    const result = SendMessageSchema.safeParse({ ...validBase, confirm: 'true' });
    expect(result.success).toBe(false);
  });

  it('accepts a request with confirm: true and all required fields', () => {
    const result = SendMessageSchema.safeParse({ ...validBase, confirm: true });
    expect(result.success).toBe(true);
  });

  it('rejects a request with confirm: true but a missing recipientId', () => {
    const result = SendMessageSchema.safeParse({ message: 'Hello', confirm: true });
    expect(result.success).toBe(false);
  });

  it('rejects a request with confirm: true but an empty message', () => {
    const result = SendMessageSchema.safeParse({ recipientId: 'U123', message: '', confirm: true });
    expect(result.success).toBe(false);
  });

  it('rejects unknown extra fields (schema is .strict())', () => {
    const result = SendMessageSchema.safeParse({ ...validBase, confirm: true, extraField: 'sneaky' });
    expect(result.success).toBe(false);
  });
});

describe('SetDndSchema: confirmation gating', () => {
  it('rejects a request with confirm omitted', () => {
    const result = SetDndSchema.safeParse({ minutes: 60 });
    expect(result.success).toBe(false);
  });

  it('rejects a request with confirm: false', () => {
    const result = SetDndSchema.safeParse({ minutes: 60, confirm: false });
    expect(result.success).toBe(false);
  });

  it('accepts a request with confirm: true and a valid duration', () => {
    const result = SetDndSchema.safeParse({ minutes: 60, confirm: true });
    expect(result.success).toBe(true);
  });

  it('rejects an out-of-range duration even with confirm: true', () => {
    expect(SetDndSchema.safeParse({ minutes: 0, confirm: true }).success).toBe(false);
    expect(SetDndSchema.safeParse({ minutes: 10000, confirm: true }).success).toBe(false);
  });
});

describe('SetStatusSchema: confirmation gating', () => {
  it('rejects a request with confirm omitted', () => {
    const result = SetStatusSchema.safeParse({ statusText: 'In deep work' });
    expect(result.success).toBe(false);
  });

  it('rejects a request with confirm: false', () => {
    const result = SetStatusSchema.safeParse({ statusText: 'In deep work', confirm: false });
    expect(result.success).toBe(false);
  });

  it('accepts a request with confirm: true and valid status text', () => {
    const result = SetStatusSchema.safeParse({ statusText: 'In deep work', confirm: true });
    expect(result.success).toBe(true);
  });

  it('rejects status text over the 100-character limit even with confirm: true', () => {
    const result = SetStatusSchema.safeParse({ statusText: 'x'.repeat(101), confirm: true });
    expect(result.success).toBe(false);
  });
});
