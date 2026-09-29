import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { CheckCircle2, X } from 'lucide-react';
import { auth } from '../lib/firebase';
import { db } from '../lib/firestore';
import { doc, getDoc } from 'firebase/firestore';
import { updateNovaMemoryBySourceAndType } from '../lib/nova-brain';
import { logMovementEvent } from '../lib/movement-analytics';
import { recordMovementHistory, updateMovementPreferences } from '../lib/movement-snacks-service';
import { MovementVoiceControls } from './MovementVoiceControls';

// Section 8's flagship: a physical boundary RITUAL between work and
// personal life, not a 15-minute stretch. Genuinely bespoke - unlike every
// other Movement Snack, this has real interactive decision points (the
// "still carrying it" check-in, the personal closing cue), so it gets its
// own dedicated flow component rather than fitting the generic one-
// instruction-array player.

type Stage = 'posture' | 'release' | 'environment' | 'walk' | 'notice' | 'cue' | 'complete';

const STAGE_ORDER: Stage[] = ['posture', 'release', 'environment', 'walk', 'notice', 'cue', 'complete'];

const WALK_SECONDS = 150;

type CarryingLevel = 'a_little' | 'a_lot' | 'not_really';

const CLOSING_CUES: { id: string; label: string }[] = [
  { id: 'change_clothes', label: 'Change clothes' },
  { id: 'wash_face', label: 'Wash your face' },
  { id: 'make_a_drink', label: 'Make a drink' },
  { id: 'step_outside', label: 'Step outside' },
  { id: 'say_hello', label: 'Say hello to family' },
  { id: 'put_devices_away', label: 'Put work devices away' },
];

interface AfterWorkDecompressionProps {
  onClose: () => void;
  onAwardPoints?: (amount: number, reason: string) => void;
  voiceEnabled: boolean;
}

