import { useEffect, useState } from 'react';
import { MailCheck, RefreshCw } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { secureApiFetch, SecureApiError } from '../lib/secure-api';

// Persistent, always-visible (mounted once in App.tsx, alongside
// AccountStatusBanner) - only ever shows for a real, signed-in,
// non-anonymous account with a genuinely unverified email. The actual
// send-on-signup + verify-link flow already exists (LandingPage.tsx fires
// /api/auth/verify-email/send right after signup; AuthActionPage.tsx
// handles the link) - this banner is what was missing: something that
// tells the person (and keeps reminding them) that the step isn't done
// yet, with a way to get a fresh link if the first email was missed,
// deleted, or expired.
export const EmailVerificationBanner = () => {
  const { user, emailVerified, refreshEmailVerified } = useAuth();
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  // The verification link is opened in a different tab/window, so this
  // tab's own `user` object never hears about it on its own - re-check
  // whenever the person comes back to this tab, so the banner clears
  // itself the moment they've actually verified, with no manual refresh
  // needed.
  useEffect(() => {
    if (!user || user.isAnonymous || !user.email || emailVerified) return;
    const onFocus = () => { refreshEmailVerified(); };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, [user, emailVerified, refreshEmailVerified]);

  if (!user || user.isAnonymous || !user.email || emailVerified) return null;

  const handleResend = async () => {
    setSending(true);
    setStatus(null);
    try {
      const res = await secureApiFetch('/api/auth/verify-email/send', { method: 'POST' });
      const data = await res.json();
      setStatus(data.alreadyVerified ? "Already verified - you're all set." : `Sent to ${user.email}. Check your inbox (and spam folder).`);
      if (data.alreadyVerified) refreshEmailVerified();
    } catch (e) {
      setStatus(e instanceof SecureApiError ? e.message : "Couldn't send that right now - please try again shortly.");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 px-4 sm:px-6 py-3 mb-6 rounded-xl border border-warning/20 bg-warning/5">
      <div className="flex items-center gap-2.5 min-w-0">
        <MailCheck className="w-4 h-4 text-[#9a3412] dark:text-warning shrink-0" aria-hidden="true" />
        <p className="text-xs text-text-main">
          <span className="uppercase tracking-widest font-black text-[#9a3412] dark:text-warning">Confirm your email</span>
          {' '}— we sent a link to {user.email}. {status || "Click it to finish setting up your account."}
        </p>
      </div>
      <button
        type="button"
        onClick={handleResend}
        disabled={sending}
        className="shrink-0 flex items-center gap-2 px-4 py-2 bg-surface border border-border text-text-main text-xs font-bold uppercase tracking-widest rounded-full hover:border-primary/50 hover:text-primary transition-colors shadow-sm disabled:opacity-50"
      >
        {sending ? <RefreshCw className="w-3.5 h-3.5 animate-spin" aria-hidden="true" /> : <MailCheck className="w-3.5 h-3.5" aria-hidden="true" />}
        {sending ? 'Sending…' : 'Resend email'}
      </button>
    </div>
  );
};
