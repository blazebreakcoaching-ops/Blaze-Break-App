import { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Compass, Globe, MoonStar, Feather, ArrowRight, ArrowLeft, CheckCircle2,
  ShieldCheck, Sparkles, Trash2, Hand, X, Plus, Loader2, BookOpen,
} from 'lucide-react';
import { cn } from '../lib/utils';
import { BurnoutFingerprint } from '../types';
import { updateNovaMemoryBySourceAndType } from '../lib/nova-brain';
import { auth } from '../lib/firebase';
import { db } from '../lib/firestore';
import { secureApiFetch } from '../lib/secure-api';
import {
  collection, query, orderBy, limit, getDocs, addDoc, updateDoc, doc, getDoc, setDoc, writeBatch,
} from 'firebase/firestore';
import {
  GroundingLens, GROUNDING_LENSES, GROUNDING_LENS_ORDER,
  BurdenId, BURDEN_OPTIONS, BURDEN_LABELS,
  CONTROLLABLE_EXAMPLES, UNCONTROLLABLE_EXAMPLES,
  IslamicThemeId, ISLAMIC_THEMES, ISLAMIC_THEME_ORDER,
  NextActionId, NEXT_ACTION_OPTIONS,
  GroundingSessionRecord, ReflectionAnswer,
} from '../../grounding-content';
import {
  DerivedPattern, computeDerivedPatterns, PATTERN_DIMENSIONS, CONFIDENCE_COPY,
} from '../../grounding-patterns-taxonomy';
import { logGroundingEvent } from '../lib/grounding-analytics';
import { GroundingExploreThis } from './GroundingExploreThis';
import { GroundingCarryingExercise } from './GroundingCarryingExercise';

// Templated, not AI-generated - a first, deterministic pass at "a pattern
// Nova has noticed" so this ships without adding a second AI-generation
// surface to review, keyed by taxonomy dimension id. A live Gemini-
// authored version is a reasonable future enhancement, but the brief
// explicitly prioritises the complete end-to-end journey over "advanced
// pattern intelligence" for this pass. Reuses PATTERN_DIMENSIONS'
// description field directly rather than duplicating similar copy here.
interface PatternFeedbackState {
  userFeedback?: 'resonates' | 'not_really';
  paused?: boolean;
  suppressed?: boolean;
}

interface FaithValuesModeProps {
  fingerprint: BurnoutFingerprint | null;
  // Deliberately unused in this component - completing a grounding
  // session never awards points, badges, or a streak. Kept in the props
  // interface only for call-site compatibility with App.tsx.
  onAwardPoints?: (amount: number, reason: string) => void;
}

type Stage = 'lens' | 'arrive' | 'separate' | 'reflect' | 'release' | 'reconnect';
type ViewMode = 'session' | 'journey';

const LENS_ICONS: Record<GroundingLens, any> = { secular: Globe, values: Compass, faith: Feather, islamic: MoonStar };

const STAGE_ORDER: { id: Stage; label: string }[] = [
  { id: 'arrive', label: 'Arrive' },
  { id: 'separate', label: 'Separate' },
  { id: 'reflect', label: 'Reflect' },
  { id: 'release', label: 'Release' },
  { id: 'reconnect', label: 'Reconnect' },
];

const HOLD_DURATION_MS = 2200;

