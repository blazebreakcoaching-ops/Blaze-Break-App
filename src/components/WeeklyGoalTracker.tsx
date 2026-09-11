import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { Target, Shield, Zap, Wind, Moon, Plus, RefreshCw, Minus, Trophy, Loader2, Trash2 } from 'lucide-react';
import { cn } from '../lib/utils';
import {
  HabitGoal,
  HabitCategory,
  HABIT_CATEGORIES,
  buildDefaultGoals,
  getIsoWeekId,
  clampProgress,
  shouldAwardXp,
  countGoalsMet,
  computeConsistencyIndex,
  GOAL_COMPLETION_XP,
} from '../../weekly-goal-tracker';

// "System Habit OS" - the weekly recovery-habit tracker from the original
// prototype this project started from. It never made it into this
// repository's history (confirmed by an exhaustive search across every
// commit and branch), so this is a genuine rebuild, not a restore. Rebuilt
// real rather than decorative: every number here comes from what the user
// has actually logged this week via Firestore, never a fixed placeholder -
// see weekly-goal-tracker.ts for the scoring logic and its tests.

interface WeeklyGoalTrackerProps {
  onAwardPoints: (amount: number, reason: string) => void;
}

const CATEGORY_ICON: Record<HabitCategory, React.ElementType> = {
  Focus: Target,
  Boundaries: Shield,
  Energy: Zap,
  Somatic: Wind,
  Sleep: Moon,
};

// Matches the original prototype's per-category color identity (each
// pillar gets its own accent so the list stays scannable at a glance),
// re-expressed with this app's real design tokens and its established
// light/dark pairing convention instead of the original's raw, single-mode
// Tailwind classes. Indigo is used for Sleep the same way this app already
// pairs an indigo accent elsewhere (SomaticCheckInCard.tsx) - there's no
// dedicated "sleep" token, so this borrows the nearest existing precedent
// rather than inventing an unpaired one-off color.
const CATEGORY_COLOR: Record<HabitCategory, string> = {
  Focus: 'text-[#9a3412] dark:text-primary bg-primary/10 border-primary/20',
  Boundaries: 'text-[#9a3412] dark:text-warning bg-warning/10 border-warning/20',
  Energy: 'text-[#166534] dark:text-[#4ade80] bg-success/10 border-success/20',
  Somatic: 'text-info dark:text-info bg-info/10 border-info/20',
  Sleep: 'text-indigo-700 dark:text-indigo-400 bg-indigo-500/10 border-indigo-500/20',
};

const cycleRef = (uid: string, weekId: string) => doc(db, 'users', uid, 'weekly_habit_cycles', weekId);

