import { useState, useEffect, useRef, lazy, Suspense } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ArrowRight, ShieldCheck, BatteryLow, LogIn, ArrowLeft, Loader2, Mail, Lock, TrendingUp, Users, Wand2, Copy, Check } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { BlazeBrandLogo } from './BlazeBrandLogo';
import { AppearanceMenu } from './AppearanceMenu';
import type { AppearanceMode } from '../lib/appearance-theme';
import { useFocusTrap } from '../lib/useFocusTrap';
import { secureApiFetch } from '../lib/secure-api';
import { checkPasswordStrength, generateStrongPassword, PASSWORD_REQUIREMENT_TEXT, PASSWORD_MIN_LENGTH } from '../lib/password-strength';
import type { LegalDocumentType } from './LegalDocumentModal';

// Lazy - this pulls in the `qrcode` library, which has no reason to load
// for every anonymous landing-page visitor when only the small fraction
// who actually complete a fresh signup ever reach this step.
const SecuritySettingsView = lazy(() => import('./SecuritySettingsView').then(m => ({ default: m.SecuritySettingsView })));
// Lazy for the same reason - pulls in react-markdown, only needed if
// someone actually opens the Terms or Privacy Notice.
const LegalDocumentModal = lazy(() => import('./LegalDocumentModal').then(m => ({ default: m.LegalDocumentModal })));

interface LandingPageProps {
  onStart: () => void;
  // Jumps straight to a populated sample dashboard (real feature, fake
  // data, clearly labeled) - a deliberate, optional choice, never
  // triggered automatically. Onboarding never routes here on its own;
  // App.tsx's routing effect only ever leaves a fresh anonymous visitor
  // on "landing" until they click something, precisely so nobody who
  // just wants to read the Terms/Privacy or look around gets swept into
  // either onboarding or this demo without asking.
  onViewDemo: () => void;
  onOpenTrustCentre: () => void;
  // Optional because App.tsx's dark mode state already defaults every
  // visitor to their system preference before this component ever
  // mounts (see its useState initializer) - these props exist purely so
  // a visitor can *see* and *override* that default from the very first
  // screen they land on, matching the toggle the inner app already has.
  // Undefined props degrade gracefully: the toggle button simply doesn't
  // render rather than throwing, so this stays optional at the type
  // level even though App.tsx always passes both in practice.
  themeMode?: AppearanceMode;
  setThemeMode?: (mode: AppearanceMode) => void;
  // True when App.tsx routed here specifically to open the sign-up modal
  // (e.g. a demo session's "Sign up free" banner). Every visitor already
  // has a live anonymous session by the time this component mounts, so
  // the ordinary "Get Started" flow (handleStartRequest below) never
  // opens this modal on its own - it just starts onboarding anonymously.
  // This prop is the one path that actually forces it open.
  initialAuthModalOpen?: boolean;
  // Called once, right after initialAuthModalOpen has been consumed - lets
  // App.tsx reset its one-shot flag back to false, so a later, ordinary
  // visit to "landing" (e.g. ending a real session) doesn't also force
  // this modal open.
  onInitialAuthModalOpened?: () => void;
}

type AuthMode = 'signin' | 'signup' | 'forgot';

