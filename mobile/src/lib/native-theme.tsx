import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Appearance, useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  NATIVE_APPEARANCE_KEY, NATIVE_COLORS,
  nativeIsDark, parseNativeAppearance,
  type NativeAppearanceMode, type NativeThemeColors,
} from './native-theme-palette';

type NativeThemeValue = {
  mode: NativeAppearanceMode;
  setMode: (mode: NativeAppearanceMode) => void;
  isDark: boolean;
  colors: NativeThemeColors;
  ready: boolean;
};

const NativeThemeContext = createContext<NativeThemeValue | null>(null);

export function NativeThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setStoredMode] = useState<NativeAppearanceMode>('system');
  const [ready, setReady] = useState(false);
  // React Native subscribes to OS changes; unlike a one-time Appearance
  // lookup, System mode switches live when device appearance changes.
  const systemMode = useColorScheme();

  useEffect(() => {
    let active = true;
    void AsyncStorage.getItem(NATIVE_APPEARANCE_KEY)
      .then(value => { if (active) setStoredMode(parseNativeAppearance(value)); })
      .catch(() => { /* OS policy can block local storage; System still works. */ })
      .finally(() => { if (active) setReady(true); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!ready) return;
    // React Native 0.86 uses 'unspecified' (NOT 'auto') to remove
    // an app-level override, following OS appearance again. Aligns native
    // Alerts, Pickers and system-owned surfaces as well as app colours.
    Appearance.setColorScheme(mode === 'system' ? 'unspecified' : mode);
  }, [mode, ready]);

  const setMode = useCallback((next: NativeAppearanceMode) => {
    const validated = parseNativeAppearance(next);
    setStoredMode(validated);
    void AsyncStorage.setItem(NATIVE_APPEARANCE_KEY, validated).catch(() => {
      // Session appearance continues to work when persistence is blocked.
    });
  }, []);

  const isDark = nativeIsDark(mode, systemMode === 'dark');
  const colors: NativeThemeColors = isDark ? NATIVE_COLORS.dark : NATIVE_COLORS.light;
  const value = useMemo<NativeThemeValue>(
    () => ({ mode, setMode, isDark, colors, ready }), [mode, setMode, isDark, colors, ready],
  );
  return <NativeThemeContext.Provider value={value}>{children}</NativeThemeContext.Provider>;
}

export function useNativeTheme(): NativeThemeValue {
  const value = useContext(NativeThemeContext);
  if (!value) throw new Error('NativeThemeProvider is required');
  return value;
}
