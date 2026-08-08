import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { HeartPulse, CheckSquare, Target, Mail, Award, Trash2, CheckCircle2, AlertTriangle, ShieldCheck, Activity, Brain, Clock, Plus, ArrowRight, Zap, Loader2, Copy } from 'lucide-react';
import { cn } from '../lib/utils';
import { logJourney } from '../lib/nova-brain';
import { secureApiFetch } from '../lib/secure-api';
import { auth, db } from '../lib/firebase';
import { doc, getDoc, setDoc, collection, addDoc, getDocs, deleteDoc, orderBy, query, limit } from 'firebase/firestore';

interface SharedGoal {
  id: string;
  text: string;
  category: string;
  completedDates: string[];
}

interface Encouragement {
  id: string;
  type: 'system' | 'personal';
  message: string;
  createdAt: string;
}

interface AllyPermissions {
  viewGoals: boolean;
  viewMilestones: boolean;
  sendPings: boolean;
  viewEnergyStats: boolean;
}

const DEFAULT_PERMISSIONS: AllyPermissions = { viewGoals: true, viewMilestones: true, sendPings: true, viewEnergyStats: false };

// Same logic as the server's computeStreak - counts consecutive completed
// days ending today or yesterday, so a streak isn't broken just because
// today hasn't happened yet.
const computeStreak = (completedDates: string[]): number => {
  if (!completedDates || completedDates.length === 0) return 0;
  const dateSet = new Set(completedDates);
  const today = new Date();
  let streak = 0;
  const cursor = new Date(today);
  const todayStr = today.toISOString().split('T')[0];
  if (!dateSet.has(todayStr)) {
    cursor.setDate(cursor.getDate() - 1);
  }
  while (dateSet.has(cursor.toISOString().split('T')[0])) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
};

