import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ShieldCheck, ArrowRight, ArrowLeft, Copy, Check } from 'lucide-react';
import { cn } from '../lib/utils';
import { auth } from '../lib/firebase';
import { loadLatestCapacityCheckIn, loadStressors } from '../lib/energy-delta-service';
import { computeNetLoad } from '../../energy-delta-engine';
import {
  QUICK_PAUSE_FIT_ORDER, QUICK_PAUSE_FIT_LABELS, QuickPauseFit, QUICK_PAUSE_PROMPT, QUICK_PAUSE_WHAT_QUESTION,
  QUICK_PAUSE_FIT_QUESTION, needsCapacityGate,
  CAPACITY_NOT_CHECKED_LABEL, describeBufferAfterAccepting, buildCapacityGateScenarios, BufferTightness,
  SQUEEZE_AREA_ORDER, SQUEEZE_AREA_LABELS, SqueezeArea, EXCLUSIVE_SQUEEZE_AREAS,
  COST_OF_YES_QUESTION, COST_OF_YES_NOT_FREE_LINE, shouldShowCostOfYesFollowup,
  FIREWALL_CHOICE_ORDER, FIREWALL_CHOICE_LABELS, FirewallChoice, CHOICE_SCREEN_QUESTION,
  ACCEPT_RATIONALE_ORDER, ACCEPT_RATIONALE_LABELS, AcceptRationale, ACCEPT_MAKE_ROOM_QUESTION, shouldAskWhatMovingToMakeRoom,
  CONDITIONAL_YES_LEVER_ORDER, CONDITIONAL_YES_LEVER_LABELS, ConditionalYesLever, CONDITIONAL_YES_QUESTION,
  buildConditionalYesMessage,
  DELEGATE_QUESTION, DEFER_QUESTION, CLARIFICATION_QUESTIONS,
  CAPACITY_FIREWALL_INTRO_LINE, CAPACITY_FIREWALL_INTRO_CTA,
} from '../../capacity-firewall-engine';
import { recordFirewallDecision, updateFirewallDecision } from '../lib/capacity-firewall-service';

interface CapacityFirewallProps {
  onNavigate?: (tab: string) => void;
}

type Step =
  | 'intro' | 'quick_pause' | 'capacity_gate' | 'cost_of_yes' | 'choice'
  | 'accept' | 'conditional_yes' | 'delegate' | 'defer' | 'decline' | 'need_more_info' | 'done';

