import { NATIVE_COLORS, nativeIsDark, parseNativeAppearance } from './native-theme-palette';

describe('native Light Dark System theme', () => {
  it('defaults to device appearance for unconfigured users', () => {
    expect(parseNativeAppearance(null)).toBe('system');
    expect(parseNativeAppearance('broken')).toBe('system');
  });
  it('restores each saved preference', () => {
    for (const value of ['light', 'dark', 'system'] as const) {
      expect(parseNativeAppearance(value)).toBe(value);
    }
  });
  it('follows device changes only in System mode', () => {
    expect(nativeIsDark('system', true)).toBe(true);
    expect(nativeIsDark('system', false)).toBe(false);
    expect(nativeIsDark('light', true)).toBe(false);
    expect(nativeIsDark('dark', false)).toBe(true);
  });
  it('uses readable, different approved Ember surfaces for both modes', () => {
    expect(NATIVE_COLORS.light.background).not.toBe(NATIVE_COLORS.dark.background);
    expect(NATIVE_COLORS.light.text).not.toBe(NATIVE_COLORS.dark.text);
    expect(NATIVE_COLORS.light.accent).not.toBe(NATIVE_COLORS.dark.accent);
  });
});
