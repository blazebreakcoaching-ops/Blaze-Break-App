import { secureApiFetch } from './secure-api';
import type { GuardianSupportEventType } from '../../guardian-support-invitation';

// Fire-and-forget, privacy-preserving event logging for the Guardian
// Support Invitation flow - see guardian-support-invitation.ts and
// docs/GUARDIAN_SUPPORT_INVITATION.md. Never throws into the caller: a
// failed analytics write must never block or visibly break a user's actual
// support flow.
export const logGuardianSupportEvent = (
  eventType: GuardianSupportEventType,
  extra?: { contactId?: string; channel?: 'sms' | 'whatsapp' | 'call' },
): void => {
  secureApiFetch('/api/guardian/support-event', {
    method: 'POST',
    data: { eventType, ...extra },
  }).catch(() => {
    // Non-fatal - analytics only.
  });
};
