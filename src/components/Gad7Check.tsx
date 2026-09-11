import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { ShieldCheck, HeartPulse, ArrowRight, ArrowLeft, LifeBuoy, TrendingDown, TrendingUp, Minus, Lock, Loader2 } from 'lucide-react';
import { cn } from '../lib/utils';
import { secureApiFetch } from '../lib/secure-api';
import {
  GAD7_QUESTIONS,
  GAD7_OPTIONS,
  GAD7_IMPAIRMENT_QUESTION,
  GAD7_IMPAIRMENT_OPTIONS,
  interpretGad7,
  computeGad7Trend,
  Gad7ScoreRecord,
  Gad7Result,
} from '../../gad7';

interface Gad7CheckProps {
  // Opens the app's crisis-support resources; called from the supportive panel
  // shown on a moderate/severe result.
  onNeedSupport?: () => void;
}

const bandColor: Record<string, string> = {
  minimal: 'text-[#166534] dark:text-[#4ade80]',
  mild: 'text-[#166534] dark:text-[#4ade80]',
  moderate: 'text-[#9a3412] dark:text-warning',
  severe: 'text-destructive dark:text-[#f87171]',
};

export const Gad7Check = ({ onNeedSupport }: Gad7CheckProps) => {
  const [step, setStep] = useState<'intro' | 'quiz' | 'result'>('intro');
  const [answers, setAnswers] = useState<number[]>(Array(7).fill(-1));
  const [impairment, setImpairment] = useState<number>(-1);
  const [result, setResult] = useState<Gad7Result | null>(null);
  const [history, setHistory] = useState<Gad7ScoreRecord[] | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadHistory = async () => {
    try {
      const res = await secureApiFetch('/api/wellbeing/gad7', { method: 'GET' });
      if (res.ok) {
        const data = await res.json();
        setHistory((data.assessments || []).map((a: any) => ({ score: a.score, createdAt: a.createdAt })));
      } else setHistory([]);
    } catch {
      setHistory([]);
    }
  };

  useEffect(() => { loadHistory(); }, []);

  const trend = useMemo(() => (history ? computeGad7Trend(history) : null), [history]);
  const lastScore = history && history.length > 0
    ? history.slice().sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0]
    : null;

  const allAnswered = answers.every((a) => a >= 0);

  const submit = async () => {
    if (!allAnswered) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await secureApiFetch('/api/wellbeing/gad7', {
        method: 'POST',
        data: { answers, impairment: impairment >= 0 ? impairment : null },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not save your check-in.');
      setResult(interpretGad7(data.score));
      setStep('result');
      loadHistory();
    } catch (e: any) {
      setError(e?.message || 'Something went wrong saving your check-in.');
    }
    setSubmitting(false);
  };

  const restart = () => {
    setAnswers(Array(7).fill(-1));
    setImpairment(-1);
    setResult(null);
    setError(null);
    setStep('intro');
  };

  const TrendPill = () =>
    !trend || trend.direction === 'unknown' ? null : (
      <span className={cn('inline-flex items-center gap-1 text-xs font-bold',
        trend.direction === 'improving' ? 'text-[#166534] dark:text-[#4ade80]' :
        trend.direction === 'worsening' ? 'text-destructive dark:text-[#f87171]' : 'text-text-muted')}>
        {trend.direction === 'improving' ? <TrendingDown className="w-3.5 h-3.5" aria-hidden="true" />
          : trend.direction === 'worsening' ? <TrendingUp className="w-3.5 h-3.5" aria-hidden="true" />
          : <Minus className="w-3.5 h-3.5" aria-hidden="true" />}
        {trend.note}
      </span>
    );

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <div className="space-y-3">
        <h2 className="text-3xl lg:text-4xl font-display font-bold text-text-main flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center">
            <HeartPulse className="w-6 h-6 text-primary" aria-hidden="true" />
          </div>
          Anxiety Check-in (GAD-7)
        </h2>
        <p className="text-text-muted leading-relaxed">
          A short, well-established self-check for anxiety symptoms. It's a way to notice how you're
          doing over time — <strong className="text-text-main">it is not a diagnosis</strong>, and only you ever see it.
        </p>
        <p className="text-xs text-text-muted flex items-center gap-1.5">
          <Lock className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          Private to you. Your answers and scores are never shown to your employer or anyone else.
        </p>
      </div>

      {step === 'intro' && (
        <div className="space-y-6">
          {lastScore && (
            <div className="card p-5 flex items-center justify-between gap-4">
              <div>
                <p className="text-xs uppercase font-bold tracking-widest text-text-muted">Your last check-in</p>
                <p className="text-2xl font-display font-bold text-text-main mt-1">
                  {lastScore.score}<span className="text-sm font-normal text-text-muted">/21</span>
                  <span className="text-sm font-bold ml-2 capitalize" >{interpretGad7(lastScore.score).severityLabel}</span>
                </p>
                <div className="mt-1"><TrendPill /></div>
              </div>
              <span className="text-xs text-text-muted">{new Date(lastScore.createdAt).toLocaleDateString()}</span>
            </div>
          )}
          <div className="card p-6 space-y-4">
            <p className="text-sm text-text-main leading-relaxed">
              Over the <strong>last two weeks</strong>, how often have you been bothered by each of a few common
              anxiety symptoms? Seven quick questions, about a minute.
            </p>
            <button onClick={() => setStep('quiz')} className="btn-primary py-3 px-6 inline-flex items-center gap-2">
              Start check-in <ArrowRight className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      )}

      {step === 'quiz' && (
        <div className="space-y-6">
          <p className="text-sm font-medium text-text-muted">Over the last two weeks, how often have you been bothered by…</p>
          {GAD7_QUESTIONS.map((q, qi) => (
            <fieldset key={qi} className="card p-5 space-y-3">
              <legend className="text-sm font-bold text-text-main px-1">{qi + 1}. {q}</legend>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2" role="radiogroup" aria-label={q}>
                {GAD7_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    role="radio"
                    aria-checked={answers[qi] === opt.value}
                    onClick={() => setAnswers((prev) => prev.map((a, i) => (i === qi ? opt.value : a)))}
                    className={cn('text-left text-sm rounded-xl border px-4 py-2.5 transition-colors',
                      answers[qi] === opt.value ? 'border-primary bg-primary/10 text-text-main font-bold' : 'border-border text-text-muted hover:border-primary/40')}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </fieldset>
          ))}

          <fieldset className="card p-5 space-y-3">
            <legend className="text-sm font-bold text-text-main px-1">{GAD7_IMPAIRMENT_QUESTION} <span className="font-normal text-text-muted">(optional)</span></legend>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2" role="radiogroup" aria-label="Functional impairment">
              {GAD7_IMPAIRMENT_OPTIONS.map((label, i) => (
                <button
                  key={i}
                  role="radio"
                  aria-checked={impairment === i}
                  onClick={() => setImpairment(i)}
                  className={cn('text-left text-sm rounded-xl border px-4 py-2.5 transition-colors',
                    impairment === i ? 'border-primary bg-primary/10 text-text-main font-bold' : 'border-border text-text-muted hover:border-primary/40')}
                >
                  {label}
                </button>
              ))}
            </div>
          </fieldset>

          {error && <p role="alert" className="text-sm text-destructive dark:text-[#f87171]">{error}</p>}

          <div className="flex items-center justify-between gap-3">
            <button onClick={() => setStep('intro')} className="inline-flex items-center gap-2 text-sm font-bold text-text-muted hover:text-text-main">
              <ArrowLeft className="w-4 h-4" aria-hidden="true" /> Back
            </button>
            <button
              onClick={submit}
              disabled={!allAnswered || submitting}
              className="btn-primary py-3 px-6 inline-flex items-center gap-2 disabled:opacity-50"
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : null}
              {allAnswered ? 'See my result' : `Answer all 7 (${answers.filter((a) => a >= 0).length}/7)`}
            </button>
          </div>
        </div>
      )}

      {step === 'result' && result && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
          <div className="card p-6 text-center space-y-2">
            <p className="text-xs uppercase font-bold tracking-widest text-text-muted">Your score</p>
            <p className="text-5xl font-display font-bold text-text-main">{result.score}<span className="text-lg font-normal text-text-muted">/21</span></p>
            <p className={cn('text-lg font-bold capitalize', bandColor[result.severity])}>{result.severityLabel}</p>
            <p className="text-sm text-text-muted leading-relaxed max-w-md mx-auto">{result.summary}</p>
            <div className="pt-1"><TrendPill /></div>
          </div>

          {result.suggestsSupport && (
            <div className="card p-6 border border-primary/20 bg-primary/5 space-y-4">
              <div className="flex items-start gap-3">
                <LifeBuoy className="w-5 h-5 text-primary shrink-0 mt-0.5" aria-hidden="true" />
                <div>
                  <p className="text-sm font-bold text-text-main">It might help to talk to someone.</p>
                  <p className="text-sm text-text-muted leading-relaxed mt-1">
                    A score at this level is a common point where speaking with a GP or a mental-health professional
                    genuinely helps. This check isn't a diagnosis — but you don't have to sit with this alone.
                  </p>
                </div>
              </div>
              {onNeedSupport && (
                <button onClick={onNeedSupport} className="btn-primary py-2.5 px-5 inline-flex items-center gap-2 text-sm">
                  <LifeBuoy className="w-4 h-4" aria-hidden="true" /> See support options
                </button>
              )}
            </div>
          )}

          <div className="flex items-center gap-3">
            <button onClick={restart} className="btn-secondary py-2.5 px-5 text-sm">Done</button>
          </div>
          <p className="text-xs text-text-muted flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            Saved privately to your account so you can watch your own trend. You can export or delete it any time in Privacy &amp; Trust.
          </p>
        </motion.div>
      )}
    </div>
  );
};

export default Gad7Check;
