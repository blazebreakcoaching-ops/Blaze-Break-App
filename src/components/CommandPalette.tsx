import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Search, CornerDownLeft, Sparkles, LifeBuoy, ArrowRight } from 'lucide-react';
import { cn } from '../lib/utils';
import { useFocusTrap } from '../lib/useFocusTrap';

export interface PaletteTab {
  id: string;
  label: string;
  icon: React.ElementType;
  group?: string;
}

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  tabs: PaletteTab[]; // already filtered to what this user can actually open
  onNavigate: (id: string) => void;
  onTalkToNova?: () => void;
  onCrisis?: () => void;
}

// Search synonyms so people find a tool by how they'd describe it in the
// moment, not just its official label ("panic" -> Anxiety Reset, "breathe" ->
// Nervous System). Keyed by tab id; unknown ids simply have no extra terms.
const KEYWORDS: Record<string, string[]> = {
  home: ['pulse', 'dashboard', 'today', 'overview', 'score'],
  plan: ['recovery plan', 'roadmap', 'steps', 'what to do'],
  diagnose: ['burnout', 'assessment', 'test', 'fingerprint', 'where am i'],
  recover: ['energy', 'battery', 'budget', 'tired', 'drained', 'rest'],
  fuel: ['nutrition', 'food', 'eat', 'caffeine', 'hydration', 'gut'],
  reset: ['breathe', 'breathing', 'calm', 'panic', 'overwhelmed', 'ground', 'somatic', 'nervous system'],
  anxiety_reset: ['anxious', 'anxiety', 'panic', 'racing thoughts', 'spiralling', 'worry'],
  communicate: ['boundary', 'boundaries', 'say no', 'script', 'message', 'email', 'assert'],
  reflect: ['journal', 'reflect', 'write', 'thoughts', 'rumination'],
  nova: ['chat', 'talk', 'coach', 'ai', 'nova', 'ask'],
  ally: ['guardian', 'support', 'friend', 'ally', 'someone i trust'],
  org: ['team', 'organisation', 'organization', 'dashboard', 'workplace'],
};

// "How are you right now?" - a feeling-first way in, so someone in a bad
// moment doesn't have to know the app's vocabulary. Each maps to a tool that
// genuinely helps with that state; only shown if that tool is available.
const MOODS: { label: string; emoji: string; tab: string }[] = [
  { label: 'Overwhelmed', emoji: '😵‍💫', tab: 'reset' },
  { label: 'Anxious', emoji: '😰', tab: 'anxiety_reset' },
  { label: "Can't focus", emoji: '🌫️', tab: 'reset' },
  { label: 'Drained', emoji: '🔋', tab: 'recover' },
  { label: 'Resentful', emoji: '😤', tab: 'reflect' },
  { label: 'Need to say no', emoji: '🛑', tab: 'communicate' },
];

