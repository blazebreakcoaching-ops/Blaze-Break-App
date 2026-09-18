import React, { useState } from 'react';
import { motion } from 'motion/react';
import { ShieldCheck, KeyRound, Loader2, LogOut } from 'lucide-react';
import { useAuth } from '../lib/auth';

// Rendered by App.tsx in place of the entire app whenever a signed-in,
// non-anonymous person has two-factor authentication enabled and hasn't
// verified it yet this session (see auth.tsx's mfaPending state) - the
// sign-in-time counterpart to SecuritySettingsView.tsx's enrollment flow.
// Firebase's own auth state is already fully signed in by this point;
// this gate blocks app access, not authentication itself, since there's
// no way to intercept onAuthStateChanged before it fires.

export const MfaChallenge = () => {
  const { verifyMfaAtSignIn, logOut } = useAuth();
  const [input, setInput] = useState('');
  const [useRecoveryCode, setUseRecoveryCode] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await verifyMfaAtSignIn(input.trim(), useRecoveryCode);
      // Success flips mfaPending to false inside verifyMfaAtSignIn - App.tsx
      // stops rendering this component on the next render, nothing further
      // to do here.
    } catch (e: any) {
      setError(e?.message || "That code didn't work. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4 text-text-main">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="bg-surface border border-border rounded-xl p-8 max-w-md w-full shadow-lg space-y-6"
      >
        <div className="w-12 h-12 bg-primary/10 rounded-2xl flex items-center justify-center text-primary">
          <ShieldCheck className="w-6 h-6" />
        </div>

        <div>
          <h3 className="text-xl font-bold tracking-tight">Enter your security code</h3>
          <p className="text-sm text-text-muted mt-1">
            {useRecoveryCode
              ? 'Enter one of your recovery codes.'
              : 'Enter the 6-digit code from your authenticator app.'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="relative">
            <KeyRound className="w-4 h-4 text-text-muted absolute left-4 top-1/2 -translate-y-1/2" aria-hidden="true" />
            <input
              type="text"
              required
              autoFocus
              value={input}
              onChange={(e) => setInput(useRecoveryCode ? e.target.value : e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder={useRecoveryCode ? 'Recovery code' : '6-digit code'}
              className="w-full bg-background border border-border rounded-xl pl-11 pr-4 py-3.5 text-sm text-text-main placeholder:text-text-muted focus:outline-none focus:border-primary/50 transition-colors tracking-widest"
            />
          </div>

          {error && <p role="alert" className="text-xs text-destructive leading-relaxed">{error}</p>}

          <button
            type="submit"
            disabled={busy || input.trim().length === 0}
            className="w-full flex items-center justify-center gap-3 bg-primary text-white font-bold text-xs uppercase tracking-widest py-4 rounded-2xl hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50"
          >
            {busy && <Loader2 className="w-4 h-4 animate-spin" />}
            <span>{busy ? 'Checking…' : 'Verify'}</span>
          </button>

          <button
            type="button"
            onClick={() => { setUseRecoveryCode((v) => !v); setInput(''); setError(null); }}
            className="w-full text-center text-xs font-bold text-text-muted hover:text-text-main transition-colors"
          >
            {useRecoveryCode ? 'Use an authenticator code instead' : 'Use a recovery code instead'}
          </button>
        </form>

        <button
          type="button"
          onClick={() => logOut()}
          className="w-full flex items-center justify-center gap-2 text-xs font-bold uppercase tracking-widest text-text-muted hover:text-text-main transition-colors py-1"
        >
          <LogOut className="w-3.5 h-3.5" /> Not you? Sign out
        </button>
      </motion.div>
    </div>
  );
};

export default MfaChallenge;
