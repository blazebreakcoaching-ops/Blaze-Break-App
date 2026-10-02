import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { DoorOpen, ArrowRight, CheckCircle2, ChevronDown, X } from 'lucide-react';
import { cn } from '../lib/utils';
import { BurnoutFingerprint } from '../types';
import { auth } from '../lib/firebase';
import { updateNovaMemoryBySourceAndType } from '../lib/nova-brain';
import { recordRediscoveryClue } from '../lib/rediscovery-service';
import { loadLatestCapacityCheckIn } from '../lib/energy-delta-service';
import { ConfirmationAnswer, CONFIRMATION_OPTIONS } from '../../rediscovery-engine';
import {
  LEAVING_PRESETS, ARRIVING_STATE_PRESETS, SUGGESTED_PAIRINGS, RETURN_TO_ME_PAIRINGS,
  UnfinishedBusinessAnswer, UNFINISHED_BUSINESS_ORDER, UNFINISHED_BUSINESS_LABELS,
  UnfinishedBusinessDisposition, DISPOSITION_ORDER, DISPOSITION_LABELS,
  CAPACITY_VERY_LOW_CUTOFF, getArrivalQualityOptions, reflectArrivalChoice,
  RITUAL_ANCHORS, DoorwayDepth, DOORWAY_DEPTH_ORDER, DOORWAY_DEPTH_LABELS,
  DOORWAY_DEPTH_DURATION_LABEL, recommendDoorwayDepth, DEEPER_DECOMPRESSION_QUESTIONS,
  ArrivalCheckResponse, ARRIVAL_CHECK_ORDER, ARRIVAL_CHECK_LABELS, ARRIVAL_CHECK_BRANCHES,
  shouldOfferArrivalCheck, FollowedThroughAnswer, FOLLOWED_THROUGH_ORDER, FOLLOWED_THROUGH_LABELS,
  FollowUpTool, FOLLOW_UP_TOOL_LABELS, suggestFollowUpTool, ROLE_WEIGHT_OPTIONS,
  SwitchedOnReason, SWITCHED_ON_REASON_ORDER, SWITCHED_ON_REASON_LABELS,
  detectLowCapacityArrivalPattern, detectFrequentSkipPattern, pairKeyFor,
} from '../../decompression-doorway-engine';
import {
  ThresholdProfile, loadAllThresholdProfiles, loadThresholdProfile, upsertThresholdProfile,
  recordCrossingForThreshold, recordSkipForThreshold, parkUnfinishedBusiness, loadParkedItems,
  resolveParkedItem, ParkedItem, recordDoorwaySession, updateDoorwaySessionFollowUp,
  loadPendingArrivalCheckSession, DoorwaySessionRecord,
} from '../lib/decompression-doorway-service';

interface DecompressionDoorwayProps {
  fingerprint: BurnoutFingerprint | null;
  onAwardPoints?: (amount: number, reason: string) => void;
}

// CORE CLOSED LOOP: notice the threshold -> put down what doesn't cross ->
// a capacity-aware arrival choice -> one small anchor -> cross -> then it
// stops. Nothing here is mandatory except picking a threshold and
// crossing it - every other step can be skipped immediately.
type FlowStep = 'threshold' | 'unfinished' | 'arrival' | 'ritual' | 'deeper_reflect' | 'cross' | 'through';

const stepsForDepth = (depth: DoorwayDepth): FlowStep[] => {
  if (depth === 'quick') return ['threshold', 'arrival', 'cross', 'through'];
  if (depth === 'deeper') return ['threshold', 'unfinished', 'arrival', 'ritual', 'deeper_reflect', 'cross', 'through'];
  return ['threshold', 'unfinished', 'arrival', 'ritual', 'cross', 'through'];
};

const routeFollowUpTool = async (uid: string | undefined, tool: FollowUpTool) => {
  switch (tool) {
    case 'rumination_furnace':
      window.dispatchEvent(new CustomEvent('reset_studio_select_state', { detail: 'looping' }));
      window.dispatchEvent(new CustomEvent('navigate_tab', { detail: 'reset' }));
      return;
    case 'one_less_thing':
      window.dispatchEvent(new CustomEvent('navigate_tab', { detail: 'recover' }));
      return;
    case 'tomorrow_parking_list':
      if (uid) await parkUnfinishedBusiness(uid, 'Work notifications', 'park', null);
      return;
    case 'quick_reset':
      window.dispatchEvent(new CustomEvent('navigate_tab', { detail: 'reset' }));
      return;
    case 'talk_to_nova':
      window.dispatchEvent(new CustomEvent('navigate_tab', { detail: 'nova' }));
      return;
    case 'nothing':
    default:
      return;
  }
};

