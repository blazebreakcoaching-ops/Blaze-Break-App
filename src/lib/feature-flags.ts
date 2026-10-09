import { useState, useEffect } from 'react';
import { FeatureFlagId, DEFAULT_FEATURE_FLAGS } from '../../feature-flag-ids';

// The actual flag id union + defaults now live in feature-flag-ids.ts (a
// pure, dependency-free root file) so server.ts's Evolution Engine
// registry migration can share the exact same real flag-id list without
// pulling this file's React/localStorage/window code into the server
// bundle. This file keeps its existing public API unchanged.
export type FeatureFlag = FeatureFlagId;
const DEFAULT_FLAGS = DEFAULT_FEATURE_FLAGS;

export const getFeatureFlags = (): Record<FeatureFlag, boolean> => {
  try {
    const stored = localStorage.getItem('blaze_feature_flags');
    if (stored) {
      return { ...DEFAULT_FLAGS, ...JSON.parse(stored) };
    }
  } catch (e) {
    // Non-fatal - if localStorage is unavailable or the saved value is
    // corrupted, the flags just fall back to their in-memory defaults.
  }
  return DEFAULT_FLAGS;
};

export const setFeatureFlag = (flag: FeatureFlag, value: boolean) => {
  const flags = getFeatureFlags();
  flags[flag] = value;
  localStorage.setItem('blaze_feature_flags', JSON.stringify(flags));
  window.dispatchEvent(new Event('feature-flags-updated'));
};

export const useFeatureFlags = () => {
  const [flags, setFlags] = useState<Record<FeatureFlag, boolean>>(getFeatureFlags());

  useEffect(() => {
    const handleUpdate = () => {
      setFlags(getFeatureFlags());
    };
    
    window.addEventListener('feature-flags-updated', handleUpdate);
    return () => window.removeEventListener('feature-flags-updated', handleUpdate);
  }, []);

  return flags;
};
