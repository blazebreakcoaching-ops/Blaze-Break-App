import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { HeartHandshake, X, ArrowRight, Compass } from 'lucide-react';
import { logGuardianSupportEvent } from '../lib/guardian-support-analytics';
import { GuardianConfirmSheet } from './GuardianConfirmSheet';

// The Guardian Support Invitation - an OPTIONAL, dismissible card Nova can
// offer (via the offer_guardian_support tool) or that's always reachable
// as a quick action, never anything that sends or decides on its own. See
// docs/GUARDIAN_SUPPORT_INVITATION.md for the full design and the
// non-negotiable constraints this follows.
//
// Deliberately calm, not alarming - same visual register as
// CrisisSupport.tsx (no red, no pulsing, no urgency framing) - and never
// re-rendered more than once per conversation unless the user raises it
// again themselves, which the caller enforces by only mounting this once
// per offer.
interface GuardianSupportInvitationProps {
  userName?: string;
  onDismiss: () => void;
}

export const GuardianSupportInvitation = ({ userName, onDismiss }: GuardianSupportInvitationProps) => {
  const [showConfirm, setShowConfirm] = useState(false);

  const handleOpen = () => {
    logGuardianSupportEvent('contact_flow_opened');
    setShowConfirm(true);
  };

  const handleExploreOtherSupport = () => {
    logGuardianSupportEvent('resource_route_opened');
    window.dispatchEvent(new CustomEvent('open_crisis_support'));
  };

  const handleDismiss = () => {
    logGuardianSupportEvent('invitation_dismissed');
    onDismiss();
  };

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 8 }}
        role="region"
        aria-label="Guardian support invitation"
        className="card border border-primary/20 bg-primary/5 p-5 space-y-4 max-w-md"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <HeartHandshake className="w-4 h-4" aria-hidden="true" />
            </div>
            <h4 className="text-sm font-bold text-text-main">You do not have to handle this alone.</h4>
          </div>
          <button
            onClick={handleDismiss}
            aria-label="Dismiss this suggestion"
            className="p-1 -m-1 rounded-lg text-text-muted hover:text-text-main hover:bg-surface transition-colors shrink-0"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        <p className="text-sm text-text-muted leading-relaxed">Would it help to contact someone you trust?</p>

        <div className="flex flex-col sm:flex-row gap-2">
          <button
            onClick={handleOpen}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-xs font-bold uppercase tracking-wide hover:opacity-90 transition-opacity"
          >
            Contact my Guardian <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
          <button
            onClick={handleExploreOtherSupport}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-surface hover:bg-border/40 text-text-main text-xs font-bold uppercase tracking-wide transition-colors"
          >
            <Compass className="w-3.5 h-3.5" aria-hidden="true" /> Explore other support
          </button>
        </div>
        <button
          onClick={handleDismiss}
          className="w-full text-center text-xs text-text-muted hover:text-text-main transition-colors py-1"
        >
          Not right now
        </button>
      </motion.div>

      <AnimatePresence>
        {showConfirm && (
          <GuardianConfirmSheet
            userName={userName}
            onClose={() => setShowConfirm(false)}
          />
        )}
      </AnimatePresence>
    </>
  );
};

export default GuardianSupportInvitation;
