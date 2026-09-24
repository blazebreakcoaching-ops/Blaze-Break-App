import { useState, useEffect, lazy, Suspense } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ArrowRight, ShieldCheck, BatteryLow, MessageSquareText, LogIn, ArrowLeft, Loader2, Mail, Lock, Sun, Moon, Briefcase, TrendingUp, Users, Wand2, Copy, Check } from 'lucide-react';
import { useAuth } from '../lib/auth';
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
  onOpenTrustCentre: () => void;
  // Optional because App.tsx's dark mode state already defaults every
  // visitor to their system preference before this component ever
  // mounts (see its useState initializer) - these props exist purely so
  // a visitor can *see* and *override* that default from the very first
  // screen they land on, matching the toggle the inner app already has.
  // Undefined props degrade gracefully: the toggle button simply doesn't
  // render rather than throwing, so this stays optional at the type
  // level even though App.tsx always passes both in practice.
  darkMode?: boolean;
  setDarkMode?: (d: boolean) => void;
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

export const LandingPage = ({ onStart, onOpenTrustCentre, darkMode, setDarkMode, initialAuthModalOpen, onInitialAuthModalOpened }: LandingPageProps) => {
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

  useEffect(() => {
    if (showAuthModal) return;
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
    <div className="min-h-screen bg-background selection:bg-primary/20 selection:text-[#9a3412] dark:selection:text-primary relative overflow-hidden text-text-main">
      {/* Premium Glow Aura Backdrops */}
      <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-primary/5 rounded-full blur-[140px] pointer-events-none" />
      <div className="absolute bottom-10 right-1/4 w-[600px] h-[600px] bg-teal-500/3 rounded-full blur-[160px] pointer-events-none" />
      {/* iOS Safari/Chrome (both WebKit) need -webkit-mask-image explicitly -
          without it, WebKit ignores the mask entirely and this faint grid
          pattern renders as a solid dark block over the hero heading
          instead of fading out. Set via inline style rather than another
          Tailwind arbitrary-property class so both the standard and
          -webkit- prefixed properties are guaranteed to land, regardless
          of what the build pipeline does or doesn't autoprefix. */}
      <div
        className="absolute inset-0 bg-[linear-gradient(to_right,#161f30_1px,transparent_1px),linear-gradient(to_bottom,#161f30_1px,transparent_1px)] bg-[size:4rem_4rem] opacity-25"
        style={{
          maskImage: 'radial-gradient(ellipse 60% 50% at 50% 0%, #000 70%, transparent 100%)',
          WebkitMaskImage: 'radial-gradient(ellipse 60% 50% at 50% 0%, #000 70%, transparent 100%)',
        }}
      />

      {/* Navigation */}
      <nav className="fixed top-0 w-full z-50 px-8 py-6 flex justify-between items-center backdrop-blur-xl bg-background/70 border-b border-white/[0.04]">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 flex items-center justify-center shadow-xl shadow-primary/20">
            <img src="/brand/flame-mark-light.png" alt="" className="w-10 h-10 dark:hidden" />
            <img src="/brand/flame-mark-dark.png" alt="" className="w-10 h-10 hidden dark:block" />
          </div>
          <div className="flex flex-col">
            <h1 className="font-serif font-black text-lg tracking-tight text-text-main leading-none">Blaze Break</h1>
            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-[#9a3412] dark:text-primary mt-1">Recovery Companion</span>
          </div>
        </div>
        <div className="flex items-center gap-4">
          {setDarkMode && (
            <button
              onClick={() => setDarkMode(!darkMode)}
              className="p-2.5 rounded-full bg-surface dark:bg-card border border-border hover:border-primary/50 text-text-muted hover:text-primary transition-all"
              title="Toggle theme"
              aria-label={darkMode ? "Switch to light theme" : "Switch to dark theme"}
            >
              {darkMode ? <Sun className="w-4 h-4" aria-hidden="true" /> : <Moon className="w-4 h-4" aria-hidden="true" />}
            </button>
          )}
          <button
            onClick={onOpenTrustCentre}
            className="text-xs sm:text-xs uppercase tracking-widest font-bold text-text-muted hover:text-text-main transition-colors hidden sm:flex items-center gap-2"
          >
            <ShieldCheck className="w-4 h-4" /> Trust Centre
          </button>
          <button
            onClick={handleStartRequest}
            className="btn-primary text-xs sm:text-xs uppercase tracking-widest px-6 sm:px-8 py-3 rounded-xl flex items-center gap-2"
          >
            {user ? 'Enter Suite' : 'Access Account'}
          </button>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="pt-44 pb-20 px-6 max-w-7xl mx-auto flex flex-col items-center text-center relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
          className="space-y-8"
        >
          <span className="inline-block px-4 py-1.5 bg-primary/10 border border-primary/20 text-[#9a3412] dark:text-primary rounded-full text-xs uppercase tracking-[0.2em] font-black">
            A Recovery Method for High Performers
          </span>
          <h2 className="text-5xl md:text-8xl font-light tracking-tight text-text-main leading-[1.05] max-w-5xl mx-auto">
            Scale ambition <br />
            without <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-accent italic font-serif font-medium">self-destruction.</span>
          </h2>
          <p className="max-w-2xl mx-auto text-base sm:text-lg text-text-muted font-light leading-relaxed">
            Stop optimising your exhaustion. Blaze Break maps your personal burnout fingerprint - from a self-assessment, not a biometric scan - to rebuild real recovery into your hyper-scale workload.
          </p>
          <div className="pt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
            <button 
              onClick={handleStartRequest}
              className="px-10 py-5 bg-white text-text-main hover:bg-surface dark:bg-card rounded-xl font-bold uppercase tracking-[0.2em] text-xs transition-all shadow-lg flex items-center gap-4 group"
            >
              Get Burnout Fingerprint 
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </button>
          </div>
        </motion.div>
      </section>

      {/* Value Prop Grid */}
      <section className="py-16 px-6 max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-8 relative z-10">
        <div className="bg-surface/60 border border-white/[0.04] p-8 rounded-2xl hover:border-accent/20 transition-all duration-500 space-y-4 shadow-lg">
          <div className="w-12 h-12 bg-accent/10 border border-accent/20 rounded-xl flex items-center justify-center text-[#9a3412] dark:text-accent">
            <BatteryLow className="w-6 h-6" />
          </div>
          <h3 className="text-lg font-bold text-text-main tracking-wide">Dynamic Energy Credits</h3>
          <p className="text-text-muted text-xs leading-relaxed">
            Time management is a delusion; energy capacity is everything. Map your schedule to a custom cognitive credit budget that helps you get ahead of midday crashes, not just react to them.
          </p>
        </div>
        <div className="bg-surface/60 border border-white/[0.04] p-8 rounded-2xl hover:border-accent/20 transition-all duration-500 space-y-4 shadow-lg">
          <div className="w-12 h-12 bg-accent/10 border border-accent/20 rounded-xl flex items-center justify-center text-[#9a3412] dark:text-accent">
            <MessageSquareText className="w-6 h-6" />
          </div>
          <h3 className="text-lg font-bold text-text-main tracking-wide">Nova Recovery Coach</h3>
          <p className="text-text-muted text-xs leading-relaxed">
            An analytical, slightly provocative AI coach designed for high performers. Nova identifies your over-responsibility loops and helps you simulate difficult boundary negotiations real-time.
          </p>
        </div>
        <div className="bg-surface/60 border border-white/[0.04] p-8 rounded-2xl hover:border-accent/20 transition-all duration-500 space-y-4 shadow-lg">
          <div className="w-12 h-12 bg-accent/10 border border-accent/20 rounded-xl flex items-center justify-center text-[#9a3412] dark:text-accent">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <h3 className="text-lg font-bold text-text-main tracking-wide">One-Tap Guardian Support</h3>
          <p className="text-text-muted text-xs leading-relaxed">
            A pre-set escalation network for high-stakes moments. Add trusted contacts once, then reach them in one tap when you need real support — no automatic monitoring, no biometric tracking, just a fast, private way to ask for help.
          </p>
        </div>
      </section>

      {/* Who it's for - names the audience explicitly rather than leaving
          "high performers" as the only signal, so a specific reader sees
          themselves described rather than a generic pitch. */}
      <section className="py-16 px-6 max-w-7xl mx-auto relative z-10">
        <div className="text-center max-w-2xl mx-auto mb-12 space-y-4">
          <span className="inline-block px-4 py-1.5 bg-accent/10 border border-accent/20 text-[#9a3412] dark:text-accent rounded-full text-xs uppercase tracking-[0.2em] font-black">
            Who this is built for
          </span>
          <h2 className="text-3xl sm:text-4xl font-light tracking-tight text-text-main">
            For people who can't just <span className="italic font-serif">"switch off."</span>
          </h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="bg-surface/60 border border-white/[0.04] p-8 rounded-2xl space-y-4 shadow-lg">
            <div className="w-12 h-12 bg-accent/10 border border-accent/20 rounded-xl flex items-center justify-center text-[#9a3412] dark:text-accent">
              <TrendingUp className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-text-main tracking-wide">Founders &amp; Operators</h3>
            <p className="text-text-muted text-xs leading-relaxed">
              Building something from nothing, on a clock that never really stops. You've normalised exhaustion because stopping feels like losing ground you can't get back.
            </p>
          </div>
          <div className="bg-surface/60 border border-white/[0.04] p-8 rounded-2xl space-y-4 shadow-lg">
            <div className="w-12 h-12 bg-accent/10 border border-accent/20 rounded-xl flex items-center justify-center text-[#9a3412] dark:text-accent">
              <Briefcase className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-text-main tracking-wide">Senior Leaders &amp; Executives</h3>
            <p className="text-text-muted text-xs leading-relaxed">
              Carrying decisions other people never see, in a role where "I'm running on empty" isn't really something you get to say out loud.
            </p>
          </div>
          <div className="bg-surface/60 border border-white/[0.04] p-8 rounded-2xl space-y-4 shadow-lg">
            <div className="w-12 h-12 bg-accent/10 border border-accent/20 rounded-xl flex items-center justify-center text-[#9a3412] dark:text-accent">
              <Users className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-text-main tracking-wide">High-Stakes Professionals</h3>
            <p className="text-text-muted text-xs leading-relaxed">
              Consultants, clinicians, partners, anyone whose output is tied directly to hours they don't actually have left to give.
            </p>
          </div>
        </div>
        <p className="text-center text-text-muted text-sm max-w-xl mx-auto mt-12 leading-relaxed">
          If your job has ever made someone say <span className="italic">"must be nice"</span> about a burnout you couldn't talk about - this was built with you specifically in mind, not as a generic wellness app repurposed for anyone.
        </p>
      </section>

      {/* Footer */}
      <footer className="py-16 border-t border-white/[0.03] mt-20 text-center opacity-70">
        <div className="flex items-center justify-center gap-3 mb-4">
          <img src="/brand/flame-mark-light.png" alt="" className="w-8 h-8 dark:hidden" />
          <img src="/brand/flame-mark-dark.png" alt="" className="w-8 h-8 hidden dark:block" />
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
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
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
                  <img src="/brand/flame-mark-light.png" alt="" className="w-6 h-6 dark:hidden" />
                  <img src="/brand/flame-mark-dark.png" alt="" className="w-6 h-6 hidden dark:block" />
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
                        className="w-full flex items-center justify-center gap-3 bg-primary text-white font-bold text-xs uppercase tracking-widest py-4 rounded-2xl hover:scale-[1.02] active:scale-95 transition-all shadow-lg shadow-primary/15"
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
                      className="w-full flex items-center justify-center gap-3 bg-primary text-white font-bold text-xs uppercase tracking-widest py-4.5 rounded-2xl hover:scale-[1.02] active:scale-95 transition-all shadow-lg shadow-primary/15 disabled:opacity-50"
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
