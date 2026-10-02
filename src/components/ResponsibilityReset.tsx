import { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Scale, Send, ArrowRight, CheckCircle2 } from 'lucide-react';
import { auth } from '../lib/firebase';
import { db } from '../lib/firestore';
import { addDoc, collection } from 'firebase/firestore';
import { secureApiFetch } from '../lib/secure-api';
import { logJourney } from '../lib/nova-brain';
import { useFeatureFlags } from '../lib/feature-flags';

// Responsibility Reset - Notice, Own, Release, Move. A slower, guided
// conversation for sorting what actually happened from what the mind is
// saying about it, what's genuinely someone's to own, what isn't, and one
// controllable next move. Deliberately distinct from BLAME Reset (which
// already owns the name "BLAME" for its own, much shorter 30-90s in-the-
// moment brake): this is a considered practice someone chooses to sit
// with, not a crisis interrupt, so it's a mounted Reset-tab section like
// Recovery Recipes/Grounding, not a modal overlay.
//
// The conversation itself runs through the existing, generic /api/nova/chat
// route (same pattern BLAME Reset's own Locate+Accept exchange already
// uses) - a systemInstruction sent from the client, never persisted
// server-side. Only a structural completion record (duration, turn count,
// whether a structured close was reached) is ever written to Firestore;
// the conversation text and the three closing fields are shown once and
// then discarded, mirroring blame_resets' own "never the content" shape.

interface GeminiHistoryTurn {
  role: 'user' | 'model';
  parts: [{ text: string }];
}

interface ResponsibilityResetSummary {
  owns: string;
  notOwns: string;
  nextMove: string;
}

const MAX_TURNS = 14;

const RESPONSIBILITY_RESET_SYSTEM_INSTRUCTION = `You are Nova, guiding someone through a Responsibility Reset - a slower, honest conversation (not a quick brake) for sorting what actually happened from what their mind is saying about it, what's genuinely theirs to own, what isn't, and one controllable next move. Core rule: investigate before concluding. Never assume they're blameless, and never assume they're entirely at fault - sometimes they really did something wrong, sometimes the blame is exaggerated, sometimes responsibility is shared, sometimes circumstances did the most. Do not turn "I made a mistake" into "it wasn't your fault."

Move the conversation naturally through, one question at a time, never explaining the whole method:
1. Notice what their mind is saying right now - reflect it back plainly before examining it.
2. Help them separate from it gently (e.g. "a thought is happening" vs "this is simply true") without belaboring the wording.
3. Get the actual facts - what happened, what they did, what others did, what's assumption vs known.
4. Test the blame honestly - what evidence supports it, what doesn't fit, is an absolute ("always", "never", "ruined everything") making it bigger than the facts.
5. Sort responsibility into what's genuinely theirs, what's someone else's, what's circumstance, what's still unknown - never force it into a category that doesn't fit.
6. Let them own a real mistake fully without it becoming their identity - a mistake can need repair without defining who they are.
7. Name what isn't theirs to control now, and help them loosen their grip on it without pretending the thought has to vanish.
8. Find one small, genuinely controllable next move - narrow a big answer ("fix my whole life") down to its first real part.

If they're blaming someone else, don't manufacture shared responsibility where none exists, and never pressure forgiveness, contact, or understanding the other person's motives. If they're blaming circumstances, help them separate "what happened to me" from "what's available to me now", without implying they caused what was outside their control.

Style: calm, direct, grounded, conversational - never therapy jargon unless they use it, never a lecture, never more than one question per reply, 2-4 sentences at most. Never say "you did nothing wrong", "you're perfect", "everything happens for a reason", or "you shouldn't feel this way." When responsibility and a next move both feel reasonably clear, say so and let them choose to close out - don't drag it out past that point.`;

type Phase = 'intro' | 'conversation' | 'closing' | 'summary';

interface ResponsibilityResetProps {
  onAwardPoints?: (amount: number, reason: string) => void;
}

