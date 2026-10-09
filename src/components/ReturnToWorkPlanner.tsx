import { useEffect, useState } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth } from '../lib/firebase';
import { db } from '../lib/firestore';
import { cn } from '../lib/utils';

// Return-to-Work Planner's real new home - a specialist, contextual
// pathway (per the spec: not part of general daily navigation), reusing
// the same preferences/recovery_intelligence.rtwPhase/meetingLimit fields
// the legacy Hub already wrote. No points are awarded - the legacy Hub's
// own "+10pts" award for this is gone along with it. The manager-script
// generator now reads the real meetingLimit value instead of a hardcoded
// number, and uses plain, human language rather than phrases like
// "my profile is restricted to 3 active meeting allocations."

const PHASES = [
  { phase: 1, name: 'Phase 1: Orientation', description: 'Keep calls to a minimum while getting re-oriented.' },
  { phase: 2, name: 'Phase 2: Graduated', description: 'Take on a limited, steady number of meetings.' },
  { phase: 3, name: 'Phase 3: Autonomy', description: 'Set your own boundaries going forward.' },
];

const buildManagerScript = (phase: number, meetingLimit: number): string => {
  if (phase === 1) {
    return `I'm returning gradually, so I'm keeping meetings very light this week - aiming for no more than ${meetingLimit} today. Could we handle anything non-essential asynchronously?`;
  }
  if (phase === 2) {
    return `I'm still easing back in, so I'm keeping my day to around ${meetingLimit} meetings. Could we handle anything non-essential asynchronously?`;
  }
  return "I'm back to setting my own boundaries day to day - I'll flag if a particular day needs to be lighter.";
};

export const ReturnToWorkPlanner = () => {
  const [phase, setPhase] = useState(1);
  const [meetingLimit, setMeetingLimit] = useState(1);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    getDoc(doc(db, 'users', uid, 'preferences', 'recovery_intelligence'))
      .then((snap) => {
        if (snap.exists()) {
          const data = snap.data();
          if (typeof data.rtwPhase === 'number') setPhase(data.rtwPhase);
          if (typeof data.meetingLimit === 'number') setMeetingLimit(data.meetingLimit);
        }
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, []);

  const save = async (nextPhase: number, nextLimit: number) => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    setPhase(nextPhase);
    setMeetingLimit(nextLimit);
    try {
      await setDoc(doc(db, 'users', uid, 'preferences', 'recovery_intelligence'), {
        rtwPhase: nextPhase, meetingLimit: nextLimit, updatedAt: new Date().toISOString(),
      }, { merge: true });
    } catch (e) {
      // Non-fatal - the widget still reflects the change locally even if this particular save fails.
    }
  };

  if (!loaded) return null;

  return (
    <div className="space-y-6">
      <p className="text-xs text-text-muted">Set a practical limit on meetings while returning from leave or a high-stress absence.</p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {PHASES.map((p) => (
          <button
            key={p.phase}
            onClick={() => save(p.phase, meetingLimit)}
            className={cn(
              'p-4 rounded-xl border text-left flex flex-col gap-2',
              phase === p.phase ? 'bg-primary/10 border-primary/50 text-primary' : 'border-border text-text-muted'
            )}
          >
            <span className="text-xs font-bold">{p.name}</span>
            <p className="text-xs leading-relaxed">{p.description}</p>
          </button>
        ))}
      </div>

      {phase !== 3 && (
        <div className="space-y-2">
          <label htmlFor="rtw-meeting-limit" className="text-xs font-bold block">Meeting limit for today: {meetingLimit}</label>
          <input
            id="rtw-meeting-limit"
            type="range" min={1} max={6} value={meetingLimit}
            onChange={(e) => save(phase, parseInt(e.target.value, 10))}
            className="w-full"
            aria-valuetext={`${meetingLimit} meetings`}
          />
        </div>
      )}

      <div className="space-y-2 p-4 bg-surface rounded-xl border border-border">
        <h4 className="text-xs font-bold uppercase tracking-wider text-text-muted">A message you could send your manager</h4>
        <p className="p-3 bg-card rounded-lg text-xs italic text-text-muted border border-border">
          "{buildManagerScript(phase, meetingLimit)}"
        </p>
      </div>
    </div>
  );
};
