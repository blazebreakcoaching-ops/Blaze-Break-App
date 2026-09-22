import { describe, it, expect } from 'vitest';
import {
  guardianSupportInvitationEnabled,
  buildGuardianSupportMessage,
  isValidGuardianSupportTemplateId,
  validateGuardianSupportOffer,
  isValidGuardianSupportEventType,
  GUARDIAN_SUPPORT_TEMPLATES,
} from './guardian-support-invitation';

describe('guardianSupportInvitationEnabled', () => {
  it('defaults OFF - unlike guardian_alerts, this is a new, unreviewed surface', () => {
    expect(guardianSupportInvitationEnabled(undefined)).toBe(false);
    expect(guardianSupportInvitationEnabled('')).toBe(false);
    expect(guardianSupportInvitationEnabled('yes')).toBe(false);
    expect(guardianSupportInvitationEnabled('1')).toBe(false);
  });

  it('is enabled only by the exact string "true"', () => {
    expect(guardianSupportInvitationEnabled('true')).toBe(true);
  });
});

describe('guardian support message templates', () => {
  it('has exactly two pre-approved templates, never freeform', () => {
    expect(Object.keys(GUARDIAN_SUPPORT_TEMPLATES).sort()).toEqual(['more_urgent', 'standard']);
  });

  it('validates known template ids', () => {
    expect(isValidGuardianSupportTemplateId('standard')).toBe(true);
    expect(isValidGuardianSupportTemplateId('more_urgent')).toBe(true);
    expect(isValidGuardianSupportTemplateId('emergency')).toBe(false);
    expect(isValidGuardianSupportTemplateId(undefined)).toBe(false);
  });

  it('builds the standard message with both the guardian and sender names, and the Blaze Break disclosure', () => {
    const msg = buildGuardianSupportMessage('standard', { guardianFirstName: 'Priya', senderFirstName: 'Tourae' });
    expect(msg).toBe(
      "Hi Priya, it's Tourae. I'm having a difficult moment and I'd really appreciate some support. Could you call or message me when you can? (Sent from the Blaze Break app.)"
    );
  });

  it('builds the more-urgent message with both names', () => {
    const msg = buildGuardianSupportMessage('more_urgent', { guardianFirstName: 'Priya', senderFirstName: 'Sam' });
    expect(msg).toContain('Priya');
    expect(msg).toContain("it's Sam");
    expect(msg).toContain('overwhelmed');
    expect(msg).toContain('Blaze Break');
  });

  it('falls back honestly rather than guessing when names are missing', () => {
    const msg = buildGuardianSupportMessage('standard', { guardianFirstName: '', senderFirstName: '' });
    expect(msg).toContain('Hi there,');
    expect(msg).toContain("it's A Blaze Break user");
  });

  it('neither template implies an emergency or a diagnosis', () => {
    for (const text of Object.values(GUARDIAN_SUPPORT_TEMPLATES)) {
      expect(text.toLowerCase()).not.toMatch(/emergency|999|danger|suicid|diagnos|risk/);
    }
  });
});

describe('validateGuardianSupportOffer', () => {
  it('rejects a missing or empty reason', () => {
    expect(validateGuardianSupportOffer({}).valid).toBe(false);
    expect(validateGuardianSupportOffer({ reason: '' }).valid).toBe(false);
    expect(validateGuardianSupportOffer({ reason: '   ' }).valid).toBe(false);
  });

  it('rejects a non-string reason', () => {
    expect(validateGuardianSupportOffer({ reason: 42 as any }).valid).toBe(false);
  });

  it('rejects an overlong reason', () => {
    expect(validateGuardianSupportOffer({ reason: 'x'.repeat(201) }).valid).toBe(false);
  });

  it('accepts a real, specific reason', () => {
    const result = validateGuardianSupportOffer({ reason: 'User said they feel completely alone in this right now.' });
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });
});

describe('isValidGuardianSupportEventType', () => {
  it('accepts every declared event type', () => {
    expect(isValidGuardianSupportEventType('invitation_shown')).toBe(true);
    expect(isValidGuardianSupportEventType('send_succeeded')).toBe(true);
    expect(isValidGuardianSupportEventType('resource_route_opened')).toBe(true);
  });

  it('rejects anything not in the closed enum - no risk-labelled event can sneak in', () => {
    expect(isValidGuardianSupportEventType('crisis_detected')).toBe(false);
    expect(isValidGuardianSupportEventType('high_risk_flagged')).toBe(false);
    expect(isValidGuardianSupportEventType(undefined)).toBe(false);
  });
});
