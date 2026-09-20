import { describe, it, expect } from 'vitest';
import {
  buildPasswordResetEmail,
  buildEmailVerificationEmail,
  buildPasswordChangedEmail,
  buildMfaEnabledEmail,
  buildMfaDisabledEmail,
  htmlToPlainTextFallback,
} from './brevo-templates';

describe('email template builders', () => {
  it('password reset email embeds the exact reset link and has a sensible subject', () => {
    const { subject, html } = buildPasswordResetEmail('https://blazebreak.example/auth/action?mode=resetPassword&oobCode=abc123');
    expect(subject).toMatch(/reset/i);
    expect(html).toContain('https://blazebreak.example/auth/action?mode=resetPassword&oobCode=abc123');
    expect(html).toContain('<!DOCTYPE html>');
  });

  it('email verification embeds the exact verify link', () => {
    const { subject, html } = buildEmailVerificationEmail('https://blazebreak.example/auth/action?mode=verifyEmail&oobCode=xyz789');
    expect(subject).toMatch(/verify/i);
    expect(html).toContain('https://blazebreak.example/auth/action?mode=verifyEmail&oobCode=xyz789');
  });

  it('password changed notice does not include any link (nothing to click, just a notice)', () => {
    const { subject, html } = buildPasswordChangedEmail();
    expect(subject).toMatch(/password/i);
    expect(html).not.toContain('<a ');
  });

  it('MFA enabled/disabled notices mention contacting support if the change was not the account owner', () => {
    expect(buildMfaEnabledEmail().html).toMatch(/didn't do this/i);
    expect(buildMfaDisabledEmail().html).toMatch(/didn't do this/i);
  });

  it('every template produces a non-empty subject and a full HTML document', () => {
    for (const build of [
      () => buildPasswordResetEmail('https://x/y'),
      () => buildEmailVerificationEmail('https://x/y'),
      buildPasswordChangedEmail,
      buildMfaEnabledEmail,
      buildMfaDisabledEmail,
    ]) {
      const { subject, html } = build();
      expect(subject.length).toBeGreaterThan(0);
      expect(html).toContain('<html>');
      expect(html).toContain('Blaze Break');
    }
  });
});

describe('htmlToPlainTextFallback', () => {
  it('strips tags and preserves the link URL as visible text', () => {
    const { html } = buildPasswordResetEmail('https://blazebreak.example/reset?oobCode=abc123');
    const text = htmlToPlainTextFallback(html);
    expect(text).not.toContain('<');
    expect(text).not.toContain('>');
    expect(text).toContain('https://blazebreak.example/reset?oobCode=abc123');
    expect(text).toContain('Reset your password');
  });

  it('produces non-empty, readable output for every template', () => {
    for (const build of [
      () => buildPasswordResetEmail('https://x/y'),
      () => buildEmailVerificationEmail('https://x/y'),
      buildPasswordChangedEmail,
      buildMfaEnabledEmail,
      buildMfaDisabledEmail,
    ]) {
      const text = htmlToPlainTextFallback(build().html);
      expect(text.length).toBeGreaterThan(20);
      expect(text).not.toMatch(/<[a-z]/i);
    }
  });

  it('collapses excess blank lines rather than leaving large gaps', () => {
    const text = htmlToPlainTextFallback('<p>one</p><p></p><p>two</p>');
    expect(text).not.toMatch(/\n{3,}/);
  });
});
