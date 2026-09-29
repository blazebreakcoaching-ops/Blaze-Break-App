import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ArrowLeft, ArrowRight, CheckCircle2, Clock, ChevronRight, X,
} from 'lucide-react';
import { cn } from '../lib/utils';
import { auth } from '../lib/firebase';
import { BurnoutFingerprint } from '../types';
import { updateNovaMemoryBySourceAndType } from '../lib/nova-brain';
import { useFeatureFlags } from '../lib/feature-flags';
import {
  SituationKey, SITUATION_ORDER, SITUATION_LABELS, Capacity, CAPACITY_ORDER, CAPACITY_LABELS,
  DURATION_CATEGORY_LABELS, RecipeStep, RecipeStepType,
} from '../../recovery-recipes-content';
import { buildRecoveryRecipe, adaptRecoveryRecipe, BuiltRecoveryRecipe } from '../../recovery-recipes-engine';
import { loadRecipePreferences, recordRecipeHistory } from '../lib/recovery-recipes-service';
import { logRecipeEvent } from '../lib/recovery-recipes-analytics';
import { MOVEMENT_SNACKS } from '../../movement-snacks-content';
import { GroundingLens } from '../../grounding-content';

interface RecoveryRecipesProps {
  fingerprint: BurnoutFingerprint | null;
  onAwardPoints?: (amount: number, reason: string) => void;
}

// Section 21's "how much time" chips - kept to a handful of common budgets
// plus an unconstrained option, never a free-typed number (over-engineering
// the setup screen the brief explicitly warns against).
const TIME_OPTIONS: { minutes: number | null; label: string }[] = [
  { minutes: 2, label: '2 min' },
  { minutes: 5, label: '5 min' },
  { minutes: 10, label: '10 min' },
  { minutes: null, label: 'I have time' },
];

type View = 'entry' | 'setup' | 'preview' | 'player' | 'complete';