export const LandingPage = ({ onStart, onViewDemo, onOpenTrustCentre, themeMode, setThemeMode, initialAuthModalOpen, onInitialAuthModalOpened }: LandingPageProps) => {
  const { user, signIn, signInWithMicrosoft, signInWithFacebook, signUpWithEmail, signInWithEmail, sendPasswordReset } = useAuth();
  const [showAuthModal, setShowAuthModal] = useState(false);
  const authDialogRef = useFocusTrap(showAuthModal);

  useEffect(() => {
    if (!showAuthModal) return;
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') setShowAuthModal(false); };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [showAuthModal]);

  // Which social provider's popup is currently in flight, if any - tracked
  // per-provider (not one shared boolean) so only the button actually
  // clicked shows its spinner, while all three still disable together to
  // prevent stacking multiple OAuth popups at once.
  const [signingInProvider, setSigningInProvider] = useState<'google' | 'microsoft' | 'facebook' | null>(null);

  // Email/password sign-up, sign-in, and forgot-password all share this one
  // modal - `authMode` picks which form is showing. Reset to a clean slate
  // every time the modal opens, so a previous attempt's typed password or
  // error message never lingers into the next visit.
  const [authMode, setAuthMode] = useState<AuthMode>('signin');

  useEffect(() => {
    if (initialAuthModalOpen) {
      setAuthMode('signup');
      setShowAuthModal(true);
      onInitialAuthModalOpened?.();
    }
    // Deliberately no cleanup/reset - this component only ever mounts
    // fresh (App.tsx renders it only when flow === "landing"), so there's
    // no stale-prop state to reset on unmount. Only initialAuthModalOpen
    // is a dependency on purpose - onInitialAuthModalOpened is a stable
    // one-shot callback that shouldn't re-trigger this effect on its own.
  }, [initialAuthModalOpen]);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [emailAuthSubmitting, setEmailAuthSubmitting] = useState(false);
  const [resetLinkSent, setResetLinkSent] = useState(false);
  // True once "Generate a strong password" has been used this signup
  // attempt - switches the password fields to plain text (a generated
  // password the user can't see or copy defeats the point) and shows the
  // copy button. Reset alongside everything else when the modal closes.
  const [generatedPasswordVisible, setGeneratedPasswordVisible] = useState(false);
  const [copiedGeneratedPassword, setCopiedGeneratedPassword] = useState(false);
  // Shown in place of the normal sign-in/sign-up forms right after a
  // successful signup (any provider) - a skippable, optional invitation to
  // set up 2FA before entering the app. Never shown for a returning
  // sign-in. Reuses SecuritySettingsView (the exact same component/
  // endpoints Settings uses) rather than a second enrollment flow.
  const [showPostSignupMfaStep, setShowPostSignupMfaStep] = useState(false);
  const [mfaJustEnabled, setMfaJustEnabled] = useState(false);
  // Which legal document (Terms/Privacy) the "By continuing..." line's
  // links currently have open, if any - null means neither is open.
  const [legalDocOpen, setLegalDocOpen] = useState<LegalDocumentType | null>(null);
  // Gates every sign-in/sign-up button (email and social) - previously
  // the Terms/Privacy line was just informational text next to the
  // buttons, so nothing actually stopped someone continuing without
  // reading or agreeing to it. Required, unticked by default, every time
  // the modal opens - it never carries over between visits.
  const [legalAgreed, setLegalAgreed] = useState(false);

  // Phase 5N (directive §3) - a real-app Playwright test clicking the real
  // "Sign up free" banner caught this: on the component's very first
  // render, showAuthModal is false (its default) - true regardless of
  // whether this mount is also about to open straight into signup mode via
  // the initialAuthModalOpen effect above. Both effects fire in the SAME
  // commit, each closed over that same initial, stale `showAuthModal ===
  // false`, so this one unconditionally ran its "reset to signin" on every
  // single mount, including immediately after the other effect had just
  // set authMode to 'signup' - silently downgrading a real user's signup
  // intent to a sign-in form with no visible error. prevShowAuthModalRef
  // makes this fire only on an ACTUAL open-to-closed transition (the real
  // "they just closed the modal" moment this reset exists for), never on
  // mount, where there is nothing to reset yet.
  const prevShowAuthModalRef = useRef(showAuthModal);
  useEffect(() => {
    const wasOpen = prevShowAuthModalRef.current;
    prevShowAuthModalRef.current = showAuthModal;
    if (showAuthModal || !wasOpen) return;
    setAuthMode('signin');
    setEmail('');
    setPassword('');
    setConfirmPassword('');
    setAuthError(null);
    setResetLinkSent(false);
    setGeneratedPasswordVisible(false);
    setCopiedGeneratedPassword(false);
    setShowPostSignupMfaStep(false);
    setMfaJustEnabled(false);
    setLegalAgreed(false);
  }, [showAuthModal]);

  // The shared "finish onboarding" action, reached either by skipping the
  // optional 2FA step or by completing it - both land in the app the same
  // way, since 2FA here is genuinely optional, not a gate.
  const finishOnboarding = () => {
    setShowAuthModal(false);
    onStart();
  };

  // Client-side only, via the Web Crypto API (see password-strength.ts) -
  // never sent anywhere before the person has seen and accepted it, and
  // never stored or logged.
  const handleGeneratePassword = () => {
    const generated = generateStrongPassword();
    setPassword(generated);
    setConfirmPassword(generated);
    setGeneratedPasswordVisible(true);
    setCopiedGeneratedPassword(false);
    setAuthError(null);
  };

  const handleCopyGeneratedPassword = async () => {
    try {
      await navigator.clipboard.writeText(password);
      setCopiedGeneratedPassword(true);
      setTimeout(() => setCopiedGeneratedPassword(false), 2000);
    } catch {
      // Clipboard access can fail (permissions, insecure context) - the
      // password is already visible in the field either way, so this is
      // a silent no-op rather than an alarming error for a cosmetic miss.
    }
  };

  const handleStartRequest = () => {
    if (user) {
      onStart();
    } else {
      setShowAuthModal(true);
    }
  };

  // Records that this account just agreed to the current Terms/Privacy
  // versions - called the moment a genuine new account is confirmed
  // (isNewUser, or a fresh email signup), never on a returning sign-in.
  // Best-effort, same reasoning as the verify-email/send call below:
  // never block getting into the app on this succeeding.
  const recordLegalAcceptance = () => {
    secureApiFetch('/api/legal/documents/TERMS/accept', { method: 'POST' }).catch(() => {});
    secureApiFetch('/api/legal/documents/PRIVACY/accept', { method: 'POST' }).catch(() => {});
  };

  const handleGoogleSignIn = async () => {
    try {
      setSigningInProvider('google');
      const { isNewUser } = await signIn();
      if (isNewUser) {
        recordLegalAcceptance();
        setShowPostSignupMfaStep(true);
      } else {
        finishOnboarding();
      }
    } catch (e) {
      console.error("Sign up failed:", e);
    } finally {
      setSigningInProvider(null);
    }
  };

  const handleMicrosoftSignIn = async () => {
    try {
      setSigningInProvider('microsoft');
      const { isNewUser } = await signInWithMicrosoft();
      if (isNewUser) {
        recordLegalAcceptance();
        setShowPostSignupMfaStep(true);
      } else {
        finishOnboarding();
      }
    } catch (e) {
      console.error("Sign up failed:", e);
    } finally {
      setSigningInProvider(null);
    }
  };

  const handleFacebookSignIn = async () => {
    try {
      setSigningInProvider('facebook');
      const { isNewUser } = await signInWithFacebook();
      if (isNewUser) {
        recordLegalAcceptance();
        setShowPostSignupMfaStep(true);
      } else {
        finishOnboarding();
      }
    } catch (e) {
      console.error("Sign up failed:", e);
    } finally {
      setSigningInProvider(null);
    }
  };

  const handleEmailAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    if (authMode === 'signup' && password !== confirmPassword) {
      setAuthError("Those passwords don't match.");
      return;
    }
    // Strength is only enforced when creating a new password - re-checking
    // it at sign-in would reject legitimate existing users whose password
    // predates this stricter policy. Firebase's own sign-in call is the
    // correct arbiter of whether an existing password is right or wrong.
    if (authMode === 'signup') {
      const strength = checkPasswordStrength(password);
      if (!strength.valid) {
        setAuthError(`Password needs: ${strength.reasons.join('; ')}.`);
        return;
      }
    }
    try {
      setEmailAuthSubmitting(true);
      if (authMode === 'signup') {
        await signUpWithEmail(email, password);
        // Best-effort - never block getting into the app on this succeeding.
        secureApiFetch('/api/auth/verify-email/send', { method: 'POST' }).catch(() => {});
        // Email signup is always a genuine new account (no isNewUser check
        // needed, unlike the social providers) - always offer the
        // optional 2FA step here, same as after a fresh social signup.
        recordLegalAcceptance();
        setShowPostSignupMfaStep(true);
      } else {
        await signInWithEmail(email, password);
        finishOnboarding();
      }
    } catch (err: any) {
      setAuthError(err?.message || 'Something went wrong. Please try again.');
    } finally {
      setEmailAuthSubmitting(false);
    }
  };

  const handleForgotPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    try {
      setEmailAuthSubmitting(true);
      await sendPasswordReset(email);
      setResetLinkSent(true);
    } catch (err: any) {
      setAuthError(err?.message || 'Something went wrong. Please try again.');
    } finally {
      setEmailAuthSubmitting(false);
    }
  };

  return (
    <div className="ember-shell ember-sanctuary min-h-screen bg-background selection:bg-primary/20 selection:text-[#9a3412] dark:selection:text-primary relative overflow-hidden text-text-main">
      {/* Navigation */}
      <nav aria-label="Primary navigation" className="ember-nav fixed top-0 w-full z-50 px-3 sm:px-8 py-3 sm:py-5 flex justify-between items-center border-b">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <BlazeBrandLogo className="w-12 h-12 sm:w-14 sm:h-14" />
          <div className="hidden sm:flex flex-col">
            <span className="ember-wordmark text-base sm:text-xl text-text-main">Blaze Break</span>
            <span className="ember-tagline hidden sm:block mt-1">Rethink · Reflect · Rejuvenate</span>
          </div>
        </div>
        <div className="flex items-center gap-2 sm:gap-4 shrink-0">
          {setThemeMode && (
            <AppearanceMenu mode={themeMode ?? 'system'} onChange={setThemeMode} compact />
          )}
          <button
            onClick={onOpenTrustCentre}
            className="text-xs sm:text-xs uppercase tracking-widest font-bold text-text-muted hover:text-text-main transition-colors hidden sm:flex items-center gap-2"
          >
            <ShieldCheck className="w-4 h-4" /> Trust Centre
          </button>
          <button
            onClick={handleStartRequest}
            className="text-sm text-text-main underline underline-offset-4 px-3 py-3"
          >
            {user ? 'Enter Suite' : 'Access Account'}
          </button>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="ember-hero ember-landing-hero pt-36 sm:pt-44 pb-16 sm:pb-20 px-5 sm:px-10 lg:px-16 max-w-7xl mx-auto flex flex-col items-center text-center md:text-left relative z-10">
        <div className="ember-hero-content space-y-6">
          <h1 className="ember-title ember-hero-title text-text-main max-w-5xl">
            High performance <br className="hidden sm:block" />
            without the <em>burnout.</em>
          </h1>
          <p className="ember-hero-subtitle max-w-2xl mx-auto md:mx-0 text-base sm:text-lg font-medium">
            Take a moment to check in with yourself. Your Burnout Fingerprint starts with a short self-assessment.
          </p>
          <div className="ember-hero-actions pt-3 flex flex-col sm:flex-row items-stretch sm:items-center justify-center md:justify-start gap-3 sm:gap-4">
            <button
              onClick={handleStartRequest}
              className="btn-primary ember-orbit w-full sm:w-auto justify-center px-6 sm:px-10 py-4 sm:py-5 rounded-xl font-semibold text-base flex items-center gap-3 sm:gap-4 group"
            >
              Get Burnout Fingerprint
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </button>
            <button
              onClick={onViewDemo}
              className="w-full sm:w-auto justify-center px-4 py-4 text-sm font-medium underline underline-offset-4 flex items-center gap-2 group"
            >
              See a live demo
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </button>
          </div>
          <div className="ember-feature-band rounded-2xl mt-8 text-left overflow-hidden">
            <div className="p-3 sm:p-4">
              <BatteryLow className="h-5 w-5 mb-2" aria-hidden="true" />
              <strong>Reset</strong><span>Recover your energy</span>
            </div>
            <div className="p-3 sm:p-4">
              <ShieldCheck className="h-5 w-5 mb-2" aria-hidden="true" />
              <strong>Refocus</strong><span>Find clarity</span>
            </div>
            <div className="p-3 sm:p-4">
              <TrendingUp className="h-5 w-5 mb-2" aria-hidden="true" />
              <strong>Perform</strong><span>Work sustainably</span>
            </div>
            <div className="p-3 sm:p-4">
              <Users className="h-5 w-5 mb-2" aria-hidden="true" />
              <strong>Rejuvenate</strong><span>Make room to recover</span>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 border-t border-border text-center opacity-70">
        <div className="flex items-center justify-center gap-3 mb-4">
          <BlazeBrandLogo className="w-8 h-8" decorative />
          <p className="font-bold text-sm tracking-tight text-text-main">Blaze Break</p>
        </div>
        <p className="text-[11px] uppercase tracking-[0.3em] font-black text-text-muted">
          Blaze Break — Burnout Recovery, Built Right
        </p>
        <p className="text-[10px] tracking-[0.2em] font-medium text-text-muted mt-3">
          Created by Tourae Martin
        </p>
        <div className="flex items-center justify-center gap-4 mt-6 text-[10px] font-bold uppercase tracking-widest text-text-muted">
          <button type="button" onClick={() => setLegalDocOpen('TERMS')} className="hover:text-text-main transition-colors">Terms</button>
          <button type="button" onClick={() => setLegalDocOpen('PRIVACY')} className="hover:text-text-main transition-colors">Privacy</button>
          <button type="button" onClick={() => setLegalDocOpen('REFUND')} className="hover:text-text-main transition-colors">Refunds</button>
          <button type="button" onClick={() => setLegalDocOpen('COOKIE_NOTICE')} className="hover:text-text-main transition-colors">Cookies</button>
          <button type="button" onClick={onOpenTrustCentre} className="hover:text-text-main transition-colors">Security</button>
        </div>
      </footer>

      {/* Sleek Authentication Modal Overlay */}
      <AnimatePresence>
        {showAuthModal && (
          // z-[100], not z-50: App.tsx's persistent "Need support now?"
          // crisis button on this same landing flow is also z-50 and is
          // declared later in the DOM (outside/after this component), so
          // equal z-index let it paint on top of this modal, overlapping
          // its content on narrow viewports. z-[100] matches the z-index
          // every other modal in this codebase already uses (ConfirmDialog,
          // CrisisSupport's own modal, NovaFeedbackModal, SettingsModal,
          // etc.) specifically to stay above that button.
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            {/* Backdrop */}
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowAuthModal(false)}
              className="absolute inset-0 bg-black/40 backdrop-blur-md"
            />

            {/* Modal Card */}
            <motion.div
              ref={authDialogRef as any}
              initial={{ scale: 0.95, y: 15, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.95, y: 15, opacity: 0 }}
              transition={{ type: 'spring', damping: 25, stiffness: 350 }}
              role="dialog"
              aria-modal="true"
              aria-labelledby="auth-modal-title"
              tabIndex={-1}
              className="bg-surface border border-border rounded-xl p-8 max-w-md w-full shadow-lg relative z-10 flex flex-col space-y-6"
            >
              <button 
                onClick={() => setShowAuthModal(false)}
                className="absolute top-6 right-6 text-text-muted hover:text-text-main transition-colors text-xs font-bold uppercase tracking-widest flex items-center gap-1"
              >
                <ArrowLeft className="w-4 h-4" /> Back
              </button>

              <div className="text-left pt-4">
                <div className="w-12 h-12 bg-primary/10 rounded-2xl flex items-center justify-center mb-4">
                  <BlazeBrandLogo className="w-6 h-6" decorative />
                </div>
                <h3 id="auth-modal-title" className="text-2xl font-bold text-text-main tracking-tight">
                  {showPostSignupMfaStep ? 'Secure your account' : authMode === 'forgot' ? 'Reset your password' : authMode === 'signup' ? 'Create your account' : 'Access Account'}
                </h3>
                {showPostSignupMfaStep ? (
                  <p className="text-text-muted text-sm mt-1 leading-relaxed">
                    Your account is ready. Adding two-factor authentication now is entirely optional - skip it and turn it on anytime later from Settings.
                  </p>
                ) : authMode !== 'forgot' && (
                  <p className="text-text-muted text-sm mt-1 leading-relaxed">
                    Register or login. Blaze Break is in controlled early access. Features may evolve. Data tools are for coaching support, not medical diagnosis. Optional Nova AI is a recovery coach, not a therapist.
                  </p>
                )}
              </div>

              {showPostSignupMfaStep ? (
                <div className="space-y-4 pt-2">
                  <Suspense fallback={null}>
                    <SecuritySettingsView onEnabled={() => setMfaJustEnabled(true)} />
                  </Suspense>
                  <div className="pt-2 border-t border-border">
                    {mfaJustEnabled ? (
                      <button
                        type="button"
                        onClick={finishOnboarding}
                        className="w-full flex items-center justify-center gap-3 bg-primary text-primary-foreground font-bold text-xs uppercase tracking-widest py-4 rounded-2xl hover:scale-[1.02] active:scale-95 transition-all shadow-lg shadow-primary/15"
                      >
                        Continue to Blaze Break
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={finishOnboarding}
                        className="w-full text-center text-xs font-bold text-text-muted hover:text-text-main transition-colors py-2"
                      >
                        Skip for now
                      </button>
                    )}
                  </div>
                </div>
              ) : authMode === 'forgot' ? (
                resetLinkSent ? (
                  <div className="space-y-4 pt-2">
                    <p className="text-sm text-text-main leading-relaxed">
                      If <span className="font-bold">{email}</span> has a Blaze Break account, we've sent a link to reset the password. Check the inbox (and spam folder) for an email from Blaze Break Support.
                    </p>
                    <button
                      type="button"
                      onClick={() => setAuthMode('signin')}
                      className="w-full flex items-center justify-center gap-2 text-xs font-bold uppercase tracking-widest text-text-muted hover:text-text-main transition-colors py-2"
                    >
                      <ArrowLeft className="w-3.5 h-3.5" /> Back to sign in
                    </button>
                  </div>
                ) : (
                  <form onSubmit={handleForgotPasswordSubmit} className="space-y-3 pt-2">
                    <p className="text-text-muted text-sm leading-relaxed -mt-2">
                      Enter the email on your account and we'll send a link to reset your password.
                    </p>
                    <div className="relative">
                      <Mail className="w-4 h-4 text-text-muted absolute left-4 top-1/2 -translate-y-1/2" aria-hidden="true" />
                      <input
                        type="email"
                        required
                        autoComplete="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="Email address"
                        className="w-full bg-background border border-border rounded-xl pl-11 pr-4 py-3.5 text-sm text-text-main placeholder:text-text-muted focus:outline-none focus:border-primary/50 transition-colors"
                      />
                    </div>
                    {authError && (
                      <p role="alert" className="text-xs text-destructive leading-relaxed">{authError}</p>
                    )}
                    <button
                      type="submit"
                      disabled={emailAuthSubmitting}
                      className="w-full flex items-center justify-center gap-3 bg-text-main text-surface font-bold text-xs uppercase tracking-widest py-4.5 rounded-2xl hover:scale-[1.02] active:scale-95 transition-all shadow-lg shadow-text-main/15 disabled:opacity-50"
                    >
                      {emailAuthSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                      <span role="status" aria-live="polite">{emailAuthSubmitting ? 'Sending…' : 'Send reset link'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => { setAuthError(null); setAuthMode('signin'); }}
                      className="w-full flex items-center justify-center gap-2 text-xs font-bold uppercase tracking-widest text-text-muted hover:text-text-main transition-colors py-2"
                    >
                      <ArrowLeft className="w-3.5 h-3.5" /> Back to sign in
                    </button>
                  </form>
                )
              ) : (
                <>
                  {/* Required, not just informational - previously this was
                      a passive line of text below the buttons ("By
                      continuing, you agree to...") that never actually
                      stopped anyone continuing without reading or agreeing
                      to it. Placed above every sign-in/sign-up option (not
                      just the email form) so it gates all of them the same
                      way, and reset to unticked every time the modal opens
                      (see the effect above) so it can never carry over. */}
                  <label className="flex items-start gap-3 p-3 rounded-xl border border-border bg-background cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={legalAgreed}
                      onChange={(e) => setLegalAgreed(e.target.checked)}
                      className="mt-0.5 w-4 h-4 shrink-0 accent-primary cursor-pointer"
                    />
                    <span className="text-xs text-text-muted leading-normal">
                      I agree to the Blaze Break{' '}
                      <button type="button" onClick={(e) => { e.preventDefault(); setLegalDocOpen('TERMS'); }} className="underline hover:text-text-main transition-colors">
                        Terms &amp; Conditions
                      </button>
                      {' '}and acknowledge the{' '}
                      <button type="button" onClick={(e) => { e.preventDefault(); setLegalDocOpen('PRIVACY'); }} className="underline hover:text-text-main transition-colors">
                        Privacy Notice
                      </button>
                      .
                    </span>
                  </label>

                  <div className="space-y-3 pt-2">
                    <button
                      onClick={handleGoogleSignIn}
                      disabled={signingInProvider !== null || !legalAgreed}
                      className="w-full flex items-center justify-center gap-3 bg-text-main text-surface font-bold text-xs uppercase tracking-widest py-4.5 rounded-2xl hover:scale-[1.02] active:scale-95 transition-all shadow-lg shadow-text-main/15 disabled:opacity-50"
                    >
                      {signingInProvider === 'google' ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <LogIn className="w-4 h-4" />
                      )}
                      <span role="status" aria-live="polite">{signingInProvider === 'google' ? 'Initialising...' : 'Continue with Google'}</span>
                    </button>
                    <button
                      onClick={handleMicrosoftSignIn}
                      disabled={signingInProvider !== null || !legalAgreed}
                      className="w-full flex items-center justify-center gap-3 bg-surface dark:bg-card border border-border text-text-main font-bold text-xs uppercase tracking-widest py-4.5 rounded-2xl hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50"
                    >
                      {signingInProvider === 'microsoft' ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <LogIn className="w-4 h-4" />
                      )}
                      <span role="status" aria-live="polite">{signingInProvider === 'microsoft' ? 'Initialising...' : 'Continue with Microsoft'}</span>
                    </button>
                    <button
                      onClick={handleFacebookSignIn}
                      disabled={signingInProvider !== null || !legalAgreed}
                      className="w-full flex items-center justify-center gap-3 bg-surface dark:bg-card border border-border text-text-main font-bold text-xs uppercase tracking-widest py-4.5 rounded-2xl hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50"
                    >
                      {signingInProvider === 'facebook' ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <LogIn className="w-4 h-4" />
                      )}
                      <span role="status" aria-live="polite">{signingInProvider === 'facebook' ? 'Initialising...' : 'Continue with Facebook'}</span>
                    </button>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="flex-1 h-px bg-border" />
                    <span className="text-[10px] font-black uppercase tracking-widest text-text-muted">or with email</span>
                    <div className="flex-1 h-px bg-border" />
                  </div>

                  <form onSubmit={handleEmailAuthSubmit} className="space-y-3">
                    <div className="relative">
                      <Mail className="w-4 h-4 text-text-muted absolute left-4 top-1/2 -translate-y-1/2" aria-hidden="true" />
                      <input
                        type="email"
                        required
                        autoComplete="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="Email address"
                        className="w-full bg-background border border-border rounded-xl pl-11 pr-4 py-3.5 text-sm text-text-main placeholder:text-text-muted focus:outline-none focus:border-primary/50 transition-colors"
                      />
                    </div>
                    <div className="relative">
                      <Lock className="w-4 h-4 text-text-muted absolute left-4 top-1/2 -translate-y-1/2" aria-hidden="true" />
                      <input
                        type={generatedPasswordVisible ? 'text' : 'password'}
                        required
                        autoComplete={authMode === 'signup' ? 'new-password' : 'current-password'}
                        minLength={authMode === 'signup' ? PASSWORD_MIN_LENGTH : undefined}
                        value={password}
                        onChange={(e) => { setPassword(e.target.value); setGeneratedPasswordVisible(false); }}
                        placeholder="Password"
                        className={`w-full bg-background border border-border rounded-xl pl-11 ${generatedPasswordVisible ? 'pr-11' : 'pr-4'} py-3.5 text-sm text-text-main placeholder:text-text-muted focus:outline-none focus:border-primary/50 transition-colors`}
                      />
                      {generatedPasswordVisible && (
                        <button
                          type="button"
                          onClick={handleCopyGeneratedPassword}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-main transition-colors p-1"
                          aria-label={copiedGeneratedPassword ? 'Copied' : 'Copy generated password'}
                          title={copiedGeneratedPassword ? 'Copied' : 'Copy password'}
                        >
                          {copiedGeneratedPassword ? <Check className="w-4 h-4 text-success dark:text-[#4ade80]" aria-hidden="true" /> : <Copy className="w-4 h-4" aria-hidden="true" />}
                        </button>
                      )}
                    </div>
                    {authMode === 'signup' && (
                      <div className="flex items-center justify-between -mt-1 px-1">
                        <p className="text-[10px] text-text-muted leading-relaxed">{PASSWORD_REQUIREMENT_TEXT}</p>
                        <button
                          type="button"
                          onClick={handleGeneratePassword}
                          className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-primary hover:text-primary/80 transition-colors whitespace-nowrap ml-3"
                        >
                          <Wand2 className="w-3 h-3" aria-hidden="true" /> Generate
                        </button>
                      </div>
                    )}
                    {authMode === 'signup' && (
                      <div className="relative">
                        <Lock className="w-4 h-4 text-text-muted absolute left-4 top-1/2 -translate-y-1/2" aria-hidden="true" />
                        <input
                          type={generatedPasswordVisible ? 'text' : 'password'}
                          required
                          autoComplete="new-password"
                          minLength={PASSWORD_MIN_LENGTH}
                          value={confirmPassword}
                          onChange={(e) => { setConfirmPassword(e.target.value); setGeneratedPasswordVisible(false); }}
                          placeholder="Confirm password"
                          className="w-full bg-background border border-border rounded-xl pl-11 pr-4 py-3.5 text-sm text-text-main placeholder:text-text-muted focus:outline-none focus:border-primary/50 transition-colors"
                        />
                      </div>
                    )}
                    {authMode === 'signin' && (
                      <div className="text-right -mt-1">
                        <button
                          type="button"
                          onClick={() => { setAuthError(null); setAuthMode('forgot'); }}
                          className="text-xs font-bold text-text-muted hover:text-text-main transition-colors"
                        >
                          Forgot password?
                        </button>
                      </div>
                    )}
                    {authError && (
                      <p role="alert" className="text-xs text-destructive leading-relaxed">{authError}</p>
                    )}
                    <button
                      type="submit"
                      disabled={emailAuthSubmitting || !legalAgreed}
                      className="w-full flex items-center justify-center gap-3 bg-primary text-primary-foreground font-bold text-xs uppercase tracking-widest py-4.5 rounded-2xl hover:scale-[1.02] active:scale-95 transition-all shadow-lg shadow-primary/15 disabled:opacity-50"
                    >
                      {emailAuthSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                      <span role="status" aria-live="polite">
                        {emailAuthSubmitting ? 'Please wait…' : authMode === 'signup' ? 'Create account' : 'Sign in'}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => { setAuthError(null); setAuthMode(authMode === 'signup' ? 'signin' : 'signup'); }}
                      className="w-full text-center text-xs font-bold text-text-muted hover:text-text-main transition-colors py-1"
                    >
                      {authMode === 'signup' ? 'Already have an account? Sign in' : "Don't have an account? Sign up"}
                    </button>
                  </form>

                  <p className="text-xs text-text-muted text-center leading-normal">
                    Guardian, SMS/WhatsApp, and payments are currently disabled. Do not use for urgent or emergency support.
                  </p>
                </>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      {legalDocOpen && (
        <Suspense fallback={null}>
          <LegalDocumentModal docType={legalDocOpen} onClose={() => setLegalDocOpen(null)} />
        </Suspense>
      )}
    </div>
  );
};
