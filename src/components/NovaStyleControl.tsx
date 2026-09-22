import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Zap, Briefcase, HeartHandshake, AlertTriangle, Check, ChevronDown, MessageCircleQuestion } from 'lucide-react';
import { cn } from '../lib/utils';

// How Nova asks questions, not how it sounds (see NovaToneControl for tone) -
// a separate, opt-in axis. Unlike tone, this has a genuine "off" state:
// most people never need to touch it, and Nova's default questioning
// behaviour is unaffected until someone explicitly picks a style here.
export type NovaQuestioningStyle = 'operator' | 'board_member' | 'mentor' | 'pre_mortem';

export const QUESTIONING_STYLE_OPTIONS: { value: NovaQuestioningStyle; short: string; desc: string; icon: React.ElementType }[] = [
  { value: 'operator', short: 'Operator', desc: 'Fast, blunt, straight to the real constraint.', icon: Zap },
  { value: 'board_member', short: 'Board Member', desc: 'Strategic - cost, consequence, and the decision itself.', icon: Briefcase },
  { value: 'mentor', short: 'Mentor', desc: 'Warmer, still direct - meets you before it challenges you.', icon: HeartHandshake },
  { value: 'pre_mortem', short: 'Pre-Mortem', desc: 'Stress-tests a plan before it happens.', icon: AlertTriangle },
];

export function shortStyleLabel(value: string | undefined | null): string {
  return QUESTIONING_STYLE_OPTIONS.find((s) => s.value === value)?.short || 'Off';
}

interface NovaStyleControlProps {
  value?: string;
  onChange: (style: NovaQuestioningStyle | undefined) => void;
  className?: string;
}

export const NovaStyleControl = ({ value, onChange, className }: NovaStyleControlProps) => {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDocClick);
    window.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDocClick); window.removeEventListener('keydown', onKey); };
  }, [open]);

  return (
    <div ref={rootRef} className={cn('relative', className)}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        title="Change how Nova questions you"
        className="flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-medium text-text-muted hover:text-primary hover:border-primary/40 transition-colors"
      >
        <MessageCircleQuestion className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        <span>Style: {shortStyleLabel(value)}</span>
        <ChevronDown className={cn('w-3.5 h-3.5 transition-transform', open && 'rotate-180')} aria-hidden="true" />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            role="menu"
            aria-label="How Nova questions you"
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            className="absolute right-0 z-40 mt-2 w-72 rounded-2xl border border-border bg-card shadow-2xl p-2"
          >
            <p className="text-[10px] font-black uppercase tracking-widest text-text-muted px-2.5 pt-1.5 pb-1">How should Nova question you?</p>
            <button
              role="menuitemradio"
              aria-checked={!value}
              onClick={() => { onChange(undefined); setOpen(false); }}
              className={cn(
                'w-full flex items-center gap-3 rounded-xl px-2.5 py-2 text-left transition-colors',
                !value ? 'bg-primary/10' : 'hover:bg-surface',
              )}
            >
              <span className="flex-1 min-w-0 flex items-center gap-1.5">
                <span className="text-sm font-bold text-text-main">Off (default)</span>
                {!value && <Check className="w-3.5 h-3.5 text-primary" aria-hidden="true" />}
              </span>
            </button>
            {QUESTIONING_STYLE_OPTIONS.map((s) => {
              const Icon = s.icon;
              const active = s.value === value;
              return (
                <button
                  key={s.value}
                  role="menuitemradio"
                  aria-checked={active}
                  onClick={() => { onChange(s.value); setOpen(false); }}
                  className={cn(
                    'w-full flex items-start gap-3 rounded-xl px-2.5 py-2 text-left transition-colors',
                    active ? 'bg-primary/10' : 'hover:bg-surface',
                  )}
                >
                  <Icon className={cn('w-4 h-4 mt-0.5 shrink-0', active ? 'text-primary' : 'text-text-muted')} aria-hidden="true" />
                  <span className="flex-1 min-w-0">
                    <span className="flex items-center gap-1.5">
                      <span className="text-sm font-bold text-text-main">{s.short}</span>
                      {active && <Check className="w-3.5 h-3.5 text-primary" aria-hidden="true" />}
                    </span>
                    <span className="block text-xs text-text-muted mt-0.5">{s.desc}</span>
                  </span>
                </button>
              );
            })}
            <p className="text-[11px] text-text-muted px-2.5 py-1.5">Changes how Nova asks, never who Nova is - and you can turn it off any time.</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default NovaStyleControl;
