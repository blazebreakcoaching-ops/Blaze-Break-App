import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Sparkles, ArrowRight, ShieldCheck, BatteryLow, MessageSquareText, LogIn, ArrowLeft, Loader2 } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { useFocusTrap } from '../lib/useFocusTrap';

interface LandingPageProps {
  onStart: () => void;
  onOpenTrustCentre: () => void;
}

export const LandingPage = ({ onStart, onOpenTrustCentre }: LandingPageProps) => {
  const { user, signIn } = useAuth();
  const [showAuthModal, setShowAuthModal] = useState(false);
  const authDialogRef = useFocusTrap(showAuthModal);

  useEffect(() => {
    if (!showAuthModal) return;
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') setShowAuthModal(false); };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [showAuthModal]);
  const [signingIn, setSigningIn] = useState(false);

  const handleStartRequest = () => {
    if (user) {
      onStart();
    } else {
      setShowAuthModal(true);
    }
  };

  const handleGoogleSignIn = async () => {
    try {
      setSigningIn(true);
      await signIn();
      setShowAuthModal(false);
      onStart();
    } catch (e) {
      console.error("Sign up failed:", e);
    } finally {
      setSigningIn(false);
    }
  };

  return (
    <div className="min-h-screen bg-background selection:bg-primary/20 selection:text-[#9a3412] dark:selection:text-primary relative overflow-hidden text-text-main">
      {/* Premium Glow Aura Backdrops */}
      <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-primary/5 rounded-full blur-[140px] pointer-events-none" />
      <div className="absolute bottom-10 right-1/4 w-[600px] h-[600px] bg-teal-500/3 rounded-full blur-[160px] pointer-events-none" />
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#161f30_1px,transparent_1px),linear-gradient(to_bottom,#161f30_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)] opacity-25" />

      {/* Navigation */}
      <nav className="fixed top-0 w-full z-50 px-8 py-6 flex justify-between items-center backdrop-blur-xl bg-background/70 border-b border-white/[0.04]">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 flex items-center justify-center shadow-xl shadow-primary/20">
            <img src="/brand/flame-mark-light.png" alt="Blaze Break" className="w-10 h-10 dark:hidden" />
            <img src="/brand/flame-mark-dark.png" alt="Blaze Break" className="w-10 h-10 hidden dark:block" />
          </div>
          <div className="flex flex-col">
            <h1 className="font-serif font-black text-lg tracking-tight text-text-main leading-none">Blaze Break</h1>
            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-[#9a3412] dark:text-primary mt-1">Recovery Companion</span>
          </div>
        </div>
        <div className="flex items-center gap-4">
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
            Stop optimising your exhaustion. Blaze Break decodes your physiological and mental burnout fingerprint to rebuild elite-tier nervous recovery into your hyper-scale workload.
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
            Time management is a delusion; energy capacity is everything. Map your schedule to a custom cognitive credit budget that prevents midday crashes before they trigger cortisol spikes.
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
          <h3 className="text-lg font-bold text-text-main tracking-wide">Autonomous Guardian System</h3>
          <p className="text-text-muted text-xs leading-relaxed">
            A pre-set escalation network for high-stakes moments. Add trusted contacts once, then reach them in one tap when you need real support — no automatic monitoring, no biometric tracking, just a fast, private way to ask for help.
          </p>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-16 border-t border-white/[0.03] mt-20 text-center opacity-70">
        <div className="flex items-center justify-center gap-3 mb-4">
          <div className="w-8 h-8 bg-accent/20 rounded-xl flex items-center justify-center text-[#9a3412] dark:text-accent">
            <Sparkles className="w-4 h-4" />
          </div>
          <p className="font-bold text-sm tracking-tight text-text-main">Blaze Break</p>
        </div>
        <p className="text-[11px] uppercase tracking-[0.3em] font-black text-text-muted">
          Blaze Break — Burnout Recovery, Built Right
        </p>
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
                <div className="w-12 h-12 bg-primary/10 rounded-2xl flex items-center justify-center text-primary mb-4">
                  <Sparkles className="w-6 h-6" />
                </div>
                <h3 id="auth-modal-title" className="text-2xl font-bold text-text-main tracking-tight">Access Account</h3>
                <p className="text-text-muted text-sm mt-1 leading-relaxed">
                  Register or login. Blaze Break is in controlled early access. Features may evolve. Data tools are for coaching support, not medical diagnosis. Optional Nova AI is a recovery coach, not a therapist.
                </p>
              </div>

              <div className="space-y-3 pt-2">
                <button
                  onClick={handleGoogleSignIn}
                  disabled={signingIn}
                  className="w-full flex items-center justify-center gap-3 bg-text-main text-surface font-bold text-xs uppercase tracking-widest py-4.5 rounded-2xl hover:scale-[1.02] active:scale-95 transition-all shadow-lg shadow-text-main/15 disabled:opacity-50"
                >
                  {signingIn ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <LogIn className="w-4 h-4" />
                  )}
                  <span role="status" aria-live="polite">{signingIn ? 'Initializing...' : 'Continue with Google'}</span>
                </button>
              </div>

              <p className="text-xs text-text-muted text-center leading-normal">
                Guardian, SMS/WhatsApp, and payments are currently disabled. Do not use for urgent or emergency support.
              </p>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