export const CapacityFirewall = ({ onNavigate }: CapacityFirewallProps) => {
  const [step, setStep] = useState<Step>('intro');

  const [capacityScore, setCapacityScore] = useState<number | null>(null);
  const [plannedLoad, setPlannedLoad] = useState<number | null>(null);
  const [capacityLoaded, setCapacityLoaded] = useState(false);

  const [demandDescription, setDemandDescription] = useState('');
  const [estimatedMinutesText, setEstimatedMinutesText] = useState('');
  const [isToday, setIsToday] = useState(true);
  const [fit, setFit] = useState<QuickPauseFit | null>(null);

  const [squeezeAreas, setSqueezeAreas] = useState<SqueezeArea[]>([]);
  const [choice, setChoice] = useState<FirewallChoice | null>(null);
  const [decisionId, setDecisionId] = useState<string | null>(null);

  const [acceptRationale, setAcceptRationale] = useState<AcceptRationale | null>(null);
  const [moveWhatText, setMoveWhatText] = useState('');

  const [conditionalYesLever, setConditionalYesLever] = useState<ConditionalYesLever | null>(null);
  const [conditionalYesDetail, setConditionalYesDetail] = useState('');

  const [delegateAnswer, setDelegateAnswer] = useState('');
  const [deferAnswer, setDeferAnswer] = useState('');
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const loadCapacity = async () => {
    if (!auth.currentUser) { setCapacityLoaded(true); return; }
    try {
      const [checkIn, stressors] = await Promise.all([
        loadLatestCapacityCheckIn(auth.currentUser.uid),
        loadStressors(auth.currentUser.uid),
      ]);
      setCapacityScore(checkIn ? checkIn.score : null);
      setPlannedLoad(checkIn ? computeNetLoad(stressors) : null);
    } catch {
      setCapacityScore(null);
      setPlannedLoad(null);
    }
    setCapacityLoaded(true);
  };

  useEffect(() => {
    const load = async () => { await loadCapacity(); };
    load();
  }, []);

  const estimatedMinutes = estimatedMinutesText.trim() ? Number(estimatedMinutesText) : null;
  const tightness: BufferTightness = capacityScore !== null && plannedLoad !== null
    ? describeBufferAfterAccepting(capacityScore, plannedLoad) : 'unknown';
  const scenarios = buildCapacityGateScenarios({ capacityScore, plannedLoad });

  const reset = () => {
    setStep('intro');
    setDemandDescription(''); setEstimatedMinutesText(''); setIsToday(true); setFit(null);
    setSqueezeAreas([]); setChoice(null); setDecisionId(null);
    setAcceptRationale(null); setMoveWhatText('');
    setConditionalYesLever(null); setConditionalYesDetail('');
    setDelegateAnswer(''); setDeferAnswer('');
  };

  const beginDemand = async () => {
    if (auth.currentUser && demandDescription.trim()) {
      const id = await recordFirewallDecision(auth.currentUser.uid, {
        demandDescription: demandDescription.trim(), estimatedMinutes, isToday, capacityScore, plannedLoad,
      });
      setDecisionId(id);
    }
  };

  const handleFit = (f: QuickPauseFit) => {
    setFit(f);
    if (needsCapacityGate(f)) setStep('capacity_gate');
    else if (f === 'yes') setStep('accept');
    else setStep('decline');
  };

  const toggleSqueezeArea = (area: SqueezeArea) => {
    setSqueezeAreas((prev) => {
      if (prev.includes(area)) return prev.filter((a) => a !== area);
      if (EXCLUSIVE_SQUEEZE_AREAS.includes(area)) return [area];
      return [...prev.filter((a) => !EXCLUSIVE_SQUEEZE_AREAS.includes(a)), area];
    });
  };

  const persistChoice = async (update: Parameters<typeof updateFirewallDecision>[2]) => {
    if (auth.currentUser && decisionId) {
      await updateFirewallDecision(auth.currentUser.uid, decisionId, update);
    }
  };

  const handleChoice = (c: FirewallChoice) => {
    setChoice(c);
    persistChoice({ choice: c, squeezeAreas });
    switch (c) {
      case 'accept': setStep('accept'); return;
      case 'conditional_yes': setStep('conditional_yes'); return;
      case 'negotiate': onNavigate?.('communicate'); setStep('done'); return;
      case 'delegate': setStep('delegate'); return;
      case 'defer': setStep('defer'); return;
      case 'decline': setStep('decline'); return;
      case 'need_more_info': setStep('need_more_info'); return;
    }
  };

  const confirmAccept = async () => {
    if (!acceptRationale) return;
    setChoice('accept');
    await persistChoice({ choice: 'accept', acceptRationale });
    setStep('done');
  };

  const confirmConditionalYes = async () => {
    if (!conditionalYesLever) return;
    const message = buildConditionalYesMessage(conditionalYesLever, conditionalYesDetail);
    await persistChoice({ choice: 'conditional_yes', conditionalYesLever, conditionalYesMessage: message });
    setStep('done');
  };

  const confirmDelegate = async () => {
    await persistChoice({ choice: 'delegate', delegateAnswer: delegateAnswer.trim() || null });
    setStep('done');
  };

  const confirmDefer = async () => {
    await persistChoice({ choice: 'defer', deferAnswer: deferAnswer.trim() || null });
    setStep('done');
  };

  const confirmDecline = async () => {
    setChoice('decline');
    await persistChoice({ choice: 'decline' });
    setStep('done');
  };

  const confirmNeedMoreInfo = async () => {
    await persistChoice({ choice: 'need_more_info' });
    setStep('done');
  };

  const copyQuestion = (q: string, i: number) => {
    navigator.clipboard?.writeText(q).catch(() => {});
    setCopiedIndex(i);
    window.setTimeout(() => setCopiedIndex(null), 1500);
  };

  const conditionalYesPreview = conditionalYesLever ? buildConditionalYesMessage(conditionalYesLever, conditionalYesDetail) : '';

  return (
    <div className="card p-6 sm:p-8 space-y-6">
      <AnimatePresence mode="wait">
        {step === 'intro' && (
          <motion.div key="intro" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4 text-center">
            <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto">
              <ShieldCheck className="w-6 h-6 text-primary" aria-hidden="true" />
            </div>
            <h3 className="text-xl font-display font-bold text-text-main">{CAPACITY_FIREWALL_INTRO_LINE}</h3>
            <button onClick={() => setStep('quick_pause')} className="btn-primary py-3 px-6 inline-flex items-center gap-2">
              {CAPACITY_FIREWALL_INTRO_CTA} <ArrowRight className="w-4 h-4" aria-hidden="true" />
            </button>
          </motion.div>
        )}

        {step === 'quick_pause' && (
          <motion.div key="quick_pause" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-5">
            <p className="text-sm font-bold text-text-main">{QUICK_PAUSE_PROMPT}</p>
            {!fit && (
              <div className="space-y-4">
                <label className="block space-y-1.5">
                  <span className="text-xs font-bold text-text-muted">{QUICK_PAUSE_WHAT_QUESTION}</span>
                  <input
                    value={demandDescription}
                    onChange={(e) => setDemandDescription(e.target.value)}
                    placeholder="e.g. 60-minute meeting today"
                    className="w-full bg-surface/60 border border-border rounded-xl px-3 py-2.5 text-sm text-text-main focus:outline-none focus:border-primary"
                  />
                </label>
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-2 text-xs font-bold text-text-muted">
                    <input type="checkbox" checked={isToday} onChange={(e) => setIsToday(e.target.checked)} />
                    This is for today
                  </label>
                  <input
                    value={estimatedMinutesText}
                    onChange={(e) => setEstimatedMinutesText(e.target.value.replace(/[^0-9]/g, ''))}
                    placeholder="minutes (optional)"
                    inputMode="numeric"
                    className="w-40 bg-surface/60 border border-border rounded-xl px-3 py-2 text-xs text-text-main focus:outline-none focus:border-primary"
                  />
                </div>

                {capacityLoaded && (
                  <div className="grid grid-cols-3 gap-3 text-center">
                    <div><p className="text-[10px] uppercase font-bold text-text-muted">Available Capacity</p><p className="text-lg font-display font-bold text-text-main">{capacityScore ?? '—'}</p></div>
                    <div><p className="text-[10px] uppercase font-bold text-text-muted">Planned Load</p><p className="text-lg font-display font-bold text-text-main">{plannedLoad ?? '—'}</p></div>
                    <div><p className="text-[10px] uppercase font-bold text-text-muted">Remaining Buffer</p><p className="text-lg font-display font-bold text-text-main">{capacityScore !== null && plannedLoad !== null ? capacityScore - plannedLoad : '—'}</p></div>
                  </div>
                )}
                {capacityLoaded && capacityScore === null && (
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-text-muted">{CAPACITY_NOT_CHECKED_LABEL}</span>
                    <button onClick={() => onNavigate?.('recover')} className="font-bold text-primary hover:underline">Quick Capacity Check</button>
                  </div>
                )}

                <button
                  onClick={async () => { await beginDemand(); }}
                  disabled={!demandDescription.trim()}
                  className="btn-primary py-2.5 px-5 text-sm disabled:opacity-40"
                >
                  Continue
                </button>
              </div>
            )}
            {demandDescription && !fit && (
              <div className="space-y-3 pt-2 border-t border-border">
                <p className="text-sm font-bold text-text-main">{QUICK_PAUSE_FIT_QUESTION}</p>
                <div className="flex flex-wrap gap-2">
                  {QUICK_PAUSE_FIT_ORDER.map((f) => (
                    <button key={f} onClick={() => handleFit(f)} className="px-3.5 py-2 rounded-lg border border-border text-sm font-bold text-text-main hover:border-primary/40">
                      {QUICK_PAUSE_FIT_LABELS[f]}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </motion.div>
        )}

        {step === 'capacity_gate' && (
          <motion.div key="capacity_gate" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-5">
            <div className="grid grid-cols-3 gap-3 text-center">
              <div><p className="text-[10px] uppercase font-bold text-text-muted">Current Capacity</p><p className="text-lg font-display font-bold text-text-main">{capacityScore ?? '—'}</p></div>
              <div><p className="text-[10px] uppercase font-bold text-text-muted">Current Planned Load</p><p className="text-lg font-display font-bold text-text-main">{plannedLoad ?? '—'}</p></div>
              <div><p className="text-[10px] uppercase font-bold text-text-muted">Available Buffer</p><p className="text-lg font-display font-bold text-text-main">{capacityScore !== null && plannedLoad !== null ? capacityScore - plannedLoad : '—'}</p></div>
            </div>
            <div className="text-center text-sm text-text-muted">Incoming Request: {demandDescription}{estimatedMinutes ? ` (${estimatedMinutes} min)` : ''}</div>
            <div className="space-y-3">
              <div className="p-3 rounded-xl border border-border"><p className="text-xs font-bold text-text-main">If I accept</p><p className="text-xs text-text-muted">{scenarios.accept}</p></div>
              <div className="p-3 rounded-xl border border-border"><p className="text-xs font-bold text-text-main">If I move it</p><p className="text-xs text-text-muted">{scenarios.move}</p></div>
              <div className="p-3 rounded-xl border border-border"><p className="text-xs font-bold text-text-main">If I decline</p><p className="text-xs text-text-muted">{scenarios.decline}</p></div>
            </div>
            <button onClick={() => setStep('cost_of_yes')} className="btn-primary py-2.5 px-5 text-sm">Continue</button>
          </motion.div>
        )}

        {step === 'cost_of_yes' && (
          <motion.div key="cost_of_yes" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
            <p className="text-sm font-bold text-text-main">{COST_OF_YES_QUESTION}</p>
            <div className="flex flex-wrap gap-2">
              {SQUEEZE_AREA_ORDER.map((area) => (
                <button
                  key={area}
                  onClick={() => toggleSqueezeArea(area)}
                  aria-pressed={squeezeAreas.includes(area)}
                  className={cn('px-3.5 py-2 rounded-lg border text-sm font-bold', squeezeAreas.includes(area) ? 'border-primary bg-primary/10 text-text-main' : 'border-border text-text-muted hover:border-primary/40')}
                >
                  {SQUEEZE_AREA_LABELS[area]}
                </button>
              ))}
            </div>
            {shouldShowCostOfYesFollowup(squeezeAreas) && <p className="text-sm text-text-muted">{COST_OF_YES_NOT_FREE_LINE}</p>}
            <button onClick={() => setStep('choice')} className="btn-primary py-2.5 px-5 text-sm">Continue</button>
          </motion.div>
        )}

        {step === 'choice' && (
          <motion.div key="choice" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
            <p className="text-sm font-bold text-text-main">{CHOICE_SCREEN_QUESTION}</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {FIREWALL_CHOICE_ORDER.map((c) => (
                <button key={c} onClick={() => handleChoice(c)} className="text-left text-sm rounded-xl border border-border px-4 py-3 text-text-main hover:border-primary/40">
                  {FIREWALL_CHOICE_LABELS[c]}
                </button>
              ))}
            </div>
          </motion.div>
        )}

        {step === 'accept' && (
          <motion.div key="accept" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
            <p className="text-sm font-bold text-text-main">Good. You're deciding this, not just absorbing it.</p>
            <div className="flex flex-wrap gap-2">
              {ACCEPT_RATIONALE_ORDER.map((r) => (
                <button key={r} onClick={() => setAcceptRationale(r)} aria-pressed={acceptRationale === r} className={cn('px-3.5 py-2 rounded-lg border text-sm font-bold', acceptRationale === r ? 'border-primary bg-primary/10 text-text-main' : 'border-border text-text-muted hover:border-primary/40')}>
                  {ACCEPT_RATIONALE_LABELS[r]}
                </button>
              ))}
            </div>
            {shouldAskWhatMovingToMakeRoom(tightness) && acceptRationale === 'moving_something_else' && (
              <label className="block space-y-1.5">
                <span className="text-xs font-bold text-text-muted">{ACCEPT_MAKE_ROOM_QUESTION}</span>
                <input value={moveWhatText} onChange={(e) => setMoveWhatText(e.target.value)} className="w-full bg-surface/60 border border-border rounded-xl px-3 py-2.5 text-sm text-text-main focus:outline-none focus:border-primary" />
              </label>
            )}
            <button onClick={confirmAccept} disabled={!acceptRationale} className="btn-primary py-2.5 px-5 text-sm disabled:opacity-40">Confirm</button>
          </motion.div>
        )}

        {step === 'conditional_yes' && (
          <motion.div key="conditional_yes" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
            <p className="text-sm font-bold text-text-main">{CONDITIONAL_YES_QUESTION}</p>
            <div className="flex flex-wrap gap-2">
              {CONDITIONAL_YES_LEVER_ORDER.map((l) => (
                <button key={l} onClick={() => setConditionalYesLever(l)} aria-pressed={conditionalYesLever === l} className={cn('px-3.5 py-2 rounded-lg border text-sm font-bold', conditionalYesLever === l ? 'border-primary bg-primary/10 text-text-main' : 'border-border text-text-muted hover:border-primary/40')}>
                  {CONDITIONAL_YES_LEVER_LABELS[l]}
                </button>
              ))}
            </div>
            {conditionalYesLever && (
              <>
                <input
                  value={conditionalYesDetail}
                  onChange={(e) => setConditionalYesDetail(e.target.value)}
                  placeholder="Add a detail (optional)"
                  className="w-full bg-surface/60 border border-border rounded-xl px-3 py-2.5 text-sm text-text-main focus:outline-none focus:border-primary"
                />
                <div className="p-3 rounded-xl border border-border bg-surface/60">
                  <p className="text-[10px] uppercase font-bold text-text-muted mb-1">Draft message</p>
                  <p className="text-sm text-text-main">{conditionalYesPreview}</p>
                </div>
                <button onClick={confirmConditionalYes} className="btn-primary py-2.5 px-5 text-sm">Use this</button>
              </>
            )}
          </motion.div>
        )}

        {step === 'delegate' && (
          <motion.div key="delegate" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
            <label className="block space-y-1.5">
              <span className="text-sm font-bold text-text-main">{DELEGATE_QUESTION}</span>
              <input value={delegateAnswer} onChange={(e) => setDelegateAnswer(e.target.value)} className="w-full bg-surface/60 border border-border rounded-xl px-3 py-2.5 text-sm text-text-main focus:outline-none focus:border-primary" />
            </label>
            <button onClick={confirmDelegate} className="btn-primary py-2.5 px-5 text-sm">Continue</button>
          </motion.div>
        )}

        {step === 'defer' && (
          <motion.div key="defer" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
            <label className="block space-y-1.5">
              <span className="text-sm font-bold text-text-main">{DEFER_QUESTION}</span>
              <input value={deferAnswer} onChange={(e) => setDeferAnswer(e.target.value)} className="w-full bg-surface/60 border border-border rounded-xl px-3 py-2.5 text-sm text-text-main focus:outline-none focus:border-primary" />
            </label>
            <p className="text-xs text-text-muted">Blaze Break doesn't have your calendar connected here, so this is your own read on what's realistic.</p>
            <button onClick={confirmDefer} className="btn-primary py-2.5 px-5 text-sm">Continue</button>
          </motion.div>
        )}

        {step === 'decline' && (
          <motion.div key="decline" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
            <p className="text-sm text-text-main">{scenarios.decline}</p>
            <p className="text-xs text-text-muted">Want help putting this into words? Boundary Architect can draft the message.</p>
            <div className="flex flex-wrap gap-3">
              <button onClick={() => onNavigate?.('communicate')} className="btn-primary py-2.5 px-5 text-sm">Open Boundary Architect</button>
              <button onClick={confirmDecline} className="text-sm font-bold text-text-muted hover:text-text-main">Just record this decision</button>
            </div>
          </motion.div>
        )}

        {step === 'need_more_info' && (
          <motion.div key="need_more_info" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
            <p className="text-sm font-bold text-text-main">Before you commit, it's fair to ask:</p>
            <div className="space-y-2">
              {CLARIFICATION_QUESTIONS.map((q, i) => (
                <div key={q} className="flex items-center justify-between gap-3 p-3 rounded-xl border border-border">
                  <span className="text-sm text-text-main">{q}</span>
                  <button onClick={() => copyQuestion(q, i)} className="shrink-0 text-text-muted hover:text-text-main" aria-label={`Copy: ${q}`}>
                    {copiedIndex === i ? <Check className="w-4 h-4" aria-hidden="true" /> : <Copy className="w-4 h-4" aria-hidden="true" />}
                  </button>
                </div>
              ))}
            </div>
            <button onClick={confirmNeedMoreInfo} className="btn-primary py-2.5 px-5 text-sm">Done</button>
          </motion.div>
        )}

        {step === 'done' && (
          <motion.div key="done" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4 text-center">
            <p className="text-sm font-bold text-text-main">Got it. That's recorded.</p>
            {choice && <p className="text-xs text-text-muted">{FIREWALL_CHOICE_LABELS[choice]}</p>}
            <button onClick={reset} className="btn-secondary py-2.5 px-5 text-sm">Check Another Request</button>
          </motion.div>
        )}
      </AnimatePresence>

      {step !== 'intro' && step !== 'done' && (
        <button onClick={reset} className="inline-flex items-center gap-1.5 text-xs font-bold text-text-muted hover:text-text-main">
          <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" /> Start over
        </button>
      )}
    </div>
  );
};

export default CapacityFirewall;
