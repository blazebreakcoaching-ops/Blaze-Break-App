import { useState } from 'react';
import { motion } from 'motion/react';
import { Zap, RotateCcw, CheckCircle2, WifiOff, EyeOff } from 'lucide-react';
import { SignalConfirmation, SIGNAL_CONFIRMATION_OPTIONS, shouldKeepNovaPhrasing } from '../../reset-studio-engine';
import { secureApiFetch } from '../lib/secure-api';
import { auth } from '../lib/firebase';
import { recordRediscoveryClue } from '../lib/rediscovery-service';
import { updateNovaMemoryBySourceAndType } from '../lib/nova-brain';

type WantOption = 'cool_off' | 'work_out' | 'turn_into_sayable' | 'leave_here';

const WANT_OPTIONS: { id: WantOption; label: string }[] = [
  { id: 'cool_off', label: 'Cool off' },
  { id: 'work_out', label: 'Work out what actually bothered me' },
  { id: 'turn_into_sayable', label: 'Turn it into something I can say' },
  { id: 'leave_here', label: 'Leave it here' },
];

export const PressureValve = () => {
  const [input, setInput] = useState('');
  const [asked, setAsked] = useState(false);
  const [selected, setSelected] = useState<WantOption | null>(null);
  const [finished, setFinished] = useState(false);

  const [signalLoading, setSignalLoading] = useState(false);
  const [signalFallback, setSignalFallback] = useState(false);
  const [hypothesis, setHypothesis] = useState<string | null>(null);
  const [signalRewrite, setSignalRewrite] = useState('');

  const [reframeLoading, setReframeLoading] = useState(false);
  const [reframeFallback, setReframeFallback] = useState(false);
  const [reframe, setReframe] = useState<{ whatHappened: string; whatMattered: string; whatNeedsSaying: string } | null>(null);
  const [reframeConfirmAnswer, setReframeConfirmAnswer] = useState<SignalConfirmation | null>(null);
  const [reframeRewrite, setReframeRewrite] = useState('');
  const [reframeRewriteSubmitted, setReframeRewriteSubmitted] = useState(false);

  const recordUse = () => {
    updateNovaMemoryBySourceAndType('Pressure Valve', 'state', {
      content: 'Used the Pressure Valve to work through something privately.',
      confidence: 'verified',
      canEdit: false,
    });
  };

  const resetAll = () => {
    setInput('');
    setAsked(false);
    setSelected(null);
    setFinished(false);
    setSignalLoading(false);
    setSignalFallback(false);
    setHypothesis(null);
    setSignalRewrite('');
    setReframeLoading(false);
    setReframeFallback(false);
    setReframe(null);
    setReframeConfirmAnswer(null);
    setReframeRewrite('');
    setReframeRewriteSubmitted(false);
  };

  const handleChoose = async (option: WantOption) => {
    setSelected(option);
    recordUse();
    if (option === 'cool_off' || option === 'leave_here') {
      setFinished(true);
      return;
    }
    if (option === 'work_out') {
      setSignalLoading(true);
      try {
        const res = await secureApiFetch('/api/nova/reset-studio-reframe', { method: 'POST', data: { text: input.trim(), mode: 'keep_signal' } });
        if (!res.ok) throw new Error('unavailable');
        const data = await res.json();
        if (typeof data.hypothesis !== 'string') throw new Error('bad shape');
        setHypothesis(data.hypothesis);
      } catch {
        setSignalFallback(true);
      } finally {
        setSignalLoading(false);
      }
      return;
    }
    // turn_into_sayable
    setReframeLoading(true);
    try {
      const res = await secureApiFetch('/api/nova/reset-studio-reframe', { method: 'POST', data: { text: input.trim(), mode: 'say_what_i_mean' } });
      if (!res.ok) throw new Error('unavailable');
      const data = await res.json();
      if (typeof data.whatHappened !== 'string') throw new Error('bad shape');
      setReframe(data);
    } catch {
      setReframeFallback(true);
    } finally {
      setReframeLoading(false);
    }
  };

  const handleSignalConfirm = async (answer: SignalConfirmation) => {
    if (answer === 'rewrite') return;
    if (shouldKeepNovaPhrasing(answer) && hypothesis && auth.currentUser) {
      await recordRediscoveryClue(auth.currentUser.uid, 'pressure_valve', 'What actually bothered me, underneath it', hypothesis);
    }
    setFinished(true);
  };

  const handleSignalRewriteSubmit = async () => {
    if (signalRewrite.trim() && auth.currentUser) {
      await recordRediscoveryClue(auth.currentUser.uid, 'pressure_valve', 'What actually bothered me, in their own words', signalRewrite.trim());
    }
    setFinished(true);
  };

  const handleReframeConfirm = async (answer: SignalConfirmation) => {
    if (answer === 'rewrite') { setReframeConfirmAnswer('rewrite'); return; }
    if (shouldKeepNovaPhrasing(answer) && reframe?.whatNeedsSaying && auth.currentUser) {
      await recordRediscoveryClue(auth.currentUser.uid, 'pressure_valve', 'Turn it into something I can say - what needs saying', reframe.whatNeedsSaying);
    }
    setReframeConfirmAnswer(answer);
  };

  const handleReframeRewriteSubmit = async () => {
    if (reframeRewrite.trim() && auth.currentUser) {
      await recordRediscoveryClue(auth.currentUser.uid, 'pressure_valve', 'Turn it into something I can say - what needs saying (in their own words)', reframeRewrite.trim());
    }
    setReframeRewriteSubmitted(true);
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
          <Zap className="w-10 h-10 text-text-muted" />
        </div>
        <div className="space-y-3 max-w-md">
          <h3 className="text-3xl font-display font-medium text-text-main tracking-tight">Left there.</h3>
          <p className="text-text-muted leading-relaxed max-w-sm mx-auto">
            Nothing from this was sent anywhere. It stayed exactly where you put it.
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
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-rose-500/10 to-amber-500/10 border border-destructive/20 text-destructive">
            <Zap className="w-8 h-8" />
          </div>
          <div className="space-y-4">
            <h3 className="text-4xl lg:text-5xl font-display font-extrabold tracking-tight text-text-main">The Pressure Valve</h3>
            <p className="text-text-muted leading-relaxed max-w-xl text-center mx-auto text-sm lg:text-base">
              Say the version you should probably not send.
            </p>
          </div>
        </div>

        {!asked && (
          <>
            <div className="rounded-2xl bg-surface/80 border border-white/10 overflow-hidden">
              <div className="flex items-center gap-2 px-6 pt-5 text-xs font-black uppercase tracking-widest text-text-muted">
                <EyeOff className="w-3.5 h-3.5" /> Private working space - not sent to anyone
              </div>
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Say it exactly how it actually feels..."
                aria-label="Say it exactly how it actually feels"
                className="w-full h-56 bg-transparent p-6 text-lg lg:text-xl font-medium placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary/40 focus:ring-inset resize-none text-text-main"
              />
            </div>
            <button
              onClick={() => setAsked(true)}
              disabled={!input.trim()}
              className="w-full py-5 rounded-2xl font-black uppercase tracking-[0.2em] text-[11px] bg-surface dark:bg-card text-text-main disabled:opacity-40 disabled:cursor-not-allowed transition-all hover:bg-border"
            >
              Continue
            </button>
          </>
        )}

        {asked && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-8">
            {!selected && (
              <div className="space-y-4">
                <p className="text-xl font-medium text-text-main text-center">What do you want from this?</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {WANT_OPTIONS.map((opt) => (
                    <button
                      key={opt.id}
                      onClick={() => handleChoose(opt.id)}
                      className="p-4 rounded-xl border border-border hover:border-primary/50 text-left font-bold text-text-main transition-colors"
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {selected === 'work_out' && (
              <div className="p-6 rounded-2xl border border-border bg-surface/60 space-y-4">
                {signalLoading && <p className="text-sm text-text-muted">Nova is listening for what actually bothered you...</p>}
                {!signalLoading && signalFallback && !hypothesis && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 text-xs text-text-muted">
                      <WifiOff className="w-3.5 h-3.5" /> Nova's live read wasn't available right now.
                    </div>
                    <p className="text-text-main font-medium">What actually bothered you about it, underneath the heat? Put it in your own words.</p>
                    <textarea
                      value={signalRewrite}
                      onChange={(e) => setSignalRewrite(e.target.value)}
                      placeholder="What actually bothered me is..."
                      className="w-full h-24 bg-white dark:bg-card border border-border rounded-xl p-4 text-sm text-text-main focus:outline-none focus:border-primary resize-none"
                    />
                    <button onClick={handleSignalRewriteSubmit} className="btn-primary py-2.5 px-6 text-sm">Keep this</button>
                  </div>
                )}
                {!signalLoading && hypothesis && (
                  <div className="space-y-4">
                    <p className="text-text-main font-medium text-lg">"{hypothesis}"</p>
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
                  </div>
                )}
              </div>
            )}

            {selected === 'turn_into_sayable' && (
              <div className="p-6 rounded-2xl border border-border bg-surface/60 space-y-4">
                {reframeLoading && <p className="text-sm text-text-muted">Separating the reaction from what's underneath it...</p>}
                {!reframeLoading && reframeFallback && !reframe && (
                  <div className="flex items-center gap-2 text-xs text-text-muted">
                    <WifiOff className="w-3.5 h-3.5" /> Nova's live help wasn't available right now.
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
                      <span className="text-xs font-black uppercase tracking-widest text-text-muted">What needs saying</span>
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
                  <button onClick={() => setFinished(true)} className="text-xs font-bold text-text-muted hover:text-text-main">Done</button>
                )}
              </div>
            )}
          </motion.div>
        )}
      </div>
    </div>
  );
};
