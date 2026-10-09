import { useEffect, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth } from '../lib/firebase';
import { db } from '../lib/firestore';

// Focus Shield's real new home (moved out of the staff-only Recovery
// Intelligence Hub, which an ordinary user could never reach). Reads and
// writes the exact same preferences/recovery_intelligence.isFocusShieldActive
// field the Hub already uses - a single shared doc, not a second copy of
// the same boolean, so whichever surface a person uses stays in sync. No
// points are awarded for toggling this - it's a real boundary control, not
// something to gamify.
export const FocusShieldControl = () => {
  const [active, setActive] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    getDoc(doc(db, 'users', uid, 'preferences', 'recovery_intelligence'))
      .then((snap) => {
        if (snap.exists() && typeof snap.data().isFocusShieldActive === 'boolean') {
          setActive(snap.data().isFocusShieldActive);
        }
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, []);

  const toggle = async () => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    const next = !active;
    setActive(next);
    try {
      await setDoc(doc(db, 'users', uid, 'preferences', 'recovery_intelligence'), {
        isFocusShieldActive: next, updatedAt: new Date().toISOString(),
      }, { merge: true });
    } catch (e) {
      setActive(!next); // Revert on failure rather than show a state that didn't actually save.
    }
  };

  if (!loaded) return null;

  return (
    <div className="bg-surface p-4 rounded-xl border border-border flex items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        <ShieldCheck className={active ? 'w-5 h-5 text-primary' : 'w-5 h-5 text-text-muted'} />
        <div>
          <div className="font-bold text-sm">Focus Shield</div>
          <div className="text-xs text-text-muted">Mutes non-urgent interruptions while it's on.</div>
        </div>
      </div>
      <button
        onClick={toggle}
        aria-pressed={active}
        className={active ? 'btn-primary px-4 py-2 text-xs' : 'px-4 py-2 text-xs rounded-lg border border-border text-text-muted'}
      >
        {active ? 'On' : 'Off'}
      </button>
    </div>
  );
};
