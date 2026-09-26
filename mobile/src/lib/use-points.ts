// Mobile equivalent of App.tsx's awardPoints (../../../src/App.tsx:1698) -
// same split web uses: awarding points is a local state bump, persistence
// is a separate write to the same user_stats/core doc
// (../../../src/App.tsx:1602-1624). Badges/checkBadges are dropped -
// gamification is out of scope for Phase 1 (see the mobile plan).
//
// Deliberately writes only from awardPoints itself, not from a
// useEffect watching `points` - an earlier version used the latter and
// had a real bug: the initial load's own setPoints(loadedValue) call
// would trigger that effect too, writing the just-read value straight
// back to Firestore on every mount that had existing points (redundant
// every time, and a genuine race if awardPoints fired before the load
// resolved - the load's setPoints would then stomp the just-awarded
// local value with a stale one). Writing directly inside awardPoints's
// functional state updater sidesteps both: it only ever writes on a
// real award, using the true current value, regardless of whether the
// initial load has resolved yet.
import { useCallback, useEffect, useState } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { getDb, auth } from './firebase';

export function usePoints() {
  const [points, setPoints] = useState(0);

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    let cancelled = false;
    (async () => {
      try {
        const db = await getDb();
        const snap = await getDoc(doc(db, 'users', uid, 'user_stats', 'core'));
        if (!cancelled && snap.exists() && typeof snap.data().points === 'number') {
          setPoints(snap.data().points);
        }
      } catch {
        // Non-fatal - starts from 0 if the read fails.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const awardPoints = useCallback((amount: number) => {
    setPoints((prev) => {
      const next = prev + amount;
      const uid = auth.currentUser?.uid;
      if (uid) {
        getDb()
          .then((db) =>
            setDoc(doc(db, 'users', uid, 'user_stats', 'core'), { points: next, updatedAt: new Date().toISOString() }, { merge: true })
          )
          .catch(() => {
            // Non-fatal - the UI still reflects the change locally even if this save fails.
          });
      }
      return next;
    });
  }, []);

  return { points, awardPoints };
}
