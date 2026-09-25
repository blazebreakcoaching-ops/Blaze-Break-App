// Mobile equivalent of App.tsx's awardPoints (../../../src/App.tsx:1698) -
// same split web uses: awarding points is a local state bump, persistence
// is a SEPARATE debounced merge-write to the same user_stats/core doc
// (../../../src/App.tsx:1602-1624). Badges/checkBadges are dropped -
// gamification is out of scope for Phase 1 (see the mobile plan).
import { useCallback, useEffect, useRef, useState } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { getDb, auth } from './firebase';

export function usePoints() {
  const [points, setPoints] = useState(0);
  const loadedRef = useRef(false);

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    (async () => {
      try {
        const db = await getDb();
        const snap = await getDoc(doc(db, 'users', uid, 'user_stats', 'core'));
        if (snap.exists() && typeof snap.data().points === 'number') {
          setPoints(snap.data().points);
        }
      } catch {
        // Non-fatal - starts from 0 if the read fails.
      } finally {
        loadedRef.current = true;
      }
    })();
  }, []);

  useEffect(() => {
    if (!loadedRef.current) return;
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    const t = setTimeout(async () => {
      try {
        const db = await getDb();
        await setDoc(
          doc(db, 'users', uid, 'user_stats', 'core'),
          { points, updatedAt: new Date().toISOString() },
          { merge: true }
        );
      } catch {
        // Non-fatal - the UI still reflects the change locally even if this save fails.
      }
    }, 800);
    return () => clearTimeout(t);
  }, [points]);

  const awardPoints = useCallback((amount: number) => {
    setPoints((prev) => prev + amount);
  }, []);

  return { points, awardPoints };
}
