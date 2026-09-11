import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Brain, Shield, Sparkles, Target, Check, ChevronDown, SlidersHorizontal } from 'lucide-react';
import { cn } from '../lib/utils';

// Lets a person re-tune how Nova sounds at any point in the relationship, not
// just once at onboarding. The values match the four options the onboarding
// questionnaire writes, so the string stored in the profile stays consistent
// wherever it's read (chat context, voice priming). This is "adapt by the
// user's stated preference" - the honest, listen-don't-profile kind of
// adaptivity, chosen by them, never inferred.
export const TONE_OPTIONS: { value: string; short: string; desc: string; icon: React.ElementType }[] = [
  { value: 'Direct & Analytical (No fluff)', short: 'Direct', desc: 'Straight to the point, minimal warmth.', icon: Brain },
  { value: 'Firm & Accountable', short: 'Firm', desc: 'Warm, but holds you to what you said.', icon: Shield },
  { value: 'Calm & Reflective', short: 'Gentle', desc: 'Soft, spacious, unhurried.', icon: Sparkles },
  { value: 'Practical & Structured', short: 'Practical', desc: 'Clear steps and structure.', icon: Target },
];

export function shortToneLabel(value: string | undefined | null): string {
  return TONE_OPTIONS.find((t) => t.value === value)?.short || 'Set tone';
}

interface NovaToneControlProps {
  value?: string;
  onChange: (tone: string) => void;
  className?: string;
}

export const NovaToneControl = ({ value, onChange, className }: NovaToneControlProps) => {
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
        title="Change how Nova sounds"
        className="flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-medium text-text-muted hover:text-primary hover:border-primary/40 transition-colors"
      >
        <SlidersHorizontal className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        <span>Tone: {shortToneLabel(value)}</span>
        <ChevronDown className={cn('w-3.5 h-3.5 transition-transform', open && 'rotate-180')} aria-hidden="true" />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            role="menu"
            aria-label="How Nova sounds"
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            className="absolute right-0 z-40 mt-2 w-64 rounded-2xl border border-border bg-card shadow-2xl p-2"
          >
            <p className="text-[10px] font-black uppercase tracking-widest text-text-muted px-2.5 pt-1.5 pb-1">How should Nova sound?</p>
            {TONE_OPTIONS.map((t) => {
              const Icon = t.icon;
              const active = t.value === value;
              return (
                <button
                  key={t.value}
                  role="menuitemradio"
                  aria-checked={active}
                  onClick={() => { onChange(t.value); setOpen(false); }}
                  className={cn(
                    'w-full flex items-start gap-3 rounded-xl px-2.5 py-2 text-left transition-colors',
                    active ? 'bg-primary/10' : 'hover:bg-surface',
                  )}
                >
                  <Icon className={cn('w-4 h-4 mt-0.5 shrink-0', active ? 'text-primary' : 'text-text-muted')} aria-hidden="true" />
                  <span className="flex-1 min-w-0">
                    <span className="flex items-center gap-1.5">
                      <span className="text-sm font-bold text-text-main">{t.short}</span>
                      {active && <Check className="w-3.5 h-3.5 text-primary" aria-hidden="true" />}
                    </span>
                    <span className="block text-xs text-text-muted mt-0.5">{t.desc}</span>
                  </span>
                </button>
              );
            })}
            <p className="text-[11px] text-text-muted px-2.5 py-1.5">Nova switches straightaway — and you can change this any time.</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default NovaToneControl;