export const CommandPalette = ({ isOpen, onClose, tabs, onNavigate, onTalkToNova, onCrisis }: CommandPaletteProps) => {
  const dialogRef = useFocusTrap(isOpen);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [query, setQuery] = useState('');
  const [highlight, setHighlight] = useState(0);

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setHighlight(0);
      // Focus the input once the dialog is mounted.
      const t = setTimeout(() => inputRef.current?.focus(), 40);
      return () => clearTimeout(t);
    }
  }, [isOpen]);

  const tabById = useMemo(() => new Map(tabs.map((t) => [t.id, t])), [tabs]);
  const availableMoods = useMemo(() => MOODS.filter((m) => tabById.has(m.tab)), [tabById]);

  // Flat, ordered list of selectable results for the current query.
  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const items: { kind: 'nav'; id: string; label: string; icon: React.ElementType }[] = [];
    for (const t of tabs) {
      const hay = [t.label.toLowerCase(), ...(KEYWORDS[t.id] || [])].join(' ');
      if (!q || hay.includes(q) || t.label.toLowerCase().includes(q)) {
        items.push({ kind: 'nav', id: t.id, label: t.label, icon: t.icon });
      }
    }
    return items;
  }, [query, tabs]);

  useEffect(() => { setHighlight(0); }, [query]);

  if (!isOpen) return null;

  const choose = (id: string) => {
    onNavigate(id);
    onClose();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setHighlight((h) => Math.min(h + 1, results.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHighlight((h) => Math.max(h - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); const r = results[highlight]; if (r) choose(r.id); }
    else if (e.key === 'Escape') { e.preventDefault(); onClose(); }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-[70] flex items-start justify-center bg-background/70 backdrop-blur-sm px-4 pt-[12vh]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          role="dialog"
          aria-modal="true"
          aria-label="Quick find"
        >
          <motion.div
            ref={dialogRef as React.RefObject<HTMLDivElement>}
            className="w-full max-w-lg bg-card border border-border rounded-2xl shadow-2xl overflow-hidden"
            initial={{ opacity: 0, y: -12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -12, scale: 0.98 }}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={onKeyDown}
          >
            <div className="flex items-center gap-3 px-4 py-3.5 border-b border-border">
              <Search className="w-4 h-4 text-text-muted shrink-0" aria-hidden="true" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search tools, or tell me what you need…"
                aria-label="Search for a tool"
                className="flex-1 bg-transparent text-sm text-text-main placeholder:text-text-muted focus:outline-none"
              />
              <kbd className="hidden sm:inline text-[10px] font-mono text-text-muted border border-border rounded px-1.5 py-0.5">esc</kbd>
            </div>

            <div className="max-h-[52vh] overflow-y-auto custom-scrollbar p-2">
              {/* Mood-first entry — only when the person hasn't typed anything. */}
              {query.trim() === '' && availableMoods.length > 0 && (
                <div className="px-2 pt-2 pb-3">
                  <p className="text-[10px] font-black uppercase tracking-widest text-text-muted mb-2 px-1">How are you right now?</p>
                  <div className="flex flex-wrap gap-2">
                    {availableMoods.map((m) => (
                      <button
                        key={m.label}
                        onClick={() => choose(m.tab)}
                        className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-medium text-text-main hover:border-primary/40 hover:text-primary transition-colors"
                      >
                        <span aria-hidden="true">{m.emoji}</span> {m.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Quick actions */}
              {query.trim() === '' && (onTalkToNova || onCrisis) && (
                <div className="px-1 pb-2">
                  {onTalkToNova && (
                    <button onClick={() => { onTalkToNova(); onClose(); }} className="w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-text-main hover:bg-surface transition-colors">
                      <Sparkles className="w-4 h-4 text-primary shrink-0" aria-hidden="true" />
                      <span className="flex-1 text-left">Talk with Nova</span>
                      <ArrowRight className="w-3.5 h-3.5 text-text-muted" aria-hidden="true" />
                    </button>
                  )}
                  {onCrisis && (
                    <button onClick={() => { onCrisis(); onClose(); }} className="w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-text-main hover:bg-surface transition-colors">
                      <LifeBuoy className="w-4 h-4 text-destructive shrink-0" aria-hidden="true" />
                      <span className="flex-1 text-left">I need support right now</span>
                      <ArrowRight className="w-3.5 h-3.5 text-text-muted" aria-hidden="true" />
                    </button>
                  )}
                </div>
              )}

              {/* Navigable tools */}
              {(query.trim() !== '' || availableMoods.length === 0) && (
                <p className="text-[10px] font-black uppercase tracking-widest text-text-muted mb-1 px-3 pt-1">
                  {query.trim() === '' ? 'All tools' : results.length > 0 ? 'Tools' : 'No matches'}
                </p>
              )}
              {results.map((r, i) => {
                const Icon = r.icon;
                return (
                  <button
                    key={r.id}
                    onMouseEnter={() => setHighlight(i)}
                    onClick={() => choose(r.id)}
                    aria-current={highlight === i}
                    className={cn(
                      'w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors text-left',
                      highlight === i ? 'bg-primary/10 text-text-main' : 'text-text-main hover:bg-surface'
                    )}
                  >
                    <Icon className={cn('w-4 h-4 shrink-0', highlight === i ? 'text-primary' : 'text-text-muted')} aria-hidden="true" />
                    <span className="flex-1">{r.label}</span>
                    {highlight === i && <CornerDownLeft className="w-3.5 h-3.5 text-text-muted" aria-hidden="true" />}
                  </button>
                );
              })}

              {query.trim() !== '' && results.length === 0 && (
                <p className="text-sm text-text-muted text-center py-8 px-4">
                  Nothing matched “{query}”. Try a feeling like “anxious” or “drained”, or ask Nova.
                </p>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default CommandPalette;
