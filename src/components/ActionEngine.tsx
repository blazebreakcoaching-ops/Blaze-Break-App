import { useEffect, useState, lazy, Suspense } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Compass, ArrowRight } from 'lucide-react';

// recharts is heavy (pulls in d3); loaded lazily so it stays out of
// ActionEngine's own bundle until the Change Graph actually renders.
const ChangeGraphChart = lazy(() => import('./ChangeGraphChart.tsx').then(m => ({ default: m.ChangeGraphChart })));
import { cn } from '../lib/utils';
import { auth } from '../lib/firebase';
import { loadRediscoveryClues, loadWorkloadRealityCheckHistory } from '../lib/rediscovery-service';
import {
  createActionInsight, updateActionInsight, loadRecentActionInsights,
} from '../lib/rediscovery-insight-service';
import {
  createExperiment, updateExperimentStatus, loadRecentExperiments,
  recordMomentChoice, recordPrediction, recordReality, recordReview, recordAutopsy, resetDriftCounters,
} from '../lib/action-experiment-service';
import { loadLatestCapacityCheckIn } from '../lib/energy-delta-service';
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
  FRICTION_ADAPTATION_LABELS, FRICTION_ADAPTATION_FOR_TYPE, FRICTION_ADAPTATION_HANDOFF_TAB,
  MINIMUM_VIABLE_CHANGE_PROMPT,
  ladderLevelForExperiment, hasActiveExperiment, ExperimentRecord,
  ONE_ACTIVE_EXPERIMENT_LINE, ACTIVE_EXPERIMENT_CONFLICT_ORDER, ACTIVE_EXPERIMENT_CONFLICT_LABELS, ActiveExperimentConflictChoice,
  MOMENT_OF_CHOICE_LINE, MOMENT_CHOICE_ORDER, MOMENT_CHOICE_LABELS, MomentChoice,
  PREDICTION_QUESTION, REALITY_QUESTION,
  REVIEW_QUESTION, REVIEW_CHOICE_ORDER, REVIEW_CHOICE_LABELS, ReviewChoice,
  KEEP_FOLLOW_UP_ORDER, KEEP_FOLLOW_UP_LABELS, KeepFollowUp,
  CHANGE_REASON_QUESTION, CHANGE_REASON_ORDER, CHANGE_REASON_LABELS, ChangeReason,
  DROP_LINE, NOT_SURE_YET_FOLLOW_UP_ORDER, NOT_SURE_YET_FOLLOW_UP_LABELS, NotSureYetFollowUp,
  statusForReviewChoice,
  CHANGE_AUTOPSY_QUESTION, AUTOPSY_REASON_ORDER, AUTOPSY_REASON_LABELS, AutopsyReason,
  AUTOPSY_RESPONSE_FOR_REASON, AUTOPSY_RESPONSE_LABELS,
  buildProofOfChange, PROOF_OF_CHANGE_KIND_LABELS,
  buildThingsIKnowNow, KNOWLEDGE_ENTRY_LINE,
  confirmedExperimentCountForInsight, evidenceLevelForInsightState, EVIDENCE_LEVEL_LABELS,
  buildOperatingManual, buildChangeGraph,
  isInMaintenanceMode, MAINTENANCE_CHECK_IN_QUESTION, MAINTENANCE_CHECK_IN_ORDER, MAINTENANCE_CHECK_IN_LABELS, MaintenanceCheckInAnswer,
  hasDrifted, DRIFT_DETECTED_LINE, DRIFT_RESPONSE_ORDER, DRIFT_RESPONSE_LABELS, DriftResponse,
  hasStructuralProblem, STRUCTURAL_PROBLEM_LINE, STRUCTURAL_PROBLEM_RESPONSE_ORDER, STRUCTURAL_PROBLEM_RESPONSE_LABELS, StructuralProblemResponse,
  shouldDeferNewExperiment, CAPACITY_AWARE_DEFER_LINE, CAPACITY_AWARE_HANDOFF_TAB,
} from '../../action-engine';

