import React, { useState, useEffect } from 'react';
import { Target, CheckCircle } from 'lucide-react';
import { cn } from '../lib/utils';
import { SHIPStage } from '../types';

import { auth } from '../lib/firebase';
import { ConnectedGoals } from './ConnectedRecoveryModules.tsx';

export const DailyGoal = ({ shipStage }: { shipStage: SHIPStage }) => {
  if (auth.currentUser) return <ConnectedGoals />;
  const [goal, setGoal] = useState<string>('');
  const [isCommitted, setIsCommitted] = useState(false);

  useEffect(() => {
    const savedGoal = localStorage.getItem('blaze_daily_goal');
    const savedDate = localStorage.getItem('blaze_daily_goal_date');
    const today = new Date().toISOString().split('T')[0];
    
    if (savedGoal && savedDate === today) {
      setGoal(savedGoal);
      setIsCommitted(true);
    } else {
      setGoal('');
      setIsCommitted(false);
    }
  }, []);

  const handleCommit = () => {
    if (!goal.trim()) return;
    setIsCommitted(true);
    localStorage.setItem('blaze_daily_goal', goal);
    localStorage.setItem('blaze_daily_goal_date', new Date().toISOString().split('T')[0]);
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
            disabled={!goal.trim()}
            className="btn-primary py-3 px-6 whitespace-nowrap opacity-90 hover:opacity-100 disabled:opacity-50"
          >
            Commit
          </button>
        </div>
      ) : (
        <div className="mt-4 p-4 rounded-xl bg-success/10 border border-success/20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <CheckCircle className="w-5 h-5 text-success shrink-0" />
            <span className="font-semibold text-success-foreground dark:text-success">{goal}</span>
          </div>
          <button 
            onClick={() => {
              setIsCommitted(false);
              setGoal('');
              localStorage.removeItem('blaze_daily_goal');
            }}
            className="text-xs font-black uppercase tracking-widest text-success hover:text-success-foreground  hover:opacity-100"
          >
            Reset
          </button>
        </div>
      )}
    </div>
  );
};
