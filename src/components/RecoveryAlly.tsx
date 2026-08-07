import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { HeartPulse, CheckSquare, Target, Mail, Award, Trash2, CheckCircle2, AlertTriangle, ShieldCheck, Activity, Brain, Clock, Plus, ArrowRight, Zap } from 'lucide-react';
import { cn } from '../lib/utils';
import { logJourney } from '../lib/nova-brain';

const STORAGE_KEY = 'blaze_recovery_ally_state';

interface SharedGoal {
  id: number;
  text: string;
  completed: boolean;
  category: string;
  streak: number;
}

interface Encouragement {
  id: number;
  type: 'system' | 'personal';
  message: string;
  time: string;
}

interface AllyPermissions {
  viewGoals: boolean;
  viewMilestones: boolean;
  sendPings: boolean;
  viewEnergyStats: boolean;
}

interface PersistedAllyState {
  isInvited: boolean;
  allyName: string;
  allyEmail: string;
  permissions: AllyPermissions;
  sharedGoals: SharedGoal[];
  encouragements: Encouragement[];
}

const DEFAULT_GOALS: SharedGoal[] = [
  { id: 1, text: "Hard cut-off from communications at 19:00", completed: false, category: "boundary", streak: 0 },
  { id: 2, text: "Minimum 45min offline macro-break daily", completed: false, category: "recovery", streak: 0 },
];

const loadAllyState = (): PersistedAllyState => {
  const fallback: PersistedAllyState = {
    isInvited: false,
    allyName: '',
    allyEmail: '',
    permissions: { viewGoals: true, viewMilestones: true, sendPings: true, viewEnergyStats: false },
    sharedGoals: DEFAULT_GOALS,
    encouragements: [],
  };
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      return { ...fallback, ...parsed };
    }
  } catch (e) {
    // Corrupted or inaccessible storage — fall back to defaults rather than crashing.
  }
  return fallback;
};

