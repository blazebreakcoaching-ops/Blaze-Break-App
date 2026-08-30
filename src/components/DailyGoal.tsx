import React, { useState, useEffect } from 'react';
import { Target, CheckCircle, Loader2 } from 'lucide-react';
import { SHIPStage } from '../types';
import { collection, doc, setDoc, getDocs, query, orderBy, limit } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';

export const DailyGoal = ({ shipStage }: { shipStage: SHIPStage }) => {
  const [goal, setGoal] = useState<string>('');
  const [isCommitted, setIsCommitted] = useState(false);
  const [todaysGoalId, setTodaysGoalId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const uid = auth.currentUser?.uid;

  // Reuses the existing `goals` collection and Firestore rules as-is - a
  // goal created today, under this widget's convention, IS today's SHIP
  // commitment. No new collection or rules needed for this distinct,
  // single-commitment UX to be genuinely real and persisted.
  const checkTodaysGoal = async () => {
    if (!uid) return;
    setLoading(true);
    try {
      const today = new Date().toISOString().split('T')[0];
      const q = query(collection(db, 'users', uid, 'goals'), orderBy('createdAt', 'desc'), limit(1));
      const snap = await getDocs(q);
      const latest = snap.docs[0];
      if (latest && latest.data().createdAt?.startsWith(today) && latest.data().category === 'daily_ship_commitment') {
        setGoal(latest.data().title || '');
        setTodaysGoalId(latest.id);
        setIsCommitted(true);
      } else {
        setGoal('');
        setTodaysGoalId(null);
        setIsCommitted(false);
      }
    } catch (e) {
      console.error("Could not load today's goal:", e);
    }
    setLoading(false);
  };

  useEffect(() => { checkTodaysGoal(); }, [uid]);

  const handleCommit = async () => {
    if (!goal.trim() || !uid) return;
    setSaving(true);
    try {
      const id = Date.now().toString();
      await setDoc(doc(db, 'users', uid, 'goals', id), {
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        title: goal.trim(),
        category: 'daily_ship_commitment',
        status: 'active',
      });
      setTodaysGoalId(id);
      setIsCommitted(true);
    } catch (e) {
      console.error("Could not save today's goal:", e);
    }
    setSaving(false);
  };

  const getStageRecommendation = () => {
    switch(shipStage) {
      case 'Safety': return 'E.g., "I will take a 5-minute offline break at 2pm."';
      case 'Habits': return 'E.g., "I will decline any meeting past 4pm."';
      case 'Identity': return 'E.g., "I will write down my energy drains today."';
      case 'Purpose': return 'E.g., "I will reach out to my mentor for advice."';
      default: return 'What is your single focus today?';
    }
  };

  if (loading) {
    return (
      <div className="card bg-white/50 dark:bg-card border-primary/20 relative overflow-hidden group flex items-center justify-center py-8">
        <Loader2 className="w-5 h-5 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="card bg-white/50 dark:bg-card border-primary/20 relative overflow-hidden group">
      <div className="flex items-center gap-4 mb-4">
        <div className="p-2 rounded-xl bg-primary/10 text-primary">
          <Target className="w-5 h-5" />
        </div>
        <div>
          <h3 className="font-display font-bold text-lg text-text-main">Daily SHIP Goal</h3>
          <p className="text-xs font-semibold text-text-muted">Commit to ONE recovery action aligning with your {shipStage} stage.</p>
        </div>
      </div>

      {!isCommitted ? (
        <div className="flex flex-col sm:flex-row gap-3 mt-4">
          <input
            type="text"
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            placeholder={getStageRecommendation()}
            className="flex-1 bg-white dark:bg-surface border border-border rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all text-text-main"
            onKeyDown={(e) => e.key === 'Enter' && handleCommit()}
          />
          <button
            onClick={handleCommit}
            disabled={!goal.trim() || saving}
            className="btn-primary py-3 px-6 whitespace-nowrap opacity-90 hover:opacity-100 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Commit'}
          </button>
        </div>
      ) : (
        <div className="mt-4 p-4 rounded-xl bg-success/10 border border-success/20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <CheckCircle className="w-5 h-5 text-success dark:text-[#4ade80] shrink-0" />
            <span className="font-semibold text-[#166534] dark:text-[#4ade80]">{goal}</span>
          </div>
          <button
            onClick={() => {
              setIsCommitted(false);
              setGoal('');
              setTodaysGoalId(null);
            }}
            className="text-xs font-black uppercase tracking-widest text-[#166534] dark:text-[#4ade80] hover:opacity-70"
          >
            Reset
          </button>
        </div>
      )}
    </div>
  );
};
