export type NativeAppearanceMode = 'light' | 'dark' | 'system';

export const NATIVE_APPEARANCE_KEY = 'blaze_native_appearance_v1';

export const NATIVE_COLORS = {
  light: {
    background: '#fbf8f3',
    card: '#fffdfa',
    surface: '#f3ede5',
    text: '#231e1a',
    muted: '#5f554c',
    subtle: '#74685d',
    border: '#e4d9cd',
    accent: '#ae4214',
    onAccent: '#ffffff',
    accentSoft: '#fff1e6',
    accentBorder: '#edb78f',
    danger: '#b42318',
    input: '#fffdfa',
  },
  dark: {
    background: '#100f0e',
    card: '#201b18',
    surface: '#181614',
    text: '#f8f0e5',
    muted: '#c4b7a9',
    subtle: '#b5a89b',
    border: '#41352e',
    accent: '#ffa46c',
    onAccent: '#1b100b',
    accentSoft: '#38271d',
    accentBorder: '#775038',
    danger: '#ff8b80',
    input: '#28211c',
  },
} as const;

export type NativeThemeColors = { [K in keyof typeof NATIVE_COLORS.light]: string };

export function parseNativeAppearance(value: string | null): NativeAppearanceMode {
  return value === 'light' || value === 'dark' || value === 'system' ? value : 'system';
}

export function nativeIsDark(mode: NativeAppearanceMode, systemIsDark: boolean): boolean {
  return mode === 'dark' || (mode === 'system' && systemIsDark);
}
