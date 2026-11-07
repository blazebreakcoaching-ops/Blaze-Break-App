import { useEffect, useState } from 'react';
import { useAuth } from './auth-context';
import { secureApiFetch } from './secure-api';

// Native equivalent of the web Nova release gate. The backend remains
// authoritative. A signed-out state, network error, invalid payload or
// stale response from an older Firebase user always leaves this OFF.
export function useNovaAgenticJourneyEnabled(): boolean {
  const { user } = useAuth();
  // Bind the enabled result to the actual Firebase User object, not
  // just its uid: sign-out and re-entry as the same account must not
  // silently reuse a previous session's successful flag response.
  const [enabledFor, setEnabledFor] = useState<typeof user>(null);

  useEffect(() => {
    let cancelled = false;
    // No explicit reset here: the return value below already requires
    // `enabledFor === user` by reference, so it is automatically false
    // for any new sign-in or sign-out (a fresh User object, or null)
    // until this effect's own fetch for THAT user succeeds. Calling
    // setState synchronously at the top of an effect to force that same
    // reset would just be redundant render-churn (and is exactly what
    // react-hooks/set-state-in-effect flags).
    if (!user) return () => { cancelled = true; };

    void (async () => {
      try {
        const response = await secureApiFetch('/api/nova/journey-config');
        if (!response.ok) return;
        const body: unknown = await response.json();
        if (!cancelled && body && typeof body === 'object' &&
            'agenticJourneyEnabled' in body && body.agenticJourneyEnabled === true) {
          setEnabledFor(user);
        }
      } catch {
        // Fail closed. A new authenticated session can retry.
      }
    })();

    return () => { cancelled = true; };
  }, [user]);

  return user !== null && enabledFor === user;
}
