import { useEffect, useState } from 'react';
import {
  APPEARANCE_STORAGE_KEY, LEGACY_DARK_MODE_KEY,
  isDarkAppearance, readAppearanceMode, type AppearanceMode,
} from './appearance-theme';

const QUERY = '(prefers-color-scheme: dark)';

export function useAppearanceTheme() {
  const [mode, setMode] = useState<AppearanceMode>(() => {
    if (typeof window === 'undefined') return 'system';
    try {
      return readAppearanceMode(
        window.localStorage.getItem(APPEARANCE_STORAGE_KEY),
        window.localStorage.getItem(LEGACY_DARK_MODE_KEY),
      );
    } catch {
      return 'system';
    }
  });
  const [systemDark, setSystemDark] = useState(() =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia(QUERY).matches : false,
  );

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const query = window.matchMedia(QUERY);
    const onChange = (event: MediaQueryListEvent) => setSystemDark(event.matches);
    if (query.addEventListener) {
      query.addEventListener('change', onChange);
      return () => query.removeEventListener('change', onChange);
    }
    // Compatibility with older WebKit.
    query.addListener(onChange);
    return () => query.removeListener(onChange);
  }, []);

  const darkMode = isDarkAppearance(mode, systemDark);
  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
    document.documentElement.style.colorScheme = darkMode ? 'dark' : 'light';
  }, [darkMode]);

  useEffect(() => {
    try {
      localStorage.setItem(APPEARANCE_STORAGE_KEY, mode);
      localStorage.removeItem(LEGACY_DARK_MODE_KEY);
    } catch {
      // In private/blocked storage the setting still works for this session.
    }
  }, [mode]);

  return { mode, setMode, darkMode };
}
