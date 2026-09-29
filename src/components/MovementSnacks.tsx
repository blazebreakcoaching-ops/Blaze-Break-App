import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Activity, ArrowLeft, CheckCircle2, Star, Zap, Armchair, ChevronRight, Timer,
} from 'lucide-react';
import { cn } from '../lib/utils';
import { auth } from '../lib/firebase';
import { BurnoutFingerprint } from '../types';
import { updateNovaMemoryBySourceAndType } from '../lib/nova-brain';
import { useFeatureFlags } from '../lib/feature-flags';
import {
  MOVEMENT_SNACKS, MOVEMENT_CATEGORY_ORDER, MOVEMENT_CATEGORY_LABELS, MOVEMENTS_BY_CATEGORY,
  MOVEMENT_CONTEXT_ORDER, MOVEMENT_CONTEXT_LABELS, MOVEMENT_FEEDBACK_OPTIONS, MovementContext, MovementFeedback,
} from '../../movement-snacks-content';
import { getMovementRecommendation, getQuickReset, getGentlerAlternative } from '../../movement-snacks-recommendation';
import {
  loadMovementPreferences, toggleFavourite as toggleFavouriteService, recordMovementHistory,
  loadRecentMovementHistory, computeUsageFromHistory,
} from '../lib/movement-snacks-service';
import { logMovementEvent } from '../lib/movement-analytics';

interface MovementSnacksProps {
  fingerprint: BurnoutFingerprint | null;
  onAwardPoints?: (amount: number, reason: string) => void;
}

type View = 'entry' | 'browse' | 'detail' | 'player' | 'checkout' | 'complete';

const QUICK_DURATIONS: { seconds: 30 | 60 | 180; label: string }[] = [
  { seconds: 30, label: '30 sec' },
  { seconds: 60, label: '1 min' },
  { seconds: 180, label: '3 mins' },
];

const formatDuration = (seconds: number): string => {
  if (seconds < 60) return `${seconds} secs`;
  const mins = Math.round(seconds / 60);
  return `${mins} min${mins === 1 ? '' : 's'}`;
};

