export type AppearanceMode = 'light' | 'dark' | 'system';
export const APPEARANCE_STORAGE_KEY = 'blaze_theme_mode';
export const LEGACY_DARK_MODE_KEY = 'blaze_dark_mode';

// Migrate the original light/dark override exactly once. Without a saved
// preference, users follow device appearance by default.
export function readAppearanceMode(saved: string | null, legacy: string | null): AppearanceMode {
  if (saved === 'light' || saved === 'dark' || saved === 'system') return saved;
  if (legacy === 'true') return 'dark';
  if (legacy === 'false') return 'light';
  return 'system';
}

export function isDarkAppearance(mode: AppearanceMode, deviceDark: boolean): boolean {
  return mode === 'dark' || (mode === 'system' && deviceDark);
}
