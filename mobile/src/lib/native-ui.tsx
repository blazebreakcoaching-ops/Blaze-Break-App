import { forwardRef } from 'react';
import {
  Text as RNText, TextInput as RNTextInput,
  type TextProps, type TextInputProps,
} from 'react-native';
import { useNativeTheme } from './native-theme';

// Unstyled RN Text defaults to black even on a dark background. Provide a
// theme-aware default, while preserving explicit StyleSheet colour choices.
export const Text = forwardRef<RNText, TextProps>(function ThemeText({ style, ...props }, ref) {
  const { colors } = useNativeTheme();
  return <RNText {...props} ref={ref} style={[{ color: colors.text }, style]} />;
});

export const TextInput = forwardRef<RNTextInput, TextInputProps>(function ThemeTextInput({
  style, placeholderTextColor, selectionColor, ...props
}, ref) {
  const { colors } = useNativeTheme();
  return <RNTextInput
    {...props}
    ref={ref}
    style={[{ color: colors.text, backgroundColor: colors.input }, style]}
    placeholderTextColor={placeholderTextColor ?? colors.muted}
    selectionColor={selectionColor ?? colors.accent}
  />;
});
