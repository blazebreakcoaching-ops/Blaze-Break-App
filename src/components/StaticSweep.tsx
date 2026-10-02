import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Sparkles, RotateCcw, Plus, X, ChevronDown } from 'lucide-react';
import { cn } from '../lib/utils';
import { SweepItem, SweepCategory, SWEEP_CATEGORY_ORDER, SWEEP_CATEGORY_LABELS, createSweepItem } from '../../reset-studio-engine';
import { updateNovaMemoryBySourceAndType } from '../lib/nova-brain';

type Phase = 'collect' | 'sort' | 'choose_one' | 'done';

let sweepItemCounter = 0;
const nextSweepItemId = () => `sweep_${Date.now()}_${sweepItemCounter++}`;

export const StaticSweep = () => {
  const [phase, setPhase] = useState<Phase>('collect');
  const [items, setItems] = useState<SweepItem[]>([]);
  const [draft, setDraft] = useState('');
  const [chosenId, setChosenId] = useState<string | null>(null);

  const addItem = () => {
    const text = draft.trim();
    if (!text) return;
    setItems((prev) => [...prev, createSweepItem(nextSweepItemId(), text)]);
    setDraft('');
  };

  const removeItem = (id: string) => setItems((prev) => prev.filter((i) => i.id !== id));

  const setCategory = (id: string, category: SweepCategory) => {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, category } : i)));
  };

  const allSorted = items.length > 0 && items.every((i) => i.category !== null);

  const handleChooseOne = (id: string) => {
    setChosenId(id);
    setPhase('done');
    updateNovaMemoryBySourceAndType('Static Sweep', 'state', {
      content: 'Used the Static Sweep to unload competing thoughts and settled on one to hold onto.',
      confidence: 'verified',
      canEdit: false,
    });
  };

  const resetAll = () => {
    setPhase('collect');
    setItems([]);
    setDraft('');
    setChosenId(null);
  };

  const chosen = items.find((i) => i.id === chosenId) || null;
  const parked = items.filter((i) => i.id !== chosenId);

  return (
    <div className="card bg-background border border-border p-10 lg:p-14 text-text-main relative overflow-hidden">
      <div className="relative z-10 max-w-3xl space-y-10 mx-auto">
        <div className="space-y-6 text-center flex flex-col items-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-sky-500/10 to-primary/10 border border-primary/20 text-primary">
            <Sparkles className="w-8 h-8" />
          </div>
          <div className="space-y-4">
            <h3 className="text-4xl lg:text-5xl font-display font-extrabold tracking-tight text-text-main">The Static Sweep</h3>
            <p className="text-text-muted leading-relaxed max-w-xl text-center mx-auto text-sm lg:text-base">
              Too many thoughts competing at once? Put them down here.
            </p>
          </div>
        </div>

        {phase === 'collect' && (
          <div className="space-y-6">
            <div className="flex gap-2">
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addItem(); } }}
                placeholder="Type one thing, press Enter..."
                aria-label="Add a thought"
                className="flex-1 bg-surface dark:bg-surface/50 border border-border/50 rounded-2xl px-6 py-4 text-lg text-text-main placeholder-text-muted/60 focus:outline-none focus:border-primary"
              />
              <button
                onClick={addItem}
                disabled={!draft.trim()}
                aria-label="Add"
                className="px-5 rounded-2xl bg-surface dark:bg-card border border-border text-text-main hover:bg-border transition-colors disabled:opacity-40"
              >
                <Plus className="w-5 h-5" />
              </button>
            </div>

            {items.length > 0 && (
              <div className="space-y-2">
                <AnimatePresence initial={false}>
                  {items.map((item) => (
                    <motion.div
                      key={item.id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 10 }}
                      className="flex items-center justify-between gap-3 p-3 rounded-xl border border-border bg-surface/40"
                    >
                      <span className="text-sm text-text-main">{item.text}</span>
                      <button onClick={() => removeItem(item.id)} aria-label={`Remove ${item.text}`} className="text-text-muted hover:text-destructive transition-colors shrink-0">
                        <X className="w-4 h-4" />
                      </button>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            )}

            <button
              onClick={() => setPhase('sort')}
              disabled={items.length === 0}
              className="w-full py-5 rounded-2xl font-black uppercase tracking-[0.2em] text-[11px] bg-surface dark:bg-card text-text-main disabled:opacity-40 disabled:cursor-not-allowed transition-all hover:bg-border"
            >
              That's everything
            </button>
          </div>
        )}

        {phase === 'sort' && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
            <p className="text-text-muted text-center">Sort each one - where does it actually belong?</p>
            <div className="space-y-3">
              {items.map((item) => (
                <div key={item.id} className="p-4 rounded-xl border border-border bg-surface/40 space-y-3">
                  <p className="text-text-main font-medium">{item.text}</p>
                  <div className="flex flex-wrap gap-2">
                    {SWEEP_CATEGORY_ORDER.map((cat) => (
                      <button
                        key={cat}
                        onClick={() => setCategory(item.id, cat)}
                        aria-pressed={item.category === cat}
                        className={cn(
                          'px-3 py-1.5 rounded-lg border text-xs font-bold transition-colors',
                          item.category === cat
                            ? 'bg-primary border-primary text-primary-foreground'
                            : 'border-border text-text-muted hover:text-text-main hover:border-primary/40'
                        )}
                      >
                        {SWEEP_CATEGORY_LABELS[cat]}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <button
              onClick={() => setPhase('choose_one')}
              disabled={!allSorted}
              className="w-full py-5 rounded-2xl font-black uppercase tracking-[0.2em] text-[11px] bg-surface dark:bg-card text-text-main disabled:opacity-40 disabled:cursor-not-allowed transition-all hover:bg-border"
            >
              Continue
            </button>
          </motion.div>
        )}

        {phase === 'choose_one' && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
            <p className="text-xl font-medium text-text-main text-center">What is the one thing you want your brain to hold onto?</p>
            <div className="space-y-4">
              {SWEEP_CATEGORY_ORDER.map((cat) => {
                const catItems = items.filter((i) => i.category === cat);
                if (catItems.length === 0) return null;
                return (
                  <div key={cat} className="space-y-2">
                    <span className="text-xs font-black uppercase tracking-widest text-text-muted">{SWEEP_CATEGORY_LABELS[cat]}</span>
                    <div className="space-y-2">
                      {catItems.map((item) => (
                        <button
                          key={item.id}
                          onClick={() => handleChooseOne(item.id)}
                          className="w-full text-left p-3 rounded-xl border border-border hover:border-primary/50 text-text-main transition-colors"
                        >
                          {item.text}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}

        {phase === 'done' && chosen && (
          <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} role="status" aria-live="polite" className="space-y-8 text-center">
            <div className="p-8 rounded-2xl border border-primary/30 bg-primary/5 space-y-2">
              <span className="text-xs font-black uppercase tracking-widest text-primary">Hold onto this</span>
              <p className="text-2xl font-display font-bold text-text-main">{chosen.text}</p>
            </div>

            {parked.length > 0 && (
              <ParkedList items={parked} />
            )}

            <button
              onClick={resetAll}
              className="text-xs font-black uppercase tracking-[0.2em] text-text-muted hover:text-text-main flex items-center gap-2 transition-colors px-6 py-3 rounded-full hover:bg-white/[0.02] border border-transparent hover:border-white/[0.05] mx-auto"
            >
              <RotateCcw className="w-3 h-3" /> Start Over
            </button>
          </motion.div>
        )}
      </div>
    </div>
  );
};

const ParkedList = ({ items }: { items: SweepItem[] }) => {
  const [open, setOpen] = useState(false);
  return (
    <div className="text-left">
      <button onClick={() => setOpen((v) => !v)} className="text-xs font-bold text-text-muted hover:text-text-main flex items-center gap-1.5 mx-auto">
        <ChevronDown className={cn('w-3.5 h-3.5 transition-transform', open && 'rotate-180')} />
        Everything else is parked for now ({items.length})
      </button>
      {open && (
        <div className="mt-3 space-y-1.5">
          {items.map((item) => (
            <div key={item.id} className="text-xs text-text-muted p-2 rounded-lg bg-surface/30 flex justify-between gap-2">
              <span>{item.text}</span>
              <span className="shrink-0 uppercase tracking-widest font-bold opacity-60">{item.category}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
