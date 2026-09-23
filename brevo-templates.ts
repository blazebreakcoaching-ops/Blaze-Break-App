// Pure HTML-builder functions for this app's client-facing emails - no
// network/Firestore I/O, so they're unit-testable like guardian-alert.ts
// and totp-mfa.ts. server.ts owns actually sending these via Brevo
// (sendBrevoHtmlEmail). Internal-only notifications (the admin copy of a
// support/feedback submission, sent to support@blazebreak.app) stay
// plain-text via sendBrevoEmail, since nobody outside the team ever sees
// those - only mail a real user receives goes through these templates.
//
// Kept deliberately plain: one accent colour (#9a3412, this app's existing
// flame-mark colour from LandingPage.tsx), a text-first layout, and the
// same direct, unmonitored-inbox tone already used in every other
// transactional email this app sends (see the "Request Received"/org
// invite/ally invite bodies in server.ts).

const ACCENT = '#9a3412';

const wrapEmail = (title: string, bodyHtml: string): string => `<!DOCTYPE html>
<html>
  <body style="margin:0;padding:0;background-color:#f5f1ed;font-family:Georgia,'Times New Roman',serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f5f1ed;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;background-color:#ffffff;border-radius:16px;overflow:hidden;">
            <tr>
              <td style="padding:28px 32px 0 32px;">
                <div style="font-size:11px;font-weight:900;letter-spacing:0.2em;text-transform:uppercase;color:${ACCENT};">Blaze Break</div>
                <h1 style="margin:8px 0 0 0;font-size:20px;font-weight:900;color:#1c1917;">${title}</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 32px 28px 32px;font-size:14px;line-height:1.6;color:#44403c;">
                ${bodyHtml}
              </td>
            </tr>
            <tr>
              <td style="padding:16px 32px;border-top:1px solid #e7e5e4;font-size:11px;color:#a8a29e;">
                This email is unmonitored. If you have questions, contact us through the app.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

const button = (href: string, label: string): string =>
  `<a href="${href}" style="display:inline-block;margin:20px 0;padding:12px 24px;background-color:${ACCENT};color:#ffffff;text-decoration:none;border-radius:8px;font-weight:700;font-size:14px;">${label}</a>`;

export const buildPasswordResetEmail = (resetLink: string): { subject: string; html: string } => ({
  subject: 'Reset your Blaze Break password',
  html: wrapEmail(
    'Reset your password',
    `<p>We received a request to reset the password on your Blaze Break account.</p>
     ${button(resetLink, 'Reset your password')}
     <p>This link expires soon and can only be used once. If you didn't ask for this, you can safely ignore this email - your password hasn't changed.</p>`
  ),
});

export const buildEmailVerificationEmail = (verifyLink: string): { subject: string; html: string } => ({
  subject: 'Verify your email for Blaze Break',
  html: wrapEmail(
    'Verify your email',
    `<p>Please confirm this is your email address to finish setting up your Blaze Break account.</p>
     ${button(verifyLink, 'Verify email address')}
     <p>If you didn't create a Blaze Break account, you can ignore this email.</p>`
  ),
});

export const buildPasswordChangedEmail = (): { subject: string; html: string } => ({
  subject: 'Your Blaze Break password was changed',
  html: wrapEmail(
    'Password changed',
    `<p>The password on your Blaze Break account was just changed.</p>
     <p>If this was you, no action is needed. If you didn't make this change, please reset your password again immediately and contact us through the app.</p>`
  ),
});

export const buildMfaEnabledEmail = (): { subject: string; html: string } => ({
  subject: 'Extra security turned on for your Blaze Break account',
  html: wrapEmail(
    'Two-factor authentication enabled',
    `<p>An authenticator app has been added to your Blaze Break account as an extra sign-in step.</p>
     <p>Keep your recovery codes somewhere safe - they're the only way back into your account if you lose access to your authenticator app.</p>
     <p>If you didn't do this, please contact us through the app right away.</p>`
  ),
});

export const buildMfaDisabledEmail = (): { subject: string; html: string } => ({
  subject: 'Extra security turned off for your Blaze Break account',
  html: wrapEmail(
    'Two-factor authentication disabled',
    `<p>The extra sign-in step (authenticator app) on your Blaze Break account has been turned off.</p>
     <p>If you didn't do this, please contact us through the app right away and reset your password.</p>`
  ),
});

export const buildSupportRequestReceivedEmail = (): { subject: string; html: string } => ({
  subject: 'Blaze Break - Request Received',
  html: wrapEmail(
    'Request received',
    `<p>We've received your request. Blaze Break is in controlled early access, so our team will process this manually and be in touch soon.</p>`
  ),
});

// Brevo requires a textContent fallback alongside htmlContent - this is a
// deliberately simple tag-stripper, not a general HTML-to-text converter,
// since every template above is built from the fixed set of tags used by
// wrapEmail/button here and never from arbitrary/user-supplied HTML.
export const htmlToPlainTextFallback = (html: string): string =>
  html
    .replace(/<a[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gi, '$2: $1')
    .replace(/<\/(p|div|h1|td|tr)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .split('\n')
    .map((line) => line.trim())
    .filter((line, i, arr) => line.length > 0 || (i > 0 && arr[i - 1].length > 0))
    .join('\n')
    .trim();