export const RecoveryAlly = () => {
  const [loading, setLoading] = useState(true);
  const [isInvited, setIsInvited] = useState(false);
  const [allyName, setAllyName] = useState('');
  const [allyEmail, setAllyEmail] = useState('');
  const [shareToken, setShareToken] = useState('');
  const [permissions, setPermissionsState] = useState<AllyPermissions>(DEFAULT_PERMISSIONS);
  const [sharedGoals, setSharedGoals] = useState<SharedGoal[]>([]);
  const [encouragements, setEncouragements] = useState<Encouragement[]>([]);

  const [emailDraft, setEmailDraft] = useState('');
  const [inviting, setInviting] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const [error, setError] = useState('');
  const [isAddingGoal, setIsAddingGoal] = useState(false);
  const [newGoalText, setNewGoalText] = useState('');
  const [linkCopied, setLinkCopied] = useState(false);

  const fetchGoals = async () => {
    if (!auth.currentUser) return;
    const snap = await getDocs(query(collection(db, 'users', auth.currentUser.uid, 'ally_shared_goals'), orderBy('createdAt', 'desc')));
    setSharedGoals(snap.docs.map(d => ({ id: d.id, ...d.data() } as SharedGoal)));
  };

  const fetchEncouragements = async () => {
    if (!auth.currentUser) return;
    const snap = await getDocs(query(collection(db, 'users', auth.currentUser.uid, 'ally_encouragements'), orderBy('createdAt', 'desc'), limit(30)));
    setEncouragements(snap.docs.map(d => ({ id: d.id, ...d.data() } as Encouragement)));
  };

  useEffect(() => {
    const load = async () => {
      if (!auth.currentUser) { setLoading(false); return; }
      try {
        const stateSnap = await getDoc(doc(db, 'users', auth.currentUser.uid, 'recovery_ally', 'state'));
        if (stateSnap.exists()) {
          const data = stateSnap.data();
          setIsInvited(!!data.isInvited);
          setAllyName(data.allyName || '');
          setAllyEmail(data.allyEmail || '');
          setShareToken(data.shareToken || '');
          setPermissionsState({ ...DEFAULT_PERMISSIONS, ...(data.permissions || {}) });
          if (data.isInvited) {
            await fetchGoals();
            await fetchEncouragements();
          }
        }
      } catch (e) {
        setError('Could not load your Recovery Ally settings.');
      }
      setLoading(false);
    };
    load();
  }, []);

  const savePermissions = async (next: AllyPermissions) => {
    setPermissionsState(next);
    if (!auth.currentUser) return;
    try {
      await setDoc(doc(db, 'users', auth.currentUser.uid, 'recovery_ally', 'state'), {
        permissions: next,
        updatedAt: new Date().toISOString(),
      }, { merge: true });
    } catch (e) {
      // Non-fatal - the toggle still reflects locally even if the save fails;
      // it'll revert to the last-saved value next time this loads.
    }
  };

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!emailDraft.trim()) return;
    setInviting(true);
    setError('');
    try {
      const res = await secureApiFetch('/api/ally/invite', {
        method: 'POST',
        data: { allyEmail: emailDraft.trim() },
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Could not send that invite.');
      } else {
        setIsInvited(true);
        setAllyEmail(emailDraft.trim().toLowerCase());
        setAllyName(emailDraft.split('@')[0]);
        setShareToken(data.shareToken || '');
        setPermissionsState(DEFAULT_PERMISSIONS);
        setEmailDraft('');
        if (!data.emailSent) {
          setError("Invite created, but the email couldn't be sent - copy the link below and share it directly.");
        }
        await fetchGoals();
      }
    } catch (e) {
      setError('Could not send that invite.');
    }
    setInviting(false);
  };

  const handleRevoke = async () => {
    setRevoking(true);
    try {
      await secureApiFetch('/api/ally/revoke', { method: 'POST' });
      setIsInvited(false);
      setAllyEmail('');
      setAllyName('');
      setShareToken('');
      setEncouragements([]);
    } catch (e) {
      setError('Could not remove your ally. Please try again.');
    }
    setRevoking(false);
  };

  const toggleGoalToday = async (goal: SharedGoal) => {
    if (!auth.currentUser) return;
    const todayStr = new Date().toISOString().split('T')[0];
    const wasCompleted = goal.completedDates.includes(todayStr);
    const nextDates = wasCompleted
      ? goal.completedDates.filter(d => d !== todayStr)
      : [...goal.completedDates, todayStr];

    setSharedGoals(prev => prev.map(g => g.id === goal.id ? { ...g, completedDates: nextDates } : g));
    try {
      await setDoc(doc(db, 'users', auth.currentUser.uid, 'ally_shared_goals', goal.id), {
        completedDates: nextDates,
        updatedAt: new Date().toISOString(),
      }, { merge: true });
    } catch (e) {
      await fetchGoals(); // Reconcile with what's actually saved if the write failed.
    }
  };

  const addNewGoal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGoalText.trim() || !auth.currentUser) return;
    const text = newGoalText.trim();
    setNewGoalText('');
    setIsAddingGoal(false);
    try {
      const ref = await addDoc(collection(db, 'users', auth.currentUser.uid, 'ally_shared_goals'), {
        text, category: 'custom', completedDates: [],
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      });
      setSharedGoals(prev => [{ id: ref.id, text, category: 'custom', completedDates: [] }, ...prev]);
      logJourney(`Set a boundary goal shared with Recovery Ally`, text);
    } catch (e) {
      setError('Could not save that goal.');
    }
  };

  const deleteGoal = async (goalId: string) => {
    if (!auth.currentUser) return;
    setSharedGoals(prev => prev.filter(g => g.id !== goalId));
    try {
      await deleteDoc(doc(db, 'users', auth.currentUser.uid, 'ally_shared_goals', goalId));
    } catch (e) {
      await fetchGoals();
    }
  };

  const shareLink = shareToken ? `${window.location.origin}/ally/${shareToken}` : '';

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

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
            Invite a trusted friend, mentor, or partner to check in on your recovery — you choose exactly what they can see, and you can turn any of it off at any time. They don't need their own account.
          </p>
          <div className="bg-surface border border-destructive/20 p-4 rounded-lg flex gap-3 text-xs text-text-muted max-w-lg">
            <AlertTriangle className="w-5 h-5 text-destructive/80 shrink-0" />
            <div>
              <strong className="text-destructive">This isn't for crises.</strong> It's for everyday accountability. If you're in crisis or need immediate support, use <em className="text-text-muted">Guardian Relay</em> instead.
            </div>
          </div>
        </div>
      </div>

      {error && (
        <div className="p-3 bg-destructive/10 border border-destructive/20 text-destructive text-sm rounded-xl max-w-2xl">{error}</div>
      )}

      {!isInvited ? (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="card max-w-2xl p-8 bg-white dark:bg-card border border-border">
          <div className="flex items-start gap-4 mb-8">
            <div className="w-10 h-10 rounded-full bg-surface dark:bg-surface flex items-center justify-center shrink-0">
              <ShieldCheck className="w-5 h-5 text-text-muted" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-text-main mb-1">Invite Your Ally</h3>
              <p className="text-xs text-text-muted leading-relaxed">A real email goes out with a private link. They'll see what you choose to share and can leave you a note — no sign-up required.</p>
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
              disabled={inviting}
              className="w-full flex items-center justify-center gap-3 px-6 py-4 bg-primary text-primary-foreground hover:opacity-90 rounded-lg text-xs font-medium uppercase tracking-widest transition-all group disabled:opacity-50"
            >
              {inviting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
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
                    <CheckCircle2 className="w-3 h-3" /> Invited
                  </span>
                </div>
              </div>

              {shareLink && (
                <div className="p-3 bg-surface rounded-lg border border-border space-y-1.5">
                  <span className="text-[10px] font-black uppercase tracking-widest text-text-muted">Their private link</span>
                  <div className="flex items-center gap-2">
                    <code className="text-[11px] text-text-main truncate flex-1">{shareLink}</code>
                    <button
                      onClick={() => { navigator.clipboard.writeText(shareLink); setLinkCopied(true); setTimeout(() => setLinkCopied(false), 2000); }}
                      className="text-text-muted hover:text-primary transition-colors shrink-0"
                      title="Copy link"
                    >
                      {linkCopied ? <CheckCircle2 className="w-3.5 h-3.5 text-success" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
              )}

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
                    <input type="checkbox" checked={permissions.viewGoals} onChange={() => savePermissions({ ...permissions, viewGoals: !permissions.viewGoals })} className="w-4 h-4 text-primary rounded border-border focus:ring-primary bg-transparent" />
                  </label>

                  <label className="flex items-center justify-between p-3 rounded-lg border border-border hover:border-primary/30 transition-colors cursor-pointer group bg-surface dark:bg-surface/50">
                    <div className="flex items-center gap-3">
                      <Award className="w-4 h-4 text-text-muted group-hover:text-primary transition-colors" />
                      <span className="text-xs font-bold text-text-main">Milestone Updates</span>
                    </div>
                    <input type="checkbox" checked={permissions.viewMilestones} onChange={() => savePermissions({ ...permissions, viewMilestones: !permissions.viewMilestones })} className="w-4 h-4 text-primary rounded border-border focus:ring-primary bg-transparent" />
                  </label>

                  <label className="flex items-center justify-between p-3 rounded-lg border border-border hover:border-primary/30 transition-colors cursor-pointer group bg-surface dark:bg-surface/50">
                    <div className="flex items-center gap-3">
                      <Activity className="w-4 h-4 text-text-muted group-hover:text-primary transition-colors" />
                      <span className="text-xs font-bold text-text-main">Energy Levels</span>
                    </div>
                    <input type="checkbox" checked={permissions.viewEnergyStats} onChange={() => savePermissions({ ...permissions, viewEnergyStats: !permissions.viewEnergyStats })} className="w-4 h-4 text-primary rounded border-border focus:ring-primary bg-transparent" />
                  </label>

                  <label className="flex items-center justify-between p-3 rounded-lg border border-border hover:border-primary/30 transition-colors cursor-pointer group bg-surface dark:bg-surface/50">
                    <div className="flex items-center gap-3">
                      <Mail className="w-4 h-4 text-text-muted group-hover:text-primary transition-colors" />
                      <span className="text-xs font-bold text-text-main">Allow Messages</span>
                    </div>
                    <input type="checkbox" checked={permissions.sendPings} onChange={() => savePermissions({ ...permissions, sendPings: !permissions.sendPings })} className="w-4 h-4 text-primary rounded border-border focus:ring-primary bg-transparent" />
                  </label>
                </div>
              </div>

              <div className="pt-4 mt-6 border-t border-border">
                <button
                  onClick={handleRevoke}
                  disabled={revoking}
                  className="w-full flex items-center justify-center gap-2 py-3 text-destructive bg-destructive/5 hover:bg-destructive/10 rounded-lg text-xs uppercase tracking-widest font-medium transition-colors disabled:opacity-50"
                >
                  {revoking ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />} Remove Ally
                </button>
              </div>
            </div>
          </div>

          <div className="lg:col-span-8 space-y-6">
            {/* Shared Goals */}
            <div className="card space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h3 className="font-bold text-text-main text-lg flex items-center gap-2 tracking-tight">
                    <Target className="w-5 h-5 text-primary" /> Boundary Goals
                  </h3>
                  <p className="text-xs text-text-muted mt-1 leading-relaxed">Goals you're sharing with {allyName}. Tap to mark today done.</p>
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
                        maxLength={200}
                        className="flex-1 bg-transparent border-none focus:ring-0 text-sm font-medium px-3 text-text-main"
                        autoFocus
                      />
                      <button type="submit" className="bg-primary text-primary-foreground px-4 py-2 rounded-lg text-xs font-bold hover:opacity-90 transition-colors">Confirm</button>
                    </div>
                  </motion.form>
                )}
              </AnimatePresence>

              <div className="space-y-3">
                {sharedGoals.length === 0 ? (
                  <div className="text-center py-8">
                    <p className="text-xs text-text-muted font-medium">No goals yet — add one above to start sharing progress.</p>
                  </div>
                ) : sharedGoals.map(goal => {
                  const todayStr = new Date().toISOString().split('T')[0];
                  const completedToday = goal.completedDates.includes(todayStr);
                  const streak = computeStreak(goal.completedDates);
                  return (
                    <motion.div
                      layout
                      key={goal.id}
                      className={cn(
                        "group flex items-center justify-between p-4 sm:p-5 rounded-2xl border transition-all relative overflow-hidden",
                        completedToday ? "bg-success/5 border-success/20" : "bg-white dark:bg-card border-border hover:border-primary/30 shadow-sm hover:shadow"
                      )}
                    >
                      {completedToday && <div className="absolute inset-y-0 left-0 w-1 bg-success" />}

                      <div className="flex items-center gap-4 cursor-pointer flex-1" onClick={() => toggleGoalToday(goal)}>
                        <div className={cn("w-6 h-6 rounded-md flex items-center justify-center shrink-0 border-2 transition-all", completedToday ? "bg-success border-success text-white" : "border-border dark:border-muted-foreground text-transparent")}>
                          <CheckSquare className="w-4 h-4" />
                        </div>
                        <div>
                          <span className={cn("text-sm font-bold transition-all block", completedToday ? "text-text-muted line-through" : "text-text-main")}>{goal.text}</span>
                          <div className="flex items-center gap-3 mt-1.5 opacity-60 group-hover:opacity-100 transition-opacity">
                            <span className="text-[11px] font-black uppercase tracking-widest text-text-muted">{goal.category}</span>
                            {streak > 0 && <span className="text-[11px] font-black uppercase tracking-widest text-warning flex items-center gap-1"><Zap className="w-3 h-3" /> {streak} Day Streak</span>}
                          </div>
                        </div>
                      </div>
                      <button
                        onClick={() => deleteGoal(goal.id)}
                        className="text-text-muted hover:text-destructive transition-colors opacity-0 group-hover:opacity-100 shrink-0 ml-2"
                        title="Remove goal"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </motion.div>
                  );
                })}
              </div>
            </div>

            {/* Encouragement Feed */}
            <div className="card space-y-6 bg-surface dark:bg-card/50">
              <div>
                <h3 className="font-bold text-text-main text-lg flex items-center gap-2 tracking-tight">
                  <Brain className="w-5 h-5 text-primary" /> Encouragement Feed
                </h3>
                <p className="text-xs text-text-muted mt-1 leading-relaxed">Notes from {allyName || 'your ally'}, sent from their private link.</p>
              </div>

              <div className="space-y-4">
                {encouragements.length === 0 ? (
                  <div className="text-center py-8">
                    <p className="text-xs text-text-muted font-medium max-w-xs mx-auto leading-relaxed">
                      No notes yet. Once {allyName || 'your ally'} visits their link and leaves one, it'll appear here.
                    </p>
                  </div>
                ) : encouragements.map((enc, i) => (
                  <motion.div
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.05 }}
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
                      <p className="text-[11px] text-text-muted mt-2 uppercase tracking-widest font-black pl-1">
                        {new Date(enc.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </p>
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
