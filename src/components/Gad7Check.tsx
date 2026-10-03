import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  HeartPulse, ArrowRight, ArrowLeft, LifeBuoy, Lock, Loader2, ChevronDown, X,
} from 'lucide-react';
import { cn } from '../lib/utils';
import { auth } from '../lib/firebase';
import { secureApiFetch } from '../lib/secure-api';
import { updateNovaMemoryBySourceAndType } from '../lib/nova-brain';
import { loadRecentAnxietyResetSessions } from '../lib/anxiety-reset-service';
import {
  GAD7_QUESTIONS, GAD7_OPTIONS, GAD7_TIMEFRAME,
  GAD7_IMPAIRMENT_QUESTION, GAD7_IMPAIRMENT_OPTIONS,
  Gad7Result,
  GAD7_NOT_A_DIAGNOSIS_LINE, GAD7_SCOPE_LIMITATION, GAD7_WHAT_THIS_MEANS, GAD7_WHAT_THIS_DOESNT_TELL_US,
  isGad7Complete,
  compareWithPreviousGad7, Gad7Comparison,
  compareGad7Impairment, buildScoreAndImpairmentNote,
  computeGad7HistoryTrend, Gad7ScoreRecord, GAD7_SNAPSHOT_REMINDER,
  GAD7_PERSISTENT_WORSENING_LINE, GAD7_RECOVERY_LINE, GAD7_RECOVERY_FOLLOWUP_QUESTION,
  GAD7_CONTEXT_TAG_ORDER, GAD7_CONTEXT_TAG_LABELS, GAD7_WHY_NOW_QUESTION, EXCLUSIVE_GAD7_CONTEXT_TAGS, Gad7ContextTag,
  GAD7_REMINDER_CHOICE_ORDER, GAD7_REMINDER_CHOICE_LABELS, Gad7ReminderChoice, GAD7_FORTNIGHTLY_DAYS,
  shouldSuggestAnotherCheckIn,
  ACUTE_SIGNAL_WINDOW_MINUTES, shouldOfferAcuteAnxietyGate,
  GAD7_NEXT_ACTION_ORDER, GAD7_NEXT_ACTION_LABELS, Gad7NextAction,
} from '../../gad7';

interface Gad7CheckProps {
  // Opens the app's crisis-support resources.
  onNeedSupport?: () => void;
  // Routes to another tab (Anxiety Reset for the acute gate, Nova for
  // "Talk it through").
  onNavigate?: (tab: string) => void;
}

type Step = 'intro' | 'acute_gate' | 'quiz' | 'impairment' | 'result' | 'why_now' | 'history' | 'done';

interface HistoryEntry {
  id: string;
  score: number;
  severity: string;
  impairment: number | null;
  contextTags: Gad7ContextTag[];
  createdAt: string;
}

const EMPTY_ANSWERS: number[] = Array(7).fill(-1);

// A fixed, human failure state - never a raw error message, which could
// surface backend/App Check/stack-trace language the spec explicitly bans
// from this screen.
const SAVE_FAILED_MESSAGE = "We couldn't save your check-in just now.";

