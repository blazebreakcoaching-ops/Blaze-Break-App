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
  UnfinishedBusinessDisposition, DISPOSITION_LABELS,
  CAPACITY_VERY_LOW_CUTOFF, getArrivalQualityOptions, reflectArrivalChoice,
  RITUAL_ANCHORS, DoorwayDepth, DOORWAY_DEPTH_ORDER, DOORWAY_DEPTH_LABELS,
  DOORWAY_DEPTH_DURATION_LABEL, recommendDoorwayDepth, DEEPER_DECOMPRESSION_QUESTIONS,
  ArrivalCheckResponse, ARRIVAL_CHECK_ORDER, ARRIVAL_CHECK_LABELS, ARRIVAL_CHECK_BRANCHES,
  shouldOfferArrivalCheck, FollowedThroughAnswer, FOLLOWED_THROUGH_ORDER, FOLLOWED_THROUGH_LABELS,
  FollowUpTool, FOLLOW_UP_TOOL_LABELS, suggestFollowUpTool, ROLE_WEIGHT_OPTIONS,
  SwitchedOnReason, SWITCHED_ON_REASON_ORDER, SWITCHED_ON_REASON_LABELS,
  detectLowCapacityArrivalPattern, detectFrequentSkipPattern, pairKeyFor,
  FIRST_USE_SUGGESTIONS, ActTonightAnswer, ACT_TONIGHT_ORDER, ACT_TONIGHT_LABELS,
  dispositionOptionsForActTonight, PARK_IT_CAPTURE_LABEL, PARK_IT_SUPPORTING_LINE,
  PARK_IT_CTA, PARK_IT_CONFIRM_LINE, CROSSING_SUPPORTING_LINE, CROSSING_SHORT_LINE,
  DigitalBoundaryChoice, DIGITAL_BOUNDARY_ORDER, DIGITAL_BOUNDARY_LABELS, DIGITAL_BOUNDARY_HONEST_NOTE,
  UseUsualDoorwayChoice, USE_USUAL_DOORWAY_ORDER, USE_USUAL_DOORWAY_LABELS,
  isWorkFromHomeContext, NO_COMMUTE_PROMPT, WORK_FROM_HOME_THRESHOLDS,
  ParkReminderChoice, NudgeFrequency, NUDGE_FREQUENCY_ORDER, NUDGE_FREQUENCY_LABELS,
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
type FlowStep = 'threshold' | 'recall' | 'unfinished' | 'arrival' | 'ritual' | 'deeper_capacity' | 'deeper_reflect' | 'cross' | 'through';

