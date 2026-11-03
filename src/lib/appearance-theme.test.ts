import { describe, it, expect } from 'vitest';
import { readAppearanceMode, isDarkAppearance } from './appearance-theme';

describe('Light / Dark / System appearance', () => {
  it('defaults to System on a new device', () => {
    expect(readAppearanceMode(null, null)).toBe('system');
  });
  it('preserves explicit mode and migrates old boolean preference', () => {
    expect(readAppearanceMode('system', 'true')).toBe('system');
    expect(readAppearanceMode('light', 'true')).toBe('light');
    expect(readAppearanceMode(null, 'true')).toBe('dark');
    expect(readAppearanceMode(null, 'false')).toBe('light');
    expect(readAppearanceMode('invalid', null)).toBe('system');
  });
  it('responds to system changes only in System mode', () => {
    expect(isDarkAppearance('system', true)).toBe(true);
    expect(isDarkAppearance('system', false)).toBe(false);
    expect(isDarkAppearance('dark', false)).toBe(true);
    expect(isDarkAppearance('light', true)).toBe(false);
  });
});
