import { describe, it, expect } from 'vitest';
import {
  evaluateIpVelocity,
  sanitizeIpForDocId,
  IP_VELOCITY_WARN_THRESHOLD,
  IP_VELOCITY_BLOCK_THRESHOLD,
  type SignInEvent,
} from './signin-velocity';

const eventsFor = (emails: string[]): SignInEvent[] =>
  emails.map((email, i) => ({ email, at: 1_000 + i }));

describe('evaluateIpVelocity', () => {
  it('does not warn or block for a single sign-in with no prior events on this IP', () => {
    const result = evaluateIpVelocity([], 'first@example.com');
    expect(result.distinctAccountCount).toBe(1);
    expect(result.shouldWarn).toBe(false);
    expect(result.shouldBlock).toBe(false);
  });

  it('counts distinct accounts, not raw event count - the same account signing in twice from one IP is normal', () => {
    const events = eventsFor(['same@example.com', 'same@example.com', 'same@example.com']);
    const result = evaluateIpVelocity(events, 'same@example.com');
    expect(result.distinctAccountCount).toBe(1);
    expect(result.shouldWarn).toBe(false);
  });

  it('is case-insensitive when counting distinct accounts', () => {
    const events = eventsFor(['User@Example.com']);
    const result = evaluateIpVelocity(events, 'user@example.com');
    expect(result.distinctAccountCount).toBe(1);
  });

  it(`warns once distinct accounts reach the warn threshold (${IP_VELOCITY_WARN_THRESHOLD})`, () => {
    const emails = Array.from({ length: IP_VELOCITY_WARN_THRESHOLD - 1 }, (_, i) => `user${i}@example.com`);
    const result = evaluateIpVelocity(eventsFor(emails), 'newuser@example.com');
    expect(result.distinctAccountCount).toBe(IP_VELOCITY_WARN_THRESHOLD);
    expect(result.shouldWarn).toBe(true);
    expect(result.shouldBlock).toBe(false);
  });

  it('does not warn one account short of the threshold', () => {
    const emails = Array.from({ length: IP_VELOCITY_WARN_THRESHOLD - 2 }, (_, i) => `user${i}@example.com`);
    const result = evaluateIpVelocity(eventsFor(emails), 'newuser@example.com');
    expect(result.distinctAccountCount).toBe(IP_VELOCITY_WARN_THRESHOLD - 1);
    expect(result.shouldWarn).toBe(false);
  });

  it(`blocks once distinct accounts reach the block threshold (${IP_VELOCITY_BLOCK_THRESHOLD}), well above the warn threshold`, () => {
    const emails = Array.from({ length: IP_VELOCITY_BLOCK_THRESHOLD - 1 }, (_, i) => `user${i}@example.com`);
    const result = evaluateIpVelocity(eventsFor(emails), 'newuser@example.com');
    expect(result.distinctAccountCount).toBe(IP_VELOCITY_BLOCK_THRESHOLD);
    expect(result.shouldWarn).toBe(true);
    expect(result.shouldBlock).toBe(true);
  });

  it('never blocks a shared-IP scenario below the block threshold, even while warning', () => {
    // Simulates an office/VPN exit node: several genuinely different
    // people signing in from one IP, well within "normal," should still
    // warn (for operator visibility) but never actually block anyone.
    const emails = Array.from({ length: IP_VELOCITY_BLOCK_THRESHOLD - 2 }, (_, i) => `colleague${i}@example.com`);
    const result = evaluateIpVelocity(eventsFor(emails), 'onemore@example.com');
    expect(result.shouldWarn).toBe(true);
    expect(result.shouldBlock).toBe(false);
  });
});

describe('sanitizeIpForDocId', () => {
  it('leaves a normal IPv4 address unchanged', () => {
    expect(sanitizeIpForDocId('203.0.113.42')).toBe('203.0.113.42');
  });

  it('leaves a normal IPv6 address unchanged (colons are valid in Firestore doc IDs)', () => {
    expect(sanitizeIpForDocId('2001:db8::1')).toBe('2001:db8::1');
  });

  it('replaces forward slashes, which are invalid in Firestore document IDs', () => {
    expect(sanitizeIpForDocId('203.0.113.0/24')).toBe('203.0.113.0_24');
  });
});