// QUICK DOORWAY EXAMPLE still asks "what's still following you?" - just
// without the act-tonight gate or the full disposition menu, so Quick
// stays genuinely quicker while matching the brief's own worked example.
const stepsForDepth = (depth: DoorwayDepth): FlowStep[] => {
  if (depth === 'quick') return ['threshold', 'unfinished', 'arrival', 'cross', 'through'];
  if (depth === 'deeper') return ['threshold', 'unfinished', 'arrival', 'ritual', 'deeper_capacity', 'deeper_reflect', 'cross', 'through'];
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
  const [actTonight, setActTonight] = useState<ActTonightAnswer | null>(null);
  const [disposition, setDisposition] = useState<UnfinishedBusinessDisposition | null>(null);
  const [actionNote, setActionNote] = useState('');
  const [parkedConfirmed, setParkedConfirmed] = useState(false);
  const [parkReminderChoice, setParkReminderChoice] = useState<ParkReminderChoice | null>(null);
  const [specificDay, setSpecificDay] = useState('');

  const [capacityScore, setCapacityScore] = useState<number | null>(null);
  const [capacityChecked, setCapacityChecked] = useState(false);
  const [arrivalQuality, setArrivalQuality] = useState<string | null>(null);
  const [customArrivalQuality, setCustomArrivalQuality] = useState('');

  const [anchor, setAnchor] = useState<string | null>(null);
  const [saveAnchor, setSaveAnchor] = useState(false);
  const [digitalBoundaryChoice, setDigitalBoundaryChoice] = useState<DigitalBoundaryChoice | null>(null);

  const [roleWeight, setRoleWeight] = useState<string | null>(null);
  const [switchedOnReason, setSwitchedOnReason] = useState<SwitchedOnReason | null>(null);

  const [pendingCheck, setPendingCheck] = useState<DoorwaySessionRecord | null>(null);
  const [pendingCheckAnswer, setPendingCheckAnswer] = useState<ArrivalCheckResponse | null>(null);
  const [pendingFollowedThrough, setPendingFollowedThrough] = useState<FollowedThroughAnswer | null>(null);
  const [pendingToolSuggested, setPendingToolSuggested] = useState<FollowUpTool | null>(null);

  const [allProfiles, setAllProfiles] = useState<ThresholdProfile[]>([]);
  const [profilesLoaded, setProfilesLoaded] = useState(false);
  const [startedFirstDoorway, setStartedFirstDoorway] = useState(false);
  const [dismissedNudge, setDismissedNudge] = useState(false);
  const [firstUseRevealed, setFirstUseRevealed] = useState(false);

  // Loads every saved threshold once on mount - drives the first-use
  // empty state (no profiles yet) and the best-effort pre-threshold
  // nudge banner (most recently used pair, if its own nudge consent
  // allows it) without a second, competing preference store.
  useEffect(() => {
    const load = async () => {
      if (!auth.currentUser) { setProfilesLoaded(true); return; }
      const profiles = await loadAllThresholdProfiles(auth.currentUser.uid);
      setAllProfiles(profiles);
      setProfilesLoaded(true);
    };
    load();
  }, []);

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
    setStartedFirstDoorway(true);
    const key = pairKeyFor(leaveVal, arriveVal);
    const existing = auth.currentUser ? await loadThresholdProfile(auth.currentUser.uid, key) : null;
    setProfile(existing);
    const repeatedlyDifficult = existing
      ? detectFrequentSkipPattern(existing.totalPrompted, existing.totalSkipped)
      : false;
    setDepth(recommendDoorwayDepth(repeatedlyDifficult));
    if (!capacityChecked) {
      const checkIn = auth.currentUser ? await loadLatestCapacityCheckIn(auth.currentUser.uid) : null;
      setCapacityScore(checkIn?.score ?? null);
      setCapacityChecked(true);
    }
    // "Use your usual doorway?" - only offered when there's a real saved
    // default to reuse; otherwise nothing to recall, straight to unfinished.
    if (existing?.preferredArrivalQuality && existing?.transitionAnchor) {
      setStep('recall');
    } else {
      setStep('unfinished');
    }
  };

  const handleRecallChoice = (choice: UseUsualDoorwayChoice) => {
    if (choice === 'yes' && profile) {
      setArrivalQuality(profile.preferredArrivalQuality);
      setAnchor(profile.transitionAnchor);
      setSaveAnchor(true);
    } else {
      // "Change it" updates the saved default once a new anchor is
      // chosen; "Skip today" leaves today's saved default untouched -
      // the one real difference between the two, via the same saveAnchor
      // checkbox the ritual step already offers.
      setSaveAnchor(choice === 'change_it');
    }
    setStep('unfinished');
  };

  const handleUnfinishedDisposition = (d: UnfinishedBusinessDisposition) => {
    setDisposition(d);
    if ((d === 'park' || d === 'schedule') && unfinishedAnswer) {
      setActionNote(UNFINISHED_BUSINESS_LABELS[unfinishedAnswer]);
    }
  };

  // PARKING: a simple capture area the user can still edit before
  // confirming - "Leave It Here" never auto-parks the preset label alone.
  const handleConfirmPark = async (d: 'park' | 'schedule') => {
    if (auth.currentUser && actionNote.trim()) {
      const reminderDay = d === 'schedule'
        ? (parkReminderChoice === 'specific_day' ? specificDay : parkReminderChoice === 'no_reminder' ? null : 'tomorrow')
        : null;
      await parkUnfinishedBusiness(auth.currentUser.uid, actionNote.trim(), d, reminderDay);
    }
    setParkedConfirmed(true);
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
      setAllProfiles(await loadAllThresholdProfiles(uid));
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
    setUnfinishedAnswer(null); setActTonight(null); setDisposition(null); setActionNote(''); setParkedConfirmed(false);
    setParkReminderChoice(null); setSpecificDay('');
    setArrivalQuality(null); setCustomArrivalQuality('');
    setAnchor(null); setSaveAnchor(false); setDigitalBoundaryChoice(null);
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
            The last part of your day doesn't have to follow you into the next one.
          </p>
          <p className="text-sm text-text-muted/80 max-w-2xl">
            Put down what you can, choose how you want to arrive, and cross deliberately.
          </p>
        </div>
      </div>

      {mode === 'doorway' && step === 'threshold' && !dismissedNudge && (() => {
        const nudgeCandidate = allProfiles.find((p) => p.nudgeConsent !== 'off');
        if (!nudgeCandidate || startedFirstDoorway) return null;
        const hour = new Date().getHours();
        const endOfDayWindow = hour >= 17 && hour <= 19;
        if (!endOfDayWindow) return null;
        return (
          <div className="card border border-border p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <p className="text-sm text-text-main font-medium">
              {nudgeCandidate.leaving}'s nearly done. Want help leaving it there today?
            </p>
            <div className="flex gap-2 shrink-0">
              <button
                onClick={() => { setDismissedNudge(true); handlePickThreshold(nudgeCandidate.leaving, nudgeCandidate.arriving); }}
                className="btn-primary py-2 px-4 text-xs"
              >
                Yes
              </button>
              <button onClick={() => setDismissedNudge(true)} className="px-4 py-2 text-xs font-bold text-text-muted hover:text-text-main">
                Not today
              </button>
              <button onClick={() => setDismissedNudge(true)} className="px-4 py-2 text-xs font-bold text-text-muted hover:text-text-main">
                Remind me later
              </button>
            </div>
          </div>
        );
      })()}

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
            {step === 'threshold' && profilesLoaded && allProfiles.length === 0 && !startedFirstDoorway && !firstUseRevealed && (
              <motion.div key="first-use" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="w-full max-w-md text-center space-y-6">
                <div className="w-16 h-16 bg-surface dark:bg-surface rounded-full flex items-center justify-center mx-auto mb-2">
                  <DoorOpen className="w-8 h-8 text-primary" />
                </div>
                <h3 className="text-3xl font-display font-bold text-text-main">The Decompression Doorway</h3>
                <p className="text-text-muted">The last part of your day doesn't have to follow you into the next one.</p>
                <button onClick={() => setFirstUseRevealed(true)} className="w-full btn-primary py-4 text-sm">
                  Create My First Doorway
                </button>
              </motion.div>
            )}

            {step === 'threshold' && !(profilesLoaded && allProfiles.length === 0 && !startedFirstDoorway && !firstUseRevealed) && (
              <motion.div key="threshold" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="w-full max-w-2xl space-y-8">
                <div className="text-center space-y-4 mb-4">
                  <div className="w-16 h-16 bg-surface dark:bg-surface rounded-full flex items-center justify-center mx-auto mb-6">
                    <DoorOpen className="w-8 h-8 text-primary" />
                  </div>
                  <h3 className="text-3xl font-display font-bold text-text-main">What are you leaving — and how do you want to arrive?</h3>
                  <p className="text-text-muted">
                    {allProfiles.length === 0 ? 'What transition would help most?' : 'Pick a pairing, or build your own below.'}
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {(allProfiles.length === 0 ? FIRST_USE_SUGGESTIONS : [...SUGGESTED_PAIRINGS, ...RETURN_TO_ME_PAIRINGS]).map((p, idx) => (
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

            {step === 'recall' && profile && (
              <motion.div key="recall" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="w-full max-w-md text-center space-y-6">
                <h3 className="text-2xl font-display font-bold text-text-main">Use your usual doorway?</h3>
                <div className="p-4 rounded-xl border border-border bg-surface/60 text-sm text-text-muted space-y-1">
                  <p>Arrive: <span className="text-text-main font-bold">{profile.preferredArrivalQuality}</span></p>
                  <p>Anchor: <span className="text-text-main font-bold">{profile.transitionAnchor}</span></p>
                </div>
                <div className="flex flex-wrap justify-center gap-2">
                  {USE_USUAL_DOORWAY_ORDER.map((c) => (
                    <button key={c} onClick={() => handleRecallChoice(c)} className="px-4 py-2.5 rounded-xl border border-border hover:border-primary/50 font-bold text-sm text-text-main">
                      {USE_USUAL_DOORWAY_LABELS[c]}
                    </button>
                  ))}
                </div>
              </motion.div>
            )}

            {step === 'unfinished' && depth === 'quick' && (
              <motion.div key="unfinished-quick" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="w-full max-w-xl space-y-6">
                <div className="text-center space-y-3 mb-4">
                  <h3 className="text-3xl font-display font-bold text-text-main">What's still following you?</h3>
                  <p className="text-text-muted">{PARK_IT_SUPPORTING_LINE}</p>
                </div>
                {!parkedConfirmed ? (
                  <div className="space-y-3">
                    <input
                      value={actionNote}
                      onChange={(e) => setActionNote(e.target.value)}
                      placeholder="e.g. Tomorrow's presentation"
                      className="w-full bg-white dark:bg-card border border-border rounded-xl px-4 py-2.5 text-sm text-text-main focus:outline-none focus:border-primary"
                    />
                    <button
                      onClick={async () => {
                        if (actionNote.trim() && auth.currentUser) {
                          await parkUnfinishedBusiness(auth.currentUser.uid, actionNote.trim(), 'park', null);
                        }
                        setParkedConfirmed(true);
                      }}
                      className="w-full btn-primary py-3 text-sm"
                    >
                      {PARK_IT_CTA}
                    </button>
                  </div>
                ) : (
                  <div className="text-center space-y-4">
                    <p className="text-text-main font-medium">{actionNote.trim() ? PARK_IT_CONFIRM_LINE : 'Nothing to leave behind. Good.'}</p>
                    <button onClick={advance} className="w-full btn-primary py-3 text-sm">Continue <ArrowRight className="w-4 h-4 ml-2" /></button>
                  </div>
                )}
              </motion.div>
            )}

            {step === 'unfinished' && depth !== 'quick' && (
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

                {unfinishedAnswer && !actTonight && (
                  <div className="space-y-3 text-center">
                    <p className="text-text-main font-medium">Do you need to act on it tonight?</p>
                    <div className="flex justify-center gap-2">
                      {ACT_TONIGHT_ORDER.map((a) => (
                        <button key={a} onClick={() => setActTonight(a)} className="px-4 py-2 rounded-xl border border-border hover:border-primary/50 font-bold text-sm text-text-main">
                          {ACT_TONIGHT_LABELS[a]}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {unfinishedAnswer && actTonight && !disposition && (
                  <div className="space-y-3">
                    {actTonight === 'no' && <p className="text-text-muted text-sm text-center">Then it doesn't need to come through the door.</p>}
                    <p className="text-text-main font-medium">What do you want to do with it?</p>
                    <div className="flex flex-wrap gap-2 justify-center">
                      {dispositionOptionsForActTonight(actTonight).map((d) => (
                        <button
                          key={d}
                          onClick={() => handleUnfinishedDisposition(d)}
                          className="px-4 py-2 rounded-xl border border-border hover:border-primary/50 font-bold text-sm text-text-main"
                        >
                          {DISPOSITION_LABELS[d]}
                        </button>
                      ))}
                      {actTonight === 'no' && (
                        <button
                          onClick={() => routeFollowUpTool(auth.currentUser?.uid, 'rumination_furnace')}
                          className="px-4 py-2 rounded-xl border border-border hover:border-primary/50 font-bold text-sm text-text-main"
                        >
                          Rumination Furnace
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {(disposition === 'park' || disposition === 'schedule') && !parkedConfirmed && (
                  <div className="space-y-3">
                    <p className="text-xs font-black uppercase tracking-widest text-text-muted">{PARK_IT_CAPTURE_LABEL}</p>
                    <p className="text-sm text-text-muted">{PARK_IT_SUPPORTING_LINE}</p>
                    <textarea
                      value={actionNote}
                      onChange={(e) => setActionNote(e.target.value)}
                      className="w-full h-20 bg-white dark:bg-card border border-border rounded-xl p-3 text-sm text-text-main focus:outline-none focus:border-primary resize-none"
                    />
                    {disposition === 'schedule' && (
                      <div className="space-y-2">
                        <p className="text-xs font-bold text-text-muted">When should this come back?</p>
                        <div className="flex flex-wrap gap-2">
                          {(['tomorrow', 'specific_day', 'no_reminder'] as ParkReminderChoice[]).map((r) => (
                            <button
                              key={r}
                              onClick={() => setParkReminderChoice(r)}
                              aria-pressed={parkReminderChoice === r}
                              className={cn('px-3 py-1.5 rounded-lg border text-xs font-bold', parkReminderChoice === r ? 'border-primary text-primary' : 'border-border text-text-muted hover:text-text-main')}
                            >
                              {r === 'tomorrow' ? 'Tomorrow' : r === 'specific_day' ? 'Specific day' : 'No reminder needed'}
                            </button>
                          ))}
                        </div>
                        {parkReminderChoice === 'specific_day' && (
                          <input
                            type="date"
                            value={specificDay}
                            onChange={(e) => setSpecificDay(e.target.value)}
                            className="bg-white dark:bg-card border border-border rounded-xl px-3 py-2 text-sm text-text-main"
                          />
                        )}
                      </div>
                    )}
                    <button
                      onClick={() => handleConfirmPark(disposition)}
                      disabled={disposition === 'schedule' && !parkReminderChoice}
                      className="w-full btn-primary py-3 text-sm disabled:opacity-40"
                    >
                      {disposition === 'park' ? PARK_IT_CTA : 'Schedule It'}
                    </button>
                  </div>
                )}

                {(disposition === 'park' || disposition === 'schedule') && parkedConfirmed && (
                  <p className="text-sm text-success dark:text-[#4ade80] font-bold text-center">{PARK_IT_CONFIRM_LINE}</p>
                )}
                {disposition === 'let_go' && (
                  <p className="text-sm text-text-muted text-center">Good. That one doesn't need to cross with you.</p>
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

                {disposition && (disposition === 'let_go' || disposition === 'needs_action_now' || parkedConfirmed) && (
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
                  <p className="text-text-muted">
                    {leaving && isWorkFromHomeContext(leaving) ? NO_COMMUTE_PROMPT : 'Pick whichever anchor fits right now.'}
                  </p>
                </div>

                <div className="flex flex-wrap justify-center gap-2">
                  {(leaving && isWorkFromHomeContext(leaving)
                    ? [...RITUAL_ANCHORS, ...WORK_FROM_HOME_THRESHOLDS.filter((t) => !RITUAL_ANCHORS.includes(t))]
                    : RITUAL_ANCHORS
                  ).map((r) => (
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
                    <div className="max-w-md mx-auto text-left space-y-2">
                      <p className="text-xs font-bold text-text-muted">Want work notifications quiet until tomorrow?</p>
                      <div className="flex flex-wrap gap-2">
                        {DIGITAL_BOUNDARY_ORDER.map((c) => (
                          <button
                            key={c}
                            onClick={() => setDigitalBoundaryChoice(c)}
                            aria-pressed={digitalBoundaryChoice === c}
                            className={cn('px-3 py-1.5 rounded-lg border text-xs font-bold', digitalBoundaryChoice === c ? 'border-primary text-primary' : 'border-border text-text-muted hover:text-text-main')}
                          >
                            {DIGITAL_BOUNDARY_LABELS[c]}
                          </button>
                        ))}
                      </div>
                      {digitalBoundaryChoice && <p className="text-[11px] text-text-muted/80">{DIGITAL_BOUNDARY_HONEST_NOTE}</p>}
                    </div>
                    <button onClick={depth === 'deeper' ? advance : handleCross} className="btn-primary py-3 px-8 text-sm">
                      {depth === 'deeper' ? 'Continue' : 'Cross the Doorway'} <ArrowRight className="w-4 h-4 ml-2" />
                    </button>
                  </div>
                )}
              </motion.div>
            )}

            {step === 'deeper_capacity' && (
              <motion.div key="deeper_capacity" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="w-full max-w-md text-center space-y-6">
                <h3 className="text-3xl font-display font-bold text-text-main">What capacity do you have left?</h3>
                <p className="text-text-muted">
                  {capacityScore === null
                    ? "No recent capacity check-in - that's okay, go with what feels true right now."
                    : capacityVeryLow
                    ? "You're running low right now. That's real information, not a failure."
                    : 'You have some real capacity to work with.'}
                </p>
                <button onClick={advance} className="btn-primary py-3 px-8 text-sm">Continue <ArrowRight className="w-4 h-4 ml-2" /></button>
              </motion.div>
            )}

            {step === 'deeper_reflect' && (
              <motion.div key="deeper_reflect" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="w-full max-w-xl space-y-6">
                <div className="text-center space-y-3 mb-4">
                  <h3 className="text-3xl font-display font-bold text-text-main">Worth a second look</h3>
                  <p className="text-text-muted italic">{DEEPER_DECOMPRESSION_QUESTIONS[3]}</p>
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
              <motion.div key="cross" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="w-full flex flex-col items-center justify-center py-16 space-y-6 text-center">
                <p className="text-text-muted text-sm max-w-xs">{CROSSING_SUPPORTING_LINE}</p>
                <motion.div
                  className="w-20 h-20 bg-primary rounded-full shadow-2xl shadow-primary/40 flex items-center justify-center"
                  animate={{ scale: [1, 1.1, 1] }}
                  transition={{ duration: 0.9, ease: 'easeInOut' }}
                >
                  <DoorOpen className="w-9 h-9 text-primary-foreground" />
                </motion.div>
                <p className="text-text-muted font-medium">{CROSSING_SHORT_LINE}</p>
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
                  <p className="text-sm text-text-muted/80 italic">You are allowed to arrive differently from how you left.</p>
                  <button onClick={resetAll} className="text-xs font-black uppercase tracking-widest text-text-muted hover:text-text-main mt-6">
                    Another Threshold
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {step !== 'threshold' && step !== 'recall' && step !== 'cross' && step !== 'through' && (
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

  const handleNudgeConsentChange = async (p: ThresholdProfile, consent: NudgeFrequency) => {
    setProfiles((prev) => prev.map((x) => (x.pairKey === p.pairKey ? { ...x, nudgeConsent: consent } : x)));
    if (auth.currentUser) {
      await upsertThresholdProfile(auth.currentUser.uid, p.leaving, p.arriving, p.pairKey, { nudgeConsent: consent });
    }
  };

  return (
    <div className="space-y-6">
      {profiles.length === 0 && (
        <p className="text-text-muted text-center py-8">No recurring thresholds yet - they'll show up here once you cross the same one a few times.</p>
      )}
      {profiles.length > 0 && (
        <p className="text-xs text-text-muted/70">No scoring. No streaks. No success percentage - this is just for your own understanding.</p>
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

            <div className="space-y-1.5">
              <p className="text-[11px] font-black uppercase tracking-widest text-text-muted/70">When can Nova offer this transition early?</p>
              <div className="flex flex-wrap gap-1.5">
                {NUDGE_FREQUENCY_ORDER.map((n) => (
                  <button
                    key={n}
                    onClick={() => handleNudgeConsentChange(p, n)}
                    aria-pressed={p.nudgeConsent === n}
                    className={cn('px-2.5 py-1 rounded-full border text-[11px] font-bold', p.nudgeConsent === n ? 'border-primary text-primary' : 'border-border text-text-muted hover:text-text-main')}
                  >
                    {NUDGE_FREQUENCY_LABELS[n]}
                  </button>
                ))}
              </div>
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
