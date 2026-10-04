import { describe, it, expect } from 'vitest';
import {
  effectiveConsentStatus,
  canRespondToConsent,
  computeInviteExpiresAt,
  isInviteExpired,
} from './recovery-ally-consent';

describe('effectiveConsentStatus', () => {
  it('passes through pending and declined as-is', () => {
    expect(effectiveConsentStatus('pending')).toBe('pending');
    expect(effectiveConsentStatus('declined')).toBe('declined');
  });

  it('treats missing/legacy/garbage values as accepted - never as pending', () => {
    expect(effectiveConsentStatus(undefined)).toBe('accepted');
    expect(effectiveConsentStatus(null)).toBe('accepted');
    expect(effectiveConsentStatus('accepted')).toBe('accepted');
    expect(effectiveConsentStatus('something-else')).toBe('accepted');
  });
});

describe('canRespondToConsent', () => {
  it('only allows responding while genuinely pending', () => {
    expect(canRespondToConsent('pending')).toBe(true);
  });

  it('blocks responding once already accepted or declined, and for legacy relationships', () => {
    expect(canRespondToConsent('accepted')).toBe(false);
    expect(canRespondToConsent('declined')).toBe(false);
    expect(canRespondToConsent(undefined)).toBe(false);
  });
});

describe('computeInviteExpiresAt', () => {
  it('expires exactly 14 days after the invite was created', () => {
    const now = '2026-01-01T00:00:00.000Z';
    const expected = new Date('2026-01-15T00:00:00.000Z').getTime();
    expect(new Date(computeInviteExpiresAt(now)).getTime()).toBe(expected);
  });
});

describe('isInviteExpired', () => {
  it('is never expired while already accepted or declined, regardless of the date', () => {
    const longAgo = '2000-01-01T00:00:00.000Z';
    const now = '2026-01-01T00:00:00.000Z';
    expect(isInviteExpired(longAgo, 'accepted', now)).toBe(false);
    expect(isInviteExpired(longAgo, 'declined', now)).toBe(false);
  });

  it('is never expired when there is no expiry date at all', () => {
    expect(isInviteExpired(null, 'pending', '2026-01-01T00:00:00.000Z')).toBe(false);
    expect(isInviteExpired(undefined, 'pending', '2026-01-01T00:00:00.000Z')).toBe(false);
  });

  it('is expired once the window has passed while still pending', () => {
    const expiresAt = '2026-01-15T00:00:00.000Z';
    expect(isInviteExpired(expiresAt, 'pending', '2026-01-14T00:00:00.000Z')).toBe(false);
    expect(isInviteExpired(expiresAt, 'pending', '2026-01-16T00:00:00.000Z')).toBe(true);
  });
});
