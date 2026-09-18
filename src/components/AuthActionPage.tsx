import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { Loader2, CheckCircle2, AlertTriangle, Lock, Sparkles } from 'lucide-react';
import { verifyPasswordResetCode, confirmPasswordReset, applyActionCode } from 'firebase/auth';
import { auth } from '../lib/firebase';
import { useAuth } from '../lib/auth';
import { secureApiFetch } from '../lib/secure-api';

// Handles the link Firebase generates for password reset / email
// verification - rendered as a top-level alternative to <App /> from
// src/main.tsx (mirroring the existing /ally/:token -> AllyView special
// case), NOT Firebase's own hosted action-handling page. The server
// requests these links with `handleCodeInApp: true` and `url` pointing
// here (see authActionUrl() in server.ts), so the link Firebase generates
// lands on /auth/action?mode=...&oobCode=... directly.

type ActionMode = 'resetPassword' | 'verifyEmail';
type Stage = 'loading' | 'resetForm' | 'resetDone' | 'verifyDone' | 'error';

export const AuthActionPage = () => {
  const { loading: authLoading } = useAuth();
  const params = new URLSearchParams(window.location.search);
  const mode = params.get('mode') as ActionMode | null;
  const oobCode = params.get('oobCode');

  const [stage, setStage] = useState<Stage>('loading');
  const [errorMessage, setErrorMessage] = useState('');
  const [resetEmail, setResetEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (!mode || !oobCode) {
      setErrorMessage("This link isn't valid. It may be incomplete - try opening it again from the original email.");
      setStage('error');
      return;
    }

    const run = async () => {
      try {
        if (mode === 'resetPassword') {
          const email = await verifyPasswordResetCode(auth, oobCode);
          setResetEmail(email);
          setStage('resetForm');
        } else if (mode === 'verifyEmail') {
          await applyActionCode(auth, oobCode);
          setStage('verifyDone');
        } else {
          setErrorMessage("This link isn't valid.");
          setStage('error');
        }
      } catch (e: any) {
        setErrorMessage(
          e?.code === 'auth/expired-action-code'
            ? 'This link has expired. Please request a new one.'
            : e?.code === 'auth/invalid-action-code'
            ? "This link has already been used or isn't valid. Please request a new one."
            : "Something went wrong opening this link. Please try again."
        );
        setStage('error');
      }
    };
    run();
  }, [authLoading, mode, oobCode]);

  const handleResetSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    if (newPassword.length < 8) {
      setErrorMessage('Password must be at least 8 characters.');
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setErrorMessage("Those passwords don't match.");
      return;
    }
    try {
      setSubmitting(true);
      await confirmPasswordReset(auth, oobCode as string, newPassword);
      setStage('resetDone');
      // Best-effort security notice - never blocks the person from seeing
      // their reset succeeded even if this fails.
      secureApiFetch('/api/auth/password-reset/confirm-notify', { method: 'POST', data: { email: resetEmail } }).catch(() => {});
    } catch (e: any) {
      setErrorMessage(
        e?.code === 'auth/expired-action-code'
          ? 'This link has expired. Please request a new one.'
          : e?.code === 'auth/weak-password'
          ? 'Please choose a stronger password.'
          : 'Could not reset the password. Please try again.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  const goToApp = () => { window.location.href = '/'; };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4 text-text-main">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="bg-surface border border-border rounded-xl p-8 max-w-md w-full shadow-lg space-y-6"
      >
        <div className="w-12 h-12 bg-primary/10 rounded-2xl flex items-center justify-center text-primary">
          <Sparkles className="w-6 h-6" />
        </div>

        {stage === 'loading' && (
          <div className="flex flex-col items-center gap-3 py-6 text-text-muted">
            <Loader2 className="w-6 h-6 animate-spin" />
            <p className="text-sm">Checking your link…</p>
          </div>
        )}

        {stage === 'error' && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="w-5 h-5" />
              <h3 className="text-lg font-bold">This link didn't work</h3>
            </div>
            <p className="text-sm text-text-muted leading-relaxed">{errorMessage}</p>
            <button onClick={goToApp} className="w-full btn-primary py-3 rounded-xl text-xs font-bold uppercase tracking-widest">
              Back to Blaze Break
            </button>
          </div>
        )}

        {stage === 'resetForm' && (
          <form onSubmit={handleResetSubmit} className="space-y-4">
            <div>
              <h3 className="text-xl font-bold tracking-tight">Choose a new password</h3>
              <p className="text-sm text-text-muted mt-1">For {resetEmail}</p>
            </div>
            <div className="relative">
              <Lock className="w-4 h-4 text-text-muted absolute left-4 top-1/2 -translate-y-1/2" aria-hidden="true" />
              <input
                type="password"
                required
                autoComplete="new-password"
                minLength={8}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="New password"
                className="w-full bg-background border border-border rounded-xl pl-11 pr-4 py-3.5 text-sm text-text-main placeholder:text-text-muted focus:outline-none focus:border-primary/50 transition-colors"
              />
            </div>
            <div className="relative">
              <Lock className="w-4 h-4 text-text-muted absolute left-4 top-1/2 -translate-y-1/2" aria-hidden="true" />
              <input
                type="password"
                required
                autoComplete="new-password"
                minLength={8}
                value={confirmNewPassword}
                onChange={(e) => setConfirmNewPassword(e.target.value)}
                placeholder="Confirm new password"
                className="w-full bg-background border border-border rounded-xl pl-11 pr-4 py-3.5 text-sm text-text-main placeholder:text-text-muted focus:outline-none focus:border-primary/50 transition-colors"
              />
            </div>
            {errorMessage && <p role="alert" className="text-xs text-destructive leading-relaxed">{errorMessage}</p>}
            <button
              type="submit"
              disabled={submitting}
              className="w-full flex items-center justify-center gap-3 bg-primary text-white font-bold text-xs uppercase tracking-widest py-4 rounded-2xl hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50"
            >
              {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
              <span>{submitting ? 'Saving…' : 'Reset password'}</span>
            </button>
          </form>
        )}

        {stage === 'resetDone' && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-primary">
              <CheckCircle2 className="w-5 h-5" />
              <h3 className="text-lg font-bold">Password reset</h3>
            </div>
            <p className="text-sm text-text-muted leading-relaxed">
              Your password has been changed. You can now sign in with your new password.
            </p>
            <button onClick={goToApp} className="w-full btn-primary py-3 rounded-xl text-xs font-bold uppercase tracking-widest">
              Back to Blaze Break
            </button>
          </div>
        )}

        {stage === 'verifyDone' && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-primary">
              <CheckCircle2 className="w-5 h-5" />
              <h3 className="text-lg font-bold">Email verified</h3>
            </div>
            <p className="text-sm text-text-muted leading-relaxed">Thanks - your email address is confirmed.</p>
            <button onClick={goToApp} className="w-full btn-primary py-3 rounded-xl text-xs font-bold uppercase tracking-widest">
              Back to Blaze Break
            </button>
          </div>
        )}
      </motion.div>
    </div>
  );
};

export default AuthActionPage;
