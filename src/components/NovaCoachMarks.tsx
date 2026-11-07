import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'motion/react';
import { ArrowRight, ChevronLeft, X, Sparkles } from 'lucide-react';
import { useFocusTrap } from '../lib/useFocusTrap';
import { novaCoachMarksForPage } from '../lib/nova-coach-marks';
import type { NovaGuideTab } from '../lib/nova-guide';

interface Highlight {
  top: number;
  left: number;
  width: number;
  height: number;
}

interface NovaCoachMarksProps {
  page: NovaGuideTab;
  onClose: () => void;
}

export const NovaCoachMarks = ({ page, onClose }: NovaCoachMarksProps) => {
  const steps = novaCoachMarksForPage(page);
  const [stepIndex, setStepIndex] = useState(0);
  const [highlight, setHighlight] = useState<Highlight | null>(null);
  const dialogRef = useFocusTrap(true);
  const reducedMotion = useReducedMotion();
  const currentTargetRef = useRef<HTMLElement | null>(null);
  const step = steps[stepIndex];

  useEffect(() => {
    if (!step) return;
    let disposed = false;
    let frame = 0;
    let observer: MutationObserver | null = null;

    const position = () => {
      if (disposed) return;
      const target = document.querySelector<HTMLElement>(`[data-nova-guide-target="${step.target}"]`);
      currentTargetRef.current = target;
      if (!target) {
        setHighlight(null); // Honest fallback if the screen has not loaded.
        return;
      }
      const rect = target.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1) {
        setHighlight(null); // No false pointer to a hidden or collapsed tab.
        return;
      }
      setHighlight({
        top: Math.max(0, rect.top - 5),
        left: Math.max(0, rect.left - 5),
        width: Math.min(window.innerWidth - Math.max(0, rect.left - 5), rect.width + 10),
        height: Math.min(window.innerHeight - Math.max(0, rect.top - 5), rect.height + 10),
      });
    };

    // Only scroll once on an explicit step choice. The user can still
    // move the page manually; later scroll events only move the outline.
    const settle = () => {
      const target = document.querySelector<HTMLElement>(`[data-nova-guide-target="${step.target}"]`);
      if (!target) return;
      target.scrollIntoView({ block: 'center', inline: 'nearest', behavior: reducedMotion ? 'auto' : 'smooth' });
    };
    position();
    settle();
    const onReposition = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(position);
    };
    window.addEventListener('resize', onReposition);
    window.addEventListener('scroll', onReposition, true);
    // Lazy-loaded Check-in/Plan/Nova panels can mount after the coach mark.
    // Observe until the target arrives, then stop watching the tree.
    if (!currentTargetRef.current) {
      observer = new MutationObserver(() => {
        position();
        if (currentTargetRef.current) {
          observer?.disconnect();
          settle();
        }
      });
      observer.observe(document.body, { childList: true, subtree: true });
    }
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener('resize', onReposition);
      window.removeEventListener('scroll', onReposition, true);
      currentTargetRef.current = null;
    };
  }, [step?.target, reducedMotion]);

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  if (!step) return null;

  const tryIt = () => {
    const target = currentTargetRef.current;
    onClose(); // Always exit the overlay before giving the real UI focus.
    if (target) window.requestAnimationFrame(() => target.focus({ preventScroll: true }));
  };
  const next = () => {
    if (stepIndex === steps.length - 1) onClose();
    else setStepIndex(index => index + 1);
  };
  const previous = () => setStepIndex(index => Math.max(0, index - 1));
  const isLast = stepIndex === steps.length - 1;

  // On small viewports prefer a safe bottom sheet; at larger widths put
  // the explanation on the opposite side of the highlighted control.
  const cardWidth = Math.min(360, Math.max(240, window.innerWidth - 24));
  const roomBelow = highlight ? window.innerHeight - (highlight.top + highlight.height) : 0;
  const roomAbove = highlight?.top ?? 0;
  const cardTop = highlight && window.innerWidth >= 640
    ? (roomBelow >= 280
      ? Math.min(window.innerHeight - 270, highlight.top + highlight.height + 12)
      : roomAbove >= 280
        ? Math.max(12, highlight.top - 275)
        : Math.max(12, window.innerHeight - 285))
    : null;
  const cardLeft = highlight && window.innerWidth >= 640
    ? Math.max(12, Math.min(highlight.left, window.innerWidth - cardWidth - 12))
    : null;

  return (
    <div className="fixed inset-0 z-[135]" aria-label="Nova Guide highlighting a screen control">
      {/* Real controls remain unclickable beneath the overlay until the
          visitor explicitly chooses Try it or closes the explanation. */}
      <div className="absolute inset-0 bg-black/35" aria-hidden="true" />
      {highlight && (
        <div
          data-testid="nova-guide-highlight"
          aria-hidden="true"
          className="fixed rounded-xl border-2 border-primary pointer-events-none ring-4 ring-primary/20"
          style={{ top: highlight.top, left: highlight.left, width: Math.max(0, highlight.width), height: Math.max(0, highlight.height), boxShadow: '0 0 0 9999px rgba(0,0,0,0.16)' }}
        />
      )}
      <section
        ref={dialogRef as any}
        role="dialog"
        aria-modal="true"
        aria-labelledby="nova-coach-mark-title"
        aria-describedby="nova-coach-mark-description"
        tabIndex={-1}
        className="fixed w-[calc(100vw-1.5rem)] max-w-[360px] max-h-[calc(100dvh-1.5rem)] overflow-y-auto rounded-2xl border border-primary/20 bg-card p-5 sm:p-6 text-text-main shadow-2xl"
        style={cardTop !== null && cardLeft !== null
          ? { top: cardTop, left: cardLeft }
          : { bottom: 'calc(1rem + env(safe-area-inset-bottom))', left: '50%', transform: 'translateX(-50%)' }}
      >
        <div className="flex items-center justify-between gap-2">
          <p className="flex items-center gap-2 text-xs font-semibold text-primary"><Sparkles className="h-4 w-4" /> Nova Guide</p>
          <button type="button" onClick={onClose} aria-label="Close guided highlight" className="rounded-lg p-2 text-text-muted hover:bg-surface focus-visible:outline-2 focus-visible:outline-primary"><X className="h-4 w-4" /></button>
        </div>
        <p className="mt-3 text-xs font-medium text-text-muted">Tip {stepIndex + 1} of {steps.length}</p>
        <h2 id="nova-coach-mark-title" className="mt-2 font-display text-lg font-semibold">{step.title}</h2>
        <p id="nova-coach-mark-description" className="mt-2 text-sm leading-relaxed text-text-muted">{step.explanation}</p>
        {!highlight && <p className="mt-2 text-xs text-text-muted">This part isn't visible yet. You can move on or close the guide.</p>}
        <div className="mt-5 flex flex-wrap gap-2">
          {stepIndex > 0 && <button type="button" onClick={previous} className="rounded-xl border border-border px-3 py-2.5 text-sm font-semibold"><ChevronLeft className="inline h-4 w-4" /> Back</button>}
          <button type="button" onClick={next} className="flex-1 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground">
            {isLast ? 'Got it' : 'Next'}{!isLast && <ArrowRight className="inline h-4 w-4 ml-1" />}
          </button>
          {highlight && <button type="button" onClick={tryIt} className="w-full rounded-xl border border-primary/30 px-4 py-2.5 text-sm font-semibold text-primary">Try it myself</button>}
        </div>
        <button type="button" onClick={onClose} className="block mx-auto mt-3 text-xs text-text-muted underline underline-offset-4">Skip for now</button>
      </section>
    </div>
  );
};
