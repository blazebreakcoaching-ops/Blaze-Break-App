import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Building, AlertTriangle, ArrowRight, Target, Brain, CheckCircle2, Loader2, Lock, Save } from 'lucide-react';
import { cn } from '../lib/utils';
import { secureApiFetch } from '../lib/secure-api';

interface CostInputs {
  annualSicknessDays: number;
  avgDailyCostPerEmployee: number;
  headcount: number;
}

export const OrgDashboardValue = () => {
  const [activeTab, setActiveTab] = useState<'cost' | 'planner' | 'predictor'>('cost');

  const [orgId, setOrgId] = useState<string | null>(null);
  const [isOrgAdmin, setIsOrgAdmin] = useState(false);
  const [costInputs, setCostInputs] = useState<CostInputs | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const [formSicknessDays, setFormSicknessDays] = useState('');
  const [formDailyCost, setFormDailyCost] = useState('');
  const [formHeadcount, setFormHeadcount] = useState('');
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const meRes = await secureApiFetch('/api/org/me');
        const me = await meRes.json();
        if (!me.organisationId) {
          setLoading(false);
          return;
        }
        setOrgId(me.organisationId);
        setIsOrgAdmin(!!me.isOrgAdmin);

        const inputsRes = await secureApiFetch(`/api/org/${me.organisationId}/cost-inputs`);
        const inputsData = await inputsRes.json();
        if (inputsRes.ok && inputsData.costInputs) {
          setCostInputs(inputsData.costInputs);
          setFormSicknessDays(String(inputsData.costInputs.annualSicknessDays));
          setFormDailyCost(String(inputsData.costInputs.avgDailyCostPerEmployee));
          setFormHeadcount(String(inputsData.costInputs.headcount));
        } else {
          setEditing(true);
        }
      } catch (e) {
        setError("Could not load your organisation's cost data.");
      }
      setLoading(false);
    };
    load();
  }, []);

  const handleSave = async () => {
    if (!orgId) return;
    const annualSicknessDays = Number(formSicknessDays);
    const avgDailyCostPerEmployee = Number(formDailyCost);
    const headcount = Number(formHeadcount);
    if (
      !Number.isFinite(annualSicknessDays) || annualSicknessDays < 0 ||
      !Number.isFinite(avgDailyCostPerEmployee) || avgDailyCostPerEmployee < 0 ||
      !Number.isFinite(headcount) || headcount < 0
    ) {
      setError('Please enter valid, non-negative numbers for all three fields.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const res = await secureApiFetch(`/api/org/${orgId}/cost-inputs`, {
        method: 'POST',
        data: { annualSicknessDays, avgDailyCostPerEmployee, headcount },
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Could not save those figures.');
      } else {
        setCostInputs({ annualSicknessDays, avgDailyCostPerEmployee, headcount });
        setEditing(false);
      }
    } catch (e) {
      setError('Could not save those figures.');
    }
    setSaving(false);
  };

  const estimatedAnnualCost = costInputs ? costInputs.annualSicknessDays * costInputs.avgDailyCostPerEmployee : null;
  const costPerEmployee = estimatedAnnualCost != null && costInputs && costInputs.headcount > 0
    ? Math.round(estimatedAnnualCost / costInputs.headcount)
    : null;

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
            A calculator using your organisation's own real figures — not an industry estimate. Enter your actual sickness-absence days and average daily cost per employee below, and this reflects your organisation specifically.
          </p>

          <div className="flex flex-wrap gap-2">
            {[
              { id: 'cost', label: 'Cost of Pressure' },
              { id: 'predictor', label: 'Absence Prediction' },
              { id: 'planner', label: 'Management Savings Planner' }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={cn(
                  "px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-widest transition-all",
                  activeTab === tab.id
                    ? "bg-white dark:bg-card text-text-main shadow-sm"
                    : "text-text-muted hover:text-text-main"
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : !orgId ? (
        <div className="flex flex-col items-center justify-center p-6 sm:p-8 md:p-12 text-center bg-surface dark:bg-surface/50 rounded-xl border border-dashed border-border">
          <Building className="w-12 h-12 text-text-muted mb-4" />
          <h3 className="text-xl font-bold text-text-main mb-2">No Organisation Linked</h3>
          <p className="text-text-muted text-sm max-w-md">Join your employer's organisation from the Trust &amp; Privacy Centre to see this calculator.</p>
        </div>
      ) : (
        <>
          {activeTab === 'cost' && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-8">
              {error && (
                <div className="p-3 bg-destructive/10 border border-destructive/20 text-destructive text-sm rounded-xl">{error}</div>
              )}

              {!isOrgAdmin && !costInputs ? (
                <div className="p-8 text-center border-2 border-dashed border-border rounded-xl">
                  <Lock className="w-8 h-8 mx-auto text-text-muted mb-3" />
                  <p className="text-text-muted text-sm">Your organisation admin hasn't entered cost figures yet. Check back once they have.</p>
                </div>
              ) : isOrgAdmin && editing ? (
                <div className="card space-y-6 max-w-xl">
                  <h4 className="font-bold text-text-main">Enter Your Organisation's Real Figures</h4>
                  <p className="text-xs text-text-muted leading-relaxed">These come from your own HR/absence records — Blaze Break doesn't have access to this data itself, so nothing here is estimated or guessed.</p>
                  <div className="space-y-4">
                    <div>
                      <label className="text-xs font-bold uppercase tracking-widest text-text-muted block mb-1">Annual Sickness Absence Days (total, across the org)</label>
                      <input
                        type="number"
                        min="0"
                        value={formSicknessDays}
                        onChange={(e) => setFormSicknessDays(e.target.value)}
                        placeholder="e.g. 240"
                        className="w-full bg-surface border border-border rounded-xl px-4 py-3 text-sm text-text-main focus:outline-none focus:border-primary"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-bold uppercase tracking-widest text-text-muted block mb-1">Average Daily Cost Per Employee (£)</label>
                      <input
                        type="number"
                        min="0"
                        value={formDailyCost}
                        onChange={(e) => setFormDailyCost(e.target.value)}
                        placeholder="e.g. 180"
                        className="w-full bg-surface border border-border rounded-xl px-4 py-3 text-sm text-text-main focus:outline-none focus:border-primary"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-bold uppercase tracking-widest text-text-muted block mb-1">Total Headcount</label>
                      <input
                        type="number"
                        min="0"
                        value={formHeadcount}
                        onChange={(e) => setFormHeadcount(e.target.value)}
                        placeholder="e.g. 45"
                        className="w-full bg-surface border border-border rounded-xl px-4 py-3 text-sm text-text-main focus:outline-none focus:border-primary"
                      />
                    </div>
                  </div>
                  <button
                    onClick={handleSave}
                    disabled={saving || !formSicknessDays || !formDailyCost || !formHeadcount}
                    className="btn-primary flex items-center gap-2 disabled:opacity-50"
                  >
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    Save & Calculate
                  </button>
                </div>
              ) : costInputs ? (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="card border border-destructive/20 shadow-md shadow-destructive/5">
                      <div className="flex items-center gap-2 mb-2">
                        <AlertTriangle className="w-4 h-4 text-destructive" />
                        <span className="text-xs uppercase tracking-widest font-bold text-text-muted">Reported Sickness</span>
                      </div>
                      <p className="text-2xl font-display font-bold text-text-main mb-1">{costInputs.annualSicknessDays.toLocaleString()} days</p>
                      <p className="text-xs text-text-muted leading-relaxed hidden sm:block">Annually, across {costInputs.headcount} staff — as entered by your admin.</p>
                    </div>

                    <div className="card border-warning/20 shadow-xl shadow-warning/5">
                      <div className="flex items-center gap-2 mb-2">
                        <Target className="w-4 h-4 text-warning" />
                        <span className="text-xs uppercase tracking-widest font-bold text-text-muted">Cost Per Employee</span>
                      </div>
                      <p className="text-2xl font-display font-bold text-text-main mb-1">{costPerEmployee != null ? `£${costPerEmployee.toLocaleString()}` : '—'}</p>
                      <p className="text-xs text-text-muted leading-relaxed hidden sm:block">Estimated annual absence cost, divided across headcount.</p>
                    </div>

                    <div className="card border-primary/20 shadow-xl shadow-primary/5 bg-primary/5">
                      <div className="flex items-center gap-2 mb-2">
                        <Building className="w-4 h-4 text-primary" />
                        <span className="text-xs uppercase tracking-widest font-bold text-primary">Total Annual Cost</span>
                      </div>
                      <p className="text-2xl font-display font-bold text-primary mb-1">{estimatedAnnualCost != null ? `£${estimatedAnnualCost.toLocaleString()}` : '—'}</p>
                      <p className="text-xs text-primary/80 leading-relaxed hidden sm:block">Sickness days × your entered daily cost per employee.</p>
                    </div>
                  </div>

                  {isOrgAdmin && (
                    <button
                      onClick={() => setEditing(true)}
                      className="text-xs font-bold text-text-muted hover:text-text-main transition-colors flex items-center gap-1"
                    >
                      Update these figures <ArrowRight className="w-3 h-3" />
                    </button>
                  )}

                  <div className="card space-y-6 border-border dark:border-border max-w-2xl">
                    <h4 className="font-bold text-text-main flex items-center gap-2"><Brain className="w-5 h-5 text-primary" /> General Strategy</h4>
                    <p className="text-sm text-text-muted leading-relaxed">
                      These practices are generally associated with lower stress-related absence — not a promise specific to your numbers above, since we don't have enough data to model your organisation's specific response.
                    </p>
                    <div className="bg-primary/5 border border-primary/20 p-4 rounded-xl">
                      <p className="text-xs text-primary font-medium leading-relaxed">
                        Reduce unnecessary meeting load, introduce weekly appreciation rituals, and protect uninterrupted recovery breaks. Track your own sickness-absence trend over the following months to see whether it actually moves for your team.
                      </p>
                    </div>
                  </div>
                </>
              ) : null}
            </motion.div>
          )}

          {activeTab === 'planner' && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-8">
              <div className="flex flex-col md:flex-row gap-8">
                <div className="w-full md:w-1/3 space-y-4">
                  <div className="card border-primary/20 bg-primary/5">
                    <h4 className="font-bold text-primary mb-2">Management Savings Planner</h4>
                    <p className="text-xs text-primary/80 mb-6 leading-relaxed">
                      A general 30/60/90-day framework for addressing common pressure signals — a starting structure, not one generated from your specific data.
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
                    <h4 className="text-sm font-bold text-text-main mb-3">Questions Worth Asking</h4>
                    <ul className="space-y-2 text-xs text-text-muted">
                      <li className="flex gap-2"><CheckCircle2 className="w-3 h-3 text-text-muted mt-0.5 shrink-0" /> Is workload pressure rising for your team?</li>
                      <li className="flex gap-2"><CheckCircle2 className="w-3 h-3 text-text-muted mt-0.5 shrink-0" /> Are protected breaks actually happening, or just scheduled?</li>
                      <li className="flex gap-2"><CheckCircle2 className="w-3 h-3 text-text-muted mt-0.5 shrink-0" /> Is recognition and appreciation genuinely felt, or just assumed?</li>
                    </ul>
                  </div>
                </div>

                <div className="w-full md:w-2/3 space-y-6">
                  <div className="relative pl-8 space-y-8 before:absolute before:inset-0 before:ml-[11px] before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-border before:to-transparent">

                    <div className="relative">
                      <div className="absolute -left-[35px] top-1 w-6 h-6 rounded-full bg-primary/20 border-2 border-primary flex items-center justify-center font-bold text-xs text-primary">30</div>
                      <div className="card relative p-6">
                        <h4 className="font-bold text-text-main mb-4">30-Day Actions</h4>
                        <ul className="text-sm text-text-muted space-y-2 list-disc pl-4">
                          <li>Establish a real team climate baseline — ask people directly, don't assume</li>
                          <li>Begin a recognition rhythm (see the Blaze Bright Moments tab)</li>
                          <li>Protect recovery breaks on the calendar, not just in principle</li>
                        </ul>
                      </div>
                    </div>

                    <div className="relative">
                      <div className="absolute -left-[35px] top-1 w-6 h-6 rounded-full bg-surface border-2 border-border flex items-center justify-center font-bold text-xs text-text-muted">60</div>
                      <div className="card relative p-6 opacity-80">
                        <h4 className="font-bold text-text-main mb-4">60-Day Actions</h4>
                        <ul className="text-sm text-text-muted space-y-2 list-disc pl-4">
                          <li>Compare how things actually feel now versus 30 days ago</li>
                          <li>Implement clearer after-hours communication boundaries</li>
                          <li>Offer manager support/training on workload conversations</li>
                        </ul>
                      </div>
                    </div>

                    <div className="relative">
                      <div className="absolute -left-[35px] top-1 w-6 h-6 rounded-full bg-surface border-2 border-border flex items-center justify-center font-bold text-xs text-text-muted">90</div>
                      <div className="card relative p-6 opacity-80">
                        <h4 className="font-bold text-text-main mb-4">90-Day Review</h4>
                        <ul className="text-sm text-text-muted space-y-2 list-disc pl-4">
                          <li>Compare your real sickness-absence trend against your own baseline</li>
                          <li>Decide honestly whether the cost opportunity above actually moved</li>
                          <li>Plan the next phase based on what you learned, not on a guess</li>
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
              <div className="card border border-dashed border-border bg-surface/50 space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-surface text-text-muted flex items-center justify-center shrink-0">
                    <Lock className="w-5 h-5" />
                  </div>
                  <h4 className="font-bold text-text-main text-lg">Absence Prediction — Not Yet Available</h4>
                </div>
                <p className="text-sm text-text-muted leading-relaxed max-w-2xl">
                  A genuine version of per-team absence prediction would need actual historical absence records broken down by team, and a real statistical model built and validated against that history — not a plausible-sounding guess. Neither exists yet, so rather than show invented department names and made-up risk percentages, this space stays honestly empty. The <strong className="text-text-main">Resilience Pulse</strong> tab reflects real, currently-available aggregate data instead.
                </p>
              </div>
            </motion.div>
          )}
        </>
      )}
    </div>
  );
};
