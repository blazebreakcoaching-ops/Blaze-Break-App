import { describe, it, expect } from 'vitest';
import { isRealGuardian, isValidGuardianPhone, buildGuardianCallRequestMessage, extractFirstName, checkCooldown, nudgeSchedulerIsEnabled } from './guardian-alert';

describe('isRealGuardian: the entire consent gate for Tier 1 - must be exact, since this decides who a message can go to', () => {
  it('accepts a contact explicitly flagged isGuardian', () => {
    expect(isRealGuardian({ isGuardian: true })).toBe(true);
  });

  it('accepts a contact with the primary_guardian role even if isGuardian is not set', () => {
    expect(isRealGuardian({ role: 'primary_guardian' })).toBe(true);
  });

  it('accepts a contact with the backup_guardian role', () => {
    expect(isRealGuardian({ role: 'backup_guardian' })).toBe(true);
  });

  it('rejects a peer or coach - being in the support circle is not the same as being a guardian', () => {
    expect(isRealGuardian({ role: 'peer' })).toBe(false);
    expect(isRealGuardian({ role: 'coach' })).toBe(false);
  });

  it('rejects a contact with isGuardian explicitly false, even with no role set', () => {
    expect(isRealGuardian({ isGuardian: false })).toBe(false);
  });

  it('rejects undefined and null rather than throwing - a missing contact is never a guardian', () => {
    expect(isRealGuardian(undefined)).toBe(false);
    expect(isRealGuardian(null)).toBe(false);
  });

  it('rejects an empty object', () => {
    expect(isRealGuardian({})).toBe(false);
  });

  it('rejects a contact with role "manager" even if isGuardian is (incorrectly, or via a crafted write) set true - the product explicitly bans org managers from Guardian alerts, and that must hold regardless of how the contact record was constructed, not just what the UI dropdown allows', () => {
    expect(isRealGuardian({ role: 'manager', isGuardian: true })).toBe(false);
  });

  it('rejects a contact with role "peer" even if isGuardian is set true, for the same reason', () => {
    expect(isRealGuardian({ role: 'peer', isGuardian: true })).toBe(false);
  });
});

describe('nudgeSchedulerIsEnabled: kill switch for the Tier-3 scheduled-messaging feature, must default OFF', () => {
  it('defaults to disabled when the env var is unset', () => {
    expect(nudgeSchedulerIsEnabled(undefined)).toBe(false);
  });

  it('defaults to disabled for an empty string', () => {
    expect(nudgeSchedulerIsEnabled('')).toBe(false);
  });

  it('stays disabled for anything other than the exact string "true"', () => {
    expect(nudgeSchedulerIsEnabled('1')).toBe(false);
    expect(nudgeSchedulerIsEnabled('yes')).toBe(false);
    expect(nudgeSchedulerIsEnabled('True')).toBe(false);
  });

  it('is enabled only when explicitly set to "true"', () => {
    expect(nudgeSchedulerIsEnabled('true')).toBe(true);
  });
});

describe('isValidGuardianPhone: must match the same pattern already used server-side for the real Twilio send', () => {
  it('accepts a real E.164 UK number', () => {
    expect(isValidGuardianPhone('+447700900123')).toBe(true);
  });

  it('rejects a number missing the country code', () => {
    expect(isValidGuardianPhone('07700900123')).toBe(false);
  });

  it('rejects a number with letters', () => {
    expect(isValidGuardianPhone('+44770090abcd')).toBe(false);
  });

  it('rejects empty, undefined, and null', () => {
    expect(isValidGuardianPhone('')).toBe(false);
    expect(isValidGuardianPhone(undefined)).toBe(false);
    expect(isValidGuardianPhone(null)).toBe(false);
  });
});

describe('buildGuardianCallRequestMessage: the exact spec §B.1 template - wording matters here, not just structure', () => {
  it('includes the sender\'s name, an explicit call request, and the app disclosure', () => {
    const msg = buildGuardianCallRequestMessage('Tourae');
    expect(msg).toContain('Tourae');
    expect(msg).toContain('call them');
    expect(msg).toContain('Blaze Break');
  });

  it('falls back to a generic sender description rather than an empty or undefined name', () => {
    expect(buildGuardianCallRequestMessage('')).toContain('A Blaze Break user');
  });

  it('trims whitespace-only input the same way as empty input', () => {
    expect(buildGuardianCallRequestMessage('   ')).toContain('A Blaze Break user');
  });
});

describe('extractFirstName: used to personalise the message without ever needing a user-supplied override', () => {
  it('takes the first word of a full name', () => {
    expect(extractFirstName('Tourae Martin')).toBe('Tourae');
  });

  it('handles a single-word name', () => {
    expect(extractFirstName('Tourae')).toBe('Tourae');
  });

  it('collapses multiple spaces rather than returning an empty first token', () => {
    expect(extractFirstName('  Tourae   Martin')).toBe('Tourae');
  });

  it('falls back honestly for empty, whitespace-only, undefined, and null input', () => {
    expect(extractFirstName('')).toBe('A Blaze Break user');
    expect(extractFirstName('   ')).toBe('A Blaze Break user');
    expect(extractFirstName(undefined)).toBe('A Blaze Break user');
    expect(extractFirstName(null)).toBe('A Blaze Break user');
  });
});

describe('checkCooldown: pure arithmetic, deterministic given an explicit "now" - no hidden clock', () => {
  it('is never on cooldown when nothing has been sent before', () => {
    const result = checkCooldown(null, Date.now(), 10 * 60 * 1000);
    expect(result.onCooldown).toBe(false);
    expect(result.msRemaining).toBe(0);
  });

  it('is on cooldown immediately after a send', () => {
    const now = 1_000_000;
    const result = checkCooldown(now, now, 10 * 60 * 1000);
    expect(result.onCooldown).toBe(true);
    expect(result.msRemaining).toBe(10 * 60 * 1000);
  });

  it('is on cooldown partway through the window, with the correct remaining time', () => {
    const now = 1_000_000;
    const lastSent = now - 4 * 60 * 1000; // 4 minutes ago
    const result = checkCooldown(lastSent, now, 10 * 60 * 1000);
    expect(result.onCooldown).toBe(true);
    expect(result.msRemaining).toBe(6 * 60 * 1000);
  });

  it('is exactly not on cooldown the instant the window elapses - boundary is inclusive of the full window', () => {
    const now = 1_000_000;
    const lastSent = now - 10 * 60 * 1000;
    const result = checkCooldown(lastSent, now, 10 * 60 * 1000);
    expect(result.onCooldown).toBe(false);
  });

  it('is not on cooldown well after the window has passed', () => {
    const now = 1_000_000;
    const lastSent = now - 60 * 60 * 1000; // an hour ago
    const result = checkCooldown(lastSent, now, 10 * 60 * 1000);
    expect(result.onCooldown).toBe(false);
    expect(result.msRemaining).toBe(0);
  });
});
