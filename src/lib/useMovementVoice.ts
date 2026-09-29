import { useRef, useState, useCallback, useEffect } from 'react';

// Movement Snacks' optional spoken guidance (section 25) - narrates fixed,
// already-decided instruction text one step at a time, not a live
// conversation. Same reasoning as useGroundingVoice.ts: the browser's own
// SpeechSynthesis API is the right tool here (zero additional AI cost,
// native pause/resume/cancel), not Nova's live-voice architecture, which is
// built for bidirectional conversation and costs real voice-minute quota.
// Kept as its own small hook rather than importing Grounding's, so Movement
// Snacks has no dependency on an unrelated feature area's module.

export interface MovementVoiceControls {
  isSupported: boolean;
  isSpeaking: boolean;
  isPaused: boolean;
  speak: (text: string) => void;
  pause: () => void;
  resume: () => void;
  stop: () => void;
}

export const useMovementVoice = (): MovementVoiceControls => {
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
    // Calm but natural pacing - slower than default, never the exaggerated
    // slow-whisper meditation-app style (section 25's "keep voice guidance
    // brief" - short instructions, read plainly).
    utterance.rate = 0.95;
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

  // Never leaves speech running behind after the component using this hook
  // unmounts (e.g. the person stops the movement mid-instruction).
  useEffect(() => () => { if (isSupported) window.speechSynthesis.cancel(); }, [isSupported]);

  return { isSupported, isSpeaking, isPaused, speak, pause, resume, stop };
};
