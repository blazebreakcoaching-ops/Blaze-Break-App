import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Search, CornerDownLeft, Sparkles, LifeBuoy, ArrowRight } from 'lucide-react';
import { cn } from '../lib/utils';
import { useFocusTrap } from '../lib/useFocusTrap';
import { getAvailableMoods, matchTabs } from '../lib/paletteMatch';

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
  // Pre-fills the search on open — used by the "Hey Nova" wake-word
  // listener to hand off what it heard after the wake phrase.
  initialQuery?: string;
}

export const CommandPalette = ({ isOpen, onClose, tabs, onNavigate, onTalkToNova, onCrisis, initialQuery }: CommandPaletteProps) => {
  const dialogRef = useFocusTrap(isOpen);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [query, setQuery] = useState('');
  const [highlight, setHighlight] = useState(0);

  useEffect(() => {
    if (isOpen) {
      setQuery(initialQuery ?? '');
      setHighlight(0);
      // Focus the input once the dialog is mounted.
      const t = setTimeout(() => inputRef.current?.focus(), 40);
      return () => clearTimeout(t);
    }
    // Only re-run when the dialog opens/closes — a changing initialQuery
    // while already open shouldn't yank focus/text out from under someone
    // mid-edit.
  }, [isOpen]);

  const tabById = useMemo(() => new Map(tabs.map((t) => [t.id, t])), [tabs]);
  const availableMoods = useMemo(() => getAvailableMoods(new Set(tabById.keys())), [tabById]);

  // Flat, ordered list of selectable results for the current query.
  const results = useMemo(() => matchTabs(tabs, query), [query, tabs]);

  useEffect(() => { setHighlight(0); }, [query]);

  // A window-level listener, not just the dialog's own onKeyDown below -
  // matching NovaFeedbackModal.tsx/SettingsModal.tsx's established pattern.
  // The div-level handler only fires when focus is actually inside the
  // dialog; that's reliable when the palette opens from a click, but when
  // it opens from the "Hey Nova" wake word (an async voice callback, not a
  // direct user gesture) focus landing inside the dialog is less
  // dependable, and Escape would silently do nothing. This works
  // regardless of where focus actually is.
  useEffect(() => {
    if (!isOpen) return;
    const onWindowKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onWindowKeyDown);
    return () => window.removeEventListener('keydown', onWindowKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const choose = (id: string) => {
    onNavigate(id);
    onClose();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setHighlight((h) => Math.min(h + 1, results.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHighlight((h) => Math.max(h - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); const r = results[highlight]; if (r) choose(r.id); }
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
            <div className="flex items-center gap-3 px-4 py-3.5 border-b border-border focus-within:border-primary/50 transition-colors">
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
