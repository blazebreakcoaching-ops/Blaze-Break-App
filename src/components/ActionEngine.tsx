import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Compass, ArrowRight } from 'lucide-react';
import { cn } from '../lib/utils';
import { auth } from '../lib/firebase';
import { loadRediscoveryClues, loadWorkloadRealityCheckHistory } from '../lib/rediscovery-service';
import {
  createActionInsight, updateActionInsight, loadRecentActionInsights,
} from '../lib/rediscovery-insight-service';
import {
  createExperiment, updateExperimentStatus, loadRecentExperiments,
} from '../lib/action-experiment-service';
import {
  ActionInsightRecord,
  pickCandidateInsight, CandidateInsight,
  ACTION_WORTHINESS_ORDER, ACTION_WORTHINESS_LABELS, ACTION_WORTHINESS_QUESTION, ActionWorthinessAnswer,
  shouldEnterControllabilityGate, leadsToNothingNeedsFixing,
  CONTROLLABILITY_ORDER, CONTROLLABILITY_LABELS, CONTROLLABILITY_GUIDANCE, CONTROLLABILITY_QUESTION, Controllability,
  SHARED_RESPONSIBILITY_PROMPTS, SharedResponsibilityPlan,
  OUTSIDE_CONTROL_RESPONSE_ORDER, OUTSIDE_CONTROL_RESPONSE_LABELS, OUTSIDE_CONTROL_LINE, OUTSIDE_CONTROL_HANDOFF_TAB, OutsideControlResponse,
  NOTHING_NEEDS_FIXING_LINE, NOTHING_NEEDS_FIXING_ORDER, NOTHING_NEEDS_FIXING_LABELS, NothingNeedsFixingChoice,
  TRY_ONCE_CTA, EXPERIMENT_CTA,
  EXPERIMENT_DURATION_ORDER, EXPERIMENT_DURATION_LABELS, ExperimentDuration,
  MOMENT_OF_TRUTH_PROMPT, MOMENT_OF_TRUTH_CUE_PROMPT, MOMENT_OF_TRUTH_RESPONSE_PROMPT,
  FRICTION_FORECAST_QUESTION, FRICTION_TYPE_ORDER, FRICTION_TYPE_LABELS, FrictionType,
  FRICTION_ADAPTATION_LABELS, FRICTION_ADAPTATION_FOR_TYPE,
  MINIMUM_VIABLE_CHANGE_PROMPT,
  ladderLevelForExperiment, hasActiveExperiment,
  ONE_ACTIVE_EXPERIMENT_LINE, ACTIVE_EXPERIMENT_CONFLICT_ORDER, ACTIVE_EXPERIMENT_CONFLICT_LABELS, ActiveExperimentConflictChoice,
} from '../../action-engine';

interface ActionEngineProps {
  onNavigate?: (tab: string) => void;
}

type Step =
  | 'loading' | 'empty' | 'insight_card' | 'controllability_gate' | 'controllability_guidance'
  | 'depends_on_someone_resolve' | 'shared_plan_saved' | 'outside_control_resolve' | 'nothing_needs_fixing'
  | 'active_experiment_conflict' | 'experiment_builder' | 'resolved';

type BuilderStage = 'text' | 'moment' | 'friction' | 'mvc';

