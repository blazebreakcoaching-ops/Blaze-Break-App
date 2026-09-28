import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, CheckCircle2 } from 'lucide-react';
import { auth } from '../lib/firebase';
import { db } from '../lib/firestore';
import { collection, addDoc } from 'firebase/firestore';
import { logGroundingEvent } from '../lib/grounding-analytics';

// Section 25's short mode for repetitive mental loops. Deliberately tiny -
// one branch point, no reflection questions of its own - the brief is
// explicit that the point is to interrupt more thinking, not invite more
// of it. Never tells the person to "just stop thinking"; instead it makes
// the actual choice visible: is there something to do, or is this asking
// for acceptance instead of more mental rehearsal.
type Step = 'ask' | 'action' | 'no_action';

export const GroundingOverthinkingInterrupt = ({ onClose }: { onClose: () => void }) => {
  const [step, setStep] = useState<Step>('ask');
  const [actionText, setActionText] = useState('');
  const [chosen, setChosen] = useState<string | null>(null);

  const finish = (choice: string) => {
    setChosen(choice);
    logGroundingEvent('grounding_session_completed', { lens: 'secular' });
    if (auth.currentUser && actionText.trim()) {
      addDoc(collection(db, 'users', auth.currentUser.uid, 'grounding_sessions'), {
        lens: 'secular', burdenIds: [], controllableItems: [], uncontrollableItems: [],
        sessionDepth: 'reset',
        reflectionAnswers: [{ question: 'Is there an action available right now?', answer: actionText.trim().slice(0, 400) }],
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      }).catch(() => {});
    }
  };

  return (
    <div className="fixed inset-0 z-[90] bg-background/95 backdrop-blur-sm flex items-start sm:items-center justify-center p-4 overflow-y-auto">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-lg bg-card border border-border/40 rounded-2xl p-8 space-y-6 my-8">
        <div className="flex items-center justify-between">
          <h3 className="text-xl font-display font-bold text-text-main">You've thought about this enough for now</h3>
          <button onClick={onClose} aria-label="Close" className="text-text-muted hover:text-text-main"><X className="w-4 h-4" /></button>
        </div>

        <AnimatePresence mode="wait">
          {step === 'ask' && (
            <motion.div key="ask" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-6">
              <p className="text-sm text-text-muted">Is there an action available right now?</p>
              <div className="flex gap-3">
                <button onClick={() => setStep('action')} className="flex-1 px-5 py-3 bg-primary text-primary-foreground rounded-xl text-xs font-black uppercase tracking-widest">Yes</button>
                <button onClick={() => setStep('no_action')} className="flex-1 px-5 py-3 border border-border/40 rounded-xl text-xs font-black uppercase tracking-widest text-text-muted hover:text-text-main">No</button>
              </div>
            </motion.div>
          )}

          {step === 'action' && !chosen && (
            <motion.div key="action" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-6">
              <p className="text-sm text-text-muted">Choose one small action.</p>
              <textarea
                value={actionText}
                onChange={(e) => setActionText(e.target.value.slice(0, 400))}
                rows={3}
                autoFocus
                placeholder="One small, specific thing..."
                className="w-full p-4 rounded-xl border border-border/40 bg-white dark:bg-surface text-sm text-text-main"
              />
              <button disabled={!actionText.trim()} onClick={() => finish('action')} className="w-full px-5 py-3 bg-primary text-primary-foreground rounded-xl text-xs font-black uppercase tracking-widest disabled:opacity-40">
                That's my next step
              </button>
            </motion.div>
          )}

          {step === 'no_action' && !chosen && (
            <motion.div key="no_action" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-6">
              <p className="text-sm text-text-muted">Then more thinking may not produce more control right now.</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {[
                  { id: 'release', label: 'Release it', desc: 'Let it go for now' },
                  { id: 'write_down', label: 'Write it down for later', desc: 'Capture it, set it aside' },
                  { id: 'rest', label: 'Rest', desc: 'Give your mind a break' },
                  { id: 'grounding', label: 'A grounding session', desc: 'Work through it properly' },
                  { id: 'trusted_person', label: 'Talk to someone', desc: 'You don\'t have to carry it alone' },
                ].map((opt) => (
                  <button key={opt.id} onClick={() => finish(opt.id)} className="p-4 rounded-xl border border-border/40 hover:border-primary/40 text-left bg-white dark:bg-surface transition-all">
                    <h5 className="text-sm font-bold text-text-main">{opt.label}</h5>
                    <p className="text-xs text-text-muted mt-1">{opt.desc}</p>
                  </button>
                ))}
              </div>
            </motion.div>
          )}

          {chosen && (
            <motion.div key="done" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="py-6 text-center space-y-4">
              <CheckCircle2 className="w-8 h-8 text-primary mx-auto" />
              <p className="text-sm text-text-muted">
                {chosen === 'action' ? "You know your next step. Leave the rest until it becomes actionable." : 'You do not have to resolve everything in one sitting.'}
              </p>
              <button onClick={onClose} className="px-6 py-3 bg-primary text-primary-foreground rounded-xl text-xs font-black uppercase tracking-widest">Close</button>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
};
