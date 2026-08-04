import React from 'react';
import { useAuth } from './auth';
import { BurnoutFingerprint, UserStats } from '../types';

interface SyncEngineProps {
  stats: UserStats;
  setStats: React.Dispatch<React.SetStateAction<UserStats>>;
  fingerprint: BurnoutFingerprint | null;
  setFingerprint: React.Dispatch<React.SetStateAction<BurnoutFingerprint | null>>;
}

export const SyncEngine: React.FC<SyncEngineProps> = ({ stats, setStats, fingerprint, setFingerprint }) => {
  // Phase 1C: Sensitive recovery data syncing is entirely disabled in Secure Account Test Mode.
  // We do not load or save stats, fingerprints, or local storage partitions to Firestore here.
  return null;
};

export const AuthStatusTracker = () => {
  const { user, loading, signIn, logOut } = useAuth();
  
  if (loading) {
     return <div className="animate-pulse w-8 h-8 rounded-full bg-border dark:bg-surface" />;
  }

  if (user) {
    return (
      <button 
        onClick={logOut}
        className="flex items-center gap-2 group p-1 pr-3 rounded-full hover:bg-surface dark:bg-card transition-colors"
      >
        <img src={user.photoURL || `https://ui-avatars.com/api/?name=${user.email}`} alt="Avatar" className="w-8 h-8 rounded-full" />
        <span className="text-xs font-bold text-text-muted hidden sm:inline-block">Sign Out</span>
      </button>
    );
  }

  return (
    <button 
      onClick={signIn}
      className="btn-primary px-4 py-2 rounded-full text-xs font-black uppercase tracking-widest"
    >
      Sign In
    </button>
  );
};