export const MovementSnacks = ({ fingerprint: _fingerprint, onAwardPoints }: MovementSnacksProps) => {
  const flags = useFeatureFlags();
  const [view, setView] = useState<View>('entry');
  const [seatedOnly, setSeatedOnly] = useState(false);
  const [activeMovementId, setActiveMovementId] = useState<string | null>(null);
  const [activeContext, setActiveContext] = useState<MovementContext | null>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [favourites, setFavourites] = useState<string[]>([]);
  const [usage, setUsage] = useState<ReturnType<typeof computeUsageFromHistory>>([]);
  const [feedback, setFeedback] = useState<MovementFeedback | null>(null);

  useEffect(() => {
    if (!auth.currentUser) return;
    const uid = auth.currentUser.uid;
    Promise.all([loadMovementPreferences(uid), loadRecentMovementHistory(uid)]).then(([prefs, history]) => {
      setFavourites(prefs.favourites || []);
      setUsage(computeUsageFromHistory(history, prefs.favourites || []));
    });
  }, []);

  const activeMovement = activeMovementId ? MOVEMENT_SNACKS[activeMovementId] : null;

  const goToDetail = (movementId: string, context: MovementContext | null) => {
    setActiveMovementId(movementId);
    setActiveContext(context);
    setStepIndex(0);
    setFeedback(null);
    setView('detail');
  };

  const handleContextPick = (context: MovementContext) => {
    const rec = getMovementRecommendation({ context, seatedOnly, usage });
    if (rec) goToDetail(rec.movementId, context);
  };

  const handleQuickPick = (seconds: 30 | 60 | 180) => {
    const rec = getQuickReset(seconds, usage);
    if (rec) goToDetail(rec.movementId, 'quick');
  };

  const handleBegin = () => {
    if (!activeMovement) return;
    logMovementEvent('movement_started', { movementId: activeMovement.id, category: activeMovement.category });
    if (auth.currentUser) {
      recordMovementHistory(auth.currentUser.uid, { movementId: activeMovement.id, context: activeContext || undefined, skipped: false }).catch(() => {});
    }
    setStepIndex(0);
    setView('player');
  };

  const handleStopNow = () => {
    if (activeMovement && auth.currentUser) {
      logMovementEvent('movement_skipped', { movementId: activeMovement.id, category: activeMovement.category });
      recordMovementHistory(auth.currentUser.uid, { movementId: activeMovement.id, context: activeContext || undefined, skipped: true }).catch(() => {});
    }
    setView('entry');
  };

  const handleFinishSteps = () => {
    setView(flags.enable_movement_feedback ? 'checkout' : 'complete');
  };

  const finishMovement = () => {
    if (!activeMovement) return;
    logMovementEvent('movement_completed', { movementId: activeMovement.id, category: activeMovement.category });
    if (onAwardPoints) onAwardPoints(10, 'Completed a Movement Snack');
    updateNovaMemoryBySourceAndType('Movement Snacks', 'state', {
      content: `Completed a movement reset: "${activeMovement.title}".`,
      confidence: 'verified',
      canEdit: true,
    });
    setView('complete');
  };

  const handleFeedbackPick = (choice: MovementFeedback) => {
    setFeedback(choice);
    logMovementEvent('movement_feedback_selected', { movementId: activeMovementId || undefined, category: activeMovement?.category });
    if (auth.currentUser && activeMovementId) {
      recordMovementHistory(auth.currentUser.uid, { movementId: activeMovementId, context: activeContext || undefined, skipped: false, feedback: choice }).catch(() => {});
    }
    if (choice !== 'more_uncomfortable') finishMovement();
  };

  const handleChooseGentler = () => {
    if (!activeMovementId) return;
    const gentler = getGentlerAlternative(activeMovementId);
    if (gentler) goToDetail(gentler, activeContext);
    else setView('entry');
  };

  const handleToggleFavourite = (movementId: string) => {
    const isFav = favourites.includes(movementId);
    const next = isFav ? favourites.filter((id) => id !== movementId) : [...favourites, movementId];
    setFavourites(next);
    if (auth.currentUser) toggleFavouriteService(auth.currentUser.uid, movementId, !isFav).catch(() => {});
  };

  const browseMovements = useMemo(() => {
    const filterSeated = (ids: string[]) => (seatedOnly ? ids.filter((id) => MOVEMENT_SNACKS[id]!.supportedPositions.includes('seated')) : ids);
    return MOVEMENT_CATEGORY_ORDER.map((category) => ({
      category,
      ids: filterSeated(MOVEMENTS_BY_CATEGORY[category]),
    })).filter((group) => group.ids.length > 0);
  }, [seatedOnly]);

  return (
    <div className="space-y-12 pb-24">
      <div className="max-w-4xl">
        <div className="flex items-center gap-4 mb-4">
          <div className="tag">Section 12 / Movement</div>
          <div className="h-px flex-1 bg-border/40" />
        </div>
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-6">
          <div className="space-y-4">
            <h3 className="text-5xl font-display font-bold text-text-main tracking-tight">Movement Snacks</h3>
            <p className="text-xl text-text-muted font-medium max-w-2xl">
              "Not gym plans. Not fitness bro punishment. Small physical resets to break tension loops."
            </p>
          </div>
        </div>
      </div>

      <AnimatePresence mode="wait">
        {view === 'entry' && (
          <motion.div key="entry" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-8">
            <div className="space-y-4">
              <h4 className="text-2xl font-display font-bold text-text-main">What do you need right now?</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {MOVEMENT_CONTEXT_ORDER.filter((c) => c !== 'quick').map((context) => (
                  <button
                    key={context}
                    onClick={() => handleContextPick(context)}
                    className="p-5 rounded-2xl border border-border hover:border-success/50 hover:bg-surface dark:hover:bg-surface text-left transition-all flex items-center justify-between gap-3 group"
                  >
                    <span className="text-base font-bold text-text-main">{MOVEMENT_CONTEXT_LABELS[context]}</span>
                    <ChevronRight className="w-4 h-4 text-text-muted group-hover:text-success shrink-0" />
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <h5 className="text-xs uppercase font-black tracking-widest text-text-muted">Just give me something quick</h5>
              <div className="flex flex-wrap gap-3">
                {QUICK_DURATIONS.map((q) => (
                  <button
                    key={q.seconds}
                    onClick={() => handleQuickPick(q.seconds)}
                    className="px-5 py-3 rounded-xl bg-success/10 text-[#166534] dark:text-[#4ade80] font-black text-sm uppercase tracking-widest flex items-center gap-2 hover:bg-success/20 transition-colors"
                  >
                    <Timer className="w-4 h-4" /> {q.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-4 pt-2 border-t border-border/40">
              <button
                onClick={() => setSeatedOnly((v) => !v)}
                aria-pressed={seatedOnly}
                className={cn(
                  'px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest flex items-center gap-2 transition-colors mt-4',
                  seatedOnly ? 'bg-primary text-primary-foreground' : 'bg-surface dark:bg-surface text-text-muted hover:text-text-main'
                )}
              >
                <Armchair className="w-3.5 h-3.5" /> I need to stay where I am
              </button>
              <button onClick={() => setView('browse')} className="text-xs font-black uppercase tracking-widest text-text-muted hover:text-text-main mt-4">
                Browse all Movement Snacks
              </button>
            </div>
          </motion.div>
        )}

        {view === 'browse' && (
          <motion.div key="browse" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-10">
            <button onClick={() => setView('entry')} className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-text-muted hover:text-text-main">
              <ArrowLeft className="w-3.5 h-3.5" /> Back
            </button>
            {browseMovements.map(({ category, ids }) => (
              <div key={category} className="space-y-4">
                <div>
                  <h5 className="text-lg font-display font-bold text-text-main">{MOVEMENT_CATEGORY_LABELS[category].label}</h5>
                  <p className="text-sm text-text-muted">{MOVEMENT_CATEGORY_LABELS[category].description}</p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {ids.map((id) => {
                    const m = MOVEMENT_SNACKS[id]!;
                    return (
                      <button
                        key={id}
                        onClick={() => goToDetail(id, null)}
                        className="p-5 rounded-2xl border border-border hover:border-success/50 hover:bg-surface dark:hover:bg-surface text-left transition-all space-y-2"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-black uppercase tracking-widest px-2.5 py-1 rounded-full bg-surface dark:bg-surface text-text-muted">
                            {formatDuration(m.durationSeconds)}
                          </span>
                          {flags.enable_movement_favourites && favourites.includes(id) && <Star className="w-4 h-4 fill-primary text-primary" />}
                        </div>
                        <h6 className="text-base font-display font-bold text-text-main">{m.title}</h6>
                        <p className="text-xs text-text-muted">{m.shortDescription}</p>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </motion.div>
        )}

        {view === 'detail' && activeMovement && (
          <motion.div key="detail" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="card border border-success/20 bg-success/5 p-6 sm:p-8 md:p-10 space-y-8">
            <button onClick={() => setView(activeContext ? 'entry' : 'browse')} className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-text-muted hover:text-text-main">
              <ArrowLeft className="w-3.5 h-3.5" /> Back
            </button>
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <span className="text-xs font-black uppercase tracking-widest px-3 py-1 rounded-full bg-surface dark:bg-surface text-text-muted">
                  {formatDuration(activeMovement.durationSeconds)}
                </span>
                {flags.enable_movement_favourites && (
                  <button onClick={() => handleToggleFavourite(activeMovement.id)} aria-label="Save as favourite" aria-pressed={favourites.includes(activeMovement.id)}>
                    <Star className={cn('w-5 h-5', favourites.includes(activeMovement.id) ? 'fill-primary text-primary' : 'text-text-muted')} />
                  </button>
                )}
              </div>
              <h4 className="text-3xl font-display font-bold text-text-main">{activeMovement.title}</h4>
              <p className="text-lg text-text-muted font-medium">{activeMovement.shortDescription}</p>
              <p className="text-xs text-text-muted uppercase font-black tracking-widest">
                Suitable: {activeMovement.supportedPositions.map((p) => (p === 'seated' ? 'Seated' : 'Standing')).join(' or ')}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <button onClick={handleBegin} className="btn-primary bg-success hover:bg-success border-success text-white">
                <Activity className="w-4 h-4" /> Begin Movement
              </button>
              <button onClick={() => setView(activeContext ? 'entry' : 'browse')} className="text-xs font-black uppercase tracking-widest text-text-muted hover:text-text-main">
                Choose another
              </button>
            </div>
          </motion.div>
        )}

        {view === 'player' && activeMovement && (
          <motion.div key="player" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="card border border-success/20 bg-success/5 p-6 sm:p-8 md:p-10 space-y-10">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black uppercase tracking-widest text-text-muted">
                Step {stepIndex + 1} of {activeMovement.steps.length}
              </span>
              <button onClick={handleStopNow} className="text-xs font-black uppercase tracking-widest text-text-muted hover:text-text-main">
                Stop
              </button>
            </div>

            <AnimatePresence mode="wait">
              <motion.div
                key={stepIndex}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="text-center py-10 space-y-4"
              >
                <h4 className="text-3xl sm:text-4xl font-display font-bold text-text-main">
                  {activeMovement.steps[stepIndex]!.instruction}
                </h4>
                {activeMovement.steps[stepIndex]!.supportingText && (
                  <p className="text-lg text-text-muted font-medium max-w-lg mx-auto">
                    {activeMovement.steps[stepIndex]!.supportingText}
                  </p>
                )}
              </motion.div>
            </AnimatePresence>

            {activeMovement.safetyNotes && (
              <p className="text-xs text-text-muted text-center max-w-md mx-auto">{activeMovement.safetyNotes}</p>
            )}

            <div className="flex items-center justify-between pt-6 border-t border-border/50">
              <button
                onClick={() => setStepIndex((i) => Math.max(0, i - 1))}
                disabled={stepIndex === 0}
                className="text-xs font-black uppercase tracking-widest text-text-muted hover:text-text-main disabled:opacity-30"
              >
                Previous
              </button>
              {stepIndex < activeMovement.steps.length - 1 ? (
                <button onClick={() => setStepIndex((i) => i + 1)} className="btn-primary bg-success hover:bg-success border-success text-white">
                  Next
                </button>
              ) : (
                <button onClick={handleFinishSteps} className="btn-primary bg-primary hover:bg-primary border-primary text-primary-foreground">
                  <CheckCircle2 className="w-4 h-4" /> Finish
                </button>
              )}
            </div>
          </motion.div>
        )}

        {view === 'checkout' && activeMovement && (
          <motion.div key="checkout" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="card border border-success/20 bg-success/5 p-6 sm:p-8 md:p-10 space-y-8 text-center">
            {feedback !== 'more_uncomfortable' ? (
              <>
                <h4 className="text-2xl font-display font-bold text-text-main">How does that feel?</h4>
                <div className="flex flex-wrap justify-center gap-3">
                  {MOVEMENT_FEEDBACK_OPTIONS.map((opt) => (
                    <button
                      key={opt.id}
                      onClick={() => handleFeedbackPick(opt.id)}
                      className="px-5 py-3 rounded-xl border border-border hover:border-success/50 hover:bg-surface dark:hover:bg-surface text-sm font-bold text-text-main transition-all"
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                <button onClick={finishMovement} className="text-xs font-black uppercase tracking-widest text-text-muted hover:text-text-main">
                  Skip this
                </button>
              </>
            ) : (
              <div className="space-y-6">
                <p className="text-xl font-display font-bold text-text-main">Stop this movement for now. You don't need to push through discomfort.</p>
                <div className="flex flex-wrap justify-center gap-3">
                  <button onClick={handleChooseGentler} className="btn-primary bg-primary hover:bg-primary border-primary text-primary-foreground">
                    Choose a gentler reset
                  </button>
                  <button onClick={() => setView('entry')} className="text-xs font-black uppercase tracking-widest text-text-muted hover:text-text-main">
                    Finish here
                  </button>
                </div>
              </div>
            )}
          </motion.div>
        )}

        {view === 'complete' && activeMovement && (
          <motion.div
            key="complete"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            role="status"
            aria-live="polite"
            className="card border border-success/20 bg-success/5 p-6 sm:p-8 md:p-10 flex flex-col items-center justify-center text-center py-20 space-y-6"
          >
            <div className="w-20 h-20 bg-success rounded-full flex items-center justify-center text-white shadow-xl shadow-success/20">
              <CheckCircle2 className="w-10 h-10" />
            </div>
            <div className="space-y-2">
              <h4 className="text-3xl font-display font-bold text-text-main">{activeMovement.closingPrompt}</h4>
            </div>
            <button onClick={() => { setView('entry'); setActiveMovementId(null); }} className="btn-primary bg-primary hover:bg-primary border-primary text-primary-foreground">
              <Zap className="w-4 h-4" /> Done
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
