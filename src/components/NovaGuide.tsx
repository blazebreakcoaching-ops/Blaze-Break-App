import { useEffect, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import {
  ArrowRight, ChevronLeft, ChevronRight, ClipboardCheck,
  House, MessageCircle, Route, Sparkles, X,
  type LucideIcon,
} from 'lucide-react';
import { BlazeBrandLogo } from './BlazeBrandLogo';
import { useFocusTrap } from '../lib/useFocusTrap';
import {
  NOVA_GUIDE_STEPS, novaGuideIndexForPage,
  type NovaGuideIcon, type NovaGuideTab,
} from '../lib/nova-guide';

const ICONS: Record<NovaGuideIcon, LucideIcon> = {
  sparkles: Sparkles,
  home: House,
  'check-in': ClipboardCheck,
  nova: MessageCircle,
  plan: Route,
};

interface NovaGuideProps {
  isOpen: boolean;
  startPage: string;
  accountId?: string;
  onClose: () => void;
  onNavigate: (tab: NovaGuideTab) => void;
}

const progressKey = (uid: string) => `blaze-nova-guide-progress-v1:${encodeURIComponent(uid)}`;

export const NovaGuide = ({ isOpen, startPage, accountId, onClose, onNavigate }: NovaGuideProps) => {
  const [index, setIndex] = useState(0);
  const dialogRef = useFocusTrap(isOpen);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (!isOpen) return;
    let next = novaGuideIndexForPage(startPage);
    if (startPage === 'welcome' && accountId) {
      try {
        const stored = window.localStorage.getItem(progressKey(accountId));
        if (stored !== null && /^\d+$/.test(stored)) {
          const saved = Number(stored);
          if (saved >= 0 && saved < NOVA_GUIDE_STEPS.length) next = saved;
        }
      } catch {
        // Browsers with restricted storage can still use the entire guide.
      }
    }
    setIndex(next);
  }, [isOpen, startPage, accountId]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  const savePosition = (position: number) => {
    if (!accountId) return;
    try {
      if (position >= NOVA_GUIDE_STEPS.length) {
        window.localStorage.removeItem(progressKey(accountId));
      } else {
        window.localStorage.setItem(progressKey(accountId), String(position));
      }
    } catch {
      // Progress is optional; nothing about app access depends on storage.
    }
  };

  const leave = () => {
    savePosition(index);
    onClose();
  };

  const finish = () => {
    savePosition(NOVA_GUIDE_STEPS.length);
    onClose();
  };

  const openRealPage = (tab: NovaGuideTab) => {
    savePosition(index + 1);
    onNavigate(tab);
  };

  const goTo = (position: number) => {
    if (position < 0 || position >= NOVA_GUIDE_STEPS.length) return;
    setIndex(position);
    savePosition(position);
  };

  const step = NOVA_GUIDE_STEPS[index];
  const StepIcon = ICONS[step.icon];
  const first = index === 0;
  const last = index === NOVA_GUIDE_STEPS.length - 1;

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[125] flex items-center justify-center p-3 sm:p-5 bg-background/85 backdrop-blur-sm">
          <motion.section
            ref={dialogRef as any}
            role="dialog"
            aria-modal="true"
            aria-labelledby="nova-guide-heading"
            aria-describedby="nova-guide-description"
            tabIndex={-1}
            initial={reduceMotion ? false : { opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduceMotion ? undefined : { opacity: 0, y: 8, scale: 0.98 }}
            transition={{ duration: reduceMotion ? 0 : 0.2 }}
            className="w-full max-w-lg max-h-[calc(100dvh-1.5rem)] min-h-0 overflow-y-auto overscroll-contain rounded-2xl border border-border bg-card text-text-main shadow-2xl"
          >
            <div className="flex items-center justify-between gap-3 px-5 sm:px-7 pt-5 sm:pt-7">
              <div className="flex items-center gap-3">
                <BlazeBrandLogo className="h-10 w-10 shrink-0" decorative />
                <div>
                  <p className="font-semibold text-sm">Nova Guide</p>
                  <p className="text-xs text-text-muted">A little help, when you want it.</p>
                </div>
              </div>
              <button type="button" onClick={leave} aria-label="Close Nova Guide" className="rounded-full p-2 text-text-muted hover:bg-surface focus-visible:outline-2 focus-visible:outline-primary">
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>

            <div className="px-5 sm:px-7 pt-6 pb-5">
              <div className="relative flex items-center justify-center h-40 sm:h-44 rounded-2xl border border-primary/20 bg-primary/5 overflow-hidden" aria-hidden="true">
                <div className="absolute -top-12 -right-8 h-36 w-36 rounded-full bg-primary/10 blur-2xl" />
                <div className="absolute bottom-5 left-8 h-10 w-10 rounded-full border border-primary/20 flex items-center justify-center bg-card">
                  <Sparkles className="h-4 w-4 text-primary" />
                </div>
                <motion.div
                  key={step.id}
                  initial={reduceMotion ? false : { opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: reduceMotion ? 0 : 0.22 }}
                  className="relative h-24 w-24 rounded-3xl flex items-center justify-center border border-primary/30 bg-card shadow-lg shadow-primary/10"
                >
                  <StepIcon className="h-11 w-11 text-primary" strokeWidth={1.6} />
                </motion.div>
                <div className="absolute top-6 right-9 h-8 w-8 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center">
                  <ArrowRight className="h-4 w-4 text-primary" />
                </div>
              </div>

              <div className="mt-6" aria-live="polite" aria-atomic="true">
                <p className="text-xs font-semibold tracking-wide text-primary">Step {index + 1} of {NOVA_GUIDE_STEPS.length}</p>
                <h2 id="nova-guide-heading" className="font-display font-semibold text-xl sm:text-2xl mt-2">{step.title}</h2>
                <p id="nova-guide-description" className="mt-3 text-sm sm:text-base leading-relaxed text-text-main">{step.message}</p>
                <p className="mt-3 text-sm text-text-muted leading-relaxed">{step.why}</p>
              </div>

              <div className="mt-6 flex gap-2" aria-label="Guide progress">
                {NOVA_GUIDE_STEPS.map((part, position) => (
                  <span
                    key={part.id}
                    aria-hidden="true"
                    className={`h-1.5 flex-1 rounded-full ${position <= index ? 'bg-primary' : 'bg-border'}`}
                  />
                ))}
              </div>

              <div className="mt-6 flex flex-wrap gap-3">
                {!first && (
                  <button type="button" onClick={() => goTo(index - 1)} className="rounded-xl px-4 py-3 border border-border text-sm font-semibold focus-visible:outline-2 focus-visible:outline-primary">
                    <ChevronLeft className="h-4 w-4 inline -mt-0.5" aria-hidden="true" /> Back
                  </button>
                )}
                <button
                  type="button"
                  onClick={last ? finish : () => goTo(index + 1)}
                  className="flex-1 rounded-xl bg-primary text-primary-foreground px-5 py-3 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-primary"
                >
                  {last ? 'Finish tour' : 'Next'}
                  {!last && <ChevronRight className="h-4 w-4 inline -mt-0.5 ml-1" aria-hidden="true" />}
                </button>
              </div>
              {step.tab && (
                <button type="button" onClick={() => openRealPage(step.tab!)} className="mt-3 w-full rounded-xl border border-primary/30 bg-primary/5 px-4 py-3 text-primary text-sm font-semibold hover:bg-primary/10 focus-visible:outline-2 focus-visible:outline-primary">
                  {step.action} <ArrowRight className="inline h-4 w-4 ml-1" aria-hidden="true" />
                </button>
              )}
              <button type="button" onClick={leave} className="mt-4 block mx-auto text-xs text-text-muted underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-primary">Skip for now</button>
            </div>
          </motion.section>
        </div>
      )}
    </AnimatePresence>
  );
};