interface ActionEngineProps {
  onNavigate?: (tab: string) => void;
}

type Step =
  | 'loading' | 'empty' | 'insight_card' | 'controllability_gate' | 'controllability_guidance'
  | 'depends_on_someone_resolve' | 'shared_plan_saved' | 'outside_control_resolve' | 'nothing_needs_fixing'
  | 'active_experiment_conflict' | 'capacity_defer' | 'structural_problem_check' | 'experiment_builder'
  | 'experiment_active' | 'moment_of_choice' | 'review_did_it_happen' | 'review_reality' | 'review_choice'
  | 'review_keep_followup' | 'review_change_reason' | 'review_not_sure_followup' | 'change_autopsy'
  | 'maintenance_check_in' | 'drift_detected'
  | 'resolved';

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

  const [activeExperiment, setActiveExperiment] = useState<ExperimentRecord | null>(null);
  const [predictionDraft, setPredictionDraft] = useState('');
  const [realityDraft, setRealityDraft] = useState('');
  const [experiments, setExperiments] = useState<ExperimentRecord[]>([]);
  const [insights, setInsights] = useState<ActionInsightRecord[]>([]);
  const [capacityScore, setCapacityScore] = useState<number | null>(null);

  useEffect(() => {
    const load = async () => {
      if (!auth.currentUser) { setStep('empty'); return; }
      const uid = auth.currentUser.uid;
      try {
        const [existing, experiments, latestCapacityCheckIn] = await Promise.all([
          loadRecentActionInsights(uid),
          loadRecentExperiments(uid),
          loadLatestCapacityCheckIn(uid),
        ]);
        setExperiments(experiments);
        setInsights(existing);
        setCapacityScore(latestCapacityCheckIn ? latestCapacityCheckIn.score : null);
        const active = experiments.find((e) => e.status === 'active') ?? null;
        if (active) {
          setActiveExperiment(active);
          setInsight(existing.find((i) => i.id === active.insightId) ?? null);
          setPredictionDraft('');
          setRealityDraft('');
          setStep('experiment_active');
          return;
        }
        const drifted = experiments.find((e) => isInMaintenanceMode(e) && hasDrifted(e)) ?? null;
        if (drifted) {
          setActiveExperiment(drifted);
          setInsight(existing.find((i) => i.id === drifted.insightId) ?? null);
          setStep('drift_detected');
          return;
        }
        // A pattern confirmed as true elsewhere (e.g. My Thresholds) arrives
        // here already past the worthiness question - it goes straight to
        // the Controllability Gate rather than being asked "does this feel
        // worth working on?" a second time.
        const pending = existing.find((i) =>
          i.state === 'nova_noticed' || i.state === 'still_exploring' || (i.state === 'user_confirmed' && !i.controllability)
        ) ?? null;
        if (pending) {
          setInsight(pending);
          setStep(pending.controllability || pending.state === 'user_confirmed' ? 'controllability_gate' : 'insight_card');
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
        const newInsight: ActionInsightRecord = {
          id, section: 'what_drains', text: candidate.text, state: 'nova_noticed', source: candidate.source,
          controllability: null, sharedResponsibilityPlan: null, outsideControlChoice: null, nothingNeedsFixingChoice: null,
          createdAt: now, updatedAt: now,
        };
        setInsight(newInsight);
        setInsights((prev) => [...prev, newInsight]);
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
      setInsights((prev) => prev.map((i) => (i.id === insight.id ? { ...i, state: 'user_confirmed' } : i)));
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
    setResolvedSummary(
      choice === 'journal_about_it'
        ? `${NOTHING_NEEDS_FIXING_LABELS[choice]} The 60-Second Check-In is just below, whenever you're ready.`
        : NOTHING_NEEDS_FIXING_LABELS[choice]
    );
    setStep('resolved');
  };

  const enterExperimentBuilder = async (prefillText: string, skipCapacity = false, skipStructural = false) => {
    if (!auth.currentUser) return;
    if (!skipCapacity && shouldDeferNewExperiment(capacityScore)) {
      setPendingExperimentText(prefillText);
      setStep('capacity_defer');
      return;
    }
    if (!skipStructural && insight && hasStructuralProblem(insight.id, experiments)) {
      setPendingExperimentText(prefillText);
      setStep('structural_problem_check');
      return;
    }
    const liveExperiments = await loadRecentExperiments(auth.currentUser.uid);
    if (hasActiveExperiment(liveExperiments)) {
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

  const continueExperimentDespiteCapacity = () => enterExperimentBuilder(pendingExperimentText, true, false);

  const chooseStructuralProblemResponse = async (choice: StructuralProblemResponse) => {
    if (choice === 'revisit_controllability') { setStep('controllability_gate'); return; }
    if (choice === 'name_it_as_outside_control') { await chooseControllability('mostly_outside_control'); return; }
    await enterExperimentBuilder(pendingExperimentText, true, true);
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
    const data = {
      insightId: insight.id,
      text: experimentText.trim(),
      ladderLevel: ladderLevelForExperiment(experimentDuration),
      duration: experimentDuration,
      momentOfTruth: momentCue.trim() || momentResponse.trim() ? { cue: momentCue.trim(), response: momentResponse.trim() } : null,
      friction,
      minimumViableChange: (mvcOverride ?? mvc).trim() || null,
    };
    const id = await createExperiment(auth.currentUser.uid, data);
    const now = new Date().toISOString();
    setExperiments((prev) => [
      ...prev,
      {
        ...data, id, status: 'active', lastMomentChoice: null, prediction: null, reality: null,
        reviewChoice: null, changeReason: null, autopsyReason: null, keepFollowUp: null,
        usualResponseCount: 0, triedDifferentCount: 0,
        createdAt: now, updatedAt: now,
      },
    ]);
    setResolvedSummary(
      `You're trying: "${experimentText.trim()}" — ${experimentDuration ? EXPERIMENT_DURATION_LABELS[experimentDuration] : 'next time it comes up'}.`
    );
    setStep('resolved');
  };

  const savePrediction = async () => {
    if (!auth.currentUser || !activeExperiment || !predictionDraft.trim()) return;
    await recordPrediction(auth.currentUser.uid, activeExperiment.id, predictionDraft.trim());
    setActiveExperiment({ ...activeExperiment, prediction: predictionDraft.trim() });
  };

  const chooseMomentChoice = async (choice: MomentChoice) => {
    if (!auth.currentUser || !activeExperiment) return;
    await recordMomentChoice(auth.currentUser.uid, activeExperiment.id, choice);
    const updated: ExperimentRecord = {
      ...activeExperiment,
      lastMomentChoice: choice,
      usualResponseCount: activeExperiment.usualResponseCount + (choice === 'usual_response' ? 1 : 0),
      triedDifferentCount: activeExperiment.triedDifferentCount + (choice === 'try_something_different' ? 1 : 0),
    };
    setActiveExperiment(updated);
    setExperiments((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));
    setResolvedSummary(
      choice === 'try_something_different'
        ? "Noted — however it went, that's real information."
        : "Noted. No guilt either way — this is just information for later."
    );
    setStep('resolved');
  };

  const chooseMaintenanceCheckIn = async (answer: MaintenanceCheckInAnswer) => {
    if (!auth.currentUser || !activeExperiment) return;
    if (answer === 'still_holding') {
      setResolvedSummary("Good to know. We'll check back in another time.");
      setStep('resolved');
      return;
    }
    if (answer === 'slipping') { setStep('drift_detected'); return; }
    await updateExperimentStatus(auth.currentUser.uid, activeExperiment.id, 'abandoned');
    setExperiments((prev) => prev.map((e) => (e.id === activeExperiment.id ? { ...e, status: 'abandoned' } : e)));
    setResolvedSummary("Noted. That's allowed to change.");
    setStep('resolved');
  };

  const chooseDriftResponse = async (choice: DriftResponse) => {
    if (!auth.currentUser || !activeExperiment) return;
    if (choice === 'reaffirm_it') {
      await resetDriftCounters(auth.currentUser.uid, activeExperiment.id);
      setExperiments((prev) => prev.map((e) => (e.id === activeExperiment.id ? { ...e, usualResponseCount: 0, triedDifferentCount: 0 } : e)));
      setResolvedSummary("Good — let's keep this one going.");
      setStep('resolved');
      return;
    }
    if (choice === 'redesign_it') { await enterExperimentBuilder(activeExperiment.text, true, true); return; }
    await updateExperimentStatus(auth.currentUser.uid, activeExperiment.id, 'abandoned');
    setExperiments((prev) => prev.map((e) => (e.id === activeExperiment.id ? { ...e, status: 'abandoned' } : e)));
    setResolvedSummary("That's alright — it had its time.");
    setStep('resolved');
  };

  const startReview = () => setStep('review_did_it_happen');

  const answerDidItHappen = (happened: boolean) => {
    if (!happened) { setStep('change_autopsy'); return; }
    if (activeExperiment?.prediction && !activeExperiment.reality) { setStep('review_reality'); return; }
    setStep('review_choice');
  };

  const saveReality = async () => {
    if (!auth.currentUser || !activeExperiment || !realityDraft.trim()) return;
    await recordReality(auth.currentUser.uid, activeExperiment.id, realityDraft.trim());
    setActiveExperiment({ ...activeExperiment, reality: realityDraft.trim() });
    setStep('review_choice');
  };

  const chooseReview = (choice: ReviewChoice) => {
    if (choice === 'keep') { setStep('review_keep_followup'); return; }
    if (choice === 'change') { setStep('review_change_reason'); return; }
    if (choice === 'not_sure_yet') { setStep('review_not_sure_followup'); return; }
    // drop
    finishReview('drop', null, null, statusForReviewChoice('drop')!, DROP_LINE);
  };

  const finishReview = async (
    choice: ReviewChoice, changeReason: ChangeReason | null, keepFollowUp: KeepFollowUp | null,
    status: ExperimentRecord['status'], summary: string
  ) => {
    if (!auth.currentUser || !activeExperiment) return;
    await recordReview(auth.currentUser.uid, activeExperiment.id, { reviewChoice: choice, changeReason, keepFollowUp, status });
    setExperiments((prev) => prev.map((e) => (
      e.id === activeExperiment.id ? { ...e, reviewChoice: choice, changeReason, keepFollowUp, status } : e
    )));
    setResolvedSummary(summary);
    setStep('resolved');
  };

  const chooseKeepFollowUp = (followUp: KeepFollowUp) => {
    const status: ExperimentRecord['status'] = followUp === 'try_longer' ? 'active' : statusForReviewChoice('keep')!;
    const summary =
      followUp === 'try_longer' ? "Good — let's keep going with it."
      : followUp === 'protect_it' ? "Noted. We'll build out ways to protect this soon."
      : "Noted. We'll build out making this a default soon.";
    finishReview('keep', null, followUp, status, summary);
  };

  const chooseChangeReason = async (reason: ChangeReason) => {
    if (!auth.currentUser || !activeExperiment) return;
    await recordReview(auth.currentUser.uid, activeExperiment.id, { reviewChoice: 'change', changeReason: reason, keepFollowUp: null, status: 'completed' });
    setExperiments((prev) => prev.map((e) => (
      e.id === activeExperiment.id ? { ...e, reviewChoice: 'change', changeReason: reason, status: 'completed' } : e
    )));
    await enterExperimentBuilder(activeExperiment.text);
  };

  const chooseNotSureYetFollowUp = (followUp: NotSureYetFollowUp) => {
    const status: ExperimentRecord['status'] = followUp === 'finish_for_now' ? 'completed' : 'active';
    const summary =
      followUp === 'try_once_more' ? "Alright, let's see how it goes."
      : followUp === 'leave_it_open' ? "No rush — it'll stay open."
      : 'Noted. We’ll leave it there for now.';
    finishReview('not_sure_yet', null, null, status, summary);
  };

  const chooseAutopsyReason = async (reason: AutopsyReason) => {
    if (!auth.currentUser || !activeExperiment) return;
    const response = AUTOPSY_RESPONSE_FOR_REASON[reason];
    const status: ExperimentRecord['status'] = response === 'allow_experiment_to_end' ? 'abandoned' : 'active';
    await recordAutopsy(auth.currentUser.uid, activeExperiment.id, { autopsyReason: reason, status });
    setExperiments((prev) => prev.map((e) => (
      e.id === activeExperiment.id ? { ...e, autopsyReason: reason, status } : e
    )));
    setResolvedSummary(AUTOPSY_RESPONSE_LABELS[response]);
    setStep('resolved');
  };

  const proofOfChange = buildProofOfChange(experiments);
  const thingsIKnowNow = buildThingsIKnowNow(experiments);
  const evidenceLevel = insight ? evidenceLevelForInsightState(insight.state, confirmedExperimentCountForInsight(insight.id, experiments)) : null;
  const operatingManual = buildOperatingManual(insights, experiments);
  const changeGraph = buildChangeGraph(experiments);
  const maintenanceItems = experiments.filter((e) => isInMaintenanceMode(e) && !(activeExperiment?.id === e.id && (step === 'drift_detected' || step === 'maintenance_check_in')));

  const startMaintenanceCheckIn = (e: ExperimentRecord) => {
    setActiveExperiment(e);
    setStep('maintenance_check_in');
  };

  if (step === 'loading') return null;

  return (
    <>
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
              {evidenceLevel && <p className="text-xs text-text-muted mt-2">{EVIDENCE_LEVEL_LABELS[evidenceLevel]}</p>}
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
              {evidenceLevel && <p className="text-xs text-text-muted mt-2">{EVIDENCE_LEVEL_LABELS[evidenceLevel]}</p>}
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

        {step === 'capacity_defer' && (
          <motion.div key="capacity_defer" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
            <p className="text-sm font-bold text-text-main">{CAPACITY_AWARE_DEFER_LINE}</p>
            <div className="flex flex-wrap gap-3">
              {onNavigate && (
                <button
                  onClick={() => onNavigate(CAPACITY_AWARE_HANDOFF_TAB)}
                  className="btn-primary py-2.5 px-5 inline-flex items-center gap-2"
                >
                  Protect capacity first <ArrowRight className="w-4 h-4" aria-hidden="true" />
                </button>
              )}
              <button onClick={continueExperimentDespiteCapacity} className="text-xs text-text-muted">
                Start it anyway
              </button>
            </div>
          </motion.div>
        )}

        {step === 'structural_problem_check' && (
          <motion.div key="structural_problem" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
            <p className="text-sm font-bold text-text-main">{STRUCTURAL_PROBLEM_LINE}</p>
            <div className="grid grid-cols-1 sm:grid-cols-1 gap-2">
              {STRUCTURAL_PROBLEM_RESPONSE_ORDER.map((r) => (
                <button
                  key={r}
                  onClick={() => chooseStructuralProblemResponse(r)}
                  className="p-3 rounded-xl bg-surface/50 border border-border/50 hover:border-primary/40 text-sm font-medium text-text-main text-left"
                >
                  {STRUCTURAL_PROBLEM_RESPONSE_LABELS[r]}
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
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs text-text-muted">{FRICTION_ADAPTATION_LABELS[FRICTION_ADAPTATION_FOR_TYPE[friction]]}</p>
                    {FRICTION_ADAPTATION_HANDOFF_TAB[FRICTION_ADAPTATION_FOR_TYPE[friction]] && onNavigate && (
                      <button
                        onClick={() => onNavigate(FRICTION_ADAPTATION_HANDOFF_TAB[FRICTION_ADAPTATION_FOR_TYPE[friction]]!)}
                        className="text-xs font-bold text-primary hover:underline shrink-0"
                      >
                        Rehearse this first
                      </button>
                    )}
                  </div>
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

        {step === 'experiment_active' && activeExperiment && (
          <motion.div key="experiment_active" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
            <div className="p-4 rounded-xl bg-surface/60 border border-border/50">
              <p className="text-xs font-bold text-primary uppercase tracking-wider mb-1">You're trying</p>
              <p className="text-sm text-text-main">{activeExperiment.text}</p>
              {activeExperiment.momentOfTruth?.cue && (
                <p className="text-xs text-text-muted mt-2">
                  When {activeExperiment.momentOfTruth.cue}, you planned to: {activeExperiment.momentOfTruth.response}
                </p>
              )}
            </div>
            {!activeExperiment.prediction && (
              <label className="block space-y-1.5">
                <span className="text-xs font-bold text-text-muted">{PREDICTION_QUESTION} <span className="font-normal">(optional)</span></span>
                <div className="flex gap-2">
                  <input
                    value={predictionDraft}
                    onChange={(e) => setPredictionDraft(e.target.value)}
                    className="flex-1 bg-surface/60 border border-border rounded-xl px-3 py-2 text-sm text-text-main"
                  />
                  <button onClick={savePrediction} disabled={!predictionDraft.trim()} className="text-xs font-bold text-primary disabled:opacity-40">Save</button>
                </div>
              </label>
            )}
            <div className="flex flex-wrap gap-3">
              <button onClick={() => setStep('moment_of_choice')} className="btn-primary py-2.5 px-5">This came up</button>
              <button onClick={startReview} className="text-xs font-bold text-primary hover:underline">Review it</button>
            </div>
          </motion.div>
        )}

        {step === 'moment_of_choice' && (
          <motion.div key="moment_of_choice" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
            <p className="text-sm font-bold text-text-main">{MOMENT_OF_CHOICE_LINE}</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {MOMENT_CHOICE_ORDER.map((c) => (
                <button
                  key={c}
                  onClick={() => chooseMomentChoice(c)}
                  className="p-3 rounded-xl bg-surface/50 border border-border/50 hover:border-primary/40 text-sm font-medium text-text-main text-left"
                >
                  {MOMENT_CHOICE_LABELS[c]}
                </button>
              ))}
            </div>
          </motion.div>
        )}

        {step === 'review_did_it_happen' && (
          <motion.div key="did_it_happen" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
            <p className="text-sm font-bold text-text-main">Did this happen?</p>
            <div className="flex gap-3">
              <button onClick={() => answerDidItHappen(true)} className="btn-primary py-2.5 px-5">Yes</button>
              <button onClick={() => answerDidItHappen(false)} className="py-2.5 px-5 rounded-xl border border-border/50 text-sm font-bold text-text-main">No</button>
            </div>
          </motion.div>
        )}

        {step === 'review_reality' && (
          <motion.div key="reality" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
            <p className="text-xs text-text-muted">You expected: {activeExperiment?.prediction}</p>
            <label className="block space-y-1.5">
              <span className="text-sm font-bold text-text-main">{REALITY_QUESTION}</span>
              <textarea
                value={realityDraft}
                onChange={(e) => setRealityDraft(e.target.value)}
                rows={2}
                className="w-full bg-surface/60 border border-border rounded-xl px-3 py-2 text-sm text-text-main"
              />
            </label>
            <button onClick={saveReality} disabled={!realityDraft.trim()} className="btn-primary py-2.5 px-5 disabled:opacity-40">Continue</button>
          </motion.div>
        )}

        {step === 'review_choice' && (
          <motion.div key="review_choice" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
            <p className="text-sm font-bold text-text-main">{REVIEW_QUESTION}</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {REVIEW_CHOICE_ORDER.map((c) => (
                <button
                  key={c}
                  onClick={() => chooseReview(c)}
                  className="p-3 rounded-xl bg-surface/50 border border-border/50 hover:border-primary/40 text-sm font-medium text-text-main text-left"
                >
                  {REVIEW_CHOICE_LABELS[c]}
                </button>
              ))}
            </div>
          </motion.div>
        )}

        {step === 'review_keep_followup' && (
          <motion.div key="keep_followup" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {KEEP_FOLLOW_UP_ORDER.map((f) => (
                <button
                  key={f}
                  onClick={() => chooseKeepFollowUp(f)}
                  className="p-3 rounded-xl bg-surface/50 border border-border/50 hover:border-primary/40 text-sm font-medium text-text-main text-left"
                >
                  {KEEP_FOLLOW_UP_LABELS[f]}
                </button>
              ))}
            </div>
          </motion.div>
        )}

        {step === 'review_change_reason' && (
          <motion.div key="change_reason" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
            <p className="text-sm font-bold text-text-main">{CHANGE_REASON_QUESTION}</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {CHANGE_REASON_ORDER.map((r) => (
                <button
                  key={r}
                  onClick={() => chooseChangeReason(r)}
                  className="p-3 rounded-xl bg-surface/50 border border-border/50 hover:border-primary/40 text-sm font-medium text-text-main text-left"
                >
                  {CHANGE_REASON_LABELS[r]}
                </button>
              ))}
            </div>
          </motion.div>
        )}

        {step === 'review_not_sure_followup' && (
          <motion.div key="not_sure_followup" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {NOT_SURE_YET_FOLLOW_UP_ORDER.map((f) => (
                <button
                  key={f}
                  onClick={() => chooseNotSureYetFollowUp(f)}
                  className="p-3 rounded-xl bg-surface/50 border border-border/50 hover:border-primary/40 text-sm font-medium text-text-main text-left"
                >
                  {NOT_SURE_YET_FOLLOW_UP_LABELS[f]}
                </button>
              ))}
            </div>
          </motion.div>
        )}

        {step === 'change_autopsy' && (
          <motion.div key="autopsy" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
            <p className="text-sm font-bold text-text-main">{CHANGE_AUTOPSY_QUESTION}</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {AUTOPSY_REASON_ORDER.map((r) => (
                <button
                  key={r}
                  onClick={() => chooseAutopsyReason(r)}
                  className="p-3 rounded-xl bg-surface/50 border border-border/50 hover:border-primary/40 text-sm font-medium text-text-main text-left"
                >
                  {AUTOPSY_REASON_LABELS[r]}
                </button>
              ))}
            </div>
          </motion.div>
        )}

        {step === 'maintenance_check_in' && activeExperiment && (
          <motion.div key="maintenance_check_in" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
            <div className="p-4 rounded-xl bg-surface/60 border border-border/50">
              <p className="text-xs font-bold text-primary uppercase tracking-wider mb-1">Maintenance check-in</p>
              <p className="text-sm text-text-main">{activeExperiment.text}</p>
            </div>
            <p className="text-sm font-bold text-text-main">{MAINTENANCE_CHECK_IN_QUESTION}</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {MAINTENANCE_CHECK_IN_ORDER.map((a) => (
                <button
                  key={a}
                  onClick={() => chooseMaintenanceCheckIn(a)}
                  className="p-3 rounded-xl bg-surface/50 border border-border/50 hover:border-primary/40 text-sm font-medium text-text-main text-left"
                >
                  {MAINTENANCE_CHECK_IN_LABELS[a]}
                </button>
              ))}
            </div>
          </motion.div>
        )}

        {step === 'drift_detected' && activeExperiment && (
          <motion.div key="drift_detected" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
            <div className="p-4 rounded-xl bg-surface/60 border border-border/50">
              <p className="text-sm text-text-main">{activeExperiment.text}</p>
            </div>
            <p className="text-sm font-bold text-text-main">{DRIFT_DETECTED_LINE}</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {DRIFT_RESPONSE_ORDER.map((r) => (
                <button
                  key={r}
                  onClick={() => chooseDriftResponse(r)}
                  className="p-3 rounded-xl bg-surface/50 border border-border/50 hover:border-primary/40 text-sm font-medium text-text-main text-left"
                >
                  {DRIFT_RESPONSE_LABELS[r]}
                </button>
              ))}
            </div>
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

    {proofOfChange.length > 0 && (
      <div className="card p-6 sm:p-8 space-y-4">
        <div>
          <h3 className="text-sm font-display font-bold text-text-main">Proof of Change</h3>
          <p className="text-xs text-text-muted">Real evidence of what's changed — not points.</p>
        </div>
        <div className="space-y-2">
          {proofOfChange.map((entry) => (
            <div key={entry.experimentId} className="p-3 rounded-xl bg-surface/50 border border-border/50">
              <p className="text-sm text-text-main">{entry.text}</p>
              <p className="text-xs font-bold text-primary mt-1">{PROOF_OF_CHANGE_KIND_LABELS[entry.kind]}</p>
            </div>
          ))}
        </div>
      </div>
    )}

    {thingsIKnowNow.length > 0 && (
      <div className="card p-6 sm:p-8 space-y-4">
        <h3 className="text-sm font-display font-bold text-text-main">Things I Know Now</h3>
        <div className="space-y-2">
          {thingsIKnowNow.map((entry) => (
            <p key={entry.experimentId} className="text-sm text-text-main p-3 rounded-xl bg-surface/50 border border-border/50">
              {KNOWLEDGE_ENTRY_LINE[entry.kind](entry.text, entry.detail)}
            </p>
          ))}
        </div>
      </div>
    )}

    {changeGraph.length > 1 && (
      <div className="card p-6 sm:p-8 space-y-4">
        <div>
          <h3 className="text-sm font-display font-bold text-text-main">Change Graph</h3>
          <p className="text-xs text-text-muted">Where each real experiment actually landed, over time.</p>
        </div>
        <div className="h-40">
          <Suspense fallback={<div className="h-full w-full flex items-center justify-center text-xs text-text-muted">Loading chart…</div>}>
            <ChangeGraphChart points={changeGraph} />
          </Suspense>
        </div>
      </div>
    )}

    {operatingManual.length > 0 && (
      <div className="card p-6 sm:p-8 space-y-5">
        <div>
          <h3 className="text-sm font-display font-bold text-text-main">My Operating Manual</h3>
          <p className="text-xs text-text-muted">A living reference, compiled only from what's actually real for you.</p>
        </div>
        {operatingManual.map((section) => (
          <div key={section.heading} className="space-y-2">
            <p className="text-xs font-bold text-primary uppercase tracking-wider">{section.heading}</p>
            {section.lines.map((line, i) => (
              <p key={i} className="text-sm text-text-main p-3 rounded-xl bg-surface/50 border border-border/50">{line}</p>
            ))}
          </div>
        ))}
      </div>
    )}

    {maintenanceItems.length > 0 && (
      <div className="card p-6 sm:p-8 space-y-4">
        <div>
          <h3 className="text-sm font-display font-bold text-text-main">Maintenance</h3>
          <p className="text-xs text-text-muted">Things that became a default - a lighter check, not a new project.</p>
        </div>
        <div className="space-y-2">
          {maintenanceItems.map((e) => (
            <div key={e.id} className="p-3 rounded-xl bg-surface/50 border border-border/50 flex items-center justify-between gap-3">
              <p className="text-sm text-text-main">{e.text}</p>
              <button onClick={() => startMaintenanceCheckIn(e)} className="text-xs font-bold text-primary hover:underline shrink-0">
                Check in
              </button>
            </div>
          ))}
        </div>
      </div>
    )}
    </>
  );
};
