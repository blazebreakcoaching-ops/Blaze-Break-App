import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Star, MessageSquare } from 'lucide-react';
import { cn } from '../lib/utils';
import { useFocusTrap } from '../lib/useFocusTrap';
import { auth, db } from '../lib/firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';

export const NovaFeedbackModal = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [rating, setRating] = useState<number>(0);
  const [feedbackText, setFeedbackText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const modalRef = useFocusTrap(isOpen);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') handleClose(); };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen]);

  useEffect(() => {
    // Check if the modal should be shown
    const lastShownStr = localStorage.getItem('nova_feedback_last_shown');
    const now = Date.now();
    const oneWeek = 7 * 24 * 60 * 60 * 1000;

    let shouldShow = false;
    if (!lastShownStr) {
      shouldShow = true;
    } else {
      const lastShown = parseInt(lastShownStr, 10);
      if (!isNaN(lastShown) && now - lastShown > oneWeek) {
        shouldShow = true;
      }
    }

    if (shouldShow) {
      // Small delay to not interrupt the user immediately
      const timer = setTimeout(() => {
        setIsOpen(true);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, []);

  const handleClose = () => {
    setIsOpen(false);
    localStorage.setItem('nova_feedback_last_shown', Date.now().toString());
  };

  const handleSubmit = async () => {
    if (rating === 0) return;
    
    setIsSubmitting(true);
    try {
      if (auth.currentUser) {
        await addDoc(collection(db, 'users', auth.currentUser.uid, 'nova_feedback'), {
          rating,
          feedbackText: feedbackText.trim() || null,
          createdAt: serverTimestamp(),
        });
      } else {
        console.log("Feedback not saved: no signed-in user to associate it with.", { rating, feedbackText });
      }
      setIsSubmitted(true);
      setTimeout(() => {
        handleClose();
      }, 2000);
    } catch (err) {
      console.error("Failed to submit feedback", err);
      // Fail gracefully and just close
      handleClose();
    } finally {
      setIsSubmitting(false);
    }
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
            aria-labelledby="nova-feedback-title"
            tabIndex={-1}
            className="bg-card w-full max-w-md rounded-2xl shadow-xl border border-border relative z-10 overflow-hidden"
          >
            {isSubmitted ? (
              <div className="p-8 space-y-6 text-center">
                <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto text-primary">
                  <Star className="w-8 h-8 fill-primary" />
                </div>
                <div className="space-y-2">
                  <h3 id="nova-feedback-title" className="text-xl font-bold font-display text-text-main">Thank You</h3>
                  <p className="text-text-muted text-sm leading-relaxed">
                    Nova uses your feedback to get better at supporting you over time. Thanks for taking the time to share it.
                  </p>
                </div>
              </div>
            ) : (
              <div className="p-6 md:p-8 space-y-6">
                <button
                  onClick={handleClose}
                  aria-label="Close feedback dialog"
                  className="absolute top-4 right-4 p-2 rounded-xl text-text-muted hover:text-text-main hover:bg-surface dark:hover:bg-white/5 transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                    <MessageSquare className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 id="nova-feedback-title" className="text-lg font-bold text-text-main">Nova Coach Pulse</h3>
                    <p className="text-xs uppercase font-black tracking-widest text-text-muted">Weekly Calibration</p>
                  </div>
                </div>

                <div className="space-y-4">
                  <p className="text-sm text-text-main font-medium">How helpful has Nova been with setting boundaries and managing your limits this week?</p>
                  <div className="flex justify-between items-center bg-surface dark:bg-card border border-border p-3 rounded-xl shadow-inner">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        key={star}
                        onClick={() => setRating(star)}
                        aria-label={`Rate ${star} star${star === 1 ? '' : 's'}`}
                        aria-pressed={rating >= star}
                        className={cn(
                          "p-2 rounded-lg transition-all",
                          rating >= star ? "text-[#9a3412] dark:text-warning" : "text-text-muted hover:text-warning/50"
                        )}
                      >
                        <Star className={cn("w-6 h-6", rating >= star && "fill-current")} />
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-3">
                  <label className="text-xs font-black text-text-main uppercase tracking-widest block">Optional Feedback</label>
                  <textarea
                    value={feedbackText}
                    onChange={(e) => setFeedbackText(e.target.value)}
                    placeholder="Tell Nova what worked well or what needs adjustment..."
                    className="w-full bg-surface border border-border rounded-xl px-4 py-3 text-sm text-text-main placeholder:text-text-muted focus:outline-none focus:border-primary transition-colors min-h-[100px] resize-none"
                  />
                </div>

                <button
                  onClick={handleSubmit}
                  disabled={rating === 0 || isSubmitting}
                  className="w-full btn-primary py-3 rounded-xl flex items-center justify-center gap-2 font-bold cursor-pointer transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? "Calibrating..." : "Submit Pulse"}
                </button>
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