export const WeeklyGoalTracker = ({ onAwardPoints }: WeeklyGoalTrackerProps) => {
  const uid = auth.currentUser?.uid;
  const weekId = getIsoWeekId(new Date());

  const [loading, setLoading] = useState(true);
  const [goals, setGoals] = useState<HabitGoal[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [showAddGoal, setShowAddGoal] = useState(false);
  const [newGoalLabel, setNewGoalLabel] = useState('');
  const [newGoalTarget, setNewGoalTarget] = useState(3);
  const [newGoalCategory, setNewGoalCategory] = useState<HabitCategory>('Focus');
  // "New Week" discards the current week's real progress with no undo, so it
  // needs a real confirmation step - an in-app one, not a native
  // window.confirm(), matching this app's established move away from raw
  // browser dialogs elsewhere.
  const [confirmingNewWeek, setConfirmingNewWeek] = useState(false);

  const loadCycle = async () => {
    if (!uid) { setLoading(false); return; }
    setLoading(true);
    try {
      const snap = await getDoc(cycleRef(uid, weekId));
      // Only trust a stored cycle if it's genuinely THIS real ISO week - an
      // old week's document is never shown as if it were the current one.
      if (snap.exists() && snap.data()?.weekId === weekId) {
        setGoals(snap.data()?.goals || null);
      } else {
        setGoals(null); // No cycle started yet this week - honest empty state below.
      }
    } catch {
      setGoals(null);
    }
    setLoading(false);
  };

  useEffect(() => { loadCycle(); }, [uid, weekId]);

  const persist = async (nextGoals: HabitGoal[]) => {
    if (!uid) return;
    setSaving(true);
    try {
      await setDoc(cycleRef(uid, weekId), {
        weekId,
        startedAt: new Date().toISOString(),
        goals: nextGoals,
      });
    } catch {
      // Non-fatal - the UI still reflects the change locally even if the save fails.
    }
    setSaving(false);
  };

  const startWeek = async () => {
    const fresh = buildDefaultGoals();
    setGoals(fresh);
    setConfirmingNewWeek(false);
    await persist(fresh);
  };

  const adjustProgress = async (goalId: string, delta: number) => {
    if (!goals) return;
    let awarded: { label: string } | null = null;
    const next = goals.map((g) => {
      if (g.id !== goalId) return g;
      const before = g.progress;
      const after = clampProgress(before + delta, g.target);
      const xpNow = shouldAwardXp(before, after, g.target, g.xpAwarded);
      if (xpNow) awarded = { label: g.label };
      return { ...g, progress: after, xpAwarded: g.xpAwarded || xpNow };
    });
    setGoals(next);
    await persist(next);
    if (awarded) onAwardPoints(GOAL_COMPLETION_XP, `Weekly habit met: ${(awarded as { label: string }).label}`);
  };

  const addCustomGoal = async () => {
    if (!goals || !newGoalLabel.trim() || newGoalTarget < 1) return;
    const goal: HabitGoal = {
      id: `custom_${Date.now()}`,
      category: newGoalCategory,
      label: newGoalLabel.trim().slice(0, 120),
      target: newGoalTarget,
      progress: 0,
      xpAwarded: false,
    };
    const next = [...goals, goal];
    setGoals(next);
    await persist(next);
    setNewGoalLabel('');
    setNewGoalTarget(3);
    setNewGoalCategory('Focus');
    setShowAddGoal(false);
  };

  // Matches the original: any goal can be removed, including a default one -
  // no artificial distinction between the starter set and a custom addition.
  const deleteGoal = async (goalId: string) => {
    if (!goals) return;
    const next = goals.filter((g) => g.id !== goalId);
    setGoals(next);
    await persist(next);
  };

  if (loading) {
    return (
      <div className="card p-8 flex items-center justify-center">
        <Loader2 className="w-5 h-5 animate-spin text-text-muted" aria-hidden="true" />
      </div>
    );
  }

  const goalsMet = goals ? countGoalsMet(goals) : 0;
  const consistencyIndex = goals ? computeConsistencyIndex(goals) : 0;

  return (
    <div className="card p-6 sm:p-8 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div className="space-y-1.5">
          <h3 className="text-2xl font-display font-bold text-text-main tracking-tight">7-Day Recovery Cycle</h3>
          <p className="text-sm text-text-muted max-w-xl leading-relaxed">
            Sustained recovery requires systematic habit protection. Progress is tracked for real, week by week.
          </p>
        </div>
        {goals && (
          confirmingNewWeek ? (
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-xs font-bold text-text-muted">Reset this week's progress?</span>
              <button onClick={startWeek} className="rounded-full bg-destructive text-destructive-foreground px-3 py-1.5 text-xs font-bold hover:opacity-90 transition-opacity">
                Yes, start fresh
              </button>
              <button onClick={() => setConfirmingNewWeek(false)} className="text-xs font-bold text-text-muted hover:text-text-main">
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmingNewWeek(true)}
              className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-bold text-text-muted hover:text-primary hover:border-primary/40 transition-colors shrink-0"
            >
              <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" /> New Week
            </button>
          )
        )}
      </div>

      {!goals ? (
        <div className="rounded-2xl border border-dashed border-border p-6 text-center space-y-3">
          <p className="text-sm text-text-muted">
            No cycle started for this week yet. Nothing carries over automatically - start when you're ready.
          </p>
          <button onClick={startWeek} className="btn-primary py-2.5 px-6 text-sm inline-flex items-center gap-2">
            Start This Week
          </button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-xl border border-border bg-surface/60 dark:bg-card/40 p-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-text-muted">Weekly Completion</p>
              <p className="text-2xl font-display font-bold text-text-main mt-1">{goalsMet} / {goals.length}<span className="text-sm font-normal text-text-muted"> Goals Met</span></p>
            </div>
            <div className="rounded-xl border border-border bg-surface/60 dark:bg-card/40 p-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-text-muted">Habit Consistency Index</p>
              <p className="text-2xl font-display font-bold text-text-main mt-1">{consistencyIndex}%</p>
            </div>
          </div>

          <div className="space-y-3">
            {goals.map((g) => {
              const Icon = CATEGORY_ICON[g.category] || Target;
              const met = g.progress >= g.target;
              const pct = g.target > 0 ? Math.min(100, Math.round((g.progress / g.target) * 100)) : 0;
              return (
                <div key={g.id} className="rounded-xl border border-border p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0">
                      <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border', CATEGORY_COLOR[g.category] || 'bg-primary/10 text-primary border-primary/20')}>
                        <Icon className="w-4 h-4" aria-hidden="true" />
                      </div>
                      <div className="min-w-0">
                        <span className={cn('inline-block text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md border', CATEGORY_COLOR[g.category])}>
                          {g.category}
                        </span>
                        <p className="text-sm font-bold text-text-main mt-1">{g.label}</p>
                        <p className="text-xs text-text-muted mt-1">Progress this week: {g.progress} / {g.target} ({pct}%)</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {met && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-[#166534] dark:text-[#4ade80] bg-success/10 border border-success/20 px-2 py-1 rounded-full">
                          <Trophy className="w-3 h-3" aria-hidden="true" /> +{GOAL_COMPLETION_XP} XP
                        </span>
                      )}
                      <button
                        onClick={() => deleteGoal(g.id)}
                        aria-label={`Remove ${g.label}`}
                        className="w-7 h-7 rounded-lg flex items-center justify-center text-text-muted hover:text-destructive hover:bg-destructive/10 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                  <div className="h-1.5 rounded-full bg-surface dark:bg-surface overflow-hidden">
                    <motion.div
                      className={cn('h-full', met ? 'bg-success' : 'bg-primary')}
                      initial={false}
                      animate={{ width: `${pct}%` }}
                      transition={{ type: 'spring', stiffness: 200, damping: 30 }}
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => adjustProgress(g.id, -1)}
                      disabled={g.progress <= 0 || saving}
                      aria-label={`Decrease progress for ${g.label}`}
                      className="w-8 h-8 rounded-lg border border-border flex items-center justify-center text-text-muted hover:text-text-main disabled:opacity-40 transition-colors"
                    >
                      <Minus className="w-3.5 h-3.5" aria-hidden="true" />
                    </button>
                    <button
                      onClick={() => adjustProgress(g.id, 1)}
                      disabled={g.progress >= g.target || saving}
                      aria-label={`Increase progress for ${g.label}`}
                      className="rounded-lg bg-primary text-primary-foreground px-3 py-1.5 text-xs font-bold hover:opacity-90 disabled:opacity-40 transition-opacity inline-flex items-center gap-1"
                    >
                      <Plus className="w-3.5 h-3.5" aria-hidden="true" /> Progress
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {showAddGoal ? (
            <div className="rounded-xl border border-dashed border-border p-4 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <label className="text-xs font-bold text-text-muted block sm:col-span-1">
                  Pillar
                  <select
                    value={newGoalCategory}
                    onChange={(e) => setNewGoalCategory(e.target.value as HabitCategory)}
                    className="mt-1 w-full bg-surface border border-border rounded-lg px-2.5 py-2 text-sm text-text-main focus:outline-none focus:border-primary"
                  >
                    {HABIT_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </label>
                <label className="text-xs font-bold text-text-muted block sm:col-span-2">
                  Goal description
                  <input
                    type="text"
                    value={newGoalLabel}
                    onChange={(e) => setNewGoalLabel(e.target.value)}
                    placeholder="e.g. Take a walk without my phone"
                    maxLength={120}
                    className="mt-1 w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-text-main placeholder:text-text-muted focus:outline-none focus:border-primary"
                  />
                </label>
              </div>
              <div className="flex items-center gap-3">
                <label className="text-xs font-bold text-text-muted flex items-center gap-2">
                  Times per week
                  <input
                    type="number"
                    min={1}
                    max={14}
                    value={newGoalTarget}
                    onChange={(e) => setNewGoalTarget(Math.max(1, Math.min(14, parseInt(e.target.value) || 1)))}
                    className="w-16 bg-surface border border-border rounded-lg px-2 py-1 text-sm text-text-main"
                  />
                </label>
                <button onClick={addCustomGoal} disabled={!newGoalLabel.trim()} className="btn-primary py-1.5 px-4 text-xs disabled:opacity-40">Save</button>
                <button onClick={() => setShowAddGoal(false)} className="text-xs font-bold text-text-muted hover:text-text-main">Cancel</button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowAddGoal(true)}
              className="w-full py-3 rounded-xl border border-dashed border-border text-text-muted hover:text-primary hover:border-primary/40 transition-colors text-sm font-bold flex items-center justify-center gap-2"
            >
              <Plus className="w-4 h-4" aria-hidden="true" /> Add Habit Goal
            </button>
          )}
        </>
      )}
    </div>
  );
};

export default WeeklyGoalTracker;
