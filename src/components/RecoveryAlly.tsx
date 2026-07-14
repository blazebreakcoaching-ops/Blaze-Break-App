import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { HeartPulse, CheckSquare, Target, Mail, Send, Award, Trash2, CheckCircle2, AlertTriangle, ShieldCheck, Activity, Brain, Clock, Plus, ArrowRight, Zap } from 'lucide-react';
import { cn } from '../lib/utils';

export const RecoveryAlly = () => {
  const [allyEmail, setAllyEmail] = useState('');
  const [isInvited, setIsInvited] = useState(false);
  const [allyName, setAllyName] = useState('Sarah J.'); // Mock data if invited

  const [permissions, setPermissions] = useState({
    viewGoals: true,
    viewMilestones: true,
    sendPings: true,
    viewEnergyStats: false
  });

  const [sharedGoals, setSharedGoals] = useState([
    { id: 1, text: "Hard cut-off from communications at 19:00", completed: false, category: "boundary", streak: 4 },
    { id: 2, text: "Minimum 45min offline macro-break daily", completed: true, category: "recovery", streak: 12 },
    { id: 3, text: "Delegate 2 non-critical reviews this sprint", completed: false, category: "delegation", streak: 0 }
  ]);

  const [encouragements, setEncouragements] = useState([
    { id: 1, type: "system", message: "Ally reviewed your Q3 capacity matrix.", time: "2 hours ago" },
    { id: 2, type: "personal", message: "Noticed the energy dip on the dashboard. Remember to delegate the Friday sprint review.", time: "1 day ago" }
  ]);

  const [isAddingGoal, setIsAddingGoal] = useState(false);
  const [newGoalText, setNewGoalText] = useState('');

  const handleInvite = (e: React.FormEvent) => {
    e.preventDefault();
    if (allyEmail.trim()) {
      setIsInvited(true);
      setAllyName(allyEmail.split('@')[0]);
    }
  };

  const handleRevoke = () => {
    setIsInvited(false);
    setAllyEmail('');
  };

  const toggleGoal = (id: number) => {
    setSharedGoals(prev => prev.map(g => g.id === id ? { ...g, completed: !g.completed } : g));
  };

  const addNewGoal = (e: React.FormEvent) => {
    e.preventDefault();
    if (newGoalText.trim()) {
      setSharedGoals([{ id: Date.now(), text: newGoalText, completed: false, category: "custom", streak: 0 }, ...sharedGoals]);
      setNewGoalText('');
      setIsAddingGoal(false);
    }
  };

  return (
    <div className="space-y-8 pb-12">
      <div className="relative overflow-hidden rounded-3xl bg-card border border-border p-8 shadow-2xl">
        <div className="absolute top-0 right-0 p-8 opacity-5 pointer-events-none">
          <HeartPulse className="w-64 h-64 text-text-muted" />
        </div>
        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/noise-lines.png')] opacity-10 pointer-events-none" />
        <div className="relative z-10 max-w-3xl">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 rounded-xl bg-primary/10 border border-primary/20 text-primary flex items-center justify-center shrink-0 shadow-inner">
              <HeartPulse className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-3xl font-display font-bold text-text-main tracking-tight">Executive Accountability Network</h2>
              <p className="text-primary/70 text-xs font-bold uppercase tracking-widest mt-1">Recovery Ally Protocol</p>
            </div>
          </div>
          <p className="text-text-muted text-sm leading-relaxed mb-6 max-w-2xl">
            A secure bridge allowing selected peers, mentors, or partners to passively monitor your capacity boundaries and provide contextual reinforcement. Control data flow with granular permissions.
          </p>
          <div className="bg-surface/50 backdrop-blur border border-destructive/20 p-4 rounded-xl flex gap-3 text-xs text-text-muted max-w-lg shadow-sm">
            <AlertTriangle className="w-5 h-5 text-destructive/80 shrink-0" />
            <div>
              <strong className="text-destructive">Non-Escalation Protocol.</strong> This framework is exclusively for boundary reinforcement. For acute crisis or critical neural load overrides, activate the <em className="text-text-muted">Guardian Relay</em>.
            </div>
          </div>
        </div>
      </div>

      {!isInvited ? (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="card max-w-2xl p-8 bg-white dark:bg-card border-border shadow-xl">
          <div className="flex items-start gap-4 mb-8">
            <div className="w-10 h-10 rounded-full bg-surface dark:bg-surface flex items-center justify-center shrink-0">
              <ShieldCheck className="w-5 h-5 text-text-muted" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-text-main mb-1">Provision Ally Access</h3>
              <p className="text-xs text-text-muted leading-relaxed">Transmit a secure, zero-trust cryptographic invite. The recipient will authenticate via single-use token to access your sanitized accountability ledger.</p>
            </div>
          </div>
          
          <form onSubmit={handleInvite} className="space-y-6">
            <div className="space-y-2">
              <label className="text-xs font-black uppercase tracking-widest text-text-muted ml-1">Target Address</label>
              <div className="relative group">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-text-muted group-focus-within:text-primary transition-colors" />
                <input
                  type="email"
                  value={allyEmail}
                  onChange={(e) => setAllyEmail(e.target.value)}
                  placeholder="executive@organization.com"
                  className="w-full bg-surface dark:bg-surface border border-border focus:border-primary focus:ring-primary/20 text-text-main placeholder:text-text-muted rounded-xl pl-12 pr-4 py-4 font-mono text-sm focus:outline-none focus:ring-2 transition-all"
                  required
                />
              </div>
            </div>
            <button 
              type="submit"
              className="w-full flex items-center justify-center gap-3 px-6 py-4 bg-surface dark:bg-white text-text-main dark:text-foreground hover:opacity-90 rounded-xl text-xs font-black uppercase tracking-widest transition-all shadow-md group"
            >
              Issue Credentials <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </button>
          </form>
        </motion.div>
      ) : (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* Active Status & Permissions */}
          <div className="lg:col-span-4 space-y-6">
            <div className="card space-y-6 border-primary/20 shadow-xl shadow-primary/5 bg-white dark:bg-card">
              <div className="flex items-center gap-4 border-b border-border pb-6">
                <div className="relative">
                  <div className="w-14 h-14 rounded-full bg-surface dark:bg-surface text-text-muted flex items-center justify-center font-bold text-xl uppercase border-2 border-primary/30">
                    {allyName.charAt(0)}
                  </div>
                  <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-success border-2 border-surface dark:border-surface rounded-full" />
                </div>
                <div>
                  <h3 className="font-bold text-text-main text-lg tracking-tight">{allyName}</h3>
                  <span className="inline-flex items-center gap-1.5 text-[11px] uppercase font-black tracking-widest text-success dark:text-success mt-1">
                    <CheckCircle2 className="w-3 h-3" /> Connection Verified
                  </span>
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-black uppercase tracking-[0.2em] text-text-muted">Access Control Matrix</h4>
                  <ShieldCheck className="w-4 h-4 text-text-muted" />
                </div>
                
                <div className="space-y-3">
                  <label className="flex items-center justify-between p-3 rounded-lg border border-border hover:border-primary/30 transition-colors cursor-pointer group bg-surface dark:bg-surface/50">
                    <div className="flex items-center gap-3">
                      <Target className="w-4 h-4 text-text-muted group-hover:text-primary transition-colors" />
                      <span className="text-xs font-bold text-text-main">Operational Goals</span>
                    </div>
                    <input type="checkbox" checked={permissions.viewGoals} onChange={() => setPermissions(p => ({ ...p, viewGoals: !p.viewGoals }))} className="w-4 h-4 text-primary rounded border-border focus:ring-primary bg-transparent" />
                  </label>
                  
                  <label className="flex items-center justify-between p-3 rounded-lg border border-border hover:border-primary/30 transition-colors cursor-pointer group bg-surface dark:bg-surface/50">
                    <div className="flex items-center gap-3">
                      <Award className="w-4 h-4 text-text-muted group-hover:text-primary transition-colors" />
                      <span className="text-xs font-bold text-text-main">Milestone Telemetry</span>
                    </div>
                    <input type="checkbox" checked={permissions.viewMilestones} onChange={() => setPermissions(p => ({ ...p, viewMilestones: !p.viewMilestones }))} className="w-4 h-4 text-primary rounded border-border focus:ring-primary bg-transparent" />
                  </label>

                  <label className="flex items-center justify-between p-3 rounded-lg border border-border hover:border-primary/30 transition-colors cursor-pointer group bg-surface dark:bg-surface/50">
                    <div className="flex items-center gap-3">
                      <Activity className="w-4 h-4 text-text-muted group-hover:text-primary transition-colors" />
                      <span className="text-xs font-bold text-text-main">Energy Delta Sync</span>
                    </div>
                    <input type="checkbox" checked={permissions.viewEnergyStats} onChange={() => setPermissions(p => ({ ...p, viewEnergyStats: !p.viewEnergyStats }))} className="w-4 h-4 text-primary rounded border-border focus:ring-primary bg-transparent" />
                  </label>
                </div>
              </div>

              <div className="pt-4 mt-6 border-t border-border">
                <button 
                  onClick={handleRevoke}
                  className="w-full flex items-center justify-center gap-2 py-3 text-rose-600 dark:text-destructive bg-rose-50 dark:bg-destructive/10 hover:bg-rose-100 dark:hover:bg-destructive/20 rounded-xl text-xs uppercase tracking-widest font-black transition-all"
                >
                  <Trash2 className="w-4 h-4" /> Terminate Connection
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
                    <Target className="w-5 h-5 text-primary" /> Boundary Directives
                  </h3>
                  <p className="text-xs text-text-muted mt-1 leading-relaxed">Delegated accountability targets synchronized with network peer.</p>
                </div>
                <button 
                  onClick={() => setIsAddingGoal(!isAddingGoal)}
                  className="shrink-0 flex items-center gap-2 text-xs font-black uppercase tracking-widest text-text-muted bg-surface dark:bg-surface px-4 py-2.5 rounded-xl hover:bg-border dark:hover:bg-surface transition-colors"
                >
                  <Plus className="w-4 h-4" /> Deploy Directive
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
                    <div className="flex gap-3 bg-surface dark:bg-card border border-border p-2 rounded-xl">
                      <input 
                        type="text" 
                        value={newGoalText}
                        onChange={(e) => setNewGoalText(e.target.value)}
                        placeholder="Define operational boundary..."
                        className="flex-1 bg-transparent border-none focus:ring-0 text-sm font-medium px-3 text-text-main"
                        autoFocus
                      />
                      <button type="submit" className="bg-primary text-primary-foreground px-4 py-2 rounded-lg text-xs font-bold shadow-sm hover:bg-primary transition-colors">Confirm</button>
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
                  <Brain className="w-5 h-5 text-primary" /> Synchronization Log
                </h3>
                <p className="text-xs text-text-muted mt-1 leading-relaxed">Incoming diagnostics and structural reinforcement from {allyName}.</p>
              </div>

              <div className="space-y-4">
                {encouragements.map((enc, i) => (
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

