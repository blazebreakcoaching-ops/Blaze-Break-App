import { useEffect } from 'react';
import { Volume2, Pause, RotateCcw, VolumeX } from 'lucide-react';
import { useGroundingVoice } from '../lib/useGroundingVoice';

// Small, reusable playback bar for voice-guided grounding (section 10-11).
// The prompt text is always visible on screen regardless of this
// component's state - that's this app's "captions," for free, rather
// than a separate transcript feature. Renders nothing at all when voice
// guidance is off or the browser doesn't support speech synthesis
// (section 35's graceful fallback - grounding never depends on this).
interface GroundingVoiceControlsProps {
  text: string;
  enabled: boolean;
}

export const GroundingVoiceControls = ({ text, enabled }: GroundingVoiceControlsProps) => {
  const { isSupported, isSpeaking, isPaused, speak, pause, resume, stop } = useGroundingVoice();

  useEffect(() => {
    if (enabled && isSupported && text.trim()) speak(text);
    return () => stop();
    // Deliberately keyed only on text/enabled, not the speak/stop
    // callbacks - those are stable across renders in practice, and
    // re-running this effect on every render would restart narration
    // mid-sentence.
  }, [text, enabled]);

  if (!enabled || !isSupported) return null;

  return (
    <div className="flex items-center gap-2 text-text-muted">
      {isSpeaking && !isPaused ? (
        <button onClick={pause} aria-label="Pause narration" className="p-1.5 hover:text-text-main"><Pause className="w-3.5 h-3.5" /></button>
      ) : isPaused ? (
        <button onClick={resume} aria-label="Resume narration" className="p-1.5 hover:text-text-main"><Volume2 className="w-3.5 h-3.5" /></button>
      ) : null}
      <button onClick={() => speak(text)} aria-label="Replay narration" className="p-1.5 hover:text-text-main"><RotateCcw className="w-3.5 h-3.5" /></button>
      <button onClick={stop} aria-label="Skip narration" className="p-1.5 hover:text-text-main"><VolumeX className="w-3.5 h-3.5" /></button>
    </div>
  );
};
