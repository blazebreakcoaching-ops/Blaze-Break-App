import { useEffect, useState } from 'react';
import { secureApiFetch } from './secure-api';

// docs/GUARDIAN_SUPPORT_SPEC.md §E.7 point 1: "Copy is bound to flag state -
// the UI cannot render capability-claiming copy that is not owned by an
// enabled flag." NovaGuardianRelay.tsx and CrisisSupport.tsx both render
// copy claiming Nova/the app will contact a guardian, so both need this -
// shared here rather than duplicated, so there is exactly one place that
// decides what "enabled" means on the client.
//
// Defaults to `true` while loading and on a failed fetch. This mirrors
// guardianAlertsEnabled's own server-side fail-open default (see
// guardian-alert.ts) rather than hiding the send action every time a
// network blip delays the config fetch - the real enforcement is
// server-side regardless (POST /api/guardian/alert checks this itself and
// refuses to send), so a stale/optimistic `true` here can never actually
// let a send through when the flag is really off; it can only, briefly,
// show a button that then reports "temporarily unavailable" on tap.
export const useGuardianAlertsEnabled = (): boolean => {
  const [enabled, setEnabled] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await secureApiFetch('/api/guardian/config');
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && typeof data.alertsEnabled === 'boolean') {
          setEnabled(data.alertsEnabled);
        }
      } catch {
        // Non-fatal - stays at the fail-open default; the real gate is
        // server-side.
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return enabled;
};
