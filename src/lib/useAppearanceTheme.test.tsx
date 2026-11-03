// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAppearanceTheme } from './useAppearanceTheme';

describe('web appearance preference and live System tracking', () => {
  const callbacks = new Set<(event: MediaQueryListEvent) => void>();
  let systemDark = false;

  beforeEach(() => {
    callbacks.clear();
    systemDark = false;
    localStorage.clear();
    document.documentElement.classList.remove('dark');
    vi.stubGlobal('matchMedia', (_query: string) => ({
      get matches() { return systemDark; },
      addEventListener: (_type: string, fn: (e: MediaQueryListEvent) => void) => callbacks.add(fn),
      removeEventListener: (_type: string, fn: (e: MediaQueryListEvent) => void) => callbacks.delete(fn),
    }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
    document.documentElement.classList.remove('dark');
  });

  const changeSystem = (isDark: boolean) => {
    systemDark = isDark;
    act(() => { callbacks.forEach(fn => fn({ matches: isDark } as MediaQueryListEvent)); });
  };

  it('defaults to System and follows device changes without extra clicks', () => {
    const { result, unmount } = renderHook(() => useAppearanceTheme());
    expect(result.current.mode).toBe('system');
    expect(result.current.darkMode).toBe(false);
    changeSystem(true);
    expect(result.current.darkMode).toBe(true);
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    changeSystem(false);
    expect(result.current.darkMode).toBe(false);
    unmount();
  });

  it('persists a manual override and resumes system tracking on System', () => {
    const { result, unmount } = renderHook(() => useAppearanceTheme());
    act(() => result.current.setMode('light'));
    changeSystem(true);
    expect(result.current.darkMode).toBe(false);
    expect(localStorage.getItem('blaze_theme_mode')).toBe('light');
    unmount();
    const next = renderHook(() => useAppearanceTheme());
    expect(next.result.current.mode).toBe('light');
    act(() => next.result.current.setMode('system'));
    expect(next.result.current.darkMode).toBe(true);
    expect(localStorage.getItem('blaze_theme_mode')).toBe('system');
    next.unmount();
  });

  it('updates another open tab when the saved appearance changes', () => {
    const { result, unmount } = renderHook(() => useAppearanceTheme());
    expect(result.current.mode).toBe('system');
    localStorage.setItem('blaze_theme_mode', 'dark');
    act(() => window.dispatchEvent(new StorageEvent('storage', {
      key: 'blaze_theme_mode', newValue: 'dark',
    })));
    expect(result.current.mode).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    unmount();
  });

  it('migrates the previous dark-mode toggle', () => {
    localStorage.setItem('blaze_dark_mode', 'true');
    const { result, unmount } = renderHook(() => useAppearanceTheme());
    expect(result.current.mode).toBe('dark');
    expect(localStorage.getItem('blaze_theme_mode')).toBe('dark');
    expect(localStorage.getItem('blaze_dark_mode')).toBeNull();
    unmount();
  });
});
