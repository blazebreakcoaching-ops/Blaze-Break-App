# Blaze Break — Light / Dark / System appearance

## Web
- AppearanceMenu available on public landing page, desktop sidebar and mobile header.
- `blaze_theme_mode` localStorage stores `light`, `dark` or `system`.
- Legacy `blaze_dark_mode` is migrated; defaults to System when unset.
- While System is selected, `prefers-color-scheme: dark` changes update the UI immediately.
- Ember Warm Atelier (light) and Midnight Focus (dark) tokens remain the source of truth.

## Native
- `NativeThemeProvider` supplies a persisted mode and light/dark palette inspired by Ember colours.
- Account screen allows selecting Light, Dark or System with accessible selection states.
- `Appearance.setColorScheme` aligns native alerts and controls, and `useColorScheme` tracks live device changes in System mode.
- The navigation shell and screens must use theme colours, not fixed white backgrounds.
- `mobile/app.json` sets `userInterfaceStyle: automatic`.

## Still requires the native build environment
Expo SDK 57 requires compatible `expo-system-ui` installed and verified for Android userInterfaceStyle support. Do not hand-edit the lockfile or guess a package version. Run `cd mobile && npx expo install expo-system-ui` using the approved EAS/Expo development environment and commit its consistent package+lockfile before a native release. Verify themes on real Android and iOS devices.

No production merge/deployment authorisation is implied. 
