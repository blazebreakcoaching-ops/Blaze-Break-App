import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { CloudRain, RotateCcw, Plus } from 'lucide-react';
import { cn } from '../lib/utils';
import { auth } from '../lib/firebase';
import { loadStressors, resolveStressor, reportStressorReduction, addStressor } from '../lib/energy-delta-service';
import { Stressor } from '../../energy-delta-engine';
import { SmallerAction, SMALLER_ACTION_ORDER, SMALLER_ACTION_LABELS, SMALLER_ACTION_RESOLVES, SMALLER_ACTION_REDUCES_TODAY } from '../../reset-studio-engine';
import { updateNovaMemoryBySourceAndType } from '../lib/nova-brain';

type Phase = 'loading' | 'collect' | 'queue' | 'done';

export const MakeItSmaller = () => {
  const [phase, setPhase] = useState<Phase>('loading');
  const [queue, setQueue] = useState<Stressor[]>([]);
  const [index, setIndex] = useState(0);
  const [nowItems, setNowItems] = useState<Stressor[]>([]);
  const [draft, setDraft] = useState('');
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    const load = async () => {
      if (!auth.currentUser) { setPhase('collect'); return; }
      try {
        const list = await loadStressors(auth.currentUser.uid);
        const active = list.filter((s) => s.status === 'active');
        setQueue(active);
        setPhase(active.length > 0 ? 'queue' : 'collect');
      } catch {
        setPhase('collect');
      }
    };
    load();
  }, []);

  const handleAddDemand = async () => {
    const text = draft.trim();
    if (!text || !auth.currentUser || adding) return;
    setAdding(true);
    try {
      const created = await addStressor(auth.currentUser.uid, { name: text, category: 'professional', severity: 3, persistence: 'one_off' });
      setQueue((prev) => [...prev, created]);
      setDraft('');
      setPhase('queue');
    } finally {
      setAdding(false);
    }
  };

  const current = queue[index] || null;

  const handleDecision = async (action: SmallerAction) => {
    if (!current || !auth.currentUser) return;
    const uid = auth.currentUser.uid;
    if (action === 'now') {
      setNowItems((prev) => [...prev, current]);
    } else {
      try {
        if (SMALLER_ACTION_RESOLVES[action]) {
          await resolveStressor(uid, current.id);
        } else if (SMALLER_ACTION_REDUCES_TODAY[action]) {
          await reportStressorReduction(uid, current.id, 'a_lot');
        }
      } catch {
        // Non-fatal - the user's decision still moves them forward even if this write fails.
      }
    }
    const nextIndex = index + 1;
    if (nextIndex >= queue.length) {
      setPhase('done');
      updateNovaMemoryBySourceAndType('Make It Smaller', 'state', {
        content: 'Used Make It Smaller to reduce the number of things feeling real and urgent right now.',
        confidence: 'verified',
        canEdit: true,
      });
    } else {
      setIndex(nextIndex);
    }
  };

  const resetAll = () => {
    setPhase('loading');
    setQueue([]);
    setIndex(0);
    setNowItems([]);
    setDraft('');
    if (auth.currentUser) {
      loadStressors(auth.currentUser.uid).then((list) => {
        const active = list.filter((s) => s.status === 'active');
        setQueue(active);
        setPhase(active.length > 0 ? 'queue' : 'collect');
      });
    } else {
      setPhase('collect');
    }
  };

  return (
    <div className="card bg-background border border-border p-10 lg:p-14 text-text-main relative overflow-hidden">
      <div className="relative z-10 max-w-3xl space-y-10 mx-auto">
        <div className="space-y-6 text-center flex flex-col items-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-sky-500/10 to-slate-500/10 border border-sky-500/20 text-sky-600 dark:text-sky-400">
            <CloudRain className="w-8 h-8" />
          </div>
          <div className="space-y-4">
            <h3 className="text-4xl lg:text-5xl font-display font-extrabold tracking-tight text-text-main">Make It Smaller</h3>
            <p className="text-text-muted leading-relaxed max-w-xl text-center mx-auto text-sm lg:text-base">
              When everything feels urgent, make fewer things real.
            </p>
          </div>
        </div>

        {phase === 'loading' && (
          <p className="text-center text-text-muted">Gathering what's on your plate...</p>
        )}

        {(phase === 'collect' || phase === 'queue') && (
          <div className="space-y-3">
            <div className="flex gap-2">
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddDemand(); } }}
                placeholder="What else is weighing on you?"
                aria-label="Add a demand"
                className="flex-1 bg-surface dark:bg-surface/50 border border-border/50 rounded-2xl px-6 py-3 text-base text-text-main placeholder-text-muted/60 focus:outline-none focus:border-primary"
              />
              <button
                onClick={handleAddDemand}
                disabled={!draft.trim() || adding}
                aria-label="Add"
                className="px-5 rounded-2xl bg-surface dark:bg-card border border-border text-text-main hover:bg-border transition-colors disabled:opacity-40"
              >
                <Plus className="w-5 h-5" />
              </button>
            </div>
            {phase === 'collect' && (
              <p className="text-xs text-text-muted text-center">Add what's on your plate, one at a time - we'll go through them right after.</p>
            )}
          </div>
        )}

        {phase === 'queue' && current && (
          <AnimatePresence mode="wait">
            <motion.div
              key={current.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-6"
            >
              <div className="text-center text-xs font-black uppercase tracking-widest text-text-muted">
                {index + 1} of {queue.length}
              </div>
              <div className="p-8 rounded-2xl border border-border bg-surface/60 text-center">
                <p className="text-2xl font-display font-bold text-text-main">{current.name}</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {SMALLER_ACTION_ORDER.map((action) => (
                  <button
                    key={action}
                    onClick={() => handleDecision(action)}
                    className={cn(
                      'py-4 rounded-xl border font-bold transition-colors',
                      action === 'now'
                        ? 'border-primary/40 text-primary hover:bg-primary/10'
                        : 'border-border text-text-muted hover:text-text-main hover:border-primary/40'
                    )}
                  >
                    {SMALLER_ACTION_LABELS[action]}
                  </button>
                ))}
              </div>
            </motion.div>
          </AnimatePresence>
        )}

        {phase === 'done' && (
          <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} role="status" aria-live="polite" className="space-y-6 text-center">
            <p className="text-xl font-display font-medium text-text-main">For now, your world is this small.</p>
            {nowItems.length === 0 ? (
              <p className="text-text-muted">Nothing had to stay. That's allowed too.</p>
            ) : (
              <div className="space-y-2 max-w-md mx-auto text-left">
                {nowItems.map((item) => (
                  <div key={item.id} className="p-4 rounded-xl border border-primary/30 bg-primary/5">
                    <p className="font-bold text-text-main">{item.name}</p>
                  </div>
                ))}
              </div>
            )}
            <p className="text-xs text-text-muted">The rest is reflected in your Capacity Protected and Energy Delta already.</p>
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
