import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Compass, CheckCircle2, Loader2 } from 'lucide-react';
import { auth, db } from '../lib/firebase';
import { collection, doc, setDoc, getDocs, query, orderBy, limit } from 'firebase/firestore';

interface Dimension {
  key: 'demands' | 'control' | 'support' | 'relationships' | 'role' | 'change';
  label: string;
  question: string;
}

const DIMENSIONS: Dimension[] = [
  { key: 'demands', label: 'Demands', question: 'My workload feels manageable, not constantly overwhelming.' },
  { key: 'control', label: 'Control', question: 'I have real say over how and when I do my work.' },
  { key: 'support', label: 'Support', question: 'I get the support I need from my manager and colleagues.' },
  { key: 'relationships', label: 'Relationships', question: 'Working relationships on my team are generally positive.' },
  { key: 'role', label: 'Role', question: "I'm clear on what's expected of me in my role." },
  { key: 'change', label: 'Change', question: 'Changes at work are communicated and managed well.' },
];

export const TeamClimateSurvey = ({ organisationName }: { organisationName?: string }) => {
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [alreadyRespondedRecently, setAlreadyRespondedRecently] = useState(false);
  const [checkingHistory, setCheckingHistory] = useState(true);
  const [justSubmitted, setJustSubmitted] = useState(false);

  useEffect(() => {
    const checkRecent = async () => {
      if (!auth.currentUser) { setCheckingHistory(false); return; }
      try {
        const q = query(
          collection(db, 'users', auth.currentUser.uid, 'climate_survey_responses'),
          orderBy('createdAt', 'desc'), limit(1)
        );
        const snap = await getDocs(q);
        if (!snap.empty) {
          const lastCreatedAt = new Date(snap.docs[0].data().createdAt);
          const daysSince = (Date.now() - lastCreatedAt.getTime()) / (1000 * 60 * 60 * 24);
          if (daysSince < 30) setAlreadyRespondedRecently(true);
        }
      } catch (e) {
        // If this check fails, just let them respond - worst case they
        // submit slightly more often than the intended cadence.
      }
      setCheckingHistory(false);
    };
    checkRecent();
  }, []);

  const allAnswered = DIMENSIONS.every(d => answers[d.key] !== undefined);

  const handleSubmit = async () => {
    if (!auth.currentUser || !allAnswered) return;
    setSubmitting(true);
    setError('');
    try {
      await setDoc(doc(db, 'users', auth.currentUser.uid, 'climate_survey_responses', Date.now().toString()), {
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        demands: answers.demands,
        control: answers.control,
        support: answers.support,
        relationships: answers.relationships,
        role: answers.role,
        change: answers.change,
      });
      setJustSubmitted(true);
    } catch (e) {
      setError('Could not save your responses. Please try again.');
    }
    setSubmitting(false);
  };

  if (checkingHistory) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-5 h-5 animate-spin text-primary" />
      </div>
    );
  }

  if (justSubmitted || alreadyRespondedRecently) {
    return (
      <div className="p-6 rounded-xl bg-success/5 border border-success/20 flex items-start gap-3">
        <CheckCircle2 className="w-5 h-5 text-success shrink-0 mt-0.5" />
        <div>
          <h4 className="text-sm font-bold text-text-main">
            {justSubmitted ? 'Thanks for responding' : "You're up to date"}
          </h4>
          <p className="text-xs text-text-muted mt-1 max-w-md">
            {justSubmitted
              ? 'Your response is included in the next aggregate update — never shown individually, only as part of your team\'s overall averages.'
              : "You've already completed this within the last 30 days. It'll be ready again next month."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-primary/10 border border-primary/20 text-primary flex items-center justify-center shrink-0">
          <Compass className="w-5 h-5" />
        </div>
        <div>
          <h4 className="text-sm font-bold text-text-main">Team Climate Survey</h4>
          <p className="text-xs text-text-muted">
            6 quick questions{organisationName ? ` for ${organisationName}` : ''}. Your individual answers are never shown to anyone — only combined team averages, and only once enough teammates have responded.
          </p>
        </div>
      </div>

      {error && (
        <div className="p-3 bg-destructive/10 border border-destructive/20 text-destructive text-xs rounded-xl">{error}</div>
      )}

      <div className="space-y-5">
        {DIMENSIONS.map(dim => (
          <div key={dim.key} className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-medium uppercase tracking-widest text-text-muted">{dim.label}</span>
            </div>
            <p className="text-sm text-text-main">{dim.question}</p>
            <div className="flex gap-2">
              {[1, 2, 3, 4, 5].map(score => (
                <button
                  key={score}
                  onClick={() => setAnswers(prev => ({ ...prev, [dim.key]: score }))}
                  className={`flex-1 py-2.5 rounded-lg text-xs font-mono font-bold transition-colors border ${
                    answers[dim.key] === score
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-surface border-border text-text-muted hover:border-primary/40'
                  }`}
                >
                  {score}
                </button>
              ))}
            </div>
            <div className="flex justify-between text-[10px] text-text-muted uppercase tracking-wide">
              <span>Strongly disagree</span>
              <span>Strongly agree</span>
            </div>
          </div>
        ))}
      </div>

      <button
        onClick={handleSubmit}
        disabled={!allAnswered || submitting}
        className="w-full py-3 bg-primary hover:opacity-90 text-primary-foreground text-xs font-bold uppercase tracking-widest rounded-xl transition-all disabled:opacity-40 flex items-center justify-center gap-2"
      >
        {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
        Submit Responses
      </button>
    </div>
  );
};