export const RecoveryAlly = () => {
  const [state, setState] = useState<PersistedAllyState>(loadAllyState);
  const { isInvited, allyName, permissions, sharedGoals, encouragements } = state;

  const [emailDraft, setEmailDraft] = useState('');
  const [isAddingGoal, setIsAddingGoal] = useState(false);
  const [newGoalText, setNewGoalText] = useState('');

  // Persist on every change so a refresh or app restart doesn't wipe the connection.
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      // Storage full or unavailable — continue silently rather than breaking the UI.
    }
  }, [state]);

  const setPermissions = (updater: (p: AllyPermissions) => AllyPermissions) => {
    setState(prev => ({ ...prev, permissions: updater(prev.permissions) }));
  };

  const handleInvite = (e: React.FormEvent) => {
    e.preventDefault();
    if (emailDraft.trim()) {
      setState(prev => ({
        ...prev,
        isInvited: true,
        allyEmail: emailDraft.trim(),
        allyName: emailDraft.split('@')[0],
        // A genuine invite has no history yet — no fabricated activity from an ally
        // who hasn't actually done anything.
        encouragements: [],
      }));
      setEmailDraft('');
    }
  };

  const handleRevoke = () => {
    setState(prev => ({ ...prev, isInvited: false, allyEmail: '', allyName: '', encouragements: [] }));
  };

  const toggleGoal = (id: number) => {
    setState(prev => ({
      ...prev,
      sharedGoals: prev.sharedGoals.map(g => g.id === id ? { ...g, completed: !g.completed } : g),
    }));
  };

  const addNewGoal = (e: React.FormEvent) => {
    e.preventDefault();
    if (newGoalText.trim()) {
      setState(prev => ({
        ...prev,
        sharedGoals: [{ id: Date.now(), text: newGoalText, completed: false, category: "custom", streak: 0 }, ...prev.sharedGoals],
      }));
      logJourney(`Set a boundary goal shared with Recovery Ally`, newGoalText);
      setNewGoalText('');
      setIsAddingGoal(false);
    }
  };

  return (
    <div className="space-y-8 pb-12">
      <div className="relative overflow-hidden rounded-xl bg-card border border-border p-8">
        <div className="relative z-10 max-w-3xl">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-11 h-11 rounded-lg bg-primary/10 border border-primary/20 text-primary flex items-center justify-center shrink-0">
              <HeartPulse className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-2xl font-display font-medium text-text-main tracking-tight">Recovery Ally</h2>
              <p className="text-primary/70 text-xs font-medium uppercase tracking-widest mt-1">Someone in your corner</p>
            </div>
          </div>
          <p className="text-text-muted text-sm leading-relaxed mb-6 max-w-2xl">
            Invite a trusted friend, mentor, or partner to check in on your recovery — you choose exactly what they can see, and you can turn any of it off at any time.
          </p>
          <div className="bg-surface border border-destructive/20 p-4 rounded-lg flex gap-3 text-xs text-text-muted max-w-lg">
            <AlertTriangle className="w-5 h-5 text-destructive/80 shrink-0" />
            <div>
              <strong className="text-destructive">This isn't for crises.</strong> It's for everyday accountability. If you're in crisis or need immediate support, use <em className="text-text-muted">Guardian Relay</em> instead.
            </div>
          </div>
        </div>
      </div>

      {!isInvited ? (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="card max-w-2xl p-8 bg-white dark:bg-card border border-border">
          <div className="flex items-start gap-4 mb-8">
            <div className="w-10 h-10 rounded-full bg-surface dark:bg-surface flex items-center justify-center shrink-0">
              <ShieldCheck className="w-5 h-5 text-text-muted" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-text-main mb-1">Invite Your Ally</h3>
              <p className="text-xs text-text-muted leading-relaxed">Send a secure invite. They'll get a link to accept, and only ever see what you choose to share.</p>
            </div>
          </div>

          <form onSubmit={handleInvite} className="space-y-6">
            <div className="space-y-2">
              <label className="text-xs font-medium uppercase tracking-widest text-text-muted ml-1">Their Email</label>
              <div className="relative group">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-text-muted group-focus-within:text-primary transition-colors" />
                <input
                  type="email"
                  value={emailDraft}
                  onChange={(e) => setEmailDraft(e.target.value)}
                  placeholder="name@example.com"
                  className="w-full bg-surface dark:bg-surface border border-border focus:border-primary focus:ring-primary/20 text-text-main placeholder:text-text-muted rounded-lg pl-12 pr-4 py-4 font-mono text-sm focus:outline-none focus:ring-2 transition-all"
                  required
                />
              </div>
            </div>
            <button
              type="submit"
              className="w-full flex items-center justify-center gap-3 px-6 py-4 bg-primary text-primary-foreground hover:opacity-90 rounded-lg text-xs font-medium uppercase tracking-widest transition-all group"
            >
              Send Invite <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </button>
          </form>
        </motion.div>
      ) : (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* Active Status & Permissions */}
          <div className="lg:col-span-4 space-y-6">
            <div className="card space-y-6 border border-primary/20 bg-white dark:bg-card">
              <div className="flex items-center gap-4 border-b border-border pb-6">
                <div className="relative">
                  <div className="w-14 h-14 rounded-full bg-surface dark:bg-surface text-text-muted flex items-center justify-center font-bold text-xl uppercase border-2 border-primary/30">
                    {allyName.charAt(0)}
                  </div>
                  <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-success border-2 border-surface dark:border-surface rounded-full" />
                </div>
                <div>
                  <h3 className="font-bold text-text-main text-lg tracking-tight">{allyName}</h3>
                  <span className="inline-flex items-center gap-1.5 text-[11px] uppercase font-medium tracking-widest text-success dark:text-success mt-1">
                    <CheckCircle2 className="w-3 h-3" /> Connected
                  </span>
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-medium uppercase tracking-[0.2em] text-text-muted">What they can see</h4>
                  <ShieldCheck className="w-4 h-4 text-text-muted" />
                </div>

                <div className="space-y-3">
                  <label className="flex items-center justify-between p-3 rounded-lg border border-border hover:border-primary/30 transition-colors cursor-pointer group bg-surface dark:bg-surface/50">
                    <div className="flex items-center gap-3">
                      <Target className="w-4 h-4 text-text-muted group-hover:text-primary transition-colors" />
                      <span className="text-xs font-bold text-text-main">Shared Goals</span>
                    </div>
                    <input type="checkbox" checked={permissions.viewGoals} onChange={() => setPermissions(p => ({ ...p, viewGoals: !p.viewGoals }))} className="w-4 h-4 text-primary rounded border-border focus:ring-primary bg-transparent" />
                  </label>

                  <label className="flex items-center justify-between p-3 rounded-lg border border-border hover:border-primary/30 transition-colors cursor-pointer group bg-surface dark:bg-surface/50">
                    <div className="flex items-center gap-3">
                      <Award className="w-4 h-4 text-text-muted group-hover:text-primary transition-colors" />
                      <span className="text-xs font-bold text-text-main">Milestone Updates</span>
                    </div>
                    <input type="checkbox" checked={permissions.viewMilestones} onChange={() => setPermissions(p => ({ ...p, viewMilestones: !p.viewMilestones }))} className="w-4 h-4 text-primary rounded border-border focus:ring-primary bg-transparent" />
                  </label>

                  <label className="flex items-center justify-between p-3 rounded-lg border border-border hover:border-primary/30 transition-colors cursor-pointer group bg-surface dark:bg-surface/50">
                    <div className="flex items-center gap-3">
                      <Activity className="w-4 h-4 text-text-muted group-hover:text-primary transition-colors" />
                      <span className="text-xs font-bold text-text-main">Energy Levels</span>
                    </div>
                    <input type="checkbox" checked={permissions.viewEnergyStats} onChange={() => setPermissions(p => ({ ...p, viewEnergyStats: !p.viewEnergyStats }))} className="w-4 h-4 text-primary rounded border-border focus:ring-primary bg-transparent" />
                  </label>
                </div>
              </div>

              <div className="pt-4 mt-6 border-t border-border">
                <button
                  onClick={handleRevoke}
                  className="w-full flex items-center justify-center gap-2 py-3 text-destructive bg-destructive/5 hover:bg-destructive/10 rounded-lg text-xs uppercase tracking-widest font-medium transition-colors"
                >
                  <Trash2 className="w-4 h-4" /> Remove Ally
                </button>
              </div>
            </div>
          </div>

          <div className="lg:col-span-8 space-y-6">
            {/* Shared Goals / OKRs */}
            <div className="card space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h3 className="font-bold text-text-main text-lg flex items-center gap-2 tracking-tight">
                    <Target className="w-5 h-5 text-primary" /> Boundary Goals
                  </h3>
                  <p className="text-xs text-text-muted mt-1 leading-relaxed">Goals you're sharing with {allyName}.</p>
                </div>
                <button
                  onClick={() => setIsAddingGoal(!isAddingGoal)}
                  className="shrink-0 flex items-center gap-2 text-xs font-medium uppercase tracking-widest text-text-muted bg-surface dark:bg-surface px-4 py-2.5 rounded-lg hover:bg-border dark:hover:bg-surface transition-colors"
                >
                  <Plus className="w-4 h-4" /> Add Goal
                </button>
              </div>

              <AnimatePresence>
                {isAddingGoal && (
                  <motion.form
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    onSubmit={addNewGoal}
                    className="overflow-hidden"
                  >
                    <div className="flex gap-3 bg-surface dark:bg-card border border-border p-2 rounded-lg">
                      <input
                        type="text"
                        value={newGoalText}
                        onChange={(e) => setNewGoalText(e.target.value)}
                        placeholder="e.g. No meetings after 6pm..."
                        className="flex-1 bg-transparent border-none focus:ring-0 text-sm font-medium px-3 text-text-main"
                        autoFocus
                      />
                      <button type="submit" className="bg-primary text-primary-foreground px-4 py-2 rounded-lg text-xs font-bold hover:opacity-90 transition-colors">Confirm</button>
                    </div>
                  </motion.form>
                )}
              </AnimatePresence>
              
              <div className="space-y-3">
                {sharedGoals.map(goal => (
                  <motion.div 
                    layout
                    key={goal.id} 
                    className={cn(
                      "group flex items-center justify-between p-4 sm:p-5 rounded-2xl border transition-all cursor-pointer relative overflow-hidden",
                      goal.completed ? "bg-success/5 border-success/20" : "bg-white dark:bg-card border-border hover:border-primary/30 shadow-sm hover:shadow"
                    )} 
                    onClick={() => toggleGoal(goal.id)}
                  >
                    {goal.completed && <div className="absolute inset-y-0 left-0 w-1 bg-success" />}
                    
                    <div className="flex items-center gap-4">
                      <div className={cn("w-6 h-6 rounded-md flex items-center justify-center shrink-0 border-2 transition-all", goal.completed ? "bg-success border-success text-white" : "border-border dark:border-muted-foreground text-transparent")}>
                        <CheckSquare className="w-4 h-4" />
                      </div>
                      <div>
                        <span className={cn("text-sm font-bold transition-all block", goal.completed ? "text-text-muted line-through" : "text-text-main")}>{goal.text}</span>
                        <div className="flex items-center gap-3 mt-1.5 opacity-60 group-hover:opacity-100 transition-opacity">
                          <span className="text-[11px] font-black uppercase tracking-widest text-text-muted">{goal.category}</span>
                          {goal.streak > 0 && <span className="text-[11px] font-black uppercase tracking-widest text-warning flex items-center gap-1"><Zap className="w-3 h-3" /> {goal.streak} Day Streak</span>}
                        </div>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>

            {/* Encouragement Feed */}
            <div className="card space-y-6 bg-surface dark:bg-card/50">
              <div>
                <h3 className="font-bold text-text-main text-lg flex items-center gap-2 tracking-tight">
                  <Brain className="w-5 h-5 text-primary" /> Encouragement Feed
                </h3>
                <p className="text-xs text-text-muted mt-1 leading-relaxed">Incoming diagnostics and structural reinforcement from {allyName || 'your ally'}.</p>
              </div>

              <div className="space-y-4">
                {encouragements.length === 0 ? (
                  <div className="text-center py-8">
                    <p className="text-xs text-text-muted font-medium max-w-xs mx-auto leading-relaxed">
                      No activity yet. Once {allyName || 'your ally'} reviews your ledger or sends a note, it'll appear here.
                    </p>
                  </div>
                ) : encouragements.map((enc, i) => (
                  <motion.div 
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.1 }}
                    key={enc.id} 
                    className="flex gap-4"
                  >
                    <div className="flex flex-col items-center">
                      <div className={cn("w-8 h-8 rounded-full flex items-center justify-center shrink-0 border-2 text-xs", enc.type === 'system' ? "bg-border dark:bg-surface border-border text-text-muted" : "bg-primary-light dark:bg-primary/20 border-primary-light dark:border-primary/30 text-primary dark:text-primary")}>
                        {enc.type === 'system' ? <Clock className="w-3.5 h-3.5" /> : allyName.charAt(0)}
                      </div>
                      {i !== encouragements.length - 1 && <div className="w-px h-full bg-border mt-2" />}
                    </div>
                    
                    <div className="flex-1 pb-6">
                      <div className="bg-white dark:bg-surface border border-border p-4 rounded-2xl rounded-tl-none shadow-sm">
                        <p className={cn("text-sm font-medium leading-relaxed", enc.type === 'system' ? "text-text-muted font-mono text-xs" : "text-text-main")}>
                          {enc.type === 'personal' ? `"${enc.message}"` : enc.message}
                        </p>
                      </div>
                      <p className="text-[11px] text-text-muted mt-2 uppercase tracking-widest font-black pl-1">{enc.time}</p>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
            
          </div>
        </motion.div>
      )}
    </div>
  );
};

