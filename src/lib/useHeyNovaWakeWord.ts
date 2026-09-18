import { useEffect, useRef, useState } from 'react';

// A continuous, always-on listener for the phrase "hey Nova" - a third,
// separate thing from the two SpeechRecognition uses that already exist in
// this app: push-to-talk dictation (NovaChat.tsx, RecoveryIntelligenceLayer.tsx,
// continuous: false) and the full-duplex Gemini Live voice call
// (useNovaLiveVoice.ts, its own dedicated getUserMedia stream + AudioContext).
// This hook never sends audio anywhere or talks to Nova directly - it only
// watches the browser's own local transcript for the wake phrase and hands
// whatever was said right after it up to the caller (App.tsx), which opens
// the command palette pre-filled with that text. The palette itself is the
// confirmation step: nothing navigates until the person picks a result.

export type HeyNovaWakeStatus = 'unsupported' | 'idle' | 'listening' | 'denied';

const WAKE_PHRASE = 'hey nova';

// Pure and DOM-free on purpose, so it's unit-testable in this repo's
// node-environment vitest setup (no jsdom/SpeechRecognition available here) -
// unlike the rest of this hook, which only runs inside a real browser.
export function extractQueryAfterWake(transcript: string): string | null {
  const lower = transcript.toLowerCase();
  const idx = lower.indexOf(WAKE_PHRASE);
  if (idx === -1) return null;
  return transcript.slice(idx + WAKE_PHRASE.length).trim();
}

interface UseHeyNovaWakeWordOptions {
  // Caller passes the feature flag value in directly - this hook doesn't
  // read feature-flags.ts itself, so it stays simple to drive from tests
  // and doesn't need to know about the flags module's storage/event details.
  enabled: boolean;
  // True while something else legitimately owns the microphone (a live Nova
  // voice call, push-to-talk dictation) - the listener stops rather than
  // fighting over getUserMedia or producing a false trigger from audio that
  // isn't the person talking to their own device.
  paused: boolean;
  // Called with whatever was said right after "hey Nova" (may be an empty
  // string if nothing followed yet).
  onWake: (query: string) => void;
}

export function useHeyNovaWakeWord({ enabled, paused, onWake }: UseHeyNovaWakeWordOptions) {
  const [status, setStatus] = useState<HeyNovaWakeStatus>('idle');
  const [lastWakeAt, setLastWakeAt] = useState<number | null>(null);
  const onWakeRef = useRef(onWake);
  onWakeRef.current = onWake;
  const audioCtxRef = useRef<AudioContext | null>(null);

  // A short, synthesized two-note "ding" - the acknowledgement that "hey
  // Nova" was actually heard, played the instant it's detected, before the
  // command palette opens. No external audio asset; a fresh AudioContext
  // is created lazily on first use and reused for the hook's lifetime
  // (not recreated per-wake). Safe to create without a fresh user gesture
  // here specifically, since a wake event can only ever fire after the
  // person already interacted with the page to turn the feature on and
  // grant microphone access.
  const playAcknowledgementTone = () => {
    try {
      const AudioContextCtor = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextCtor) return;
      let ctx = audioCtxRef.current;
      if (!ctx || ctx.state === 'closed') {
        ctx = new AudioContextCtor();
        audioCtxRef.current = ctx;
      }
      if (ctx.state === 'suspended') ctx.resume();

      const now = ctx.currentTime;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.12, now + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
      gain.connect(ctx.destination);

      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, now);
      osc.frequency.setValueAtTime(1320, now + 0.09);
      osc.connect(gain);
      osc.start(now);
      osc.stop(now + 0.2);
    } catch {
      // Non-fatal - a missing/blocked chime is cosmetic, never worth
      // interrupting the actual wake-word flow over.
    }
  };

  useEffect(() => {
    const SpeechRecognitionCtor =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognitionCtor) {
      setStatus('unsupported');
      return;
    }

    if (!enabled || paused) {
      setStatus('idle');
      return;
    }

    let stopped = false;
    let current: any = null;
    let restartTimer: ReturnType<typeof setTimeout> | null = null;

    const startRecognition = () => {
      if (stopped) return;
      const recognition = new SpeechRecognitionCtor();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      recognition.onstart = () => setStatus('listening');

      recognition.onresult = (event: any) => {
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript as string;
          const query = extractQueryAfterWake(transcript);
          if (query !== null) {
            playAcknowledgementTone();
            setLastWakeAt(Date.now());
            onWakeRef.current(query);
            // Stop this instance now rather than let it keep listening mid
            // utterance - onend's restart brings a fresh one back, so the
            // same wake isn't acted on twice while the phrase finishes
            // being transcribed.
            try { recognition.stop(); } catch { /* already stopping */ }
            return;
          }
        }
      };

      recognition.onerror = (event: any) => {
        if (event?.error === 'not-allowed' || event?.error === 'service-not-allowed') {
          stopped = true;
          setStatus('denied');
        }
        // Other errors (no-speech, aborted, network) are routine in
        // continuous listening and are recovered by onend's restart below.
      };

      recognition.onend = () => {
        current = null;
        if (stopped) return;
        // Browsers stop continuous recognition periodically on their own
        // (silence timeouts, backgrounding) - restart to keep listening.
        restartTimer = setTimeout(() => { if (!stopped) startRecognition(); }, 250);
      };

      try {
        recognition.start();
        current = recognition;
      } catch {
        // Transient start failure (e.g. another recognition instance mid
        // teardown) - retry shortly rather than leaving the listener dead.
        restartTimer = setTimeout(() => { if (!stopped) startRecognition(); }, 1000);
      }
    };

    startRecognition();

    return () => {
      stopped = true;
      if (restartTimer) clearTimeout(restartTimer);
      if (current) { try { current.stop(); } catch { /* already stopped */ } current = null; }
    };
  }, [enabled, paused]);

  return { status, lastWakeAt };
}
