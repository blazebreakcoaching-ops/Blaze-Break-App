import { useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from './firebase';
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
    const fetchConfig = async () => {
      try {
        const res = await secureApiFetch('/api/nova/journey-config');
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && typeof data.agenticJourneyEnabled === 'boolean') {
          setEnabled(data.agenticJourneyEnabled);
        }
      } catch {
        // Non-fatal - stays at the fail-closed default until a real
        // signed-in auth state lets the retry below succeed.
      }
    };
    // Phase 5M (directive §5) - a real browser test caught the race this
    // fixes: on a brand-new anonymous sign-in, App.tsx (and this effect)
    // mounts before Firebase Auth has actually finished creating that
    // session, so the very first call here threw "not signed in" and,
    // with a mount-once effect and no retry, stayed stuck at the
    // fail-closed default for the rest of that page load regardless of
    // how long the user then stayed signed in. Re-running on every real
    // auth-state change (not just once on mount) means a signed-in user
    // always gets a real answer, not just whoever's session happened to
    // already be ready the instant this component first mounted.
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) fetchConfig();
    });
    return () => { cancelled = true; unsubscribe(); };
  }, []);

  return enabled;
};
