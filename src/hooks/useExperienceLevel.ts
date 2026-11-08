import { useCallback, useEffect, useRef, useState } from 'react';
import { secureApiFetch, SecureApiError } from '../lib/secure-api';
import { DEFAULT_EXPERIENCE_LEVEL, isExperienceLevel, type ExperienceLevel } from '../../experience-level';

// Loads and saves the signed-in customer's experience level (a display
// preference). Bound to the uid: switching accounts resets to the default
// before the new account's saved choice loads, so one person's choice is
// never shown to another. Guests (no uid) just use the default locally.
export function useExperienceLevel(uid: string | null | undefined) {
  const [level, setLevelState] = useState<ExperienceLevel>(DEFAULT_EXPERIENCE_LEVEL);
  const [error, setError] = useState<string | null>(null);
  const currentUid = useRef(uid);

  useEffect(() => {
    currentUid.current = uid;
    setLevelState(DEFAULT_EXPERIENCE_LEVEL);
    setError(null);
    if (!uid) return;
    let cancelled = false;
    secureApiFetch('/api/user/preferences/experience-level')
      .then((res) => res.json())
      .then((body) => {
        if (!cancelled && currentUid.current === uid && isExperienceLevel(body?.level)) setLevelState(body.level);
      })
      .catch(() => {
        // Non-critical: the default (Novice) view still shows every essential tool.
      });
    return () => { cancelled = true; };
  }, [uid]);

  const setLevel = useCallback(async (next: ExperienceLevel) => {
    const previous = level;
    setLevelState(next);
    setError(null);
    if (!uid) return;
    try {
      await secureApiFetch('/api/user/preferences/experience-level', { method: 'PUT', data: { level: next } });
    } catch (err) {
      if (currentUid.current !== uid) return;
      setLevelState(previous);
      setError(err instanceof SecureApiError ? err.message : 'Your choice could not be saved. Please try again.');
    }
  }, [level, uid]);

  return { level, setLevel, error };
}
