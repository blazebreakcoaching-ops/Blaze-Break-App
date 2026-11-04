import { useAuth } from '../lib/auth';
import { MfaChallenge } from './MfaChallenge';
import App from '../App';

/**
 * App.tsx has data-loading and background effects at mount time, so a
 * bottom-of-App "return <MfaChallenge/>" is not a real UI gate: its
 * effects still run. Keep the protected app UNMOUNTED while MFA is
 * unresolved, including after an expired MFA session.
 *
 * This is defence-in-depth for app behaviour. Direct Firestore SDK access
 * must also be protected by server-side rules: that separate P0 remains.
 */
export function AccountAccessGate() {
  const { user, mfaPending, loading } = useAuth();
  if (user && (mfaPending || loading)) {
    if (mfaPending) return <MfaChallenge />;
    return (
      <div className="min-h-screen bg-background text-text-main flex items-center justify-center"
        role="status" aria-live="polite">
        Checking account security…
      </div>
    );
  }
  return <App />;
}
