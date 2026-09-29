import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, ArrowRight, Plus, CheckCircle2, Trash2 } from 'lucide-react';
import { cn } from '../lib/utils';
import { auth } from '../lib/firebase';
import { db } from '../lib/firestore';
import { collection, addDoc, getDocs, query, orderBy, deleteDoc, doc } from 'firebase/firestore';
import { logGroundingEvent } from '../lib/grounding-analytics';

type Classification = 'mine_to_act_on' | 'mine_to_influence' | 'shared_responsibility' | 'outside_control' | 'not_sure';

const CLASSIFICATION_OPTIONS: { id: Classification; label: string }[] = [
  { id: 'mine_to_act_on', label: 'Mine to act on' },
  { id: 'mine_to_influence', label: 'Mine to influence' },
  { id: 'shared_responsibility', label: 'Shared responsibility' },
  { id: 'outside_control', label: 'Outside my control' },
  { id: 'not_sure', label: "I'm not sure" },
];

interface CarryingItem {
  id: string;
  burdenText: string;
  classification: Classification;
  genuinelyMineText?: string;
  notMineText?: string;
  releaseWithoutAbandoningText?: string;
  createdAt: string;
}

interface GroundingCarryingExerciseProps {
  onClose: () => void;
}

type FormStep = 'burden' | 'classify' | 'genuinely_mine' | 'not_mine' | 'release';

