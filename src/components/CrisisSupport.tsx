import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence, useDragControls } from 'motion/react';
import { X, PhoneCall, MessageCircle, LifeBuoy, Loader2, CheckCircle2 } from 'lucide-react';
import { cn } from '../lib/utils';
import { useFocusTrap } from '../lib/useFocusTrap';
import { secureApiFetch } from '../lib/secure-api';

interface GuardianForCrisisAction {
  id: string;
  name: string;
  isGuardian?: boolean;
  role?: string;
}

// Tier 1 of docs/GUARDIAN_SUPPORT_SPEC.md: a one-tap, user-initiated
// request for a real guardian to call. Deterministic - no inference, no
// judgement, this component never decides anything about the user's
// state. It only ever acts on a direct tap. Rendered inline within
// CrisisSupportContent so it inherits "reachable from anywhere" from the
// component it already lives in, rather than needing its own separate
// global placement.
const GuardianQuickAction = ({ guardians }: { guardians: GuardianForCrisisAction[] }) => {
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [resultByContact, setResultByContact] = useState<Record<string, { ok: boolean; text: string }>>({});
  const realGuardians = guardians.filter(g => g.isGuardian || g.role === 'primary_guardian' || g.role === 'backup_guardian');

  if (realGuardians.length === 0) return null;

  const sendAlert = async (contact: GuardianForCrisisAction) => {
    setSendingId(contact.id);
    setResultByContact(prev => { const next = { ...prev }; delete next[contact.id]; return next; });
    try {
      const idempotencyKey = `${contact.id}_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      const res = await secureApiFetch('/api/guardian/alert', {
        method: 'POST',
        data: { contactId: contact.id, idempotencyKey },
      });
      const data = await res.json();
      setResultByContact(prev => ({ ...prev, [contact.id]: { ok: res.ok, text: data.userMessage || (res.ok ? 'Sent.' : "Couldn't send that.") } }));
    } catch (e) {
      setResultByContact(prev => ({ ...prev, [contact.id]: { ok: false, text: "Couldn't reach the messaging service right now." } }));
    }
    setSendingId(null);
  };

  return (
    <div className="space-y-3">
      <h5 className="text-[11px] font-black uppercase tracking-widest text-text-muted ml-1">Ask someone you trust</h5>
      {realGuardians.map(g => {
        const result = resultByContact[g.id];
        return (
          <div key={g.id} className="space-y-2">
            <button
              onClick={() => sendAlert(g)}
              disabled={sendingId === g.id}
              aria-label={`Ask ${g.name} to call you`}
              className="w-full flex items-center justify-between p-4 rounded-xl border border-primary-light dark:border-primary-dark/30 bg-primary-light dark:bg-primary-dark/20 hover:bg-primary-light dark:hover:bg-primary-dark/40 disabled:opacity-60 transition-colors group"
            >
              <div className="space-y-1.5 text-left">
                <span className="text-sm font-bold text-[#9a3412] dark:text-primary block">Ask {g.name} to call me</span>
                <span className="text-[11px] font-black uppercase tracking-widest text-[#9a3412] dark:text-primary font-mono">Sends a text asking them to call you right now</span>
              </div>
              {sendingId === g.id ? (
                <Loader2 className="w-5 h-5 text-primary animate-spin shrink-0" />
              ) : (
                <PhoneCall className="w-5 h-5 text-primary group-hover:scale-110 transition-transform shrink-0" />
              )}
            </button>
            {result && (
              <p role="status" className={cn("text-xs px-1", result.ok ? "text-text-muted" : "text-destructive dark:text-[#f87171]")}>
                {result.ok && <CheckCircle2 className="w-3.5 h-3.5 inline mr-1.5 -mt-0.5" />}
                {result.text}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
};

// Single source of truth for crisis resource content. Used both in the
// standalone global modal (reachable from anywhere) and inline on the
// Recovery Ally / Guardian Relay page, so the two never drift out of sync.
export const CrisisSupportContent = ({ guardians = [] }: { guardians?: GuardianForCrisisAction[] }) => (
  <div className="space-y-6">
    <p className="text-sm text-text-muted leading-relaxed">
      If things feel like too much right now, you don't have to handle it alone.
      These are free, confidential, and available any time.
    </p>

    <GuardianQuickAction guardians={guardians} />

    <div className="space-y-6">
      <div className="space-y-3">
        <h5 className="text-[11px] font-black uppercase tracking-widest text-text-muted ml-1">If you're in the UK or Ireland</h5>
        <a href="tel:116123" className="flex items-center justify-between p-4 rounded-xl border border-warning/20 dark:border-warning-foreground/30 bg-warning/10 dark:bg-warning-foreground/20 hover:bg-warning/20 dark:hover:bg-warning-foreground/40 transition-colors group">
          <div className="space-y-1.5">
            <span className="text-sm font-bold text-[#9a3412] dark:text-warning block">Samaritans</span>
            <span className="text-[11px] font-black uppercase tracking-widest text-[#9a3412] dark:text-warning font-mono">Call 116 123 &middot; free &middot; 24/7</span>
          </div>
          <PhoneCall className="w-5 h-5 text-[#9a3412] dark:text-warning group-hover:scale-110 transition-transform shrink-0" />
        </a>
        <a href="sms:85258?body=SHOUT" className="flex items-center justify-between p-4 rounded-xl border border-primary-light dark:border-primary-dark/30 bg-primary-light dark:bg-primary-dark/20 hover:bg-primary-light dark:hover:bg-primary-dark/40 transition-colors group">
          <div className="space-y-1.5">
            <span className="text-sm font-bold text-[#9a3412] dark:text-primary block">Shout</span>
            <span className="text-[11px] font-black uppercase tracking-widest text-[#9a3412] dark:text-primary font-mono">Text "SHOUT" to 85258</span>
          </div>
          <MessageCircle className="w-5 h-5 text-primary group-hover:scale-110 transition-transform shrink-0" />
        </a>
        <a href="tel:999" className="flex items-center justify-between p-4 rounded-xl border border-destructive dark:border-destructive/30 bg-destructive dark:bg-destructive/20 hover:bg-destructive dark:hover:bg-destructive/40 transition-colors group">
          <div className="space-y-1.5">
            <span className="text-sm font-bold text-destructive-foreground dark:text-[#f87171] block">Emergency services</span>
            <span className="text-[11px] font-black uppercase tracking-widest text-destructive-foreground dark:text-[#f87171] font-mono">Call 999 &middot; for immediate danger</span>
          </div>
          <PhoneCall className="w-5 h-5 text-destructive-foreground dark:text-destructive group-hover:scale-110 transition-transform shrink-0" />
        </a>
      </div>

      <div className="space-y-3">
        <h5 className="text-[11px] font-black uppercase tracking-widest text-text-muted ml-1">If you're in the US or Canada</h5>
        <a href="tel:988" className="flex items-center justify-between p-4 rounded-xl border border-destructive dark:border-destructive/30 bg-destructive dark:bg-destructive/20 hover:bg-destructive dark:hover:bg-destructive/40 transition-colors group">
          <div className="space-y-1.5">
            <span className="text-sm font-bold text-destructive-foreground dark:text-[#f87171] block">988 Suicide & Crisis Lifeline</span>
            <span className="text-[11px] font-black uppercase tracking-widest text-destructive-foreground dark:text-[#f87171] font-mono">Call or text 988 &middot; free &middot; 24/7</span>
          </div>
          <PhoneCall className="w-5 h-5 text-destructive-foreground dark:text-destructive group-hover:scale-110 transition-transform shrink-0" />
        </a>
        <a href="sms:741741?body=HOME" className="flex items-center justify-between p-4 rounded-xl border border-primary-light dark:border-primary-dark/30 bg-primary-light dark:bg-primary-dark/20 hover:bg-primary-light dark:hover:bg-primary-dark/40 transition-colors group">
          <div className="space-y-1.5">
            <span className="text-sm font-bold text-[#9a3412] dark:text-primary block">Crisis Text Line</span>
            <span className="text-[11px] font-black uppercase tracking-widest text-[#9a3412] dark:text-primary font-mono">Text "HOME" to 741741</span>
          </div>
          <MessageCircle className="w-5 h-5 text-primary group-hover:scale-110 transition-transform shrink-0" />
        </a>
      </div>
    </div>
  </div>
);

interface CrisisSupportModalProps {
  isOpen: boolean;
  onClose: () => void;
  guardians?: GuardianForCrisisAction[];
}

// Reachable from anywhere in the app via a persistent button that isn't
// nested inside any tab — see the floating button rendered in App.tsx.
export const CrisisSupportModal = ({ isOpen, onClose, guardians = [] }: CrisisSupportModalProps) => {
  const dragControls = useDragControls();
  const dialogRef = useFocusTrap(isOpen);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            ref={dialogRef as any}
            initial={{ opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={{ duration: 0.2 }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="crisis-support-title"
            tabIndex={-1}
            drag="y"
            dragControls={dragControls}
            dragListener={false}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.6 }}
            onDragEnd={(_, info) => { if (info.offset.y > 100) onClose(); }}
            className="card w-full max-w-md max-h-[85vh] overflow-y-auto bg-card border border-border shadow-lg p-6 space-y-6"
          >
            <div
              onPointerDown={(e) => dragControls.start(e)}
              className="sm:hidden -mt-2 -mx-2 mb-2 flex justify-center py-2 cursor-grab active:cursor-grabbing touch-none"
            >
              <div className="w-10 h-1.5 rounded-full bg-border" />
            </div>
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                  <LifeBuoy className="w-5 h-5" />
                </div>
                <h3 id="crisis-support-title" className="text-lg font-bold text-text-main leading-snug">
                  Need support right now?
                </h3>
              </div>
              <button
                onClick={onClose}
                aria-label="Close"
                className="p-2 rounded-full text-text-muted hover:text-text-main hover:bg-surface transition-colors shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <CrisisSupportContent guardians={guardians} />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

// Small persistent access point — deliberately calm rather than alarming
// (no red, no pulsing), but always present regardless of active tab or
// sidebar/mobile-nav collapse state, so it can't get buried by a future
// navigation change the way it was inside Recovery Ally.
export const CrisisSupportButton = ({ onClick, className }: { onClick: () => void; className?: string }) => (
  <button
    onClick={onClick}
    className={cn(
      "flex items-center gap-2 text-xs font-bold text-info bg-info/10 hover:bg-info/20 border border-info/20 rounded-xl px-3 py-2.5 transition-colors",
      className
    )}
  >
    <LifeBuoy className="w-4 h-4 shrink-0" />
    <span>Need support now?</span>
  </button>
);
