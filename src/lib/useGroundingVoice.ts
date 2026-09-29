import { useRef, useState, useCallback, useEffect } from 'react';

// Phase 3's voice-guided grounding (section 10-11) narrates fixed,
// already-decided text - a grounding prompt, not a live conversation.
// That's a genuinely different concern from Nova's existing live-voice
// architecture (useNovaLiveVoice.ts / NovaVoiceCall.tsx), which is a
// bidirectional Gemini Live session for free-form conversation and costs
// real voice-minute quota. Spinning up a live AI session just to read a
// static sentence aloud would be the wrong tool - expensive, and it adds
// entitlement/quota plumbing for something that needs none. The right
// "existing architecture to reuse" here is the browser's own
// SpeechSynthesis API - zero additional AI cost, and genuinely built for
// exactly this (narrating known text, with native pause/resume/cancel).
// This hook is the one place that wraps it, so nothing else in Grounding
// talks to window.speechSynthesis directly.

export interface GroundingVoiceControls {
  isSupported: boolean;
  isSpeaking: boolean;
  isPaused: boolean;
  speak: (text: string) => void;
  pause: () => void;
  resume: () => void;
  stop: () => void;
}

export const useGroundingVoice = (): GroundingVoiceControls => {
  const isSupported = typeof window !== 'undefined' && 'speechSynthesis' in window;
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  const stop = useCallback(() => {
    if (!isSupported) return;
    window.speechSynthesis.cancel();
    setIsSpeaking(false);
    setIsPaused(false);
  }, [isSupported]);

  const speak = useCallback((text: string) => {
    if (!isSupported || !text.trim()) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    // Calm but natural pacing (section 10/11) - slower than default,
    // never the exaggerated slow-whisper meditation-app style the brief
    // explicitly asks to avoid.
    utterance.rate = 0.92;
    utterance.pitch = 1;
    utterance.onstart = () => { setIsSpeaking(true); setIsPaused(false); };
    utterance.onend = () => { setIsSpeaking(false); setIsPaused(false); };
    utterance.onerror = () => { setIsSpeaking(false); setIsPaused(false); };
    utteranceRef.current = utterance;
    window.speechSynthesis.speak(utterance);
  }, [isSupported]);

  const pause = useCallback(() => {
    if (!isSupported || !isSpeaking) return;
    window.speechSynthesis.pause();
    setIsPaused(true);
  }, [isSupported, isSpeaking]);

  const resume = useCallback(() => {
    if (!isSupported || !isPaused) return;
    window.speechSynthesis.resume();
    setIsPaused(false);
  }, [isSupported, isPaused]);

  // Never leaves speech running behind after the component using this
  // hook unmounts (e.g. the person closes the session mid-sentence).
  useEffect(() => () => { if (isSupported) window.speechSynthesis.cancel(); }, [isSupported]);

  return { isSupported, isSpeaking, isPaused, speak, pause, resume, stop };
};
