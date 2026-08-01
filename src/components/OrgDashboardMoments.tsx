import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Sparkles, Heart, Award, Target, MessageSquare, Zap, Clock, ThumbsUp, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { cn } from '../lib/utils';

export const OrgDashboardMoments = () => {
  const [activeTab, setActiveTab] = useState<'wall' | 'challenges' | 'personal'>('wall');

  const MOMENTS = [
    { id: 1, from: 'Sarah', message: 'Thank you for supporting me during a busy shift today. Really appreciate the cover.', type: 'support', time: '2 hours ago' },
    { id: 2, from: 'Anonymous', message: 'Noticed the team was under pressure and helped sort out the backlog. Hero!', type: 'recognition', time: '4 hours ago' },
    { id: 3, from: 'Marcus (Manager)', message: 'Great job setting a healthy boundary on the Friday deploy. It made the team safer.', type: 'manager', time: 'Yesterday' }
  ];

  return (
    <div className="space-y-8 pb-24">
      {/* Header */}
      <div className="relative overflow-hidden rounded-xl bg-warning/10 border border-warning/20 p-8">
        <div className="absolute top-0 right-0 p-8 opacity-10">
          <Sparkles className="w-48 h-48 text-warning" />
        </div>
        <div className="relative z-10 max-w-3xl">
          <div className="flex items-center gap-3 mb-4">
            <div className="tag bg-white dark:bg-card border-border shadow-sm text-text-main flex items-center gap-2">
              <Sparkles className="w-3 h-3 text-warning" /> Blaze Bright Moments
            </div>
          </div>
          <h3 className="text-3xl font-display font-bold text-text-main tracking-tight mb-4">
            Notice What Works.
          </h3>
          <p className="text-sm text-text-muted leading-relaxed max-w-2xl mb-8">
            A positive reinforcement system built around appreciation, belonging and healthy team behaviour. 
            We do not reward perfect attendance or working late. We celebrate how people support a healthy team.
          </p>

          <div className="flex flex-wrap gap-2">
            {[
              { id: 'wall', label: 'Team Recognition Wall', icon: MessageSquare },
              { id: 'challenges', label: 'Community Challenges', icon: Target },
              { id: 'personal', label: 'My Wins & Proof', icon: Award }
            ].map(tab => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={cn(
                    "flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all",
                    activeTab === tab.id 
                      ? "bg-warning text-warning-foreground shadow-md shadow-warning/20" 
                      : "bg-white dark:bg-surface text-text-muted border border-border hover:border-warning/50"
                  )}
                >
                  <Icon className="w-4 h-4" />
                  {tab.label}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      <AnimatePresence mode="wait">
        {activeTab === 'wall' && (
          <motion.div key="wall" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }} className="space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-text-main">Recent Appreciation</h3>
              <button className="px-4 py-2 bg-warning text-warning-foreground rounded-xl text-xs font-bold hover:bg-warning transition-colors shadow-sm">
                + Note Appreciation
              </button>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {MOMENTS.map(moment => (
                <div key={moment.id} className="card bg-white dark:bg-card border-border hover:border-warning/30 transition-colors group">
                  <div className="flex items-center gap-3 mb-4">
                    <div className={cn(
                      "w-8 h-8 rounded-full flex items-center justify-center shrink-0",
                      moment.type === 'support' ? "bg-rose-100 text-destructive" :
                      moment.type === 'manager' ? "bg-primary/10 text-primary" :
                      "bg-warning/20 text-warning"
                    )}>
                      {moment.type === 'support' ? <Heart className="w-4 h-4" /> :
                       moment.type === 'manager' ? <Award className="w-4 h-4" /> :
                       <ThumbsUp className="w-4 h-4" />}
                    </div>
                    <div>
                      <p className="text-xs font-bold text-text-main">{moment.from}</p>
                      <p className="text-xs text-text-muted uppercase tracking-widest">{moment.time}</p>
                    </div>
                  </div>
                  <p className="text-sm font-medium text-text-main leading-relaxed italic">"{moment.message}"</p>
                </div>
              ))}
            </div>

            <div className="card bg-primary/5 border-primary/20 mt-8">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-full bg-primary/20 text-primary flex items-center justify-center shrink-0 mt-1">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="font-bold text-primary mb-1">Nova Prompt</h4>
                  <p className="text-sm text-text-main mb-3 leading-relaxed">
                    "Marcus, you have three quiet contributors in your team who handled heavy support tickets this week. Have you acknowledged their effort?"
                  </p>
                  <button className="text-xs font-bold text-primary-foreground bg-primary px-4 py-2 rounded-lg shadow-sm hover:bg-primary/90 transition-colors">
                    Send Appreciation Note
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {activeTab === 'challenges' && (
          <motion.div key="challenges" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }} className="space-y-6">
            <div className="card border-dashed border-border bg-surface dark:bg-surface/20">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className="w-4 h-4 text-warning" />
                <span className="text-xs font-bold text-text-main">No leaderboards. No humiliation.</span>
              </div>
              <p className="text-sm text-text-muted">
                Good team challenges are uplifting and collaborative. We avoid metrics that breed toxic "presenteeism" (like perfect attendance or fastest replies).
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="card space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Clock className="w-5 h-5 text-success" />
                    <h4 className="font-bold text-text-main">Protect the Break Week</h4>
                  </div>
                  <span className="text-xs font-bold uppercase tracking-widest text-success bg-success/10 px-2 py-1 rounded">Active</span>
                </div>
                <p className="text-xs text-text-muted">Team goal to build a healthier lunch-break culture by actually logging off for 45 minutes.</p>
                <div className="w-full bg-surface dark:bg-surface rounded-full h-2">
                  <div className="bg-success h-2 rounded-full" style={{ width: '65%' }}></div>
                </div>
                <p className="text-xs text-right font-bold text-text-muted">65% Participation</p>
              </div>

              <div className="card space-y-4 opacity-75">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <MessageSquare className="w-5 h-5 text-warning" />
                    <h4 className="font-bold text-text-main">Appreciation Ripple</h4>
                  </div>
                  <span className="text-xs font-bold uppercase tracking-widest text-text-muted bg-surface dark:bg-surface px-2 py-1 rounded">Starts Monday</span>
                </div>
                <p className="text-xs text-text-muted">Each person thanks someone for a specific helpful action. Creates a web of team support.</p>
                <button className="w-full py-2 border border-border rounded-lg text-xs font-bold text-text-muted cursor-not-allowed">
                  Join Waitlist
                </button>
              </div>
            </div>
          </motion.div>
        )}

        {activeTab === 'personal' && (
          <motion.div key="personal" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }} className="space-y-6">
             <div className="card">
               <h3 className="font-bold text-text-main mb-2 flex items-center gap-2"><Target className="w-5 h-5 text-primary" /> My Private Wins Log</h3>
               <p className="text-xs text-text-muted mb-6">
                 These are visible only to you. You can choose to share them to the wall or keep them private.
               </p>

               <div className="space-y-3">
                 <div className="p-4 border border-border bg-surface rounded-xl flex items-center justify-between group">
                   <div className="flex items-center gap-3">
                     <CheckCircle2 className="w-5 h-5 text-success" />
                     <span className="text-sm font-medium text-text-main">Protected my lunch break</span>
                   </div>
                   <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                     <span className="text-xs text-text-muted">Completed today</span>
                     <button className="text-xs text-warning bg-warning/10 dark:bg-warning/10 px-2 py-1 rounded border border-warning/30 dark:border-warning/20 font-bold hover:bg-warning/20 dark:hover:bg-warning/20">Share to Wall</button>
                   </div>
                 </div>
                 
                 <div className="p-4 border border-border bg-surface rounded-xl flex items-center justify-between group">
                   <div className="flex items-center gap-3">
                     <CheckCircle2 className="w-5 h-5 text-success" />
                     <span className="text-sm font-medium text-text-main">Completed a recovery reset after tense meeting</span>
                   </div>
                   <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                     <span className="text-xs text-text-muted">Completed yesterday</span>
                     <button className="text-xs text-warning bg-warning/10 dark:bg-warning/10 px-2 py-1 rounded border border-warning/30 dark:border-warning/20 font-bold hover:bg-warning/20 dark:hover:bg-warning/20">Share to Wall</button>
                   </div>
                 </div>
               </div>
             </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
