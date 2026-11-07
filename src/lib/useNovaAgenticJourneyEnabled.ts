import { useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from './firebase';
import { secureApiFetch } from './secure-api';

// The advanced journey is unreleased by default, so an unavailable,
// unauthorised or stale config response must never enable its UI.
// server.ts independently enforces NOVA_AGENTIC_JOURNEY_ENABLED when
// dispatching the practical-assistance tool; this hook is only a
// presentation boundary, not a permission-granting mechanism.
export const useNovaAgenticJourneyEnabled = (): boolean => {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // Each auth transition invalidates all preceding network responses.
    // Without this, a slow response for account A could re-enable the
    // advanced journey after sign-out or after switching to account B.
    let authRevision = 0;

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      const requestRevision = ++authRevision;
      setEnabled(false);
      if (!user) return;

      // Fetch on every completed sign-in, not at mount: new anonymous
      // sessions may not exist yet when the App first mounts.
      void (async () => {
        try {
          const res = await secureApiFetch('/api/nova/journey-config');
          if (!res.ok) return;
          const data: unknown = await res.json();
          if (cancelled ||
              requestRevision !== authRevision ||
              auth.currentUser?.uid !== user.uid) return;
          if (data && typeof data === 'object' &&
              'agenticJourneyEnabled' in data &&
              typeof data.agenticJourneyEnabled === 'boolean') {
            setEnabled(data.agenticJourneyEnabled);
          }
        } catch {
          // Fail closed; a subsequent auth-state transition can retry.
        }
      })();
    });

    return () => {
      cancelled = true;
      ++authRevision;
      unsubscribe();
    };
  }, []);

  return enabled;
};
