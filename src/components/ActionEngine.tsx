import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Compass, ArrowRight } from 'lucide-react';
import { auth } from '../lib/firebase';
import { loadRediscoveryClues, loadWorkloadRealityCheckHistory } from '../lib/rediscovery-service';
import {
  createActionInsight, updateActionInsight, loadRecentActionInsights,
} from '../lib/rediscovery-insight-service';
import {
  ActionInsightRecord,
  pickCandidateInsight, CandidateInsight,
  ACTION_WORTHINESS_ORDER, ACTION_WORTHINESS_LABELS, ACTION_WORTHINESS_QUESTION, ActionWorthinessAnswer,
  shouldEnterControllabilityGate, leadsToNothingNeedsFixing,
  CONTROLLABILITY_ORDER, CONTROLLABILITY_LABELS, CONTROLLABILITY_GUIDANCE, CONTROLLABILITY_QUESTION, Controllability,
  SHARED_RESPONSIBILITY_PROMPTS, SharedResponsibilityPlan,
  OUTSIDE_CONTROL_RESPONSE_ORDER, OUTSIDE_CONTROL_RESPONSE_LABELS, OUTSIDE_CONTROL_LINE, OUTSIDE_CONTROL_HANDOFF_TAB, OutsideControlResponse,
  NOTHING_NEEDS_FIXING_LINE, NOTHING_NEEDS_FIXING_ORDER, NOTHING_NEEDS_FIXING_LABELS, NothingNeedsFixingChoice,
} from '../../action-engine';

interface ActionEngineProps {
  onNavigate?: (tab: string) => void;
}

type Step =
  | 'loading' | 'empty' | 'insight_card' | 'controllability_gate'
  | 'depends_on_someone_resolve' | 'outside_control_resolve' | 'nothing_needs_fixing' | 'resolved';

export const ActionEngine = ({ onNavigate }: ActionEngineProps) => {
  const [step, setStep] = useState<Step>('loading');
  const [insight, setInsight] = useState<ActionInsightRecord | null>(null);
  const [resolvedSummary, setResolvedSummary] = useState<string>('');
  const [sharedPlan, setSharedPlan] = useState<SharedResponsibilityPlan>({ myPart: '', theirPart: '', ifTheySayNo: '' });

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
    setResolvedSummary(CONTROLLABILITY_GUIDANCE[c]);
    setStep('resolved');
  };

  const saveSharedPlan = async () => {
    if (!auth.currentUser || !insight) return;
    await updateActionInsight(auth.currentUser.uid, insight.id, { sharedResponsibilityPlan: sharedPlan });
    setResolvedSummary(`Your part: ${sharedPlan.myPart || '—'}. Their part: ${sharedPlan.theirPart || '—'}. If they say no: ${sharedPlan.ifTheySayNo || '—'}.`);
    setStep('resolved');
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
