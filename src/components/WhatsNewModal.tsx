import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Sparkles, ArrowRight } from 'lucide-react';
import { useFocusTrap } from '../lib/useFocusTrap';

// Bump this string and replace CHANGELOG_ITEMS whenever new features ship
// that existing users wouldn't otherwise discover. Shows the current full
// list to anyone whose stored value doesn't match - not an accumulating
// diff/history - which is a real but acceptable limitation for a 3-item
// list with no content-authoring pattern elsewhere in the app to justify
// more infrastructure than that.
const CHANGELOG_VERSION = 'nova-wake-word-2026-09';

const CHANGELOG_ITEMS: { title: string; description: string }[] = [
  { title: 'Recovery Plan in the User Guide', description: 'See how your Recovery Plan works and where it comes from, right inside the guide.' },
  { title: 'Feedback & Testimonials in Settings', description: 'Share a rating, a bug, or a story about how Blaze Break has helped - right from Settings.' },
];

interface WhatsNewModalProps {
  // Undefined until the account's real user_stats/core doc has loaded (or
  // simply unset for an account that's never acknowledged anything yet) -
  // `loaded` distinguishes those two so the modal never judges "seen" off
  // a still-loading default.
  lastSeenVersion: string | undefined;
  loaded: boolean;
  onSeen: (version: string) => void;
}

// Only mounted by the caller when a user is signed in (App.tsx gates this
// on `user`, unlike NovaFeedbackModal which is guest-only) - so this
// component doesn't need its own auth check, just the version-gated
// trigger, mirroring NovaFeedbackModal.tsx's self-triggering shape with a
// hardcoded version string instead of a rolling time window.
//
// Acknowledgement is stored on the account (user_stats/core.
// lastSeenChangelogVersion, via the caller's existing autosave) rather
// than localStorage, so "seen" follows the person across devices instead
// of resetting every time they sign in somewhere new.
export const WhatsNewModal = ({ lastSeenVersion, loaded, onSeen }: WhatsNewModalProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const modalRef = useFocusTrap(isOpen);

  useEffect(() => {
    if (!loaded || lastSeenVersion === CHANGELOG_VERSION) return;
    // Small delay so this never interrupts someone the moment the app loads.
    const timer = setTimeout(() => setIsOpen(true), 3000);
    return () => clearTimeout(timer);
  }, [loaded, lastSeenVersion]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') handleClose(); };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen]);

  const handleClose = () => {
    setIsOpen(false);
    onSeen(CHANGELOG_VERSION);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-surface/80 backdrop-blur-sm"
            onClick={handleClose}
          />
          <motion.div
            ref={modalRef as any}
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="whats-new-title"
            tabIndex={-1}
            className="bg-card w-full max-w-md rounded-2xl shadow-xl border border-border relative z-10 overflow-hidden"
          >
            <div className="p-6 md:p-8 space-y-6">
              <button
                onClick={handleClose}
                aria-label="Close what's new dialog"
                className="absolute top-4 right-4 p-2 rounded-xl text-text-muted hover:text-text-main hover:bg-surface dark:hover:bg-white/5 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div>
                  <h3 id="whats-new-title" className="text-lg font-bold text-text-main">What's New</h3>
                  <p className="text-xs uppercase font-black tracking-widest text-text-muted">A few things worth knowing about</p>
                </div>
              </div>

              <ul className="space-y-4">
                {CHANGELOG_ITEMS.map((item) => (
                  <li key={item.title} className="flex items-start gap-3">
                    <ArrowRight className="w-4 h-4 text-primary shrink-0 mt-0.5" aria-hidden="true" />
                    <div>
                      <p className="text-sm font-bold text-text-main">{item.title}</p>
                      <p className="text-xs text-text-muted leading-relaxed mt-0.5">{item.description}</p>
                    </div>
                  </li>
                ))}
              </ul>

              <button
                onClick={handleClose}
                className="w-full btn-primary py-3 rounded-xl flex items-center justify-center gap-2 font-bold cursor-pointer transition-all"
              >
                Got it
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default WhatsNewModal;