export const ActionEngine = ({ onNavigate }: ActionEngineProps) => {
  const [step, setStep] = useState<Step>('loading');
  const [insight, setInsight] = useState<ActionInsightRecord | null>(null);
  const [resolvedSummary, setResolvedSummary] = useState<string>('');
  const [sharedPlan, setSharedPlan] = useState<SharedResponsibilityPlan>({ myPart: '', theirPart: '', ifTheySayNo: '' });

  const [pendingExperimentText, setPendingExperimentText] = useState('');
  const [builderStage, setBuilderStage] = useState<BuilderStage>('text');
  const [experimentText, setExperimentText] = useState('');
  const [experimentDuration, setExperimentDuration] = useState<ExperimentDuration | null>(null);
  const [momentCue, setMomentCue] = useState('');
  const [momentResponse, setMomentResponse] = useState('');
  const [friction, setFriction] = useState<FrictionType | null>(null);
  const [mvc, setMvc] = useState('');

  useEffect(() => {
    const load = async () => {
      if (!auth.currentUser) { setStep('empty'); return; }
      const uid = auth.currentUser.uid;
      try {
        const existing = await loadRecentActionInsights(uid);
        const pending = existing.find((i) => i.state === 'nova_noticed' || i.state === 'still_exploring') ?? null;
        if (pending) {
          setInsight(pending);
          setStep(pending.controllability ? 'controllability_gate' : 'insight_card');
          return;
        }
        const [clues, workloadHistory] = await Promise.all([
          loadRediscoveryClues(uid),
          loadWorkloadRealityCheckHistory(uid),
        ]);
        const candidate: CandidateInsight | null = pickCandidateInsight(workloadHistory, clues);
        if (!candidate) { setStep('empty'); return; }
        const id = await createActionInsight(uid, { section: 'what_drains', text: candidate.text, source: candidate.source });
        const now = new Date().toISOString();
        setInsight({
          id, section: 'what_drains', text: candidate.text, state: 'nova_noticed', source: candidate.source,
          controllability: null, sharedResponsibilityPlan: null, outsideControlChoice: null, nothingNeedsFixingChoice: null,
          createdAt: now, updatedAt: now,
        });
        setStep('insight_card');
      } catch {
        setStep('empty');
      }
    };
    load();
  }, []);

  const answerWorthiness = async (answer: ActionWorthinessAnswer) => {
    if (!auth.currentUser || !insight) return;
    if (shouldEnterControllabilityGate(answer)) {
      await updateActionInsight(auth.currentUser.uid, insight.id, { state: 'user_confirmed' });
      setInsight({ ...insight, state: 'user_confirmed' });
      setStep('controllability_gate');
      return;
    }
    if (leadsToNothingNeedsFixing(answer)) {
      const nextState = answer === 'not_really' ? 'rejected' : 'still_exploring';
      await updateActionInsight(auth.currentUser.uid, insight.id, { state: nextState });
      setInsight({ ...insight, state: nextState });
      setStep('nothing_needs_fixing');
      return;
    }
    // understand_first
    await updateActionInsight(auth.currentUser.uid, insight.id, { state: 'still_exploring' });
    setInsight({ ...insight, state: 'still_exploring' });
    setResolvedSummary("That's alright — some things take a while to see clearly. It'll stay here to revisit whenever you're ready.");
    setStep('resolved');
  };

  const chooseControllability = async (c: Controllability) => {
    if (!auth.currentUser || !insight) return;
    await updateActionInsight(auth.currentUser.uid, insight.id, { controllability: c });
    setInsight({ ...insight, controllability: c });
    if (c === 'depends_on_someone_else') { setStep('depends_on_someone_resolve'); return; }
    if (c === 'mostly_outside_control') { setStep('outside_control_resolve'); return; }
    if (c === 'not_sure') {
      setResolvedSummary(CONTROLLABILITY_GUIDANCE[c]);
      setStep('resolved');
      return;
    }
    setStep('controllability_guidance');
  };

  const saveSharedPlan = async () => {
    if (!auth.currentUser || !insight) return;
    await updateActionInsight(auth.currentUser.uid, insight.id, { sharedResponsibilityPlan: sharedPlan });
    setStep('shared_plan_saved');
  };

  const chooseOutsideControl = async (choice: OutsideControlResponse) => {
    if (!auth.currentUser || !insight) return;
    await updateActionInsight(auth.currentUser.uid, insight.id, { outsideControlChoice: choice });
    setInsight({ ...insight, outsideControlChoice: choice });
    const handoffTab = OUTSIDE_CONTROL_HANDOFF_TAB[choice];
    if (handoffTab && onNavigate) { onNavigate(handoffTab); return; }
    setResolvedSummary(`Noted — ${OUTSIDE_CONTROL_RESPONSE_LABELS[choice]}.`);
    setStep('resolved');
  };

  const chooseNothingNeedsFixing = async (choice: NothingNeedsFixingChoice) => {
    if (!auth.currentUser || !insight) return;
    await updateActionInsight(auth.currentUser.uid, insight.id, { nothingNeedsFixingChoice: choice });
    if (choice === 'talk_to_nova' && onNavigate) { onNavigate('nova'); return; }
    setResolvedSummary(NOTHING_NEEDS_FIXING_LABELS[choice]);
    setStep('resolved');
  };

  const enterExperimentBuilder = async (prefillText: string) => {
    if (!auth.currentUser) return;
    const experiments = await loadRecentExperiments(auth.currentUser.uid);
    if (hasActiveExperiment(experiments)) {
      setPendingExperimentText(prefillText);
      setStep('active_experiment_conflict');
      return;
    }
    setExperimentText(prefillText);
    setExperimentDuration(null);
    setMomentCue(''); setMomentResponse(''); setFriction(null); setMvc('');
    setBuilderStage('text');
    setStep('experiment_builder');
  };

  const resolveActiveExperimentConflict = async (choice: ActiveExperimentConflictChoice) => {
    if (choice === 'replace_it' && auth.currentUser) {
      const experiments = await loadRecentExperiments(auth.currentUser.uid);
      const active = experiments.find((e) => e.status === 'active');
      if (active) await updateExperimentStatus(auth.currentUser.uid, active.id, 'abandoned');
      setExperimentText(pendingExperimentText);
      setExperimentDuration(null);
      setMomentCue(''); setMomentResponse(''); setFriction(null); setMvc('');
      setBuilderStage('text');
      setStep('experiment_builder');
      return;
    }
    setResolvedSummary(
      choice === 'keep_current'
        ? "Good call — let's stay focused on what you're already testing."
        : "Saved for later. We'll come back to it when you're ready."
    );
    setStep('resolved');
  };

  const saveExperiment = async (mvcOverride?: string) => {
    if (!auth.currentUser || !insight || !experimentText.trim()) return;
    await createExperiment(auth.currentUser.uid, {
      insightId: insight.id,
      text: experimentText.trim(),
      ladderLevel: ladderLevelForExperiment(experimentDuration),
      duration: experimentDuration,
      momentOfTruth: momentCue.trim() || momentResponse.trim() ? { cue: momentCue.trim(), response: momentResponse.trim() } : null,
      friction,
      minimumViableChange: (mvcOverride ?? mvc).trim() || null,
    });
    setResolvedSummary(
      `You're trying: "${experimentText.trim()}" — ${experimentDuration ? EXPERIMENT_DURATION_LABELS[experimentDuration] : 'next time it comes up'}.`
    );
    setStep('resolved');
  };

  if (step === 'loading') return null;

  return (
    <div className="card p-6 sm:p-8 space-y-6">
      <div className="flex items-center gap-4">
        <div className="w-10 h-10 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0">
          <Compass className="w-5 h-5 text-primary" aria-hidden="true" />
        </div>
        <div>
          <h3 className="text-lg font-display font-bold text-text-main">What should we make real?</h3>
          <p className="text-xs text-text-muted">Turn what you're learning about yourself into something you can actually live.</p>
        </div>
      </div>

      <AnimatePresence mode="wait">
        {step === 'empty' && (
          <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center space-y-3 py-4">
            <p className="text-sm font-medium text-text-main">Nothing needs changing yet.</p>
            <p className="text-xs text-text-muted">Nova is still learning what feels worth acting on.</p>
            {onNavigate && (
              <button onClick={() => onNavigate('nova')} className="text-xs font-bold text-primary hover:underline">
                Talk to Nova
              </button>
            )}
          </motion.div>
        )}

        {step === 'insight_card' && insight && (
          <motion.div key="insight_card" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
            <div className="p-4 rounded-xl bg-surface/60 border border-border/50">
              <p className="text-xs font-bold text-primary uppercase tracking-wider mb-1">Nova noticed</p>
              <p className="text-sm text-text-main">{insight.text}</p>
            </div>
            <p className="text-sm font-bold text-text-main">{ACTION_WORTHINESS_QUESTION}</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {ACTION_WORTHINESS_ORDER.map((a) => (
                <button
                  key={a}
                  onClick={() => answerWorthiness(a)}
                  className="p-3 rounded-xl bg-surface/50 border border-border/50 hover:border-primary/40 text-sm font-medium text-text-main text-left"
                >
                  {ACTION_WORTHINESS_LABELS[a]}
                </button>
              ))}
            </div>
          </motion.div>
        )}

        {step === 'controllability_gate' && insight && (
          <motion.div key="controllability_gate" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
            <div className="p-4 rounded-xl bg-surface/60 border border-border/50">
              <p className="text-sm text-text-main">{insight.text}</p>
            </div>
            <p className="text-sm font-bold text-text-main">{CONTROLLABILITY_QUESTION}</p>
            <div className="space-y-2">
              {CONTROLLABILITY_ORDER.map((c) => (
                <button
                  key={c}
                  onClick={() => chooseControllability(c)}
                  className="w-full p-3 rounded-xl bg-surface/50 border border-border/50 hover:border-primary/40 text-left"
                >
                  <span className="text-sm font-bold text-text-main">{CONTROLLABILITY_LABELS[c]}</span>
                </button>
              ))}
            </div>
          </motion.div>
        )}

        {step === 'controllability_guidance' && insight?.controllability && (
          <motion.div key="controllability_guidance" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
            <p className="text-sm text-text-main">{CONTROLLABILITY_GUIDANCE[insight.controllability]}</p>
            <div className="flex flex-wrap gap-3">
              <button onClick={() => enterExperimentBuilder(insight.text)} className="btn-primary py-2.5 px-5 inline-flex items-center gap-2">
                What should we try? <ArrowRight className="w-4 h-4" aria-hidden="true" />
              </button>
              <button
                onClick={() => { setResolvedSummary(CONTROLLABILITY_GUIDANCE[insight.controllability!]); setStep('resolved'); }}
                className="text-xs text-text-muted"
              >
                Not right now
              </button>
            </div>
          </motion.div>
        )}

        {step === 'depends_on_someone_resolve' && (
          <motion.div key="depends" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
            <p className="text-sm text-text-main">{CONTROLLABILITY_GUIDANCE.depends_on_someone_else}</p>
            {(Object.keys(SHARED_RESPONSIBILITY_PROMPTS) as (keyof SharedResponsibilityPlan)[]).map((key) => (
              <label key={key} className="block space-y-1.5">
                <span className="text-xs font-bold text-text-muted">{SHARED_RESPONSIBILITY_PROMPTS[key]}</span>
                <textarea
                  value={sharedPlan[key]}
                  onChange={(e) => setSharedPlan({ ...sharedPlan, [key]: e.target.value })}
                  rows={2}
                  className="w-full bg-surface/60 border border-border rounded-xl px-3 py-2 text-sm text-text-main"
                />
              </label>
            ))}
            <button onClick={saveSharedPlan} className="btn-primary py-2.5 px-5 inline-flex items-center gap-2">
              Save <ArrowRight className="w-4 h-4" aria-hidden="true" />
            </button>
          </motion.div>
        )}

        {step === 'shared_plan_saved' && (
          <motion.div key="shared_saved" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
            <p className="text-sm text-text-main">
              Your part: {sharedPlan.myPart || '—'}. Their part: {sharedPlan.theirPart || '—'}. If they say no: {sharedPlan.ifTheySayNo || '—'}.
            </p>
            <div className="flex flex-wrap gap-3">
              <button
                onClick={() => enterExperimentBuilder(sharedPlan.myPart || insight?.text || '')}
                className="btn-primary py-2.5 px-5 inline-flex items-center gap-2"
              >
                Build an experiment around my part <ArrowRight className="w-4 h-4" aria-hidden="true" />
              </button>
              <button onClick={() => { setResolvedSummary('Noted.'); setStep('resolved'); }} className="text-xs text-text-muted">
                Not right now
              </button>
            </div>
          </motion.div>
        )}

        {step === 'outside_control_resolve' && (
          <motion.div key="outside_control" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
            <p className="text-sm font-bold text-text-main">{OUTSIDE_CONTROL_LINE}</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {OUTSIDE_CONTROL_RESPONSE_ORDER.map((r) => (
                <button
                  key={r}
                  onClick={() => chooseOutsideControl(r)}
                  className="p-3 rounded-xl bg-surface/50 border border-border/50 hover:border-primary/40 text-sm font-medium text-text-main text-left"
                >
                  {OUTSIDE_CONTROL_RESPONSE_LABELS[r]}
                </button>
              ))}
            </div>
          </motion.div>
        )}

        {step === 'nothing_needs_fixing' && (
          <motion.div key="nnf" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
            <p className="text-sm font-bold text-text-main">{NOTHING_NEEDS_FIXING_LINE}</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {NOTHING_NEEDS_FIXING_ORDER.map((c) => (
                <button
                  key={c}
                  onClick={() => chooseNothingNeedsFixing(c)}
                  className="p-3 rounded-xl bg-surface/50 border border-border/50 hover:border-primary/40 text-sm font-medium text-text-main text-left"
                >
                  {NOTHING_NEEDS_FIXING_LABELS[c]}
                </button>
              ))}
            </div>
          </motion.div>
        )}

        {step === 'active_experiment_conflict' && (
          <motion.div key="active_conflict" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
            <p className="text-sm font-bold text-text-main">{ONE_ACTIVE_EXPERIMENT_LINE}</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {ACTIVE_EXPERIMENT_CONFLICT_ORDER.map((c) => (
                <button
                  key={c}
                  onClick={() => resolveActiveExperimentConflict(c)}
                  className="p-3 rounded-xl bg-surface/50 border border-border/50 hover:border-primary/40 text-sm font-medium text-text-main text-left"
                >
                  {ACTIVE_EXPERIMENT_CONFLICT_LABELS[c]}
                </button>
              ))}
            </div>
          </motion.div>
        )}

        {step === 'experiment_builder' && (
          <motion.div key="builder" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
            {builderStage === 'text' && (
              <>
                <label className="block space-y-1.5">
                  <span className="text-xs font-bold text-text-muted">What are we going to try?</span>
                  <textarea
                    value={experimentText}
                    onChange={(e) => setExperimentText(e.target.value)}
                    rows={2}
                    className="w-full bg-surface/60 border border-border rounded-xl px-3 py-2 text-sm text-text-main"
                  />
                </label>
                <div className="space-y-2">
                  <span className="text-xs font-bold text-text-muted">Want to set a duration, or just try it once?</span>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {EXPERIMENT_DURATION_ORDER.map((d) => (
                      <button
                        key={d}
                        onClick={() => setExperimentDuration(d)}
                        className={cn(
                          'p-2.5 rounded-xl border text-xs font-bold text-left',
                          experimentDuration === d ? 'border-primary bg-primary/10 text-primary' : 'border-border/50 bg-surface/50 text-text-main hover:border-primary/40'
                        )}
                      >
                        {EXPERIMENT_DURATION_LABELS[d]}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex flex-wrap gap-3">
                  <button
                    disabled={!experimentText.trim()}
                    onClick={() => { setExperimentDuration(null); setBuilderStage('moment'); }}
                    className="btn-primary py-2.5 px-5 disabled:opacity-40"
                  >
                    {TRY_ONCE_CTA}
                  </button>
                  {experimentDuration && (
                    <button
                      disabled={!experimentText.trim()}
                      onClick={() => setBuilderStage('moment')}
                      className="btn-primary py-2.5 px-5 disabled:opacity-40"
                    >
                      {EXPERIMENT_CTA}
                    </button>
                  )}
                </div>
              </>
            )}

            {builderStage === 'moment' && (
              <>
                <p className="text-sm font-bold text-text-main">{MOMENT_OF_TRUTH_PROMPT}</p>
                <label className="block space-y-1.5">
                  <span className="text-xs font-bold text-text-muted">{MOMENT_OF_TRUTH_CUE_PROMPT}</span>
                  <input
                    value={momentCue}
                    onChange={(e) => setMomentCue(e.target.value)}
                    className="w-full bg-surface/60 border border-border rounded-xl px-3 py-2 text-sm text-text-main"
                  />
                </label>
                <label className="block space-y-1.5">
                  <span className="text-xs font-bold text-text-muted">{MOMENT_OF_TRUTH_RESPONSE_PROMPT}</span>
                  <input
                    value={momentResponse}
                    onChange={(e) => setMomentResponse(e.target.value)}
                    className="w-full bg-surface/60 border border-border rounded-xl px-3 py-2 text-sm text-text-main"
                  />
                </label>
                <div className="flex gap-3">
                  <button onClick={() => setBuilderStage('friction')} className="btn-primary py-2.5 px-5">Continue</button>
                  <button
                    onClick={() => { setMomentCue(''); setMomentResponse(''); setBuilderStage('friction'); }}
                    className="text-xs text-text-muted"
                  >
                    Skip
                  </button>
                </div>
              </>
            )}

            {builderStage === 'friction' && (
              <>
                <p className="text-sm font-bold text-text-main">{FRICTION_FORECAST_QUESTION}</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {FRICTION_TYPE_ORDER.map((f) => (
                    <button
                      key={f}
                      onClick={() => setFriction(f)}
                      className={cn(
                        'p-2.5 rounded-xl border text-xs font-bold text-left',
                        friction === f ? 'border-primary bg-primary/10 text-primary' : 'border-border/50 bg-surface/50 text-text-main hover:border-primary/40'
                      )}
                    >
                      {FRICTION_TYPE_LABELS[f]}
                    </button>
                  ))}
                </div>
                {friction && (
                  <p className="text-xs text-text-muted">{FRICTION_ADAPTATION_LABELS[FRICTION_ADAPTATION_FOR_TYPE[friction]]}</p>
                )}
                <div className="flex gap-3">
                  <button onClick={() => setBuilderStage('mvc')} className="btn-primary py-2.5 px-5">Continue</button>
                  <button onClick={() => { setFriction(null); setBuilderStage('mvc'); }} className="text-xs text-text-muted">Skip</button>
                </div>
              </>
            )}

            {builderStage === 'mvc' && (
              <>
                <p className="text-sm font-bold text-text-main">{MINIMUM_VIABLE_CHANGE_PROMPT}</p>
                <textarea
                  value={mvc}
                  onChange={(e) => setMvc(e.target.value)}
                  rows={2}
                  className="w-full bg-surface/60 border border-border rounded-xl px-3 py-2 text-sm text-text-main"
                />
                <div className="flex gap-3">
                  <button onClick={() => saveExperiment()} className="btn-primary py-2.5 px-5">Start</button>
                  <button onClick={() => saveExperiment('')} className="text-xs text-text-muted">Skip &amp; start</button>
                </div>
              </>
            )}
          </motion.div>
        )}

        {step === 'resolved' && (
          <motion.div key="resolved" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center space-y-3 py-4">
            <p className="text-sm text-text-main">{resolvedSummary}</p>
            <p className="text-xs text-text-muted">We'll check back in when there's something new worth looking at.</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