export const Gad7Check = ({ onNeedSupport, onNavigate }: Gad7CheckProps) => {
  const [step, setStep] = useState<Step>('intro');
  const [whyExpanded, setWhyExpanded] = useState(false);

  const [history, setHistory] = useState<HistoryEntry[] | null>(null);
  const [draftAnswers, setDraftAnswers] = useState<number[] | null>(null);
  const [nextSuggestedAt, setNextSuggestedAt] = useState<string | null>(null);
  const [hasAcuteSignal, setHasAcuteSignal] = useState(false);
  const [acuteGateBypassed, setAcuteGateBypassed] = useState(false);

  const [answers, setAnswers] = useState<number[]>(EMPTY_ANSWERS);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [impairment, setImpairment] = useState<number>(-1);

  const [result, setResult] = useState<(Gad7Result & { id: string }) | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [novaPatternLearningAuthorized, setNovaPatternLearningAuthorized] = useState(false);
  const [contextualTagsAuthorized, setContextualTagsAuthorized] = useState(false);

  const [contextTags, setContextTags] = useState<Gad7ContextTag[]>([]);
  const [pendingAction, setPendingAction] = useState<Gad7NextAction | null>(null);

  const [reminderChoice, setReminderChoice] = useState<Gad7ReminderChoice | null>(null);

  const loadHistory = async () => {
    try {
      const res = await secureApiFetch('/api/wellbeing/gad7', { method: 'GET' });
      if (res.ok) {
        const data = await res.json();
        setHistory(data.assessments || []);
      } else setHistory([]);
    } catch {
      setHistory([]);
    }
  };

  const loadDraft = async () => {
    try {
      const res = await secureApiFetch('/api/wellbeing/gad7/draft', { method: 'GET' });
      if (res.ok) {
        const data = await res.json();
        setDraftAnswers(data.draft?.answers ?? null);
      }
    } catch {
      setDraftAnswers(null);
    }
  };

  const loadReminder = async () => {
    try {
      const res = await secureApiFetch('/api/wellbeing/gad7/reminder', { method: 'GET' });
      if (res.ok) {
        const data = await res.json();
        setNextSuggestedAt(data.nextSuggestedAt ?? null);
      }
    } catch {
      setNextSuggestedAt(null);
    }
  };

  // ACUTE ANXIETY GATE: a real, recent Anxiety Reset use - never a guess -
  // within the last ACUTE_SIGNAL_WINDOW_MINUTES.
  const checkAcuteSignal = async () => {
    if (!auth.currentUser) return;
    try {
      const sessions = await loadRecentAnxietyResetSessions(auth.currentUser.uid);
      const recent = sessions.some(
        (s) => Date.now() - Date.parse(s.createdAt) <= ACUTE_SIGNAL_WINDOW_MINUTES * 60 * 1000
      );
      setHasAcuteSignal(shouldOfferAcuteAnxietyGate({ recentAnxietyResetSession: recent }));
    } catch {
      setHasAcuteSignal(false);
    }
  };

  useEffect(() => {
    const load = async () => {
      await Promise.all([loadHistory(), loadDraft(), loadReminder(), checkAcuteSignal()]);
    };
    load();
  }, []);

  const sortedHistory = useMemo(
    () => (history ? history.slice().sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)) : []),
    [history]
  );
  const previous = sortedHistory[0] ?? null;

  const saveDraft = async (nextAnswers: number[], nextImpairment: number) => {
    try {
      await secureApiFetch('/api/wellbeing/gad7/draft', {
        method: 'PUT',
        data: { answers: nextAnswers, impairment: nextImpairment >= 0 ? nextImpairment : null },
      });
    } catch {
      // Draft saving is best-effort - losing a resume point is not a
      // reason to interrupt someone mid check-in with an error.
    }
  };

  const startFresh = () => {
    setAnswers(EMPTY_ANSWERS);
    setQuestionIndex(0);
    setImpairment(-1);
    setDraftAnswers(null);
  };

  const beginCheckIn = (resume: boolean) => {
    if (resume && draftAnswers) {
      setAnswers(draftAnswers);
      const firstUnanswered = draftAnswers.findIndex((a) => a < 0);
      setQuestionIndex(firstUnanswered >= 0 ? firstUnanswered : 6);
    } else {
      startFresh();
    }
    if (hasAcuteSignal && !acuteGateBypassed) {
      setStep('acute_gate');
    } else {
      setStep('quiz');
    }
  };

  const answerQuestion = (value: number) => {
    const next = answers.map((a, i) => (i === questionIndex ? value : a));
    setAnswers(next);
    saveDraft(next, impairment);
    if (questionIndex >= GAD7_QUESTIONS.length - 1) {
      setStep('impairment');
    } else {
      setQuestionIndex((i) => i + 1);
    }
  };

  const backFromQuiz = () => {
    if (questionIndex === 0) {
      setStep('intro');
    } else {
      setQuestionIndex((i) => i - 1);
    }
  };

  const finalize = async (finalImpairment: number) => {
    if (!isGad7Complete(answers)) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await secureApiFetch('/api/wellbeing/gad7', {
        method: 'POST',
        data: { answers, impairment: finalImpairment >= 0 ? finalImpairment : null },
      });
      const data = await res.json();
      if (!res.ok) throw new Error('save_failed');
      setResult({ id: data.id, score: data.score, severity: data.severity, severityLabel: data.severityLabel, summary: data.summary, suggestsSupport: data.suggestsSupport });
      setDraftAnswers(null);
      setStep('result');
      loadHistory();
    } catch {
      setError(SAVE_FAILED_MESSAGE);
    }
    setSubmitting(false);
  };

  const submitImpairment = (value: number) => {
    setImpairment(value);
    finalize(value);
  };

  const comparison: Gad7Comparison | null = result
    ? compareWithPreviousGad7(result.score, previous?.score ?? null)
    : null;
  const impairmentChange = result ? compareGad7Impairment(impairment >= 0 ? impairment : null, previous?.impairment ?? null) : 'unknown';
  const scoreAndImpairmentNote = comparison ? buildScoreAndImpairmentNote(comparison.direction, impairmentChange) : null;

  const historyTrend = useMemo(() => {
    const records: Gad7ScoreRecord[] = sortedHistory.map((h) => ({ score: h.score, createdAt: h.createdAt }));
    return computeGad7HistoryTrend(records);
  }, [sortedHistory]);

  const toggleContextTag = (tag: Gad7ContextTag) => {
    setContextTags((prev) => {
      if (prev.includes(tag)) return prev.filter((t) => t !== tag);
      if (EXCLUSIVE_GAD7_CONTEXT_TAGS.includes(tag)) return [tag];
      return [...prev.filter((t) => !EXCLUSIVE_GAD7_CONTEXT_TAGS.includes(t)), tag];
    });
  };

  const choosePrivacyAndContinue = () => {
    setStep('why_now');
  };

  const submitWhyNowAndAct = async (skipped: boolean) => {
    if (result && (!skipped && contextTags.length > 0) || novaPatternLearningAuthorized) {
      try {
        await secureApiFetch(`/api/wellbeing/gad7/${result!.id}`, {
          method: 'PATCH',
          data: {
            contextTags: skipped ? [] : contextTags,
            novaPatternLearningAuthorized,
            contextualTagsAuthorized,
          },
        });
      } catch {
        // Best-effort - the completed score itself is already safely saved.
      }
    }
    if (result && novaPatternLearningAuthorized) {
      updateNovaMemoryBySourceAndType('Anxiety Check-in (GAD-7)', 'state', {
        content: `Latest Anxiety Check-in: ${result.score}/21, "${result.severityLabel}" band.${comparison && comparison.direction !== 'unknown' ? ` ${comparison.note}` : ''}`,
        confidence: 'verified',
        canEdit: false,
      });
    }
    runAction(pendingAction);
  };

  const runAction = (action: Gad7NextAction | null) => {
    switch (action) {
      case 'understand_pattern':
      case 'see_what_changed':
        setStep('history');
        return;
      case 'talk_to_nova':
        onNavigate?.('nova');
        return;
      case 'find_support':
        onNeedSupport?.();
        return;
      case 'just_save':
      case 'done_for_now':
      default:
        setStep('done');
        return;
    }
  };

  const saveReminderChoice = async (choice: Gad7ReminderChoice) => {
    setReminderChoice(choice);
    try {
      const res = await secureApiFetch('/api/wellbeing/gad7/reminder', { method: 'PUT', data: { choice } });
      const data = await res.json();
      setNextSuggestedAt(data.nextSuggestedAt ?? null);
    } catch {
      // Reminder preference is a non-essential convenience.
    }
  };

  const reset = () => {
    startFresh();
    setResult(null);
    setError(null);
    setContextTags([]);
    setNovaPatternLearningAuthorized(false);
    setContextualTagsAuthorized(false);
    setPendingAction(null);
    setAcuteGateBypassed(false);
    setStep('intro');
  };

  const progressPct = ((questionIndex + 1) / GAD7_QUESTIONS.length) * 100;

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      {step === 'intro' && (
        <div className="space-y-6">
          <div className="space-y-3">
            <h2 className="text-3xl lg:text-4xl font-display font-bold text-text-main flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center">
                <HeartPulse className="w-6 h-6 text-primary" aria-hidden="true" />
              </div>
              Anxiety Check-in
            </h2>
            <p className="text-text-muted leading-relaxed">How have the last two weeks actually felt?</p>
            <p className="text-sm text-text-muted leading-relaxed">
              A short, private check-in using the established GAD-7 questionnaire. It can help you notice changes
              in anxiety symptoms over time. It cannot diagnose an anxiety disorder.
            </p>
            <p className="text-xs text-text-muted flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              Private to you. Your answers and scores are never shown to your employer or anyone else.
            </p>
            <button
              onClick={() => setWhyExpanded((v) => !v)}
              aria-expanded={whyExpanded}
              className="inline-flex items-center gap-1 text-xs font-bold text-primary hover:underline"
            >
              Why am I doing this? <ChevronDown className={cn('w-3.5 h-3.5 transition-transform', whyExpanded && 'rotate-180')} aria-hidden="true" />
            </button>
            {whyExpanded && (
              <p className="text-xs text-text-muted leading-relaxed max-w-md">
                Sometimes change happens gradually enough that it's difficult to notice. Repeating the same
                check-in over time can help you see whether things are easing, staying similar or becoming harder.
              </p>
            )}
          </div>

          {previous && (
            <div className="card p-5 flex items-center justify-between gap-4">
              <div>
                <p className="text-xs uppercase font-bold tracking-widest text-text-muted">Your last check-in</p>
                <p className="text-2xl font-display font-bold text-text-main mt-1">
                  {previous.score}<span className="text-sm font-normal text-text-muted">/21</span>
                </p>
              </div>
              <span className="text-xs text-text-muted">{new Date(previous.createdAt).toLocaleDateString()}</span>
            </div>
          )}

          {nextSuggestedAt && shouldSuggestAnotherCheckIn(nextSuggestedAt) && (
            <p className="text-xs text-text-muted">It's been a little while since your last check-in, if you'd like to do another.</p>
          )}

          <div className="card p-6 space-y-4">
            <p className="text-xs uppercase font-bold tracking-widest text-text-muted">About 1 minute</p>
            {draftAnswers ? (
              <div className="space-y-3">
                <p className="text-sm text-text-main leading-relaxed">You have a check-in in progress.</p>
                <div className="flex items-center gap-4">
                  <button onClick={() => beginCheckIn(true)} className="btn-primary py-3 px-6 inline-flex items-center gap-2">
                    Continue Check-in <ArrowRight className="w-4 h-4" aria-hidden="true" />
                  </button>
                  <button onClick={() => beginCheckIn(false)} className="text-sm font-bold text-text-muted hover:text-text-main">
                    Start over
                  </button>
                </div>
              </div>
            ) : (
              <button onClick={() => beginCheckIn(false)} className="btn-primary py-3 px-6 inline-flex items-center gap-2">
                Start Check-in <ArrowRight className="w-4 h-4" aria-hidden="true" />
              </button>
            )}
          </div>
        </div>
      )}

      {step === 'acute_gate' && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="card p-6 space-y-5 text-center">
          <p className="text-lg font-display font-bold text-text-main">You don't need to measure this in the middle of a difficult moment.</p>
          <p className="text-sm text-text-muted">Let's help with right now first.</p>
          <div className="flex flex-col items-center gap-3">
            <button onClick={() => onNavigate?.('anxiety_reset')} className="btn-primary py-3 px-6">Start Anxiety Reset</button>
            <button
              onClick={() => { setAcuteGateBypassed(true); setStep('quiz'); }}
              className="text-sm font-bold text-text-muted hover:text-text-main"
            >
              Continue Check-in Anyway
            </button>
          </div>
        </motion.div>
      )}

      {step === 'quiz' && (
        <div className="space-y-6">
          <div className="space-y-2">
            <div
              role="progressbar"
              aria-valuenow={questionIndex + 1}
              aria-valuemin={1}
              aria-valuemax={GAD7_QUESTIONS.length}
              aria-label={`Question ${questionIndex + 1} of ${GAD7_QUESTIONS.length}`}
              className="h-1.5 rounded-full bg-border overflow-hidden"
            >
              <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${progressPct}%` }} />
            </div>
            <p className="text-xs font-bold text-text-muted">{questionIndex + 1} of {GAD7_QUESTIONS.length}</p>
          </div>

          <AnimatePresence mode="wait">
            <motion.div
              key={questionIndex}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="card p-6 space-y-4"
            >
              <p className="text-xs font-bold text-text-muted">{GAD7_TIMEFRAME}, how often have you been bothered by…</p>
              <h3 className="text-xl font-display font-bold text-text-main">{GAD7_QUESTIONS[questionIndex]}</h3>
              <div className="grid grid-cols-1 gap-2.5" role="radiogroup" aria-label={GAD7_QUESTIONS[questionIndex]}>
                {GAD7_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    role="radio"
                    aria-checked={answers[questionIndex] === opt.value}
                    onClick={() => answerQuestion(opt.value)}
                    className={cn(
                      'text-left text-sm rounded-xl border px-4 py-3.5 transition-colors focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none',
                      answers[questionIndex] === opt.value ? 'border-primary bg-primary/10 text-text-main font-bold' : 'border-border text-text-muted hover:border-primary/40'
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </motion.div>
          </AnimatePresence>

          <div className="flex items-center justify-between">
            <button onClick={backFromQuiz} className="inline-flex items-center gap-2 text-sm font-bold text-text-muted hover:text-text-main">
              <ArrowLeft className="w-4 h-4" aria-hidden="true" /> Back
            </button>
            <button onClick={() => setStep('intro')} className="inline-flex items-center gap-1.5 text-sm font-bold text-text-muted hover:text-text-main">
              <X className="w-4 h-4" aria-hidden="true" /> Exit
            </button>
          </div>
        </div>
      )}

      {step === 'impairment' && (
        <div className="space-y-6">
          <div className="card p-6 space-y-4">
            <p className="text-xs font-bold text-text-muted">One more, optional</p>
            <h3 className="text-lg font-display font-bold text-text-main">{GAD7_IMPAIRMENT_QUESTION}</h3>
            <div className="grid grid-cols-1 gap-2.5" role="radiogroup" aria-label="Functional impairment">
              {GAD7_IMPAIRMENT_OPTIONS.map((label, i) => (
                <button
                  key={i}
                  role="radio"
                  aria-checked={impairment === i}
                  onClick={() => submitImpairment(i)}
                  disabled={submitting}
                  className="text-left text-sm rounded-xl border border-border px-4 py-3.5 text-text-muted hover:border-primary/40 transition-colors focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none disabled:opacity-50"
                >
                  {label}
                </button>
              ))}
            </div>
            <button onClick={() => submitImpairment(-1)} disabled={submitting} className="text-sm font-bold text-text-muted hover:text-text-main disabled:opacity-50">
              Skip this question
            </button>
            {submitting && <p className="text-xs text-text-muted flex items-center gap-1.5"><Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" /> Saving…</p>}
            {error && (
              <div role="alert" className="space-y-2 pt-1">
                <p className="text-sm text-destructive dark:text-[#f87171]">{error}</p>
                <p className="text-xs text-text-muted">Your answers haven't been submitted.</p>
                <div className="flex gap-3">
                  <button onClick={() => finalize(impairment)} className="text-sm font-bold text-primary hover:underline">Try Again</button>
                  <button onClick={() => setStep('intro')} className="text-sm font-bold text-text-muted hover:text-text-main">Keep My Answers and Try Later</button>
                </div>
              </div>
            )}
          </div>
          <button onClick={() => setStep('quiz')} className="inline-flex items-center gap-2 text-sm font-bold text-text-muted hover:text-text-main">
            <ArrowLeft className="w-4 h-4" aria-hidden="true" /> Back
          </button>
        </div>
      )}

      {step === 'result' && result && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
          <div className="card p-6 text-center space-y-3">
            <p className="text-xs uppercase font-bold tracking-widest text-text-muted">Your Check-in</p>
            <p className="text-sm font-bold text-text-muted">Your score today</p>
            <p className="text-5xl font-display font-bold text-text-main">{result.score}<span className="text-lg font-normal text-text-muted">/21</span></p>
            <p className="text-base font-bold text-text-main">{result.severityLabel}</p>
            <p className="text-sm text-text-muted leading-relaxed max-w-md mx-auto">{result.summary}</p>
            <p className="text-sm font-bold text-text-main">{GAD7_NOT_A_DIAGNOSIS_LINE}</p>
          </div>

          <div className="card p-5 space-y-2">
            <p className="text-xs uppercase font-bold tracking-widest text-text-muted">What this means</p>
            <p className="text-sm text-text-muted leading-relaxed">{GAD7_WHAT_THIS_MEANS}</p>
            <p className="text-xs uppercase font-bold tracking-widest text-text-muted pt-2">What this doesn't tell us</p>
            <p className="text-sm text-text-muted leading-relaxed">{GAD7_WHAT_THIS_DOESNT_TELL_US}</p>
            <p className="text-xs text-text-muted leading-relaxed pt-1">{GAD7_SCOPE_LIMITATION}</p>
          </div>

          {impairment >= 0 && (
            <div className="card p-5 space-y-1">
              <p className="text-xs uppercase font-bold tracking-widest text-text-muted">Everyday impact</p>
              <p className="text-sm font-bold text-text-main">{GAD7_IMPAIRMENT_OPTIONS[impairment]}</p>
            </div>
          )}

          {comparison && comparison.direction !== 'unknown' && (
            <div className="card p-5 space-y-2">
              <p className="text-xs uppercase font-bold tracking-widest text-text-muted">Compared with your last check-in</p>
              <div className="flex items-center gap-6">
                <div><p className="text-xs text-text-muted">Previous</p><p className="text-xl font-display font-bold text-text-main">{comparison.previousScore}</p></div>
                <div><p className="text-xs text-text-muted">Today</p><p className="text-xl font-display font-bold text-text-main">{comparison.currentScore}</p></div>
              </div>
              <p className="text-sm text-text-muted">{comparison.note}</p>
              {scoreAndImpairmentNote && <p className="text-sm text-text-muted">{scoreAndImpairmentNote}</p>}
            </div>
          )}

          {result.suggestsSupport && (
            <div className="card p-6 border border-primary/20 bg-primary/5 space-y-4">
              <div className="flex items-start gap-3">
                <LifeBuoy className="w-5 h-5 text-primary shrink-0 mt-0.5" aria-hidden="true" />
                <div>
                  <p className="text-sm font-bold text-text-main">It might help to talk to someone.</p>
                  <p className="text-sm text-text-muted leading-relaxed mt-1">
                    A score at this level is a common point where speaking with a GP or a mental-health professional
                    genuinely helps. This check isn't a diagnosis - but you don't have to sit with this alone.
                  </p>
                </div>
              </div>
            </div>
          )}

          <div className="card p-5 space-y-3">
            <p className="text-xs uppercase font-bold tracking-widest text-text-muted">How Blaze Break can use this</p>
            <label className="flex items-start gap-2.5 text-sm text-text-main cursor-pointer">
              <input type="checkbox" checked={novaPatternLearningAuthorized} onChange={(e) => setNovaPatternLearningAuthorized(e.target.checked)} className="mt-0.5" />
              Allow Nova to use this result when noticing patterns
            </label>
            <label className="flex items-start gap-2.5 text-sm text-text-main cursor-pointer">
              <input type="checkbox" checked={contextualTagsAuthorized} onChange={(e) => setContextualTagsAuthorized(e.target.checked)} className="mt-0.5" />
              Allow my contextual answers to inform Nova
            </label>
          </div>

          <div className="space-y-3">
            <p className="text-sm font-bold text-text-main">What would you like to do with this?</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {GAD7_NEXT_ACTION_ORDER.map((action) => (
                <button
                  key={action}
                  onClick={() => { setPendingAction(action); choosePrivacyAndContinue(); }}
                  className="text-left text-sm rounded-xl border border-border px-4 py-3 text-text-main hover:border-primary/40 transition-colors"
                >
                  {GAD7_NEXT_ACTION_LABELS[action]}
                </button>
              ))}
            </div>
          </div>
        </motion.div>
      )}

      {step === 'why_now' && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="card p-6 space-y-4">
          <h3 className="text-lg font-display font-bold text-text-main">{GAD7_WHY_NOW_QUESTION}</h3>
          <p className="text-xs text-text-muted">This is optional, and it isn't part of your score.</p>
          <div className="flex flex-wrap gap-2" role="group" aria-label={GAD7_WHY_NOW_QUESTION}>
            {GAD7_CONTEXT_TAG_ORDER.map((tag) => (
              <button
                key={tag}
                onClick={() => toggleContextTag(tag)}
                aria-pressed={contextTags.includes(tag)}
                className={cn(
                  'text-sm rounded-lg border px-3.5 py-2 transition-colors',
                  contextTags.includes(tag) ? 'border-primary bg-primary/10 text-text-main font-bold' : 'border-border text-text-muted hover:border-primary/40'
                )}
              >
                {GAD7_CONTEXT_TAG_LABELS[tag]}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-4 pt-2">
            <button onClick={() => submitWhyNowAndAct(false)} className="btn-primary py-2.5 px-5 text-sm">Continue</button>
            <button onClick={() => submitWhyNowAndAct(true)} className="text-sm font-bold text-text-muted hover:text-text-main">Skip</button>
          </div>
        </motion.div>
      )}

      {step === 'history' && (
        <div className="space-y-6">
          <h3 className="text-xl font-display font-bold text-text-main">Anxiety Check-in History</h3>
          <p className="text-sm text-text-muted">{historyTrend.note} {GAD7_SNAPSHOT_REMINDER}</p>
          {historyTrend.direction === 'trending_higher' && (
            <div className="card p-5 space-y-3 border border-primary/20 bg-primary/5">
              <p className="text-sm text-text-main">{GAD7_PERSISTENT_WORSENING_LINE}</p>
              <div className="flex flex-wrap gap-3">
                <button onClick={() => onNavigate?.('nova')} className="text-sm font-bold text-primary hover:underline">Talk to Nova</button>
                {onNeedSupport && <button onClick={onNeedSupport} className="text-sm font-bold text-primary hover:underline">Find support</button>}
              </div>
            </div>
          )}
          {historyTrend.direction === 'trending_lower' && (
            <div className="card p-5 space-y-2 border border-border">
              <p className="text-sm text-text-main">{GAD7_RECOVERY_LINE}</p>
              <p className="text-sm text-text-muted">{GAD7_RECOVERY_FOLLOWUP_QUESTION}</p>
            </div>
          )}
          <div className="space-y-2">
            {sortedHistory.map((h) => (
              <div key={h.id} className="card p-4 flex items-center justify-between">
                <span className="text-sm text-text-muted">{new Date(h.createdAt).toLocaleDateString()}</span>
                <span className="text-sm font-bold text-text-main">{h.score}/21</span>
              </div>
            ))}
            {sortedHistory.length === 0 && <p className="text-sm text-text-muted">No completed check-ins yet.</p>}
          </div>
          <button onClick={reset} className="btn-secondary py-2.5 px-5 text-sm">Done</button>
        </div>
      )}

      {step === 'done' && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
          <div className="card p-6 text-center space-y-2">
            <p className="text-lg font-bold text-text-main">Check-in saved.</p>
            <p className="text-xs text-text-muted flex items-center justify-center gap-1.5">
              <Lock className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              Saved privately to your account. You can export or delete it any time in Privacy &amp; Trust.
            </p>
          </div>
          <div className="card p-5 space-y-3">
            <p className="text-sm font-bold text-text-main">Want a reminder?</p>
            <div className="flex flex-wrap gap-2">
              {GAD7_REMINDER_CHOICE_ORDER.map((choice) => (
                <button
                  key={choice}
                  onClick={() => saveReminderChoice(choice)}
                  aria-pressed={reminderChoice === choice}
                  className={cn(
                    'text-sm rounded-lg border px-3.5 py-2 transition-colors',
                    reminderChoice === choice ? 'border-primary bg-primary/10 text-text-main font-bold' : 'border-border text-text-muted hover:border-primary/40'
                  )}
                >
                  {GAD7_REMINDER_CHOICE_LABELS[choice]}
                </button>
              ))}
            </div>
            {reminderChoice === 'two_weeks' && <p className="text-xs text-text-muted">We'll suggest another check-in in about {GAD7_FORTNIGHTLY_DAYS} days, next time you open this.</p>}
          </div>
          <button onClick={reset} className="btn-secondary py-2.5 px-5 text-sm">Done</button>
        </motion.div>
      )}
    </div>
  );
};

export default Gad7Check;
