import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Flame, Wind, RotateCcw, CheckCircle2, WifiOff, ChevronDown, Trash2 } from 'lucide-react';
import { cn } from '../lib/utils';
import { getNovaBrain, updateNovaMemoryBySourceAndType } from '../lib/nova-brain';
import { nextRuminationUseCount, buildRuminationMemoryContent } from '../../rumination-furnace';
import { SignalConfirmation, SIGNAL_CONFIRMATION_OPTIONS, shouldKeepNovaPhrasing } from '../../reset-studio-engine';
import { secureApiFetch } from '../lib/secure-api';
import { auth } from '../lib/firebase';
import { recordRediscoveryClue } from '../lib/rediscovery-service';
import { saveRuminationEntry, loadSavedRuminationEntries, deleteSavedRuminationEntry, SavedRuminationEntry } from '../lib/reset-studio-service';

type AftermathOption = 'burn' | 'keep_signal' | 'say_what_i_mean' | 'action' | 'not_ready';

const AFTERMATH_OPTIONS: { id: AftermathOption; label: string; description: string }[] = [
  { id: 'burn', label: 'Burn the Noise', description: 'Discard the entry without further analysis.' },
  { id: 'keep_signal', label: 'Keep the Signal', description: 'Find whether one real concern is underneath it.' },
  { id: 'say_what_i_mean', label: 'Say What I Mean', description: 'Turn the raw reaction into clearer language.' },
  { id: 'action', label: 'Is There an Action?', description: 'Work out whether anything actually needs doing.' },
  { id: 'not_ready', label: 'Not Ready Yet', description: 'Save it privately for later reflection.' },
];

