import { useEffect, useState } from 'react';
import { secureApiFetch } from './secure-api';

// Phase 5L (directive §§1,2) - mirrors useGuardianSupportInvitationEnabled.ts's
// shape exactly, same fail-closed polarity. NovaAgenticJourney (Invisible
// Load / Calendar Protection / Task Deferral / Before Words, reachable only
// via the dev-only preview harness across five prior phases before Phase 5K
// mounted it for every production user with no release flag at all) is a
// previously-unreleased surface, so this defaults false - a slow or failed
// config fetch must fall back to the existing, already-approved plain
// NovaChat, never to the newer, bigger surface. The real enforcement is
// still server-side regardless (executeOfferPracticalAssistance in
// server.ts checks the same NOVA_AGENTIC_JOURNEY_ENABLED flag and silently
// refuses), so this only ever controls which component App.tsx mounts.
export const useNovaAgenticJourneyEnabled = (): boolean => {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await secureApiFetch('/api/nova/journey-config');
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && typeof data.agenticJourneyEnabled === 'boolean') {
          setEnabled(data.agenticJourneyEnabled);
        }
      } catch {
        // Non-fatal - stays at the fail-closed default.
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return enabled;
};