export const AfterWorkDecompression = ({ onClose, onAwardPoints, voiceEnabled }: AfterWorkDecompressionProps) => {
  const [stage, setStage] = useState<Stage>('posture');
  const [walkSecondsRemaining, setWalkSecondsRemaining] = useState(WALK_SECONDS);
  const [walkPaused, setWalkPaused] = useState(false);
  const [carrying, setCarrying] = useState<CarryingLevel | null>(null);
  const [carryingNote, setCarryingNote] = useState('');
  const [selectedCue, setSelectedCue] = useState<string | null>(null);
  const [customCue, setCustomCue] = useState('');
  const [savedPreviousCue, setSavedPreviousCue] = useState<string | null>(null);

  useEffect(() => {
    logMovementEvent('movement_started', { movementId: 'after_work', category: 'transition' });
    if (auth.currentUser) {
      recordMovementHistory(auth.currentUser.uid, { movementId: 'after_work', context: 'switch_off_work', skipped: false }).catch(() => {});
      getDoc(doc(db, 'users', auth.currentUser.uid, 'movementPreferences', 'main')).then((snap) => {
        const cue = snap.exists() ? (snap.data().preferredAfterWorkCue as string | undefined) : undefined;
        if (cue) setSavedPreviousCue(cue);
      }).catch(() => {});
    }
    // Deliberately empty deps - this flow only ever starts once per visit,
    // and re-running it on every render would re-log a fresh "started"
    // event and re-fetch the saved cue repeatedly.
  }, []);

  useEffect(() => {
    if (stage !== 'walk' || walkPaused || walkSecondsRemaining <= 0) return;
    const t = window.setTimeout(() => setWalkSecondsRemaining((s) => s - 1), 1000);
    return () => window.clearTimeout(t);
  }, [stage, walkPaused, walkSecondsRemaining]);

  const goNext = () => setStage((s) => STAGE_ORDER[STAGE_ORDER.indexOf(s) + 1] || 'complete');

  const handleStop = () => {
    logMovementEvent('movement_skipped', { movementId: 'after_work', category: 'transition' });
    if (auth.currentUser) {
      recordMovementHistory(auth.currentUser.uid, { movementId: 'after_work', context: 'switch_off_work', skipped: true }).catch(() => {});
    }
    onClose();
  };

  const handleCarryingPick = (level: CarryingLevel) => {
    setCarrying(level);
    if (level === 'not_really') goNext();
  };

  const handleSaveCarryingNote = () => {
    if (carryingNote.trim()) {
      updateNovaMemoryBySourceAndType('Movement Snacks', 'state', {
        content: `After work, noted something needing tomorrow's attention: "${carryingNote.trim().slice(0, 200)}"`,
        confidence: 'medium',
        canEdit: true,
      });
    }
    goNext();
  };

  const finalCueLabel = selectedCue === 'something_else' ? customCue.trim() : CLOSING_CUES.find((c) => c.id === selectedCue)?.label;

  const handleFinishCue = () => {
    if (auth.currentUser && finalCueLabel) {
      updateMovementPreferences(auth.currentUser.uid, { preferredAfterWorkCue: finalCueLabel }).catch(() => {});
    }
    goNext();
  };

  const handleComplete = () => {
    logMovementEvent('movement_completed', { movementId: 'after_work', category: 'transition' });
    if (onAwardPoints) onAwardPoints(10, 'Completed After-Work Decompression');
    updateNovaMemoryBySourceAndType('Movement Snacks', 'state', {
      content: 'Completed After-Work Decompression - the physical boundary between work and the rest of the day.',
      confidence: 'verified',
      canEdit: true,
    });
  };

  useEffect(() => {
    if (stage === 'complete') handleComplete();
    // Deliberately keyed only on stage - handleComplete is recreated each
    // render (it closes over local state), and including it would fire
    // this effect on every render rather than only the one transition into
    // 'complete'.
  }, [stage]);

  const walkMinutesLabel = `${Math.floor(walkSecondsRemaining / 60)}:${String(walkSecondsRemaining % 60).padStart(2, '0')}`;

  return (
    <div className="fixed inset-0 z-[90] bg-background/95 backdrop-blur-sm flex items-start sm:items-center justify-center p-4 overflow-y-auto">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-xl bg-card border border-border/40 rounded-2xl p-8 space-y-8 my-8">
        <div className="flex items-center justify-between">
          <h3 className="text-xl font-display font-bold text-text-main">After-Work Decompression</h3>
          <button onClick={handleStop} aria-label="Stop" className="text-text-muted hover:text-text-main"><X className="w-4 h-4" /></button>
        </div>

        <AnimatePresence mode="wait">
          {stage === 'posture' && (
            <motion.div key="posture" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-6 text-center py-4">
              <h4 className="text-2xl font-display font-bold text-text-main">Stand up and step away from where you've been working</h4>
              <p className="text-base text-text-muted">Close the laptop or leave the workspace behind, if you can.</p>
              {voiceEnabled && <MovementVoiceControls text="Stand up and step away from where you've been working. Close the laptop or leave the workspace behind, if you can." enabled={voiceEnabled} />}
              <button onClick={goNext} className="btn-primary bg-success hover:bg-success border-success text-white">Continue</button>
            </motion.div>
          )}

          {stage === 'release' && (
            <motion.div key="release" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-6 text-center py-4">
              <h4 className="text-2xl font-display font-bold text-text-main">Drop your shoulders. Unclench your hands. Let your jaw soften.</h4>
              {voiceEnabled && <MovementVoiceControls text="Drop your shoulders. Unclench your hands. Let your jaw soften." enabled={voiceEnabled} />}
              <button onClick={goNext} className="btn-primary bg-success hover:bg-success border-success text-white">Continue</button>
            </motion.div>
          )}

          {stage === 'environment' && (
            <motion.div key="environment" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-6 text-center py-4">
              <h4 className="text-2xl font-display font-bold text-text-main">Move somewhere different</h4>
              <p className="text-base text-text-muted">Another room, outside, or simply away from your desk.</p>
              {voiceEnabled && <MovementVoiceControls text="Move somewhere different. Another room, outside, or simply away from your desk." enabled={voiceEnabled} />}
              <button onClick={goNext} className="btn-primary bg-success hover:bg-success border-success text-white">Continue</button>
            </motion.div>
          )}

          {stage === 'walk' && (
            <motion.div key="walk" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-6 text-center py-4">
              <h4 className="text-2xl font-display font-bold text-text-main">Walk for a few minutes</h4>
              <p className="text-base text-text-muted">No pace target, no steps target - this is a transition, not exercise.</p>
              <p className="text-4xl font-display font-black text-success">{walkMinutesLabel}</p>
              <div className="flex items-center justify-center gap-3">
                <button onClick={() => setWalkPaused((p) => !p)} className="px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest text-text-muted hover:text-text-main">
                  {walkPaused ? 'Resume' : 'Pause'}
                </button>
                <button onClick={goNext} className="btn-primary bg-success hover:bg-success border-success text-white">
                  {walkSecondsRemaining > 0 ? 'Skip' : 'Continue'}
                </button>
              </div>
            </motion.div>
          )}

          {stage === 'notice' && (
            <motion.div key="notice" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-6 text-center py-4">
              {carrying === null ? (
                <>
                  <h4 className="text-2xl font-display font-bold text-text-main">Is work still running in your head?</h4>
                  <div className="flex flex-wrap justify-center gap-3">
                    <button onClick={() => handleCarryingPick('a_little')} className="px-5 py-3 rounded-xl border border-border hover:border-success/50 hover:bg-surface dark:hover:bg-surface text-sm font-bold text-text-main">A little</button>
                    <button onClick={() => handleCarryingPick('a_lot')} className="px-5 py-3 rounded-xl border border-border hover:border-success/50 hover:bg-surface dark:hover:bg-surface text-sm font-bold text-text-main">A lot</button>
                    <button onClick={() => handleCarryingPick('not_really')} className="px-5 py-3 rounded-xl border border-border hover:border-success/50 hover:bg-surface dark:hover:bg-surface text-sm font-bold text-text-main">Not really</button>
                  </div>
                </>
              ) : (
                <>
                  <p className="text-lg text-text-muted font-medium">You don't need to solve it now. Make a note if something genuinely needs tomorrow's attention.</p>
                  <input
                    type="text"
                    value={carryingNote}
                    onChange={(e) => setCarryingNote(e.target.value.slice(0, 200))}
                    placeholder="One short note (optional)"
                    className="w-full max-w-md mx-auto block p-3 rounded-xl border border-border/40 bg-white dark:bg-surface text-sm text-text-main"
                  />
                  <button onClick={handleSaveCarryingNote} className="btn-primary bg-success hover:bg-success border-success text-white">Continue</button>
                </>
              )}
            </motion.div>
          )}

          {stage === 'cue' && (
            <motion.div key="cue" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-6 text-center py-4">
              <h4 className="text-2xl font-display font-bold text-text-main">How will you mark that work is finished?</h4>
              {savedPreviousCue && <p className="text-xs text-text-muted">Last time: {savedPreviousCue}</p>}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {CLOSING_CUES.map((cue) => (
                  <button
                    key={cue.id}
                    onClick={() => setSelectedCue(cue.id)}
                    aria-pressed={selectedCue === cue.id}
                    className={`px-3 py-2.5 rounded-xl text-xs font-bold border transition-all ${selectedCue === cue.id ? 'bg-success border-success text-white' : 'border-border hover:border-success/50 text-text-main'}`}
                  >
                    {cue.label}
                  </button>
                ))}
                <button
                  onClick={() => setSelectedCue('something_else')}
                  aria-pressed={selectedCue === 'something_else'}
                  className={`px-3 py-2.5 rounded-xl text-xs font-bold border transition-all ${selectedCue === 'something_else' ? 'bg-success border-success text-white' : 'border-border hover:border-success/50 text-text-main'}`}
                >
                  Something else
                </button>
              </div>
              {selectedCue === 'something_else' && (
                <input
                  type="text"
                  value={customCue}
                  onChange={(e) => setCustomCue(e.target.value.slice(0, 60))}
                  placeholder="Your own cue"
                  className="w-full max-w-md mx-auto block p-3 rounded-xl border border-border/40 bg-white dark:bg-surface text-sm text-text-main"
                />
              )}
              <div className="flex items-center justify-center gap-3">
                <button onClick={goNext} className="text-xs font-black uppercase tracking-widest text-text-muted hover:text-text-main">Skip</button>
                <button onClick={handleFinishCue} disabled={!selectedCue || (selectedCue === 'something_else' && !customCue.trim())} className="btn-primary bg-success hover:bg-success border-success text-white disabled:opacity-40">
                  Continue
                </button>
              </div>
            </motion.div>
          )}

          {stage === 'complete' && (
            <motion.div key="complete" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} role="status" aria-live="polite" className="flex flex-col items-center text-center py-10 space-y-6">
              <div className="w-20 h-20 bg-success rounded-full flex items-center justify-center text-white shadow-xl shadow-success/20">
                <CheckCircle2 className="w-10 h-10" />
              </div>
              <h4 className="text-2xl font-display font-bold text-text-main">Work has ended. You don't have to keep carrying it in your body.</h4>
              <button onClick={onClose} className="btn-primary bg-primary hover:bg-primary border-primary text-primary-foreground">Done</button>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
};