export const RuminationFurnace = ({ onCleared }: { onCleared?: () => void }) => {
  const [input, setInput] = useState('');
  const [releasing, setReleasing] = useState(false);
  const [released, setReleased] = useState(false);
  const [selected, setSelected] = useState<AftermathOption | null>(null);
  const [finished, setFinished] = useState(false);

  // Keep the Signal
  const [signalLoading, setSignalLoading] = useState(false);
  const [signalFallback, setSignalFallback] = useState(false);
  const [hypothesis, setHypothesis] = useState<string | null>(null);
  const [signalRewrite, setSignalRewrite] = useState('');
  const [signalConfirmAnswer, setSignalConfirmAnswer] = useState<SignalConfirmation | null>(null);

  // Say What I Mean
  const [reframeLoading, setReframeLoading] = useState(false);
  const [reframeFallback, setReframeFallback] = useState(false);
  const [reframe, setReframe] = useState<{ whatHappened: string; whatMattered: string; whatNeedsSaying: string } | null>(null);
  const [reframeConfirmAnswer, setReframeConfirmAnswer] = useState<SignalConfirmation | null>(null);
  const [reframeRewrite, setReframeRewrite] = useState('');
  const [reframeRewriteSubmitted, setReframeRewriteSubmitted] = useState(false);

  // Is There an Action?
  const [actionAnswer, setActionAnswer] = useState<'yes' | 'no' | null>(null);
  const [actionText, setActionText] = useState('');
  const [actionSaved, setActionSaved] = useState(false);

  // Not Ready Yet
  const [savedEntries, setSavedEntries] = useState<SavedRuminationEntry[]>([]);
  const [showSaved, setShowSaved] = useState(false);

  useEffect(() => {
    if (!showSaved || !auth.currentUser) return;
    loadSavedRuminationEntries(auth.currentUser.uid).then(setSavedEntries);
  }, [showSaved]);

  const recordUse = () => {
    const existing = getNovaBrain().find(m => m.source === 'Rumination Furnace' && m.type === 'state');
    const count = nextRuminationUseCount(existing?.content);
    updateNovaMemoryBySourceAndType('Rumination Furnace', 'state', {
      content: buildRuminationMemoryContent(count),
      confidence: 'verified',
      canEdit: false,
    });
  };

  const handleGetItOut = () => {
    if (!input.trim()) return;
    setReleasing(true);
    setTimeout(() => {
      setReleasing(false);
      setReleased(true);
    }, 1400);
  };

  const resetAll = () => {
    setInput('');
    setReleasing(false);
    setReleased(false);
    setSelected(null);
    setFinished(false);
    setSignalLoading(false);
    setSignalFallback(false);
    setHypothesis(null);
    setSignalRewrite('');
    setSignalConfirmAnswer(null);
    setReframeLoading(false);
    setReframeFallback(false);
    setReframe(null);
    setReframeConfirmAnswer(null);
    setReframeRewrite('');
    setReframeRewriteSubmitted(false);
    setActionAnswer(null);
    setActionText('');
    setActionSaved(false);
  };

  const handleChooseOption = async (option: AftermathOption) => {
    setSelected(option);
    if (option === 'burn') {
      recordUse();
      setTimeout(() => { setFinished(true); if (onCleared) onCleared(); }, 400);
      return;
    }
    if (option === 'keep_signal') {
      recordUse();
      setSignalLoading(true);
      try {
        const res = await secureApiFetch('/api/nova/reset-studio-reframe', { method: 'POST', data: { text: input.trim(), mode: 'keep_signal' } });
        if (!res.ok) throw new Error('unavailable');
        const data = await res.json();
        if (typeof data.hypothesis !== 'string') throw new Error('bad shape');
        setHypothesis(data.hypothesis);
      } catch {
        setSignalFallback(true);
        setHypothesis(null);
      } finally {
        setSignalLoading(false);
      }
      return;
    }
    if (option === 'say_what_i_mean') {
      recordUse();
      setReframeLoading(true);
      try {
        const res = await secureApiFetch('/api/nova/reset-studio-reframe', { method: 'POST', data: { text: input.trim(), mode: 'say_what_i_mean' } });
        if (!res.ok) throw new Error('unavailable');
        const data = await res.json();
        if (typeof data.whatHappened !== 'string') throw new Error('bad shape');
        setReframe(data);
      } catch {
        setReframeFallback(true);
        setReframe(null);
      } finally {
        setReframeLoading(false);
      }
      return;
    }
    if (option === 'action') {
      recordUse();
      return;
    }
    if (option === 'not_ready') {
      recordUse();
      if (auth.currentUser) {
        await saveRuminationEntry(auth.currentUser.uid, input.trim());
      }
      setFinished(true);
      if (onCleared) onCleared();
    }
  };

  const handleSignalConfirm = async (answer: SignalConfirmation) => {
    if (answer === 'rewrite') { setSignalConfirmAnswer('rewrite'); return; } // reveals the rewrite box instead of finishing
    if (shouldKeepNovaPhrasing(answer) && hypothesis && auth.currentUser) {
      await recordRediscoveryClue(auth.currentUser.uid, 'rumination_furnace', 'Keep the Signal - the part that still matters', hypothesis);
    }
    setFinished(true);
    if (onCleared) onCleared();
  };

  const handleSignalRewriteSubmit = async () => {
    if (signalRewrite.trim() && auth.currentUser) {
      await recordRediscoveryClue(auth.currentUser.uid, 'rumination_furnace', 'Keep the Signal - the part that still matters (in their own words)', signalRewrite.trim());
    }
    setFinished(true);
    if (onCleared) onCleared();
  };

  const handleReframeConfirm = async (answer: SignalConfirmation) => {
    if (answer === 'rewrite') { setReframeConfirmAnswer('rewrite'); return; }
    if (shouldKeepNovaPhrasing(answer) && reframe?.whatNeedsSaying && auth.currentUser) {
      await recordRediscoveryClue(auth.currentUser.uid, 'rumination_furnace', 'Say What I Mean - what might need saying', reframe.whatNeedsSaying);
    }
    setReframeConfirmAnswer(answer);
  };

  const handleReframeRewriteSubmit = async () => {
    if (reframeRewrite.trim() && auth.currentUser) {
      await recordRediscoveryClue(auth.currentUser.uid, 'rumination_furnace', 'Say What I Mean - what might need saying (in their own words)', reframeRewrite.trim());
    }
    setReframeRewriteSubmitted(true);
  };

  const handleActionDone = () => {
    setFinished(true);
    if (onCleared) onCleared();
  };

  if (finished) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        role="status"
        aria-live="polite"
        className="card bg-background border border-border p-8 sm:p-12 md:p-16 text-center flex flex-col items-center justify-center space-y-8"
      >
        <div className="w-24 h-24 bg-white/[0.02] border border-white/[0.05] rounded-full flex items-center justify-center shadow-inner">
          <Wind className="w-10 h-10 text-text-muted" />
        </div>
        <div className="space-y-3 max-w-md">
          <h3 className="text-3xl font-display font-medium text-text-main tracking-tight">That's done.</h3>
          <p className="text-text-muted leading-relaxed max-w-sm mx-auto">
            It's been let go. That thought no longer has a hold on your energy today.
          </p>
        </div>
        <button
          onClick={resetAll}
          className="text-xs font-black uppercase tracking-[0.2em] text-text-muted hover:text-text-main flex items-center gap-2 transition-colors px-6 py-3 rounded-full hover:bg-white/[0.02] border border-transparent hover:border-white/[0.05]"
        >
          <RotateCcw className="w-3 h-3" /> Start Over
        </button>
      </motion.div>
    );
  }

  return (
    <div className="card bg-background border border-border p-10 lg:p-14 text-text-main relative overflow-hidden">
      <div className="relative z-10 max-w-3xl space-y-10 mx-auto">
        <div className="space-y-6 text-center flex flex-col items-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-500/10 to-rose-500/10 border border-warning/20 text-warning">
            <Flame className="w-8 h-8" />
          </div>
          <div className="space-y-4">
            <h3 className="text-4xl lg:text-5xl font-display font-extrabold tracking-tight text-text-main">The Rumination Furnace</h3>
            <p className="text-text-muted leading-relaxed max-w-xl text-center mx-auto text-sm lg:text-base">
              Get it out of your head. Write the argument, replay, frustration, imaginary conversation or thought that keeps coming back. Don't polish it.
            </p>
          </div>
        </div>

        {!released && (
          <>
            <div className="relative overflow-hidden rounded-2xl bg-surface/80 border border-white/10">
              <AnimatePresence>
                {releasing && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 1.2 }}
                    className="absolute inset-0 bg-background/80 backdrop-blur-sm z-20 flex items-center justify-center"
                  >
                    <span className="text-xs font-black uppercase tracking-[0.3em] text-text-muted">Letting it go...</span>
                  </motion.div>
                )}
              </AnimatePresence>
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                disabled={releasing}
                placeholder="Unload it here…"
                aria-label="Unload it here"
                className="w-full h-56 bg-transparent p-6 text-lg lg:text-xl font-medium placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary/40 focus:ring-inset resize-none text-text-main"
              />
            </div>

            <button
              onClick={handleGetItOut}
              disabled={!input.trim() || releasing}
              className="w-full py-5 rounded-2xl font-black uppercase tracking-[0.2em] text-[11px] bg-surface dark:bg-card text-text-main disabled:opacity-40 disabled:cursor-not-allowed transition-all hover:bg-border"
            >
              Get It Out
            </button>
          </>
        )}

        {released && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-8">
            <div className="text-center space-y-2">
              <p className="text-2xl font-display font-medium text-text-main">The thought is out of your head.</p>
              <p className="text-text-muted">Now decide what deserves to survive it.</p>
            </div>

            {!selected && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {AFTERMATH_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    onClick={() => handleChooseOption(opt.id)}
                    className="p-4 rounded-xl border border-border hover:border-primary/50 text-left space-y-1 transition-colors"
                  >
                    <span className="block font-bold text-text-main">{opt.label}</span>
                    <span className="block text-xs text-text-muted">{opt.description}</span>
                  </button>
                ))}
              </div>
            )}

            {selected === 'keep_signal' && (
              <div className="p-6 rounded-2xl border border-border bg-surface/60 space-y-4">
                {signalLoading && <p className="text-sm text-text-muted">Nova is listening for the one thing that matters...</p>}
                {!signalLoading && signalFallback && !hypothesis && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 text-xs text-text-muted">
                      <WifiOff className="w-3.5 h-3.5" /> Nova's live read wasn't available right now.
                    </div>
                    <p className="text-text-main font-medium">Is there one thing underneath all of that which still matters? Put it in your own words.</p>
                    <textarea
                      value={signalRewrite}
                      onChange={(e) => setSignalRewrite(e.target.value)}
                      placeholder="The part that still matters is..."
                      className="w-full h-24 bg-white dark:bg-card border border-border rounded-xl p-4 text-sm text-text-main focus:outline-none focus:border-primary resize-none"
                    />
                    <button onClick={handleSignalRewriteSubmit} className="btn-primary py-2.5 px-6 text-sm">Keep this</button>
                  </div>
                )}
                {!signalLoading && hypothesis && (
                  <div className="space-y-4">
                    <p className="text-text-main font-medium text-lg">"{hypothesis}"</p>
                    {signalConfirmAnswer !== 'rewrite' && (
                      <div className="flex flex-wrap gap-2">
                        {SIGNAL_CONFIRMATION_OPTIONS.map((opt) => (
                          <button
                            key={opt.id}
                            onClick={() => handleSignalConfirm(opt.id)}
                            className="px-3 py-1.5 rounded-lg border border-border text-xs font-bold text-text-muted hover:text-text-main hover:border-primary/40 transition-colors"
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    )}
                    {signalConfirmAnswer === 'rewrite' && (
                      <div className="space-y-2">
                        <textarea
                          value={signalRewrite}
                          onChange={(e) => setSignalRewrite(e.target.value)}
                          placeholder="The part that still matters is..."
                          className="w-full h-24 bg-white dark:bg-card border border-border rounded-xl p-4 text-sm text-text-main focus:outline-none focus:border-primary resize-none"
                        />
                        <button onClick={handleSignalRewriteSubmit} className="btn-primary py-2.5 px-6 text-sm">Keep this</button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {selected === 'say_what_i_mean' && (
              <div className="p-6 rounded-2xl border border-border bg-surface/60 space-y-4">
                {reframeLoading && <p className="text-sm text-text-muted">Separating the reaction from what's underneath it...</p>}
                {!reframeLoading && reframeFallback && !reframe && (
                  <div className="flex items-center gap-2 text-xs text-text-muted">
                    <WifiOff className="w-3.5 h-3.5" /> Nova's live help wasn't available right now - the raw version above is still out of your head either way.
                  </div>
                )}
                {!reframeLoading && reframe && (
                  <div className="space-y-4">
                    <div>
                      <span className="text-xs font-black uppercase tracking-widest text-text-muted">What happened</span>
                      <p className="text-text-main">{reframe.whatHappened}</p>
                    </div>
                    <div>
                      <span className="text-xs font-black uppercase tracking-widest text-text-muted">What mattered</span>
                      <p className="text-text-main">{reframe.whatMattered}</p>
                    </div>
                    <div>
                      <span className="text-xs font-black uppercase tracking-widest text-text-muted">What might need saying</span>
                      <p className="text-text-main">{reframe.whatNeedsSaying}</p>
                    </div>
                    {!reframeConfirmAnswer && (
                      <div className="space-y-2">
                        <p className="text-xs font-bold text-text-muted">Does that feel true?</p>
                        <div className="flex flex-wrap gap-2">
                          {SIGNAL_CONFIRMATION_OPTIONS.map((opt) => (
                            <button
                              key={opt.id}
                              onClick={() => handleReframeConfirm(opt.id)}
                              className="px-3 py-1.5 rounded-lg border border-border text-xs font-bold text-text-muted hover:text-text-main hover:border-primary/40 transition-colors"
                            >
                              {opt.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    {reframeConfirmAnswer === 'rewrite' && !reframeRewriteSubmitted && (
                      <div className="space-y-2">
                        <textarea
                          value={reframeRewrite}
                          onChange={(e) => setReframeRewrite(e.target.value)}
                          placeholder="What actually needs saying is..."
                          className="w-full h-24 bg-white dark:bg-card border border-border rounded-xl p-4 text-sm text-text-main focus:outline-none focus:border-primary resize-none"
                        />
                        <button onClick={handleReframeRewriteSubmit} className="btn-primary py-2.5 px-6 text-sm">Keep this</button>
                      </div>
                    )}
                    {reframeConfirmAnswer && shouldKeepNovaPhrasing(reframeConfirmAnswer) && (
                      <p className="text-xs font-bold text-success dark:text-[#4ade80] flex items-center gap-2"><CheckCircle2 className="w-4 h-4" /> Kept.</p>
                    )}
                    {reframeRewriteSubmitted && (
                      <p className="text-xs font-bold text-success dark:text-[#4ade80] flex items-center gap-2"><CheckCircle2 className="w-4 h-4" /> Kept.</p>
                    )}
                  </div>
                )}
                {!reframeLoading && (reframe || reframeFallback) && (reframeConfirmAnswer !== 'rewrite' || reframeRewriteSubmitted) && (
                  <button onClick={handleActionDone} className="text-xs font-bold text-text-muted hover:text-text-main">Done</button>
                )}
              </div>
            )}

            {selected === 'action' && (
              <div className="p-6 rounded-2xl border border-border bg-surface/60 space-y-4">
                {actionAnswer === null && (
                  <>
                    <p className="text-text-main font-medium">Does anything genuinely need doing here?</p>
                    <div className="flex gap-3">
                      <button onClick={() => setActionAnswer('yes')} className="px-4 py-2 rounded-xl border border-border hover:border-primary/50 font-bold">Yes</button>
                      <button onClick={() => setActionAnswer('no')} className="px-4 py-2 rounded-xl border border-border hover:border-primary/50 font-bold">No</button>
                    </div>
                  </>
                )}
                {actionAnswer === 'no' && (
                  <p className="text-text-muted">Good - nothing to carry forward from this one.</p>
                )}
                {actionAnswer === 'yes' && !actionSaved && (
                  <div className="space-y-3">
                    <input
                      value={actionText}
                      onChange={(e) => setActionText(e.target.value)}
                      placeholder="What actually needs doing?"
                      className="w-full bg-white dark:bg-card border border-border rounded-xl px-4 py-2.5 text-sm text-text-main focus:outline-none focus:border-primary"
                    />
                    <button
                      onClick={() => setActionSaved(true)}
                      disabled={!actionText.trim()}
                      className="btn-primary py-2.5 px-6 text-sm disabled:opacity-40"
                    >
                      Note it
                    </button>
                  </div>
                )}
                {actionAnswer === 'yes' && actionSaved && (
                  <p className="text-text-muted">Noted - take it to One Less Thing or Workload Reality Check when you're ready.</p>
                )}
                {(actionAnswer === 'no' || actionSaved) && (
                  <button onClick={handleActionDone} className="text-xs font-bold text-text-muted hover:text-text-main">Done</button>
                )}
              </div>
            )}
          </motion.div>
        )}

        {!released && (
          <div className="pt-2 border-t border-border/40">
            <button
              onClick={() => setShowSaved((v) => !v)}
              className="text-xs font-bold text-text-muted hover:text-text-main flex items-center gap-1.5 mt-4"
            >
              <ChevronDown className={cn('w-3.5 h-3.5 transition-transform', showSaved && 'rotate-180')} />
              Saved for later ({savedEntries.length || '...'})
            </button>
            {showSaved && (
              <div className="mt-3 space-y-2">
                {savedEntries.length === 0 && <p className="text-xs text-text-muted">Nothing saved yet.</p>}
                {savedEntries.map((entry) => (
                  <div key={entry.id} className="p-3 rounded-xl border border-border bg-surface/40 flex items-start justify-between gap-3">
                    <p className="text-xs text-text-main leading-relaxed">{entry.text}</p>
                    <button
                      onClick={async () => {
                        if (auth.currentUser) await deleteSavedRuminationEntry(auth.currentUser.uid, entry.id);
                        setSavedEntries((prev) => prev.filter((e) => e.id !== entry.id));
                      }}
                      aria-label="Remove saved entry"
                      className="shrink-0 text-text-muted hover:text-destructive transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
