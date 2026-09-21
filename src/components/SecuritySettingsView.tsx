import React, { useState, useEffect } from 'react';
import { ShieldCheck, Loader2, Copy, Check, KeyRound, ShieldOff } from 'lucide-react';
import QRCode from 'qrcode';
import { secureApiFetch } from '../lib/secure-api';
import { auth } from '../lib/firebase';
import { useAuth } from '../lib/auth';
import { setMfaSessionToken } from '../lib/mfa-session';
import { cn } from '../lib/utils';

// The opt-in "extra security" step the owner asked for - a fully custom,
// app-level TOTP second factor (Firebase's native MFA needs a paid
// Identity Platform upgrade this project doesn't have). Off by default;
// turning it on requires an authenticator app; turning it off requires
// proving control of it first (a current code or a recovery code) -
// nobody with just a settings-page click can silently remove someone
// else's second factor from an already-open session.

type ViewState = 'loading' | 'off' | 'enrolling' | 'confirmCode' | 'recoveryCodes' | 'on' | 'disabledSignOut' | 'loadError';

export const SecuritySettingsView = () => {
  const { logOut } = useAuth();
  const [state, setState] = useState<ViewState>('loading');
  const [enrolledAt, setEnrolledAt] = useState<string | null>(null);
  const [manualSecret, setManualSecret] = useState('');
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);
  const [disabling, setDisabling] = useState(false);
  const [disableInput, setDisableInput] = useState('');
  const [disableError, setDisableError] = useState<string | null>(null);
  const [disableBusy, setDisableBusy] = useState(false);

  const loadStatus = async () => {
    setState('loading');
    setError(null);
    try {
      const res = await secureApiFetch('/api/auth/mfa/status');
      const data = await res.json();
      setEnrolledAt(data.enrolledAt || null);
      setState(data.enabled ? 'on' : 'off');
    } catch (e) {
      // Don't default to 'off' here - if 2FA is actually enabled
      // server-side, that would briefly show the "turn it on" enrollment
      // screen instead, which is confusing (the server-side gate is
      // separate and unaffected either way, but the UI shouldn't imply a
      // security setting is off when it genuinely doesn't know).
      setError("Couldn't check your two-factor status right now.");
      setState('loadError');
    }
  };

  useEffect(() => {
    loadStatus();
  }, []);

  const startEnrollment = async () => {
    setError(null);
    setBusy(true);
    try {
      const res = await secureApiFetch('/api/auth/mfa/totp/enroll/start', { method: 'POST' });
      const data = await res.json();
      setManualSecret(data.secretForManualEntry);
      const dataUrl = await QRCode.toDataURL(data.otpauthUri);
      setQrDataUrl(dataUrl);
      setCode('');
      setState('confirmCode');
    } catch (e: any) {
      setError(e?.message || 'Could not start setup. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const confirmEnrollment = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await secureApiFetch('/api/auth/mfa/totp/enroll/confirm', { method: 'POST', data: { code } });
      const data = await res.json();
      setRecoveryCodes(data.recoveryCodes || []);
      if (auth.currentUser && data.mfaSessionToken) {
        setMfaSessionToken(auth.currentUser.uid, data.mfaSessionToken);
        // Picks up the mfaEnabled claim the server just set, rather than
        // waiting for the SDK's own ~hourly refresh - otherwise every
        // gated request between now and then would rely solely on the
        // session token line above, which is correct but unnecessarily
        // fragile to keep as the only thing working.
        await auth.currentUser.getIdToken(true);
      }
      setEnrolledAt(new Date().toISOString());
      setState('recoveryCodes');
    } catch (e: any) {
      setError(e?.message || "That code didn't work. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const submitDisable = async (e: React.FormEvent) => {
    e.preventDefault();
    setDisableError(null);
    setDisableBusy(true);
    try {
      const trimmed = disableInput.trim();
      const isNumericCode = /^\d{6}$/.test(trimmed);
      await secureApiFetch('/api/auth/mfa/totp/disable', {
        method: 'POST',
        data: isNumericCode ? { code: trimmed } : { recoveryCode: trimmed },
      });
      setDisabling(false);
      setDisableInput('');
      // Disabling revokes every refresh token issued before this moment
      // (server-side, so it can't be skipped) - the current session,
      // including this one, can no longer silently refresh its ID token.
      // Sign out openly and explain why, rather than leaving the app
      // running on a session that's about to start failing every request.
      setState('disabledSignOut');
    } catch (e: any) {
      setDisableError(e?.message || "That code didn't work. Please try again.");
    } finally {
      setDisableBusy(false);
    }
  };

  const copyRecoveryCodes = async () => {
    try {
      await navigator.clipboard.writeText(recoveryCodes.join('\n'));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can be blocked - the codes are still shown on
      // screen either way, so this is cosmetic only.
    }
  };

  if (state === 'loading') {
    return (
      <div className="flex items-center gap-3 text-text-muted py-6">
        <Loader2 className="w-4 h-4 animate-spin" />
        <span className="text-sm">Checking your security settings…</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h3 className="text-xl font-display font-bold text-text-main">Extra Security</h3>
        <p className="text-xs text-text-muted">
          Add a second step when signing in, using an authenticator app like Google Authenticator or Authy. Entirely optional.
        </p>
      </div>

      {error && (
        <p role="alert" className="text-xs text-destructive leading-relaxed">{error}</p>
      )}

      {state === 'loadError' && (
        <button
          type="button"
          onClick={loadStatus}
          className="text-xs font-bold uppercase tracking-widest text-primary hover:underline"
        >
          Try again
        </button>
      )}

      {state === 'off' && (
        <div className="border border-border rounded-xl p-4 space-y-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-text-muted" />
            <h4 className="text-sm font-bold text-text-main">Two-factor authentication is off</h4>
          </div>
          <p className="text-xs text-text-muted">
            Turning this on means you'll enter a fresh 6-digit code from an authenticator app each time you sign in, in addition to your password.
          </p>
          <button
            type="button"
            onClick={startEnrollment}
            disabled={busy}
            className="w-full sm:w-auto px-6 py-2.5 btn-primary text-xs font-bold uppercase tracking-widest rounded-lg disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {busy && <Loader2 className="w-4 h-4 animate-spin" />}
            Turn on two-factor authentication
          </button>
        </div>
      )}

      {state === 'on' && (
        <div className="border border-border rounded-xl p-4 space-y-3">
          <div className="flex items-center gap-2 text-success">
            <ShieldCheck className="w-4 h-4" />
            <h4 className="text-sm font-bold text-text-main">Two-factor authentication is on</h4>
          </div>
          <p className="text-xs text-text-muted">
            {enrolledAt ? `Enabled ${new Date(enrolledAt).toLocaleDateString()}. ` : ''}
            You'll be asked for a code from your authenticator app each time you sign in.
          </p>
          {!disabling ? (
            <button
              type="button"
              onClick={() => { setDisabling(true); setDisableError(null); setDisableInput(''); }}
              className="text-xs font-bold text-text-muted hover:text-destructive transition-colors flex items-center gap-1.5"
            >
              <ShieldOff className="w-3.5 h-3.5" /> Turn off two-factor authentication
            </button>
          ) : (
            <form onSubmit={submitDisable} className="space-y-3 pt-2 border-t border-border">
              <p className="text-xs text-text-muted pt-3">
                Enter a current code from your authenticator app, or a recovery code, to confirm.
              </p>
              <div className="relative">
                <KeyRound className="w-4 h-4 text-text-muted absolute left-4 top-1/2 -translate-y-1/2" aria-hidden="true" />
                <input
                  type="text"
                  required
                  value={disableInput}
                  onChange={(e) => setDisableInput(e.target.value)}
                  placeholder="6-digit code or recovery code"
                  className="w-full bg-background border border-border rounded-xl pl-11 pr-4 py-3 text-sm text-text-main placeholder:text-text-muted focus:outline-none focus:border-primary/50 transition-colors"
                />
              </div>
              {disableError && (
                <p role="alert" className="text-xs text-destructive leading-relaxed">{disableError}</p>
              )}
              <div className="flex flex-col sm:flex-row gap-2">
                <button
                  type="submit"
                  disabled={disableBusy || disableInput.trim().length === 0}
                  className="px-6 py-2.5 bg-destructive text-white text-xs font-bold uppercase tracking-widest rounded-lg disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {disableBusy && <Loader2 className="w-4 h-4 animate-spin" />}
                  Confirm turn off
                </button>
                <button
                  type="button"
                  onClick={() => { setDisabling(false); setDisableError(null); }}
                  className="px-6 py-2.5 text-xs font-bold uppercase tracking-widest text-text-muted hover:text-text-main transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {state === 'disabledSignOut' && (
        <div className="border border-border rounded-xl p-4 space-y-3">
          <div className="flex items-center gap-2">
            <ShieldOff className="w-4 h-4 text-text-muted" />
            <h4 className="text-sm font-bold text-text-main">Two-factor authentication is now off</h4>
          </div>
          <p className="text-xs text-text-muted">
            For your security, this signs you out everywhere. Please sign back in to continue.
          </p>
          <button
            type="button"
            onClick={() => { logOut(); }}
            className="w-full sm:w-auto px-6 py-2.5 btn-primary text-xs font-bold uppercase tracking-widest rounded-lg"
          >
            Sign in again
          </button>
        </div>
      )}

      {state === 'confirmCode' && (
        <div className="border border-border rounded-xl p-4 space-y-4">
          <div className="space-y-2">
            <h4 className="text-sm font-bold text-text-main">Scan this with your authenticator app</h4>
            {qrDataUrl && (
              <img src={qrDataUrl} alt="QR code to scan with your authenticator app" className="w-40 h-40 rounded-lg border border-border bg-white p-2" />
            )}
            <p className="text-xs text-text-muted">
              Can't scan it? Enter this code manually instead:
            </p>
            <code className="block text-xs font-mono bg-surface border border-border rounded-lg px-3 py-2 break-all text-text-main">
              {manualSecret}
            </code>
          </div>
          <form onSubmit={confirmEnrollment} className="space-y-3">
            <div className="relative">
              <KeyRound className="w-4 h-4 text-text-muted absolute left-4 top-1/2 -translate-y-1/2" aria-hidden="true" />
              <input
                type="text"
                inputMode="numeric"
                pattern="\d{6}"
                maxLength={6}
                required
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="6-digit code"
                className="w-full bg-background border border-border rounded-xl pl-11 pr-4 py-3 text-sm text-text-main placeholder:text-text-muted focus:outline-none focus:border-primary/50 transition-colors tracking-widest"
              />
            </div>
            <button
              type="submit"
              disabled={busy || code.length !== 6}
              className="w-full sm:w-auto px-6 py-2.5 btn-primary text-xs font-bold uppercase tracking-widest rounded-lg disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {busy && <Loader2 className="w-4 h-4 animate-spin" />}
              Confirm and turn on
            </button>
          </form>
        </div>
      )}

      {state === 'recoveryCodes' && (
        <div className="border border-border rounded-xl p-4 space-y-4">
          <div className="flex items-center gap-2 text-success">
            <ShieldCheck className="w-4 h-4" />
            <h4 className="text-sm font-bold text-text-main">Two-factor authentication is on</h4>
          </div>
          <div className="space-y-2">
            <p className="text-xs text-text-main font-bold">Save these recovery codes somewhere safe.</p>
            <p className="text-xs text-text-muted">
              If you ever lose access to your authenticator app, each of these codes can be used once instead. This is the only time they'll be shown.
            </p>
            <div className="grid grid-cols-2 gap-2 bg-surface border border-border rounded-lg p-3 font-mono text-xs text-text-main">
              {recoveryCodes.map((rc) => (
                <span key={rc}>{rc}</span>
              ))}
            </div>
            <button
              type="button"
              onClick={copyRecoveryCodes}
              className={cn(
                "w-full sm:w-auto px-4 py-2 text-xs font-bold uppercase tracking-widest rounded-lg border border-border flex items-center justify-center gap-2 transition-colors",
                copied ? "text-success" : "text-text-muted hover:text-text-main"
              )}
            >
              {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? 'Copied' : 'Copy codes'}
            </button>
          </div>
          <button
            type="button"
            onClick={() => setState('on')}
            className="w-full sm:w-auto px-6 py-2.5 btn-primary text-xs font-bold uppercase tracking-widest rounded-lg"
          >
            Done
          </button>
        </div>
      )}
    </div>
  );
};

export default SecuritySettingsView;
