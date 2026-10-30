import { useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from './firebase';
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
    const fetchConfig = async () => {
      try {
        const res = await secureApiFetch('/api/guardian/config');
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && typeof data.invitationEnabled === 'boolean') {
          setEnabled(data.invitationEnabled);
        }
      } catch {
        // Non-fatal - stays at the fail-closed default until a real
        // signed-in auth state lets the retry below succeed.
      }
    };
    // Phase 5N (directive §5) - mirrors useNovaAgenticJourneyEnabled.ts's
    // Phase 5M fix: a mount-once-only fetch raced ahead of Firebase Auth
    // finishing a brand-new anonymous sign-in, so the very first (and
    // only) fetch here could throw "not signed in" and stay stuck at the
    // fail-closed default for the rest of that page load regardless of
    // how long the user then stayed signed in. Subscribing to every real
    // auth-state change, not just mount, means a signed-in user always
    // gets a real answer eventually.
    //
    // The immediate call here too (not just inside the subscription) is
    // this phase's own fix for a regression that first fix caused: the
    // dev-only Playwright preview harness (nhei-phase5-preview-e2e-entry.tsx)
    // never produces a real signed-in Firebase user at all - its own
    // secureApiFetch escape hatch (__E2E_MOCK_AUTH__) answers protected
    // routes without one - so onAuthStateChanged alone would never fire
    // with a user there and this would stay permanently fail-closed,
    // exactly what broke nhei-phase5-journey.spec.ts's Guardian mutual-
    // exclusion test. Calling it unconditionally on mount as well covers
    // that harness and the ordinary case where auth is already resolved;
    // the subscription below is what actually fixes the real race.
    // Server-side gating in executeOfferGuardianSupport (server.ts) is
    // unchanged and remains authoritative either way - this only ever
    // controls whether the client bothers rendering the card/quick
    // action at all.
    fetchConfig();
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) fetchConfig();
    });
    return () => { cancelled = true; unsubscribe(); };
  }, []);

  return enabled;
};