export const ResponsibilityReset = ({ onAwardPoints }: ResponsibilityResetProps) => {
  const flags = useFeatureFlags();
  const [phase, setPhase] = useState<Phase>('intro');
  const [history, setHistory] = useState<GeminiHistoryTurn[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [turnCount, setTurnCount] = useState(0);
  const [closeError, setCloseError] = useState(false);
  const [summary, setSummary] = useState<ResponsibilityResetSummary | null>(null);
  const openedAtRef = useRef(0);

  if (!flags.enable_responsibility_reset) return null;

  const resetState = () => {
    setPhase('intro');
    setHistory([]);
    setInput('');
    setError(null);
    setTurnCount(0);
    setCloseError(false);
    setSummary(null);
  };

  const handleBegin = () => {
    setPhase('conversation');
    openedAtRef.current = Date.now();
  };

  const handleSend = async () => {
    const text = input.trim();
    if (!text || sending || turnCount >= MAX_TURNS) return;
    setSending(true);
    setError(null);
    const priorHistory = history;
    setInput('');
    try {
      const response = await secureApiFetch('/api/nova/chat', {
        method: 'POST',
        data: {
          message: text,
          systemInstruction: RESPONSIBILITY_RESET_SYSTEM_INSTRUCTION,
          history: priorHistory,
        },
      });
      const data = await response.json();
      setHistory([
        ...priorHistory,
        { role: 'user', parts: [{ text }] },
        { role: 'model', parts: [{ text: data.text || '' }] },
      ]);
      setTurnCount((c) => c + 1);
    } catch (e) {
      // Never trap someone here on a network blip - they can retry, or
      // close out / leave with whatever's already been said.
      setError("Couldn't reach Nova just now. You can try again, or close out below.");
    }
    setSending(false);
  };

  const recordCompletion = (reachedClose: boolean) => {
    if (turnCount === 0) return; // Nothing happened yet - nothing to record.
    if (onAwardPoints) {
      onAwardPoints(reachedClose ? 20 : 10, reachedClose ? 'Completed a Responsibility Reset' : 'Worked through a Responsibility Reset');
    }
    const elapsed = openedAtRef.current ? Math.round((Date.now() - openedAtRef.current) / 1000) : 0;
    const durationSeconds = Math.min(Math.max(elapsed, 0), 1800);
    if (auth.currentUser) {
      addDoc(collection(db, 'users', auth.currentUser.uid, 'responsibility_resets'), {
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        durationSeconds,
        turnCount,
        reachedClose,
      }).catch(() => {});
      secureApiFetch('/api/user/mark-activity', { method: 'POST', data: { activity: 'responsibilityReset' } }).catch(() => {});
    }
    logJourney('Completed a Responsibility Reset');
  };

  const handleCloseOut = async () => {
    setPhase('closing');
    setCloseError(false);
    try {
      const response = await secureApiFetch('/api/responsibility-reset/close', {
        method: 'POST',
        data: { history },
      });
      const data = await response.json();
      if (typeof data?.owns !== 'string' || typeof data?.notOwns !== 'string' || typeof data?.nextMove !== 'string') {
        throw new Error('Unexpected shape');
      }
      setSummary({ owns: data.owns, notOwns: data.notOwns, nextMove: data.nextMove });
      setPhase('summary');
    } catch (e) {
      // The AI close-out is a refinement, never a gate - a failed summary
      // still lets the person finish and have it count.
      setCloseError(true);
      setPhase('summary');
    }
  };

  const handleDone = (reachedClose: boolean) => {
    recordCompletion(reachedClose);
    resetState();
  };

  const handleLeaveEarly = () => {
    recordCompletion(false);
    resetState();
  };

  const capped = turnCount >= MAX_TURNS;

  return (
    <div className="card border border-border p-6 sm:p-8 space-y-6">
      <div className="flex items-center gap-3">
        <Scale className="w-5 h-5 text-primary" />
        <span className="font-display font-bold text-text-main">Responsibility Reset</span>
      </div>

      <AnimatePresence mode="wait">
        {phase === 'intro' && (
          <motion.div key="intro" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-4">
            <p className="text-xs text-text-muted leading-relaxed">
              A guided conversation for working out what actually happened, what you genuinely own, what isn't yours to carry, and the next move that's actually yours to make - at your own pace, with Nova alongside you.
            </p>
            <button onClick={handleBegin} className="btn-primary py-3 px-6 text-xs font-black uppercase tracking-widest self-start">
              Start Responsibility Reset
            </button>
          </motion.div>
        )}

        {phase === 'conversation' && (
          <motion.div key="conversation" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-4">
            {history.length > 0 && (
              <div className="space-y-2.5 max-h-80 overflow-y-auto custom-scrollbar">
                {history.map((turn, i) => (
                  <div key={i} className={`flex ${turn.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div
                      className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-xs leading-relaxed ${
                        turn.role === 'user'
                          ? 'bg-primary/15 text-text-main rounded-br-sm'
                          : 'bg-surface dark:bg-card/40 border border-border text-text-main rounded-bl-sm'
                      }`}
                    >
                      {turn.parts[0]?.text}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {history.length === 0 && (
              <p className="text-xs text-text-muted">What's going on? Describe it in your own words.</p>
            )}

            {error && <p className="text-xs text-destructive">{error}</p>}

            {!capped ? (
              <div className="flex items-end gap-2">
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                  placeholder="What's going on..."
                  rows={2}
                  disabled={sending}
                  aria-label="Tell Nova what's going on"
                  className="flex-1 bg-surface dark:bg-card/40 border border-border rounded-xl p-3 text-xs text-text-main resize-none focus:outline-none focus:border-primary/40"
                />
                <button
                  onClick={handleSend}
                  disabled={sending || !input.trim()}
                  aria-label="Send"
                  className="p-3 rounded-xl bg-primary text-primary-foreground disabled:opacity-40 transition-opacity shrink-0"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <p className="text-[10px] text-text-muted text-center uppercase tracking-widest font-bold">That's enough for one session</p>
            )}

            <div className="flex flex-wrap items-center gap-4 pt-2 border-t border-border/40">
              {turnCount > 0 && (
                <button onClick={handleCloseOut} className="btn-primary py-3 px-6 text-xs font-black uppercase tracking-widest">
                  Close it out <ArrowRight className="w-4 h-4" />
                </button>
              )}
              <button onClick={handleLeaveEarly} className="text-xs font-black uppercase tracking-widest text-text-muted hover:text-text-main">
                {turnCount > 0 ? "I'm done for now" : 'Not right now'}
              </button>
            </div>
          </motion.div>
        )}

        {phase === 'closing' && (
          <motion.div key="closing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="py-8 text-center">
            <p className="text-xs text-text-muted">Putting that together...</p>
          </motion.div>
        )}

        {phase === 'summary' && (
          <motion.div
            key="summary"
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            role="status"
            aria-live="polite"
            className="space-y-5"
          >
            {summary && !closeError ? (
              <div className="space-y-3">
                <div className="p-4 rounded-xl bg-surface dark:bg-card/40 border border-border">
                  <p className="text-[10px] font-black uppercase tracking-widest text-text-muted mb-1">What's yours</p>
                  <p className="text-sm text-text-main font-medium">{summary.owns}</p>
                </div>
                <div className="p-4 rounded-xl bg-surface dark:bg-card/40 border border-border">
                  <p className="text-[10px] font-black uppercase tracking-widest text-text-muted mb-1">What isn't</p>
                  <p className="text-sm text-text-main font-medium">{summary.notOwns}</p>
                </div>
                <div className="p-4 rounded-xl bg-primary/10 border border-primary/30">
                  <p className="text-[10px] font-black uppercase tracking-widest text-text-muted mb-1">Next controllable move</p>
                  <p className="text-sm text-text-main font-bold">{summary.nextMove}</p>
                </div>
              </div>
            ) : (
              <p className="text-xs text-text-muted">
                Couldn't put together a summary just now - but the conversation itself still counts. Whatever's genuinely yours to carry forward, you already know it.
              </p>
            )}
            <button
              onClick={() => handleDone(!!summary && !closeError)}
              className="w-full btn-primary py-3 font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2"
            >
              <CheckCircle2 className="w-4 h-4" /> Done
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
