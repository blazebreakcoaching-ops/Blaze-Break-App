import { useEffect, useState } from 'react';
import { secureApiFetch } from './secure-api';

// Mirrors useGuardianAlertsEnabled.ts's shape exactly, but with the
// opposite fail-safe default. That hook fails OPEN (defaults true) because
// Tier 1 guardian alerts were already live and relied upon before their
// flag existed - hiding the button on a network blip would remove a
// feature users already had. The Guardian Support Invitation is new and
// unreviewed (see docs/GUARDIAN_SUPPORT_INVITATION.md's specialist-review
// list), so this fails CLOSED (defaults false) - a slow or failed config
// fetch should never show a brand-new prompt nobody asked to see. The real
// enforcement is still server-side regardless (executeOfferGuardianSupport
// in server.ts checks the same flag and silently returns "not offered"),
// so this only ever controls whether the client bothers rendering the
// card and quick action at all.
export const useGuardianSupportInvitationEnabled = (): boolean => {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await secureApiFetch('/api/guardian/config');
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && typeof data.invitationEnabled === 'boolean') {
          setEnabled(data.invitationEnabled);
        }
      } catch {
        // Non-fatal - stays at the fail-closed default.
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return enabled;
};
