import React, { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Sparkles, Mic, MicOff, PhoneOff, RefreshCw, Loader2, AlertCircle } from 'lucide-react';
import { cn } from '../lib/utils';
import { useFocusTrap } from '../lib/useFocusTrap';
import { useNovaLiveVoice } from '../lib/useNovaLiveVoice';

interface NovaVoiceCallProps {
  isOpen: boolean;
  onClose: () => void;
  // Optional context primer (fingerprint, recent chat, Nova's memory) so the
  // call starts already knowing who it's talking to.
  buildInitialPrompt?: () => string;
}

function formatElapsed(ms: number): string {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// A purpose-built, full-screen voice-call experience with Nova - a live
// transcript, a speaking indicator, mute, elapsed time, and graceful
// reconnect - rather than the inline mic toggle. Everything real-time lives in
// the shared useNovaLiveVoice hook; this component is only presentation and
// call lifecycle.
export const NovaVoiceCall = ({ isOpen, onClose, buildInitialPrompt }: NovaVoiceCallProps) => {
  const dialogRef = useFocusTrap(isOpen);
  const transcriptEndRef = useRef<HTMLDivElement | null>(null);
  const { status, error, isNovaSpeaking, isMuted, transcript, elapsedMs, start, stop, toggleMute } =
    useNovaLiveVoice({ buildInitialPrompt });

  // Auto-start the call when the screen opens; tear it down when it closes.
  useEffect(() => {
    if (isOpen) start();
    return () => { if (isOpen) stop(); };
    // start/stop are stable enough for this lifecycle; re-running on their
    // identity would restart the call on every render.
  }, [isOpen]);

  // Close on Escape, ending the call first.
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') handleEnd(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen]);

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [transcript]);

  const handleEnd = () => { stop(); onClose(); };

  const statusLabel =
    status === 'connecting' ? 'Connecting…' :
    status === 'error' ? 'Call ended' :
    isNovaSpeaking ? 'Nova is speaking' :
    isMuted ? 'Muted — Nova is listening when you unmute' :
    'Listening…';

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-background/95 backdrop-blur-md p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          role="dialog"
          aria-modal="true"
          aria-label="Voice call with Nova"
        >
          <div ref={dialogRef as React.RefObject<HTMLDivElement>} className="w-full max-w-md flex flex-col items-center gap-8 py-8">
            {/* Nova presence + speaking indicator */}
            <div className="flex flex-col items-center gap-5">
              <div className="relative flex items-center justify-center">
                <AnimatePresence>
                  {isNovaSpeaking && (
                    <motion.span
                      key="pulse"
                      className="absolute inset-0 rounded-full bg-primary/30"
                      initial={{ scale: 1, opacity: 0.6 }}
                      animate={{ scale: 1.8, opacity: 0 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 1.4, repeat: Infinity, ease: 'easeOut' }}
                      aria-hidden="true"
                    />
                  )}
                </AnimatePresence>
                <div className={cn(
                  'relative z-10 w-24 h-24 rounded-full flex items-center justify-center shadow-xl transition-colors',
                  isNovaSpeaking ? 'bg-primary text-primary-foreground' : 'bg-card border border-border text-primary'
                )}>
                  {status === 'connecting'
                    ? <Loader2 className="w-9 h-9 animate-spin" aria-hidden="true" />
                    : <Sparkles className="w-9 h-9" aria-hidden="true" />}
                </div>
              </div>
              <div className="text-center space-y-1">
                <h2 className="text-xl font-display font-bold text-text-main">Nova</h2>
                <p className="text-sm text-text-muted" aria-live="polite">{statusLabel}</p>
                {status === 'live' && (
                  <p className="text-xs font-mono text-text-muted tabular-nums" aria-label={`Call duration ${formatElapsed(elapsedMs)}`}>
                    {formatElapsed(elapsedMs)}
                  </p>
                )}
              </div>
            </div>

            {/* Error + reconnect */}
            {status === 'error' && (
              <div role="alert" className="w-full flex flex-col items-center gap-3 rounded-2xl border border-destructive/30 bg-destructive/10 p-4 text-center">
                <AlertCircle className="w-5 h-5 text-destructive" aria-hidden="true" />
                <p className="text-sm text-text-main">{error}</p>
                <button
                  onClick={() => start()}
                  className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2 text-sm font-bold text-primary-foreground hover:opacity-90 transition-opacity"
                >
                  <RefreshCw className="w-4 h-4" aria-hidden="true" /> Reconnect
                </button>
              </div>
            )}

            {/* Live transcript */}
            <div
              className="w-full flex-1 min-h-[8rem] max-h-64 overflow-y-auto custom-scrollbar rounded-2xl border border-border bg-surface/60 dark:bg-card/40 p-4 space-y-3"
              aria-live="polite"
              aria-atomic="false"
              aria-label="Live transcript"
            >
              {transcript.length === 0 ? (
                <p className="text-xs text-text-muted text-center py-6">
                  {status === 'connecting' ? 'Getting the line ready…' : 'Say hello when you’re ready — Nova is listening.'}
                </p>
              ) : (
                transcript.map((line, i) => (
                  <div key={i} className={cn('flex', line.role === 'user' ? 'justify-end' : 'justify-start')}>
                    <div className={cn(
                      'max-w-[85%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed',
                      line.role === 'user'
                        ? 'bg-primary/15 text-text-main rounded-br-sm'
                        : 'bg-card border border-border text-text-main rounded-bl-sm'
                    )}>
                      <span className="block text-[10px] font-black uppercase tracking-widest text-text-muted mb-0.5">
                        {line.role === 'user' ? 'You' : 'Nova'}
                      </span>
                      {line.text}
                    </div>
                  </div>
                ))
              )}
              <div ref={transcriptEndRef} />
            </div>

            {/* Controls */}
            <div className="flex items-center gap-6">
              <button
                onClick={toggleMute}
                disabled={status !== 'live'}
                aria-pressed={isMuted}
                aria-label={isMuted ? 'Unmute your microphone' : 'Mute your microphone'}
                className={cn(
                  'w-14 h-14 rounded-full flex items-center justify-center border transition-colors disabled:opacity-40',
                  isMuted ? 'bg-destructive/15 border-destructive/40 text-destructive' : 'bg-card border-border text-text-main hover:border-primary/40'
                )}
              >
                {isMuted ? <MicOff className="w-6 h-6" aria-hidden="true" /> : <Mic className="w-6 h-6" aria-hidden="true" />}
              </button>
              <button
                onClick={handleEnd}
                aria-label="End the call with Nova"
                className="w-16 h-16 rounded-full flex items-center justify-center bg-destructive text-destructive-foreground shadow-lg hover:opacity-90 transition-opacity"
              >
                <PhoneOff className="w-7 h-7" aria-hidden="true" />
              </button>
            </div>

            <p className="text-[11px] text-text-muted text-center max-w-xs">
              Nova is a supportive coach, not a medical service. In a crisis, contact emergency services or a crisis line directly.
            </p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default NovaVoiceCall;
