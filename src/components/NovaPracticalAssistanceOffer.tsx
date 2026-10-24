import React from 'react';
import { motion } from 'motion/react';
import { ListChecks, X, ArrowRight } from 'lucide-react';

// Phase 5K's practical-assistance offer card - the optional, dismissible
// invitation Nova's offer_practical_assistance tool triggers (never anything
// the tool executes itself). Mirrors GuardianSupportInvitation.tsx's exact
// visual register and never-forced pattern: a reason, one real action the
// user can choose to take, and an explicit "not right now" out. Opening it
// only navigates into Nova's existing, already-tested, already
// execution-disabled practical assistance workflow (Invisible Load ->
// Calendar Protection / Task Deferral) - nothing here proposes, schedules,
// or changes anything on its own.
interface NovaPracticalAssistanceOfferProps {
  reason: string;
  onOpen: () => void;
  onDismiss: () => void;
}

export const NovaPracticalAssistanceOffer = ({ reason, onOpen, onDismiss }: NovaPracticalAssistanceOfferProps) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8 }}
      role="region"
      aria-label="Practical assistance offer"
      className="card border border-primary/20 bg-primary/5 p-5 space-y-4 max-w-md"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
            <ListChecks className="w-4 h-4" aria-hidden="true" />
          </div>
          <h4 className="text-sm font-bold text-text-main">Want help getting this off your plate?</h4>
        </div>
        <button
          onClick={onDismiss}
          aria-label="Dismiss this suggestion"
          className="p-1 -m-1 rounded-lg text-text-muted hover:text-text-main hover:bg-surface transition-colors shrink-0"
        >
          <X className="w-4 h-4" aria-hidden="true" />
        </button>
      </div>

      <p className="text-sm text-text-muted leading-relaxed">{reason}</p>

      <button
        onClick={onOpen}
        className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-xs font-bold uppercase tracking-wide hover:opacity-90 transition-opacity"
      >
        Review what's on my plate <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
      </button>
      <button
        onClick={onDismiss}
        className="w-full text-center text-xs text-text-muted hover:text-text-main transition-colors py-1"
      >
        Not right now
      </button>
    </motion.div>
  );
};

export default NovaPracticalAssistanceOffer;
