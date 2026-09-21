import React from 'react';
import { useAuth } from './auth';

export const AuthStatusTracker = () => {
  const { user, loading, signIn, logOut } = useAuth();
  
  if (loading) {
     return <div className="h-12 w-12 animate-pulse rounded-full bg-border dark:bg-surface" />;
  }

  if (user) {
    return (
      <button
        onClick={logOut}
        className="h-12 flex items-center gap-2 group p-1 pr-3 rounded-full hover:bg-surface dark:bg-card transition-colors"
      >
        <img src={user.photoURL || `https://ui-avatars.com/api/?name=${user.email}`} alt="Avatar" className="w-10 h-10 rounded-full" />
        <span className="text-xs font-bold text-text-muted hidden 2xl:inline-block">Sign Out</span>
      </button>
    );
  }

  return (
    <button
      onClick={signIn}
      className="h-12 btn-primary px-4 rounded-full text-xs font-black uppercase tracking-widest"
    >
      Sign In
    </button>
  );
};