export const RecoveryRecipes = ({ fingerprint: _fingerprint, onAwardPoints }: RecoveryRecipesProps) => {
  const flags = useFeatureFlags();
  const [view, setView] = useState<View>('entry');
  const [somethingElseOpen, setSomethingElseOpen] = useState(false);
  const [somethingElseText, setSomethingElseText] = useState('');
  const [selectedSituation, setSelectedSituation] = useState<SituationKey | null>(null);
  const [capacity, setCapacity] = useState<Capacity | undefined>(undefined);
  const [timeAvailableMinutes, setTimeAvailableMinutes] = useState<number | undefined>(undefined);
  const [recipe, setRecipe] = useState<BuiltRecoveryRecipe | null>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [completedStepTypes, setCompletedStepTypes] = useState<RecipeStepType[]>([]);
  const [skippedStepTypes, setSkippedStepTypes] = useState<RecipeStepType[]>([]);
  const [preferredLens, setPreferredLens] = useState<GroundingLens | undefined>(undefined);

  useEffect(() => {
    if (!auth.currentUser) return;
    loadRecipePreferences(auth.currentUser.uid).then((prefs) => {
      if (prefs.preferredLens) setPreferredLens(prefs.preferredLens);
    });
  }, []);

  const resetToEntry = () => {
    setView('entry');
    setSelectedSituation(null);
    setSomethingElseOpen(false);
    setSomethingElseText('');
    setCapacity(undefined);
    setTimeAvailableMinutes(undefined);
    setRecipe(null);
    setStepIndex(0);
    setCompletedStepTypes([]);
    setSkippedStepTypes([]);
  };

  const handlePickSituation = (situation: SituationKey) => {
    setSelectedSituation(situation);
    setSomethingElseOpen(false);
    setView('setup');
  };

  const handleSomethingElse = () => {
    // The deterministic engine can't classify free text, so this always
    // resolves to the universal reset recipe (section 29's "must work
    // without AI") - the note itself is kept for Nova's own memory, never
    // sent to analytics (section 36's exclusion list).
    if (somethingElseText.trim()) {
      updateNovaMemoryBySourceAndType('Recovery Recipes', 'state', {
        content: `Described a situation in their own words before a Recovery Recipe: "${somethingElseText.trim().slice(0, 200)}"`,
        confidence: 'medium',
        canEdit: true,
      });
    }
    setSelectedSituation('just_need_reset');
    setView('setup');
  };

  const buildAndPreview = () => {
    if (!selectedSituation) return;
    const built = buildRecoveryRecipe({ situationKey: selectedSituation, capacity, timeAvailableMinutes });
    setRecipe(built);
    setStepIndex(0);
    setCompletedStepTypes([]);
    setSkippedStepTypes([]);
    setView('preview');
  };

  const handleMakeShorter = () => {
    if (!selectedSituation) return;
    const shortened = adaptRecoveryRecipe({ situationKey: selectedSituation, capacity, timeAvailableMinutes }, { type: 'shorten' });
    setRecipe(shortened);
    setCapacity('almost_nothing');
  };

  const handleBegin = () => {
    if (!recipe || !selectedSituation) return;
    logRecipeEvent('recipe_started', { situationKey: selectedSituation });
    setStepIndex(0);
    setView('player');
  };

  const finishRecipe = () => {
    if (!recipe || !selectedSituation) return;
    logRecipeEvent('recipe_completed', { situationKey: selectedSituation });
    if (auth.currentUser) {
      recordRecipeHistory(auth.currentUser.uid, {
        situationKey: selectedSituation,
        capacity,
        durationMinutes: recipe.estimatedDurationMinutes,
        completedStepTypes,
        skippedStepTypes,
      }).catch(() => {});
    }
    if (onAwardPoints) onAwardPoints(15, `Completed Recipe: ${recipe.recipeTitle}`);
    updateNovaMemoryBySourceAndType('Recovery Recipes', 'trigger', {
      content: `Completed a Recovery Recipe for "${SITUATION_LABELS[selectedSituation]}".`,
      confidence: 'verified',
      canEdit: true,
    });
    setView('complete');
  };

  const handleStopRecipe = () => {
    if (recipe && selectedSituation) {
      logRecipeEvent('recipe_abandoned', { situationKey: selectedSituation });
      if (auth.currentUser && (completedStepTypes.length > 0 || skippedStepTypes.length > 0)) {
        recordRecipeHistory(auth.currentUser.uid, {
          situationKey: selectedSituation, capacity, durationMinutes: recipe.estimatedDurationMinutes,
          completedStepTypes, skippedStepTypes,
        }).catch(() => {});
      }
    }
    resetToEntry();
  };

  const currentStep: RecipeStep | null = recipe ? recipe.steps[stepIndex] ?? null : null;

  const advanceStep = (wasSkipped: boolean) => {
    if (!currentStep) return;
    if (wasSkipped) {
      logRecipeEvent('recipe_step_skipped', { situationKey: selectedSituation || undefined, stepType: currentStep.type });
      setSkippedStepTypes((prev) => [...prev, currentStep.type]);
    } else {
      setCompletedStepTypes((prev) => [...prev, currentStep.type]);
    }
    if (recipe && stepIndex < recipe.steps.length - 1) {
      setStepIndex((i) => i + 1);
    } else {
      finishRecipe();
    }
  };

  const groundingText = (step: RecipeStep): string =>
    (preferredLens && step.groundingExcerptByLens?.[preferredLens]) || step.groundingExcerpt || '';

  const movementTitle = (movementId?: string): string | null =>
    movementId ? MOVEMENT_SNACKS[movementId]?.title ?? null : null;

  const entryCards = useMemo(() => SITUATION_ORDER, []);

  return (
    <div className="space-y-12 pb-24">
      <div className="max-w-4xl">
        <div className="flex items-center gap-4 mb-4">
          <div className="tag">Section 18 / Practices</div>
          <div className="h-px flex-1 bg-border/40" />
        </div>
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-6">
          <div className="space-y-4">
            <h3 className="text-5xl font-display font-bold text-text-main tracking-tight">Recovery Recipes</h3>
            <p className="text-xl text-text-muted font-medium max-w-2xl">
              "Like a personalised playlist for difficult moments. Simple, repeatable, built around what you need right now."
            </p>
          </div>
        </div>
      </div>

      <AnimatePresence mode="wait">
        {view === 'entry' && (
          <motion.div key="entry" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-6">
            <h4 className="text-2xl font-display font-bold text-text-main">What is happening right now?</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {entryCards.map((situation) => (
                <button
                  key={situation}
                  onClick={() => handlePickSituation(situation)}
                  className="p-5 rounded-2xl border border-border hover:border-primary/50 hover:bg-surface dark:hover:bg-surface text-left transition-all flex items-center justify-between gap-3 group"
                >
                  <span className="text-base font-bold text-text-main">{SITUATION_LABELS[situation]}</span>
                  <ChevronRight className="w-4 h-4 text-text-muted group-hover:text-primary shrink-0" />
                </button>
              ))}
              <button
                onClick={() => setSomethingElseOpen((v) => !v)}
                aria-pressed={somethingElseOpen}
                className={cn(
                  'p-5 rounded-2xl border text-left transition-all flex items-center justify-between gap-3',
                  somethingElseOpen ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50 hover:bg-surface dark:hover:bg-surface'
                )}
              >
                <span className="text-base font-bold text-text-main">Something else</span>
                <ChevronRight className="w-4 h-4 text-text-muted shrink-0" />
              </button>
            </div>

            {somethingElseOpen && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="space-y-3 max-w-xl">
                <input
                  type="text"
                  value={somethingElseText}
                  onChange={(e) => setSomethingElseText(e.target.value.slice(0, 200))}
                  placeholder="Describe what's going on, in your own words (optional)"
                  className="w-full p-3 rounded-xl border border-border/40 bg-white dark:bg-surface text-sm text-text-main"
                />
                <button onClick={handleSomethingElse} className="btn-primary bg-primary hover:bg-primary border-primary text-primary-foreground">
                  <ArrowRight className="w-4 h-4" /> Build a recipe
                </button>
              </motion.div>
            )}
          </motion.div>
        )}

        {view === 'setup' && selectedSituation && (
          <motion.div key="setup" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="card border border-border/40 p-6 sm:p-8 space-y-8">
            <button onClick={() => setView('entry')} className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-text-muted hover:text-text-main">
              <ArrowLeft className="w-3.5 h-3.5" /> Back
            </button>

            <div className="space-y-3">
              <h5 className="text-lg font-display font-bold text-text-main">How much can you deal with right now?</h5>
              <div className="flex flex-wrap gap-3">
                {CAPACITY_ORDER.map((c) => (
                  <button
                    key={c}
                    onClick={() => setCapacity(c)}
                    aria-pressed={capacity === c}
                    className={cn(
                      'px-5 py-3 rounded-xl text-sm font-bold border transition-all',
                      capacity === c ? 'bg-primary border-primary text-primary-foreground' : 'border-border hover:border-primary/50 text-text-main'
                    )}
                  >
                    {CAPACITY_LABELS[c]}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <h5 className="text-lg font-display font-bold text-text-main">How much time do you have?</h5>
              <div className="flex flex-wrap gap-3">
                {TIME_OPTIONS.map((t) => (
                  <button
                    key={t.label}
                    onClick={() => setTimeAvailableMinutes(t.minutes ?? undefined)}
                    aria-pressed={timeAvailableMinutes === (t.minutes ?? undefined)}
                    className={cn(
                      'px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest flex items-center gap-2 border transition-all',
                      timeAvailableMinutes === (t.minutes ?? undefined) ? 'bg-primary border-primary text-primary-foreground' : 'border-border hover:border-primary/50 text-text-muted'
                    )}
                  >
                    <Clock className="w-3.5 h-3.5" /> {t.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-4 pt-2 border-t border-border/40">
              <button onClick={buildAndPreview} className="btn-primary bg-primary hover:bg-primary border-primary text-primary-foreground mt-4">
                <ArrowRight className="w-4 h-4" /> Build my recipe
              </button>
              <button onClick={buildAndPreview} className="text-xs font-black uppercase tracking-widest text-text-muted hover:text-text-main mt-4">
                Skip this
              </button>
            </div>
          </motion.div>
        )}

        {view === 'preview' && recipe && (
          <motion.div key="preview" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="card border border-primary/20 bg-primary/5 p-6 sm:p-8 md:p-10 space-y-8">
            <div className="space-y-2">
              <div className="text-xs font-black uppercase tracking-widest text-text-muted">Your Recovery Recipe</div>
              <h4 className="text-3xl font-display font-bold text-text-main">{recipe.recipeTitle}</h4>
              <p className="text-sm font-bold text-text-muted uppercase tracking-widest">
                {DURATION_CATEGORY_LABELS[recipe.durationCategory]} · About {recipe.estimatedDurationMinutes} min{recipe.estimatedDurationMinutes === 1 ? '' : 's'}
              </p>
            </div>

            <ol className="space-y-2">
              {recipe.steps.map((step, i) => (
                <li key={step.id} className="flex items-start gap-3 p-4 rounded-xl bg-white/50 dark:bg-surface/50 border border-border/40">
                  <span className="w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-black flex items-center justify-center shrink-0 mt-0.5">{i + 1}</span>
                  <span className="text-sm font-bold text-text-main">
                    {step.type === 'movement' && movementTitle(step.movementId) ? movementTitle(step.movementId) : step.title}
                  </span>
                </li>
              ))}
              <li className="flex items-start gap-3 p-4 rounded-xl bg-white/30 dark:bg-surface/30 border border-border/20">
                <span className="w-6 h-6 rounded-full bg-surface text-text-muted text-xs font-black flex items-center justify-center shrink-0 mt-0.5">
                  {recipe.steps.length + 1}
                </span>
                <span className="text-sm font-bold text-text-muted">{recipe.closingAction}</span>
              </li>
            </ol>

            <p className="text-sm text-text-muted italic">{recipe.reason}</p>

            <div className="flex flex-wrap items-center gap-4 pt-2 border-t border-border/40">
              <button onClick={handleBegin} className="btn-primary bg-primary hover:bg-primary border-primary text-primary-foreground mt-4">
                <ArrowRight className="w-4 h-4" /> Start Recipe
              </button>
              {flags.enable_recovery_recipes_dynamic_sequencing && recipe.durationCategory !== 'quick' && (
                <button onClick={handleMakeShorter} className="text-xs font-black uppercase tracking-widest text-text-muted hover:text-text-main mt-4">
                  Make it shorter
                </button>
              )}
              <button onClick={() => setView('entry')} className="text-xs font-black uppercase tracking-widest text-text-muted hover:text-text-main mt-4">
                Choose another
              </button>
            </div>
          </motion.div>
        )}

        {view === 'player' && recipe && currentStep && (
          <motion.div key="player" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="card border border-primary/20 bg-primary/5 p-6 sm:p-8 md:p-10 space-y-8">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black uppercase tracking-widest text-text-muted">
                Step {stepIndex + 1} of {recipe.steps.length}
              </span>
              <button onClick={handleStopRecipe} aria-label="Stop recipe" className="text-text-muted hover:text-text-main flex items-center gap-1.5 text-xs font-black uppercase tracking-widest">
                <X className="w-3.5 h-3.5" /> Stop
              </button>
            </div>

            <div className="text-center py-6 space-y-4">
              <h4 className="text-3xl sm:text-4xl font-display font-bold text-text-main">
                {currentStep.type === 'movement' && movementTitle(currentStep.movementId) ? movementTitle(currentStep.movementId) : currentStep.title}
              </h4>
              {currentStep.instruction && <p className="text-lg text-text-muted font-medium max-w-lg mx-auto">{currentStep.instruction}</p>}
              {currentStep.reflectionQuestions?.map((q) => (
                <p key={q} className="text-lg text-text-main font-medium max-w-lg mx-auto italic">{q}</p>
              ))}
              {currentStep.type === 'grounding' && groundingText(currentStep) && (
                <p className="text-lg text-text-main font-medium max-w-lg mx-auto italic">{groundingText(currentStep)}</p>
              )}
              {currentStep.choices && (
                <div className="flex flex-wrap justify-center gap-3 pt-2">
                  {currentStep.choices.map((choice) => (
                    <button
                      key={choice.id}
                      onClick={() => advanceStep(false)}
                      className="px-5 py-3 rounded-xl border border-border hover:border-primary/50 hover:bg-surface dark:hover:bg-surface text-sm font-bold text-text-main transition-all"
                    >
                      {choice.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {!currentStep.choices && (
              <div className="flex items-center justify-center gap-3 pt-6 border-t border-border/50">
                {currentStep.skippable && (
                  <button onClick={() => advanceStep(true)} className="text-xs font-black uppercase tracking-widest text-text-muted hover:text-text-main">
                    Skip
                  </button>
                )}
                <button onClick={() => advanceStep(false)} className="btn-primary bg-primary hover:bg-primary border-primary text-primary-foreground">
                  {stepIndex < recipe.steps.length - 1 ? 'Continue' : 'Finish'}
                </button>
              </div>
            )}
          </motion.div>
        )}

        {view === 'complete' && recipe && (
          <motion.div
            key="complete"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            role="status"
            aria-live="polite"
            className="card border border-primary/20 bg-primary/5 p-6 sm:p-8 md:p-10 flex flex-col items-center justify-center text-center py-20 space-y-6"
          >
            <div className="w-20 h-20 bg-primary rounded-full flex items-center justify-center text-primary-foreground shadow-xl shadow-primary/20">
              <CheckCircle2 className="w-10 h-10" />
            </div>
            <h4 className="text-3xl font-display font-bold text-text-main max-w-lg">{recipe.closingAction}</h4>
            <button onClick={resetToEntry} className="btn-primary bg-primary hover:bg-primary border-primary text-primary-foreground">
              Done
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
