import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Building, AlertTriangle, ArrowRight, TrendingDown, Target, Brain, FileText, CheckCircle2 } from 'lucide-react';
import { cn } from '../lib/utils';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const SICKNESS_TREND = [
  { month: 'Jan', days: 210, estimatedCost: 35000 },
  { month: 'Feb', days: 195, estimatedCost: 32500 },
  { month: 'Mar', days: 230, estimatedCost: 38000 },
  { month: 'Apr', days: 245, estimatedCost: 41000 },
];

export const OrgDashboardValue = () => {
  const [activeTab, setActiveTab] = useState<'cost' | 'planner' | 'predictor'>('cost');

  return (
    <div className="space-y-8 pb-24">
      {/* Header */}
      <div className="relative overflow-hidden rounded-xl bg-card border border-border p-8">
        <div className="absolute top-0 right-0 p-8 opacity-5">
          <Building className="w-64 h-64 text-text-main" />
        </div>
        <div className="relative z-10 max-w-3xl">
          <div className="flex items-center gap-3 mb-4">
            <div className="tag bg-surface dark:bg-card/10 text-text-main border-white/20">People Value Engine</div>
          </div>
          <h3 className="text-3xl font-display font-bold text-text-main tracking-tight mb-4">
            The Financial Cost of Pressure
          </h3>
          <p className="text-sm text-text-muted font-medium leading-relaxed max-w-2xl mb-8">
            Turn anonymous wellbeing signals into measurable business improvements.
            Based on your organisation's supplied data, reducing stress-related absence and reported overload by typical ranges may represent an estimated cost opportunity of <strong>£85,000–£120,000</strong> annually.
          </p>

          <div className="flex flex-wrap gap-2">
            {[
              { id: 'cost', label: 'Cost of Pressure' },
              { id: 'predictor', label: 'Absence Predictor & Coaching' },
              { id: 'planner', label: 'Management Savings Planner' }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={cn(
                  "px-4 py-2 rounded-xl text-xs font-bold transition-all",
                  activeTab === tab.id 
                    ? "bg-primary text-primary-foreground" 
                    : "bg-surface/50 text-text-muted hover:text-text-main hover:bg-surface"
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {activeTab === 'cost' && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="card border border-destructive/20 shadow-md shadow-destructive/5">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className="w-4 h-4 text-destructive" />
                <span className="text-xs uppercase tracking-widest font-bold text-text-muted">Avoidable Sickness</span>
              </div>
              <p className="text-2xl font-display font-bold text-text-main mb-1">2,400 days <span className="text-sm font-normal text-destructive">+12%</span></p>
              <p className="text-xs text-text-muted leading-relaxed hidden sm:block">Annualised pressure-related absence projection across 400 staff.</p>
            </div>
            
            <div className="card border-warning/20 shadow-xl shadow-warning/5">
              <div className="flex items-center gap-2 mb-2">
                <Target className="w-4 h-4 text-warning" />
                <span className="text-xs uppercase tracking-widest font-bold text-text-muted">Presenteeism Risk</span>
              </div>
              <p className="text-2xl font-display font-bold text-text-main mb-1">High <span className="text-sm font-normal text-text-muted">(Overload)</span></p>
              <p className="text-xs text-text-muted leading-relaxed hidden sm:block">Driven by rising workloads and falling protected lunch breaks.</p>
            </div>

            <div className="card border-primary/20 shadow-xl shadow-primary/5 bg-primary/5">
              <div className="flex items-center gap-2 mb-2">
                <TrendingDown className="w-4 h-4 text-primary" />
                <span className="text-xs uppercase tracking-widest font-bold text-primary">Est. Opportunity</span>
              </div>
              <p className="text-2xl font-display font-bold text-primary mb-1">£85k - £120k</p>
              <p className="text-xs text-primary/80 leading-relaxed hidden sm:block">Potential cost avoidance through supportive intervention.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 card space-y-6">
              <div>
                <h4 className="font-bold text-text-main">Sickness Absence & Estimated Cost</h4>
                <p className="text-xs text-text-muted">Projected cost of pressure-related absence based on supplied salary bands.</p>
              </div>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={SICKNESS_TREND} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorCost" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#f43f5e" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#334155" opacity={0.4} />
                    <XAxis dataKey="month" tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} />
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '12px' }}
                      itemStyle={{ color: '#fff', fontSize: '12px' }}
                      formatter={(value: any) => [`£${value}`, 'Estimated Cost']}
                    />
                    <Area type="monotone" dataKey="estimatedCost" stroke="#f43f5e" strokeWidth={3} fillOpacity={1} fill="url(#colorCost)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="card space-y-6 border-border dark:border-border">
              <h4 className="font-bold text-text-main flex items-center gap-2"><Brain className="w-5 h-5 text-primary" /> Priority Strategy</h4>
              <p className="text-sm text-text-muted leading-relaxed">
                Your organisation currently reports <strong>2,400 sickness absence days</strong> annually.
              </p>
              <div className="bg-surface dark:bg-surface/50 p-4 rounded-xl border border-border space-y-3">
                <p className="text-xs font-bold text-text-main uppercase tracking-widest">Current Pressure Signals</p>
                <ul className="text-sm space-y-2 text-text-muted">
                  <li className="flex items-center justify-between">Meeting overload: <span className="text-destructive font-bold">Rising</span></li>
                  <li className="flex items-center justify-between">Protected breaks: <span className="text-destructive font-bold">Falling</span></li>
                  <li className="flex items-center justify-between">Appreciation score: <span className="text-warning font-bold">Low</span></li>
                  <li className="flex items-center justify-between">After-hours working: <span className="text-warning font-bold">Amber</span></li>
                </ul>
              </div>
              <div className="bg-primary/5 border border-primary/20 p-4 rounded-xl">
                 <p className="text-xs text-primary font-medium leading-relaxed">
                   <strong>Nova Recommendation:</strong> Reduce unnecessary meeting load, introduce weekly appreciation rituals and protect uninterrupted recovery breaks for the next 30 days.
                 </p>
              </div>
            </div>
          </div>
        </motion.div>
      )}

      {activeTab === 'planner' && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-8">
           <div className="flex flex-col md:flex-row gap-8">
              <div className="w-full md:w-1/3 space-y-4">
                <div className="card border-primary/20 bg-primary/5">
                  <h4 className="font-bold text-primary mb-2">Management Savings Planner</h4>
                  <p className="text-xs text-primary/80 mb-6 leading-relaxed">
                    Select an issue to generate a 30/60/90-day action strategy based on anonymous climate data.
                  </p>
                  <div className="space-y-2">
                    <button className="w-full text-left px-4 py-3 rounded-xl bg-white dark:bg-card border border-border font-bold text-sm text-text-main shadow-sm flex items-center justify-between">
                      Stress-related absence is increasing <ArrowRight className="w-4 h-4 text-text-muted" />
                    </button>
                    <button className="w-full text-left px-4 py-3 rounded-xl bg-surface border border-border text-sm text-text-muted hover:bg-surface dark:bg-card dark:hover:bg-surface transition-colors">
                      Team morale is dropping
                    </button>
                    <button className="w-full text-left px-4 py-3 rounded-xl bg-surface border border-border text-sm text-text-muted hover:bg-surface dark:bg-card dark:hover:bg-surface transition-colors">
                      High voluntary turnover
                    </button>
                  </div>
                </div>

                <div className="card">
                  <h4 className="text-sm font-bold text-text-main mb-3">Diagnostic Questions</h4>
                  <ul className="space-y-2 text-xs text-text-muted">
                    <li className="flex gap-2"><CheckCircle2 className="w-3 h-3 text-success mt-0.5" /> Is workload pressure rising? (Yes)</li>
                    <li className="flex gap-2"><AlertTriangle className="w-3 h-3 text-destructive mt-0.5" /> Are protected breaks happening? (No)</li>
                    <li className="flex gap-2"><AlertTriangle className="w-3 h-3 text-warning mt-0.5" /> Is recognition low? (Yes)</li>
                  </ul>
                </div>
              </div>

              <div className="w-full md:w-2/3 space-y-6">
                <div className="relative pl-8 space-y-8 before:absolute before:inset-0 before:ml-[11px] before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-border before:to-transparent">
                  
                  {/* Phase 1 */}
                  <div className="relative">
                    <div className="absolute -left-[35px] top-1 w-6 h-6 rounded-full bg-primary/20 border-2 border-primary flex items-center justify-center font-bold text-xs text-primary">30</div>
                    <div className="card relative p-6">
                      <h4 className="font-bold text-text-main mb-4 flex items-center justify-between">
                        30-Day Actions
                        <span className="text-xs font-bold uppercase tracking-widest text-success bg-success/10 px-2 py-1 rounded">In Progress</span>
                      </h4>
                      <div className="space-y-3">
                        <label className="flex items-start gap-3 cursor-pointer group">
                          <input type="checkbox" checked readOnly className="hidden" />
                          <div className="w-5 h-5 rounded border bg-primary border-primary flex items-center justify-center text-primary-foreground shrink-0">
                            <CheckCircle2 className="w-4 h-4" />
                          </div>
                          <div>
                            <span className="text-sm font-medium text-text-main group-hover:text-primary transition-colors">Establish anonymous team climate baseline</span>
                          </div>
                        </label>
                        <label className="flex items-start gap-3 cursor-pointer group">
                          <input type="checkbox" readOnly className="hidden" />
                          <div className="w-5 h-5 rounded border border-border flex items-center justify-center text-transparent shrink-0">
                            <CheckCircle2 className="w-4 h-4" />
                          </div>
                          <div>
                            <span className="text-sm font-medium text-text-main group-hover:text-primary transition-colors">Begin Tiny Wins recognition</span>
                            <p className="text-xs text-text-muted mt-1">Roll out Blaze Bright Moments module.</p>
                          </div>
                        </label>
                        <label className="flex items-start gap-3 cursor-pointer group">
                          <input type="checkbox" readOnly className="hidden" />
                          <div className="w-5 h-5 rounded border border-border flex items-center justify-center text-transparent shrink-0">
                            <CheckCircle2 className="w-4 h-4" />
                          </div>
                          <div>
                            <span className="text-sm font-medium text-text-main group-hover:text-primary transition-colors">Protect recovery breaks</span>
                          </div>
                        </label>
                      </div>
                    </div>
                  </div>

                  {/* Phase 2 */}
                  <div className="relative">
                    <div className="absolute -left-[35px] top-1 w-6 h-6 rounded-full bg-surface border-2 border-border flex items-center justify-center font-bold text-xs text-text-muted">60</div>
                    <div className="card relative p-6 opacity-60">
                      <h4 className="font-bold text-text-main mb-4">60-Day Actions</h4>
                      <ul className="text-sm text-text-muted space-y-2 list-disc pl-4">
                        <li>Compare pressure and morale trends</li>
                        <li>Implement after-hours boundaries</li>
                        <li>Launch manager support training</li>
                      </ul>
                    </div>
                  </div>

                  {/* Phase 3 */}
                  <div className="relative">
                    <div className="absolute -left-[35px] top-1 w-6 h-6 rounded-full bg-surface border-2 border-border flex items-center justify-center font-bold text-xs text-text-muted">90</div>
                    <div className="card relative p-6 opacity-60">
                      <h4 className="font-bold text-text-main mb-4">90-Day Review</h4>
                      <ul className="text-sm text-text-muted space-y-2 list-disc pl-4">
                        <li>Compare sickness absence trend</li>
                        <li>Calculate estimated improvement opportunity</li>
                        <li>Recommend next programme phase</li>
                      </ul>
                    </div>
                  </div>

                </div>
              </div>
           </div>
        </motion.div>
      )}
      {activeTab === 'predictor' && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-8">
          <div className="bg-primary/5 border border-primary/20 p-4 rounded-xl flex items-center justify-between">
             <div className="flex items-center gap-3">
                <Brain className="w-5 h-5 text-primary shrink-0" />
                <p className="text-sm font-medium text-text-main">
                  <strong>Privacy Upheld:</strong> Managers cannot see individual interactions with Nova. Individual identities are fully protected. Predictions are based strictly on aggregated overall stats indicating stress from work overload.
                </p>
             </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="card border-border">
              <h4 className="font-bold text-text-main mb-4 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-warning" /> Sickness & Presenteeism Prediction
              </h4>
              <p className="text-xs text-text-muted mb-6">Aggregated projection of cohort absence risk based on current strain signals.</p>
              
              <div className="space-y-4">
                <div className="flex items-center justify-between p-3 bg-surface rounded-lg">
                  <span className="text-sm font-bold text-text-main">Engineering Cohort</span>
                  <span className="text-xs font-black uppercase tracking-widest text-destructive bg-destructive/10 px-2 py-1 rounded">High Risk (6 predicted)</span>
                </div>
                <div className="flex items-center justify-between p-3 bg-surface rounded-lg">
                  <span className="text-sm font-bold text-text-main">Marketing Cohort</span>
                  <span className="text-xs font-black uppercase tracking-widest text-success bg-success/10 px-2 py-1 rounded">Low Risk (0 predicted)</span>
                </div>
                <div className="flex items-center justify-between p-3 bg-surface rounded-lg">
                  <span className="text-sm font-bold text-text-main">Sales Leadership</span>
                  <span className="text-xs font-black uppercase tracking-widest text-warning bg-warning/10 px-2 py-1 rounded">Med Risk (2 predicted)</span>
                </div>
              </div>
            </div>

            <div className="card border-primary/30 shadow-xl shadow-primary/5">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-xl bg-primary text-primary-foreground flex items-center justify-center shrink-0 shadow-lg shadow-primary/30">
                  <Brain className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="font-bold text-text-main text-lg">Nova Manager Coach</h4>
                  <p className="text-xs text-text-muted">Guidance to approach and alleviate team stress safely.</p>
                </div>
              </div>
              <div className="space-y-4">
                <div className="bg-surface p-4 rounded-xl border border-border">
                  <p className="text-sm font-medium text-text-main mb-3 leading-relaxed">
                    "Engineering cohort is showing signs of critical overload, increasing the likelihood of presenteeism where productivity falls sharply."
                  </p>
                  <div className="flex items-start gap-2 pt-3 border-t border-border">
                    <Target className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                    <p className="text-sm text-text-muted">
                      <strong>How to approach:</strong> Schedule a 1:1 specifically focused on workload reprioritisation—do not ask "how are you," ask "what can we drop this week?". Provide them explicit permission to pull back on non-critical tasks to prevent prolonged sickness absence.
                    </p>
                  </div>
                </div>
                <div className="bg-surface p-4 rounded-xl border border-border">
                  <div className="flex items-start gap-2">
                    <FileText className="w-4 h-4 text-warning mt-0.5 shrink-0" />
                    <p className="text-sm text-text-muted">
                      <strong>Cost Impact Avoidance:</strong> Intervening this week could save an estimated £4,200 in near-term lost productivity and acute sickness leave across the Engineering cohort.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </div>
  );
};