export const GroundingCarryingExercise = ({ onClose }: GroundingCarryingExerciseProps) => {
  const [items, setItems] = useState<CarryingItem[]>([]);
  const [itemsLoaded, setItemsLoaded] = useState(false);
  const [adding, setAdding] = useState(false);

  const [step, setStep] = useState<FormStep>('burden');
  const [burdenText, setBurdenText] = useState('');
  const [classification, setClassification] = useState<Classification | null>(null);
  const [genuinelyMineText, setGenuinelyMineText] = useState('');
  const [notMineText, setNotMineText] = useState('');
  const [releaseText, setReleaseText] = useState('');

  useEffect(() => {
    const load = async () => {
      if (!auth.currentUser) { setItemsLoaded(true); return; }
      try {
        const snap = await getDocs(query(collection(db, 'users', auth.currentUser.uid, 'carrying_items'), orderBy('createdAt', 'desc')));
        setItems(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<CarryingItem, 'id'>) })));
      } catch (e) {
        // Leaves the list empty rather than guessing at history.
      }
      setItemsLoaded(true);
    };
    load();
  }, []);

  const resetForm = () => {
    setStep('burden');
    setBurdenText('');
    setClassification(null);
    setGenuinelyMineText('');
    setNotMineText('');
    setReleaseText('');
    setAdding(false);
  };

  const handleSaveItem = async () => {
    if (!auth.currentUser || !burdenText.trim() || !classification) return;
    const now = new Date().toISOString();
    const record: Record<string, unknown> = {
      burdenText: burdenText.trim().slice(0, 80),
      classification,
      createdAt: now,
      updatedAt: now,
    };
    if (genuinelyMineText.trim()) record.genuinelyMineText = genuinelyMineText.trim().slice(0, 300);
    if (notMineText.trim()) record.notMineText = notMineText.trim().slice(0, 300);
    if (releaseText.trim()) record.releaseWithoutAbandoningText = releaseText.trim().slice(0, 300);

    try {
      const ref = await addDoc(collection(db, 'users', auth.currentUser.uid, 'carrying_items'), record);
      setItems((prev) => [{ id: ref.id, ...(record as any) }, ...prev]);
      logGroundingEvent('carrying_exercise_completed');
    } catch (e) {
      // Non-fatal - resets the form either way so the person isn't stuck.
    }
    resetForm();
  };

  const handleDelete = async (id: string) => {
    if (!auth.currentUser) return;
    setItems((prev) => prev.filter((i) => i.id !== id));
    deleteDoc(doc(db, 'users', auth.currentUser.uid, 'carrying_items', id)).catch(() => {});
  };

  return (
    <div className="fixed inset-0 z-[90] bg-background/95 backdrop-blur-sm flex items-start sm:items-center justify-center p-4 overflow-y-auto">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-2xl bg-card border border-border/40 rounded-2xl p-8 space-y-8 my-8"
      >
        <div className="flex items-center justify-between">
          <h3 className="text-2xl font-display font-bold text-text-main">What am I carrying that isn't mine?</h3>
          <button onClick={onClose} aria-label="Close" className="text-text-muted hover:text-text-main">
            <X className="w-4 h-4" />
          </button>
        </div>

        {!adding ? (
          <div className="space-y-6">
            {itemsLoaded && items.length === 0 && (
              <p className="text-sm text-text-muted">Add a burden below to start sorting what's genuinely yours from what isn't.</p>
            )}
            <div className="space-y-3">
              {items.map((item) => (
                <div key={item.id} className="p-4 rounded-xl border border-border/20 bg-white/40 dark:bg-card/40 flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-bold text-text-main">{item.burdenText}</p>
                    <p className="text-[11px] text-text-muted mt-0.5">{CLASSIFICATION_OPTIONS.find((c) => c.id === item.classification)?.label}</p>
                  </div>
                  <button onClick={() => handleDelete(item.id)} aria-label="Remove" className="text-text-muted hover:text-destructive shrink-0">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
            <div className="flex justify-between items-center pt-2">
              <button onClick={() => setAdding(true)} className="px-5 py-2.5 bg-primary/10 text-[#9a3412] dark:text-primary rounded-xl text-xs font-black uppercase tracking-widest flex items-center gap-2">
                <Plus className="w-3.5 h-3.5" /> Add a burden
              </button>
              <button onClick={onClose} className="px-5 py-2.5 border border-border/40 rounded-xl text-xs font-black uppercase tracking-widest text-text-muted hover:text-text-main">
                Done for now
              </button>
            </div>
          </div>
        ) : (
          <AnimatePresence mode="wait">
            {step === 'burden' && (
              <motion.div key="burden" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-6">
                <h4 className="text-sm font-bold text-text-main">What's one thing you're carrying right now?</h4>
                <input value={burdenText} onChange={(e) => setBurdenText(e.target.value.slice(0, 80))} autoFocus
                  placeholder="Name it in a few words..."
                  className="w-full p-4 rounded-xl border border-border/40 bg-white dark:bg-surface text-sm text-text-main" />
                <div className="flex justify-end">
                  <button disabled={!burdenText.trim()} onClick={() => setStep('classify')}
                    className="px-6 py-3 bg-primary text-primary-foreground rounded-xl text-xs font-black uppercase tracking-widest flex items-center gap-2 disabled:opacity-40">
                    Continue <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </motion.div>
            )}

            {step === 'classify' && (
              <motion.div key="classify" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-6">
                <h4 className="text-sm font-bold text-text-main">Is "{burdenText}" primarily...</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {CLASSIFICATION_OPTIONS.map((opt) => (
                    <button key={opt.id} onClick={() => setClassification(opt.id)} aria-pressed={classification === opt.id}
                      className={cn('p-4 rounded-xl border text-left text-sm font-bold transition-all',
                        classification === opt.id ? 'bg-primary/10 border-primary/45 text-[#9a3412] dark:text-primary' : 'bg-white dark:bg-surface border-border/40 text-text-main')}>
                      {opt.label}
                    </button>
                  ))}
                </div>
                <div className="flex justify-end">
                  <button disabled={!classification} onClick={() => setStep('genuinely_mine')}
                    className="px-6 py-3 bg-primary text-primary-foreground rounded-xl text-xs font-black uppercase tracking-widest flex items-center gap-2 disabled:opacity-40">
                    Continue <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </motion.div>
            )}

            {step === 'genuinely_mine' && (
              <motion.div key="genuinely_mine" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-6">
                <h4 className="text-sm font-bold text-text-main">What responsibility here is genuinely yours?</h4>
                <textarea value={genuinelyMineText} onChange={(e) => setGenuinelyMineText(e.target.value.slice(0, 300))} rows={3}
                  className="w-full p-4 rounded-xl border border-border/40 bg-white dark:bg-surface text-sm text-text-main" />
                <div className="flex justify-end">
                  <button onClick={() => setStep('not_mine')} className="px-6 py-3 bg-primary text-primary-foreground rounded-xl text-xs font-black uppercase tracking-widest flex items-center gap-2">
                    Continue <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </motion.div>
            )}

            {step === 'not_mine' && (
              <motion.div key="not_mine" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-6">
                <h4 className="text-sm font-bold text-text-main">What are you taking responsibility for that may belong to someone else?</h4>
                <textarea value={notMineText} onChange={(e) => setNotMineText(e.target.value.slice(0, 300))} rows={3}
                  className="w-full p-4 rounded-xl border border-border/40 bg-white dark:bg-surface text-sm text-text-main" />
                <div className="flex justify-end">
                  <button onClick={() => setStep('release')} className="px-6 py-3 bg-primary text-primary-foreground rounded-xl text-xs font-black uppercase tracking-widest flex items-center gap-2">
                    Continue <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </motion.div>
            )}

            {step === 'release' && (
              <motion.div key="release" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-6">
                <h4 className="text-sm font-bold text-text-main">
                  What would releasing that responsibility look like - without abandoning what genuinely belongs to you?
                </h4>
                <textarea value={releaseText} onChange={(e) => setReleaseText(e.target.value.slice(0, 300))} rows={3}
                  className="w-full p-4 rounded-xl border border-border/40 bg-white dark:bg-surface text-sm text-text-main" />
                <div className="flex justify-end">
                  <button onClick={handleSaveItem} className="px-6 py-3 bg-primary text-primary-foreground rounded-xl text-xs font-black uppercase tracking-widest flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4" /> Save
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        )}
      </motion.div>
    </div>
  );
};
