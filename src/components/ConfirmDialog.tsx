import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { AlertTriangle } from 'lucide-react';
import { cn } from '../lib/utils';
import { useFocusTrap } from '../lib/useFocusTrap';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  // Most uses are for a destructive action (delete, revoke, disconnect);
  // set false for a neutral confirmation that doesn't warrant red styling.
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

// Shared in-app replacement for window.confirm() - same accessible
// dialog/focus-trap/Escape-to-cancel pattern this app had already been
// building bespoke, one component at a time (OneLessThing, WeeklyGoalTracker,
// WorkloadRealityCheck, FocusZone's quit intercept). Consolidated here so
// every remaining native confirm() call in the app can move to the same
// real UI instead of a browser-native dialog, without re-deriving the same
// markup again at each call site.
export const ConfirmDialog = ({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = true,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) => {
  const dialogRef = useFocusTrap(open);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onCancel]);

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onCancel}
            className="absolute inset-0 bg-surface/60 backdrop-blur-md"
          />
          <motion.div
            ref={dialogRef as React.RefObject<HTMLDivElement>}
            initial={{ opacity: 0, scale: 0.95, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 15 }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-dialog-title"
            tabIndex={-1}
            className="bg-white dark:bg-surface border border-border/40 rounded-xl p-6 md:p-8 max-w-md w-full relative z-[110] shadow-lg"
          >
            <div className="flex gap-4 items-start mb-5">
              <div className={cn(
                "w-12 h-12 rounded-2xl flex items-center justify-center shrink-0",
                destructive ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary"
              )}>
                <AlertTriangle className="w-6 h-6" aria-hidden="true" />
              </div>
              <div className="space-y-1">
                <h4 id="confirm-dialog-title" className="text-base font-bold text-text-main">{title}</h4>
                <p className="text-xs text-text-muted leading-relaxed">{message}</p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3">
              <button
                onClick={onCancel}
                className="px-4 py-2 border border-border/20 text-text-muted hover:text-text-main font-bold text-xs uppercase tracking-wider rounded-xl hover:bg-surface/30 transition-all cursor-pointer"
              >
                {cancelLabel}
              </button>
              <button
                onClick={onConfirm}
                className={cn(
                  "px-4 py-2 font-bold text-xs uppercase tracking-wider rounded-xl transition-all shadow-md cursor-pointer",
                  destructive
                    ? "bg-destructive hover:bg-destructive text-destructive-foreground"
                    : "bg-primary hover:bg-primary text-primary-foreground"
                )}
              >
                {confirmLabel}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default ConfirmDialog;