export const FaithValuesMode = (_props: FaithValuesModeProps) => {
  const [view, setView] = useState<ViewMode>('session');
  const [stage, setStage] = useState<Stage>('lens');
  const [lens, setLens] = useState<GroundingLens | null>(null);

  const [burdenIds, setBurdenIds] = useState<BurdenId[]>([]);
  const [customBurden, setCustomBurden] = useState('');
  const [intensity, setIntensity] = useState<number | null>(null);

  const [controllableItems, setControllableItems] = useState<string[]>([]);
  const [uncontrollableItems, setUncontrollableItems] = useState<string[]>([]);
  const [customControllable, setCustomControllable] = useState('');
  const [customUncontrollable, setCustomUncontrollable] = useState('');

  const [islamicThemeId, setIslamicThemeId] = useState<IslamicThemeId | null>(null);
  const [reflectLoading, setReflectLoading] = useState(false);
  const [reflectError, setReflectError] = useState<string | null>(null);
  const [reflection, setReflection] = useState<{ reflectionText: string; firstQuestion: string; secondQuestion: string; verse?: { reference: string; translation: string; translator: string; scholarReviewed: boolean }; detectedThemes?: string[] } | null>(null);
  const [firstAnswer, setFirstAnswer] = useState('');
  const [secondAnswer, setSecondAnswer] = useState('');
  const [showSecondQuestion, setShowSecondQuestion] = useState(false);

  const [holding, setHolding] = useState(false);
  const [released, setReleased] = useState(false);
  const holdTimeoutRef = useRef<number | null>(null);

  const [sessionDocId, setSessionDocId] = useState<string | null>(null);
  const [chosenNextAction, setChosenNextAction] = useState<NextActionId | null>(null);

  const [sessions, setSessions] = useState<GroundingSessionRecord[]>([]);
  const [sessionsLoaded, setSessionsLoaded] = useState(false);
  const [patternAnalysisEnabled, setPatternAnalysisEnabled] = useState(true);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  // Phase 2's Nova Pattern Engine state. patternFeedback holds only the
  // user-controlled fields (resonates/not_really/paused/suppressed) keyed
  // by patternKey - the core stats (occurrenceCount/status/dates) are
  // never trusted from a stale Firestore read, they're recomputed fresh
  // by computeDerivedPatterns every time sessions changes (see
  // syncReflectionPatterns below).
  const [patternFeedback, setPatternFeedback] = useState<Record<string, PatternFeedbackState>>({});
  const [exploringPattern, setExploringPattern] = useState<DerivedPattern | null>(null);
  const [showCarryingExercise, setShowCarryingExercise] = useState(false);
  const [mostRecentAlignedAction, setMostRecentAlignedAction] = useState<{ id: string; chosenValue: string; nextAlignedAction: string; followUpStatus: string | null; createdAt: string } | null>(null);
  const [allAlignedActions, setAllAlignedActions] = useState<{ chosenValue: string; createdAt: string }[]>([]);

  const loadSessions = async () => {
    if (!auth.currentUser) { setSessionsLoaded(true); return; }
    try {
      const [sessionsSnap, prefSnap, patternsSnap, actionsSnap] = await Promise.all([
        getDocs(query(collection(db, 'users', auth.currentUser.uid, 'grounding_sessions'), orderBy('createdAt', 'desc'), limit(20))),
        getDoc(doc(db, 'users', auth.currentUser.uid, 'preferences', 'grounding')),
        getDocs(collection(db, 'users', auth.currentUser.uid, 'reflection_patterns')),
        getDocs(query(collection(db, 'users', auth.currentUser.uid, 'aligned_actions'), orderBy('createdAt', 'desc'), limit(20))),
      ]);
      setSessions(sessionsSnap.docs.map((d) => ({ id: d.id, ...(d.data() as GroundingSessionRecord) })));
      if (prefSnap.exists() && typeof prefSnap.data()?.patternAnalysisEnabled === 'boolean') {
        setPatternAnalysisEnabled(prefSnap.data()!.patternAnalysisEnabled);
      }
      const feedback: Record<string, PatternFeedbackState> = {};
      patternsSnap.docs.forEach((d) => {
        const data = d.data();
        feedback[d.id] = { userFeedback: data.userFeedback || undefined, paused: data.paused === true, suppressed: data.suppressed === true };
      });
      setPatternFeedback(feedback);
      const actions = actionsSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
      setAllAlignedActions(actions);
      // Only ever surfaced once, and only if genuinely still open - never
      // re-asked once acknowledged, and never for anything older than a
      // few weeks (that's not a gentle follow-up any more, it's a stale one).
      const openAction = actions.find((a) => !a.followUpStatus && (Date.now() - new Date(a.createdAt).getTime()) < 21 * 24 * 60 * 60 * 1000);
      setMostRecentAlignedAction(openAction || null);
    } catch (e) {
      // Leaves the honest empty state in place rather than guessing at history.
    }
    setSessionsLoaded(true);
  };

  useEffect(() => { loadSessions(); }, []);

  const derivedPatterns = useMemo(
    () => (patternAnalysisEnabled ? computeDerivedPatterns(sessions) : []),
    [sessions, patternAnalysisEnabled]
  );

  // "1-3 cards maximum" (brief, section 25) - never paused or suppressed
  // ones, which stay computed (so they can resurface if un-paused) but
  // never rendered.
  const visiblePatterns = useMemo(
    () => derivedPatterns.filter((p) => !patternFeedback[p.patternKey]?.paused && !patternFeedback[p.patternKey]?.suppressed).slice(0, 3),
    [derivedPatterns, patternFeedback]
  );

  const togglePatternAnalysis = (val: boolean) => {
    setPatternAnalysisEnabled(val);
    if (auth.currentUser) {
      setDoc(doc(db, 'users', auth.currentUser.uid, 'preferences', 'grounding'), {
        patternAnalysisEnabled: val,
        updatedAt: new Date().toISOString(),
      }, { merge: true }).catch(() => {});
    }
  };

  // Recomputes reflection_patterns from the actual session history and
  // writes it back, preserving whatever feedback/paused/suppressed state
  // was already there - this collection is a derived cache, not an
  // incrementally-updated counter, so it can never drift out of sync with
  // the sessions it's derived from.
  const syncReflectionPatterns = async (allSessions: GroundingSessionRecord[]) => {
    if (!auth.currentUser || !patternAnalysisEnabled) return;
    const derived = computeDerivedPatterns(allSessions);
    if (derived.length === 0) return;
    try {
      const existingSnap = await getDocs(collection(db, 'users', auth.currentUser.uid, 'reflection_patterns'));
      const existingByKey = new Map(existingSnap.docs.map((d) => [d.id, d.data()]));
      const batch = writeBatch(db);
      const now = new Date().toISOString();
      for (const p of derived) {
        const existing = existingByKey.get(p.patternKey);
        const ref = doc(db, 'users', auth.currentUser.uid, 'reflection_patterns', p.patternKey);
        batch.set(ref, {
          patternKey: p.patternKey,
          category: p.category,
          firstSeenAt: p.firstSeenAt,
          lastSeenAt: p.lastSeenAt,
          occurrenceCount: p.occurrenceCount,
          status: p.status,
          lensAssociations: p.lensAssociations.slice(0, 4),
          ...(existing?.userFeedback ? { userFeedback: existing.userFeedback } : {}),
          ...(existing?.userFeedbackNote ? { userFeedbackNote: existing.userFeedbackNote } : {}),
          ...(existing?.paused === true ? { paused: true } : {}),
          ...(existing?.suppressed === true ? { suppressed: true } : {}),
          createdAt: existing?.createdAt || now,
          updatedAt: now,
        });
      }
      await batch.commit();
      const feedback: Record<string, PatternFeedbackState> = {};
      derived.forEach((p) => {
        const existing = existingByKey.get(p.patternKey);
        feedback[p.patternKey] = { userFeedback: existing?.userFeedback, paused: existing?.paused === true, suppressed: existing?.suppressed === true };
      });
      setPatternFeedback((prev) => ({ ...prev, ...feedback }));
    } catch (e) {
      // Non-fatal - cards just won't reflect the newest session's themes
      // until the next successful sync (e.g. the next Journey view load).
    }
  };

  const handlePatternFeedback = async (patternKey: string, feedback: 'resonates' | 'not_really', note?: string) => {
    setPatternFeedback((prev) => ({ ...prev, [patternKey]: { ...prev[patternKey], userFeedback: feedback, suppressed: feedback === 'not_really' } }));
    logGroundingEvent('pattern_feedback_given', { category: PATTERN_DIMENSIONS[patternKey as keyof typeof PATTERN_DIMENSIONS]?.category });
    if (!auth.currentUser) return;
    const p = derivedPatterns.find((d) => d.patternKey === patternKey);
    if (!p) return;
    const ref = doc(db, 'users', auth.currentUser.uid, 'reflection_patterns', patternKey);
    setDoc(ref, {
      patternKey: p.patternKey, category: p.category, firstSeenAt: p.firstSeenAt, lastSeenAt: p.lastSeenAt,
      occurrenceCount: p.occurrenceCount, status: p.status, lensAssociations: p.lensAssociations.slice(0, 4),
      userFeedback: feedback, suppressed: feedback === 'not_really',
      ...(note ? { userFeedbackNote: note.slice(0, 200) } : {}),
      // Firestore's SDK throws client-side on an explicit `undefined`
      // field value - only ever included when this is genuinely new.
      ...(patternFeedback[patternKey] ? {} : { createdAt: new Date().toISOString() }),
      updatedAt: new Date().toISOString(),
    }, { merge: true }).catch(() => {});
  };

  const handlePausePattern = async (patternKey: string) => {
    setPatternFeedback((prev) => ({ ...prev, [patternKey]: { ...prev[patternKey], paused: true } }));
    if (!auth.currentUser) return;
    const p = derivedPatterns.find((d) => d.patternKey === patternKey);
    if (!p) return;
    setDoc(doc(db, 'users', auth.currentUser.uid, 'reflection_patterns', patternKey), {
      patternKey: p.patternKey, category: p.category, firstSeenAt: p.firstSeenAt, lastSeenAt: p.lastSeenAt,
      occurrenceCount: p.occurrenceCount, status: p.status, lensAssociations: p.lensAssociations.slice(0, 4),
      paused: true,
      // See handlePatternFeedback's identical guard - createdAt is
      // required by firestore.rules on create, and Firestore's SDK
      // throws client-side on an explicit `undefined` value, so it's
      // only ever included when this doc is genuinely new.
      ...(patternFeedback[patternKey] ? {} : { createdAt: new Date().toISOString() }),
      updatedAt: new Date().toISOString(),
    }, { merge: true }).catch(() => {});
  };

  const handleAlignedActionFollowUp = async (status: 'went_well' | 'still_working_on_it' | 'didnt_happen') => {
    if (!mostRecentAlignedAction || !auth.currentUser) return;
    setMostRecentAlignedAction(null);
    updateDoc(doc(db, 'users', auth.currentUser.uid, 'aligned_actions', mostRecentAlignedAction.id), {
      followUpStatus: status, followedUpAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    }).catch(() => {});
    logGroundingEvent('aligned_action_followed_up');
  };

  const resetSession = () => {
    setStage('lens');
    setLens(null);
    setBurdenIds([]);
    setCustomBurden('');
    setIntensity(null);
    setControllableItems([]);
    setUncontrollableItems([]);
    setCustomControllable('');
    setCustomUncontrollable('');
    setIslamicThemeId(null);
    setReflection(null);
    setReflectError(null);
    setFirstAnswer('');
    setSecondAnswer('');
    setShowSecondQuestion(false);
    setHolding(false);
    setReleased(false);
    setSessionDocId(null);
    setChosenNextAction(null);
  };

  const toggleBurden = (id: BurdenId) => {
    setBurdenIds((prev) => (prev.includes(id) ? prev.filter((b) => b !== id) : [...prev, id]));
  };

  const toggleControllable = (item: string) => {
    setControllableItems((prev) => (prev.includes(item) ? prev.filter((i) => i !== item) : [...prev, item]));
  };
  const toggleUncontrollable = (item: string) => {
    setUncontrollableItems((prev) => (prev.includes(item) ? prev.filter((i) => i !== item) : [...prev, item]));
  };
  const addCustomControllable = () => {
    const val = customControllable.trim().slice(0, 60);
    if (val && !controllableItems.includes(val)) setControllableItems((prev) => [...prev, val]);
    setCustomControllable('');
  };
  const addCustomUncontrollable = () => {
    const val = customUncontrollable.trim().slice(0, 60);
    if (val && !uncontrollableItems.includes(val)) setUncontrollableItems((prev) => [...prev, val]);
    setCustomUncontrollable('');
  };

  const callReflect = async () => {
    if (!lens) return;
    setReflectLoading(true);
    setReflectError(null);
    try {
      const body: Record<string, unknown> = {
        lens,
        burdenLabels: burdenIds.map((id) => BURDEN_LABELS[id]),
        controllableItems,
        uncontrollableItems,
      };
      if (customBurden.trim()) body.customBurden = customBurden.trim().slice(0, 80);
      if (lens === 'islamic' && islamicThemeId) body.islamicThemeId = islamicThemeId;
      if (patternAnalysisEnabled && derivedPatterns.length > 0) body.recentPatterns = derivedPatterns.slice(0, 5).map((p) => PATTERN_DIMENSIONS[p.patternKey].label);

      const res = await secureApiFetch('/api/grounding/reflect', { method: 'POST', data: body });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error || 'Could not build that reflection right now.');
      }
      const result = await res.json();
      setReflection(result);
    } catch (e: any) {
      setReflectError(e.message || 'Could not build that reflection right now.');
    } finally {
      setReflectLoading(false);
    }
  };

  useEffect(() => {
    if (stage !== 'reflect' || reflection || reflectLoading) return;
    if (lens === 'islamic' && !islamicThemeId) return; // waits for theme choice first
    callReflect();
  }, [stage, lens, islamicThemeId]);

  const finalizeRelease = async () => {
    if (auth.currentUser && lens) {
      const now = new Date().toISOString();
      const record: Record<string, unknown> = {
        lens, burdenIds, controllableItems, uncontrollableItems, createdAt: now, updatedAt: now,
      };
      if (customBurden.trim()) record.customBurden = customBurden.trim().slice(0, 80);
      if (typeof intensity === 'number') record.intensity = intensity;
      if (lens === 'islamic' && islamicThemeId) record.islamicThemeId = islamicThemeId;
      const answers: ReflectionAnswer[] = [];
      if (reflection && firstAnswer.trim()) answers.push({ question: reflection.firstQuestion, answer: firstAnswer.trim().slice(0, 400) });
      if (reflection && secondAnswer.trim()) answers.push({ question: reflection.secondQuestion, answer: secondAnswer.trim().slice(0, 400) });
      if (answers.length > 0) record.reflectionAnswers = answers;
      if (reflection?.detectedThemes && reflection.detectedThemes.length > 0) record.detectedThemes = reflection.detectedThemes;

      try {
        const ref = await addDoc(collection(db, 'users', auth.currentUser.uid, 'grounding_sessions'), record);
        setSessionDocId(ref.id);
        const updatedSessions = [{ id: ref.id, ...(record as any) }, ...sessions].slice(0, 20);
        setSessions(updatedSessions);
        updateNovaMemoryBySourceAndType('Faith & Values Grounding', 'state', {
          content: `Last grounding session used the ${GROUNDING_LENSES[lens].label} lens. Carrying: ${[...burdenIds.map((id) => BURDEN_LABELS[id]), customBurden].filter(Boolean).join(', ') || 'unspecified'}.`,
          canEdit: false,
          confidence: 'medium',
        });
        logGroundingEvent('grounding_session_completed', { lens });
        // Best-effort, non-blocking - the release/reconnect flow never
        // waits on this, it just keeps the Journey view's pattern cards
        // current for next time.
        syncReflectionPatterns(updatedSessions);
      } catch (e) {
        // Non-fatal - the release still proceeds even if the save failed;
        // the person's experience isn't gated on persistence succeeding.
      }
    }
    setReleased(true);
    setTimeout(() => setStage('reconnect'), 900);
  };

  const onHoldStart = () => {
    if (released) return;
    setHolding(true);
    holdTimeoutRef.current = window.setTimeout(() => { finalizeRelease(); }, HOLD_DURATION_MS);
  };
  const onHoldEnd = () => {
    if (released) return;
    setHolding(false);
    if (holdTimeoutRef.current) { window.clearTimeout(holdTimeoutRef.current); holdTimeoutRef.current = null; }
  };

  const handleNextAction = async (action: NextActionId) => {
    setChosenNextAction(action);
    if (sessionDocId && auth.currentUser) {
      updateDoc(doc(db, 'users', auth.currentUser.uid, 'grounding_sessions', sessionDocId), {
        nextAction: action, updatedAt: new Date().toISOString(),
      }).catch(() => {});
      setSessions((prev) => prev.map((s) => (s.id === sessionDocId ? { ...s, nextAction: action } : s)));
    }
    if (action === 'nova') {
      window.dispatchEvent(new CustomEvent('open_nova_launcher'));
    } else if (action === 'trusted_person') {
      window.dispatchEvent(new CustomEvent('navigate_tab', { detail: 'ally' }));
    } else if (action === 'practical_action') {
      try {
        const res = await secureApiFetch('/api/user/resume-prompt');
        const result = await res.json();
        window.dispatchEvent(new CustomEvent('navigate_tab', { detail: result.hasIncomplete ? result.tab : 'recover' }));
      } catch (e) {
        window.dispatchEvent(new CustomEvent('navigate_tab', { detail: 'recover' }));
      }
    }
  };

  const deleteHistory = async () => {
    if (!auth.currentUser) return;
    try {
      // Clearing pattern history means clearing the DERIVED pattern data
      // too (section 20) - reflection_patterns and aligned_actions only
      // exist as a function of the sessions they were computed from, so
      // leaving them behind after the sessions are gone would strand
      // stale, unexplainable data.
      const [sessionsSnap, patternsSnap, actionsSnap] = await Promise.all([
        getDocs(collection(db, 'users', auth.currentUser.uid, 'grounding_sessions')),
        getDocs(collection(db, 'users', auth.currentUser.uid, 'reflection_patterns')),
        getDocs(collection(db, 'users', auth.currentUser.uid, 'aligned_actions')),
      ]);
      const batch = writeBatch(db);
      sessionsSnap.docs.forEach((d) => batch.delete(d.ref));
      patternsSnap.docs.forEach((d) => batch.delete(d.ref));
      actionsSnap.docs.forEach((d) => batch.delete(d.ref));
      await batch.commit();
      setSessions([]);
      setPatternFeedback({});
      setMostRecentAlignedAction(null);
      setAllAlignedActions([]);
    } catch (e) {
      // Leaves the list as-is if the delete failed - no false "cleared" state.
    }
    setConfirmingDelete(false);
  };

  const canContinueArrive = burdenIds.length > 0 || customBurden.trim().length > 0;
  const canContinueSeparate = controllableItems.length > 0 && uncontrollableItems.length > 0;

  return (
    <div className="space-y-12 pb-24">
      <div className="max-w-4xl">
        <div className="flex items-center gap-4 mb-4">
          <div className="tag">Section 19 / Grounding</div>
          <div className="h-px flex-1 bg-border/40" />
        </div>
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-6">
          <div className="space-y-4">
            <h3 className="text-5xl font-display font-bold text-text-main tracking-tight">Faith & Values Grounding</h3>
            <p className="text-xl text-text-muted font-medium max-w-2xl">
              "Burnout isolates us from our core. Choose the lens through which you want to process your recovery."
            </p>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 bg-surface/30 p-1.5 rounded-2xl border border-border/20 max-w-sm">
        {([['session', 'Ground Yourself'], ['journey', 'Your Grounding Journey']] as [ViewMode, string][]).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setView(id)}
            className={cn(
              'flex-1 py-2.5 px-3 rounded-xl text-xs uppercase font-black tracking-widest transition-all cursor-pointer',
              view === id ? 'bg-white dark:bg-card text-[#9a3412] dark:text-primary shadow-md border border-border/30' : 'text-text-muted hover:text-text-main'
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {view === 'journey' ? (
        <GroundingJourneyView
          sessions={sessions}
          sessionsLoaded={sessionsLoaded}
          visiblePatterns={visiblePatterns}
          patternAnalysisEnabled={patternAnalysisEnabled}
          onTogglePatternAnalysis={togglePatternAnalysis}
          confirmingDelete={confirmingDelete}
          onConfirmingDeleteChange={setConfirmingDelete}
          onDeleteHistory={deleteHistory}
          onStartSession={() => { setView('session'); resetSession(); }}
          onExplorePattern={(p) => { setExploringPattern(p); logGroundingEvent('pattern_explored', { category: p.category }); }}
          onPatternFeedback={handlePatternFeedback}
          onPausePattern={handlePausePattern}
          onOpenCarryingExercise={() => setShowCarryingExercise(true)}
          mostRecentAlignedAction={mostRecentAlignedAction}
          onAlignedActionFollowUp={handleAlignedActionFollowUp}
          allAlignedActions={allAlignedActions}
        />
      ) : (
        <>
          {stage !== 'lens' && lens && (
            <div className="flex items-center justify-between max-w-2xl">
              <div className="flex items-center gap-3">
                {STAGE_ORDER.map((s, idx) => {
                  const currentIdx = STAGE_ORDER.findIndex((x) => x.id === stage);
                  const isDone = idx < currentIdx;
                  const isCurrent = idx === currentIdx;
                  return (
                    <div key={s.id} className="flex items-center gap-2">
                      <div className={cn(
                        'w-2 h-2 rounded-full transition-all',
                        isCurrent ? 'bg-primary scale-125' : isDone ? 'bg-primary/50' : 'bg-border'
                      )} />
                      <span className={cn('text-[10px] uppercase font-black tracking-widest', isCurrent ? 'text-primary' : 'text-text-muted/50')}>
                        {s.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <AnimatePresence mode="wait">
            {stage === 'lens' && (
              <motion.div key="lens" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-6">
                <p className="text-sm text-text-muted max-w-xl">Choose the lens for this session. You can change it any time by starting a new session.</p>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  {GROUNDING_LENS_ORDER.map((id) => {
                    const Icon = LENS_ICONS[id];
                    return (
                      <button
                        key={id}
                        onClick={() => { setLens(id); setStage('arrive'); }}
                        className="p-6 rounded-2xl border border-border/50 hover:border-primary/30 text-left group hover:bg-surface dark:hover:bg-surface transition-all"
                      >
                        <div className="w-10 h-10 rounded-full flex items-center justify-center mb-4 bg-surface dark:bg-surface text-text-muted group-hover:text-primary transition-colors">
                          <Icon className="w-5 h-5" />
                        </div>
                        <h4 className="font-display font-bold text-lg mb-1">{GROUNDING_LENSES[id].label}</h4>
                        <p className="text-xs font-medium leading-relaxed text-text-muted">{GROUNDING_LENSES[id].description}</p>
                      </button>
                    );
                  })}
                </div>
              </motion.div>
            )}

            {stage === 'arrive' && lens && (
              <motion.div key="arrive" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-8 max-w-2xl">
                <h4 className="text-2xl font-display font-bold text-text-main">What are you carrying right now?</h4>
                <div className="flex flex-wrap gap-2">
                  {BURDEN_OPTIONS.map((o) => (
                    <button
                      key={o.id}
                      onClick={() => toggleBurden(o.id)}
                      aria-pressed={burdenIds.includes(o.id)}
                      className={cn(
                        'px-4 py-2.5 rounded-xl text-xs font-bold border transition-all cursor-pointer',
                        burdenIds.includes(o.id) ? 'bg-primary/10 border-primary/45 text-[#9a3412] dark:text-primary' : 'bg-white dark:bg-surface border-border/40 text-text-muted hover:border-border'
                      )}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
                {burdenIds.includes('other') && (
                  <input
                    value={customBurden}
                    onChange={(e) => setCustomBurden(e.target.value.slice(0, 80))}
                    placeholder="In your own words..."
                    className="w-full p-4 rounded-xl border border-border/40 bg-white dark:bg-surface text-sm text-text-main"
                  />
                )}
                <div className="space-y-3">
                  <label className="text-xs font-bold text-text-muted uppercase tracking-wider">How much is this weighing on you right now? (optional)</label>
                  <div className="flex items-center gap-2">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <button
                        key={n}
                        onClick={() => setIntensity(intensity === n ? null : n)}
                        aria-pressed={intensity === n}
                        className={cn(
                          'flex-1 py-3 rounded-xl text-xs font-bold border transition-all cursor-pointer',
                          intensity === n ? 'bg-text-main/10 border-text-main/40 text-text-main' : 'bg-white dark:bg-surface border-border/40 text-text-muted'
                        )}
                      >
                        {n === 1 ? 'A little' : n === 5 ? 'A lot' : n}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex justify-end">
                  <button
                    disabled={!canContinueArrive}
                    onClick={() => setStage('separate')}
                    className="px-6 py-3 bg-primary text-primary-foreground rounded-xl text-xs font-black uppercase tracking-widest flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                  >
                    Continue <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </motion.div>
            )}

            {stage === 'separate' && lens && (
              <motion.div key="separate" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-8 max-w-3xl">
                <div>
                  <h4 className="text-2xl font-display font-bold text-text-main">What belongs to you — and what doesn't?</h4>
                  <p className="text-sm text-text-muted mt-2">Responsible action means doing your part fully, then letting go of what was never yours to carry.</p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-4 bg-surface/20 p-6 rounded-2xl border border-border/20">
                    <h5 className="text-xs font-black uppercase tracking-widest text-text-muted">Within my influence</h5>
                    <div className="flex flex-wrap gap-2">
                      {CONTROLLABLE_EXAMPLES.map((item) => (
                        <button key={item} onClick={() => toggleControllable(item)} aria-pressed={controllableItems.includes(item)}
                          className={cn('px-3 py-2 rounded-lg text-xs font-bold border transition-all cursor-pointer',
                            controllableItems.includes(item) ? 'bg-primary/10 border-primary/45 text-[#9a3412] dark:text-primary' : 'bg-white dark:bg-surface border-border/40 text-text-muted')}>
                          {item}
                        </button>
                      ))}
                      {controllableItems.filter((i) => !CONTROLLABLE_EXAMPLES.includes(i)).map((item) => (
                        <button key={item} onClick={() => toggleControllable(item)} className="px-3 py-2 rounded-lg text-xs font-bold border bg-primary/10 border-primary/45 text-[#9a3412] dark:text-primary flex items-center gap-1">
                          {item} <X className="w-3 h-3" />
                        </button>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <input value={customControllable} onChange={(e) => setCustomControllable(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && addCustomControllable()}
                        placeholder="Add your own..." className="flex-1 p-2.5 rounded-lg border border-border/40 bg-white dark:bg-surface text-xs" />
                      <button onClick={addCustomControllable} className="p-2.5 rounded-lg border border-border/40 text-text-muted hover:text-primary"><Plus className="w-4 h-4" /></button>
                    </div>
                  </div>
                  <div className="space-y-4 bg-surface/20 p-6 rounded-2xl border border-border/20">
                    <h5 className="text-xs font-black uppercase tracking-widest text-text-muted">Beyond my control</h5>
                    <div className="flex flex-wrap gap-2">
                      {UNCONTROLLABLE_EXAMPLES.map((item) => (
                        <button key={item} onClick={() => toggleUncontrollable(item)} aria-pressed={uncontrollableItems.includes(item)}
                          className={cn('px-3 py-2 rounded-lg text-xs font-bold border transition-all cursor-pointer',
                            uncontrollableItems.includes(item) ? 'bg-text-main/10 border-text-main/40 text-text-main' : 'bg-white dark:bg-surface border-border/40 text-text-muted')}>
                          {item}
                        </button>
                      ))}
                      {uncontrollableItems.filter((i) => !UNCONTROLLABLE_EXAMPLES.includes(i)).map((item) => (
                        <button key={item} onClick={() => toggleUncontrollable(item)} className="px-3 py-2 rounded-lg text-xs font-bold border bg-text-main/10 border-text-main/40 text-text-main flex items-center gap-1">
                          {item} <X className="w-3 h-3" />
                        </button>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <input value={customUncontrollable} onChange={(e) => setCustomUncontrollable(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && addCustomUncontrollable()}
                        placeholder="Add your own..." className="flex-1 p-2.5 rounded-lg border border-border/40 bg-white dark:bg-surface text-xs" />
                      <button onClick={addCustomUncontrollable} className="p-2.5 rounded-lg border border-border/40 text-text-muted hover:text-primary"><Plus className="w-4 h-4" /></button>
                    </div>
                  </div>
                </div>
                <div className="flex justify-between">
                  <button onClick={() => setStage('arrive')} className="px-4 py-3 text-text-muted hover:text-text-main text-xs font-black uppercase tracking-widest flex items-center gap-2"><ArrowLeft className="w-4 h-4" /> Back</button>
                  <button disabled={!canContinueSeparate} onClick={() => setStage('reflect')}
                    className="px-6 py-3 bg-primary text-primary-foreground rounded-xl text-xs font-black uppercase tracking-widest flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed transition-all">
                    Continue <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </motion.div>
            )}

            {stage === 'reflect' && lens && (
              <motion.div key="reflect" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-8 max-w-2xl">
                {lens === 'islamic' && !islamicThemeId ? (
                  <div className="space-y-6">
                    <h4 className="text-2xl font-display font-bold text-text-main">Which theme fits where you are?</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {ISLAMIC_THEME_ORDER.map((id) => (
                        <button key={id} onClick={() => setIslamicThemeId(id)}
                          className="p-4 rounded-xl border border-border/40 hover:border-primary/40 text-left bg-white dark:bg-surface transition-all">
                          <h5 className="text-sm font-bold text-text-main">{ISLAMIC_THEMES[id].label}</h5>
                          <p className="text-xs text-text-muted mt-1">{ISLAMIC_THEMES[id].framing}</p>
                        </button>
                      ))}
                    </div>
                    <button onClick={() => setStage('separate')} className="px-4 py-3 text-text-muted hover:text-text-main text-xs font-black uppercase tracking-widest flex items-center gap-2"><ArrowLeft className="w-4 h-4" /> Back</button>
                  </div>
                ) : reflectLoading ? (
                  <div className="flex flex-col items-center justify-center py-16 gap-4">
                    <Loader2 className="w-6 h-6 text-primary animate-spin" />
                    <p className="text-sm text-text-muted">Building your reflection...</p>
                  </div>
                ) : reflectError ? (
                  <div className="space-y-4 bg-destructive/5 border border-destructive/20 p-6 rounded-2xl">
                    <p className="text-sm text-text-main">{reflectError}</p>
                    <button onClick={callReflect} className="px-4 py-2 bg-primary text-primary-foreground rounded-xl text-xs font-black uppercase tracking-widest">Try again</button>
                  </div>
                ) : reflection ? (
                  <div className="space-y-8">
                    {reflection.verse && (
                      <div className="bg-surface/30 p-5 rounded-2xl border border-border/20 space-y-2">
                        <div className="flex items-center gap-2">
                          <BookOpen className="w-3.5 h-3.5 text-primary" />
                          <span className="text-[10px] font-black uppercase tracking-widest text-text-muted">{reflection.verse.reference} · trans. {reflection.verse.translator}</span>
                        </div>
                        <p className="text-sm text-text-main italic">{reflection.verse.translation}</p>
                        {!reflection.verse.scholarReviewed && (
                          <p className="text-[10px] text-text-muted">Given for independent verification · pending scholarly review</p>
                        )}
                      </div>
                    )}
                    <p className="text-lg text-text-main font-medium leading-relaxed">{reflection.reflectionText}</p>
                    <div className="space-y-4">
                      <h5 className="text-sm font-bold text-text-main">{reflection.firstQuestion}</h5>
                      <textarea
                        value={firstAnswer}
                        onChange={(e) => setFirstAnswer(e.target.value.slice(0, 400))}
                        rows={3}
                        placeholder="Take your time..."
                        className="w-full p-4 rounded-xl border border-border/40 bg-white dark:bg-surface text-sm text-text-main"
                      />
                      {!showSecondQuestion && (
                        <div className="flex justify-end">
                          <button onClick={() => setShowSecondQuestion(true)} className="px-6 py-3 bg-primary text-primary-foreground rounded-xl text-xs font-black uppercase tracking-widest flex items-center gap-2">
                            Continue <ArrowRight className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                    </div>
                    {showSecondQuestion && (
                      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
                        <h5 className="text-sm font-bold text-text-main">{reflection.secondQuestion}</h5>
                        <textarea
                          value={secondAnswer}
                          onChange={(e) => setSecondAnswer(e.target.value.slice(0, 400))}
                          rows={3}
                          placeholder="Take your time..."
                          className="w-full p-4 rounded-xl border border-border/40 bg-white dark:bg-surface text-sm text-text-main"
                        />
                        <div className="flex justify-between">
                          <button onClick={() => setStage('separate')} className="px-4 py-3 text-text-muted hover:text-text-main text-xs font-black uppercase tracking-widest flex items-center gap-2"><ArrowLeft className="w-4 h-4" /> Back</button>
                          <button onClick={() => setStage('release')} className="px-6 py-3 bg-primary text-primary-foreground rounded-xl text-xs font-black uppercase tracking-widest flex items-center gap-2">
                            Continue <ArrowRight className="w-4 h-4" />
                          </button>
                        </div>
                      </motion.div>
                    )}
                  </div>
                ) : null}
              </motion.div>
            )}

            {stage === 'release' && lens && (
              <motion.div key="release" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-10 max-w-xl">
                <div className="space-y-6">
                  <div>
                    <p className="text-xs font-black uppercase tracking-widest text-text-muted">I have taken responsibility for:</p>
                    <div className="flex flex-wrap gap-2 mt-2">
                      {controllableItems.map((i) => (
                        <span key={i} className="px-3 py-1.5 rounded-lg text-xs font-bold bg-primary/10 text-[#9a3412] dark:text-primary">{i}</span>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="text-xs font-black uppercase tracking-widest text-text-muted">I am releasing:</p>
                    <div className="flex flex-wrap gap-2 mt-2">
                      {uncontrollableItems.map((i) => (
                        <span key={i} className="px-3 py-1.5 rounded-lg text-xs font-bold bg-text-main/10 text-text-main">{i}</span>
                      ))}
                    </div>
                  </div>
                  {lens === 'islamic' && (
                    <p className="text-sm italic text-text-muted border-l-2 border-primary/30 pl-4">
                      I have taken the means available to me. The outcome is not mine to command.
                    </p>
                  )}
                </div>

                <div className="flex flex-col items-center gap-4 py-8">
                  <button
                    onPointerDown={onHoldStart}
                    onPointerUp={onHoldEnd}
                    onPointerLeave={onHoldEnd}
                    disabled={released}
                    className="relative w-40 h-40 rounded-full border-2 border-primary/30 flex items-center justify-center overflow-hidden select-none cursor-pointer disabled:cursor-default"
                  >
                    <div
                      className="absolute inset-0 bg-primary/20 rounded-full origin-bottom"
                      style={{
                        transform: holding || released ? 'scaleY(1)' : 'scaleY(0)',
                        transition: holding ? `transform ${HOLD_DURATION_MS}ms linear` : 'transform 200ms ease-out',
                      }}
                    />
                    <div className="relative z-10 flex flex-col items-center gap-2">
                      {released ? <CheckCircle2 className="w-8 h-8 text-primary" /> : <Hand className="w-8 h-8 text-text-muted" />}
                    </div>
                  </button>
                  <p className="text-sm text-text-muted text-center max-w-xs">
                    {released ? 'Released.' : 'Hold to release what isn\'t yours to carry'}
                  </p>
                </div>

                {lens === 'islamic' && !released && (
                  <p className="text-xs text-text-muted text-center italic">Take a quiet moment for du'a, dhikr, or prayer.</p>
                )}
              </motion.div>
            )}

            {stage === 'reconnect' && (
              <motion.div key="reconnect" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-8 max-w-2xl">
                <div>
                  <h4 className="text-2xl font-display font-bold text-text-main">You don't have to carry everything alone.</h4>
                  <p className="text-sm text-text-muted mt-2">What would support look like now?</p>
                </div>
                {!chosenNextAction ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {NEXT_ACTION_OPTIONS.map((opt) => (
                      <button key={opt.id} onClick={() => handleNextAction(opt.id)}
                        className="p-5 rounded-2xl border border-border/40 hover:border-primary/40 text-left bg-white dark:bg-surface transition-all">
                        <h5 className="text-sm font-bold text-text-main">{opt.label}</h5>
                        <p className="text-xs text-text-muted mt-1">{opt.description}</p>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="bg-success/5 border border-success/20 p-8 rounded-2xl text-center space-y-4">
                    <CheckCircle2 className="w-8 h-8 text-success dark:text-[#4ade80] mx-auto" />
                    <p className="text-sm text-text-muted">
                      {chosenNextAction === 'rest' ? 'That\'s enough for now.' : 'Taking you there now.'}
                    </p>
                    <button onClick={resetSession} className="px-6 py-2.5 border border-border/40 rounded-xl text-xs font-black uppercase tracking-widest text-text-muted hover:text-text-main hover:bg-surface/30 transition-all">
                      Start a new grounding session
                    </button>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </>
      )}

      <div className="bg-surface/30 px-5 py-4 rounded-2xl border border-border/20 flex items-start gap-4 text-left">
        <ShieldCheck className="w-5 h-5 text-text-muted shrink-0 mt-0.5" />
        <div>
          <span className="text-[11px] uppercase font-black tracking-wider text-text-muted">Safe Grounding Boundary</span>
          <p className="text-xs text-text-muted leading-relaxed mt-0.5">
            This is reflection and grounding support, not diagnosis or professional treatment. It never suggests that hardship, abuse, or unsafe conditions should simply be endured as a matter of faith.
          </p>
        </div>
      </div>

      {exploringPattern && (
        <GroundingExploreThis
          pattern={exploringPattern}
          lens={lens || 'secular'}
          onClose={() => setExploringPattern(null)}
        />
      )}
      {showCarryingExercise && (
        <GroundingCarryingExercise onClose={() => setShowCarryingExercise(false)} />
      )}
    </div>
  );
};

const GroundingJourneyView = ({
  sessions, sessionsLoaded, visiblePatterns, patternAnalysisEnabled, onTogglePatternAnalysis,
  confirmingDelete, onConfirmingDeleteChange, onDeleteHistory, onStartSession,
  onExplorePattern, onPatternFeedback, onPausePattern, onOpenCarryingExercise,
  mostRecentAlignedAction, onAlignedActionFollowUp, allAlignedActions,
}: {
  sessions: GroundingSessionRecord[];
  sessionsLoaded: boolean;
  visiblePatterns: DerivedPattern[];
  patternAnalysisEnabled: boolean;
  onTogglePatternAnalysis: (v: boolean) => void;
  confirmingDelete: boolean;
  onConfirmingDeleteChange: (v: boolean) => void;
  onDeleteHistory: () => void;
  onStartSession: () => void;
  onExplorePattern: (p: DerivedPattern) => void;
  onPatternFeedback: (patternKey: string, feedback: 'resonates' | 'not_really', note?: string) => void;
  onPausePattern: (patternKey: string) => void;
  onOpenCarryingExercise: () => void;
  mostRecentAlignedAction: { id: string; chosenValue: string; nextAlignedAction: string } | null;
  onAlignedActionFollowUp: (status: 'went_well' | 'still_working_on_it' | 'didnt_happen') => void;
  allAlignedActions: { chosenValue: string; createdAt: string }[];
}) => {
  const [notRelevantNoteFor, setNotRelevantNoteFor] = useState<string | null>(null);
  const [notRelevantNote, setNotRelevantNote] = useState('');

  if (!sessionsLoaded) {
    return <div className="py-16 text-center text-sm text-text-muted">Loading your grounding journey...</div>;
  }

  if (sessions.length === 0) {
    return (
      <div className="py-16 text-center space-y-4 max-w-md mx-auto">
        <Sparkles className="w-8 h-8 text-primary mx-auto" />
        <h4 className="text-lg font-display font-bold text-text-main">Your journey will take shape here</h4>
        <p className="text-sm text-text-muted leading-relaxed">
          As you use Grounding, Nova can help you notice themes that return over time. Nothing needs to be solved today.
        </p>
        <button onClick={onStartSession} className="px-6 py-3 bg-primary text-primary-foreground rounded-xl text-xs font-black uppercase tracking-widest">
          Begin a grounding reflection
        </button>
      </div>
    );
  }

  const valuesReturnedTo = [...new Set(allAlignedActions.map((a) => a.chosenValue))].slice(0, 8);
  const burdensCarried = [...new Set(sessions.flatMap((s) => [...s.burdenIds.map((id) => BURDEN_LABELS[id]), s.customBurden]).filter(Boolean))].slice(0, 10) as string[];

  // Section 11's Reflection Timeline - grouped by calendar month, capped
  // to the 3 most recent months with any activity so this stays a calm
  // overview rather than a full historical dump ("do not overwhelm users
  // with every historical insight", section 25).
  const monthKey = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  const monthOrder: string[] = [];
  const monthData: Record<string, { themes: Set<string>; approaches: Set<string>; released: Set<string> }> = {};
  for (const s of sessions) {
    const key = monthKey(s.createdAt);
    if (!monthData[key]) { monthData[key] = { themes: new Set(), approaches: new Set(), released: new Set() }; monthOrder.push(key); }
    [...s.burdenIds.map((id) => BURDEN_LABELS[id]), s.customBurden].filter(Boolean).forEach((t) => monthData[key]!.themes.add(t as string));
    if (s.islamicThemeId) monthData[key]!.approaches.add(ISLAMIC_THEMES[s.islamicThemeId].label);
    if (s.nextAction === 'trusted_person') monthData[key]!.approaches.add('Talking to someone');
    if (s.nextAction === 'practical_action') monthData[key]!.approaches.add('Taking one practical action');
    s.uncontrollableItems.forEach((i) => monthData[key]!.released.add(i));
  }
  const uniqueMonths = [...new Set(monthOrder)].slice(0, 3);

  return (
    <div className="space-y-8 max-w-3xl">
      {mostRecentAlignedAction && (
        <div className="p-5 rounded-2xl border border-primary/20 bg-primary/5 space-y-3">
          <p className="text-sm text-text-main">
            Last time you chose <span className="font-bold">{mostRecentAlignedAction.chosenValue}</span> and wanted to: "{mostRecentAlignedAction.nextAlignedAction}". How did that go?
          </p>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => onAlignedActionFollowUp('went_well')} className="px-3 py-1.5 rounded-lg text-[11px] font-black uppercase tracking-wider bg-primary/10 text-[#9a3412] dark:text-primary">Went well</button>
            <button onClick={() => onAlignedActionFollowUp('still_working_on_it')} className="px-3 py-1.5 rounded-lg text-[11px] font-black uppercase tracking-wider border border-border/40 text-text-muted">Still working on it</button>
            <button onClick={() => onAlignedActionFollowUp('didnt_happen')} className="px-3 py-1.5 rounded-lg text-[11px] font-black uppercase tracking-wider border border-border/40 text-text-muted">Didn't happen</button>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between p-4 bg-surface/20 rounded-2xl border border-border/20">
        <div>
          <p className="text-xs font-bold text-text-main">Allow Nova to notice patterns in my reflections</p>
          <p className="text-[11px] text-text-muted mt-0.5">
            When enabled, Nova can use themes from your grounding sessions to help you notice patterns over time. Your private reflections are never posted to the community.
          </p>
        </div>
        <button
          onClick={() => onTogglePatternAnalysis(!patternAnalysisEnabled)}
          role="switch"
          aria-checked={patternAnalysisEnabled}
          className={cn('px-3 py-1.5 rounded-lg text-[11px] font-black uppercase tracking-wider border transition-all shrink-0',
            patternAnalysisEnabled ? 'bg-text-main text-background border-text-main' : 'bg-transparent text-text-muted border-border/40')}
        >
          {patternAnalysisEnabled ? 'On' : 'Off'}
        </button>
      </div>

      {burdensCarried.length > 0 && (
        <div className="space-y-3">
          <h4 className="text-xs uppercase font-black tracking-widest text-text-muted">What you've been carrying</h4>
          <div className="flex flex-wrap gap-2">
            {burdensCarried.map((b) => (
              <span key={b} className="px-3 py-1.5 rounded-lg text-xs font-bold bg-surface text-text-muted">{b}</span>
            ))}
          </div>
        </div>
      )}

      {patternAnalysisEnabled && visiblePatterns.length > 0 && (
        <div className="space-y-4">
          <h4 className="text-xs uppercase font-black tracking-widest text-text-muted">Patterns Nova has noticed</h4>
          {visiblePatterns.map((p) => {
            const dimension = PATTERN_DIMENSIONS[p.patternKey];
            return (
              <div key={p.patternKey} className="bg-surface dark:bg-surface p-6 rounded-2xl border border-border/40 space-y-3">
                <div className="flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-primary" />
                  <span className="text-[11px] uppercase font-black tracking-wider text-[#9a3412] dark:text-primary">{dimension.label}</span>
                  <span className="text-[10px] text-text-muted ml-auto">Appeared in {p.occurrenceCount} reflections</span>
                </div>
                <p className="text-xs text-text-muted italic">{CONFIDENCE_COPY[p.status]}</p>
                <p className="text-sm text-text-main">{dimension.description}</p>
                <div className="flex flex-wrap items-center gap-2 pt-2">
                  <button onClick={() => onExplorePattern(p)} className="px-4 py-2 bg-primary/10 text-[#9a3412] dark:text-primary rounded-xl text-[11px] font-black uppercase tracking-widest">
                    Explore this
                  </button>
                  <button onClick={() => onPatternFeedback(p.patternKey, 'resonates')} className="text-[11px] font-bold text-text-muted hover:text-text-main">This resonates</button>
                  <button onClick={() => setNotRelevantNoteFor(notRelevantNoteFor === p.patternKey ? null : p.patternKey)} className="text-[11px] font-bold text-text-muted hover:text-text-main">Not really</button>
                  <button onClick={() => onPausePattern(p.patternKey)} className="text-[11px] font-bold text-text-muted hover:text-text-main">Pause this insight</button>
                </div>
                {notRelevantNoteFor === p.patternKey && (
                  <div className="flex gap-2 pt-1">
                    <input
                      value={notRelevantNote}
                      onChange={(e) => setNotRelevantNote(e.target.value.slice(0, 200))}
                      placeholder="What feels more accurate? (optional)"
                      className="flex-1 p-2.5 rounded-lg border border-border/40 bg-white dark:bg-card text-xs text-text-main"
                    />
                    <button
                      onClick={() => { onPatternFeedback(p.patternKey, 'not_really', notRelevantNote.trim() || undefined); setNotRelevantNoteFor(null); setNotRelevantNote(''); }}
                      className="px-3 py-2 bg-text-main text-background rounded-lg text-[11px] font-black uppercase tracking-wider"
                    >
                      Submit
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {valuesReturnedTo.length > 0 && (
        <div className="space-y-3">
          <h4 className="text-xs uppercase font-black tracking-widest text-text-muted">Values you've returned to</h4>
          <div className="flex flex-wrap gap-2">
            {valuesReturnedTo.map((v) => (
              <span key={v} className="px-3 py-1.5 rounded-lg text-xs font-bold bg-primary/10 text-[#9a3412] dark:text-primary">{v}</span>
            ))}
          </div>
        </div>
      )}

      <div className="p-5 rounded-2xl border border-border/20 bg-white/40 dark:bg-card/40 flex items-center justify-between gap-4">
        <div>
          <h4 className="text-sm font-bold text-text-main">What am I carrying that isn't mine?</h4>
          <p className="text-[11px] text-text-muted mt-0.5">A focused exercise to sort what's genuinely yours from what isn't.</p>
        </div>
        <button onClick={onOpenCarryingExercise} className="px-4 py-2.5 border border-border/40 rounded-xl text-[11px] font-black uppercase tracking-widest text-text-muted hover:text-text-main hover:bg-surface/30 shrink-0">
          Open
        </button>
      </div>

      <div className="space-y-6">
        <h4 className="text-xs uppercase font-black tracking-widest text-text-muted">Looking back</h4>
        {uniqueMonths.map((month) => {
          const data = monthData[month]!;
          return (
            <div key={month} className="p-5 rounded-2xl border border-border/20 bg-white/40 dark:bg-card/40 space-y-3">
              <h5 className="text-sm font-display font-bold text-text-main">{month}</h5>
              {data.themes.size > 0 && (
                <div className="space-y-1.5">
                  <p className="text-[10px] uppercase font-black tracking-wider text-text-muted">Themes you've explored</p>
                  <div className="flex flex-wrap gap-1.5">
                    {[...data.themes].map((t) => <span key={t} className="px-2.5 py-1 rounded-md text-[11px] font-bold bg-surface text-text-muted">{t}</span>)}
                  </div>
                </div>
              )}
              {data.approaches.size > 0 && (
                <div className="space-y-1.5">
                  <p className="text-[10px] uppercase font-black tracking-wider text-text-muted">Grounding approaches that helped</p>
                  <div className="flex flex-wrap gap-1.5">
                    {[...data.approaches].map((a) => <span key={a} className="px-2.5 py-1 rounded-md text-[11px] font-bold bg-primary/10 text-[#9a3412] dark:text-primary">{a}</span>)}
                  </div>
                </div>
              )}
              {data.released.size > 0 && (
                <div className="space-y-1.5">
                  <p className="text-[10px] uppercase font-black tracking-wider text-text-muted">Things you've begun releasing</p>
                  <div className="flex flex-wrap gap-1.5">
                    {[...data.released].map((r) => <span key={r} className="px-2.5 py-1 rounded-md text-[11px] font-bold bg-text-main/10 text-text-main">{r}</span>)}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="pt-4 border-t border-border/20">
        {!confirmingDelete ? (
          <button onClick={() => onConfirmingDeleteChange(true)} className="text-xs font-bold text-text-muted hover:text-destructive flex items-center gap-1.5">
            <Trash2 className="w-3.5 h-3.5" /> Delete my grounding history
          </button>
        ) : (
          <div className="flex items-center gap-3">
            <span className="text-xs text-text-main">This can't be undone. Delete all grounding history?</span>
            <button onClick={onDeleteHistory} className="px-3 py-1.5 bg-destructive text-destructive-foreground rounded-lg text-[11px] font-black uppercase tracking-wider">Delete</button>
            <button onClick={() => onConfirmingDeleteChange(false)} className="px-3 py-1.5 border border-border/40 rounded-lg text-[11px] font-black uppercase tracking-wider text-text-muted">Cancel</button>
          </div>
        )}
      </div>
    </div>
  );
};