export const DecompressionDoorway = ({ onAwardPoints }: DecompressionDoorwayProps) => {
  const [mode, setMode] = useState<'doorway' | 'thresholds'>('doorway');

  const [depth, setDepth] = useState<DoorwayDepth>('quick');
  const [step, setStep] = useState<FlowStep>('threshold');

  const [leaving, setLeaving] = useState<string | null>(null);
  const [arriving, setArriving] = useState<string | null>(null);
  const [customLeaving, setCustomLeaving] = useState('');
  const [customArriving, setCustomArriving] = useState('');
  const [profile, setProfile] = useState<ThresholdProfile | null>(null);

  const [unfinishedAnswer, setUnfinishedAnswer] = useState<UnfinishedBusinessAnswer | null>(null);
  const [disposition, setDisposition] = useState<UnfinishedBusinessDisposition | null>(null);
  const [actionNote, setActionNote] = useState('');
  const [parkedConfirmed, setParkedConfirmed] = useState(false);

  const [capacityScore, setCapacityScore] = useState<number | null>(null);
  const [capacityChecked, setCapacityChecked] = useState(false);
  const [arrivalQuality, setArrivalQuality] = useState<string | null>(null);
  const [customArrivalQuality, setCustomArrivalQuality] = useState('');

  const [anchor, setAnchor] = useState<string | null>(null);
  const [saveAnchor, setSaveAnchor] = useState(false);
  const [digitalBoundaryIntent, setDigitalBoundaryIntent] = useState(false);

  const [roleWeight, setRoleWeight] = useState<string | null>(null);
  const [switchedOnReason, setSwitchedOnReason] = useState<SwitchedOnReason | null>(null);

  const [pendingCheck, setPendingCheck] = useState<DoorwaySessionRecord | null>(null);
  const [pendingCheckAnswer, setPendingCheckAnswer] = useState<ArrivalCheckResponse | null>(null);
  const [pendingFollowedThrough, setPendingFollowedThrough] = useState<FollowedThroughAnswer | null>(null);
  const [pendingToolSuggested, setPendingToolSuggested] = useState<FollowUpTool | null>(null);

  // Loads the sparse later arrival check, if one is due, once on mount -
  // never computed fresh on every render, since the decision was already
  // made (and stored) at the moment the prior session was logged.
  useEffect(() => {
    const load = async () => {
      if (!auth.currentUser) return;
      const pending = await loadPendingArrivalCheckSession(auth.currentUser.uid);
      setPendingCheck(pending);
    };
    load();
  }, []);

  const steps = stepsForDepth(depth);
  const stepIndex = steps.indexOf(step);
  const advance = () => {
    const next = steps[stepIndex + 1];
    if (next) setStep(next);
  };

  const handlePickThreshold = async (leaveVal: string, arriveVal: string) => {
    setLeaving(leaveVal);
    setArriving(arriveVal);
    const key = pairKeyFor(leaveVal, arriveVal);
    const existing = auth.currentUser ? await loadThresholdProfile(auth.currentUser.uid, key) : null;
    setProfile(existing);
    if (existing?.preferredArrivalQuality) setArrivalQuality(existing.preferredArrivalQuality);
    if (existing?.transitionAnchor) setAnchor(existing.transitionAnchor);
    const repeatedlyDifficult = existing
      ? detectFrequentSkipPattern(existing.totalPrompted, existing.totalSkipped)
      : false;
    setDepth(recommendDoorwayDepth(repeatedlyDifficult));
    if (!capacityChecked) {
      const checkIn = auth.currentUser ? await loadLatestCapacityCheckIn(auth.currentUser.uid) : null;
      setCapacityScore(checkIn?.score ?? null);
      setCapacityChecked(true);
    }
    setStep('unfinished');
  };

  const handleUnfinishedDisposition = async (d: UnfinishedBusinessDisposition) => {
    setDisposition(d);
    if ((d === 'park' || d === 'schedule') && auth.currentUser && unfinishedAnswer) {
      await parkUnfinishedBusiness(
        auth.currentUser.uid,
        UNFINISHED_BUSINESS_LABELS[unfinishedAnswer],
        d,
        d === 'schedule' ? 'tomorrow' : null
      );
      setParkedConfirmed(true);
    }
  };

  const capacityVeryLow = capacityScore !== null && capacityScore < CAPACITY_VERY_LOW_CUTOFF;
  const arrivalOptions = getArrivalQualityOptions(capacityVeryLow);

  const handleCross = async () => {
    setStep('cross');
    if (!leaving || !arriving) return;
    const key = pairKeyFor(leaving, arriving);
    const uid = auth.currentUser?.uid;
    const totalPromptedBefore = profile?.totalPrompted ?? 0;
    const pendingArrivalCheck = shouldOfferArrivalCheck(totalPromptedBefore);

    if (uid) {
      await recordCrossingForThreshold(uid, leaving, arriving, key, capacityScore);
      if (saveAnchor && anchor) {
        await upsertThresholdProfile(uid, leaving, arriving, key, { transitionAnchor: anchor });
      }
      if (arrivalQuality) {
        await upsertThresholdProfile(uid, leaving, arriving, key, { preferredArrivalQuality: arrivalQuality });
      }
      await recordDoorwaySession(uid, {
        pairKey: key, leaving, arriving, depth,
        capacityAtEntry: capacityScore, arrivalQuality, anchorUsed: anchor,
        pendingArrivalCheck,
      });

      if (roleWeight || switchedOnReason) {
        const parts = [
          roleWeight ? `Heaviest role right now: ${roleWeight}.` : '',
          switchedOnReason ? `Staying switched on because: ${SWITCHED_ON_REASON_LABELS[switchedOnReason]}.` : '',
        ].filter(Boolean).join(' ');
        if (parts) await recordRediscoveryClue(uid, 'decompression_doorway', 'What keeps you switched on at this threshold?', parts);
      }

      updateNovaMemoryBySourceAndType('Decompression Doorway', 'state', {
        content: `Crossed from "${leaving}" to "${arriving}"${arrivalQuality ? `, arriving ${arrivalQuality}` : ''}.`,
        confidence: 'verified',
        canEdit: true,
      });
    }

    if (onAwardPoints) onAwardPoints(15, 'Crossed the Doorway');
    setTimeout(() => setStep('through'), 900);
  };

  const handleSkip = async () => {
    if (step === 'threshold') return; // nothing to skip past yet
    if (step === 'unfinished' && leaving && arriving && auth.currentUser) {
      await recordSkipForThreshold(auth.currentUser.uid, leaving, arriving, pairKeyFor(leaving, arriving));
    }
    advance();
  };

  const resetAll = () => {
    setStep('threshold');
    setDepth('quick');
    setLeaving(null); setArriving(null); setCustomLeaving(''); setCustomArriving('');
    setProfile(null);
    setUnfinishedAnswer(null); setDisposition(null); setActionNote(''); setParkedConfirmed(false);
    setArrivalQuality(null); setCustomArrivalQuality('');
    setAnchor(null); setSaveAnchor(false); setDigitalBoundaryIntent(false);
    setRoleWeight(null); setSwitchedOnReason(null);
  };

  const handlePendingCheckAnswer = async (answer: ArrivalCheckResponse) => {
    setPendingCheckAnswer(answer);
    if (!pendingCheck || !auth.currentUser) return;
    await updateDoorwaySessionFollowUp(auth.currentUser.uid, pendingCheck.id, { arrivalCheck: answer });
  };

  const handleFollowedThrough = async (answer: FollowedThroughAnswer) => {
    setPendingFollowedThrough(answer);
    const tool = suggestFollowUpTool(answer);
    setPendingToolSuggested(tool);
    if (pendingCheck && auth.currentUser) {
      await updateDoorwaySessionFollowUp(auth.currentUser.uid, pendingCheck.id, { followedThrough: answer });
    }
  };

  const dismissPendingCheck = () => {
    setPendingCheck(null);
    setPendingCheckAnswer(null);
    setPendingFollowedThrough(null);
    setPendingToolSuggested(null);
  };

  return (
    <div className="space-y-12 pb-24">
      <div className="max-w-4xl">
        <div className="flex items-center gap-4 mb-4">
          <div className="tag">Boundary Transitions · Core Pillar: Practice</div>
          <div className="h-px flex-1 bg-border/40" />
          <button
            onClick={() => setMode(mode === 'doorway' ? 'thresholds' : 'doorway')}
            className="text-xs font-black uppercase tracking-widest text-text-muted hover:text-text-main transition-colors shrink-0"
          >
            {mode === 'doorway' ? 'My Thresholds' : 'Back to Doorway'}
          </button>
        </div>
        <div className="space-y-4">
          <h3 className="text-5xl font-display font-bold text-text-main tracking-tight">The Decompression Doorway</h3>
          <p className="text-xl text-text-muted font-medium max-w-2xl">
            You're always crossing from one part of your day into another. This helps you notice it and arrive on purpose.
          </p>
        </div>
      </div>

      {mode === 'doorway' && pendingCheck && !pendingCheckAnswer && (
        <div className="card border border-border p-6 space-y-4">
          <div className="flex items-start justify-between gap-4">
            <p className="text-text-main font-medium">
              Last time, you crossed into "{pendingCheck.arriving}." Did that stick?
            </p>
            <button onClick={dismissPendingCheck} aria-label="Dismiss" className="text-text-muted hover:text-text-main shrink-0">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {ARRIVAL_CHECK_ORDER.map((r) => (
              <button
                key={r}
                onClick={() => handlePendingCheckAnswer(r)}
                className="px-4 py-2 rounded-xl border border-border hover:border-primary/50 font-bold text-sm text-text-main"
              >
                {ARRIVAL_CHECK_LABELS[r]}
              </button>
            ))}
          </div>
        </div>
      )}

      {mode === 'doorway' && pendingCheck && pendingCheckAnswer && (
        <div className="card border border-border p-6 space-y-4">
          <p className="text-text-main font-medium">{ARRIVAL_CHECK_BRANCHES[pendingCheckAnswer].novaLine}</p>
          {pendingCheckAnswer === 'not_really' && !pendingFollowedThrough && (
            <div className="flex flex-wrap gap-2">
              {FOLLOWED_THROUGH_ORDER.map((a) => (
                <button
                  key={a}
                  onClick={() => handleFollowedThrough(a)}
                  className="px-3 py-1.5 rounded-lg border border-border text-xs font-bold text-text-muted hover:text-text-main hover:border-primary/40 transition-colors"
                >
                  {FOLLOWED_THROUGH_LABELS[a]}
                </button>
              ))}
            </div>
          )}
          {pendingToolSuggested && pendingToolSuggested !== 'nothing' && (
            <div className="flex items-center justify-between gap-4 p-4 rounded-xl bg-surface/60 border border-border">
              <p className="text-sm text-text-muted">Smallest relevant next step: <span className="font-bold text-text-main">{FOLLOW_UP_TOOL_LABELS[pendingToolSuggested]}</span></p>
              <button
                onClick={() => { routeFollowUpTool(auth.currentUser?.uid, pendingToolSuggested); dismissPendingCheck(); }}
                className="btn-primary py-2 px-4 text-xs shrink-0"
              >
                Take me there
              </button>
            </div>
          )}
          <button onClick={dismissPendingCheck} className="text-xs font-bold text-text-muted hover:text-text-main">Done</button>
        </div>
      )}

      {mode === 'thresholds' && <MyThresholds />}

      {mode === 'doorway' && (
        <div className="card border border-border p-8 md:p-12 min-h-[500px] flex flex-col items-center justify-center relative overflow-hidden">
          <AnimatePresence mode="wait">
            {step === 'threshold' && (
              <motion.div key="threshold" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="w-full max-w-2xl space-y-8">
                <div className="text-center space-y-4 mb-4">
                  <div className="w-16 h-16 bg-surface dark:bg-surface rounded-full flex items-center justify-center mx-auto mb-6">
                    <DoorOpen className="w-8 h-8 text-primary" />
                  </div>
                  <h3 className="text-3xl font-display font-bold text-text-main">What threshold are you at?</h3>
                  <p className="text-text-muted">Pick a pairing, or build your own below.</p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {[...SUGGESTED_PAIRINGS, ...RETURN_TO_ME_PAIRINGS].map((p, idx) => (
                    <button
                      key={idx}
                      onClick={() => handlePickThreshold(p.leaving, p.arriving)}
                      className="flex items-center justify-between gap-3 p-4 rounded-xl border border-border hover:border-primary/50 bg-surface transition-colors text-left"
                    >
                      <span className="text-sm font-bold text-text-main">{p.leaving}</span>
                      <ArrowRight className="w-4 h-4 text-primary shrink-0" />
                      <span className="text-sm font-bold text-primary text-right">{p.arriving}</span>
                    </button>
                  ))}
                </div>

                <div className="p-5 rounded-2xl border border-border bg-surface/60 space-y-3">
                  <p className="text-xs font-black uppercase tracking-widest text-text-muted">Or build your own</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <label className="text-xs text-text-muted">Leaving</label>
                      <input
                        value={customLeaving}
                        onChange={(e) => setCustomLeaving(e.target.value)}
                        placeholder="e.g. Work"
                        list="leaving-presets"
                        className="w-full bg-white dark:bg-card border border-border rounded-xl px-3 py-2 text-sm text-text-main focus:outline-none focus:border-primary"
                      />
                      <datalist id="leaving-presets">
                        {LEAVING_PRESETS.map((p) => <option key={p} value={p} />)}
                      </datalist>
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs text-text-muted">Arriving</label>
                      <input
                        value={customArriving}
                        onChange={(e) => setCustomArriving(e.target.value)}
                        placeholder="e.g. Quiet"
                        list="arriving-presets"
                        className="w-full bg-white dark:bg-card border border-border rounded-xl px-3 py-2 text-sm text-text-main focus:outline-none focus:border-primary"
                      />
                      <datalist id="arriving-presets">
                        {ARRIVING_STATE_PRESETS.map((p) => <option key={p} value={p} />)}
                      </datalist>
                    </div>
                  </div>
                  <button
                    onClick={() => handlePickThreshold(customLeaving.trim(), customArriving.trim())}
                    disabled={!customLeaving.trim() || !customArriving.trim()}
                    className="w-full btn-primary py-3 text-sm disabled:opacity-40"
                  >
                    Use This Threshold
                  </button>
                </div>
              </motion.div>
            )}

            {step === 'unfinished' && (
              <motion.div key="unfinished" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="w-full max-w-xl space-y-6">
                <div className="text-center space-y-3 mb-4">
                  <h3 className="text-3xl font-display font-bold text-text-main">What's still with you?</h3>
                  <p className="text-text-muted">From {leaving} - before you head toward {arriving}.</p>
                </div>

                {!unfinishedAnswer && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {UNFINISHED_BUSINESS_ORDER.map((a) => (
                      <button
                        key={a}
                        onClick={() => setUnfinishedAnswer(a)}
                        className="p-3 rounded-xl border border-border hover:border-primary/50 text-left text-sm font-bold text-text-main"
                      >
                        {UNFINISHED_BUSINESS_LABELS[a]}
                      </button>
                    ))}
                  </div>
                )}

                {unfinishedAnswer && !disposition && (
                  <div className="space-y-3">
                    <p className="text-text-main font-medium">What do you want to do with it?</p>
                    <div className="flex flex-wrap gap-2">
                      {DISPOSITION_ORDER.map((d) => (
                        <button
                          key={d}
                          onClick={() => handleUnfinishedDisposition(d)}
                          className="px-4 py-2 rounded-xl border border-border hover:border-primary/50 font-bold text-sm text-text-main"
                        >
                          {DISPOSITION_LABELS[d]}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {disposition === 'park' && parkedConfirmed && (
                  <p className="text-sm text-success dark:text-[#4ade80] font-bold">Parked - it'll be waiting for you, not following you.</p>
                )}
                {disposition === 'schedule' && parkedConfirmed && (
                  <p className="text-sm text-success dark:text-[#4ade80] font-bold">Scheduled for tomorrow.</p>
                )}
                {disposition === 'let_go' && (
                  <p className="text-sm text-text-muted">Good. That one doesn't need to cross with you.</p>
                )}
                {disposition === 'needs_action_now' && (
                  <div className="space-y-3">
                    <input
                      value={actionNote}
                      onChange={(e) => setActionNote(e.target.value)}
                      placeholder="What actually needs doing?"
                      className="w-full bg-white dark:bg-card border border-border rounded-xl px-4 py-2.5 text-sm text-text-main focus:outline-none focus:border-primary"
                    />
                    <p className="text-xs text-text-muted">Noted - take it to One Less Thing when you're ready. This threshold can still wait for you.</p>
                  </div>
                )}

                {disposition && (
                  <button onClick={advance} className="w-full btn-primary py-3 text-sm">Continue <ArrowRight className="w-4 h-4 ml-2" /></button>
                )}
              </motion.div>
            )}

            {step === 'arrival' && (
              <motion.div key="arrival" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="w-full max-w-xl space-y-6">
                <div className="text-center space-y-3 mb-4">
                  <h3 className="text-3xl font-display font-bold text-text-main">How do you want to arrive?</h3>
                  <p className="text-text-muted">
                    {capacityVeryLow
                      ? "You're running low right now - these are the realistic options."
                      : `Into ${arriving}.`}
                  </p>
                </div>

                <div className="flex flex-wrap justify-center gap-2">
                  {arrivalOptions.map((q) => (
                    <button
                      key={q}
                      onClick={() => setArrivalQuality(q)}
                      aria-pressed={arrivalQuality === q}
                      className={cn(
                        'px-4 py-2.5 rounded-xl border font-bold text-sm transition-colors',
                        arrivalQuality === q ? 'bg-primary/10 border-primary text-primary' : 'border-border text-text-main hover:border-primary/50'
                      )}
                    >
                      {q}
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-2 max-w-sm mx-auto">
                  <input
                    value={customArrivalQuality}
                    onChange={(e) => setCustomArrivalQuality(e.target.value)}
                    placeholder="Or name your own..."
                    className="flex-1 bg-white dark:bg-card border border-border rounded-xl px-3 py-2 text-sm text-text-main focus:outline-none focus:border-primary"
                  />
                  <button
                    onClick={() => { if (customArrivalQuality.trim()) setArrivalQuality(customArrivalQuality.trim()); }}
                    disabled={!customArrivalQuality.trim()}
                    className="text-xs font-bold text-text-muted hover:text-text-main disabled:opacity-40"
                  >
                    Use
                  </button>
                </div>

                {arrivalQuality && (
                  <div className="text-center space-y-4">
                    <p className="text-lg font-display text-text-main italic">{reflectArrivalChoice(arrivalQuality)}</p>
                    <button onClick={depth === 'quick' ? handleCross : advance} className="btn-primary py-3 px-8 text-sm">
                      {depth === 'quick' ? 'Cross the Doorway' : 'Continue'} <ArrowRight className="w-4 h-4 ml-2" />
                    </button>
                  </div>
                )}
              </motion.div>
            )}

            {step === 'ritual' && (
              <motion.div key="ritual" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="w-full max-w-xl space-y-6">
                <div className="text-center space-y-3 mb-4">
                  <h3 className="text-3xl font-display font-bold text-text-main">One small thing marks the crossing</h3>
                  <p className="text-text-muted">Pick whichever anchor fits right now.</p>
                </div>

                <div className="flex flex-wrap justify-center gap-2">
                  {RITUAL_ANCHORS.map((r) => (
                    <button
                      key={r}
                      onClick={() => setAnchor(r)}
                      aria-pressed={anchor === r}
                      className={cn(
                        'px-4 py-2.5 rounded-xl border font-bold text-sm transition-colors',
                        anchor === r ? 'bg-primary/10 border-primary text-primary' : 'border-border text-text-main hover:border-primary/50'
                      )}
                    >
                      {r}
                    </button>
                  ))}
                </div>

                {anchor && (
                  <div className="space-y-4 text-center">
                    <label className="inline-flex items-center gap-2 text-sm text-text-muted cursor-pointer">
                      <input type="checkbox" checked={saveAnchor} onChange={(e) => setSaveAnchor(e.target.checked)} />
                      Save "{anchor}" as My Transition Anchor for {leaving} → {arriving}
                    </label>
                    <label className="flex items-start gap-2 text-xs text-text-muted max-w-md mx-auto text-left">
                      <input type="checkbox" checked={digitalBoundaryIntent} onChange={(e) => setDigitalBoundaryIntent(e.target.checked)} className="mt-0.5" />
                      <span>
                        Put work notifications down for a while. Blaze Break can't actually mute your phone - but naming it now makes it easier to actually do.
                      </span>
                    </label>
                    <button onClick={advance} className="btn-primary py-3 px-8 text-sm">Continue <ArrowRight className="w-4 h-4 ml-2" /></button>
                  </div>
                )}
              </motion.div>
            )}

            {step === 'deeper_reflect' && (
              <motion.div key="deeper_reflect" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="w-full max-w-xl space-y-6">
                <div className="text-center space-y-3 mb-4">
                  <h3 className="text-3xl font-display font-bold text-text-main">Worth a second look</h3>
                  <p className="text-text-muted italic">{DEEPER_DECOMPRESSION_QUESTIONS[4]}</p>
                </div>

                <div className="space-y-4">
                  <div>
                    <p className="text-xs font-black uppercase tracking-widest text-text-muted mb-2">Which part of you weighs heaviest right now? (optional)</p>
                    <div className="flex flex-wrap gap-2">
                      {ROLE_WEIGHT_OPTIONS.map((r) => (
                        <button key={r} onClick={() => setRoleWeight(r)} aria-pressed={roleWeight === r} className={cn('px-3 py-1.5 rounded-lg border text-xs font-bold', roleWeight === r ? 'border-primary text-primary' : 'border-border text-text-muted hover:text-text-main')}>
                          {r}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="text-xs font-black uppercase tracking-widest text-text-muted mb-2">What's keeping you switched on? (optional)</p>
                    <div className="flex flex-wrap gap-2">
                      {SWITCHED_ON_REASON_ORDER.map((r) => (
                        <button key={r} onClick={() => setSwitchedOnReason(r)} aria-pressed={switchedOnReason === r} className={cn('px-3 py-1.5 rounded-lg border text-xs font-bold', switchedOnReason === r ? 'border-primary text-primary' : 'border-border text-text-muted hover:text-text-main')}>
                          {SWITCHED_ON_REASON_LABELS[r]}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <button onClick={handleCross} className="w-full btn-primary py-3 text-sm">Cross the Doorway</button>
              </motion.div>
            )}

            {step === 'cross' && (
              <motion.div key="cross" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="w-full flex flex-col items-center justify-center py-16 space-y-6">
                <motion.div
                  className="w-20 h-20 bg-primary rounded-full shadow-2xl shadow-primary/40 flex items-center justify-center"
                  animate={{ scale: [1, 1.1, 1] }}
                  transition={{ duration: 0.9, ease: 'easeInOut' }}
                >
                  <DoorOpen className="w-9 h-9 text-primary-foreground" />
                </motion.div>
                <p className="text-text-muted font-medium">Crossing...</p>
              </motion.div>
            )}

            {step === 'through' && (
              <motion.div key="through" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} role="status" aria-live="polite" className="w-full flex justify-center py-20">
                <div className="text-center p-6 sm:p-8 md:p-12 border border-success/20 bg-success/5 rounded-xl space-y-4">
                  <div className="w-24 h-24 bg-success rounded-full flex items-center justify-center text-white mb-4 shadow-xl shadow-success/20 mx-auto">
                    <CheckCircle2 className="w-12 h-12" />
                  </div>
                  <h4 className="text-4xl font-display font-bold text-text-main">You're through.</h4>
                  <p className="text-xl text-text-muted font-medium">{arriving}.</p>
                  <button onClick={resetAll} className="text-xs font-black uppercase tracking-widest text-text-muted hover:text-text-main mt-6">
                    Another Threshold
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {step !== 'threshold' && step !== 'cross' && step !== 'through' && (
            <div className="absolute top-6 right-6 flex items-center gap-3">
              {DOORWAY_DEPTH_ORDER.map((d) => (
                <button
                  key={d}
                  onClick={() => setDepth(d)}
                  aria-pressed={depth === d}
                  title={`${DOORWAY_DEPTH_LABELS[d]} · ${DOORWAY_DEPTH_DURATION_LABEL[d]}`}
                  className={cn('text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded-full', depth === d ? 'bg-primary/10 text-primary' : 'text-text-muted/60 hover:text-text-muted')}
                >
                  {DOORWAY_DEPTH_LABELS[d]}
                </button>
              ))}
              <button onClick={handleSkip} className="text-[10px] font-black uppercase tracking-widest text-text-muted/60 hover:text-text-muted">
                Skip
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// My Thresholds: a plain record of recurring pairs - explicitly no
// scores, streaks or success percentages. Pattern hypotheses are
// confirmable, never asserted (reusing Rediscovery's own confirmation
// model rather than a parallel one).
const MyThresholds = () => {
  const [profiles, setProfiles] = useState<ThresholdProfile[]>([]);
  const [parked, setParked] = useState<ParkedItem[]>([]);
  const [confirmed, setConfirmed] = useState<Record<string, ConfirmationAnswer>>({});
  const [showParked, setShowParked] = useState(false);

  useEffect(() => {
    const load = async () => {
      if (!auth.currentUser) return;
      const [p, items] = await Promise.all([
        loadAllThresholdProfiles(auth.currentUser.uid),
        loadParkedItems(auth.currentUser.uid),
      ]);
      setProfiles(p);
      setParked(items);
    };
    load();
  }, []);

  const handleConfirmPattern = async (profile: ThresholdProfile, hypothesis: string, answer: ConfirmationAnswer) => {
    setConfirmed((prev) => ({ ...prev, [profile.pairKey]: answer }));
    if (answer === 'yes' && auth.currentUser) {
      await recordRediscoveryClue(auth.currentUser.uid, 'decompression_doorway', `${profile.leaving} → ${profile.arriving}`, hypothesis);
    }
  };

  const handleResolveParked = async (id: string) => {
    if (!auth.currentUser) return;
    await resolveParkedItem(auth.currentUser.uid, id);
    setParked((prev) => prev.filter((i) => i.id !== id));
  };

  return (
    <div className="space-y-6">
      {profiles.length === 0 && (
        <p className="text-text-muted text-center py-8">No recurring thresholds yet - they'll show up here once you cross the same one a few times.</p>
      )}

      {profiles.map((p) => {
        const lowCapacityPattern = detectLowCapacityArrivalPattern(p.capacityHistory.map((c) => ({ capacity: c })));
        const skipPattern = detectFrequentSkipPattern(p.totalPrompted, p.totalSkipped);
        const hypothesis = lowCapacityPattern
          ? `You often arrive at "${p.arriving}" with very little left in the tank.`
          : skipPattern
          ? `You often skip the ${p.leaving} → ${p.arriving} transition.`
          : null;
        const answer = confirmed[p.pairKey];

        return (
          <div key={p.pairKey} className="card border border-border p-6 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <p className="font-bold text-text-main">{p.leaving} <ArrowRight className="inline w-3.5 h-3.5 mx-1 text-primary" /> {p.arriving}</p>
              <span className="text-xs text-text-muted">Crossed {p.totalCrossings} time{p.totalCrossings === 1 ? '' : 's'}</span>
            </div>
            <div className="flex flex-wrap gap-4 text-xs text-text-muted">
              {p.preferredArrivalQuality && <span>Usual arrival: <span className="text-text-main font-bold">{p.preferredArrivalQuality}</span></span>}
              {p.transitionAnchor && <span>My Transition Anchor: <span className="text-text-main font-bold">{p.transitionAnchor}</span></span>}
            </div>

            {hypothesis && !answer && (
              <div className="pt-3 border-t border-border/40 space-y-2">
                <p className="text-sm text-text-main">Nova noticed: "{hypothesis}" - does that feel true?</p>
                <div className="flex flex-wrap gap-2">
                  {CONFIRMATION_OPTIONS.map((opt) => (
                    <button
                      key={opt.id}
                      onClick={() => handleConfirmPattern(p, hypothesis, opt.id)}
                      className="px-3 py-1.5 rounded-lg border border-border text-xs font-bold text-text-muted hover:text-text-main hover:border-primary/40"
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {answer === 'yes' && lowCapacityPattern && (
              <div className="pt-3 border-t border-border/40 flex items-center justify-between gap-3">
                <p className="text-xs text-text-muted">This connects to Energy Delta - worth checking your capacity directly.</p>
                <button onClick={() => window.dispatchEvent(new CustomEvent('navigate_tab', { detail: 'recover' }))} className="btn-primary py-2 px-4 text-xs shrink-0">
                  Check Capacity
                </button>
              </div>
            )}
          </div>
        );
      })}

      <div className="pt-4 border-t border-border/40">
        <button onClick={() => setShowParked((v) => !v)} className="text-xs font-bold text-text-muted hover:text-text-main flex items-center gap-1.5">
          <ChevronDown className={cn('w-3.5 h-3.5 transition-transform', showParked && 'rotate-180')} />
          Parked & Scheduled ({parked.length})
        </button>
        {showParked && (
          <div className="mt-3 space-y-2">
            {parked.length === 0 && <p className="text-xs text-text-muted">Nothing parked right now.</p>}
            {parked.map((item) => (
              <div key={item.id} className="p-3 rounded-xl border border-border bg-surface/40 flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm text-text-main">{item.text}</p>
                  <p className="text-xs text-text-muted">{item.disposition === 'schedule' ? 'Scheduled' : 'Parked'}{item.reminderDay ? ` · ${item.reminderDay}` : ''}</p>
                </div>
                <button onClick={() => handleResolveParked(item.id)} className="text-xs font-bold text-text-muted hover:text-text-main shrink-0">Done</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
