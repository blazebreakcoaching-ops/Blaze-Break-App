import { useEffect, useState } from 'react';
import { useAuth } from './auth-context';
import { secureApiFetch } from './secure-api';

// Native equivalent of the web Nova release gate. The backend remains
// authoritative. A signed-out state, network error, invalid payload or
// stale response from an older Firebase user always leaves this OFF.
export function useNovaAgenticJourneyEnabled(): boolean {
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const [enabledFor, setEnabledFor] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!uid) return () => { cancelled = true; };

    void (async () => {
      try {
        const response = await secureApiFetch('/api/nova/journey-config');
        if (!response.ok) return;
        const body: unknown = await response.json();
        if (!cancelled && body && typeof body === 'object' &&
            'agenticJourneyEnabled' in body && body.agenticJourneyEnabled === true) {
          setEnabledFor(uid);
        }
      } catch {
        // Fail closed. A new authenticated session can retry.
      }
    })();

    return () => { cancelled = true; };
  }, [uid]);

  return uid !== null && enabledFor === uid;
}
